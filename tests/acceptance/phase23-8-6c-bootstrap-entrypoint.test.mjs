import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
  productRoot,
  readJson,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const ACTIVE_TASK_PATH = "tasks/PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md";
const PREVIOUS_TASK_PATH = "tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md";
const TIMESTAMP = "2026-07-09T00:00:00.000Z";
const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function activeTaskMarkdown() {
  return [
    "# Phase 23.8.6C2 - Bootstrap Authority Correctness",
    "",
    "## Goal",
    "Bootstrap one bounded self-hosting worker step from the committed task context.",
    "",
    "## Constraints",
    "- no runner execution",
    "- one bounded handoff only",
    "- fail closed on dirty or uncommitted task authority",
    "",
    "## Acceptance commands",
    "",
    "```bash",
    "npm run build",
    "npm test",
    "node bin/ch run start --task TASK.md --dry-run",
    "node bin/ch run status --operator --dry-run",
    "git diff --check",
    "```",
    ""
  ].join("\n");
}

function previousTaskMarkdown() {
  return [
    "# Phase 23.8.6B2 - Verification Command Rationalization and Serialization",
    "",
    "## Goal",
    "Placeholder previous phase task.",
    ""
  ].join("\n");
}

function parseOutput(stdout) {
  const parsed = new Map();

  for (const line of stdout.trim().split(/\r?\n/u)) {
    const separator = line.indexOf(": ");
    if (separator === -1) {
      continue;
    }

    parsed.set(line.slice(0, separator), line.slice(separator + 2));
  }

  return parsed;
}

function currentBranch(tempRepo) {
  const result = runCommand("git", ["branch", "--show-current"], { cwd: tempRepo });
  assertSuccess(result, "git branch --show-current");
  return result.stdout.trim();
}

function currentHead(tempRepo) {
  const result = runCommand("git", ["rev-parse", "HEAD"], { cwd: tempRepo });
  assertSuccess(result, "git rev-parse HEAD");
  return result.stdout.trim();
}

function writeInstalledTaskState(tempRepo, taskId, title, options = {}) {
  const taskDir = path.join(tempRepo, ".harness", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  writeText(
    path.join(taskDir, "state.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        producer_command: "test",
        task_id: taskId,
        title,
        status: "created",
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        phase: "3",
        spec: "spec.md",
        acceptance: "acceptance.md",
        ...(options.branch ? { branch: options.branch } : {}),
        ...(options.worktree ? { worktree: options.worktree } : {}),
        ...(options.baseCommitSha ? { base_commit_sha: options.baseCommitSha } : {})
      },
      null,
      2
    )}\n`
  );
}

function installHarnessLayerFixture(tempRepo, options = {}) {
  fs.mkdirSync(path.join(tempRepo, ".harness"), { recursive: true });
  writeText(
    path.join(tempRepo, ".harness", "config.toml"),
    [
      "[harness]",
      'version = "0.1.0"',
      "",
      "[worktree]",
      'root = "../.codex-harness-worktrees"',
      ""
    ].join("\n")
  );
  writeText(
    path.join(tempRepo, ".harness", "install.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        producer_command: "test",
        harness_version: "0.1.0",
        templates_version: "0.1.0",
        installed_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        source: "codex-harness"
      },
      null,
      2
    )}\n`
  );

  writeInstalledTaskState(
    tempRepo,
    "task-active-bootstrap",
    "Active bootstrap task",
    {
      branch: currentBranch(tempRepo),
      worktree: tempRepo,
      baseCommitSha: options.activeBaseCommitSha ?? currentHead(tempRepo)
    }
  );
  writeInstalledTaskState(
    tempRepo,
    "task-historical-bootstrap",
    "Historical bootstrap task",
    {
      branch: options.historicalBranch ?? "task/historical-bootstrap",
      worktree: options.historicalWorktree ?? path.join(tempRepo, "..", "historical-worktree")
    }
  );
}

function createPhase2386CRepo(prefix, options = {}) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6C\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "skills"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "prompts"), { recursive: true });

  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${options.initialTaskPath ?? ACTIVE_TASK_PATH}`,
      "",
      "Do not implement Phase 23.8.6D or later.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, ACTIVE_TASK_PATH), activeTaskMarkdown());
  writeText(path.join(tempRepo, PREVIOUS_TASK_PATH), previousTaskMarkdown());
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6C2 — Bootstrap Authority Correctness",
      "",
      "Task:",
      `\`${ACTIVE_TASK_PATH}\``,
      "",
      "Status:",
      "Active implementation phase.",
      ""
    ].join("\n")
  );

  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });

  if (options.installHarnessLayer) {
    installHarnessLayerFixture(tempRepo, options.installOptions);
  }

  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add phase 23.8.6C scaffold");
  assertSuccess(runCommand("git", ["commit", "-m", "phase 23.8.6C scaffold"], { cwd: tempRepo }), "git commit scaffold");

  return tempRepo;
}

