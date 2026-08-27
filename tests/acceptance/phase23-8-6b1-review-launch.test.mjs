import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  productRoot,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const sqliteModule = require(path.join(productRoot, "dist/core/sqlite.js"));
const stagingModule = require(path.join(productRoot, "dist/core/run-staging-db.js"));
const reviewPolicyModule = require(path.join(productRoot, "dist/core/self-hosting-review-policy.js"));
const runtimeModule = require(path.join(productRoot, "dist/core/runtime.js"));
const ACTIVE_TASK_PATH = "tasks/PHASE_23_8_6B1_SUPERVISED_REVIEW_LAUNCH_AND_BLOCKED_DISPOSITION.md";
const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function createB1Repo(prefix) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8.6B1\n");
  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  writeText(
    path.join(tempRepo, "TASK.md"),
    ["# Current Task", "", `Implement only: ${ACTIVE_TASK_PATH}`, "", "Do not implement Phase 23.8.6B2 or later.", ""].join("\n")
  );
  writeText(
    path.join(tempRepo, ACTIVE_TASK_PATH),
    [
      "# Phase 23.8.6B1 - Supervised Review Launch and Blocked Disposition",
      "",
      "## Acceptance commands",
      "",
      "```bash",
      "npm run build",
      "npm test",
      "git diff --check",
      "```",
      ""
    ].join("\n")
  );
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8.6B1 — Supervised Review Launch and Blocked Disposition",
      "",
      "Task:",
      `\`${ACTIVE_TASK_PATH}\``,
      ""
    ].join("\n")
  );
  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
  fs.mkdirSync(path.join(tempRepo, "schemas"), { recursive: true });
  fs.copyFileSync(
    path.join(productRoot, "schemas", "self-hosting-procedure-execution-policy.schema.json"),
    path.join(tempRepo, "schemas", "self-hosting-procedure-execution-policy.schema.json")
  );
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });
  const executionPolicyPath = path.join(tempRepo, "skills", "self-hosting", "procedure-execution-policy.json");
  const executionPolicy = JSON.parse(fs.readFileSync(executionPolicyPath, "utf8"));
  for (const procedure of executionPolicy.procedures) {
    if (!procedure.automatic_launch) continue;
    procedure.review_launch = {
      timeout_seconds: 5,
      stale_after_seconds: 1,
      timeout_override: { minimum_seconds: 5, maximum_seconds: 60 },
      stale_after_override: { minimum_seconds: 1, maximum_seconds: 4 },
      termination_policy: "terminal_completion_only"
    };
  }
  writeText(executionPolicyPath, `${JSON.stringify(executionPolicy, null, 2)}\n`);
  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add B1 repo");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit B1 repo");
  assertSuccess(runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo }), "run start B1");

  return tempRepo;
}

function createFakeCodexBin(tempRepo, mode) {
  const binDir = path.join(tempRepo, "fake-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "codex");
  writeText(
    scriptPath,
    `#!/usr/bin/env node
const fs = require("fs");
const { spawnSync } = require("child_process");
const args = process.argv.slice(2);
const output = args[args.indexOf("-o") + 1];
const content = process.env.CODEX_FAKE_REVIEW_CONTENT || "";
if (process.env.CODEX_FAKE_SENTINEL) fs.writeFileSync(process.env.CODEX_FAKE_SENTINEL, String(process.pid), "utf8");
process.on("SIGTERM", () => {
  if (process.env.CODEX_FAKE_SIGTERM_SENTINEL) fs.writeFileSync(process.env.CODEX_FAKE_SIGTERM_SENTINEL, "sigterm", "utf8");
  process.exit(143);
});
if (process.env.CODEX_FAKE_EXIT) {
  if (process.env.CODEX_FAKE_STDERR) process.stderr.write(process.env.CODEX_FAKE_STDERR);
  process.exit(Number(process.env.CODEX_FAKE_EXIT));
}
if (process.env.CODEX_FAKE_MODE === "stdout") {
  process.stdout.write(content);
} else if (process.env.CODEX_FAKE_MODE === "json") {
  console.log(JSON.stringify({ final_message: content }));
} else if (process.env.CODEX_FAKE_MODE === "invalid") {
  fs.writeFileSync(output, "not a valid review artifact\\n", "utf8");
} else if (process.env.CODEX_FAKE_MODE === "invalid-section") {
  fs.writeFileSync(output, "## Review Surface\\n\\nMissing most sections.\\n\\n## Recommendation\\n\\nPASS\\n", "utf8");
} else if (process.env.CODEX_FAKE_MODE === "no-output") {
  process.exit(0);
} else if (process.env.CODEX_FAKE_MODE === "sleep") {
  setTimeout(() => process.exit(0), Number(process.env.CODEX_FAKE_SLEEP_MS || 3000));
} else if (process.env.CODEX_FAKE_MODE === "silent-file-after-delay") {
  setTimeout(() => {
    fs.writeFileSync(output, content, "utf8");
    process.exit(0);
  }, Number(process.env.CODEX_FAKE_SLEEP_MS || 3000));
} else if (process.env.CODEX_FAKE_MODE === "write-then-sleep") {
  fs.writeFileSync(output, content, "utf8");
  setTimeout(() => process.exit(0), Number(process.env.CODEX_FAKE_SLEEP_MS || 3000));
} else if (process.env.CODEX_FAKE_MODE === "nested-review") {
  const nested = spawnSync(process.execPath, [
    process.env.CODEX_FAKE_CH,
    "run", "launch-review",
    "--run", "run-0001",
    "--procedure", "plan-review",
    "--request", process.env.CODEX_FAKE_NESTED_REQUEST,
    "--output", process.env.CODEX_FAKE_NESTED_OUTPUT
  ], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
  fs.writeFileSync(process.env.CODEX_FAKE_NESTED_RESULT, JSON.stringify({ status: nested.status, stdout: nested.stdout, stderr: nested.stderr }), "utf8");
  fs.writeFileSync(output, content, "utf8");
} else {
  fs.writeFileSync(output, content, "utf8");
}

`
  );
  fs.chmodSync(scriptPath, 0o755);
  return {
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    CODEX_FAKE_MODE: mode
  };
}

function implementationReviewMarkdown(recommendation = "PASS") {
  return [
    "## Review Surface",
    "",
    "Reviewed B1.",
    "",
    "## Findings",
    "",
    recommendation === "PASS" ? "No findings." : "1. Fix required.",
    "",
    "## Task And Plan Compliance",
    "",
    "Within scope.",
    "",
    "## Verification Coverage",
    "",
    "Focused checks reviewed.",
    "",
    "## Policy Findings",
    "",
    "No policy issue.",
    "",
    "## Source Trace",
    "",
    "TASK.md to B1 task.",
    "",
    "## Skill Risk Check",
    "",
    "No extra skill risk.",
    "",
    "## Scope Creep Check",
    "",
    "No future phase leakage.",
    "",
    "## Recommendation",
    "",
    recommendation,
    ""
  ].join("\n");
}

function fixPassReviewMarkdown(recommendation = "PASS") {
  const resolved = recommendation === "PASS";
  return [
    "## Original Findings", "", "1. Epoch-scoped review selection must remain exact.", "",
    "## Resolution Status", "", `1. \`${resolved ? "resolved" : "unresolved"}\``, resolved ? "Resolved by the bounded fix." : "The finding remains open.", "",
    "## Fix-pass Scope", "", "Only the bounded epoch selection was reviewed.", "",
    "## Scope Check", "", "No new scope was added.", "",
    "## Source Trace", "", "TASK.md -> approved plan -> implementation review -> fix-pass diff.", "",
    "## Verification Follow-up", "", "Focused verification reviewed.", "",
    "## Recommendation", "", recommendation, ""
  ].join("\n");
}

function verificationReviewMarkdown() {
  return [
    "## Commands Reviewed", "", "- npm test", "",
    "## Results", "", "- npm test: pass", "",
    "## Evidence Gaps", "", "None.", "",
    "## Missing Or Failed Evidence", "", "None.", "",
    "## Local Versus Remote Status", "", "Local verification passed; remote status is separately recorded.", "",
    "## Recommendation", "", "PASS", ""
  ].join("\n");
}

function planReviewMarkdown() {
  return [
    "## Durable Decision Record",
    "",
    "verdict: PASS",
    "outcome_state: ready_for_implementation",
    "blocking_findings: none",
    "required_amendments: none",
    "accepted_defaults: none",
    "real_operator_choices: proceed with B1 implementation",
    "next_allowed_action: obtain explicit human approval of the reviewed plan",
    "validation_required: npm run build; npm test; git diff --check",
    "source_trace: TASK.md -> active B1 task",
    "future_phase_deferrals: B2/C/D/23.8.7/23.9/30/31 deferred",
    "",
    "## Recommendation",
    "",
    "PASS",
    ""
  ].join("\n");
}

function markdownFormattedPlanReviewMarkdown() {
  return planReviewMarkdown()
    .replace("verdict: PASS", "verdict: `PASS`")
    .replace("outcome_state: ready_for_implementation", "outcome_state: `ready_for_implementation`");
}

function amendRequiredPlanReviewMarkdown() {
  return [
    "## Findings",
    "",
    "### PR24A-001",
    "",
    "Define the missing contract surface.",
    "",
    "## Durable Decision Record",
    "",
    "verdict: AMEND_REQUIRED",
    "outcome_state: needs_contract_surface_update",
    "blocking_findings: PR24A-001",
    "required_amendments: define the missing contract surface",
    "accepted_defaults: none",
    "real_operator_choices: none",
    "next_allowed_action: amend the plan and obtain a fresh independent review",
    "validation_required: npm run build",
    "source_trace: TASK.md -> active B1 task",
    "future_phase_deferrals: B2 deferred",
    "",
    "## Recommendation",
    "",
    "AMEND_REQUIRED",
    ""
  ].join("\n");
}

function writeManualFile(tempRepo, runId, name, content) {
  const relativePath = path.join(".harness", "runs", runId, "manual", name);
  const filePath = path.join(tempRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeText(filePath, content);
  return relativePath;
}

function recordProcedure(tempRepo, runId, procedureId, content) {
  const relativePath = writeManualFile(tempRepo, runId, `${procedureId}.md`, content);
  assertSuccess(
    runCli(["run", "record-procedure", "--run", runId, "--procedure", procedureId, "--file", relativePath], { cwd: tempRepo }),
    `record ${procedureId}`
  );
  return relativePath;
}

function prepareApprovedB1Plan(tempRepo, runId = "run-0001") {
  let effectivePlanPath = "";
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    const pathForProcedure = recordProcedure(tempRepo, runId, procedureId, `# ${procedureId}\n`);
    if (procedureId === "draft-plan") {
      effectivePlanPath = pathForProcedure;
    }
  }
  if (readRun(tempRepo).phase_id === "24A") {
    const planEnv = createFakeCodexBin(tempRepo, "file");
    assertSuccess(runCommand("git", ["add", "fake-bin"], { cwd: tempRepo }), "stage fixture reviewer");
    assertSuccess(runCommand("git", ["commit", "-m", "fixture reviewer"], { cwd: tempRepo }), "commit fixture reviewer");
    const requestPath = writeManualFile(tempRepo, runId, "automatic-plan-review-request.md", "review the exact effective plan");
    assertSuccess(runCli([
      "run", "launch-review", "--run", runId, "--procedure", "plan-review",
      "--request", requestPath, "--output", `.harness/runs/${runId}/manual/automatic-plan-review.md`
    ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown() } }), "automatic terminal B1 plan review");
  } else {
    recordProcedure(tempRepo, runId, "plan-review", planReviewMarkdown());
  }
  assertSuccess(
    runCli([
      "run",
      "approve-plan",
      "--run",
      runId,
      "--plan",
      effectivePlanPath,
      "--approver",
      "owner",
      "--reason",
      "Human approved the reviewed B1 implementation plan."
    ], { cwd: tempRepo }),
    "approve B1 plan"
  );
}

