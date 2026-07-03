import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  ensureBuiltCli,
  productRoot,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const ACTIVE_TASK_PATH = "tasks/PHASE_23_8_6_TRANSACTIONAL_PROCEDURE_RESULT_INGESTION.md";
const ACTIVE_TASK_23_8_6A_PATH = "tasks/PHASE_23_8_6A_SELF_HOSTING_REPLAY_AND_REINGESTION_CONTINUITY.md";
const TIMESTAMP = "2026-06-24T00:00:00.000Z";
const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function loadBuiltRuntime() {
  ensureBuiltCli();
  return require(path.join(productRoot, "dist", "core", "runtime.js"));
}

function activeTaskMarkdown() {
  return [
    "# Phase 23.8.6 - Transactional Procedure Result Ingestion and Slice-Isolated Run Mutations",
    "",
    "## Goal",
    "Make run-state mutation reliable before stage packet automation and proof.",
    "",
    "## Acceptance commands",
    "",
    "```bash",
    "npm run build",
    "npm test",
    "npm run test:acceptance",
    "git diff --check",
    "```",
    ""
  ].join("\n");
}

function activeTask23_8_6AMarkdown() {
  return [
    "# Phase 23.8.6A - Self-Hosting Replay and Re-ingestion Continuity",
    "",
    "## Goal",
    "Restore honest self-hosting continuity after exact immutable run identity is hardened.",
    "",
    "## Acceptance commands",
    "",
    "```bash",
    "npm run build",
    "npm test",
    "npm run test:acceptance",
    "git diff --check",
    "```",
    ""
  ].join("\n");
}

function createPhase2386Repo(prefix) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "skills"), { recursive: true });

  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${ACTIVE_TASK_PATH}`,
      "",
      "Do not implement Phase 23.8.7 or later.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, ACTIVE_TASK_PATH), activeTaskMarkdown());
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6 — Transactional Procedure Result Ingestion and Slice-Isolated Run Mutations",
      "",
      "Task:",
      `\`${ACTIVE_TASK_PATH}\``,
      ""
    ].join("\n")
  );

  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });

  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add phase 23.8.6 scaffold");
  assertSuccess(runCommand("git", ["commit", "-m", "phase 23.8.6 scaffold"], { cwd: tempRepo }), "git commit scaffold");

  return tempRepo;
}

function createPhase2386ARepo(prefix) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6A\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "skills"), { recursive: true });

  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${ACTIVE_TASK_23_8_6A_PATH}`,
      "",
      "Do not implement Phase 23.8.6B or later.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, ACTIVE_TASK_23_8_6A_PATH), activeTask23_8_6AMarkdown());
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6A — Self-Hosting Replay and Re-ingestion Continuity",
      "",
      "Task:",
      `\`${ACTIVE_TASK_23_8_6A_PATH}\``,
      ""
    ].join("\n")
  );

  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });

  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add phase 23.8.6A scaffold");
  assertSuccess(runCommand("git", ["commit", "-m", "phase 23.8.6A scaffold"], { cwd: tempRepo }), "git commit scaffold");

  return tempRepo;
}

function createBaseRunForTask(runtimeModule, tempRepo, runId, activeTaskPath, phaseId) {
  return runtimeModule.buildRuntimeRun({
    runId,
    taskPath: "TASK.md",
    activeTaskPath,
    phaseId,
    repository: {
      root_path: tempRepo,
      project_root: tempRepo,
      dirty: false
    },
    timestamp: TIMESTAMP
  });
}

function createBaseRun(runtimeModule, tempRepo, runId) {
  return createBaseRunForTask(runtimeModule, tempRepo, runId, ACTIVE_TASK_PATH, "23.8.6");
}

function createBaseRun23_8_6A(runtimeModule, tempRepo, runId) {
  return createBaseRunForTask(runtimeModule, tempRepo, runId, ACTIVE_TASK_23_8_6A_PATH, "23.8.6A");
}

function appendProcedureEvidence(run, procedureId, index) {
  return {
    ...run,
    evidence: [
      ...run.evidence,
      {
        evidence_id: `procedure-${procedureId}-${index}`,
        kind: `procedure:${procedureId}`,
        summary: procedureId,
        path: `evidence/${procedureId}-${index}.md`
      }
    ]
  };
}

function writeRuntimeRunFixture(tempRepo, run) {
  const { RunStagingDatabase, resolveHarnessRoots } = require(path.join(productRoot, "dist", "core", "run-staging-db.js"));
  const runDir = path.join(tempRepo, ".harness", "runs", run.run_id);
  fs.mkdirSync(runDir, { recursive: true });
  writeText(path.join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeText(
    path.join(tempRepo, ".harness", "runs", "current.json"),
    `${JSON.stringify({ run_id: run.run_id, run_path: `${run.run_id}/run.json`, updated_at: run.updated_at }, null, 2)}\n`
  );
  const roots = resolveHarnessRoots(tempRepo);
  new RunStagingDatabase(tempRepo, roots.projectRoot, run.run_id).saveRun(run);
}

function writeRunEvidence(tempRepo, runId, relativePath, content, timestampOffsetSeconds = 0) {
  const absolutePath = path.join(tempRepo, ".harness", "runs", runId, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeText(absolutePath, content);
  const baseTimestamp = Date.parse("2026-06-24T00:01:00.000Z");
  const timestamp = new Date(baseTimestamp + timestampOffsetSeconds * 1000);
  fs.utimesSync(absolutePath, timestamp, timestamp);
  return absolutePath;
}

function writeProcedureArtifact(tempRepo, runId, name, content) {
  const artifactPath = path.join(tempRepo, ".harness", "runs", runId, "manual", `${name}.md`);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeText(artifactPath, content);
  return artifactPath;
}

function parseOperatorOutput(stdout) {
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

function runOperatorStatus(tempRepo, runId) {
  const result = runCli(["run", "status", "--operator", "--run", runId], { cwd: tempRepo });
  assertSuccess(result, "run status --operator");
  return parseOperatorOutput(result.stdout);
}

function buildPlanReviewArtifact(recommendation = "PASS") {
  return [
    "## Review Tier",
    "",
    "extra-high",
    "",
    "## Findings",
    "",
    "1. Review fixture.",
    "",
    "## Scope And Boundary Check",
    "",
    "Inside task boundary.",
    "",
    "## Policy Control Check",
    "",
    "anti_slop: pass",
    "design_invariant: pass",
    "scope_legality: pass",
    "evidence_gap: pass",
    "docs_consistency: pass",
    "future_phase_leakage: pass",
    "review_tier_controls: named",
    "",
    "## Validation Check",
    "",
    "validation fixture",
    "",
    "## Durable Decision Record",
    "",
    "verdict: PASS",
    "outcome_state: ready_for_implementation",
    "blocking_findings: none",
    "required_amendments: none",
    "accepted_defaults: defaults stand",
    "real_operator_choices: none",
    "next_allowed_action: obtain explicit human approval of the reviewed plan",
    "validation_required: npm run build; npm test; npm run test:acceptance; git diff --check",
    "source_trace: procedure:plan-review",
    "future_phase_deferrals: none",
    "",
    "## Recommendation",
    "",
    recommendation
  ].join("\n");
}

function prepareApprovedImplementationReviewRun(runtimeModule, tempRepo, reviewMarkdown) {
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# approved plan\n");
  writeProcedureArtifact(tempRepo, run.run_id, "implementation-review", reviewMarkdown);

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  ), "record plan-review before implementation-review check");

  assertSuccess(runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/draft-plan.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  ), "approve reviewed draft-plan before implementation-review check");

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "phase23-8-6.ts"), "export const phase2386 = true;\n");

  return run;
}

