import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  productRoot,
  readJson,
  readText,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function createCheckReadyRepo() {
  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");

  return tempRepo;
}

function getTaskRoot(tempRepo) {
  return path.join(tempRepo, ".harness", "tasks", "task-test-task");
}

function getWorktreePath(tempRepo) {
  return readText(path.join(getTaskRoot(tempRepo), "worktree.txt")).trim();
}

function updateChecksConfig(tempRepo, { commands, protectedPaths }) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const replacement = [
    "[checks]",
    `commands = ${JSON.stringify(commands)}`,
    ...(protectedPaths ? [`protected_paths = ${JSON.stringify(protectedPaths)}`] : []),
    ""
  ].join("\n");
  const nextContent = content.replace(/\[checks\]\r?\ncommands = \[[^\n]*\]\r?\n/, replacement);
  writeText(configPath, nextContent);
}

test("phase 11 capture writes diff.patch and seeds verifier.json from the task worktree", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  const readmePath = path.join(worktreePath, "README.md");
  fs.appendFileSync(readmePath, "capture change\n", "utf8");

  const captureResult = runCli(["capture"], { cwd: tempRepo });
  assertSuccess(captureResult, "capture");
  assert.match(captureResult.stdout, /result: captured/);

  const taskRoot = getTaskRoot(tempRepo);
  const diffPath = path.join(taskRoot, "diff.patch");
  const verifierPath = path.join(taskRoot, "verifier.json");

  assert.ok(fs.existsSync(diffPath), `expected diff.patch to exist: ${diffPath}`);
  assert.ok(fs.existsSync(verifierPath), `expected verifier.json to exist: ${verifierPath}`);
  assert.match(readText(diffPath), /README\.md/);

  const verifier = readJson(verifierPath);
  assert.equal(verifier.schema_version, 1);
  assert.equal(verifier.producer_command, "node bin/ch capture");
  assert.equal(verifier.result, "captured");
  assert.equal(verifier.checked_at, "");
  assert.equal(verifier.diff_path, ".harness/tasks/task-test-task/diff.patch");
  assert.equal(verifier.log_path, ".harness/tasks/task-test-task/logs/check.log");
  assert.equal(verifier.commands.length, 0);
  assert.ok(verifier.git_status_lines.some((line) => /README\.md/.test(line)));
});

test("phase 11 check records passing deterministic commands and writes logs", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  fs.appendFileSync(path.join(worktreePath, "README.md"), "check pass\n", "utf8");
  updateChecksConfig(tempRepo, { commands: ["git status --short"] });

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertSuccess(checkResult, "check pass");
  assert.match(checkResult.stdout, /result: pass/);

  const taskRoot = getTaskRoot(tempRepo);
  const verifierPath = path.join(taskRoot, "verifier.json");
  const logPath = path.join(taskRoot, "logs", "check.log");
  const verifier = readJson(verifierPath);

  assert.equal(verifier.schema_version, 1);
  assert.equal(verifier.producer_command, "node bin/ch check");
  assert.equal(verifier.result, "pass");
  assert.equal(typeof verifier.checked_at, "string");
  assert.equal(verifier.commands.length, 1);
  assert.equal(verifier.commands[0].command, "git status --short");
  assert.equal(verifier.commands[0].exit_code, 0);
  assert.equal(verifier.commands[0].result, "pass");
  assert.ok(verifier.commands[0].duration_ms >= 0);
  assert.ok(fs.existsSync(logPath), `expected check.log to exist: ${logPath}`);
  assert.match(readText(logPath), /git status --short/);
  assert.match(readText(logPath), /exit_code: 0/);
});

test("phase 11 check fails when a configured command fails", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  updateChecksConfig(tempRepo, { commands: ["git rev-parse --verify definitely-missing-ref"] });

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertFailure(checkResult, "check failing command");
  assert.match(checkResult.stdout, /result: fail/);

  const verifier = readJson(path.join(getTaskRoot(tempRepo), "verifier.json"));
  assert.equal(verifier.result, "fail");
  assert.equal(verifier.commands.length, 1);
  assert.equal(verifier.commands[0].result, "fail");
});

