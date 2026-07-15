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
const ACTIVE_TASK_23_8_6B2_PATH = "tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md";
const ACTIVE_TASK_23_8_6C2A_PATH = "tasks/PHASE_23_8_6C2A_COMMIT_BACKED_TASK_MATERIALIZATION_AND_ENVIRONMENT_BOOTSTRAP.md";
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

function activeTask23_8_6B2Markdown() {
  return [
    "# Phase 23.8.6B2 - Verification Command Rationalization and Serialization",
    "",
    "## Scope",
    "",
    "This is a narrow verification-policy and authority-surface phase.",
    "",
    "## Non-goals",
    "",
    "- No runtime feature implementation.",
    "- No package-script changes.",
    "- No CI changes.",
    "- No acceptance-runner code changes.",
    "",
    "## Source/runtime boundary",
    "",
    "This phase is docs/task/verification-guidance authority only. It must not",
    "change runtime code, package scripts, CI, or acceptance-runner behavior.",
    "",
    "## Acceptance commands",
    "",
    "```bash",
    "git diff --check",
    "```",
    ""
  ].join("\n");
}

function readProductText(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

function writeSuccessorBootstrapSurfaces(tempRepo) {
  fs.mkdirSync(path.join(tempRepo, "bin"), { recursive: true });
  writeText(path.join(tempRepo, "AGENTS.md"), "# Fixture instructions\n");
  writeText(path.join(tempRepo, "bin", "ch"), "#!/bin/sh\nexit 0\n");
  writeText(path.join(tempRepo, ".gitignore"), ".harness/\nnode_modules/\ndist/\n");
  writeText(
    path.join(tempRepo, "package.json"),
    `${JSON.stringify({
      name: "successor-bootstrap-fixture",
      version: "1.0.0",
      private: true,
      scripts: {
        "worktree:bootstrap": "npm ci && npm run build",
        build: "node -e \"const fs = require('node:fs'); fs.mkdirSync('node_modules', { recursive: true }); fs.mkdirSync('dist/cli', { recursive: true }); fs.writeFileSync('dist/cli/index.js', 'module.exports = {};\\n');\""
      }
    }, null, 2)}\n`
  );
  writeText(
    path.join(tempRepo, "package-lock.json"),
    `${JSON.stringify({
      name: "successor-bootstrap-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "successor-bootstrap-fixture",
          version: "1.0.0"
        }
      }
    }, null, 2)}\n`
  );
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

function createPhase2386B2Repo(prefix) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6B2\n");
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
      `Implement only: ${ACTIVE_TASK_23_8_6B2_PATH}`,
      "",
      "Do not implement Phase 23.8.6C or later.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, ACTIVE_TASK_23_8_6B2_PATH), activeTask23_8_6B2Markdown());
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6B2 — Verification Command Rationalization and Serialization",
      "",
      "Task:",
      `\`${ACTIVE_TASK_23_8_6B2_PATH}\``,
      ""
    ].join("\n")
  );

  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });

  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add phase 23.8.6B2 scaffold");
  assertSuccess(runCommand("git", ["commit", "-m", "phase 23.8.6B2 scaffold"], { cwd: tempRepo }), "git commit scaffold");

  return tempRepo;
}

function createPhase2386C2ARepo(prefix) {
  const tempRepo = createPhase2386ARepo(prefix);
  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${ACTIVE_TASK_23_8_6C2A_PATH}`,
      "",
      "Do not implement Phase 23.8.6D or later.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, ACTIVE_TASK_23_8_6C2A_PATH), readProductText(ACTIVE_TASK_23_8_6C2A_PATH));
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6C2A — Commit-Backed Task Materialization and Environment Bootstrap",
      "",
      "Task:",
      `\`${ACTIVE_TASK_23_8_6C2A_PATH}\``,
      ""
    ].join("\n")
  );
  assertSuccess(runCommand("git", ["add", "TASK.md", ACTIVE_TASK_23_8_6C2A_PATH, "docs/IMPLEMENTATION_ROADMAP.md"], { cwd: tempRepo }), "git add C2A stage fixture");
  assertSuccess(runCommand("git", ["commit", "-m", "phase 23.8.6C2A stage fixture"], { cwd: tempRepo }), "git commit C2A stage fixture");
  return tempRepo;
}

function createPhase2386B2AuthorityBaselineRepo(prefix) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);

  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });

  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6B1\n");
  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      "Implement only: tasks/PHASE_23_8_6B1_SUPERVISED_REVIEW_LAUNCH_AND_BLOCKED_DISPOSITION.md",
      "",
      "Do not implement Phase 23.8.6B2 or later.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, ACTIVE_TASK_23_8_6B2_PATH), "# planned B2 task\n");
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6B1 — Supervised Review Launch and Blocked Disposition",
      "",
      "Status:",
      "Active implementation phase.",
      "",
      "## Phase 23.8.6B2 — Verification Command Rationalization and Serialization",
      "",
      "Status:",
      "Planned. Blocked until Phase 23.8.6B1 is complete, reviewed, accepted, and merged.",
      ""
    ].join("\n")
  );
  writeText(path.join(tempRepo, "docs", "PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md"), "# platform old\n");
  writeText(path.join(tempRepo, "docs", "RELEASE_AND_SUPPLY_CHAIN_SECURITY.md"), "# release old\n");
  writeText(path.join(tempRepo, "docs", "SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md"), "# plan review old\n");
  writeText(path.join(tempRepo, "tasks", "PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md"), "# b2c old\n");
  writeText(path.join(tempRepo, "tasks", "PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md"), "# b2e old\n");

  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });
  writeText(path.join(tempRepo, "skills", "self-hosting", "phase-closeout-review", "SKILL.md"), "# closeout old\n");

  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add phase 23.8.6B2 authority baseline");
  assertSuccess(runCommand("git", ["commit", "-m", "phase 23.8.6B2 authority baseline"], { cwd: tempRepo }), "git commit authority baseline");

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

function createBaseRun23_8_6B2(runtimeModule, tempRepo, runId) {
  return createBaseRunForTask(runtimeModule, tempRepo, runId, ACTIVE_TASK_23_8_6B2_PATH, "23.8.6B2");
}