function addPlanApproval(runtimeModule, run, reason = "Human approved the reviewed implementation plan.") {
  return runtimeModule.recordApproval(run, {
    approvalId: `approval-${run.approvals.length + 1}`,
    title: "Reviewed plan approved",
    status: "approved",
    approver: "owner",
    reason,
    createdAt: "2026-06-24T00:10:00.000Z"
  });
}

function addImplementationEvidence(runtimeModule, run) {
  const next = runtimeModule.recordStep(run, {
    stepId: "step-implementation",
    name: "Apply scoped implementation changes",
    status: "passed",
    startedAt: "2026-06-24T00:11:00.000Z",
    completedAt: "2026-06-24T00:12:00.000Z"
  });

  return runtimeModule.recordCommandResult(next, "step-implementation", {
    commandResultId: "command-build",
    command: "npm run build",
    status: "pass",
    exitCode: 0,
    completedAt: "2026-06-24T00:13:00.000Z"
  });
}

function addReviewResult(runtimeModule, run, status, summary, source) {
  return runtimeModule.recordReviewResult(run, {
    review_result_id: `review-${run.review_results.length + 1}`,
    status,
    created_at: "2026-06-24T00:14:00.000Z",
    summary,
    source,
    blockers: status === "FIX_REQUIRED" ? [summary] : [],
    artifact_refs: []
  });
}

function addVerificationResult(runtimeModule, run, status, summary = "Verification result") {
  return runtimeModule.recordVerificationResult(run, {
    verification_result_id: `verification-${run.verification_results.length + 1}`,
    status,
    created_at: "2026-06-24T00:15:00.000Z",
    summary,
    source: "self-hosting",
    artifact_refs: [],
    command_results: []
  });
}

