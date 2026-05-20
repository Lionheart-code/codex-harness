import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertProductRepoBoundaryState,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
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

function createCheckReadyRepo(prefix = "codex-harness-phase21-") {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# phase 21 test\n");
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

function replaceChecksSection(content, lines) {
  const replacement = `${lines.join("\n")}\n`;
  const nextContent = content.replace(/\[checks\]\r?\n[\s\S]*?(?=\[worktree\]\r?\n)/, replacement);

  if (nextContent === content) {
    throw new Error("Unable to locate the [checks] section in .harness/config.toml.");
  }

  return nextContent;
}

function updateLegacyChecksConfig(tempRepo, commands) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const lines = ["[checks]", `commands = ${JSON.stringify(commands)}`, ""];
  writeText(configPath, replaceChecksSection(content, lines));
}

function updateStructuredChecksConfig(tempRepo, commands) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const lines = ["[checks]", ""];

  for (const command of commands) {
    lines.push("[[checks.commands]]");
    lines.push(`command = ${JSON.stringify(command.command)}`);
    lines.push(`args = ${JSON.stringify(command.args)}`);
    lines.push(`timeout_seconds = ${String(command.timeoutSeconds)}`);
    if (command.shell !== undefined) {
      lines.push(`shell = ${command.shell ? "true" : "false"}`);
    }
    lines.push("");
  }

  writeText(configPath, replaceChecksSection(content, lines));
}

function updateMixedChecksConfig(tempRepo) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const lines = [
    "[checks]",
    'commands = ["git status --short"]',
    "",
    "[[checks.commands]]",
    'command = "git"',
    'args = ["status", "--short"]',
    "timeout_seconds = 120",
    ""
  ];
  writeText(configPath, replaceChecksSection(content, lines));
}

test("phase 21 doctor platform reports runtime facts without mutating product-repo git state", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const result = runCli(["doctor", "platform"], { cwd: productRoot });
  const afterStatus = getGitStatus(productRoot);

  assertSuccess(result, "doctor platform");
  assert.equal(afterStatus, beforeStatus, "doctor platform changed product-repo git status");
  assert.match(result.stdout, /codex-harness doctor platform/);
  assert.match(result.stdout, new RegExp(`platform: ${process.platform}`));
  assert.match(result.stdout, new RegExp(`arch: ${process.arch}`));
  assert.match(result.stdout, /node: v/);
});

test("phase 21 doctor commands reports command-runner and acceptance-runner policy without mutating product-repo git state", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const result = runCli(["doctor", "commands"], { cwd: productRoot });
  const afterStatus = getGitStatus(productRoot);

  assertSuccess(result, "doctor commands");
  assert.equal(afterStatus, beforeStatus, "doctor commands changed product-repo git status");
  assert.match(result.stdout, /legacy \[checks\]\.commands \+ structured \[\[checks\.commands\]\]/);
  assert.match(result.stdout, /structured shell default: false/);
  assert.match(result.stdout, /legacy shell syntax: blocked fail-closed/);
  assert.match(result.stdout, /scripts\/run-acceptance\.mjs/);
});

test("phase 21 legacy check commands still run when they are plain argv-style commands", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo("codex-harness-phase21-legacy-");
  fs.appendFileSync(path.join(getWorktreePath(tempRepo), "README.md"), "legacy check\n", "utf8");
  updateLegacyChecksConfig(tempRepo, ["git status --short"]);

  const result = runCli(["check"], { cwd: tempRepo });
  assertSuccess(result, "legacy check command");

  const verifier = readJson(path.join(getTaskRoot(tempRepo), "verifier.json"));
  assert.equal(verifier.result, "pass");
  assert.equal(verifier.commands[0].command, "git status --short");
});

test("phase 21 legacy shell syntax fails closed before execution", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo("codex-harness-phase21-legacy-shell-");
  updateLegacyChecksConfig(tempRepo, ["git status --short && git diff --stat"]);

  const result = runCli(["check"], { cwd: tempRepo });
  assertFailure(result, "legacy shell syntax fail-closed");
  assert.match(result.stderr, /must not use shell syntax/);
  assert.equal(fs.existsSync(path.join(getTaskRoot(tempRepo), "verifier.json")), false);
});

test("phase 21 structured checks default to shell false", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo("codex-harness-phase21-structured-default-");
  fs.appendFileSync(path.join(getWorktreePath(tempRepo), "README.md"), "structured default\n", "utf8");
  updateStructuredChecksConfig(tempRepo, [
    {
      command: "git",
      args: ["status", "--short"],
      timeoutSeconds: 120
    }
  ]);

  const result = runCli(["check"], { cwd: tempRepo });
  assertSuccess(result, "structured default shell false");

  const logContent = readText(path.join(getTaskRoot(tempRepo), "logs", "check.log"));
  assert.match(logContent, /shell: false/);
});

test("phase 21 structured checks accept explicit shell true", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo("codex-harness-phase21-structured-shell-");
  fs.appendFileSync(path.join(getWorktreePath(tempRepo), "README.md"), "structured shell\n", "utf8");
  updateStructuredChecksConfig(tempRepo, [
    {
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      timeoutSeconds: 120,
      shell: true
    }
  ]);

  const result = runCli(["check"], { cwd: tempRepo });
  assertSuccess(result, "structured shell true");

  const logContent = readText(path.join(getTaskRoot(tempRepo), "logs", "check.log"));
  assert.match(logContent, /shell: true/);
});

test("phase 21 mixed legacy and structured check config fails closed", () => {
  ensureBuiltCli();

  const tempRepo = createCheckReadyRepo("codex-harness-phase21-mixed-");
  updateMixedChecksConfig(tempRepo);

  const result = runCli(["check"], { cwd: tempRepo });
  assertFailure(result, "mixed legacy and structured checks");
  assert.match(result.stderr, /not both in the same config/);
});

test("phase 21 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