function readRun(tempRepo) {
  return JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"), "utf8"));
}

function setRunPhase(tempRepo, phaseId) {
  const roots = stagingModule.resolveHarnessRoots(tempRepo);
  const staging = new stagingModule.RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  staging.mutateRun("run-0001", (run) => ({
    ...run,
    phase_id: phaseId,
    repository: {
      ...run.repository,
      branch: runCommand("git", ["branch", "--show-current"], { cwd: tempRepo }).stdout.trim(),
      head_sha: readHead(tempRepo)
    }
  }));
}

function readLatestAttempt(tempRepo, procedureId = "implementation-review") {
  const run = readRun(tempRepo);
  const evidence = [...run.evidence].reverse().find((entry) => entry.kind === `review-launch-attempt:${procedureId}`);
  assert.ok(evidence, `expected review-launch-attempt evidence for ${procedureId}`);
  return JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", evidence.path), "utf8"));
}

function readHead(tempRepo) {
  const result = runCommand("git", ["rev-parse", "HEAD"], { cwd: tempRepo });
  assertSuccess(result, "read fixture HEAD");
  return result.stdout.trim();
}

function bindImplementationBaseline(tempRepo, planPath, approvalId, expectedHead) {
  return runCli([
    "run", "bind-implementation-baseline", "--run", "run-0001",
    "--plan", planPath, "--approval-id", approvalId, "--expected-head", expectedHead
  ], { cwd: tempRepo });
}

function addMilliseconds(timestamp, milliseconds) {
  const parsed = Date.parse(timestamp);
  assert.ok(Number.isFinite(parsed), `fixture timestamp must be parseable: ${timestamp}`);
  return new Date(parsed + milliseconds).toISOString();
}

function seedEpochLifecycleEvidence(tempRepo, epochId, afterTimestamp) {
  const roots = stagingModule.resolveHarnessRoots(tempRepo);
  const staging = new stagingModule.RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  const timestamps = {
    review: addMilliseconds(afterTimestamp, 1),
    verification: addMilliseconds(afterTimestamp, 2),
    delivery: addMilliseconds(afterTimestamp, 3),
    command: addMilliseconds(afterTimestamp, 4),
    stepStarted: addMilliseconds(afterTimestamp, 5),
    stepCompleted: addMilliseconds(afterTimestamp, 6),
    closeout: addMilliseconds(afterTimestamp, 7)
  };
  const artifactId = `sha256:${epochId === "epoch-a" ? "a".repeat(64) : "b".repeat(64)}`;
  staging.mutateRun("run-0001", (run) => {
    const artifact = {
      artifact_id: artifactId, path: `manual/${epochId}-implementation.md`,
      kind: "procedure:implementation-review", description: "implementation-review"
    };
    const evidence = {
      evidence_id: `procedure-implementation-review-${epochId}`, kind: "procedure:implementation-review",
      summary: "implementation-review", artifact_id: artifact.artifact_id, path: artifact.path
    };
    const review = {
      review_result_id: `review-${epochId}`, status: "PASS", created_at: timestamps.review,
      summary: `${epochId} implementation review`, source: "procedure:implementation-review",
      blockers: [], artifact_refs: [artifact]
    };
    const verification = {
      verification_result_id: `verification-${epochId}`, status: "pass", created_at: timestamps.verification,
      summary: `${epochId} verification`, source: "self-hosting", artifact_refs: [artifact], command_results: []
    };
    const delivery = {
      delivery_fact_id: `delivery-${epochId}`, run_id: run.run_id, fact_kind: "pr", source: "fixture",
      status: "created", recorded_at: timestamps.delivery, summary: `${epochId} delivery`
    };
    const command = {
      command_result_id: `command-${epochId}`, command: "npm test", status: "pass", completed_at: timestamps.command,
      artifact_refs: [artifact]
    };
    const step = {
      step_id: `step-${epochId}`, name: `${epochId} implementation`, status: "passed", started_at: timestamps.stepStarted,
      completed_at: timestamps.stepCompleted, artifact_refs: [artifact], evidence_refs: [evidence], command_result_ids: [command.command_result_id]
    };
    const closeout = {
      schema_version: run.schema_version, producer_command: "fixture", receipt_id: `closeout-${epochId}`,
      run_id: run.run_id, task_path: run.task_path, active_task_path: run.active_task_path, phase_id: run.phase_id,
      status: "READY", created_at: timestamps.closeout, repository: run.repository,
      change_set: { git_status_lines: [], changed_paths: [], is_dirty: false }, verification_result: verification,
      review_result: review, findings: [], decisions: [], approvals: run.approvals,
      required_gates: [], remote_checks: [], blockers: [], delivery_facts: [delivery]
    };
    return {
      ...run,
      steps: [...run.steps, step], artifacts: [...run.artifacts, artifact], evidence: [...run.evidence, evidence],
      command_results: [...run.command_results, command], review_results: [...run.review_results, review],
      verification_results: [...run.verification_results, verification], delivery_facts: [...run.delivery_facts, delivery],
      closeout_receipts: [...run.closeout_receipts, closeout]
    };
  });
  return { artifactId, timestamps };
}

test("Phase F and later bind the exact approved reviewed source before implementation review", () => {
  const tempRepo = createB1Repo("codex-harness-phase-f-direct-baseline-");
  setRunPhase(tempRepo, "24A");
  prepareApprovedB1Plan(tempRepo);
  const approved = readRun(tempRepo).approvals.at(-1);
  const requestPath = writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review the approved implementation");

  const beforeBaseline = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/implementation-review.md"
  ], { cwd: tempRepo });
  assertFailure(beforeBaseline, "Phase F implementation review without a baseline");
  assert.match(beforeBaseline.stderr, /IMPLEMENTATION_BASELINE_REQUIRED/);

  const result = bindImplementationBaseline(
    tempRepo,
    ".harness/runs/run-0001/manual/draft-plan.md",
    approved.approval_id,
    readHead(tempRepo)
  );
  assertSuccess(result, "direct reviewed-source baseline binding");
  const binding = readRun(tempRepo).implementation_baseline_binding;
  assert.equal(binding.authority_transition, "reviewed_source");
  assert.equal(binding.planning_review_source_head, readHead(tempRepo));
  assert.equal(binding.plan_review_artifact_hash, approved.reviewed_evidence_artifact_id);
  assert.match(binding.owner_authority_diff_hash, /^sha256:[a-f0-9]{64}$/);

  const operator = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(operator, "operator status after direct baseline binding");
  assert.match(operator.stdout, /current_stage: IMPLEMENTATION_READY/);
});

test("Phase F and later preserve an attributable owner-authorized baseline overlay", () => {
  const tempRepo = createB1Repo("codex-harness-phase-f-overlay-baseline-");
  const originalReadme = fs.readFileSync(path.join(tempRepo, "README.md"), "utf8");
  const overlayReadme = "# phase 23.8.6B1 owner-authorized overlay\n";
  writeText(path.join(tempRepo, "README.md"), overlayReadme);
  const diff = runCommand("git", ["diff", "--binary", "--", "README.md"], { cwd: tempRepo });
  assertSuccess(diff, "derive exact overlay diff");
  writeText(path.join(tempRepo, "README.md"), originalReadme);
  const overlayHash = require("node:crypto").createHash("sha256").update(diff.stdout).digest("hex");
  const plan = [
    "# effective plan", "",
    "Preapproval owner-authority overlay", "",
    "- `README.md`", "",
    "Inspect only", "",
    `owner-authorized planning authority diff SHA-256 \`${overlayHash}\``, ""
  ].join("\n");

  setRunPhase(tempRepo, "24A");
  for (const procedureId of ["task-intake", "task-prompt-writer"]) {
    recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
  }
  const planPath = recordProcedure(tempRepo, "run-0001", "draft-plan", plan);
  const planEnv = createFakeCodexBin(tempRepo, "file");
  assertSuccess(runCommand("git", ["add", "fake-bin"], { cwd: tempRepo }), "stage overlay fixture reviewer");
  assertSuccess(runCommand("git", ["commit", "-m", "overlay fixture reviewer"], { cwd: tempRepo }), "commit overlay fixture reviewer");
  const reviewRequest = writeManualFile(tempRepo, "run-0001", "overlay-plan-review-request.md", "review the exact overlay plan");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", reviewRequest, "--output", ".harness/runs/run-0001/manual/overlay-plan-review.md"
  ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown() } }), "automatic terminal overlay plan review");
  assertSuccess(runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", planPath,
    "--approver", "owner", "--reason", "Authorize the reviewed overlay plan."
  ], { cwd: tempRepo }), "approve overlay plan");

  writeText(path.join(tempRepo, "README.md"), overlayReadme);
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "stage exact overlay");
  assertSuccess(runCommand("git", ["commit", "-m", "owner authorized overlay"], { cwd: tempRepo }), "commit exact overlay");
  const approved = readRun(tempRepo).approvals.at(-1);
  const result = bindImplementationBaseline(tempRepo, planPath, approved.approval_id, readHead(tempRepo));
  assertSuccess(result, "owner-authorized overlay baseline binding");
  const binding = readRun(tempRepo).implementation_baseline_binding;
  assert.equal(binding.authority_transition, "owner_authorized_overlay");
  assert.equal(binding.owner_authority_diff_hash, `sha256:${overlayHash}`);
});