function buildPostVerificationRun(runtimeModule, tempRepo, runId) {
  let run = createBaseRun(runtimeModule, tempRepo, runId);
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  run = appendProcedureEvidence(run, "plan-review", 4);
  run = addReviewResult(runtimeModule, run, "PASS", "Plan review approved the plan", "procedure:plan-review");
  run = addPlanApproval(runtimeModule, run);
  run = addImplementationEvidence(runtimeModule, run);
  run = appendProcedureEvidence(run, "implementation-review", 5);
  run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
  run = addVerificationResult(runtimeModule, run, "pass", "Verification passed");
  run = appendProcedureEvidence(run, "verification-review", 6);
  run = {
    ...run,
    delivery_facts: [
      {
        delivery_fact_id: "delivery-pr",
        run_id: run.run_id,
        fact_kind: "pr",
        source: "self-hosting",
        status: "unknown",
        recorded_at: "2026-06-24T00:16:00.000Z",
        summary: "PR is not created yet."
      },
      {
        delivery_fact_id: "delivery-merge-commit",
        run_id: run.run_id,
        fact_kind: "merge_commit",
        source: "self-hosting",
        status: "unknown",
        recorded_at: "2026-06-24T00:16:10.000Z",
        summary: "Merge commit is not recorded yet."
      }
    ],
    updated_at: "2026-06-24T00:16:10.000Z"
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeRunEvidence(tempRepo, run.run_id, "evidence/plan-review-4.md", buildPlanReviewArtifact(), 3);
  writeRunEvidence(tempRepo, run.run_id, "evidence/implementation-review-5.md", "## Recommendation\n\nPASS\n", 4);
  writeRunEvidence(tempRepo, run.run_id, "evidence/verification-review-6.md", "## Recommendation\n\nPASS\n", 5);

  return run;
}

function buildPostVerificationRun23_8_6A(runtimeModule, tempRepo, runId) {
  let run = createBaseRun23_8_6A(runtimeModule, tempRepo, runId);
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  run = appendProcedureEvidence(run, "plan-review", 4);
  run = addReviewResult(runtimeModule, run, "PASS", "Plan review approved the plan", "procedure:plan-review");
  run = addPlanApproval(runtimeModule, run);
  run = addImplementationEvidence(runtimeModule, run);
  run = appendProcedureEvidence(run, "implementation-review", 5);
  run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
  run = addVerificationResult(runtimeModule, run, "pass", "Verification passed");
  run = appendProcedureEvidence(run, "verification-review", 6);
  run = runtimeModule.recordRemoteCheckResult(run, {
    status: "pass",
    provider: "github",
    providerRunId: "ci-123",
    providerUrl: "https://example.invalid/ci/123"
  });
  run = {
    ...run,
    delivery_facts: [
      {
        delivery_fact_id: "delivery-pr",
        run_id: run.run_id,
        fact_kind: "pr",
        source: "self-hosting",
        status: "created",
        recorded_at: "2026-06-24T00:16:00.000Z",
        summary: "PR exists for the recovered run."
      },
      {
        delivery_fact_id: "delivery-remote-ci",
        run_id: run.run_id,
        fact_kind: "remote_ci",
        source: "github",
        status: "pass",
        recorded_at: "2026-06-24T00:16:10.000Z",
        summary: "Remote CI passed for the recovered run.",
        external_run_id: "ci-123",
        url: "https://example.invalid/ci/123",
        commit_sha: "abc123def456abc123def456abc123def456abcd"
      },
      {
        delivery_fact_id: "delivery-merge-result",
        run_id: run.run_id,
        fact_kind: "merge_result",
        source: "github",
        status: "merged",
        recorded_at: "2026-06-24T00:16:20.000Z",
        summary: "PR merged."
      },
      {
        delivery_fact_id: "delivery-merge-commit",
        run_id: run.run_id,
        fact_kind: "merge_commit",
        source: "github",
        status: "merged",
        recorded_at: "2026-06-24T00:16:30.000Z",
        summary: "Merge commit recorded.",
        commit_sha: "abc123def456abc123def456abc123def456abcd"
      }
    ],
    updated_at: "2026-06-24T00:16:30.000Z"
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeRunEvidence(tempRepo, run.run_id, "evidence/plan-review-4.md", buildPlanReviewArtifact(), 3);
  writeRunEvidence(tempRepo, run.run_id, "evidence/implementation-review-5.md", "## Recommendation\n\nPASS\n", 4);
  writeRunEvidence(tempRepo, run.run_id, "evidence/verification-review-6.md", "## Recommendation\n\nPASS\n", 5);

  return run;
}

function gitHead(tempRepo) {
  const result = runCommand("git", ["rev-parse", "HEAD"], { cwd: tempRepo });
  assertSuccess(result, "git rev-parse HEAD");
  return result.stdout.trim();
}

function buildClosedRun(runtimeModule, tempRepo, runId) {
  const run = {
    ...buildPostVerificationRun(runtimeModule, tempRepo, runId),
    lifecycle_status: "closed",
    delivery_facts: [
      {
        delivery_fact_id: "delivery-merge-result",
        run_id: runId,
        fact_kind: "merge_result",
        source: "github",
        status: "merged",
        recorded_at: "2026-06-24T00:16:20.000Z",
        summary: "PR merged."
      },
      {
        delivery_fact_id: "delivery-merge-commit",
        run_id: runId,
        fact_kind: "merge_commit",
        source: "github",
        status: "merged",
        recorded_at: "2026-06-24T00:16:20.000Z",
        summary: "Merge commit recorded.",
        commit_sha: "abc123def456abc123def456abc123def456abcd"
      }
    ],
    updated_at: "2026-06-24T00:16:20.000Z"
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  return run;
}

test("phase 23.8.6 record-procedure ingests a durable plan-review artifact and is idempotent", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-plan-review-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_REVIEW_REQUIRED");

  const recordPlanReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordPlanReview, "record plan-review");
  assert.match(recordPlanReview.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_APPROVAL_REQUIRED");

  const replayPlanReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(replayPlanReview, "record plan-review replay");
  assert.match(replayPlanReview.stdout, /recorded: false/);
});

test("phase 23.8.6 approve-plan records explicit reviewed-plan approval and advances to implementation-ready", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-approve-plan-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# approved plan\n");

  const recordPlanReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordPlanReview, "record plan-review before approval");

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_APPROVAL_REQUIRED");

  const approvePlan = runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/draft-plan.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  );
  assertSuccess(approvePlan, "approve reviewed plan");
  assert.match(approvePlan.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");

  const approvedPlanEvidencePath = path.join(
    tempRepo,
    ".harness",
    "runs",
    run.run_id,
    "evidence",
    fs.readdirSync(path.join(tempRepo, ".harness", "runs", run.run_id, "evidence")).find((entry) => entry.startsWith("approved-plan-"))
  );
  const laterTimestamp = new Date("2026-06-24T00:02:30.000Z");
  fs.utimesSync(approvedPlanEvidencePath, laterTimestamp, laterTimestamp);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");

  const replayApproval = runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/draft-plan.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  );
  assertSuccess(replayApproval, "approve reviewed plan replay");
  assert.match(replayApproval.stdout, /recorded: false/);
});

test("phase 23.8.6 record-procedure fails closed for malformed plan-review artifacts", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-bad-plan-review-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "plan-review-invalid",
    ["## Recommendation", "", "PASS", ""].join("\n")
  );

  const badPlanReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-invalid.md`
    ],
    { cwd: tempRepo }
  );
  assertFailure(badPlanReview, "record malformed plan-review");
  assert.match(badPlanReview.stderr, /missing a complete durable decision record/i);

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_REVIEW_REQUIRED");

  const runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.evidence.some((entry) => entry.kind === "procedure:plan-review"), false);
});

test("phase 23.8.6 plan-review recommendation parsing remains strict outside implementation-review aliases", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-plan-review-strict-recommendation-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "plan-review-accept",
    buildPlanReviewArtifact("ACCEPT")
  );

  const aliasedPlanReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-accept.md`
    ],
    { cwd: tempRepo }
  );
  assertFailure(aliasedPlanReview, "record aliased plan-review recommendation");
  assert.match(aliasedPlanReview.stderr, /missing a Recommendation section/i);

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_REVIEW_REQUIRED");

  const runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.evidence.some((entry) => entry.kind === "procedure:plan-review"), false);
});

test("phase 23.8.6 operator treats live task-scoped source changes as implementation evidence after plan approval", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-live-implementation-evidence-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", "# approved plan\n");

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  ), "record plan-review before live implementation evidence");

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-amend",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-amend-8.md`
    ],
    { cwd: tempRepo }
  ), "record effective amended plan before live implementation evidence");

  assertSuccess(runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/plan-amend-8.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  ), "approve reviewed plan before live implementation evidence");

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "phase23-8-6.ts"), "export const phase2386 = true;\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "implementation-review");
});

