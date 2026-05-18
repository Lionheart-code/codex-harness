import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
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

function createHooksReadyRepo() {
  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");
  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");
  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");

  return tempRepo;
}

function createHookRuntimeRepo() {
  const tempRepo = createHooksReadyRepo();
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");
  assertSuccess(runCli(["hooks", "install"], { cwd: tempRepo }), "hooks install");
  return tempRepo;
}

function getInstalledHookPath(tempRepo, hookFile) {
  return path.join(tempRepo, ".codex", "hooks", hookFile);
}

test("phase 13 hooks help succeeds and prints install usage", () => {
  ensureBuiltCli();

  const result = runCli(["hooks", "--help"], { cwd: productRoot });
  assertSuccess(result, "hooks help");
  assert.match(result.stdout, /node bin\/ch hooks install/);
});

test("phase 13 hooks CLI rejects unsupported arguments and missing installed layer", () => {
  ensureBuiltCli();

  const helpFallback = runCli(["hooks", "unknown"], { cwd: productRoot });
  assertFailure(helpFallback, "hooks unknown subcommand");
  assert.match(helpFallback.stderr, /Unknown hooks subcommand: unknown/);

  const extraArgs = runCli(["hooks", "install", "extra"], { cwd: productRoot });
  assertFailure(extraArgs, "hooks install extra args");
  assert.match(extraArgs.stderr, /Unknown hooks argument\(s\): extra/);

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);
  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);

  const missingLayer = runCli(["hooks", "install"], { cwd: tempRepo });
  assertFailure(missingLayer, "hooks install without installed layer");
  assert.match(missingLayer.stderr, /Installed harness layer not found/);
});

test("phase 13 hooks install creates sidecar hooks and is idempotent", () => {
  ensureBuiltCli();

  const tempRepo = createHooksReadyRepo();
  const firstInstall = runCli(["hooks", "install"], { cwd: tempRepo });
  assertSuccess(firstInstall, "hooks install");
  assert.match(firstInstall.stdout, /status: hook install completed/);

  const codexDir = path.join(tempRepo, ".codex");
  const hooksDir = path.join(codexDir, "hooks");
  const templatesDir = path.join(tempRepo, ".harness", "templates", "hooks");
  const hooksConfigPath = path.join(codexDir, "hooks.json");
  const userPromptPath = path.join(hooksDir, "user-prompt-submit.cjs");
  const preToolPath = path.join(hooksDir, "pre-tool-use.cjs");
  const stopPath = path.join(hooksDir, "stop.cjs");

  assert.ok(fs.existsSync(hooksConfigPath), ".codex/hooks.json was not created");
  assert.ok(fs.existsSync(userPromptPath), "user prompt hook was not created");
  assert.ok(fs.existsSync(preToolPath), "pre-tool-use hook was not created");
  assert.ok(fs.existsSync(stopPath), "stop hook was not created");
  assert.ok(fs.existsSync(templatesDir), ".harness/templates/hooks was not created");

  const hooksConfig = readJson(hooksConfigPath);
  assert.equal(Array.isArray(hooksConfig.hooks), true);
  assert.equal(hooksConfig.hooks.length, 3);
  assert.equal(hooksConfig.hooks[0].event, "UserPromptSubmit");
  assert.equal(hooksConfig.hooks[1].event, "PreToolUse");
  assert.equal(hooksConfig.hooks[2].event, "Stop");

  const userPromptContent = readText(userPromptPath);
  const preToolContent = readText(preToolPath);
  const stopContent = readText(stopPath);

  assert.match(userPromptContent, /active task context is required before coding work/i);
  assert.match(preToolContent, /dangerous shell\/git command/i);
  assert.match(preToolContent, /where detectable/i);
  assert.match(stopContent, /node bin\/ch check and node bin\/ch report/i);

  const secondInstall = runCli(["hooks", "install"], { cwd: tempRepo });
  assertSuccess(secondInstall, "hooks install second run");
  assert.match(secondInstall.stdout, /status: already up to date/);
});

test("phase 13 generated hooks enforce the documented runtime behavior", () => {
  ensureBuiltCli();

  const missingTaskRepo = createHooksReadyRepo();
  assertSuccess(runCli(["hooks", "install"], { cwd: missingTaskRepo }), "hooks install without task");

  const userPromptFail = runCommand(
    process.execPath,
    [getInstalledHookPath(missingTaskRepo, "user-prompt-submit.cjs")],
    { cwd: missingTaskRepo }
  );
  assertFailure(userPromptFail, "user prompt hook missing task context");
  assert.match(userPromptFail.stderr, /active task context is required before coding work/i);

  const tempRepo = createHookRuntimeRepo();
  const userPromptPath = getInstalledHookPath(tempRepo, "user-prompt-submit.cjs");
  const preToolPath = getInstalledHookPath(tempRepo, "pre-tool-use.cjs");
  const stopPath = getInstalledHookPath(tempRepo, "stop.cjs");

  const userPromptPass = runCommand(process.execPath, [userPromptPath], { cwd: tempRepo });
  assertSuccess(userPromptPass, "user prompt hook active task context");
  assert.match(userPromptPass.stdout, /task context active for task-test-task/);

  const dangerousPayload = JSON.stringify({ command: "git reset --hard HEAD" });
  const dangerousResult = runCommand(process.execPath, [preToolPath], {
    cwd: tempRepo,
    input: dangerousPayload
  });
  assertFailure(dangerousResult, "pre-tool hook dangerous command");
  assert.match(dangerousResult.stderr, /blocked dangerous shell\/git command/i);

  const offBoundaryPayload = JSON.stringify({ file_path: "../outside.md" });
  const offBoundaryResult = runCommand(process.execPath, [preToolPath], {
    cwd: tempRepo,
    input: offBoundaryPayload
  });
  assertFailure(offBoundaryResult, "pre-tool hook off-boundary path");
  assert.match(offBoundaryResult.stderr, /blocked edit\/write outside the current task worktree where detectable/i);

  const safePayload = JSON.stringify({ tool: "read", note: "no path here" });
  const safeResult = runCommand(process.execPath, [preToolPath], {
    cwd: tempRepo,
    input: safePayload
  });
  assertSuccess(safeResult, "pre-tool hook safe payload");
  assert.match(safeResult.stdout, /pre-tool guard passed/i);

  const stopResult = runCommand(process.execPath, [stopPath], { cwd: tempRepo });
  assertSuccess(stopResult, "stop hook reminder");
  assert.match(stopResult.stdout, /node bin\/ch check and node bin\/ch report/i);
});

test("phase 13 hooks install fails closed on conflicting managed files", () => {
  ensureBuiltCli();

  const tempRepo = createHooksReadyRepo();
  fs.mkdirSync(path.join(tempRepo, ".codex"), { recursive: true });
  writeText(path.join(tempRepo, ".codex", "hooks.json"), "{\"broken\":true}\n");

  const result = runCli(["hooks", "install"], { cwd: tempRepo });
  assertFailure(result, "hooks install conflicting file");
  assert.match(result.stdout, /\.codex[\\/]hooks\.json differs from the Phase 13 managed content/);
  assert.equal(readText(path.join(tempRepo, ".codex", "hooks.json")), "{\"broken\":true}\n");
});

test("phase 13 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();

  for (const relativePath of [".harness", ".codex", ".agents", "schemas", "migrations"]) {
    assert.equal(
      fs.existsSync(path.join(productRoot, relativePath)),
      false,
      `forbidden generated path exists in product repo: ${relativePath}`
    );
  }
});