test("phase 23.8.6F forbids recursive review launch before a second claim or child", () => {
  const tempRepo = createB1Repo("codex-harness-f-review-recursion-");
  const outerRequest = writeManualFile(tempRepo, "run-0001", "outer-review-request.md", "review the outer implementation");
  const nestedRequest = writeManualFile(tempRepo, "run-0001", "nested-review-request.md", "attempt a nested plan review");
  const nestedOutput = ".harness/runs/run-0001/manual/nested-review-output.md";
  const nestedResult = path.join(tempRepo, "nested-review-result.json");
  const env = {
    ...createFakeCodexBin(tempRepo, "nested-review"),
    CODEX_FAKE_CH: path.join(productRoot, "bin", "ch"),
    CODEX_FAKE_NESTED_REQUEST: nestedRequest,
    CODEX_FAKE_NESTED_OUTPUT: nestedOutput,
    CODEX_FAKE_NESTED_RESULT: nestedResult,
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  };

  const result = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", outerRequest,
    "--output", ".harness/runs/run-0001/manual/outer-review-output.md",
    "--timeout-seconds", "10"
  ], { cwd: tempRepo, env });

  assertSuccess(result, "outer review completes after nested refusal");
  const refusal = JSON.parse(fs.readFileSync(nestedResult, "utf8"));
  assert.equal(refusal.status, 1);
  const refusalOutput = `${refusal.stdout}\n${refusal.stderr}`;
  assert.match(refusalOutput, /failure classification: REVIEW_RECURSION_FORBIDDEN/);
  assert.match(refusalOutput, /outer claim validation: matched/);
  assert.match(refusalOutput, /attempted nested procedure: plan-review/);
  assert.match(refusalOutput, /claim created: false/);
  assert.match(refusalOutput, /child spawned: false/);
  assert.match(refusalOutput, /artifact wait started: false/);
  assert.equal(fs.existsSync(path.join(tempRepo, nestedOutput)), false);
  const run = readRun(tempRepo);
  assert.deepEqual(run.review_launch_claims, []);
  assert.equal(run.evidence.filter((entry) => entry.kind.startsWith("review-launch-attempt:")).length, 1);
  assert.equal(run.evidence.filter((entry) => entry.kind === "procedure:implementation-review").length, 1);
  assert.equal(run.evidence.filter((entry) => entry.kind === "procedure:plan-review").length, 0);

  const invalidMarker = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", nestedRequest, "--output", nestedOutput
  ], {
    cwd: tempRepo,
    env: {
      CODEX_HARNESS_REVIEWER_ROLE: "independent_reviewer",
      CODEX_HARNESS_REVIEW_RUN_INSTANCE_ID: run.run_instance_id,
      CODEX_HARNESS_REVIEW_PROCEDURE_ID: "implementation-review",
      CODEX_HARNESS_REVIEW_ATTEMPT_ID: "stale-attempt",
      CODEX_HARNESS_REVIEW_CLAIM_ID: "stale-claim",
      CODEX_HARNESS_REVIEW_ATTEMPT_MARKER: `sha256:${"0".repeat(64)}`
    }
  });
  assertFailure(invalidMarker, "stale reviewer marker fails closed");
  assert.match(`${invalidMarker.stdout}\n${invalidMarker.stderr}`, /outer claim validation: invalid/);
  assert.match(`${invalidMarker.stdout}\n${invalidMarker.stderr}`, /claim created: false/);
});

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${filePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function launchReviewAsync(tempRepo, args, env) {
  const child = spawn(process.execPath, [path.join(productRoot, "bin", "ch"), ...args], {
    cwd: tempRepo,
    env: { ...process.env, ...env },
    stdio: "pipe"
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const completed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  return { child, completed };
}

test("phase 23.8.6B1 launch-review dry-run validates without spawning or writing", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-dry-run-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const outputPath = ".harness/runs/run-0001/manual/implementation-review.md";

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    outputPath,
    "--dry-run"
  ], { cwd: tempRepo });

  assertSuccess(result, "launch-review dry-run");
  assert.match(result.stdout, /launch status: dry_run/);
  assert.match(result.stdout, /timeout seconds: 5/);
  assert.doesNotMatch(result.stdout, /timeout seconds: 120/);
  assert.equal(fs.existsSync(path.join(tempRepo, outputPath)), false);
  assert.equal(readRun(tempRepo).evidence.some((entry) => entry.kind.startsWith("review-launch-attempt:")), false);
});

test("Phase 24A derives its complete planning cohort from planned authority surfaces", () => {
  const tempRepo = createB1Repo("codex-harness-phase24a-planning-cohort-");
  setRunPhase(tempRepo, "24A");
  writeText(path.join(tempRepo, ACTIVE_TASK_PATH), [
    "# Phase 24A",
    "",
    "The planned work changes lifecycle authority and runtime approval boundaries.",
    "It reads Project Memory and active Run/Staging persistence/storage records.",
    "",
    "```yaml",
    "planning_review_authority_contract: planned-review-facts.v1",
    "task_id: 24A",
    `task_contract_ref: ${ACTIVE_TASK_PATH}`,
    "review_tier: extra-high",
    "minimum_planned_surface_classes:",
    "  - authority_docs",
    "  - runtime",
    "minimum_planned_risk_classes:",
    "  - authority",
    "  - lifecycle",
    "  - storage",
    "```",
    ""
  ].join("\n"));
  writeText(path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"), [
    "## Phase 24A — Lifecycle prerequisite hardening",
    "",
    "Task:",
    `\`${ACTIVE_TASK_PATH}\``,
    ""
  ].join("\n"));
  fs.copyFileSync(
    path.join(productRoot, "schemas", "planning-review-lens-output.schema.json"),
    path.join(tempRepo, "schemas", "planning-review-lens-output.schema.json")
  );
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    const body = procedureId === "draft-plan" ? [
      "# draft-plan", "", "```yaml",
      "planning_review_facts_contract: planned-review-facts.v1",
      "review_tier: extra-high", "planned_surface_classes:", "  - runtime",
      "planned_risk_classes:", "  - authority", "  - lifecycle", "  - storage", "```", ""
    ].join("\n") : `# ${procedureId}\n`;
    recordProcedure(tempRepo, "run-0001", procedureId, body);
  }
  const operator = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(operator, "Phase 24A cohort derivation status");
  assert.match(operator.stdout, /current_stage: PLANNING_REVIEW_BUNDLE_REQUIRED/);
  assert.match(operator.stdout, /required_evidence: \["plan-review","architecture-review","db-storage-review"\]/);
  assert.match(operator.stdout, /required_planning_review_set: plan-review,architecture-review,db-storage-review/);

  const manifestPath = writeManualFile(tempRepo, "run-0001", "partial-lenses.json", JSON.stringify({
    schema_version: 1, bundle_kind: "candidate", predecessor_cohort_id: null,
    required_lens_ids: ["plan-review"], carried_lens_refs: []
  }));
  const requestPath = writeManualFile(tempRepo, "run-0001", "planning-bundle-request.md", "Review the exact candidate.\n");
  const rejected = runCli([
    "run", "launch-review", "--run", "run-0001", "--bundle", "planning",
    "--lens-manifest", manifestPath, "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/planning-bundle.json", "--dry-run"
  ], { cwd: tempRepo });
  assertFailure(rejected, "partial Phase 24A planning cohort manifest");
  assert.match(rejected.stderr, /planning_review_lens_manifest_required_set_mismatch:plan-review,architecture-review,db-storage-review/);
  assert.equal(readRun(tempRepo).evidence.some((entry) => entry.kind.startsWith("review-launch-attempt:")), false);
});

test("registered timing policy supplies defaults, permits bounded overrides, and rejects unsafe overrides", () => {
  const tempRepo = createB1Repo("codex-harness-review-timing-policy-");
  const requestPath = writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const common = [
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", requestPath, "--output", ".harness/runs/run-0001/manual/implementation-review.md", "--dry-run"
  ];

  const defaultResult = runCli(common, { cwd: tempRepo });
  assertSuccess(defaultResult, "registered timing default");
  assert.match(defaultResult.stdout, /timeout seconds: 5/);
  assert.match(defaultResult.stdout, /stale-after seconds: 1/);
  assert.match(defaultResult.stdout, /termination policy: terminal_completion_only/);
  const policy = reviewPolicyModule.readProcedureExecutionPolicy(tempRepo);
  for (const procedureId of ["plan-review", "architecture-review", "db-storage-review", "implementation-review", "fix-pass-review"]) {
    const timing = reviewPolicyModule.resolveReviewLaunchTiming(policy, [procedureId]);
    assert.equal(timing.timeout_seconds, 5, `${procedureId} uses registered timeout authority`);
    assert.equal(timing.stale_after_seconds, 1, `${procedureId} keeps stale detection distinct`);
    assert.equal(timing.termination_policy, "terminal_completion_only");
  }

  const overrideResult = runCli([...common, "--timeout-seconds", "10", "--stale-after-seconds", "2"], { cwd: tempRepo });
  assertSuccess(overrideResult, "bounded timing override");
  assert.match(overrideResult.stdout, /timeout seconds: 10/);
  assert.match(overrideResult.stdout, /stale-after seconds: 2/);

  for (const args of [["--timeout-seconds", "4"], ["--timeout-seconds", "120"], ["--stale-after-seconds", "5"]]) {
    const invalid = runCli([...common, ...args], { cwd: tempRepo });
    assertFailure(invalid, `unsafe timing override ${args.join(" ")}`);
    assert.match(invalid.stderr, /registered policy range|must remain below/);
  }

  const policyPath = path.join(tempRepo, "skills", "self-hosting", "procedure-execution-policy.json");
  const malformed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  malformed.procedures.find((entry) => entry.procedure_id === "plan-review").review_launch.unbounded = true;
  fs.writeFileSync(policyPath, `${JSON.stringify(malformed, null, 2)}\n`);
  assert.throws(
    () => reviewPolicyModule.readProcedureExecutionPolicy(tempRepo),
    /unknown properties: unbounded/
  );
  malformed.procedures.find((entry) => entry.procedure_id === "plan-review").review_launch = {
    timeout_seconds: 5,
    stale_after_seconds: 1,
    timeout_override: { minimum_seconds: 5, maximum_seconds: 60 },
    stale_after_override: { minimum_seconds: 1, maximum_seconds: 4 },
    termination_policy: "terminal_completion_only"
  };
  fs.writeFileSync(policyPath, `${JSON.stringify(malformed, null, 2)}\n`);
  assert.doesNotThrow(() => reviewPolicyModule.readProcedureExecutionPolicy(tempRepo));

  const schemaPath = path.join(tempRepo, "schemas", "self-hosting-procedure-execution-policy.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  schema.properties.procedures.items.properties.review_launch.properties.timeout_seconds.minimum = 6;
  fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
  assert.throws(
    () => reviewPolicyModule.readProcedureExecutionPolicy(tempRepo),
    /timeout_seconds must be at least 6/
  );
});

test("a written review output is not lifecycle evidence before terminal completion", async () => {
  const tempRepo = createB1Repo("codex-harness-review-terminal-only-");
  const requestPath = writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const outputPath = ".harness/runs/run-0001/manual/implementation-review.md";
  const launched = launchReviewAsync(tempRepo, [
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", requestPath, "--output", outputPath
  ], {
    ...createFakeCodexBin(tempRepo, "write-then-sleep"),
    CODEX_FAKE_SLEEP_MS: "1500",
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  });
  await waitForFile(path.join(tempRepo, outputPath));
  const during = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(during, "operator status before reviewer termination");
  assert.match(during.stdout, /current_stage: REVIEW_LAUNCH_IN_PROGRESS/);
  assert.equal(readRun(tempRepo).evidence.some((entry) => entry.kind === "procedure:implementation-review"), false);
  const completed = await launched.completed;
  assert.equal(completed.status, 0, completed.stderr);
  assert.ok(readRun(tempRepo).evidence.some((entry) => entry.kind === "procedure:implementation-review"));
});

test("phase 23.8.6F evaluation launch requires separate exact binding-version and profile identities", () => {
  const tempRepo = createB1Repo("codex-harness-f-review-candidate-identity-");
  const requestPath = writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this candidate");
  const policy = JSON.parse(fs.readFileSync(path.join(tempRepo, "skills/self-hosting/review-route-policy.json"), "utf8"));
  const binding = JSON.parse(fs.readFileSync(path.join(tempRepo, "skills/self-hosting/codex-reference-binding.json"), "utf8"));
  const candidate = binding.profiles.find((entry) => entry.status === "candidate");
  assert.ok(candidate, "fixture must contain a candidate profile");
  const common = [
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/ignored-approved-output.md",
    "--evaluation-mode", "shadow",
    "--approved-attempt", "approved-attempt",
    "--evaluation-case", "candidate-identity",
    "--candidate-policy-version", policy.policy_version,
    "--candidate-output", ".harness/runs/run-0001/manual/candidate-output.md",
    "--dry-run"
  ];

  const conflated = runCli([
    ...common,
    "--candidate-binding-version", candidate.profile_id,
    "--candidate-profile-id", candidate.profile_id
  ], { cwd: tempRepo });
  assertFailure(conflated, "profile ID must not stand in for binding version");
  assert.match(conflated.stderr, /REVIEW_CANDIDATE_VERSION_UNAVAILABLE/);

  const missingProfile = runCli([
    ...common,
    "--candidate-binding-version", binding.binding_version
  ], { cwd: tempRepo });
  assertFailure(missingProfile, "candidate profile ID is independently required");
  assert.match(missingProfile.stderr, /--candidate-profile-id is required/);

  const exact = runCli([
    ...common,
    "--candidate-binding-version", binding.binding_version,
    "--candidate-profile-id", candidate.profile_id
  ], { cwd: tempRepo });
  assertFailure(exact, "exact candidate identities advance to baseline validation");
  assert.match(exact.stderr, /REVIEW_EVALUATION_APPROVED_ATTEMPT_MISSING/);
});

test("phase 23.8.6B1 launch-review records valid implementation-review artifact and launch attempt", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-success-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const env = {
    ...createFakeCodexBin(tempRepo, "file"),
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  };

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: tempRepo, env });

  assertSuccess(result, "launch-review success");
  assert.match(result.stdout, /launch status: success/);
  assert.match(result.stdout, /artifact path: evidence\/implementation-review-/);
  const run = readRun(tempRepo);
  assert.ok(run.evidence.some((entry) => entry.kind === "review-launch-attempt:implementation-review"));
  assert.ok(run.evidence.some((entry) => entry.kind === "procedure:implementation-review"));
  assert.ok(run.review_results.some((entry) => entry.source === "procedure:implementation-review" && entry.status === "PASS"));
  const attempt = readLatestAttempt(tempRepo);
  assert.equal(attempt.failure_classification, "REVIEW_COMPLETED_ARTIFACT_PRESENT");
  assert.equal(attempt.artifact_valid, true);
  assert.equal(attempt.run_id, "run-0001");
  assert.match(attempt.run_instance_id, /^[0-9a-f-]{36}$/);
  assert.equal(attempt.project_run_id, attempt.run_instance_id);
  assert.equal(attempt.provenance_source, "expected_output_file");
  assert.match(attempt.launch_command, /codex exec/);
  assert.equal(attempt.sandbox_mode, "read-only");
  assert.equal(attempt.output_mode, "file");
  assert.match(attempt.request_artifact_hash, /^sha256:/);
  const invocation = run.review_routing_records.find((entry) => entry.record_kind === "review_invocation" && entry.status === "success");
  const replay = run.review_routing_records.find((entry) => entry.record_kind === "review_replay_packet");
  assert.ok(invocation);
  assert.ok(replay);
  for (const field of [
    "route_class", "binding_profile_id", "context_mode", "usage_ref", "deterministic_evidence_state",
    "parallel_policy", "budget_class", "required_semantic_reviews", "escalation_triggers", "independence_mode"
  ]) {
    assert.deepEqual(replay.payload[field], invocation.payload[field], `replay ${field} must match the actual producer invocation`);
  }
  const database = sqliteModule.openSqliteDatabase(path.join(tempRepo, ".harness", "runs", "run-0001", "staging.sqlite"));
  try {
    const usagePayload = database.prepare(
      "SELECT source_run_id, source_phase_id, kind, media_type FROM payload_index WHERE payload_id = ?"
    ).get(invocation.payload.usage_ref);
    assert.equal(usagePayload.source_run_id, "run-0001");
    assert.equal(usagePayload.source_phase_id, "23.8.6B1");
    assert.equal(usagePayload.kind, "review-usage-facts");
    assert.equal(usagePayload.media_type, "application/json");
  } finally {
    database.close();
  }
});