test("phase 23.8.6C2 run start dry-run blocks without base authority and does not mutate durable state", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-dry-run-");
  const beforeStatus = getGitStatus(tempRepo);

  const result = runCli(["run", "start", "--task", "TASK.md", "--dry-run"], { cwd: tempRepo });
  assertSuccess(result, "run start --dry-run");

  const output = parseOutput(result.stdout);
  assert.equal(output.get("bootstrap status"), "blocked");
  assert.equal(output.get("operator stage"), "BOOTSTRAP_REPAIR_REQUIRED");
  assert.match(output.get("run issue missing_base_authority") ?? "", /base authority cannot be proven/i);
  assert.match(output.get("bootstrap fact active_task_path") ?? "", new RegExp(`^${ACTIVE_TASK_PATH} \\(task_pointer\\)$`));
  assert.match(output.get("bootstrap fact run_identity") ?? "", /^run-dry-run:/);
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness", "runs")), false, "dry-run created runtime state");
  assert.equal(getGitStatus(tempRepo), beforeStatus, "dry-run changed git status");
});

test("phase 23.8.6C run start records one bounded handoff and resolves current task authority with historical task state present", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-success-", {
    installHarnessLayer: true
  });

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(result, "run start");

  const output = parseOutput(result.stdout);
  assert.equal(output.get("bootstrap status"), "ready");
  assert.equal(output.get("operator stage"), "TASK_INTAKE_REQUIRED");
  assert.equal(output.get("handoff procedure"), "task-intake");

  const run = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  assert.equal(run.bootstrap_status, "ready");
  assert.equal(run.run_issues.length, 0);
  assert.equal(run.repair_packets.length, 0);
  assert.equal(run.bootstrap_handoff.procedure_id, "task-intake");
  assert.equal(run.bootstrap_facts.length, 6);
  assert.equal(run.repository.task_worktree_path, tempRepo);
  assert.equal(run.bootstrap_facts.find((fact) => fact.label === "source_snapshot").value, currentHead(tempRepo));
  assert.equal(run.bootstrap_facts.find((fact) => fact.label === "base_commit").source, "task_state");
});

test("phase 23.8.6C2 rejects a missing active task reference before durable run creation", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-missing-task-", {
    initialTaskPath: "tasks/MISSING_TASK.md"
  });

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertFailure(result, "run start with missing active task");
  assert.match(result.stderr, /Task authority is not a readable regular file/i);
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness", "runs")), false);
});

test("phase 23.8.6C2 emits one typed blocker when multiple task records do not match the checkout", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-unmatched-task-", {
    installHarnessLayer: true
  });
  writeInstalledTaskState(tempRepo, "task-active-bootstrap", "Unmatched task", {
    branch: "task/not-current",
    worktree: path.join(tempRepo, "..", "not-current"),
    baseCommitSha: currentHead(tempRepo)
  });
  assertSuccess(runCommand("git", ["add", ".harness"], { cwd: tempRepo }), "git add unmatched task states");
  assertSuccess(runCommand("git", ["commit", "-m", "set unmatched task states"], { cwd: tempRepo }), "git commit unmatched task states");

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(result, "run start with unmatched tasks");
  const run = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  assert.equal(run.bootstrap_status, "blocked");
  assert.deepEqual(run.run_issues.map((issue) => issue.issue_type), ["bootstrap_authority_unmatched"]);
  assert.deepEqual(run.repair_packets[0].issue_ids, [run.run_issues[0].issue_id]);
});

test("phase 23.8.6C2 uses the configured-upstream merge-base only when task state has no base", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-upstream-base-", {
    installHarnessLayer: true
  });
  const branch = currentBranch(tempRepo);
  const upstreamHead = currentHead(tempRepo);
  assertSuccess(runCommand("git", ["remote", "add", "origin", tempRepo], { cwd: tempRepo }), "git remote add origin");
  assertSuccess(runCommand("git", ["update-ref", `refs/remotes/origin/${branch}`, upstreamHead], { cwd: tempRepo }), "git update-ref upstream");
  assertSuccess(runCommand("git", ["config", `branch.${branch}.remote`, "origin"], { cwd: tempRepo }), "git config upstream remote");
  assertSuccess(runCommand("git", ["config", `branch.${branch}.merge`, `refs/heads/${branch}`], { cwd: tempRepo }), "git config upstream merge");
  writeInstalledTaskState(tempRepo, "task-active-bootstrap", "Active bootstrap task", {
    branch,
    worktree: tempRepo
  });
  assertSuccess(runCommand("git", ["add", ".harness"], { cwd: tempRepo }), "git add legacy task state");
  assertSuccess(runCommand("git", ["commit", "-m", "remove task base authority"], { cwd: tempRepo }), "git commit legacy task state");

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(result, "run start with upstream merge-base");
  const run = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  const baseFact = run.bootstrap_facts.find((fact) => fact.label === "base_commit");
  assert.equal(run.bootstrap_status, "ready");
  assert.equal(baseFact.value, upstreamHead);
  assert.equal(baseFact.source, "git_merge_base");
  assert.notEqual(baseFact.value, run.source_snapshot);
});

