import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
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

test("phase 3 init creates task-state files and status lists the task", () => {
  ensureBuiltCli();

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  const gitInit = runCommand("git", ["init"], { cwd: tempRepo });
  assertSuccess(gitInit, `git init in ${tempRepo}`);

  const installResult = runCli(["install"], { cwd: tempRepo });
  assertSuccess(installResult, "install before init");

  const beforeDryRunStatus = getGitStatus(tempRepo);
  const dryRunResult = runCli(["init", "preview task", "--dry-run"], { cwd: tempRepo });
  const afterDryRunStatus = getGitStatus(tempRepo);
  assertSuccess(dryRunResult, "node bin/ch init \"preview task\" --dry-run");
  assert.equal(afterDryRunStatus, beforeDryRunStatus, "init --dry-run changed temp repo git status");
  assert.match(dryRunResult.stdout, /codex-harness init \(dry-run\)/);
  assert.match(dryRunResult.stdout, /task id: task-preview-task/);

  const typedDryRun = runCli(["init", "typed preview", "--type", "bugfix", "--dry-run"], { cwd: tempRepo });
  assertSuccess(typedDryRun, "node bin/ch init \"typed preview\" --type bugfix --dry-run");
  assert.match(typedDryRun.stdout, /task type: bugfix/);

  const initResult = runCli(["init", "test task", "--type", "bugfix"], { cwd: tempRepo });
  assertSuccess(initResult, "node bin/ch init \"test task\"");

  const taskRoot = path.join(tempRepo, ".harness", "tasks", "task-test-task");
  const specPath = path.join(taskRoot, "spec.md");
  const acceptancePath = path.join(taskRoot, "acceptance.md");
  const statePath = path.join(taskRoot, "state.json");

  assert.match(initResult.stdout, /codex-harness init/);
  assert.match(initResult.stdout, /task id: task-test-task/);

  const state = readJson(statePath);
  assert.deepEqual(Object.keys(state).sort(), [
    "acceptance",
    "created_at",
    "phase",
    "spec",
    "status",
    "task_id",
    "task_type",
    "title",
    "updated_at"
  ]);
  assert.equal(state.task_id, "task-test-task");
  assert.equal(state.title, "test task");
  assert.equal(state.status, "created");
  assert.equal(state.phase, "3");
  assert.equal(state.spec, "spec.md");
  assert.equal(state.acceptance, "acceptance.md");
  assert.equal(state.task_type, "bugfix");
  assert.equal(typeof state.created_at, "string");
  assert.equal(typeof state.updated_at, "string");
  assert.equal(state.created_at, state.updated_at);

  const specContent = readText(specPath);
  assert.match(specContent, /^# test task/m);
  assert.match(specContent, /Task ID: `task-test-task`/);
  assert.match(specContent, /Created: `/);
  assert.match(specContent, /## Task Details/);

  const acceptanceContent = readText(acceptancePath);
  assert.match(acceptanceContent, /^# Acceptance/m);
  assert.match(acceptanceContent, /- \[ \] Define acceptance criteria\./);
  assert.doesNotMatch(acceptanceContent, /\[x\]/i);
  assert.doesNotMatch(acceptanceContent, /\bpass(ed)?\b/i);

  const statusResult = runCli(["status"], { cwd: tempRepo });
  assertSuccess(statusResult, "node bin/ch status");
  assert.match(statusResult.stdout, /codex-harness status/);
  assert.match(statusResult.stdout, /task-test-task \| created \| test task \|/);
  assert.match(statusResult.stdout, /task_type=bugfix/);

  const duplicateInit = runCli(["init", "test task"], { cwd: tempRepo });
  assertFailure(duplicateInit, "duplicate init");
  assert.match(duplicateInit.stderr, /Task already exists: \.harness[\\/]+tasks[\\/]+task-test-task/);

  const stateAfterDuplicate = readJson(statePath);
  assert.deepEqual(stateAfterDuplicate, state);
});

test("phase 3 status skips malformed task state entries and reports a warning", () => {
  ensureBuiltCli();

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install before malformed status test");
  assertSuccess(runCli(["init", "good task"], { cwd: tempRepo }), "init good task");

  const badTaskRoot = path.join(tempRepo, ".harness", "tasks", "task-bad-task");
  fs.mkdirSync(badTaskRoot, { recursive: true });
  writeText(path.join(badTaskRoot, "state.json"), "{ not-valid-json }\n");

  const statusResult = runCli(["status"], { cwd: tempRepo });
  assertSuccess(statusResult, "node bin/ch status with malformed state");
  assert.match(statusResult.stdout, /task-good-task \| created \| good task \|/);
  assert.match(statusResult.stdout, /warnings:/);
  assert.match(statusResult.stdout, /Skipped malformed task state:/);
});
