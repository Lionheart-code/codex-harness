import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  productRoot,
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

function createReportReadyRepo() {
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

function getResultPath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "result.md");
}

function updateChecksConfig(tempRepo, commands) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const replacement = [
    "[checks]",
    `commands = ${JSON.stringify(commands)}`,
    ""
  ].join("\n");
  const nextContent = content.replace(/\[checks\]\r?\ncommands = \[[^\n]*\]\r?\n/, replacement);
  writeText(configPath, nextContent);
}

test("phase 12 report help succeeds and prints usage", () => {
  ensureBuiltCli();

  const result = runCli(["report", "--help"], { cwd: productRoot });
  assertSuccess(result, "report help");
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /node bin\/ch report/);
});

test("phase 12 report writes a deterministic handoff report from captured task artifacts", () => {
  ensureBuiltCli();

  const tempRepo = createReportReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  fs.appendFileSync(path.join(worktreePath, "README.md"), "report change\n", "utf8");
  updateChecksConfig(tempRepo, ["git status --short"]);

  assertSuccess(runCli(["capture"], { cwd: tempRepo }), "capture");
  assertSuccess(runCli(["check"], { cwd: tempRepo }), "check");
  assertSuccess(runCli(["agent", "record", "--role", "scout-tests", "--output", "findings.md"], { cwd: tempRepo }), "agent record");
  assertSuccess(
    runCli(["debt", "add", "--title", "test debt", "--type", "technical", "--severity", "low", "--reason", "test"], { cwd: tempRepo }),
    "debt add"
  );
  assertSuccess(runCli(["decisions", "add", "--title", "test decision", "--reason", "test"], { cwd: tempRepo }), "decisions add");

  const reportResult = runCli(["report"], { cwd: tempRepo });
  assertSuccess(reportResult, "report");
  assert.match(reportResult.stdout, /status: report written/);

  const resultPath = getResultPath(tempRepo);
  assert.ok(fs.existsSync(resultPath), `expected result.md to exist: ${resultPath}`);

  const reportContent = readText(resultPath);
  assert.match(reportContent, /# Task Report — test task/);
  assert.match(reportContent, /\.harness\/tasks\/task-test-task\/diff\.patch/);
  assert.match(reportContent, /\.harness\/tasks\/task-test-task\/verifier\.json/);
  assert.match(reportContent, /README\.md/);
  assert.match(reportContent, /git status --short/);
  assert.match(reportContent, /run-0001 \| raw \| scout-tests \|/);
  assert.match(reportContent, /DECISION-0001 \| active \| test decision/);
  assert.match(reportContent, /DEBT-0001 \| open \| low \| test debt/);
  assert.match(reportContent, /Agent output not accepted: run-0001 \| raw \| scout-tests/);
  assert.match(reportContent, /## Merge recommendation/);
  assert.match(reportContent, /READY FOR HUMAN REVIEW/);
});

test("phase 12 report does not claim pass without a verifier result", () => {
  ensureBuiltCli();

  const tempRepo = createReportReadyRepo();
  const reportResult = runCli(["report"], { cwd: tempRepo });
  assertSuccess(reportResult, "report without verifier");

  const reportContent = readText(getResultPath(tempRepo));
  assert.match(reportContent, /No verifier result is recorded\./);
  assert.doesNotMatch(reportContent, /Verifier result: pass/);
  assert.match(reportContent, /DO NOT MERGE/);
});

test("phase 12 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