test("phase 23.8.6C2 rejects malformed persisted bootstrap facts on staging readback", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-malformed-readback-", {
    installHarnessLayer: true
  });
  assertSuccess(runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo }), "run start");
  const runPath = path.join(tempRepo, ".harness", "runs", "run-0001", "run.json");
  const run = readJson(runPath);
  run.bootstrap_facts[0].fact_id = "";
  const stagingPath = path.join(tempRepo, ".harness", "runs", "run-0001", "staging.sqlite");
  const mutation = runCommand(
    process.execPath,
    [
      "-e",
      "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); db.prepare('UPDATE runs SET run_json = ? WHERE run_id = ?').run(process.argv[2], 'run-0001'); db.close();",
      stagingPath,
      JSON.stringify(run)
    ],
    { cwd: tempRepo }
  );
  assertSuccess(mutation, "mutate staged run json");

  const result = runCli(["run", "status", "--run", "run-0001"], { cwd: tempRepo });
  assertFailure(result, "run status with malformed staged bootstrap fact");
  assert.match(result.stderr, /bootstrap fact is missing required string field: fact_id/i);
});

test("phase 23.8.6C2 fails closed on duplicate worktree task authority", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-duplicate-task-", {
    installHarnessLayer: true
  });
  writeInstalledTaskState(tempRepo, "task-historical-bootstrap", "Duplicate task", {
    branch: "task/historical-bootstrap",
    worktree: tempRepo,
    baseCommitSha: currentHead(tempRepo)
  });
  assertSuccess(runCommand("git", ["add", ".harness"], { cwd: tempRepo }), "git add duplicate task states");
  assertSuccess(runCommand("git", ["commit", "-m", "set duplicate task states"], { cwd: tempRepo }), "git commit duplicate task states");

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(result, "run start with duplicate tasks");
  const run = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  assert.deepEqual(run.run_issues.map((issue) => issue.issue_type), ["bootstrap_authority_ambiguous"]);
  assert.deepEqual(run.repair_packets[0].issue_ids, [run.run_issues[0].issue_id]);
});

test("phase 23.8.6C run start fails closed on uncommitted TASK.md activation and emits a repair packet", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-uncommitted-task-", {
    initialTaskPath: PREVIOUS_TASK_PATH
  });
  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${ACTIVE_TASK_PATH}`,
      "",
      "Do not implement Phase 23.8.6D or later.",
      ""
    ].join("\n")
  );

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(result, "run start with uncommitted TASK.md activation");

  const output = parseOutput(result.stdout);
  assert.equal(output.get("bootstrap status"), "blocked");
  assert.equal(output.get("repair route"), "fix_pass");
  assert.match(output.get("run issue uncommitted_task_activation") ?? "", /TASK\.md activation is uncommitted/i);

  const run = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  assert.equal(run.bootstrap_status, "blocked");
  assert.equal(run.run_issues.some((issue) => issue.issue_type === "uncommitted_task_activation"), true);
  assert.equal(run.repair_packets.length, 1);

  const operator = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(operator, "run status --operator after uncommitted activation");
  const operatorOutput = parseOutput(operator.stdout);
  assert.equal(operatorOutput.get("current_stage"), "BOOTSTRAP_REPAIR_REQUIRED");
});

test("phase 23.8.6C run start fails closed on dirty git after activation and persists typed bootstrap issues", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-dirty-git-");
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6C dirty\n");

  const result = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(result, "run start with dirty git");

  const output = parseOutput(result.stdout);
  assert.equal(output.get("bootstrap status"), "blocked");
  assert.match(output.get("run issue dirty_git_after_task_activation") ?? "", /Git is dirty after task activation/i);

  const run = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  assert.equal(run.run_issues.some((issue) => issue.issue_type === "dirty_git_after_task_activation"), true);
  assert.equal(run.repair_packets.length, 1);
});