test("phase 23.8.6B1 failed plan-review launch is projected into operator status", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-failure-");
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    const artifact = writeManualFile(tempRepo, "run-0001", `${procedureId}.md`, `# ${procedureId}\n`);
    assertSuccess(
      runCli(["run", "record-procedure", "--run", "run-0001", "--procedure", procedureId, "--file", artifact], { cwd: tempRepo }),
      `record ${procedureId}`
    );
  }
  writeManualFile(tempRepo, "run-0001", "plan-review-request.md", "review this plan");
  const env = createFakeCodexBin(tempRepo, "invalid");

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "plan-review",
    "--request",
    ".harness/runs/run-0001/manual/plan-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/plan-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: tempRepo, env });

  assertFailure(result, "launch-review invalid artifact");
  assert.match(result.stdout, /launch status: invalid_artifact/);
  assert.match(result.stdout, /failure classification: REVIEW_ARTIFACT_INVALID/);

  const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(status, "operator status after failed review launch");
  assert.match(status.stdout, /current_stage: REVIEW_LAUNCH_BLOCKED/);
  assert.match(status.stdout, /next_procedure_id: plan-review/);
  assert.match(status.stdout, /stop_reason: REVIEW_ARTIFACT_INVALID/);
});

test("Phase 24A launches plan review from its exact draft plan before owner approval", () => {
  const tempRepo = createB1Repo("codex-harness-24a-plan-review-");
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
  }
  setRunPhase(tempRepo, "24A");
  const requestPath = writeManualFile(tempRepo, "run-0001", "plan-review-request.md", "review the exact draft plan");
  const env = {
    ...createFakeCodexBin(tempRepo, "file"),
    CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown()
  };

  const result = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/plan-review.md",
    "--timeout-seconds", "5"
  ], { cwd: tempRepo, env });

  assertSuccess(result, "Phase 24A pre-approval plan-review launch");
  const run = readRun(tempRepo);
  assert.equal(run.phase_id, "24A");
  assert.equal(run.approvals.length, 0, "the review must precede owner approval");
  assert.ok(run.evidence.some((entry) => entry.kind === "procedure:draft-plan"));
  assert.ok(run.evidence.some((entry) => entry.kind === "procedure:plan-review"));
  assert.ok(run.review_results.some((entry) => entry.source === "procedure:plan-review" && entry.status === "PASS"));
});

test("Phase 24A rejects a manually recorded plan-review as approval authority", () => {
  const tempRepo = createB1Repo("codex-harness-24a-manual-plan-review-authority-");
  setRunPhase(tempRepo, "24A");
  let planPath = "";
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    const procedurePath = recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
    if (procedureId === "draft-plan") planPath = procedurePath;
  }
  recordProcedure(tempRepo, "run-0001", "plan-review", planReviewMarkdown());
  const approval = runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", planPath,
    "--approver", "owner", "--reason", "Manual review must not substitute for terminal launch provenance."
  ], { cwd: tempRepo });
  assertFailure(approval, "manual plan review cannot become Phase 24A approval authority");
  assert.match(approval.stderr, /PLAN_APPROVAL_TERMINAL_REVIEW_PROVENANCE_MISSING/);
});

test("Phase 24A automatic terminal plan review binds approval and direct baseline end to end", () => {
  const tempRepo = createB1Repo("codex-harness-24a-automatic-baseline-");
  const planEnv = createFakeCodexBin(tempRepo, "file");
  assertSuccess(runCommand("git", ["add", "fake-bin"], { cwd: tempRepo }), "stage committed fake reviewer");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture reviewer"], { cwd: tempRepo }), "commit fake reviewer");
  setRunPhase(tempRepo, "24A");
  let planPath = "";
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    const procedureBody = procedureId === "draft-plan"
      ? "# draft-plan\n\n## Effective Validation\n\n1. `git diff --check`\n"
      : `# ${procedureId}\n`;
    const procedurePath = recordProcedure(tempRepo, "run-0001", procedureId, procedureBody);
    if (procedureId === "draft-plan") planPath = procedurePath;
  }
  const requestPath = writeManualFile(tempRepo, "run-0001", "automatic-plan-review-request.md", "review the current effective plan");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/automatic-plan-review.md"
  ], {
    cwd: tempRepo,
    env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown() }
  }), "automatic terminal Phase 24A plan review");

  const roots = stagingModule.resolveHarnessRoots(tempRepo);
  const staging = new stagingModule.RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  const reviewedRun = readRun(tempRepo);
  const reviewArtifact = reviewedRun.evidence.find((entry) => entry.kind === "procedure:plan-review")?.artifact_id;
  const planArtifact = reviewedRun.evidence.find((entry) => entry.kind === "procedure:draft-plan")?.artifact_id;
  assert.ok(reviewArtifact && planArtifact, "automatic review and effective plan identities exist");
  const descriptor = staging.readProcedureArtifact(reviewedRun.run_instance_id, "plan-review", reviewArtifact);
  assert.equal(descriptor.reviewed_plan_artifact_id, planArtifact);
  assert.equal(descriptor.reviewed_plan_content_hash, planArtifact.slice("sha256:".length));
  assert.equal(descriptor.reviewed_evidence_artifact_id, planArtifact);
  const invocation = reviewedRun.review_routing_records.find((entry) =>
    entry.record_kind === "review_invocation" && entry.payload.procedure_id === "plan-review");
  assert.equal(invocation.status, "success");
  assert.equal(invocation.payload.artifact_id, reviewArtifact);
  assert.equal(invocation.payload.terminal_exit_code, 0);
  assert.match(invocation.payload.review_claim_id, /^review-launch-/);
  assert.match(invocation.payload.review_claim_owner_token_hash, /^sha256:[a-f0-9]{64}$/);

  assertSuccess(runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", planPath,
    "--approver", "owner", "--reason", "Approve the automatic terminal review."
  ], { cwd: tempRepo }), "approve exact automatic terminal review");
  const approved = readRun(tempRepo).approvals.at(-1);
  assertSuccess(bindImplementationBaseline(tempRepo, planPath, approved.approval_id, readHead(tempRepo)), "bind direct reviewed source after automatic review");

  const implementationRequest = writeManualFile(tempRepo, "run-0001", "automatic-implementation-review-request.md", "review the approved implementation");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", implementationRequest,
    "--output", ".harness/runs/run-0001/manual/automatic-implementation-review.md"
  ], {
    cwd: tempRepo,
    env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS") }
  }), "implementation review after exact automatic review baseline");
});