test("phase 23.8.6 TASK.md-only diffs do not count as implementation evidence", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-task-only-diff-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# approved plan\n");

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  ), "record plan-review before task-only diff check");

  assertSuccess(runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/draft-plan.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  ), "approve reviewed draft-plan before task-only diff check");

  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${ACTIVE_TASK_PATH}`,
      "",
      "Updated note.",
      ""
    ].join("\n")
  );

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
});

test("phase 23.8.6 record-procedure ingests a PASS fix-pass-review and advances beyond fix-pass", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-fix-pass-review-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# approved plan\n");
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "implementation-review",
    [
      "## Recommendation",
      "",
      "FIX_REQUIRED",
      ""
    ].join("\n")
  );
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "fix-pass-review",
    [
      "## Original Findings",
      "",
      "1. Example finding.",
      "",
      "## Resolution Status",
      "",
      "1. `resolved`",
      "Resolved in the fix pass.",
      ""
    ].join("\n")
  );

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-amended-8.md`
    ],
    { cwd: tempRepo }
  ), "record plan-review before fix-pass-review check");

  assertSuccess(runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/draft-plan.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  ), "approve reviewed draft-plan before fix-pass-review check");

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "phase23-8-6.ts"), "export const phase2386 = true;\n");

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "implementation-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/implementation-review.md`
    ],
    { cwd: tempRepo }
  ), "record implementation-review before fix-pass-review check");

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "FIX_PASS_REQUIRED");

  const recordFixPassReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "fix-pass-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/fix-pass-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordFixPassReview, "record PASS fix-pass-review");
  assert.match(recordFixPassReview.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.notEqual(output.get("current_stage"), "FIX_PASS_REQUIRED");
});

test("phase 23.8.6 record-procedure ingests sentence-ending implementation-review FIX_REQUIRED and routes to fix-pass", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-implementation-review-sentence-fix-required-");
  const run = prepareApprovedImplementationReviewRun(
    runtimeModule,
    tempRepo,
    [
      "## Review Surface",
      "",
      "Fixture review surface.",
      "",
      "## Findings",
      "",
      "1. Example finding.",
      "",
      "## Recommendation",
      "",
      "Content-level policy wording otherwise matches the requested Phase 23.8.6B boundaries. FIX_REQUIRED",
      ""
    ].join("\n")
  );

  const recordImplementationReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "implementation-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/implementation-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordImplementationReview, "record sentence-ending implementation-review FIX_REQUIRED");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "FIX_PASS_REQUIRED");

  const updatedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  const implementationReview = updatedRun.review_results.find((entry) => entry.source === "procedure:implementation-review");
  assert.equal(implementationReview?.status, "FIX_REQUIRED");
});

test("phase 23.8.6 record-procedure normalizes implementation-review ACCEPT to PASS", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-implementation-review-accept-");
  const run = prepareApprovedImplementationReviewRun(
    runtimeModule,
    tempRepo,
    [
      "## Review Surface",
      "",
      "Fixture review surface.",
      "",
      "## Findings",
      "",
      "1. No blocking findings.",
      "",
      "## Recommendation",
      "",
      "ACCEPT",
      ""
    ].join("\n")
  );

  const recordImplementationReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "implementation-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/implementation-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordImplementationReview, "record ACCEPT implementation-review");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "VERIFICATION_REVIEW_REQUIRED");

  const updatedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  const implementationReview = updatedRun.review_results.find((entry) => entry.source === "procedure:implementation-review");
  assert.equal(implementationReview?.status, "PASS");
});

test("phase 23.8.6 record-procedure normalizes implementation-review REJECT / FIX-PASS REQUIRED to fix-pass", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-implementation-review-reject-fix-pass-required-");
  const run = prepareApprovedImplementationReviewRun(
    runtimeModule,
    tempRepo,
    [
      "## Review Surface",
      "",
      "Fixture review surface.",
      "",
      "## Findings",
      "",
      "1. Example finding.",
      "",
      "## Recommendation",
      "",
      "REJECT / FIX-PASS REQUIRED",
      ""
    ].join("\n")
  );

  const recordImplementationReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "implementation-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/implementation-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordImplementationReview, "record REJECT / FIX-PASS REQUIRED implementation-review");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "FIX_PASS_REQUIRED");

  const updatedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  const implementationReview = updatedRun.review_results.find((entry) => entry.source === "procedure:implementation-review");
  assert.equal(implementationReview?.status, "FIX_REQUIRED");
});

test("phase 23.8.6 invalid implementation-review artifacts block instead of routing to verification", () => {
  const cases = [
    {
      prefix: "codex-harness-phase23-8-6-implementation-review-unknown-verdict-",
      reviewMarkdown: [
        "## Review Surface",
        "",
        "Fixture review surface.",
        "",
        "## Findings",
        "",
        "1. Example finding.",
        "",
        "## Recommendation",
        "",
        "NEEDS OWNER DECISION",
        ""
      ].join("\n")
    },
    {
      prefix: "codex-harness-phase23-8-6-implementation-review-blocker-note-",
      reviewMarkdown: [
        "## Blocker Summary",
        "",
        "- reviewer launch blocked",
        "",
        "## Recommendation",
        "",
        "BLOCKED",
        ""
      ].join("\n")
    }
  ];

  for (const testCase of cases) {
    const runtimeModule = loadBuiltRuntime();
    const tempRepo = createPhase2386Repo(testCase.prefix);
    const run = prepareApprovedImplementationReviewRun(runtimeModule, tempRepo, testCase.reviewMarkdown);

    const recordImplementationReview = runCli(
      [
        "run",
        "record-procedure",
        "--run",
        run.run_id,
        "--procedure",
        "implementation-review",
        "--file",
        `.harness/runs/${run.run_id}/manual/implementation-review.md`
      ],
      { cwd: tempRepo }
    );
    assertSuccess(recordImplementationReview, "record invalid implementation-review artifact");

    const output = runOperatorStatus(tempRepo, run.run_id);
    assert.equal(output.get("current_stage"), "BLOCKED");
    assert.equal(output.get("next_procedure_id"), "none");
    assert.equal(output.get("stop_reason"), "invalid_review_chain_evidence");

    const updatedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
    const implementationReview = updatedRun.review_results.find((entry) => entry.source === "procedure:implementation-review");
    assert.equal(implementationReview, undefined);
  }
});

