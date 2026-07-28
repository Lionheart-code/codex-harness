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
  fs.cpSync(path.join(productRoot, "prompts", "self-hosting"), path.join(tempRepo, "prompts", "self-hosting"), {
    recursive: true
  });
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
  recordProcedure(tempRepo, runId, "plan-review", planReviewMarkdown());
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

function readLatestAttempt(tempRepo, procedureId = "implementation-review") {
  const run = readRun(tempRepo);
  const evidence = [...run.evidence].reverse().find((entry) => entry.kind === `review-launch-attempt:${procedureId}`);
  assert.ok(evidence, `expected review-launch-attempt evidence for ${procedureId}`);
  return JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", "run-0001", evidence.path), "utf8"));
}

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
  assert.equal(fs.existsSync(path.join(tempRepo, outputPath)), false);
  assert.equal(readRun(tempRepo).evidence.some((entry) => entry.kind.startsWith("review-launch-attempt:")), false);
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
    "1",
    "--stale-after-seconds",
    "10"
  ], {
    cwd: timeoutRepo,
    env: {
      ...createFakeCodexBin(timeoutRepo, "sleep"),
      CODEX_FAKE_SLEEP_MS: "3000",
      CODEX_FAKE_SIGTERM_SENTINEL: path.join(timeoutRepo, "hard-deadline-sigterm.txt")
    }
  });

  assertFailure(timeoutResult, "launch-review timeout");
  assert.match(timeoutResult.stdout, /failure classification: REVIEW_PROCESS_TIMEOUT/);
  assert.equal(readLatestAttempt(timeoutRepo).failure_classification, "REVIEW_PROCESS_TIMEOUT");
  assert.equal(fs.existsSync(path.join(timeoutRepo, "hard-deadline-sigterm.txt")), true, "only the hard deadline may send SIGTERM");

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