function createBaseRun23_8_6C2A(runtimeModule, tempRepo, runId) {
  return createBaseRunForTask(runtimeModule, tempRepo, runId, ACTIVE_TASK_23_8_6C2A_PATH, "23.8.6C2A");
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

function buildPhase2386B2DocsOnlyPlanAmendArtifact() {
  return [
    "## Effective Plan Status",
    "",
    "approved",
    "",
    "## Allowed Authority Surfaces",
    "",
    "- `TASK.md`",
    "- `README.md`",
    "- `docs/IMPLEMENTATION_ROADMAP.md`",
    "- `docs/PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md`",
    "- `tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md`",
    "- `tasks/PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md`",
    "- `skills/self-hosting/phase-closeout-review/SKILL.md`",
    "",
    "## Scope Notes",
    "",
    "- Update the active B2 task and roadmap surfaces as needed.",
    "- Inspect near downstream planned/future task contracts only where this B2 slice requires it.",
    "- Keep this pass docs/task/policy authority only.",
    ""
  ].join("\n");
}

function buildPhase2386B2MentionOnlyFuturePhasePlanAmendArtifact() {
  return [
    "## Effective Plan Status",
    "",
    "approved",
    "",
    "## Allowed Authority Surfaces",
    "",
    "- `TASK.md`",
    "- `README.md`",
    "- `docs/PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md`",
    "- `tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md`",
    "",
    "## Scope Notes",
    "",
    "- Keep this pass docs/task/policy authority only.",
    "- Inspect near downstream planned/future task contracts only where this B2 slice requires it.",
    "- Relationship notes may mention Phase `23.8.6C`, but that mention alone does not approve its task file as an implementation surface.",
    ""
  ].join("\n");
}

function buildPhase2386B2NonApprovedExplicitPathPlanAmendArtifact() {
  return [
    "## Effective Plan Status",
    "",
    "approved",
    "",
    "## Allowed Authority Surfaces",
    "",
    "- `TASK.md`",
    "- `tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md`",
    "",
    "## Effective Scope",
    "",
    "- Keep this pass docs/task/policy authority only.",
    "",
    "## Background Notes",
    "",
    "- Historical notes may still reference `skills/self-hosting/phase-closeout-review/SKILL.md`, but that path is not part of the approved implementation surface for this test.",
    ""
  ].join("\n");
}

function buildPhase2386B2SupersededDraftPlanArtifact() {
  return [
    "## Included",
    "",
    "- `TASK.md`",
    "- `tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md`",
    "- `skills/self-hosting/phase-closeout-review/SKILL.md`",
    "",
    "## Risks And Open Questions",
    "",
    "- This draft is superseded once an amended or approved plan exists.",
    ""
  ].join("\n");
}

function buildPhase2386B2CurrentApprovedPlanAmendArtifact() {
  return [
    "## Review Finding Disposition",
    "",
    "- Finding 1: incomplete live-surface classification for `.github/workflows/ci.yml` and `README.md` — accepted.",
    "  Resolution:",
    "  - `README.md` is treated as live/current docs authority and must be inspected and updated in B2 if it implies separate proof rather than shared-runner compatibility.",
    "  - `.github/workflows/ci.yml` is treated as live current operational behavior that must be inspected and explicitly classified, but not edited in B2 because the active task forbids CI changes.",
    "  - The implementation report must state that CI still runs both aliases today if that remains true after the pass, and that this B2 slice changes authority wording only.",
    "",
    "- Finding 2: missing skill-risk classification for `skills/self-hosting/phase-closeout-review/SKILL.md` — accepted.",
    "  Resolution:",
    "  - Keep the existing `phase-closeout-review` skill edit in scope as a narrow B2 authority correction because it prevents stale active/blocked phase-status drift from surviving closeout freshness review.",
    "  - Do not broaden that skill change into procedure redesign, runtime enforcement, or unrelated workflow edits.",
    "",
    "## Effective Plan Status",
    "",
    "This amended plan supersedes `.harness/runs/run-0001/manual/draft-plan.md` for execution in `run-0001`.",
    "",
    "Recommended path remains docs/task/policy authority only.",
    "",
    "No real operator choice remains for the next execution path:",
    "",
    "- inspect hidden and top-level live authority surfaces;",
    "- edit live/current docs and immediate planned/future task contracts only where B2 requires it;",
    "- leave CI behavior unchanged;",
    "- keep the `phase-closeout-review` skill tweak only as the already-bounded freshness correction.",
    "",
    "## Effective Scope",
    "",
    "- Keep B2 limited to verification-policy and authority-surface wording.",
    "- Treat `npm test` as the canonical full-pack verification command for required proof.",
    "- Treat `npm run test:acceptance` as a compatibility alias only.",
    "- Preserve the repo fact that both aliases still map to `node scripts/run-acceptance.mjs`, and that the runner invokes Node with `--test-concurrency=1`.",
    "- Inspect and classify `README.md` and `.github/workflows/ci.yml` explicitly.",
    "- Update `README.md` if its wording currently implies separate required proof rather than shared-runner compatibility.",
    "- Do not edit `.github/workflows/ci.yml` in B2; classify it as current operational behavior and report it as untouched when appropriate.",
    "- Keep the current `phase-closeout-review` skill edit only as a narrow authority-freshness correction tied to this exact stale-status failure mode.",
    "- Leave historical accepted task history and old test fixtures broadly untouched unless one of them still acts as live authority for this phase.",
    "",
    "## Effective Steps",
    "",
    "1. Re-run the alias/serialization search including hidden workflow and top-level doc surfaces, then classify each hit as:",
    "   - live/current docs authority to update now;",
    "   - live current operational behavior to inspect/report only;",
    "   - immediate planned/future task authority to update now; or",
    "   - historical accepted context to leave untouched.",
    "",
    "2. Update the active B2 task and roadmap surfaces as needed so they remain aligned with the canonical-command rule and no-concurrent-alias rule.",
    "",
    "3. Inspect `README.md`.",
    "   - If it only states the current shared-runner fact, keep it.",
    "   - If it implies separate required proof, patch it so it reflects canonical `npm test`, compatibility-alias `npm run test:acceptance`, and any untouched CI behavior accurately.",
    "",
    "4. Inspect `.github/workflows/ci.yml`.",
    "   - Record it as current operational behavior if it still runs both aliases.",
    "   - Do not edit it in B2.",
    "   - If its existence creates a documentation contradiction, resolve that contradiction in docs/reporting rather than by changing CI.",
    "",
    "5. Inspect near downstream planned/future task contracts and live docs for duplicate-proof wording.",
    "   - Patch only the immediate planned/future authority surfaces that still contradict B2.",
    "   - Do not broaden into older phases or unrelated future tasks.",
    "",
    "6. Preserve the existing `skills/self-hosting/phase-closeout-review/SKILL.md` change only as a narrow freshness/authority safeguard.",
    "   - Do not add more procedure/skill changes unless a touched live authority surface would otherwise remain inconsistent.",
    "",
    "7. Validate with `git diff --check`.",
    "   - Run `npm test` once only if a touched live/current sentence cannot be justified from repo-owned evidence alone.",
    "   - Otherwise state explicitly that full-pack execution was unnecessary for this docs-only pass.",
    ""
  ].join("\n");
}

function buildPhase2386B2CurrentTaskPointerMarkdown() {
  return [
    "# Current Task",
    "",
    `Implement only: ${ACTIVE_TASK_23_8_6B2_PATH}`,
    "",
    "Do not implement Phase 23.8.6C or later.",
    ""
  ].join("\n");
}

function buildPhase2386B2CurrentRoadmapMarkdown() {
  return [
    "## Phase 23.8.6B2 — Verification Command Rationalization and Serialization",
    "",
    "Task:",
    `\`${ACTIVE_TASK_23_8_6B2_PATH}\``,
    "",
    "Status:",
    "Active implementation phase.",
    "",
    "## Phase 23.8.6C — Minimum Self-Hosting Orchestrator Entrypoint",
    "",
    "Task:",
    "`tasks/PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md`",
    "",
    "Status:",
    "Planned.",
    "",
    "## Phase 23.8.6E — Authority Surface Freshness And Downstream Task Revalidation",
    "",
    "Task:",
    "`tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md`",
    "",
    "Status:",
    "Planned.",
    ""
  ].join("\n");
}

function applyCurrentB2OnlyAuthorityDiff(tempRepo) {
  const currentPaths = [
    "README.md",
    "docs/PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md",
    "docs/RELEASE_AND_SUPPLY_CHAIN_SECURITY.md",
    "docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md",
    "skills/self-hosting/phase-closeout-review/SKILL.md",
    "tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md",
    "tasks/PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md",
    "tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md"
  ];

  for (const relativePath of currentPaths) {
    const absolutePath = path.join(tempRepo, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeText(absolutePath, readProductText(relativePath));
  }

  writeText(path.join(tempRepo, "TASK.md"), buildPhase2386B2CurrentTaskPointerMarkdown());
  writeText(path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"), buildPhase2386B2CurrentRoadmapMarkdown());
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

test("phase 23.8.6 stores authoritative procedure bodies and reconstructs them from project memory without markdown", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-procedure-payload-");
  let run = createBaseRun(runtimeModule, tempRepo, "run-0001");
  run = { ...run, phase_id: "23.8.6D" };
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);

  const draftPlanBody = "# draft-plan\n";
  const draftPlanHash = createHash("sha256").update(draftPlanBody).digest("hex");
  writeProcedureArtifact(tempRepo, run.run_id, "draft-plan-payload", draftPlanBody);
  assertSuccess(runCli([
    "run", "record-procedure", "--run", run.run_id, "--procedure", "draft-plan",
    "--file", `.harness/runs/${run.run_id}/manual/draft-plan-payload.md`
  ], { cwd: tempRepo }), "record exact durable draft-plan body");

  const body = buildPlanReviewArtifact();
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-payload", body);
  const recorded = runCli([
    "run", "record-procedure", "--run", run.run_id, "--procedure", "plan-review",
    "--file", `.harness/runs/${run.run_id}/manual/plan-review-payload.md`
  ], { cwd: tempRepo });
  assertSuccess(recorded, "record authoritative procedure body");
  assertSuccess(runCli([
    "run", "approve-plan", "--run", run.run_id,
    "--plan", `.harness/runs/${run.run_id}/evidence/draft-plan-${draftPlanHash.slice(0, 12)}.md`,
    "--approver", "owner",
    "--reason", "Human approved the exact reviewed plan."
  ], { cwd: tempRepo }), "approve exact durable reviewed plan");

  const { RunStagingDatabase, resolveHarnessRoots } = require(path.join(productRoot, "dist", "core", "run-staging-db.js"));
  const { harvestRun } = require(path.join(productRoot, "dist", "core", "harvest.js"));
  const { ProjectMemoryDatabase } = require(path.join(productRoot, "dist", "core", "project-memory-db.js"));
  const roots = resolveHarnessRoots(tempRepo);
  const staging = new RunStagingDatabase(tempRepo, roots.projectRoot, run.run_id);
  let storedRun = staging.loadRun(run.run_id);
  assert.ok(storedRun?.run_instance_id, "recorded run has an exact immutable identity");

  const sqlite = require("node:sqlite");
  const database = new sqlite.DatabaseSync(staging.paths.stagingDbPath, { readOnly: true });
  const descriptor = database.prepare(
    "SELECT procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json, reviewed_plan_artifact_id, reviewed_plan_content_hash FROM procedure_artifacts WHERE procedure_id = ?"
  ).get("plan-review");
  const payload = database.prepare(
    "SELECT kind, source_run_id, content_hash, chunk_count FROM payload_index WHERE payload_id = ?"
  ).get(descriptor.payload_id);
  database.close();
  assert.equal(descriptor.procedure_id, "plan-review");
  assert.match(descriptor.artifact_id, /^sha256:/);
  assert.equal(descriptor.content_hash, descriptor.artifact_id.slice("sha256:".length));
  assert.equal(payload.kind, "procedure-artifact-body:plan-review");
  assert.equal(payload.source_run_id, run.run_id);
  assert.equal(payload.content_hash, descriptor.content_hash);
  assert.ok(payload.chunk_count >= 1);
  const draftPlanEvidence = storedRun.evidence.find((entry) => entry.kind === "procedure:draft-plan");
  assert.ok(draftPlanEvidence?.artifact_id, "draft-plan has an exact immutable artifact identity");
  assert.equal(descriptor.reviewed_plan_artifact_id, draftPlanEvidence.artifact_id);
  assert.equal(descriptor.reviewed_plan_content_hash, draftPlanEvidence.artifact_id.slice("sha256:".length));
  const approval = storedRun.approvals.find((entry) => entry.title === "Reviewed plan approved");
  assert.equal(approval?.reviewed_plan_artifact_id, draftPlanEvidence.artifact_id);
  assert.equal(approval?.reviewed_plan_content_hash, draftPlanEvidence.artifact_id.slice("sha256:".length));
  assert.equal(approval?.reviewed_evidence_artifact_id, descriptor.artifact_id);

  const compatibilityArtifact = storedRun.artifacts.find((artifact) => artifact.artifact_id === descriptor.artifact_id);
  assert.ok(compatibilityArtifact, "run retains a non-authoritative compatibility artifact reference");
  storedRun = {
    ...storedRun,
    lifecycle_status: "closed",
    source_staging_db_path: staging.paths.stagingDbPath,
    delivery_facts: [
      {
        delivery_fact_id: "merge-result",
        run_id: run.run_id,
        fact_kind: "merge_result",
        source: "test",
        status: "merged",
        recorded_at: TIMESTAMP,
        summary: "fixture merged"
      },
      {
        delivery_fact_id: "merge-commit",
        run_id: run.run_id,
        fact_kind: "merge_commit",
        source: "test",
        status: "merged",
        recorded_at: TIMESTAMP,
        summary: "fixture merge commit",
        commit_sha: gitHead(tempRepo)
      }
    ]
  };
  staging.saveRun(storedRun);
  fs.rmSync(path.join(tempRepo, ".harness", "runs", run.run_id, compatibilityArtifact.path));
  harvestRun(tempRepo, roots.projectRoot, run.run_id);

  const project = new ProjectMemoryDatabase(tempRepo, roots.projectRoot);
  const reconstructed = project.readProcedureArtifactBody({
    projectRunId: storedRun.run_instance_id,
    procedureId: "plan-review",
    procedureArtifactId: descriptor.artifact_id
  });
  assert.equal(reconstructed.body, body);
  assert.equal(reconstructed.content_hash, descriptor.content_hash);
  assert.equal(reconstructed.procedure_id, "plan-review");
  assert.equal(reconstructed.reviewed_plan_artifact_id, draftPlanEvidence.artifact_id);
  assert.equal(reconstructed.reviewed_plan_content_hash, draftPlanEvidence.artifact_id.slice("sha256:".length));
  assert.throws(
    () => project.readProcedureArtifactBody({ projectRunId: "other-run-instance", procedureId: "plan-review", procedureArtifactId: descriptor.artifact_id }),
    /could not prove one exact descriptor/
  );
  assert.throws(
    () => project.readProcedureArtifactBody({ projectRunId: storedRun.run_instance_id, procedureId: "unknown-procedure", procedureArtifactId: descriptor.artifact_id }),
    /unresolved canonical procedure ID/
  );
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

test("phase 23.8.6 plan-review rejects non-canonical outcome_state tokens even when recommendation is PASS", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-plan-review-invalid-outcome-state-");
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
    "plan-review-invalid-outcome-state",
    buildPlanReviewArtifact().replace(
      "outcome_state: ready_for_implementation",
      "outcome_state: PLAN_ACCEPTABLE_AFTER_AMENDMENT"
    )
  );

  const invalidOutcomeState = runCli(
    [
      "run",
      "record-procedure",
      "--run",
      run.run_id,
      "--procedure",
      "plan-review",
      "--file",
      `.harness/runs/${run.run_id}/manual/plan-review-invalid-outcome-state.md`
    ],
    { cwd: tempRepo }
  );
  assertFailure(invalidOutcomeState, "record plan-review with invalid outcome_state token");
  assert.match(invalidOutcomeState.stderr, /durable decision record is internally inconsistent/i);

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

test("phase 23.8.6B2 docs/task-only phases treat allowed authority-surface diffs as implementation evidence after plan approval", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-docs-implementation-evidence-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2DocsOnlyPlanAmendArtifact());

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
  ), "record plan-review before docs-only implementation evidence");

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
  ), "record effective amended plan before docs-only implementation evidence");

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
  ), "approve reviewed plan before docs-only implementation evidence");

  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "skills", "self-hosting"), { recursive: true });
  writeText(path.join(tempRepo, "TASK.md"), "# Current Task\n\nImplement only: tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md\n\nDo not implement Phase 23.8.6C or later.\n");
  writeText(path.join(tempRepo, "README.md"), "# updated readme\n");
  writeText(path.join(tempRepo, "docs", "PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md"), "# platform\n");
  writeText(path.join(tempRepo, "tasks", "PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md"), "# downstream task\n");
  writeText(path.join(tempRepo, "skills", "self-hosting", "phase-closeout-review", "SKILL.md"), "# skill\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "implementation-review");
});