test("phase 23.8.6 record-procedure replay backfills a newly parseable fix-pass-review result", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-fix-pass-backfill-");
  const fixPassContent = ["## Original Findings", "", "1. Example finding.", "", "## Resolution Status", "", "1. `resolved`", "Resolved in the fix pass.", ""].join("\n");
  const fixPassHash = createHash("sha256").update(fixPassContent).digest("hex");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  run = appendProcedureEvidence(run, "plan-review", 4);
  run = appendProcedureEvidence(run, "implementation-review", 5);
  run = appendProcedureEvidence(run, "fix-pass-review", 6);
  run = {
    ...run,
    approvals: [
      {
        approval_id: "approval-reviewed-plan-1",
        title: "Reviewed plan approved",
        status: "approved",
        approver: "owner",
        created_at: "2026-06-24T00:03:00.000Z",
        reason: "Human approved the reviewed implementation plan.; effective_plan_artifact_id=sha256:approved; approved_plan_path=.harness/runs/run-0001/manual/draft-plan.md; approved_plan_artifact_id=sha256:approved"
      }
    ],
    artifacts: [
      ...run.artifacts,
      { artifact_id: "sha256:approved", path: "evidence/draft-plan-3.md", kind: "procedure-artifact:draft-plan" },
      { artifact_id: "sha256:plan-review", path: "evidence/plan-review-4.md", kind: "procedure-artifact:plan-review" },
      { artifact_id: "sha256:implementation-review", path: "evidence/implementation-review-5.md", kind: "procedure-artifact:implementation-review" },
      { artifact_id: `sha256:${fixPassHash}`, path: "evidence/fix-pass-review-6.md", kind: "procedure-artifact:fix-pass-review" }
    ],
    evidence: run.evidence.map((entry) => {
      if (entry.kind === "procedure:draft-plan") {
        return { ...entry, artifact_id: "sha256:approved", path: "evidence/draft-plan-3.md" };
      }
      if (entry.kind === "procedure:plan-review") {
        return { ...entry, artifact_id: "sha256:plan-review", path: "evidence/plan-review-4.md" };
      }
      if (entry.kind === "procedure:implementation-review") {
        return { ...entry, artifact_id: "sha256:implementation-review", path: "evidence/implementation-review-5.md" };
      }
      if (entry.kind === "procedure:fix-pass-review") {
        return { ...entry, artifact_id: `sha256:${fixPassHash}`, path: "evidence/fix-pass-review-6.md" };
      }
      return entry;
    }),
    review_results: [
      {
        review_result_id: "review-1",
        status: "PASS",
        created_at: "2026-06-24T00:02:00.000Z",
        summary: "Plan review approved the plan",
        source: "procedure:plan-review",
        blockers: [],
        artifact_refs: [{ artifact_id: "sha256:plan-review", path: "evidence/plan-review-3.md", kind: "procedure-artifact:plan-review" }]
      },
      {
        review_result_id: "review-2",
        status: "FIX_REQUIRED",
        created_at: "2026-06-24T00:04:00.000Z",
        summary: "Implementation Review requires follow-up",
        source: "procedure:implementation-review",
        blockers: ["Implementation Review requires follow-up"],
        artifact_refs: [{ artifact_id: "sha256:implementation-review", path: "evidence/implementation-review-4.md", kind: "procedure-artifact:implementation-review" }]
      }
    ]
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# approved plan\n", 2);
  writeRunEvidence(tempRepo, run.run_id, "evidence/plan-review-4.md", buildPlanReviewArtifact(), 3);
  writeRunEvidence(tempRepo, run.run_id, "evidence/implementation-review-5.md", "## Recommendation\n\nFIX_REQUIRED\n", 4);
  writeRunEvidence(
    tempRepo,
    run.run_id,
    "evidence/fix-pass-review-6.md",
    fixPassContent,
    5
  );
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "fix-pass-review",
    fixPassContent
  );
  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "phase23-8-6.ts"), "export const phase2386 = true;\n");

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "FIX_PASS_REQUIRED");

  const replayFixPassReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "fix-pass-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/fix-pass-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(replayFixPassReview, "replay fix-pass-review to backfill PASS result");
  assert.match(replayFixPassReview.stdout, /recorded: false/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.notEqual(output.get("current_stage"), "FIX_PASS_REQUIRED");
});

test("phase 23.8.6 record-procedure ingests delivery-facts-review and advances to closeout review", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-delivery-facts-review-");
  const run = buildPostVerificationRun(runtimeModule, tempRepo, "run-0001");

  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "delivery-facts-review",
    [
      "## Delivery Facts Reviewed",
      "",
      "- `pr`: unknown",
      "- `remote_ci`: missing",
      "- `review`: missing",
      "- `merge`: missing",
      "- `merge_commit`: unknown",
      "- `closeout_approval`: missing",
      "",
      "## Provenance Check",
      "",
      "Fixture provenance check.",
      "",
      "## Source Trace",
      "",
      "Fixture source trace.",
      "",
      "## Missing Facts",
      "",
      "Fixture missing facts.",
      "",
      "## Closeout Impact",
      "",
      "Closeout is still blocked pending later lifecycle review.",
      "",
      "## Recommendation",
      "",
      "BLOCKED",
      ""
    ].join("\n")
  );

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "DELIVERY_FACTS_REVIEW_REQUIRED");
  assert.equal(output.get("missing_evidence"), "[\"delivery-facts-review\"]");

  const recordDeliveryFactsReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "delivery-facts-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/delivery-facts-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordDeliveryFactsReview, "record delivery-facts-review");
  assert.match(recordDeliveryFactsReview.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "CLOSEOUT_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "phase-closeout-review");
});

test("phase 23.8.6 record-procedure ingests phase-closeout-review and leaves only the closeout receipt missing", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-phase-closeout-review-");
  const run = buildPostVerificationRun(runtimeModule, tempRepo, "run-0001");

  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "delivery-facts-review",
    [
      "## Delivery Facts Reviewed",
      "",
      "- `pr`: unknown",
      "",
      "## Provenance Check",
      "",
      "Fixture provenance check.",
      "",
      "## Source Trace",
      "",
      "Fixture source trace.",
      "",
      "## Missing Facts",
      "",
      "Fixture missing facts.",
      "",
      "## Closeout Impact",
      "",
      "Closeout is still blocked pending lifecycle receipt.",
      "",
      "## Recommendation",
      "",
      "BLOCKED",
      ""
    ].join("\n")
  );
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "phase-closeout-review",
    [
      "## Recommendation",
      "",
      "BLOCKED",
      ""
    ].join("\n")
  );

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "delivery-facts-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/delivery-facts-review.md`
    ],
    { cwd: tempRepo }
  ), "record delivery-facts-review before phase-closeout-review");

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "CLOSEOUT_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "phase-closeout-review");

  const recordCloseoutReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "phase-closeout-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/phase-closeout-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordCloseoutReview, "record phase-closeout-review");
  assert.match(recordCloseoutReview.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "CLOSEOUT_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "none");
  assert.equal(output.get("missing_evidence"), "[\"ready closeout receipt\"]");
});