test("phase 11 check fails on default protected-path changes without reverting them", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  const agentsPath = path.join(worktreePath, "AGENTS.md");
  writeText(agentsPath, "protected\n");

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertFailure(checkResult, "check protected path failure");
  assert.match(checkResult.stdout, /result: fail/);
  assert.ok(fs.existsSync(agentsPath), "protected file change must not be reverted automatically");

  const verifier = readJson(path.join(getTaskRoot(tempRepo), "verifier.json"));
  assert.equal(verifier.result, "fail");
  assert.deepEqual(verifier.protected_paths, ["AGENTS.md", ".harness/config.toml"]);
  assert.ok(verifier.protected_path_violations.includes("AGENTS.md"));
});

test("phase 11 check fails when a protected file is renamed in the task worktree", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  writeText(path.join(worktreePath, "AGENTS.md"), "tracked protected file\n");
  assertSuccess(runCommand("git", ["add", "AGENTS.md"], { cwd: worktreePath }), "git add AGENTS.md in worktree");
  assertSuccess(runCommand("git", ["commit", "-m", "track worktree agents"], { cwd: worktreePath }), "git commit track worktree agents");
  fs.mkdirSync(path.join(worktreePath, "docs"), { recursive: true });
  assertSuccess(
    runCommand("git", ["mv", "AGENTS.md", "docs/AGENTS.md"], { cwd: worktreePath }),
    "git mv AGENTS.md docs/AGENTS.md"
  );

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertFailure(checkResult, "check protected path rename failure");
  assert.match(checkResult.stdout, /result: fail/);

  const verifier = readJson(path.join(getTaskRoot(tempRepo), "verifier.json"));
  assert.equal(verifier.result, "fail");
  assert.ok(verifier.git_status_lines.some((line) => /AGENTS\.md -> docs\/AGENTS\.md|AGENTS\.md -> docs\\AGENTS\.md/.test(line)));
  assert.ok(verifier.protected_path_violations.includes("AGENTS.md"));
});

test("phase 11 check uses protected_paths override instead of the default list", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  writeText(path.join(worktreePath, "AGENTS.md"), "not protected by override\n");
  updateChecksConfig(tempRepo, { commands: [], protectedPaths: ["README.md"] });

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertSuccess(checkResult, "check protected override");
  assert.match(checkResult.stdout, /result: pass/);

  const verifier = readJson(path.join(getTaskRoot(tempRepo), "verifier.json"));
  assert.deepEqual(verifier.protected_paths, ["README.md"]);
  assert.deepEqual(verifier.protected_path_violations, []);
});

test("phase 11 check succeeds with no configured commands when there are no protected-path violations", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  updateChecksConfig(tempRepo, { commands: [] });

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertSuccess(checkResult, "check with no commands");
  assert.match(checkResult.stdout, /commands: 0/);
  assert.match(checkResult.stdout, /result: pass/);

  const taskRoot = getTaskRoot(tempRepo);
  const verifier = readJson(path.join(taskRoot, "verifier.json"));
  const logContent = readText(path.join(taskRoot, "logs", "check.log"));
  assert.equal(verifier.result, "pass");
  assert.deepEqual(verifier.commands, []);
  assert.match(logContent, /No check commands were configured\./);
});

test("phase 11 check rejects empty configured commands before execution", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo();
  updateChecksConfig(tempRepo, { commands: ["   "] });

  const checkResult = runCli(["check"], { cwd: tempRepo });
  assertFailure(checkResult, "check empty command rejection");
  assert.match(checkResult.stderr, /must not be empty or whitespace-only/);
  assert.equal(fs.existsSync(path.join(getTaskRoot(tempRepo), "verifier.json")), false);
});

test("phase 11 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