test("phase 23.8.6B2 docs/task-only phases do not advance on forbidden source changes", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-docs-forbidden-src-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2DocsOnlyPlanAmendArtifact());

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
  ), "record plan-review before forbidden source diff check");

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
  ), "record effective amended plan before forbidden source diff check");

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
  ), "approve reviewed plan before forbidden source diff check");

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "forbidden.ts"), "export const forbidden = true;\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 docs/task-only phases do not advance on forbidden CI changes", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-docs-forbidden-ci-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2DocsOnlyPlanAmendArtifact());

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
  ), "record plan-review before forbidden CI diff check");

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
  ), "record effective amended plan before forbidden CI diff check");

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
  ), "approve reviewed plan before forbidden CI diff check");

  fs.mkdirSync(path.join(tempRepo, ".github", "workflows"), { recursive: true });
  writeText(path.join(tempRepo, ".github", "workflows", "ci.yml"), "name: ci\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 docs/task-only phases do not advance on forbidden package-script changes", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-docs-forbidden-package-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2DocsOnlyPlanAmendArtifact());

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
  ), "record plan-review before forbidden package diff check");

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
  ), "record effective amended plan before forbidden package diff check");

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
  ), "approve reviewed plan before forbidden package diff check");

  writeText(path.join(tempRepo, "package.json"), "{\n  \"name\": \"forbidden\"\n}\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 docs/task-only phases do not advance on forbidden runner changes", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-docs-forbidden-runner-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2DocsOnlyPlanAmendArtifact());

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
  ), "record plan-review before forbidden runner diff check");

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
  ), "record effective amended plan before forbidden runner diff check");

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
  ), "approve reviewed plan before forbidden runner diff check");

  fs.mkdirSync(path.join(tempRepo, "scripts"), { recursive: true });
  writeText(path.join(tempRepo, "scripts", "run-acceptance.mjs"), "console.log('forbidden');\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 docs/task-only phases do not advance when a future phase task is only mentioned, not explicitly allowed", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-docs-mentioned-future-task-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(
    tempRepo,
    run.run_id,
    "plan-amend-8",
    buildPhase2386B2MentionOnlyFuturePhasePlanAmendArtifact()
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
  ), "record plan-review before mentioned future task diff check");

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
  ), "record effective amended plan before mentioned future task diff check");

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
  ), "approve reviewed plan before mentioned future task diff check");

  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  writeText(path.join(tempRepo, "tasks", "PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md"), "# downstream task\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 docs/task-only phases do not authorize explicit paths mentioned outside approved scope sections", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-non-approved-explicit-path-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2NonApprovedExplicitPathPlanAmendArtifact());

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
  ), "record plan-review before non-approved explicit path diff check");

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
  ), "record effective amended plan before non-approved explicit path diff check");

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
  ), "approve reviewed plan before non-approved explicit path diff check");

  fs.mkdirSync(path.join(tempRepo, "skills", "self-hosting", "phase-closeout-review"), { recursive: true });
  writeText(path.join(tempRepo, "skills", "self-hosting", "phase-closeout-review", "SKILL.md"), "# skill\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 docs/task-only phases ignore superseded draft-plan path mentions once an amended plan exists", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2Repo("codex-harness-phase23-8-6b2-superseded-draft-path-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", buildPhase2386B2SupersededDraftPlanArtifact(), 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2NonApprovedExplicitPathPlanAmendArtifact());

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
  ), "record plan-review before superseded draft-path diff check");

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
  ), "record effective amended plan before superseded draft-path diff check");

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
  ), "approve reviewed plan before superseded draft-path diff check");

  fs.mkdirSync(path.join(tempRepo, "skills", "self-hosting", "phase-closeout-review"), { recursive: true });
  writeText(path.join(tempRepo, "skills", "self-hosting", "phase-closeout-review", "SKILL.md"), "# skill\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 real B2-only changed-path set routes to implementation review against the approved B2 authority", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2AuthorityBaselineRepo("codex-harness-phase23-8-6b2-live-authority-proof-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2CurrentApprovedPlanAmendArtifact());

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
  ), "record plan-review before live B2-only authority proof");

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
  ), "record effective amended plan before live B2-only authority proof");

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
  ), "approve reviewed plan before live B2-only authority proof");

  applyCurrentB2OnlyAuthorityDiff(tempRepo);

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_REVIEW_REQUIRED");
  assert.equal(output.get("next_procedure_id"), "implementation-review");
});

