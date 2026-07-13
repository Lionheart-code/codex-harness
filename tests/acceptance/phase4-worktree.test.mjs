import assert from "node:assert/strict";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  isPathInside,
  normalizePathForComparison,
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

test("phase 4 worktree creates one branch and one isolated worktree per task", () => {
  ensureBuiltCli();

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  const readmePath = path.join(tempRepo, "README.md");
  writeText(readmePath, "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");

  const sourceHead = runCommand("git", ["rev-parse", "HEAD"], { cwd: tempRepo });
  assertSuccess(sourceHead, "git rev-parse source head");

  const worktreeResult = runCli(["worktree"], { cwd: tempRepo });
  assertSuccess(worktreeResult, "worktree");
  assert.match(worktreeResult.stdout, /status: worktree created/);
  assert.match(worktreeResult.stdout, /branch: task\/task-test-task/);

  const taskRoot = path.join(tempRepo, ".harness", "tasks", "task-test-task");
  const branchRecordPath = path.join(taskRoot, "branch.txt");
  const worktreeRecordPath = path.join(taskRoot, "worktree.txt");
  const statePath = path.join(taskRoot, "state.json");

  const branchName = readText(branchRecordPath).trim();
  const worktreePath = readText(worktreeRecordPath).trim();
  const state = readJson(statePath);

  assert.equal(branchName, "task/task-test-task");
  assert.equal(state.branch, branchName);
  assert.equal(state.worktree, worktreePath);
  assert.equal(state.base_commit_sha, sourceHead.stdout.trim());
  assert.equal(typeof state.updated_at, "string");
  assert.equal(state.task_id, "task-test-task");
  assert.ok(path.isAbsolute(worktreePath), "worktree path must be absolute");
  assert.equal(isPathInside(tempRepo, worktreePath), false, "worktree path must be outside the main target repo");

  const gitWorktreeCheck = runCommand("git", ["worktree", "list", "--porcelain"], { cwd: tempRepo });
  assertSuccess(gitWorktreeCheck, "git worktree list");
  const listedWorktrees = gitWorktreeCheck.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .map((entry) => normalizePathForComparison(entry));
  assert.ok(
    listedWorktrees.includes(normalizePathForComparison(worktreePath)),
    "expected git worktree list to include the recorded worktree path"
  );

  const branchCheck = runCommand("git", ["show-ref", "--verify", "--quiet", "refs/heads/task/task-test-task"], {
    cwd: tempRepo
  });
  assert.equal(branchCheck.status, 0, "expected branch to exist");

  const statusResult = runCli(["status"], { cwd: tempRepo });
  assertSuccess(statusResult, "status");
  assert.match(statusResult.stdout, /task-test-task \| created \| test task \|/);
  assert.match(statusResult.stdout, /branch=task\/task-test-task/);
  assert.match(statusResult.stdout, /worktree=/);

  const secondWorktree = runCli(["worktree"], { cwd: tempRepo });
  assertSuccess(secondWorktree, "worktree second run");
  assert.match(secondWorktree.stdout, /status: worktree already exists/);
});

test("phase 4 worktree fails clearly when the repository has no initial commit", () => {
  ensureBuiltCli();

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");

  const worktreeResult = runCli(["worktree"], { cwd: tempRepo });
  assertFailure(worktreeResult, "worktree without initial commit");
  assert.match(worktreeResult.stderr, /Source repository has no valid HEAD\. Create an initial commit first\./);
});

test("phase 4 worktree refuses a dirty source checkout", () => {
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

  writeText(path.join(tempRepo, "DIRTY.txt"), "dirty\n");

  const worktreeResult = runCli(["worktree"], { cwd: tempRepo });
  assertFailure(worktreeResult, "worktree dirty checkout refusal");
  assert.match(worktreeResult.stderr, /Source checkout is dirty\./);
});