test("phase 23.8.6 delivery-facts import keeps unknown review placeholders out of runtime review results", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-review-placeholder-import-");
  const run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  const importPath = path.join(tempRepo, "delivery-facts-review-placeholder.json");
  writeText(
    importPath,
    `${JSON.stringify(
      {
        facts: [
          {
            fact_kind: "review",
            source: "self-hosting",
            status: "unknown",
            recorded_at: "2026-06-24T00:20:00.000Z",
            summary: "Remote review is not recorded yet."
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const importResult = runCli(
    ["memory", "delivery-facts", "import", "--run", run.run_id, "--file", path.basename(importPath)],
    { cwd: tempRepo }
  );
  assertSuccess(importResult, "import delivery-facts review placeholder");

  const runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.delivery_facts.length, 1);
  assert.equal(runtimeState.delivery_facts[0].fact_kind, "review");
  assert.equal(runtimeState.review_results.length, 0);
});

test("phase 23.8.6 delivery-facts replay removes stale imported unknown review results", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-review-placeholder-replay-");
  const factIdentity = JSON.stringify({
    blockers: [],
    commit_sha: null,
    excerpt_hash: null,
    external_run_id: null,
    fact_kind: "review",
    gate_id: null,
    metadata: null,
    name: null,
    recorded_at: "2026-06-24T00:20:00.000Z",
    required: null,
    source: "self-hosting",
    status: "unknown",
    summary: "Remote review is not recorded yet.",
    url: null
  });
  const deliveryFactId = `delivery-${createHash("sha256").update(factIdentity).digest("hex").slice(0, 24)}`;
  const staleReviewResultId = `review-import-${deliveryFactId.slice(0, 24)}`;
  const run = {
    ...createBaseRun(runtimeModule, tempRepo, "run-0001"),
    review_results: [
      {
        review_result_id: staleReviewResultId,
        status: "UNKNOWN",
        created_at: "2026-06-24T00:20:00.000Z",
        summary: "Remote review is not recorded yet.",
        source: "delivery:self-hosting",
        blockers: [],
        artifact_refs: []
      }
    ]
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  const importPath = path.join(tempRepo, "delivery-facts-review-placeholder-replay.json");
  writeText(
    importPath,
    `${JSON.stringify(
      {
        facts: [
          {
            fact_kind: "review",
            source: "self-hosting",
            status: "unknown",
            recorded_at: "2026-06-24T00:20:00.000Z",
            summary: "Remote review is not recorded yet."
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const importResult = runCli(
    ["memory", "delivery-facts", "import", "--run", run.run_id, "--file", path.basename(importPath)],
    { cwd: tempRepo }
  );
  assertSuccess(importResult, "replay delivery-facts review placeholder");

  const runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.delivery_facts.length, 1);
  assert.equal(runtimeState.review_results.length, 0);
});

test("phase 23.8.6A record-procedure ingests early-chain procedures and advances operator status monotonically", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386ARepo("codex-harness-phase23-8-6a-early-chain-");
  const run = createBaseRun23_8_6A(runtimeModule, tempRepo, "run-0001");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeProcedureArtifact(tempRepo, run.run_id, "task-intake", "# task-intake\n");
  writeProcedureArtifact(tempRepo, run.run_id, "task-prompt-writer", "# task-prompt-writer\n");
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# draft-plan\n");

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "TASK_INTAKE_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "task-intake");

  const recordTaskIntake = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "task-intake",
      "--file",
      `.harness/runs/${run.run_id}/manual/task-intake.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordTaskIntake, "record task-intake in 23.8.6A");
  assert.match(recordTaskIntake.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "TASK_PROMPT_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "task-prompt-writer");

  const recordTaskPrompt = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "task-prompt-writer",
      "--file",
      `.harness/runs/${run.run_id}/manual/task-prompt-writer.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordTaskPrompt, "record task-prompt-writer in 23.8.6A");
  assert.match(recordTaskPrompt.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_DRAFT_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "draft-plan");

  const recordDraftPlan = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "draft-plan",
      "--file",
      `.harness/runs/${run.run_id}/manual/draft-plan.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordDraftPlan, "record draft-plan in 23.8.6A");
  assert.match(recordDraftPlan.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "plan-review");
});

test("phase 23.8.6A record-procedure rejects excluded and unknown procedures outside the approved ingestion scope", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386ARepo("codex-harness-phase23-8-6a-scope-guard-");
  const run = createBaseRun23_8_6A(runtimeModule, tempRepo, "run-0001");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeProcedureArtifact(tempRepo, run.run_id, "feature-decomposition", "# feature-decomposition\n");
  writeProcedureArtifact(tempRepo, run.run_id, "docs-consistency-review", "# docs-consistency-review\n");
  writeProcedureArtifact(tempRepo, run.run_id, "harness-audit", "# harness-audit\n");

  for (const procedureId of ["feature-decomposition", "docs-consistency-review", "harness-audit"]) {
    const result = runCli(
      [
        "run",
        "record-procedure",
        "--run",
        run.run_id,
        "--procedure",
        procedureId,
        "--file",
        `.harness/runs/${run.run_id}/manual/${procedureId}.md`
      ],
      { cwd: tempRepo }
    );
    assertFailure(result, `record ${procedureId} outside approved 23.8.6A scope`);
    assert.match(result.stderr, /outside the Phase 23\.8\.6A replay and re-ingestion scope/i);
  }

  const unknownProcedure = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "unknown-procedure",
      "--file",
      `.harness/runs/${run.run_id}/manual/feature-decomposition.md`
    ],
    { cwd: tempRepo }
  );
  assertFailure(unknownProcedure, "record unknown procedure id");
  assert.match(unknownProcedure.stderr, /Unknown self-hosting procedure id/i);
});

test("phase 23.8.6A approve-plan records and replays explicit amended-plan approval in the active task context", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386ARepo("codex-harness-phase23-8-6a-approve-plan-");
  const run = createBaseRun23_8_6A(runtimeModule, tempRepo, "run-0001");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeProcedureArtifact(tempRepo, run.run_id, "task-intake", "# task-intake\n");
  writeProcedureArtifact(tempRepo, run.run_id, "task-prompt-writer", "# task-prompt-writer\n");
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# draft-plan\n");
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", "# approved plan\n");

  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan", "plan-review", "plan-amend"]) {
    const fileName = procedureId === "plan-review"
      ? "plan-review-amended-8.md"
      : procedureId === "plan-amend"
        ? "plan-amend-8.md"
        : `${procedureId}.md`;
    assertSuccess(runCli(
      [
        "run",
        "record-procedure",
        "--run",
        run.run_id,
        "--procedure",
        procedureId,
        "--file",
        `.harness/runs/${run.run_id}/manual/${fileName}`
      ],
      { cwd: tempRepo }
    ), `record ${procedureId} before 23.8.6A plan approval`);
  }

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_APPROVAL_REQUIRED");

  const approvePlan = runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/plan-amend-8.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  );
  assertSuccess(approvePlan, "approve reviewed amended plan in 23.8.6A");
  assert.match(approvePlan.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");

  const replayApproval = runCli(
    [
      "run",
      "approve-plan",
      "--run",
      run.run_id,
      "--plan",
      `.harness/runs/${run.run_id}/manual/plan-amend-8.md`,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed implementation plan."
    ],
    { cwd: tempRepo }
  );
  assertSuccess(replayApproval, "replay approved amended plan in 23.8.6A");
  assert.match(replayApproval.stdout, /recorded: false/);
});

test("phase 23.8.6A approve-plan replay backfills missing derived approval state without duplicating evidence", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386ARepo("codex-harness-phase23-8-6a-approve-plan-backfill-");
  const run = createBaseRun23_8_6A(runtimeModule, tempRepo, "run-0001");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeProcedureArtifact(tempRepo, run.run_id, "task-intake", "# task-intake\n");
  writeProcedureArtifact(tempRepo, run.run_id, "task-prompt-writer", "# task-prompt-writer\n");
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan", "# draft-plan\n");
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", "# approved plan\n");

  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan", "plan-review", "plan-amend"]) {
    const fileName = procedureId === "plan-review"
      ? "plan-review-amended-8.md"
      : procedureId === "plan-amend"
        ? "plan-amend-8.md"
        : `${procedureId}.md`;
    assertSuccess(runCli(
      [
        "run",
        "record-procedure",
        "--run",
        run.run_id,
        "--procedure",
        procedureId,
        "--file",
        `.harness/runs/${run.run_id}/manual/${fileName}`
      ],
      { cwd: tempRepo }
    ), `record ${procedureId} before 23.8.6A approval backfill test`);
  }

  const approvePlanArgs = [
    "run",
    "approve-plan",
    "--run",
    run.run_id,
    "--plan",
    `.harness/runs/${run.run_id}/manual/plan-amend-8.md`,
    "--approver",
    "owner",
    "--reason",
    "Human approved the reviewed implementation plan."
  ];
  assertSuccess(runCli(approvePlanArgs, { cwd: tempRepo }), "seed reviewed amended plan approval in 23.8.6A");

  let runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  const approvedPlanEvidenceCount = runtimeState.evidence.filter((entry) => entry.kind === "approved-plan").length;
  const approvedPlanArtifactCount = runtimeState.artifacts.filter((entry) => entry.kind === "approved-plan-artifact").length;
  assert.equal(runtimeState.approvals.length, 1);

  runtimeState = {
    ...runtimeState,
    approvals: [],
    updated_at: "2026-06-24T00:17:00.000Z"
  };
  runtimeModule.validateRuntimeRun(runtimeState);
  writeRuntimeRunFixture(tempRepo, runtimeState);

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_APPROVAL_REQUIRED");

  const backfillApproval = runCli(approvePlanArgs, { cwd: tempRepo });
  assertSuccess(backfillApproval, "backfill reviewed amended plan approval in 23.8.6A");
  assert.match(backfillApproval.stdout, /recorded: true/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");

  runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.approvals.length, 1);
  assert.equal(runtimeState.evidence.filter((entry) => entry.kind === "approved-plan").length, approvedPlanEvidenceCount);
  assert.equal(runtimeState.artifacts.filter((entry) => entry.kind === "approved-plan-artifact").length, approvedPlanArtifactCount);
});

test("phase 23.8.6A record-procedure replay backfills a newly supported architecture-review result without duplicate evidence", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386ARepo("codex-harness-phase23-8-6a-architecture-review-");
  const architectureReviewContent = ["## Recommendation", "", "PASS", ""].join("\n");
  const architectureReviewHash = createHash("sha256").update(architectureReviewContent).digest("hex");
  let run = createBaseRun23_8_6A(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "architecture-review", 1);
  run = {
    ...run,
    artifacts: [
      ...run.artifacts,
      {
        artifact_id: `sha256:${architectureReviewHash}`,
        path: "evidence/architecture-review-1.md",
        kind: "procedure-artifact:architecture-review"
      }
    ],
    evidence: run.evidence.map((entry) => entry.kind === "procedure:architecture-review"
      ? { ...entry, artifact_id: `sha256:${architectureReviewHash}`, path: "evidence/architecture-review-1.md" }
      : entry)
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/architecture-review-1.md", architectureReviewContent, 0);
  writeProcedureArtifact(tempRepo, run.run_id, "architecture-review", architectureReviewContent);

  const replayArchitectureReview = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "architecture-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/architecture-review.md`
    ],
    { cwd: tempRepo }
  );
  assertSuccess(replayArchitectureReview, "replay architecture-review for backfill");
  assert.match(replayArchitectureReview.stdout, /recorded: false/);

  const runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.evidence.filter((entry) => entry.kind === "procedure:architecture-review").length, 1);
  assert.equal(runtimeState.review_results.some((entry) => entry.source === "procedure:architecture-review"), true);
});

