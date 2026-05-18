import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  readJson,
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

test("phase 8 agent run ledger records manual agent metadata without executing an external agent", () => {
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

  const recordResult = runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo });
  assertSuccess(recordResult, "agent record");

  const runDirectory = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-0001");
  const statusPath = path.join(runDirectory, "status.json");
  assert.ok(fs.existsSync(runDirectory), `expected run directory to exist: ${runDirectory}`);
  assert.ok(fs.existsSync(statusPath), `expected status.json to exist: ${statusPath}`);

  const status = readJson(statusPath);
  assert.equal(status.task_id, "task-test-task");
  assert.equal(status.run_id, "run-0001");
  assert.equal(status.role, "scout-tests");
  assert.equal(status.status, "raw");
  assert.equal(typeof status.created_at, "string");
  assert.equal(typeof status.updated_at, "string");
  assert.equal(status.profile, "");
  assert.equal(status.notes, "");
  assert.equal(status.prompt_path, path.join(".harness", "tasks", "task-test-task", "prompts", "scout-tests.md"));
  assert.equal(status.output_path, path.join(".harness", "tasks", "task-test-task", "agents", "run-0001", "sample.md"));
  assert.equal(fs.existsSync(path.join(runDirectory, "sample.md")), false, "output file must not be created by agent record");

  assert.match(recordResult.stdout, /run id: run-0001/);
  assert.match(recordResult.stdout, /status: raw/);
  assert.match(recordResult.stdout, /prompt path:/);
  assert.match(recordResult.stdout, /output path:/);

  const listResult = runCli(["agent", "list"], { cwd: tempRepo });
  assertSuccess(listResult, "agent list");
  assert.match(listResult.stdout, /run-0001/);
  assert.match(listResult.stdout, /raw/);
  assert.match(listResult.stdout, /scout-tests/);
  assert.match(listResult.stdout, /prompt_path=/);
  assert.match(listResult.stdout, /output_path=/);
});
