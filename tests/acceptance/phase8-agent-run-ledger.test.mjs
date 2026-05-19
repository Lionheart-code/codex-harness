import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
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

function toPortablePath(targetPath) {
  return targetPath.replace(/\\/g, "/");
}

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function createLedgerReadyRepo() {
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

  return tempRepo;
}

test("phase 8 agent run ledger records manual agent metadata without executing an external agent", () => {
  ensureBuiltCli();

  const tempRepo = createLedgerReadyRepo();

  const recordResult = runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo });
  assertSuccess(recordResult, "agent record");

  const runDirectory = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-0001");
  const statusPath = path.join(runDirectory, "status.json");
  assert.ok(fs.existsSync(runDirectory), `expected run directory to exist: ${runDirectory}`);
  assert.ok(fs.existsSync(statusPath), `expected status.json to exist: ${statusPath}`);

  const status = readJson(statusPath);
  assert.equal(status.schema_version, 1);
  assert.equal(status.producer_command, "node bin/ch agent record");
  assert.equal(status.task_id, "task-test-task");
  assert.equal(status.run_id, "run-0001");
  assert.equal(status.role, "scout-tests");
  assert.equal(status.status, "raw");
  assert.equal(typeof status.created_at, "string");
  assert.equal(typeof status.updated_at, "string");
  assert.equal(status.profile, "");
  assert.equal(status.notes, "");
  assert.equal(status.prompt_path, ".harness/tasks/task-test-task/prompts/scout-tests.md");
  assert.equal(status.output_path, ".harness/tasks/task-test-task/agents/run-0001/sample.md");
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

test("phase 8 agent list shows an empty state and agent record validates required flags", () => {
  ensureBuiltCli();

  const tempRepo = createLedgerReadyRepo();

  const emptyList = runCli(["agent", "list"], { cwd: tempRepo });
  assertSuccess(emptyList, "agent list empty state");
  assert.match(emptyList.stdout, /No agent runs found\./);

  const missingRole = runCli(["agent", "record", "--output", "sample.md"], { cwd: tempRepo });
  assertFailure(missingRole, "agent record missing role");
  assert.match(missingRole.stderr, /The `--role` flag is required\./);

  const missingOutput = runCli(["agent", "record", "--role", "scout-tests"], { cwd: tempRepo });
  assertFailure(missingOutput, "agent record missing output");
  assert.match(missingOutput.stderr, /The `--output` flag is required\./);

  const unknownFlag = runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md", "--bad"], {
    cwd: tempRepo
  });
  assertFailure(unknownFlag, "agent record unknown flag");
  assert.match(unknownFlag.stderr, /The `--bad` flag requires a value\.|Unknown agent record flag\(s\): --bad/);

  const agentsDir = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents");
  assert.equal(fs.existsSync(agentsDir), false, "invalid agent record commands must not create agent run artifacts");
});

test("phase 8 agent run ledger appends a second run and records explicit prompt/profile/notes", () => {
  ensureBuiltCli();

  const tempRepo = createLedgerReadyRepo();

  const firstRecord = runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo });
  assertSuccess(firstRecord, "first agent record");

  const secondRecord = runCli(
    [
      "agent",
      "record",
      "--role",
      "architect",
      "--output",
      "architect-output.md",
      "--prompt",
      ".harness/tasks/task-test-task/prompt-plan.md",
      "--profile",
      "codex",
      "--notes",
      "manual run"
    ],
    { cwd: tempRepo }
  );
  assertSuccess(secondRecord, "second agent record");

  const firstStatusPath = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-0001", "status.json");
  const secondStatusPath = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-0002", "status.json");
  assert.ok(fs.existsSync(firstStatusPath), `expected first status.json to exist: ${firstStatusPath}`);
  assert.ok(fs.existsSync(secondStatusPath), `expected second status.json to exist: ${secondStatusPath}`);

  const secondStatus = readJson(secondStatusPath);
  assert.equal(secondStatus.schema_version, 1);
  assert.equal(secondStatus.producer_command, "node bin/ch agent record");
  assert.equal(secondStatus.run_id, "run-0002");
  assert.equal(secondStatus.role, "architect");
  assert.equal(secondStatus.profile, "codex");
  assert.equal(secondStatus.notes, "manual run");
  assert.equal(secondStatus.prompt_path, ".harness/tasks/task-test-task/prompt-plan.md");
  assert.equal(secondStatus.output_path, ".harness/tasks/task-test-task/agents/run-0002/architect-output.md");
  assert.equal(secondStatus.status, "raw");

  const listResult = runCli(["agent", "list"], { cwd: tempRepo });
  assertSuccess(listResult, "agent list with two runs");
  assert.match(listResult.stdout, /run-0001/);
  assert.match(listResult.stdout, /run-0002/);
  assert.match(listResult.stdout, /profile=codex/);
});

test("phase 8 agent record rejects off-boundary prompt and output paths", () => {
  ensureBuiltCli();

  const tempRepo = createLedgerReadyRepo();

  const badOutput = runCli(["agent", "record", "--role", "scout-tests", "--output", "../escape.md"], { cwd: tempRepo });
  assertFailure(badOutput, "agent record off-boundary output");
  assert.match(badOutput.stderr, /Output path must stay inside the agent run directory\./);

  const badPrompt = runCli(
    ["agent", "record", "--role", "architect", "--output", "ok.md", "--prompt", "../outside.md"],
    { cwd: tempRepo }
  );
  assertFailure(badPrompt, "agent record off-boundary prompt");
  assert.match(badPrompt.stderr, /Prompt path must stay inside the target repository\./);
});

test("phase 8 agent list skips malformed run records and reports a warning", () => {
  ensureBuiltCli();

  const tempRepo = createLedgerReadyRepo();

  assertSuccess(runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo }), "agent record");

  const badRunDir = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-9999");
  fs.mkdirSync(badRunDir, { recursive: true });
  fs.writeFileSync(path.join(badRunDir, "status.json"), "{ not-valid-json }\n", "utf8");

  const listResult = runCli(["agent", "list"], { cwd: tempRepo });
  assertSuccess(listResult, "agent list with malformed record");
  assert.match(listResult.stdout, /run-0001/);
  assert.match(listResult.stdout, /warnings:/);
  assert.match(listResult.stdout, /Skipped malformed agent run:/);
  assert.match(listResult.stdout, new RegExp(toPortablePath(".harness/tasks/task-test-task/agents/run-9999/status.json")));
});