test("phase 23.8.6B2 actual approved B2 authority does not authorize unrelated future task files", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2AuthorityBaselineRepo("codex-harness-phase23-8-6b2-unrelated-future-task-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2CurrentApprovedPlanAmendArtifact());

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
  ), "record plan-review before unrelated future task proof");

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
  ), "record effective amended plan before unrelated future task proof");

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
  ), "approve reviewed plan before unrelated future task proof");

  applyCurrentB2OnlyAuthorityDiff(tempRepo);
  writeText(path.join(tempRepo, "tasks", "PHASE_23_8_7_PACKET_RESULT_LIFECYCLE_CONTRACT.md"), "# unrelated future task\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
});

test("phase 23.8.6B2 mixed B2 plus B2A worktree still does not count as B2 implementation-review-ready", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386B2AuthorityBaselineRepo("codex-harness-phase23-8-6b2-live-mixed-proof-");
  let run = createBaseRun23_8_6B2(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  run = appendProcedureEvidence(run, "draft-plan", 3);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeRunEvidence(tempRepo, run.run_id, "evidence/draft-plan-3.md", "# draft-plan\n", 2);
  writeProcedureArtifact(tempRepo, run.run_id, "plan-review-amended-8", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "plan-amend-8", buildPhase2386B2CurrentApprovedPlanAmendArtifact());

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
  ), "record plan-review before mixed B2 and B2A proof");

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
  ), "record effective amended plan before mixed B2 and B2A proof");

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
  ), "approve reviewed plan before mixed B2 and B2A proof");

  applyCurrentB2OnlyAuthorityDiff(tempRepo);
  fs.mkdirSync(path.join(tempRepo, "src", "core"), { recursive: true });
  writeText(path.join(tempRepo, "src", "core", "runtime.ts"), "export const b2aMixed = true;\n");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "IMPLEMENTATION_READY");
  assert.equal(output.get("next_procedure_id"), "none");
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

test("phase 23.8.6 record-procedure ingests implementation-review PASS and routes to verification", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-implementation-review-pass-");
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
      "PASS",
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
  assertSuccess(recordImplementationReview, "record PASS implementation-review");

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "VERIFICATION_REVIEW_REQUIRED");

  const updatedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  const implementationReview = updatedRun.review_results.find((entry) => entry.source === "procedure:implementation-review");
  assert.equal(implementationReview?.status, "PASS");
});