test("a later approved plan supersedes its predecessor baseline through the registered binder", () => {
  const tempRepo = createB1Repo("codex-harness-later-plan-baseline-");
  const planEnv = createFakeCodexBin(tempRepo, "file");
  assertSuccess(runCommand("git", ["add", "fake-bin"], { cwd: tempRepo }), "stage reviewer");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture reviewer"], { cwd: tempRepo }), "commit reviewer");
  setRunPhase(tempRepo, "24A");
  for (const procedureId of ["task-intake", "task-prompt-writer"]) {
    recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
  }
  const firstPlan = recordProcedure(tempRepo, "run-0001", "draft-plan", "# first plan\n\n## Effective Validation\n\n1. `git diff --check`\n");
  const firstRequest = writeManualFile(tempRepo, "run-0001", "first-review.md", "review first plan");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", firstRequest, "--output", ".harness/runs/run-0001/manual/first-review-output.md"
  ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown() } }), "review first plan");
  assertSuccess(runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", firstPlan,
    "--approver", "owner", "--reason", "approve first plan"
  ], { cwd: tempRepo }), "approve first plan");
  const firstApproval = readRun(tempRepo).approvals.at(-1);
  const firstBinding = bindImplementationBaseline(tempRepo, firstPlan, firstApproval.approval_id, readHead(tempRepo));
  assertSuccess(firstBinding, "bind first baseline");
  assert.match(firstBinding.stdout, /recorded: true/);
  const predecessor = structuredClone(readRun(tempRepo).implementation_baseline_binding);
  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "epoch-a.ts"), "export const epochA = true;\n");
  assertSuccess(runCommand("git", ["add", "src/epoch-a.ts"], { cwd: tempRepo }), "stage epoch-A implementation");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch A implementation"], { cwd: tempRepo }), "commit epoch-A implementation");
  const epochARequest = writeManualFile(tempRepo, "run-0001", "epoch-a-implementation-review-request.md", "review epoch A implementation");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", epochARequest, "--output", ".harness/runs/run-0001/manual/epoch-a-implementation-review.md"
  ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS") } }), "review epoch-A implementation");
  const epochAReview = readRun(tempRepo).review_results.at(-1);
  assert.ok(epochAReview?.created_at);
  const epochA = seedEpochLifecycleEvidence(tempRepo, "epoch-a", epochAReview.created_at);
  assert.ok(Date.parse(epochA.timestamps.review) > Date.parse(predecessor.bound_at));
  const epochAStatus = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(epochAStatus, "operator recognizes epoch-A implementation and verification evidence");
  assert.match(epochAStatus.stdout, /current_stage: VERIFICATION_REVIEW_REQUIRED/);

  const laterPlan = recordProcedure(tempRepo, "run-0001", "plan-amend", "# later effective plan\n\n## Effective Validation\n\n1. `git diff --check`\n");
  const laterRequest = writeManualFile(tempRepo, "run-0001", "later-review.md", "review later plan");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", laterRequest, "--output", ".harness/runs/run-0001/manual/later-review-output.md"
  ], { cwd: tempRepo, env: {
    ...planEnv,
    CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown().replace(
      "source_trace: TASK.md -> active B1 task",
      "source_trace: TASK.md -> later effective plan"
    )
  } }), "review later plan");
  assertSuccess(runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", laterPlan,
    "--approver", "owner", "--reason", "approve later plan"
  ], { cwd: tempRepo }), "approve later plan");
  const laterApproval = readRun(tempRepo).approvals.at(-1);

  const beforeRebind = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(beforeRebind, "operator requires later-plan baseline");
  assert.match(beforeRebind.stdout, /current_stage: IMPLEMENTATION_BASELINE_REQUIRED/);
  const wrongApproval = bindImplementationBaseline(tempRepo, laterPlan, firstApproval.approval_id, readHead(tempRepo));
  assertFailure(wrongApproval, "predecessor approval cannot supersede baseline");
  assert.match(wrongApproval.stderr, /IMPLEMENTATION_BASELINE_APPROVAL_MISMATCH/);

  const supersedingBinding = bindImplementationBaseline(tempRepo, laterPlan, laterApproval.approval_id, readHead(tempRepo));
  assertSuccess(supersedingBinding, "supersede exact later baseline");
  assert.match(supersedingBinding.stdout, /recorded: true/);
  const rebound = readRun(tempRepo);
  assert.equal(rebound.implementation_baseline_binding.approval_id, laterApproval.approval_id);
  assert.equal(rebound.implementation_baseline_history.length, 1);
  assert.deepEqual(rebound.implementation_baseline_history[0], predecessor);
  assert.ok(Date.parse(rebound.implementation_baseline_binding.bound_at) > Date.parse(epochA.timestamps.closeout));
  assert.ok(rebound.steps.some((step) => step.step_id === "step-epoch-a"));
  assert.ok(rebound.command_results.some((result) => result.command_result_id === "command-epoch-a"));
  assert.ok(rebound.artifacts.some((artifact) => artifact.artifact_id === epochA.artifactId));
  assert.ok(rebound.review_results.some((result) => result.review_result_id === "review-epoch-a"));
  assert.ok(rebound.verification_results.some((result) => result.verification_result_id === "verification-epoch-a"));
  assert.ok(rebound.delivery_facts.some((fact) => fact.delivery_fact_id === "delivery-epoch-a"));
  assert.ok(rebound.closeout_receipts.some((receipt) => receipt.receipt_id === "closeout-epoch-a"));
  const ready = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(ready, "operator after superseding baseline");
  assert.match(ready.stdout, /current_stage: IMPLEMENTATION_READY/);
  const beforeCloseoutDryRun = fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  const staleEpochCloseout = runCli(["run", "closeout", "--run", "run-0001", "--dry-run"], { cwd: tempRepo });
  assertSuccess(staleEpochCloseout, "closeout dry-run after superseding baseline");
  assert.match(staleEpochCloseout.stdout, /closeout: BLOCKED/);
  assert.match(staleEpochCloseout.stdout, /Verification is missing|Review is MISSING/);
  assert.deepEqual(
    fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json")),
    beforeCloseoutDryRun,
    "closeout dry-run must not mutate predecessor history or the superseding epoch"
  );
  const replay = bindImplementationBaseline(tempRepo, laterPlan, laterApproval.approval_id, readHead(tempRepo));
  assertSuccess(replay, "replay current exact baseline");
  assert.match(replay.stdout, /recorded: false/);

  const blockerRoots = stagingModule.resolveHarnessRoots(tempRepo);
  const blockerStaging = new stagingModule.RunStagingDatabase(
    blockerRoots.targetRoot,
    blockerRoots.projectRoot,
    "run-0001"
  );
  const runWithCarriedBlocker = blockerStaging.mutateRun("run-0001", (run) => ({
    ...run,
    findings: [...run.findings, {
      finding_id: "epoch-a-open-blocker",
      title: "Epoch A unresolved blocker",
      severity: "high",
      status: "open",
      blocking: true,
      created_at: epochA.timestamps.review,
      evidence_refs: []
    }]
  }));
  writeText(
    path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"),
    `${JSON.stringify(runWithCarriedBlocker, null, 2)}\n`
  );
  const carriedBlocker = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(carriedBlocker, "operator carries unresolved predecessor blocker into superseding epoch");
  assert.match(carriedBlocker.stdout, /current_stage: BLOCKED/);
  assert.match(carriedBlocker.stdout, /stop_reason: unresolved_predecessor_blocking_findings/);
  assert.ok(blockerStaging.loadRun("run-0001").findings.some((finding) => finding.finding_id === "epoch-a-open-blocker"));

  writeText(path.join(tempRepo, "src", "epoch-b.ts"), "export const epochB = true;\n");
  assertSuccess(runCommand("git", ["add", "src/epoch-b.ts"], { cwd: tempRepo }), "stage epoch-B implementation");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch B implementation"], { cwd: tempRepo }), "commit epoch-B implementation");
  const blockerWithImplementation = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(blockerWithImplementation, "implementation evidence cannot bypass carried predecessor blocker");
  assert.match(blockerWithImplementation.stdout, /current_stage: BLOCKED/);
  assert.match(blockerWithImplementation.stdout, /stop_reason: unresolved_predecessor_blocking_findings/);
  assert.doesNotMatch(blockerWithImplementation.stdout, /next_procedure_id: implementation-review/);

  const runWithResolvedBlocker = blockerStaging.mutateRun("run-0001", (run) => ({
    ...run,
    findings: run.findings.map((finding) => finding.finding_id === "epoch-a-open-blocker"
      ? { ...finding, status: "resolved" }
      : finding)
  }));
  writeText(
    path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"),
    `${JSON.stringify(runWithResolvedBlocker, null, 2)}\n`
  );
  const resolvedBlocker = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(resolvedBlocker, "exact blocker resolution restores current epoch implementation eligibility");
  assert.match(resolvedBlocker.stdout, /current_stage: IMPLEMENTATION_REVIEW_REQUIRED/);
  const boundaryRequest = writeManualFile(tempRepo, "run-0001", "epoch-b-boundary-review-request.md", "review epoch B boundary fixture");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", boundaryRequest, "--output", ".harness/runs/run-0001/manual/epoch-b-boundary-review.md"
  ], { cwd: tempRepo, env: {
    ...planEnv,
    CODEX_FAKE_REVIEW_CONTENT: `${implementationReviewMarkdown("PASS")}\n<!-- epoch-b-boundary -->\n`
  } }), "record boundary implementation-review fixture");
  const boundaryRun = readRun(tempRepo);
  const boundaryArtifactId = [...boundaryRun.evidence].reverse().find((entry) =>
    entry.kind === "procedure:implementation-review"
  )?.artifact_id;
  assert.ok(boundaryArtifactId);
  const roots = stagingModule.resolveHarnessRoots(tempRepo);
  const staging = new stagingModule.RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  const boundaryDescriptor = staging.readProcedureArtifact(
    boundaryRun.run_instance_id,
    "implementation-review",
    boundaryArtifactId
  );
  assert.ok(boundaryDescriptor);
  const boundaryEpochRun = staging.mutateRun("run-0001", (run) => ({
    ...run,
    implementation_baseline_binding: {
      ...run.implementation_baseline_binding,
      bound_at: boundaryDescriptor.recorded_at
    }
  }));
  assert.equal(boundaryEpochRun.implementation_baseline_binding.bound_at, boundaryDescriptor.recorded_at);
  writeText(
    path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"),
    `${JSON.stringify(boundaryEpochRun, null, 2)}\n`
  );
  const boundaryStatus = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(boundaryStatus, "operator rejects boundary-ambiguous review evidence");
  assert.match(boundaryStatus.stdout, /current_stage: IMPLEMENTATION_REVIEW_REQUIRED/);

  const epochBRequest = writeManualFile(tempRepo, "run-0001", "epoch-b-current-review-request.md", "review epoch B implementation");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", epochBRequest, "--output", ".harness/runs/run-0001/manual/epoch-b-current-review.md"
  ], { cwd: tempRepo, env: {
    ...planEnv,
    CODEX_FAKE_REVIEW_CONTENT: `${implementationReviewMarkdown("PASS")}\n<!-- epoch-b-current -->\n`
  } }), "record current epoch-B implementation-review fixture");
  const epochBRun = readRun(tempRepo);
  const epochBArtifactId = [...epochBRun.evidence].reverse().find((entry) =>
    entry.kind === "procedure:implementation-review"
  )?.artifact_id;
  assert.ok(epochBArtifactId);
  const epochBDescriptor = staging.readProcedureArtifact(epochBRun.run_instance_id, "implementation-review", epochBArtifactId);
  assert.ok(epochBDescriptor);
  assert.ok(Date.parse(epochBDescriptor.recorded_at) > Date.parse(epochBRun.implementation_baseline_binding.bound_at));
  const epochBStatus = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(epochBStatus, "operator recognizes post-boundary epoch-B review evidence");
  assert.match(epochBStatus.stdout, /current_stage: VERIFICATION_REVIEW_REQUIRED/);

  const verificationTimestamp = addMilliseconds(epochBDescriptor.recorded_at, 1);
  const runWithCurrentVerification = staging.mutateRun("run-0001", (run) => ({
    ...run,
    verification_results: [...run.verification_results, {
      verification_result_id: "verification-epoch-b-current", status: "pass",
      created_at: verificationTimestamp, summary: "epoch-B current verification",
      source: "self-hosting", artifact_refs: [], command_results: []
    }]
  }));
  writeText(
    path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"),
    `${JSON.stringify(runWithCurrentVerification, null, 2)}\n`
  );
  recordProcedure(tempRepo, "run-0001", "verification-review", verificationReviewMarkdown());
  const verificationReviewedRun = readRun(tempRepo);
  const verificationReviewArtifact = [...verificationReviewedRun.evidence].reverse().find((entry) =>
    entry.kind === "procedure:verification-review"
  );
  assert.ok(verificationReviewArtifact?.artifact_id);
  const verificationDescriptor = staging.readProcedureArtifact(
    verificationReviewedRun.run_instance_id,
    "verification-review",
    verificationReviewArtifact.artifact_id
  );
  assert.ok(verificationDescriptor);
  assert.ok(Date.parse(verificationDescriptor.recorded_at) > Date.parse(verificationReviewedRun.implementation_baseline_binding.bound_at));
  const deliveryTimestamp = addMilliseconds(verificationDescriptor.recorded_at, 1);
  const runWithPreMergeFacts = staging.mutateRun("run-0001", (run) => ({
    ...run,
    delivery_facts: [...run.delivery_facts, {
      delivery_fact_id: "delivery-epoch-b-pr", run_id: run.run_id, fact_kind: "pr",
      source: "fixture", status: "created", recorded_at: deliveryTimestamp,
      summary: "pre-existing PR fact"
    }, {
      delivery_fact_id: "delivery-epoch-b-ci", run_id: run.run_id, fact_kind: "remote_ci",
      source: "fixture", status: "pass", recorded_at: deliveryTimestamp,
      summary: "pre-existing remote CI fact"
    }]
  }));
  writeText(
    path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"),
    `${JSON.stringify(runWithPreMergeFacts, null, 2)}\n`
  );

  const beforeAdmission = fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"));
  const missingAdmission = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(missingAdmission, "missing Phase 24A merge strategy is typed");
  assert.match(missingAdmission.stdout, /current_stage: DELIVERY_MERGE_ADMISSION_REQUIRED/);
  assert.match(missingAdmission.stdout, /stop_reason: merge_strategy_missing/);
  for (const strategy of ["squash", "rebase", "unknown"]) {
    const blocked = runCli([
      "run", "status", "--operator", "--run", "run-0001", "--merge-strategy", strategy
    ], { cwd: tempRepo });
    assertSuccess(blocked, `unsupported ${strategy} strategy is typed`);
    assert.match(blocked.stdout, /current_stage: DELIVERY_MERGE_STRATEGY_BLOCKED/);
    assert.match(blocked.stdout, /stop_reason: merge_strategy_unsupported/);
  }
  const admitted = runCli([
    "run", "status", "--operator", "--run", "run-0001", "--merge-strategy", "merge_commit"
  ], { cwd: tempRepo });
  assertSuccess(admitted, "normal merge commit strategy advances to delivery facts");
  assert.match(admitted.stdout, /current_stage: DELIVERY_FACTS_REVIEW_REQUIRED/);
  assert.match(admitted.stdout, /ALLOWED MERGE METHOD: NORMAL MERGE COMMIT/);
  const repeatedAdmission = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(repeatedAdmission, "repeated admission evaluation");
  assert.equal(repeatedAdmission.stdout, missingAdmission.stdout);
  assert.deepEqual(
    fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json")),
    beforeAdmission,
    "operator admission reads must not mutate run state"
  );
});