test("phase 23.8.6A recovered run can continue through closeout and harvest when evidence is already present", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386ARepo("codex-harness-phase23-8-6a-closeout-harvest-");
  const run = buildPostVerificationRun23_8_6A(runtimeModule, tempRepo, "run-0001");

  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "delivery-facts-review",
    [
      "## Delivery Facts Reviewed",
      "",
      "- `pr`: created",
      "- `remote_ci`: pass",
      "- `merge_result`: merged",
      "- `merge_commit`: merged",
      "",
      "## Recommendation",
      "",
      "PASS",
      ""
    ].join("\n")
  );
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "phase-closeout-review",
    [
      "## Recommendation",
      "",
      "PASS",
      ""
    ].join("\n")
  );

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "delivery-facts-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/delivery-facts-review.md`
    ],
    { cwd: tempRepo }
  ), "record delivery-facts-review in 23.8.6A continuity case");

  assertSuccess(runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "phase-closeout-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/phase-closeout-review.md`
    ],
    { cwd: tempRepo }
  ), "record phase-closeout-review in 23.8.6A continuity case");

  let output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "CLOSEOUT_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "none");
  assert.equal(output.get("missing_evidence"), "[\"ready closeout receipt\"]");

  const closeout = runCli(["run", "closeout", "--run", run.run_id], { cwd: tempRepo });
  assertSuccess(closeout, "run closeout in 23.8.6A continuity case");
  assert.match(closeout.stdout, /closeout: READY/);

  output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "HARVEST_READY");
  assert.equal(output.get("next_procedure_id"), "none");

  const harvest = runCli(["memory", "harvest", "--run", run.run_id], { cwd: tempRepo });
  assertSuccess(harvest, "memory harvest in 23.8.6A continuity case");
  assert.match(harvest.stdout, /already harvested: false/);
  assert.match(harvest.stdout, /harvest status: promoted/);
});