test("phase 23.8.6 record-procedure normalizes documented implementation-review REJECT / FIX-PASS REQUIRED to fix-pass", () => {
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
      prefix: "codex-harness-phase23-8-6-implementation-review-accept-with-fixes-",
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
        "ACCEPT WITH FIXES",
        ""
      ].join("\n")
    },
    {
      prefix: "codex-harness-phase23-8-6-implementation-review-fix-pass-required-",
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
        "FIX-PASS REQUIRED",
        ""
      ].join("\n")
    },
    {
      prefix: "codex-harness-phase23-8-6-implementation-review-reject-only-",
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
        "REJECT",
        ""
      ].join("\n")
    },
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

test("phase 23.8.6C2A routes a failed labeled combined architecture/db review through fix pass and requires a fresh combined review", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386C2ARepo("codex-harness-phase23-8-6c2a-combined-review-");
  let run = createBaseRun23_8_6C2A(runtimeModule, tempRepo, "run-0001");
  run = appendProcedureEvidence(run, "task-intake", 1);
  run = appendProcedureEvidence(run, "task-prompt-writer", 2);
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-intake-1.md", "# task-intake\n", 0);
  writeRunEvidence(tempRepo, run.run_id, "evidence/task-prompt-writer-2.md", "# task-prompt-writer\n", 1);
  writeProcedureArtifact(tempRepo, run.run_id, "c2a-plan-review", buildPlanReviewArtifact());
  writeProcedureArtifact(tempRepo, run.run_id, "c2a-draft-plan", "# C2A approved plan\n");
  assertSuccess(runCli(
    ["run", "record-procedure", "--run", run.run_id, "--procedure", "plan-review", "--file", `.harness/runs/${run.run_id}/manual/c2a-plan-review.md`],
    { cwd: tempRepo }
  ), "record C2A plan review");
  assertSuccess(runCli(
    ["run", "approve-plan", "--run", run.run_id, "--plan", `.harness/runs/${run.run_id}/manual/c2a-draft-plan.md`, "--approver", "owner", "--reason", "Human approved the reviewed implementation plan."],
    { cwd: tempRepo }
  ), "approve C2A plan");

  run = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  run = addImplementationEvidence(runtimeModule, run);
  run = appendProcedureEvidence(run, "implementation-review", 5);
  run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  let operator = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(operator.get("current_stage"), "COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED");

  const failedCombinedReview = [
    "## Architecture / Authority Verdict",
    "",
    "**FAIL**",
    "",
    "## Persisted Storage / No-storage-change Verdict",
    "",
    "**PASS**",
    ""
  ].join("\n");
  writeProcedureArtifact(tempRepo, run.run_id, "combined-review-failed", failedCombinedReview);
  for (const procedureId of ["architecture-review", "db-storage-review"]) {
    assertSuccess(runCli(
      ["run", "record-procedure", "--run", run.run_id, "--procedure", procedureId, "--file", `.harness/runs/${run.run_id}/manual/combined-review-failed.md`],
      { cwd: tempRepo }
    ), `record failed C2A ${procedureId}`);
  }

  let runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.review_results.find((entry) => entry.source === "procedure:architecture-review")?.status, "FIX_REQUIRED");
  assert.equal(runtimeState.review_results.find((entry) => entry.source === "procedure:db-storage-review")?.status, "PASS");
  operator = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(operator.get("current_stage"), "FIX_PASS_REQUIRED");
  assert.equal(operator.get("next_procedure_id"), "fix-pass-review");

  writeProcedureArtifact(tempRepo, run.run_id, "combined-review-fix-pass", ["## Resolution Status", "", "1. `resolved` C2A combined-review finding.", ""].join("\n"));
  assertSuccess(runCli(
    ["run", "record-procedure", "--run", run.run_id, "--procedure", "fix-pass-review", "--file", `.harness/runs/${run.run_id}/manual/combined-review-fix-pass.md`],
    { cwd: tempRepo }
  ), "record C2A combined-review fix pass");
  operator = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(operator.get("current_stage"), "COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED");
  assert.match(operator.get("stop_reason") ?? "", /combined_review_refresh_required/);

  const passingCombinedReview = failedCombinedReview.replace("**FAIL**", "**PASS**");
  writeProcedureArtifact(tempRepo, run.run_id, "combined-review-passed", passingCombinedReview);
  assertSuccess(runCli(
    ["run", "record-procedure", "--run", run.run_id, "--procedure", "architecture-review", "--file", `.harness/runs/${run.run_id}/manual/combined-review-passed.md`],
    { cwd: tempRepo }
  ), "record partial passing C2A architecture review");
  operator = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(operator.get("current_stage"), "COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED");
  assert.match(operator.get("stop_reason") ?? "", /combined_review_refresh_required/);

  const mismatchedPassingCombinedReview = `${passingCombinedReview}\n`;
  writeProcedureArtifact(tempRepo, run.run_id, "combined-review-passed-mismatched", mismatchedPassingCombinedReview);
  assertSuccess(runCli(
    ["run", "record-procedure", "--run", run.run_id, "--procedure", "db-storage-review", "--file", `.harness/runs/${run.run_id}/manual/combined-review-passed-mismatched.md`],
    { cwd: tempRepo }
  ), "record mismatched passing C2A storage review");
  operator = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(operator.get("current_stage"), "COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED");
  assert.match(operator.get("stop_reason") ?? "", /combined_review_refresh_required/);

  assertSuccess(runCli(
    ["run", "record-procedure", "--run", run.run_id, "--procedure", "db-storage-review", "--file", `.harness/runs/${run.run_id}/manual/combined-review-passed.md`],
    { cwd: tempRepo }
  ), "record shared passing C2A storage review");

  runtimeState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  assert.equal(runtimeState.review_results.filter((entry) => entry.source === "procedure:architecture-review").at(-1)?.status, "PASS");
  assert.equal(runtimeState.review_results.filter((entry) => entry.source === "procedure:db-storage-review").at(-1)?.status, "PASS");
  operator = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(operator.get("current_stage"), "VERIFICATION_REVIEW_REQUIRED");
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

test("phase 23.8.6 closeout refreshes repository snapshot to live HEAD while preserving real blockers", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-closeout-head-refresh-");
  const staleHead = gitHead(tempRepo);
  const branchResult = runCommand("git", ["branch", "--show-current"], { cwd: tempRepo });
  assertSuccess(branchResult, "git branch --show-current");
  const branch = branchResult.stdout.trim();

  let run = buildPostVerificationRun(runtimeModule, tempRepo, "run-0001");
  run = {
    ...run,
    repository: {
      ...run.repository,
      ...(branch ? { branch } : {}),
      head_sha: staleHead,
      dirty: false
    }
  };
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "closeout-head-refresh.ts"), "export const closeoutHeadRefresh = true;\n");
  assertSuccess(runCommand("git", ["add", "src/closeout-head-refresh.ts"], { cwd: tempRepo }), "git add closeout head refresh");
  assertSuccess(runCommand("git", ["commit", "-m", "move head after run start"], { cwd: tempRepo }), "git commit closeout head refresh");

  const liveHead = gitHead(tempRepo);
  assert.notEqual(liveHead, staleHead);

  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6 dirty closeout snapshot\n");

  const closeout = runCli(["run", "closeout", "--run", run.run_id], { cwd: tempRepo });
  assertSuccess(closeout, "run closeout with refreshed repository snapshot");

  const receipt = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "closeout.json"), "utf8"));
  const updatedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));

  assert.equal(receipt.status, "BLOCKED");
  assert.match(receipt.blockers.join("\n"), /missing_merge_result/);
  assert.match(receipt.blockers.join("\n"), /missing_merge_commit/);
  assert.equal(receipt.repository.head_sha, liveHead);
  assert.equal(updatedRun.repository.head_sha, liveHead);
  assert.equal(receipt.repository.branch, branch);
  assert.equal(updatedRun.repository.branch, branch);
  assert.equal(receipt.repository.dirty, true);
  assert.equal(updatedRun.repository.dirty, true);
  assert.equal(receipt.change_set.is_dirty, true);
  assert.deepEqual(receipt.change_set.changed_paths, ["README.md"]);
  assert.ok(receipt.change_set.git_status_lines.some((line) => /README\.md/.test(line)));
});