test("Phase 24A fix-pass launch selects exactly one current-epoch implementation predecessor", async () => {
  const tempRepo = createB1Repo("codex-harness-phase24a-fix-pass-epoch-");
  setRunPhase(tempRepo, "24A");
  const planEnv = createFakeCodexBin(tempRepo, "file");
  assertSuccess(runCommand("git", ["add", "fake-bin"], { cwd: tempRepo }), "stage epoch fixture reviewer");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch reviewer"], { cwd: tempRepo }), "commit epoch fixture reviewer");
  for (const procedureId of ["task-intake", "task-prompt-writer"]) {
    recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
  }
  const firstPlan = recordProcedure(
    tempRepo,
    "run-0001",
    "draft-plan",
    "# epoch A plan\n\n## Effective Validation\n\n1. `git diff --check`\n"
  );
  const firstPlanRequest = writeManualFile(tempRepo, "run-0001", "epoch-a-plan-review-request.md", "review epoch A plan");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", firstPlanRequest,
    "--output", ".harness/runs/run-0001/manual/epoch-a-plan-review-output.md"
  ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown() } }), "review epoch-A plan");
  assertSuccess(runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", firstPlan,
    "--approver", "owner", "--reason", "approve epoch A plan"
  ], { cwd: tempRepo }), "approve epoch-A plan");
  const firstApproval = readRun(tempRepo).approvals.at(-1);
  assertSuccess(
    bindImplementationBaseline(tempRepo, firstPlan, firstApproval.approval_id, readHead(tempRepo)),
    "bind epoch-A baseline"
  );

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "epoch-a-review.ts"), "export const epochAReview = true;\n");
  assertSuccess(runCommand("git", ["add", "src/epoch-a-review.ts"], { cwd: tempRepo }), "stage epoch-A implementation");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch A implementation review"], { cwd: tempRepo }), "commit epoch-A implementation");
  const epochAImplementationRequest = writeManualFile(tempRepo, "run-0001", "epoch-a-implementation-request.md", "review epoch A");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", epochAImplementationRequest,
    "--output", ".harness/runs/run-0001/manual/epoch-a-implementation-output.md"
  ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("FIX_REQUIRED") } }), "record epoch-A implementation review");
  const afterEpochAImplementation = readRun(tempRepo);
  const epochAArtifactId = [...afterEpochAImplementation.evidence].reverse().find((entry) =>
    entry.kind === "procedure:implementation-review"
  )?.artifact_id;
  const epochAInvocation = [...afterEpochAImplementation.review_routing_records].reverse().find((entry) =>
    entry.record_kind === "review_invocation" && entry.payload.procedure_id === "implementation-review"
  );
  assert.ok(epochAArtifactId);
  assert.ok(epochAInvocation);

  writeText(path.join(tempRepo, "src", "epoch-a-review.ts"), "export const epochAReview = \"fixed\";\n");
  assertSuccess(runCommand("git", ["add", "src/epoch-a-review.ts"], { cwd: tempRepo }), "stage epoch-A fix");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch A fix pass"], { cwd: tempRepo }), "commit epoch-A fix");
  const epochAFixRequest = writeManualFile(tempRepo, "run-0001", "epoch-a-fix-pass-request.md", "review epoch A fix");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "fix-pass-review",
    "--request", epochAFixRequest,
    "--output", ".harness/runs/run-0001/manual/epoch-a-fix-pass-output.md"
  ], { cwd: tempRepo, env: { ...planEnv, CODEX_FAKE_REVIEW_CONTENT: fixPassReviewMarkdown("FIX_REQUIRED") } }), "record failed epoch-A fix-pass history");

  const roots = stagingModule.resolveHarnessRoots(tempRepo);
  const staging = new stagingModule.RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  const resolvedEpochA = staging.mutateRun("run-0001", (run) => ({
    ...run,
    findings: run.findings.map((finding) => finding.status === "open" ? { ...finding, status: "resolved" } : finding)
  }));
  writeText(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(resolvedEpochA, null, 2)}\n`);

  const laterPlan = recordProcedure(tempRepo, "run-0001", "plan-amend", "# epoch B plan\n\n## Effective Validation\n\n1. `git diff --check`\n");
  const laterPlanRequest = writeManualFile(tempRepo, "run-0001", "epoch-b-plan-review-request.md", "review epoch B plan");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", laterPlanRequest,
    "--output", ".harness/runs/run-0001/manual/epoch-b-plan-review-output.md"
  ], { cwd: tempRepo, env: {
    ...planEnv,
    CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown().replace(
      "source_trace: TASK.md -> active B1 task",
      "source_trace: TASK.md -> epoch B plan"
    )
  } }), "review epoch-B plan");
  assertSuccess(runCli([
    "run", "approve-plan", "--run", "run-0001", "--plan", laterPlan,
    "--approver", "owner", "--reason", "approve epoch B plan"
  ], { cwd: tempRepo }), "approve epoch-B plan");
  const laterApproval = readRun(tempRepo).approvals.at(-1);
  assertSuccess(
    bindImplementationBaseline(tempRepo, laterPlan, laterApproval.approval_id, readHead(tempRepo)),
    "bind superseding epoch-B baseline"
  );
  const epochBBoundRun = readRun(tempRepo);
  const epochBBoundAt = Date.parse(epochBBoundRun.implementation_baseline_binding.bound_at);
  assert.ok(Number.isFinite(epochBBoundAt));
  assert.ok(epochBBoundRun.review_results.some((entry) => entry.source.includes("implementation-review") && Date.parse(entry.created_at) <= epochBBoundAt));
  assert.ok(epochBBoundRun.review_routing_records.some((entry) =>
    entry.record_kind === "review_invocation"
    && entry.payload.procedure_id === "implementation-review"
    && Date.parse(entry.created_at) <= epochBBoundAt
  ));

  writeText(path.join(tempRepo, "src", "epoch-b-review.ts"), "export const epochBReview = true;\n");
  assertSuccess(runCommand("git", ["add", "src/epoch-b-review.ts"], { cwd: tempRepo }), "stage epoch-B implementation");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch B implementation review"], { cwd: tempRepo }), "commit epoch-B implementation");
  const epochBImplementationRequest = writeManualFile(tempRepo, "run-0001", "epoch-b-implementation-request.md", "review epoch B");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", epochBImplementationRequest,
    "--output", ".harness/runs/run-0001/manual/epoch-b-implementation-output.md"
  ], { cwd: tempRepo, env: {
    ...planEnv,
    CODEX_FAKE_REVIEW_CONTENT: `${implementationReviewMarkdown("FIX_REQUIRED")}\n<!-- epoch-b-current -->\n`
  } }), "record epoch-B implementation review");
  const afterEpochBImplementation = readRun(tempRepo);
  const epochBArtifactId = [...afterEpochBImplementation.evidence].reverse().find((entry) =>
    entry.kind === "procedure:implementation-review"
  )?.artifact_id;
  const epochBInvocation = [...afterEpochBImplementation.review_routing_records].reverse().find((entry) =>
    entry.record_kind === "review_invocation" && entry.payload.procedure_id === "implementation-review"
  );
  assert.ok(epochBArtifactId);
  assert.ok(epochBInvocation);
  assert.notEqual(epochBArtifactId, epochAArtifactId);
  assert.notEqual(epochBInvocation.record_id, epochAInvocation.record_id);

  writeText(path.join(tempRepo, "src", "epoch-b-review.ts"), "export const epochBReview = \"fixed\";\n");
  assertSuccess(runCommand("git", ["add", "src/epoch-b-review.ts"], { cwd: tempRepo }), "stage epoch-B fix");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture epoch B fix pass"], { cwd: tempRepo }), "commit epoch-B fix");
  const epochBFixRequest = writeManualFile(tempRepo, "run-0001", "epoch-b-fix-pass-request.md", "review epoch B fix");
  const dryRunOptions = {
    runId: "run-0001",
    procedureId: "fix-pass-review",
    requestPath: epochBFixRequest,
    outputPath: ".harness/runs/run-0001/manual/epoch-b-fix-pass-output.md",
    dryRun: true
  };
  const historyPreservingDryRun = await runtimeModule.launchRuntimeReview(tempRepo, dryRunOptions);
  assert.equal(historyPreservingDryRun.observation.status, "dry_run");
  assert.equal(historyPreservingDryRun.observation.pass_kind, "fix_pass_review");
  assert.equal(historyPreservingDryRun.observation.predecessor_review_artifact_id, epochBArtifactId);
  assert.equal(
    historyPreservingDryRun.observation.predecessor_review_attempt_id,
    epochBInvocation.payload.canonical_attempt_id ?? epochBInvocation.payload.attempt_id
  );

  const historicalRun = readRun(tempRepo);
  const controlRun = staging.mutateRun("run-0001", (run) => ({
    ...run,
    review_results: run.review_results.filter((entry) =>
      !["procedure:implementation-review", "procedure:fix-pass-review"].includes(entry.source)
      || Date.parse(entry.created_at) > epochBBoundAt
    ),
    review_routing_records: run.review_routing_records.filter((entry) =>
      entry.record_kind !== "review_invocation"
      || !["implementation-review", "fix-pass-review"].includes(String(entry.payload.procedure_id))
      || Date.parse(entry.created_at) > epochBBoundAt
    )
  }));
  writeText(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(controlRun, null, 2)}\n`);
  const historyRemovedControl = await runtimeModule.launchRuntimeReview(tempRepo, dryRunOptions);
  assert.equal(
    historyPreservingDryRun.observation.route_decision_id,
    historyRemovedControl.observation.route_decision_id,
    "epoch-A pass index and failure count must not contaminate epoch-B routing"
  );

  const restoredRun = staging.mutateRun("run-0001", (run) => ({
    ...run,
    review_results: historicalRun.review_results,
    review_routing_records: historicalRun.review_routing_records
  }));
  writeText(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(restoredRun, null, 2)}\n`);
  assert.equal(restoredRun.review_results.length, historicalRun.review_results.length);
  assert.equal(restoredRun.review_routing_records.length, historicalRun.review_routing_records.length);
  assert.ok(restoredRun.review_results.some((entry) => entry.source === "procedure:fix-pass-review" && Date.parse(entry.created_at) <= epochBBoundAt));
});

test("the bounded Phase 24A timestamp epoch bridge does not filter non-24A lifecycle evidence", () => {
  const tempRepo = createB1Repo("codex-harness-non-24a-epoch-isolation-");
  setRunPhase(tempRepo, "24A");
  prepareApprovedB1Plan(tempRepo);
  const approved = readRun(tempRepo).approvals.at(-1);
  const baseline = bindImplementationBaseline(
    tempRepo,
    ".harness/runs/run-0001/manual/draft-plan.md",
    approved.approval_id,
    readHead(tempRepo)
  );
  assertSuccess(baseline, "bind non-24A implementation baseline");
  setRunPhase(tempRepo, "23.8.6B1");
  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "non-24a.ts"), "export const non24A = true;\n");
  assertSuccess(runCommand("git", ["add", "src/non-24a.ts"], { cwd: tempRepo }), "stage non-24A implementation");
  assertSuccess(runCommand("git", ["commit", "-m", "fixture non-24A implementation"], { cwd: tempRepo }), "commit non-24A implementation");
  const requestPath = writeManualFile(tempRepo, "run-0001", "non-24a-review-request.md", "review non-24A implementation");
  assertSuccess(runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", requestPath, "--output", ".harness/runs/run-0001/manual/non-24a-review.md"
  ], { cwd: tempRepo, env: {
    ...createFakeCodexBin(tempRepo, "file"),
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  } }), "record non-24A implementation review");
  const reviewed = readRun(tempRepo);
  const reviewArtifact = [...reviewed.evidence].reverse().find((entry) =>
    entry.kind === "procedure:implementation-review"
  );
  assert.ok(reviewArtifact?.artifact_id);
  const roots = stagingModule.resolveHarnessRoots(tempRepo);
  const staging = new stagingModule.RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  const descriptor = staging.readProcedureArtifact(
    reviewed.run_instance_id,
    "implementation-review",
    reviewArtifact.artifact_id
  );
  assert.ok(descriptor);
  const timestampShifted = staging.mutateRun("run-0001", (run) => ({
    ...run,
    implementation_baseline_binding: {
      ...run.implementation_baseline_binding,
      bound_at: addMilliseconds(descriptor.recorded_at, 1)
    }
  }));
  writeText(
    path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"),
    `${JSON.stringify(timestampShifted, null, 2)}\n`
  );
  const operator = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(operator, "non-24A evidence remains governed by existing lifecycle semantics");
  assert.match(operator.stdout, /current_stage: VERIFICATION_REVIEW_REQUIRED/);
});

test("plan-review accepts Markdown-formatted durable decision tokens", () => {
  const tempRepo = createB1Repo("codex-harness-markdown-plan-decision-");
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
  }
  const requestPath = writeManualFile(tempRepo, "run-0001", "formatted-plan-review-request.md", "review the plan");
  const result = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/formatted-plan-review.md"
  ], {
    cwd: tempRepo,
    env: {
      ...createFakeCodexBin(tempRepo, "file"),
      CODEX_FAKE_REVIEW_CONTENT: markdownFormattedPlanReviewMarkdown()
    }
  });

  assertSuccess(result, "Markdown-formatted plan review decision");
  assert.equal(readRun(tempRepo).review_results.at(-1).status, "PASS");
});

test("fresh plan-review launch carries named findings from an amended prior review", () => {
  const tempRepo = createB1Repo("codex-harness-named-plan-findings-");
  for (const procedureId of ["task-intake", "task-prompt-writer", "draft-plan"]) {
    recordProcedure(tempRepo, "run-0001", procedureId, `# ${procedureId}\n`);
  }
  recordProcedure(tempRepo, "run-0001", "plan-review", amendRequiredPlanReviewMarkdown());
  recordProcedure(tempRepo, "run-0001", "plan-amend", "# effective amended plan\n");
  const requestPath = writeManualFile(tempRepo, "run-0001", "fresh-plan-review-request.md", "review the amended plan");
  const result = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "plan-review",
    "--request", requestPath,
    "--output", ".harness/runs/run-0001/manual/fresh-plan-review.md"
  ], {
    cwd: tempRepo,
    env: {
      ...createFakeCodexBin(tempRepo, "file"),
      CODEX_FAKE_REVIEW_CONTENT: planReviewMarkdown()
    }
  });

  assertSuccess(result, "fresh review after named finding amendment");
  const invocation = readRun(tempRepo).review_routing_records.find((entry) =>
    entry.record_kind === "review_invocation" && entry.status === "success");
  assert.ok(invocation);
});

