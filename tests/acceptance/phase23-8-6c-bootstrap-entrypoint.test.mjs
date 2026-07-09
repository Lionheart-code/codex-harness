import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
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
    "# Phase 23.8.6C - Minimum Self-Hosting Orchestrator Entrypoint",
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
        ...(options.worktree ? { worktree: options.worktree } : {})
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
      worktree: tempRepo
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
      "## Phase 23.8.6C — Minimum Self-Hosting Orchestrator Entrypoint",
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

test("phase 23.8.6C run start dry-run emits bootstrap facts and does not mutate durable state", () => {
  ensureBuiltCli();
  const tempRepo = createPhase2386CRepo("codex-harness-phase23-8-6c-dry-run-");
  const beforeStatus = getGitStatus(tempRepo);

  const result = runCli(["run", "start", "--task", "TASK.md", "--dry-run"], { cwd: tempRepo });
  assertSuccess(result, "run start --dry-run");

  const output = parseOutput(result.stdout);
  assert.equal(output.get("bootstrap status"), "ready");
  assert.equal(output.get("operator stage"), "TASK_INTAKE_REQUIRED");
  assert.equal(output.get("operator next procedure"), "task-intake");
  assert.equal(output.get("handoff kind"), "procedure");
  assert.equal(output.get("handoff procedure"), "task-intake");
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
  assert.equal(run.bootstrap_facts.length, 5);
  assert.equal(run.repository.task_worktree_path, tempRepo);
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