test("phase 23.8.6 closeout blocks until merged merge_result and merge_commit facts exist", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-closeout-merge-");
  let run = buildPostVerificationRun(runtimeModule, tempRepo, "run-0001");
  run = {
    ...run,
    delivery_facts: [
      {
        delivery_fact_id: "delivery-pr",
        run_id: run.run_id,
        fact_kind: "pr",
        source: "self-hosting",
        status: "unknown",
        recorded_at: "2026-06-24T00:16:00.000Z",
        summary: "PR is not created yet."
      },
      {
        delivery_fact_id: "delivery-merge-commit",
        run_id: run.run_id,
        fact_kind: "merge_commit",
        source: "self-hosting",
        status: "unknown",
        recorded_at: "2026-06-24T00:16:10.000Z",
        summary: "Merge commit is not recorded yet."
      }
    ],
    updated_at: "2026-06-24T00:16:10.000Z"
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  const closeout = runCli(["run", "closeout", "--run", run.run_id], { cwd: tempRepo });
  assertSuccess(closeout, "run closeout with missing merge facts");

  const receipt = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "closeout.json"), "utf8"));
  assert.equal(receipt.status, "BLOCKED");
  assert.match(receipt.blockers.join("\n"), /missing_merge_result/);
  assert.match(receipt.blockers.join("\n"), /missing_merge_commit/);
});

test("phase 23.8.6 record-next-task and materialize-next-task create a new task-owned worktree and run", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-materialize-next-task-");
  const nextTaskPath = "tasks/PHASE_23_8_7_PACKET_RESULT_LIFECYCLE_CONTRACT.md";
  writeText(
    path.join(tempRepo, nextTaskPath),
    [
      "# Phase 23.8.7 - Packet / Result Lifecycle Contract",
      "",
      "## Acceptance commands",
      "",
      "```bash",
      "npm run build",
      "```",
      ""
    ].join("\n")
  );
  assertSuccess(runCommand("git", ["add", nextTaskPath], { cwd: tempRepo }), "git add next task");
  assertSuccess(runCommand("git", ["commit", "-m", "add next task"], { cwd: tempRepo }), "git commit next task");

  const run = buildClosedRun(runtimeModule, tempRepo, "run-0001");
  const sourceArtifactPath = writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "next-task-decision",
    "Next task should be Phase 23.8.7.\n"
  );

  const recordDecision = runCli(
    [
      "run",
      "record-next-task",
      "--run",
      run.run_id,
      "--task",
      nextTaskPath,
      "--base-commit",
      gitHead(tempRepo),
      "--file",
      path.relative(tempRepo, sourceArtifactPath)
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordDecision, "run record-next-task");
  const recorded = parseOperatorOutput(recordDecision.stdout);
  const decisionId = recorded.get("decision id");
  assert.ok(decisionId, "next-task decision id should be reported");

  const worktreePath = path.join(path.dirname(tempRepo), `${path.basename(tempRepo)}-next-task-worktree`);
  tempDirectories.push(worktreePath);

  const materialize = runCli(
    [
      "run",
      "materialize-next-task",
      "--run",
      run.run_id,
      "--decision-id",
      decisionId,
      "--task",
      nextTaskPath,
      "--branch",
      "task/phase-23-8-7-packet-result-lifecycle-contract",
      "--worktree",
      worktreePath,
      "--create"
    ],
    { cwd: tempRepo }
  );
  assertSuccess(materialize, "run materialize-next-task --create");
  assert.match(materialize.stdout, /created: true/);
  assert.equal(fs.existsSync(worktreePath), true, "materialized worktree should exist");

  const newTaskPointer = fs.readFileSync(path.join(worktreePath, "TASK.md"), "utf8");
  assert.match(newTaskPointer, new RegExp(`Implement only: ${nextTaskPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  const newCurrentRun = JSON.parse(fs.readFileSync(path.join(worktreePath, ".harness", "runs", "current.json"), "utf8"));
  const newRun = JSON.parse(
    fs.readFileSync(path.join(worktreePath, ".harness", "runs", newCurrentRun.run_id, "run.json"), "utf8")
  );
  assert.equal(newRun.task_path, "TASK.md");
  assert.equal(newRun.active_task_path, nextTaskPath);
  assert.equal(newRun.phase_id, "23.8.7");
});