test("phase 23.8.6B1 launch-review persists stdout fallback as validated artifact", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-stdout-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const env = {
    ...createFakeCodexBin(tempRepo, "stdout"),
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  };

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: tempRepo, env });

  assertSuccess(result, "launch-review stdout fallback");
  const attempt = readLatestAttempt(tempRepo);
  assert.equal(attempt.provenance_source, "stdout_fallback");
  assert.equal(attempt.artifact_valid, true);
  assert.ok(attempt.payload_refs.some((entry) => entry.kind === "review-launch-stdout_fallback"));
  assert.equal(fs.readFileSync(path.join(tempRepo, ".harness/runs/run-0001/manual/implementation-review.md"), "utf8"), implementationReviewMarkdown("PASS"));
});

test("phase 23.8.6B1 launch-review accepts supported final-message JSON fallback", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-json-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const env = {
    ...createFakeCodexBin(tempRepo, "json"),
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  };

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: tempRepo, env });

  assertSuccess(result, "launch-review final-message fallback");
  const attempt = readLatestAttempt(tempRepo);
  assert.equal(attempt.provenance_source, "final_message_fallback");
  assert.ok(attempt.payload_refs.some((entry) => entry.kind === "review-launch-final_message_fallback"));
});

test("phase 23.8.6B1 launch-review classifies auth or model failures canonically", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-auth-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const env = {
    ...createFakeCodexBin(tempRepo, "file"),
    CODEX_FAKE_EXIT: "1",
    CODEX_FAKE_STDERR: "model access forbidden"
  };

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: tempRepo, env });

  assertFailure(result, "launch-review auth failure");
  assert.match(result.stdout, /failure classification: REVIEW_MODEL_OR_AUTH_FAILURE/);
  assert.equal(readLatestAttempt(tempRepo).failure_classification, "REVIEW_MODEL_OR_AUTH_FAILURE");
});

test("phase 23.8.6E accepts a silent file-output reviewer after the stale interval without SIGTERM", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-stale-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const env = {
    ...createFakeCodexBin(tempRepo, "silent-file-after-delay"),
    CODEX_FAKE_SLEEP_MS: "1200",
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS"),
    CODEX_FAKE_SIGTERM_SENTINEL: path.join(tempRepo, "unexpected-sigterm.txt")
  };

  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "10",
    "--stale-after-seconds",
    "1"
  ], { cwd: tempRepo, env });

  assertSuccess(result, "launch-review silent delayed artifact");
  const attempt = readLatestAttempt(tempRepo);
  assert.equal(attempt.failure_classification, "REVIEW_COMPLETED_ARTIFACT_PRESENT");
  assert.ok(attempt.progress_unknown_at, "stale interval must be recorded as a monitoring-only observation");
  assert.equal(attempt.terminal_signal, undefined, "silence must not send SIGTERM");
  assert.equal(fs.existsSync(env.CODEX_FAKE_SIGTERM_SENTINEL), false, "silent file output must not receive SIGTERM");
});

test("phase 23.8.6E defaults omitted terminal policy and rejects a concurrent review launch", async () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-ownership-");
  const registryPath = path.join(tempRepo, "skills", "self-hosting", "procedure-registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  for (const procedure of registry.procedures) {
    delete procedure.review_launch_profile?.termination_policy;
  }
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const outputPath = ".harness/runs/run-0001/manual/implementation-review.md";
  const sentinelPath = path.join(tempRepo, "reviewer-spawned.txt");
  const env = {
    ...createFakeCodexBin(tempRepo, "silent-file-after-delay"),
    CODEX_FAKE_SENTINEL: sentinelPath,
    CODEX_FAKE_SLEEP_MS: "10000",
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  };
  const args = [
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output", outputPath, "--stale-after-seconds", "1", "--timeout-seconds", "30"
  ];

  const launched = launchReviewAsync(tempRepo, args, env);
  await waitForFile(sentinelPath);
  const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(status, "operator status while review owner is active");
  assert.match(status.stdout, /current_stage: REVIEW_LAUNCH_IN_PROGRESS/);

  const replacement = runCli(args, { cwd: tempRepo, env });
  assertFailure(replacement, "concurrent review launch");
  assert.match(replacement.stderr, /REVIEW_LAUNCH_OWNERSHIP_ACTIVE/);

  const deliveryImportPath = writeManualFile(tempRepo, "run-0001", "blocked-delivery-facts.json", JSON.stringify({
    facts: [{
      fact_kind: "remote_ci",
      source: "fixture",
      status: "pass",
      recorded_at: "2026-07-21T00:00:00.000Z",
      summary: "must not write while review ownership is active",
      excerpt: "payload must not be persisted"
    }]
  }));
  const blockedDelivery = runCli(["memory", "delivery-facts", "import", "--run", "run-0001", "--file", deliveryImportPath], { cwd: tempRepo });
  assertFailure(blockedDelivery, "delivery payload import during active review launch");
  assert.match(blockedDelivery.stderr, /REVIEW_LAUNCH_OWNERSHIP_ACTIVE/);
  assert.equal(readRun(tempRepo).delivery_facts.length, 0, "blocked delivery import must not mutate the run");

  const completed = await launched.completed;
  assert.equal(completed.status, 0, `original launch should finish: ${completed.stderr}`);
  const attempt = readLatestAttempt(tempRepo);
  assert.equal(attempt.termination_policy, "terminal_completion_only");
});

