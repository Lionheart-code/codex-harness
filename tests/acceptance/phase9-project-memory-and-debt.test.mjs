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

function createMemoryReadyRepo() {
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

test("phase 9 memory, debt, and decisions commands manage target-repo project memory only", () => {
  ensureBuiltCli();

  const tempRepo = createMemoryReadyRepo();
  const memoryRoot = path.join(tempRepo, ".harness", "memory");
  const debtJsonlPath = path.join(memoryRoot, "debt", "debt.jsonl");
  const debtMarkdownPath = path.join(memoryRoot, "debt", "debt.md");
  const projectIndexPath = path.join(memoryRoot, "project-index.md");
  const decisionPath = path.join(memoryRoot, "decisions", "DECISION-0001.json");

  const agentRecord = runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo });
  assertSuccess(agentRecord, "agent record before memory commands");

  const sampleOutputPath = path.join(
    tempRepo,
    ".harness",
    "tasks",
    "task-test-task",
    "agents",
    "run-0001",
    "sample.md"
  );
  writeText(sampleOutputPath, "raw output\n");

  const addDebt = runCli(
    ["debt", "add", "--title", "test debt", "--type", "technical", "--severity", "low", "--reason", "test"],
    { cwd: tempRepo }
  );
  assertSuccess(addDebt, "debt add");
  assert.match(addDebt.stdout, /debt id: DEBT-0001/);
  assert.match(addDebt.stdout, /status: open/);

  const debtItems = readText(debtJsonlPath)
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(debtItems.length, 1);
  assert.equal(debtItems[0].schema_version, 1);
  assert.equal(debtItems[0].producer_command, "node bin/ch debt add");
  assert.equal(typeof debtItems[0].created_at, "string");
  assert.equal(typeof debtItems[0].updated_at, "string");
  assert.equal(debtItems[0].debt_id, "DEBT-0001");
  assert.equal(debtItems[0].status, "open");
  assert.equal(debtItems[0].created_by_task, "task-test-task");
  assert.equal(debtItems[0].created_by_agent_run, "");
  assert.deepEqual(debtItems[0].location, []);

  const debtList = runCli(["debt", "list"], { cwd: tempRepo });
  assertSuccess(debtList, "debt list");
  assert.match(debtList.stdout, /DEBT-0001 \| open \| low \| technical \| test debt/);

  const addDecision = runCli(["decisions", "add", "--title", "test decision", "--reason", "test"], { cwd: tempRepo });
  assertSuccess(addDecision, "decisions add");
  assert.match(addDecision.stdout, /decision id: DECISION-0001/);
  assert.ok(fs.existsSync(decisionPath), `expected decision record to exist: ${decisionPath}`);

  const decisionRecord = readJson(decisionPath);
  assert.equal(decisionRecord.schema_version, 1);
  assert.equal(decisionRecord.producer_command, "node bin/ch decisions add");
  assert.equal(typeof decisionRecord.updated_at, "string");
  assert.equal(decisionRecord.decision_id, "DECISION-0001");
  assert.equal(decisionRecord.status, "active");
  assert.equal(decisionRecord.decision, "test decision");
  assert.deepEqual(decisionRecord.related_task_ids, ["task-test-task"]);

  const decisionsList = runCli(["decisions", "list"], { cwd: tempRepo });
  assertSuccess(decisionsList, "decisions list");
  assert.match(decisionsList.stdout, /DECISION-0001 \| active \| test decision \|/);

  const memoryStatus = runCli(["memory", "status"], { cwd: tempRepo });
  assertSuccess(memoryStatus, "memory status");
  assert.match(memoryStatus.stdout, /debt: open=1 \| in_progress=0 \| resolved=0 \| accepted=0 \| obsolete=0/);
  assert.match(memoryStatus.stdout, /decisions: active=1 \| superseded=0 \| rejected=0/);
  assert.match(memoryStatus.stdout, /agent outputs: raw=1 \| accepted=0 \| stale=0 \| rejected=0/);

  const resolveDebtResult = runCli(["debt", "resolve", "--id", "DEBT-0001"], { cwd: tempRepo });
  assertSuccess(resolveDebtResult, "debt resolve");
  assert.match(resolveDebtResult.stdout, /status: resolved/);

  const resolvedDebtItems = readText(debtJsonlPath)
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(resolvedDebtItems[0].status, "resolved");
  assert.equal(resolvedDebtItems[0].producer_command, "node bin/ch debt resolve");

  const resolvedDebtList = runCli(["debt", "list"], { cwd: tempRepo });
  assertSuccess(resolvedDebtList, "debt list after resolve");
  assert.match(resolvedDebtList.stdout, /DEBT-0001 \| resolved \| low \| technical \| test debt/);

  assert.ok(fs.existsSync(memoryRoot), `expected memory root to exist: ${memoryRoot}`);
  assert.ok(fs.existsSync(debtJsonlPath), `expected debt.jsonl to exist: ${debtJsonlPath}`);
  assert.ok(fs.existsSync(debtMarkdownPath), `expected debt.md to exist: ${debtMarkdownPath}`);
  assert.ok(fs.existsSync(projectIndexPath), `expected project-index.md to exist: ${projectIndexPath}`);
  assert.match(readText(debtMarkdownPath), /# Debt Ledger/);
  assert.match(readText(projectIndexPath), /# Project Index/);
  assert.equal(fs.existsSync(sampleOutputPath), true, "phase 9 memory commands must not delete existing agent outputs");
});

test("phase 9 read-only memory commands warn on malformed debt records and mutating commands fail closed", () => {
  ensureBuiltCli();

  const tempRepo = createMemoryReadyRepo();
  const debtJsonlPath = path.join(tempRepo, ".harness", "memory", "debt", "debt.jsonl");
  writeText(debtJsonlPath, "{ not valid json }\n");

  const listResult = runCli(["debt", "list"], { cwd: tempRepo });
  assertSuccess(listResult, "debt list malformed");
  assert.match(listResult.stdout, /warnings:/);
  assert.match(listResult.stdout, /Skipped malformed debt item:/);

  const addResult = runCli(
    ["debt", "add", "--title", "test debt", "--type", "technical", "--severity", "low", "--reason", "test"],
    { cwd: tempRepo }
  );
  assertFailure(addResult, "debt add malformed");
  assert.match(addResult.stderr, /Skipped malformed debt item:/);

  const resolveResult = runCli(["debt", "resolve", "--id", "DEBT-0001"], { cwd: tempRepo });
  assertFailure(resolveResult, "debt resolve malformed");
  assert.match(resolveResult.stderr, /Skipped malformed debt item:/);
});

test("phase 9 decisions list warns on malformed records and decisions add fails closed", () => {
  ensureBuiltCli();

  const tempRepo = createMemoryReadyRepo();
  const badDecisionPath = path.join(tempRepo, ".harness", "memory", "decisions", "DECISION-9999.json");
  writeText(badDecisionPath, "{ not valid json }\n");

  const listResult = runCli(["decisions", "list"], { cwd: tempRepo });
  assertSuccess(listResult, "decisions list malformed");
  assert.match(listResult.stdout, /warnings:/);
  assert.match(listResult.stdout, /Skipped malformed decision record:/);

  const addResult = runCli(["decisions", "add", "--title", "test decision", "--reason", "test"], { cwd: tempRepo });
  assertFailure(addResult, "decisions add malformed");
  assert.match(addResult.stderr, /Skipped malformed decision record:/);
});

test("phase 9 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