test("phase 23.8.6 record-next-task and materialize-next-task prepare a new task-owned worktree before its separate run", async () => {
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
  writeText(
    path.join(tempRepo, "docs", "OPERATIONS_PLAN.md"),
    "## Transition\n\nPhase 23.8.7 follows commit-backed activation.\n"
  );
  writeSuccessorBootstrapSurfaces(tempRepo);
  assertSuccess(
    runCommand(
      "git",
      ["add", nextTaskPath, "docs/OPERATIONS_PLAN.md", "AGENTS.md", "bin/ch", ".gitignore", "package.json", "package-lock.json"],
      { cwd: tempRepo }
    ),
    "git add next task bootstrap surfaces"
  );
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
  writeText(path.join(tempRepo, ".harness", "config.toml"), "[harness]\nversion = \"0.1.0\"\n");
  writeText(
    path.join(tempRepo, ".harness", "install.json"),
    `${JSON.stringify({
      schema_version: 1,
      producer_command: "test",
      harness_version: "0.1.0",
      templates_version: "0.1.0",
      installed_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      source: "test"
    }, null, 2)}\n`
  );

  const unownedWorktreePath = path.join(path.dirname(tempRepo), `${path.basename(tempRepo)}-unowned-next-task-worktree`);
  tempDirectories.push(unownedWorktreePath);
  const unownedMaterialization = runCli(
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
      "task/unowned-phase-23-8-7",
      "--worktree",
      unownedWorktreePath,
      "--create"
    ],
    { cwd: tempRepo }
  );
  assertFailure(unownedMaterialization, "materialize successor without an installed task-state owner");
  assert.match(unownedMaterialization.stderr, /requires exactly one installed task-state owner/i);
  assert.equal(fs.existsSync(unownedWorktreePath), false, "unowned materialization should roll back its worktree");
  assertFailure(
    runCommand("git", ["show-ref", "--verify", "--quiet", "refs/heads/task/unowned-phase-23-8-7"], { cwd: tempRepo }),
    "unowned materialization should roll back its branch"
  );

  const taskStatePath = path.join(tempRepo, ".harness", "tasks", "task-next-phase", "state.json");
  fs.mkdirSync(path.dirname(taskStatePath), { recursive: true });
  const writeMaterializedTaskState = (branch) => {
    writeText(
      taskStatePath,
      `${JSON.stringify({
        schema_version: 1,
        producer_command: "test",
        task_id: "task-next-phase",
        title: "Next phase",
        status: "created",
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        phase: "3",
        spec: "spec.md",
        acceptance: "acceptance.md",
        branch
      }, null, 2)}\n`
    );
  };

  writeMaterializedTaskState("task/unrelated-phase-23-8-7");
  const unrelatedWorktreePath = path.join(path.dirname(tempRepo), `${path.basename(tempRepo)}-unrelated-next-task-worktree`);
  tempDirectories.push(unrelatedWorktreePath);
  const unrelatedMaterialization = runCli(
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
      "task/unrelated-phase-23-8-7-target",
      "--worktree",
      unrelatedWorktreePath,
      "--create"
    ],
    { cwd: tempRepo }
  );
  assertFailure(unrelatedMaterialization, "materialize successor with a sole unrelated task-state owner");
  assert.match(unrelatedMaterialization.stderr, /owner matching the requested branch\/worktree/i);
  assert.equal(fs.existsSync(unrelatedWorktreePath), false, "unrelated-owner materialization should roll back its worktree");
  assertFailure(
    runCommand("git", ["show-ref", "--verify", "--quiet", "refs/heads/task/unrelated-phase-23-8-7-target"], { cwd: tempRepo }),
    "unrelated-owner materialization should roll back its branch"
  );

  writeMaterializedTaskState("task/phase-23-8-7-packet-result-lifecycle-contract");

  const malformedTaskDirectory = path.join(tempRepo, ".harness", "tasks", "task-malformed-competing-owner");
  const malformedWorktreePath = path.join(path.dirname(tempRepo), `${path.basename(tempRepo)}-malformed-next-task-worktree`);
  tempDirectories.push(malformedWorktreePath);
  fs.mkdirSync(malformedTaskDirectory, { recursive: true });
  writeText(path.join(malformedTaskDirectory, "state.json"), "{not valid json}\n");
  const malformedMaterialization = runCli(
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
      "task/malformed-phase-23-8-7-target",
      "--worktree",
      malformedWorktreePath,
      "--create"
    ],
    { cwd: tempRepo }
  );
  assertFailure(malformedMaterialization, "materialize successor with a malformed competing task-state record");
  assert.match(malformedMaterialization.stderr, /requires every installed task-state record to be readable/i);
  assert.equal(fs.existsSync(malformedWorktreePath), false, "malformed-owner materialization should roll back its worktree");
  assertFailure(
    runCommand("git", ["show-ref", "--verify", "--quiet", "refs/heads/task/malformed-phase-23-8-7-target"], { cwd: tempRepo }),
    "malformed-owner materialization should roll back its branch"
  );
  fs.rmSync(malformedTaskDirectory, { recursive: true, force: true });

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
  assert.match(materialize.stdout, /handoff required: true/);
  assert.match(materialize.stdout, /Stop the predecessor task or Goal from writing/);
  assert.equal(fs.existsSync(worktreePath), true, "materialized worktree should exist");

  const newTaskPointer = fs.readFileSync(path.join(worktreePath, "TASK.md"), "utf8");
  assert.match(newTaskPointer, new RegExp(`Implement only: ${nextTaskPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  assert.equal(
    fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")),
    false,
    "materialization must not create a successor runtime run"
  );
  const taskState = JSON.parse(fs.readFileSync(taskStatePath, "utf8"));
  assert.equal(taskState.base_commit_sha, gitHead(tempRepo));

  const blockedStart = runCli(["run", "start", "--task", "TASK.md"], { cwd: worktreePath });
  assertFailure(blockedStart, "run start before successor activation commit");
  assert.match(blockedStart.stdout, /run issue missing_commit_backed_activation/);
  assert.equal(fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")), false);

  fs.appendFileSync(path.join(worktreePath, nextTaskPath), "\n## Status\n\nActive implementation phase.\n", "utf8");
  fs.appendFileSync(path.join(worktreePath, "docs", "IMPLEMENTATION_ROADMAP.md"), "\n## Phase 23.8.7\n\nActive implementation phase.\n", "utf8");
  fs.appendFileSync(path.join(worktreePath, "docs", "OPERATIONS_PLAN.md"), "\n## Active transition\n\nPhase 23.8.7 is active.\n", "utf8");
  assertSuccess(
    runCommand("git", ["add", "TASK.md", nextTaskPath, "docs/IMPLEMENTATION_ROADMAP.md", "docs/OPERATIONS_PLAN.md"], { cwd: worktreePath }),
    "git add successor activation"
  );
  assertSuccess(runCommand("git", ["commit", "-m", "activate next task"], { cwd: worktreePath }), "git commit successor activation");

  const lockfilePath = path.join(worktreePath, "package-lock.json");
  const lockfileContents = fs.readFileSync(lockfilePath, "utf8");
  fs.rmSync(lockfilePath);
  assertSuccess(runCommand("git", ["add", "--update", "package-lock.json"], { cwd: worktreePath }), "git stage missing successor lockfile");
  assertSuccess(runCommand("git", ["commit", "-m", "remove successor lockfile"], { cwd: worktreePath }), "git commit missing successor lockfile");
  const bootstrapBlocked = await runtimeModule.startRuntimeRun(worktreePath, { taskPath: "TASK.md" });
  assert.equal(bootstrapBlocked.state, "blocked");
  assert.equal(bootstrapBlocked.bootstrap.issues.length, 1);
  assert.equal(
    bootstrapBlocked.bootstrap.issues[0].issue_type,
    "worktree_bootstrap_not_ready",
    bootstrapBlocked.bootstrap.issues[0].details
  );
  assert.equal(bootstrapBlocked.bootstrap.issues[0].phase_id, "23.8.6C2A");
  assert.equal(bootstrapBlocked.bootstrap.repairPacket.phase_id, "23.8.6C2A");
  runtimeModule.validateRuntimeRun(bootstrapBlocked.run);
  assert.equal(fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")), false);

  const originalTaskState = fs.readFileSync(taskStatePath, "utf8");
  const mixedIssueTaskState = JSON.parse(originalTaskState);
  mixedIssueTaskState.worktree = tempRepo;
  mixedIssueTaskState.base_commit_sha = "not-a-resolvable-materialization-base";
  writeText(taskStatePath, `${JSON.stringify(mixedIssueTaskState, null, 2)}\n`);
  const mixedIssueBlocked = await runtimeModule.startRuntimeRun(worktreePath, { taskPath: "TASK.md" });
  assert.equal(mixedIssueBlocked.state, "blocked");
  assert.deepEqual(
    mixedIssueBlocked.bootstrap.issues.map((issue) => issue.issue_type),
    ["task_worktree_authority_mismatch", "missing_base_authority"]
  );
  assert.deepEqual(mixedIssueBlocked.bootstrap.issues.map((issue) => issue.phase_id), ["23.8.6C2A", "23.8.6C2A"]);
  assert.equal(mixedIssueBlocked.bootstrap.repairPacket.phase_id, "23.8.6C2A");
  writeText(taskStatePath, originalTaskState);

  writeText(lockfilePath, lockfileContents);
  assertSuccess(runCommand("git", ["add", "package-lock.json"], { cwd: worktreePath }), "git restore successor lockfile");
  assertSuccess(runCommand("git", ["commit", "-m", "restore successor lockfile"], { cwd: worktreePath }), "git commit restored successor lockfile");

  const restoredTaskState = fs.readFileSync(taskStatePath, "utf8");
  writeText(taskStatePath, "{not valid JSON}\n");
  const malformedTaskStateBlocked = await runtimeModule.startRuntimeRun(worktreePath, { taskPath: "TASK.md" });
  assert.equal(malformedTaskStateBlocked.state, "blocked");
  assert.deepEqual(malformedTaskStateBlocked.bootstrap.issues.map((issue) => issue.issue_type), ["bootstrap_authority_unmatched"]);
  assert.deepEqual(malformedTaskStateBlocked.bootstrap.issues.map((issue) => issue.phase_id), ["23.8.6C2A"]);
  assert.equal(malformedTaskStateBlocked.bootstrap.repairPacket.phase_id, "23.8.6C2A");
  runtimeModule.validateRuntimeRun(malformedTaskStateBlocked.run);
  assert.equal(fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")), false);

  fs.rmSync(taskStatePath);
  const missingTaskStateBlocked = await runtimeModule.startRuntimeRun(worktreePath, { taskPath: "TASK.md" });
  assert.equal(missingTaskStateBlocked.state, "blocked");
  assert.deepEqual(missingTaskStateBlocked.bootstrap.issues.map((issue) => issue.issue_type), ["bootstrap_authority_unmatched"]);
  assert.deepEqual(missingTaskStateBlocked.bootstrap.issues.map((issue) => issue.phase_id), ["23.8.6C2A"]);
  assert.equal(missingTaskStateBlocked.bootstrap.repairPacket.phase_id, "23.8.6C2A");
  runtimeModule.validateRuntimeRun(missingTaskStateBlocked.run);
  assert.equal(fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")), false);
  writeText(taskStatePath, restoredTaskState);

  const start = await runtimeModule.startRuntimeRun(worktreePath, { taskPath: "TASK.md" });
  assert.equal(
    start.state,
    "created",
    start.bootstrap.issues.map((issue) => issue.details ?? issue.summary).join("\n")
  );
  const newCurrentRun = JSON.parse(fs.readFileSync(path.join(worktreePath, ".harness", "runs", "current.json"), "utf8"));
  const newRun = JSON.parse(
    fs.readFileSync(path.join(worktreePath, ".harness", "runs", newCurrentRun.run_id, "run.json"), "utf8")
  );
  assert.equal(newRun.task_path, "TASK.md");
  assert.equal(newRun.active_task_path, nextTaskPath);
  assert.equal(newRun.phase_id, "23.8.7");
});

test("phase 23.8.6 materialize-next-task enters a registered existing worktree without creating a run", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-enter-existing-worktree-");
  const nextTaskPath = "tasks/PHASE_23_8_7_PACKET_RESULT_LIFECYCLE_CONTRACT.md";
  const branch = "task/phase-23-8-7-enter-existing";
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
  assertSuccess(runCommand("git", ["add", nextTaskPath], { cwd: tempRepo }), "git add entered-existing next task");
  assertSuccess(runCommand("git", ["commit", "-m", "add entered-existing next task"], { cwd: tempRepo }), "git commit entered-existing next task");
  const baseCommit = gitHead(tempRepo);
  const run = buildClosedRun(runtimeModule, tempRepo, "run-0001");
  const sourceArtifactPath = writeProcedureArtifact(tempRepo, run.run_id, "next-task-decision", "Enter an existing task worktree.\n");
  const recordDecision = runCli(
    [
      "run",
      "record-next-task",
      "--run",
      run.run_id,
      "--task",
      nextTaskPath,
      "--base-commit",
      baseCommit,
      "--file",
      path.relative(tempRepo, sourceArtifactPath)
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recordDecision, "record next task for entered-existing worktree");
  const decisionId = parseOperatorOutput(recordDecision.stdout).get("decision id");
  assert.ok(decisionId, "entered-existing decision id should be reported");

  const worktreePath = path.join(path.dirname(tempRepo), `${path.basename(tempRepo)}-existing-worktree`);
  tempDirectories.push(worktreePath);
  assertSuccess(runCommand("git", ["worktree", "add", "-b", branch, worktreePath, baseCommit], { cwd: tempRepo }), "git worktree add existing fixture");
  const taskStatePath = path.join(tempRepo, ".harness", "tasks", "task-entered-existing", "state.json");
  fs.mkdirSync(path.dirname(taskStatePath), { recursive: true });
  writeText(path.join(tempRepo, ".harness", "config.toml"), "[harness]\nversion = \"0.1.0\"\n");
  writeText(
    path.join(tempRepo, ".harness", "install.json"),
    `${JSON.stringify({
      schema_version: 1,
      producer_command: "test",
      harness_version: "0.1.0",
      templates_version: "0.1.0",
      installed_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      source: "test"
    }, null, 2)}\n`
  );
  writeText(
    taskStatePath,
    `${JSON.stringify({
      schema_version: 1,
      producer_command: "test",
      task_id: "task-entered-existing",
      title: "Entered existing task",
      status: "created",
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      phase: "3",
      spec: "spec.md",
      acceptance: "acceptance.md",
      branch,
      worktree: worktreePath
    }, null, 2)}\n`
  );

  const wrongBranch = runCli(
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
      "task/incorrect-entered-existing-branch",
      "--worktree",
      worktreePath,
      "--enter-existing"
    ],
    { cwd: tempRepo }
  );
  assertFailure(wrongBranch, "enter existing worktree with wrong branch");
  assert.match(wrongBranch.stderr, /branch mismatch/i);

  writeText(path.join(worktreePath, "README.md"), "# dirty entered-existing worktree\n");
  const dirtyWorktree = runCli(
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
      branch,
      "--worktree",
      worktreePath,
      "--enter-existing"
    ],
    { cwd: tempRepo }
  );
  assertFailure(dirtyWorktree, "enter existing dirty worktree");
  assert.match(dirtyWorktree.stderr, /worktree is dirty/i);
  assertSuccess(runCommand("git", ["checkout", "--", "README.md"], { cwd: worktreePath }), "restore entered-existing worktree");

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
      branch,
      "--worktree",
      worktreePath,
      "--enter-existing"
    ],
    { cwd: tempRepo }
  );
  assertSuccess(materialize, "enter existing worktree");
  assert.match(materialize.stdout, /created: false/);
  assert.match(materialize.stdout, /handoff required: true/);
  assert.equal(fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")), false);
  assert.match(fs.readFileSync(path.join(worktreePath, "TASK.md"), "utf8"), /Implement only: tasks\/PHASE_23_8_7_PACKET_RESULT_LIFECYCLE_CONTRACT\.md/);
  const taskState = JSON.parse(fs.readFileSync(taskStatePath, "utf8"));
  assert.equal(taskState.base_commit_sha, baseCommit);
});

test("phase 23.8.6 recovers a clean committed successor activation into one task-state owner", () => {
  const runtimeModule = loadBuiltRuntime();
  const tempRepo = createPhase2386Repo("codex-harness-phase23-8-6-recover-existing-activation-");
  const nextTaskPath = "tasks/PHASE_23_8_7_PACKET_RESULT_LIFECYCLE_CONTRACT.md";
  const branch = "task/phase-23-8-7-recovered-existing";
  writeText(
    path.join(tempRepo, nextTaskPath),
    "# Phase 23.8.7 - Packet / Result Lifecycle Contract\n\nInitial contract.\n"
  );
  assertSuccess(runCommand("git", ["add", nextTaskPath], { cwd: tempRepo }), "git add recovery task contract base");
  assertSuccess(runCommand("git", ["commit", "-m", "add recovery task contract base"], { cwd: tempRepo }), "git commit recovery task contract base");
  const baseCommit = gitHead(tempRepo);
  const run = buildClosedRun(runtimeModule, tempRepo, "run-0001");
  const sourceArtifactPath = writeProcedureArtifact(tempRepo, run.run_id, "next-task-decision", "Recover a committed existing successor.\n");
  const decision = runCli(
    [
      "run",
      "record-next-task",
      "--run",
      run.run_id,
      "--task",
      nextTaskPath,
      "--base-commit",
      baseCommit,
      "--file",
      path.relative(tempRepo, sourceArtifactPath)
    ],
    { cwd: tempRepo }
  );
  assertSuccess(decision, "record next task for recovery");
  const decisionId = parseOperatorOutput(decision.stdout).get("decision id");
  assert.ok(decisionId, "recovery decision id should be reported");

  writeText(path.join(tempRepo, ".harness", "config.toml"), "[harness]\nversion = \"0.1.0\"\n");
  writeText(
    path.join(tempRepo, ".harness", "install.json"),
    `${JSON.stringify({
      schema_version: 1,
      producer_command: "test",
      harness_version: "0.1.0",
      templates_version: "0.1.0",
      installed_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      source: "test"
    }, null, 2)}\n`
  );

  const worktreePath = path.join(path.dirname(tempRepo), `${path.basename(tempRepo)}-recovered-existing-worktree`);
  tempDirectories.push(worktreePath);
  assertSuccess(runCommand("git", ["worktree", "add", "-b", branch, worktreePath, baseCommit], { cwd: tempRepo }), "git worktree add recovery fixture");

  const beforeActivation = runCli(
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
      branch,
      "--worktree",
      worktreePath,
      "--enter-existing",
      "--recover-existing-activation"
    ],
    { cwd: tempRepo }
  );
  assertFailure(beforeActivation, "recover existing activation without a committed activation chain");
  assert.match(beforeActivation.stderr, /requires a clean successor activation chain descending from recorded base/i);

  writeText(path.join(worktreePath, "TASK.md"), `# Current Task\n\nImplement only: ${nextTaskPath}\n\nDo not implement later phases.\n`);
  fs.appendFileSync(path.join(worktreePath, nextTaskPath), "\nActivation authority.\n", "utf8");
  fs.appendFileSync(path.join(worktreePath, "docs", "IMPLEMENTATION_ROADMAP.md"), "\nRecovery activation authority.\n", "utf8");
  fs.appendFileSync(path.join(worktreePath, "docs", "OPERATIONS_PLAN.md"), "\nRecovery activation authority.\n", "utf8");
  assertSuccess(
    runCommand("git", ["add", "TASK.md", nextTaskPath, "docs/IMPLEMENTATION_ROADMAP.md", "docs/OPERATIONS_PLAN.md"], { cwd: worktreePath }),
    "git add committed recovery activation"
  );
  assertSuccess(runCommand("git", ["commit", "-m", "commit recovery activation authority"], { cwd: worktreePath }), "git commit recovery activation authority");

  const recoveryPreview = runCli(
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
      branch,
      "--worktree",
      worktreePath,
      "--enter-existing",
      "--recover-existing-activation",
      "--dry-run"
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recoveryPreview, "preview recover existing committed activation");
  assert.match(recoveryPreview.stdout, /recovered existing activation: true/);
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness", "tasks")), false, "recovery preview creates no task-state owner");

  const recovered = runCli(
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
      branch,
      "--worktree",
      worktreePath,
      "--enter-existing",
      "--recover-existing-activation"
    ],
    { cwd: tempRepo }
  );
  assertSuccess(recovered, "recover existing committed activation");
  assert.match(recovered.stdout, /recovered existing activation: true/);
  assert.match(recovered.stdout, /task-state id: /);
  const statePaths = fs.readdirSync(path.join(tempRepo, ".harness", "tasks"), { recursive: true })
    .filter((entry) => entry.endsWith(path.join("state.json")));
  assert.equal(statePaths.length, 1, "recovery creates exactly one task-state owner");
  const taskState = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "tasks", statePaths[0]), "utf8"));
  assert.equal(taskState.branch, branch);
  assert.equal(taskState.worktree, worktreePath);
  assert.equal(taskState.base_commit_sha, baseCommit);
  assert.equal(fs.existsSync(path.join(worktreePath, ".harness", "runs", "current.json")), false);

  const repeatedRecovery = runCli(
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
      branch,
      "--worktree",
      worktreePath,
      "--enter-existing",
      "--recover-existing-activation"
    ],
    { cwd: tempRepo }
  );
  assertSuccess(repeatedRecovery, "repeat recover existing committed activation");
  const repeatedStatePaths = fs.readdirSync(path.join(tempRepo, ".harness", "tasks"), { recursive: true })
    .filter((entry) => entry.endsWith(path.join("state.json")));
  assert.equal(repeatedStatePaths.length, 1, "recovery remains idempotent");
});