test("phase 23.8.6E quarantines a lost review owner until explicit cancellation and discard", async () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-owner-loss-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const outputPath = ".harness/runs/run-0001/manual/implementation-review.md";
  const sentinelPath = path.join(tempRepo, "reviewer-pid.txt");
  const env = {
    ...createFakeCodexBin(tempRepo, "silent-file-after-delay"),
    CODEX_FAKE_SENTINEL: sentinelPath,
    CODEX_FAKE_SLEEP_MS: "10000",
    CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
  };
  const args = [
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output", outputPath, "--stale-after-seconds", "1", "--timeout-seconds", "30"
  ];
  const launched = launchReviewAsync(tempRepo, args, env);
  await waitForFile(sentinelPath);
  const fakeReviewerPid = Number(fs.readFileSync(sentinelPath, "utf8"));
  assert.ok(Number.isInteger(fakeReviewerPid) && fakeReviewerPid > 0, "fake reviewer PID must be observable");

  launched.child.kill("SIGKILL");
  await launched.completed;

  const replacement = runCli(args, { cwd: tempRepo, env });
  assertFailure(replacement, "replacement after owner loss");
  assert.match(replacement.stderr, /REVIEW_LAUNCH_OWNERSHIP_ACTIVE/);
  const blockedImportPath = writeManualFile(tempRepo, "run-0001", "delivery-facts.json", JSON.stringify({ facts: [] }));
  const blockedImport = runCli(["memory", "delivery-facts", "import", "--run", "run-0001", "--file", blockedImportPath], { cwd: tempRepo });
  assertFailure(blockedImport, "delivery import after owner loss");
  assert.match(blockedImport.stderr, /REVIEW_LAUNCH_OWNERSHIP_ACTIVE/);

  process.kill(fakeReviewerPid, "SIGTERM");
  const discarded = runCli(["run", "mark-discardable", "--run", "run-0001", "--reason", "Explicit human recovery after lost review owner."], { cwd: tempRepo });
  assertSuccess(discarded, "discard quarantined owner-loss run");
  const afterDiscard = runCli(["run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review", "--request", ".harness/runs/run-0001/manual/implementation-review-request.md", "--output", outputPath], { cwd: tempRepo, env });
  assertFailure(afterDiscard, "discarded run cannot launch a replacement reviewer");
  assert.match(afterDiscard.stderr, /requires an active run/);
});

test("phase 23.8.6B1 launch-review distinguishes missing artifact, timeout, and blocker-note failures", () => {
  const missingRepo = createB1Repo("codex-harness-b1-review-missing-artifact-");
  writeManualFile(missingRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const missingResult = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: missingRepo, env: createFakeCodexBin(missingRepo, "no-output") });

  assertFailure(missingResult, "launch-review missing artifact");
  assert.match(missingResult.stdout, /failure classification: REVIEW_COMPLETED_ARTIFACT_MISSING/);
  assert.equal(readLatestAttempt(missingRepo).artifact_present, false);

  const timeoutRepo = createB1Repo("codex-harness-b1-review-timeout-");
  writeManualFile(timeoutRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const timeoutResult = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5",
    "--stale-after-seconds",
    "4"
  ], {
    cwd: timeoutRepo,
    env: {
      ...createFakeCodexBin(timeoutRepo, "write-then-sleep"),
      CODEX_FAKE_SLEEP_MS: "7000",
      CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS"),
      CODEX_FAKE_SIGTERM_SENTINEL: path.join(timeoutRepo, "hard-deadline-sigterm.txt")
    }
  });

  assertFailure(timeoutResult, "launch-review timeout");
  assert.match(timeoutResult.stdout, /failure classification: REVIEW_PROCESS_TIMEOUT/);
  const timedOutAttempt = readLatestAttempt(timeoutRepo);
  assert.equal(timedOutAttempt.failure_classification, "REVIEW_PROCESS_TIMEOUT");
  assert.equal(timedOutAttempt.artifact_present, true, "timed-out output remains non-authoritative");
  assert.equal(readRun(timeoutRepo).evidence.some((entry) => entry.kind === "procedure:implementation-review"), false);
  assert.equal(fs.existsSync(path.join(timeoutRepo, "hard-deadline-sigterm.txt")), true, "only the hard deadline may send SIGTERM");
  const freshOutputPath = ".harness/runs/run-0001/manual/implementation-review-fresh.md";
  const freshResult = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output", freshOutputPath
  ], {
    cwd: timeoutRepo,
    env: {
      ...createFakeCodexBin(timeoutRepo, "file"),
      CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
    }
  });
  assertSuccess(freshResult, "fresh attempt after timeout");
  const freshAttempt = readLatestAttempt(timeoutRepo);
  assert.notEqual(freshAttempt.attempt_id, timedOutAttempt.attempt_id);
  assert.equal(freshAttempt.expected_output_path, freshOutputPath);
  assert.match(freshResult.stdout, /artifact path: evidence\/implementation-review-/);

  const blockerRepo = createB1Repo("codex-harness-b1-review-blocker-note-");
  writeManualFile(blockerRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const blockerResult = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], {
    cwd: blockerRepo,
    env: {
      ...createFakeCodexBin(blockerRepo, "file"),
      CODEX_FAKE_REVIEW_CONTENT: [
        "## Blocker Note",
        "",
        "Human approval required before implementation.",
        "",
        "## Recommendation",
        "",
        "BLOCKED",
        ""
      ].join("\n")
    }
  });

  assertFailure(blockerResult, "launch-review blocker note");
  assert.match(blockerResult.stdout, /failure classification: REVIEW_ARTIFACT_CONTRACT_MISMATCH|REVIEW_ARTIFACT_VERDICT_UNRECOGNIZED/);
  assert.equal(readRun(blockerRepo).evidence.some((entry) => entry.kind === "procedure:implementation-review"), false);
});

test("phase 23.8.6B1 launch-review rejects section-contract mismatches and invalid output paths", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-contract-");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const env = createFakeCodexBin(tempRepo, "invalid-section");

  const invalidArtifact = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], { cwd: tempRepo, env });

  assertFailure(invalidArtifact, "launch-review invalid section contract");
  assert.match(invalidArtifact.stdout, /failure classification: REVIEW_ARTIFACT_CONTRACT_MISMATCH/);

  const invalidOutput = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    "src/not-allowed.md"
  ], { cwd: tempRepo, env });

  assertFailure(invalidOutput, "launch-review invalid output path");
  assert.match(invalidOutput.stderr, /Review output path must stay under/);
});

test("phase 23.8.6B1 launch-review rejects request artifacts as output and missing exact identity before spawn", () => {
  const samePathRepo = createB1Repo("codex-harness-b1-review-same-path-");
  const requestPath = writeManualFile(samePathRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const samePathResult = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    requestPath,
    "--output",
    requestPath
  ], { cwd: samePathRepo, env: createFakeCodexBin(samePathRepo, "file") });

  assertFailure(samePathResult, "launch-review rejects request as output");
  assert.match(samePathResult.stderr, /Review request and output paths must be different/);

  const legacyRepo = createB1Repo("codex-harness-b1-review-legacy-identity-");
  writeManualFile(legacyRepo, "run-0001", "implementation-review-request.md", "review this diff");
  for (const name of ["staging.sqlite", "staging.sqlite-shm", "staging.sqlite-wal"]) {
    fs.rmSync(path.join(legacyRepo, ".harness", "runs", "run-0001", name), { force: true });
  }
  const runPath = path.join(legacyRepo, ".harness", "runs", "run-0001", "run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  delete run.run_instance_id;
  fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  const sentinelPath = path.join(legacyRepo, "spawned.txt");
  const legacyResult = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md"
  ], {
    cwd: legacyRepo,
    env: {
      ...createFakeCodexBin(legacyRepo, "file"),
      CODEX_FAKE_SENTINEL: sentinelPath,
      CODEX_FAKE_REVIEW_CONTENT: `require("fs").writeFileSync(${JSON.stringify(sentinelPath)}, "spawned")`
    }
  });

  assertFailure(legacyResult, "launch-review rejects legacy run identity");
  assert.match(legacyResult.stderr, /lacks exact immutable identity/);
  assert.equal(fs.existsSync(sentinelPath), false);
});

test("phase 23.8.6B1 launched implementation-review FIX_REQUIRED routes to fix-pass", () => {
  const tempRepo = createB1Repo("codex-harness-b1-review-fix-required-route-");
  prepareApprovedB1Plan(tempRepo);
  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "src", "b1.ts"), "export const b1 = true;\n");
  writeManualFile(tempRepo, "run-0001", "implementation-review-request.md", "review this diff");
  const result = runCli([
    "run",
    "launch-review",
    "--run",
    "run-0001",
    "--procedure",
    "implementation-review",
    "--request",
    ".harness/runs/run-0001/manual/implementation-review-request.md",
    "--output",
    ".harness/runs/run-0001/manual/implementation-review.md",
    "--timeout-seconds",
    "5"
  ], {
    cwd: tempRepo,
    env: {
      ...createFakeCodexBin(tempRepo, "file"),
      CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("FIX_REQUIRED")
    }
  });

  assertSuccess(result, "launch-review implementation-review FIX_REQUIRED");
  const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(status, "operator status after launched implementation-review FIX_REQUIRED");
  assert.match(status.stdout, /current_stage: FIX_PASS_REQUIRED/);
  assert.match(status.stdout, /next_procedure_id: fix-pass-review/);

  writeManualFile(tempRepo, "run-0001", "implementation-fix-pass-request.md", "review only the fix-pass delta");
  const fixPassResult = runCli([
    "run", "launch-review", "--run", "run-0001", "--procedure", "implementation-review",
    "--request", ".harness/runs/run-0001/manual/implementation-fix-pass-request.md",
    "--output", ".harness/runs/run-0001/manual/implementation-fix-pass.md",
    "--timeout-seconds", "5"
  ], {
    cwd: tempRepo,
    env: {
      ...createFakeCodexBin(tempRepo, "file"),
      CODEX_FAKE_REVIEW_CONTENT: implementationReviewMarkdown("PASS")
    }
  });
  assertSuccess(fixPassResult, "launch-review implementation fix-pass PASS");
  const invocations = readRun(tempRepo).review_routing_records.filter((entry) => entry.record_kind === "review_invocation");
  const fixPassInvocation = invocations[invocations.length - 1];
  assert.equal(fixPassInvocation.payload.pass_kind, "fix_pass_review");
  assert.equal(fixPassInvocation.payload.evaluation_mode, "approved");
});
