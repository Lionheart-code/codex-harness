import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
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

test("phase 7 scout prompts are generated as manual read-only prompts with output path instructions", () => {
  ensureBuiltCli();

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

  const scoutResult = runCli(["prompt", "scout", "--role", "tests"], { cwd: tempRepo });
  assertSuccess(scoutResult, "prompt scout --role tests");

  const taskRoot = path.join(tempRepo, ".harness", "tasks", "task-test-task");
  const promptsRoot = path.join(taskRoot, "prompts");
  const scoutsRoot = path.join(taskRoot, "scouts");
  const scoutPromptPath = path.join(promptsRoot, "scout-tests.md");
  const scoutFindingsPath = path.join(scoutsRoot, "tests.md");

  assert.ok(fs.existsSync(promptsRoot), `expected prompts directory to exist: ${promptsRoot}`);
  assert.ok(fs.existsSync(scoutsRoot), `expected scouts directory to exist: ${scoutsRoot}`);
  assert.ok(fs.existsSync(scoutPromptPath), `expected scout prompt file to exist: ${scoutPromptPath}`);
  assert.equal(fs.existsSync(scoutFindingsPath), false, "scout findings file must not be created by prompt generation");
  assert.ok(fs.statSync(scoutPromptPath).size < 8 * 1024, `expected concise scout prompt file: ${scoutPromptPath}`);

  const content = readText(scoutPromptPath);
  assert.match(content, /spec\.md/);
  assert.match(content, /acceptance\.md/);
  assert.match(content, /state\.json/);
  assert.match(content, /branch\.txt/);
  assert.match(content, /worktree\.txt/);
  assert.match(content, /AGENTS\.md/);
  assert.match(content, /scouts\/tests\.md/);
  assert.doesNotMatch(content, /scouts\\tests\.md/);
  assert.match(content, /permission mode: `read_only`/);
  assert.match(content, /Inspect only\./);
  assert.match(content, /Do not edit files\./);
  assert.match(content, /Do not run write commands\./);
  assert.match(content, /Do not create branches or worktrees\./);
  assert.match(content, /Write findings only to/);
  assert.match(content, /raw and untrusted until reviewed/);
  assert.match(content, /Report uncertainty and assumptions\./);
  assert.match(content, /manual use in Codex, Gemini CLI, or another trusted agent/i);
  assert.match(content, /does not execute any external agent automatically/i);
  assert.doesNotMatch(content, /the harness will run the agent/i);
  assert.doesNotMatch(content, /TODO: describe the task details\./);
  assert.doesNotMatch(content, /Define acceptance criteria\./);

  const secondScoutResult = runCli(["prompt", "scout", "--role", "tests"], { cwd: tempRepo });
  assertSuccess(secondScoutResult, "prompt scout --role tests second run");
  assert.match(secondScoutResult.stdout, /prompt status: unchanged/);
});

test("phase 7 scout prompt rejects unsupported scout roles", () => {
  ensureBuiltCli();

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

  const scoutResult = runCli(["prompt", "scout", "--role", "invalid-role"], { cwd: tempRepo });
  assertFailure(scoutResult, "prompt scout --role invalid-role");
  assert.match(scoutResult.stderr, /Unsupported scout role: invalid-role/);
});
