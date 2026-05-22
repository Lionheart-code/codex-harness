import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
  normalizePathForComparison,
  productRoot,
  readJson,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function collectRequiredFields(schema, fields = []) {
  if (!schema || typeof schema !== "object") {
    return fields;
  }

  if (Array.isArray(schema.required)) {
    fields.push(...schema.required);
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const value of Object.values(schema.properties)) {
      collectRequiredFields(value, fields);
    }
  }

  if (schema.items) {
    collectRequiredFields(schema.items, fields);
  }

  return fields;
}

function createRuntimeRepo() {
  const tempRepo = createTempDirectory("codex-harness-phase22-5-");
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      "Implement only: tasks/PHASE_22_5_CORE_RUNTIME_NORMALIZATION.md",
      "",
      "Do not implement Phase 23 or later.",
      ""
    ].join("\n")
  );
  writeText(
    path.join(tempRepo, "tasks", "PHASE_22_5_CORE_RUNTIME_NORMALIZATION.md"),
    [
      "# Phase 22.5 — Core Runtime Normalization",
      "",
      "Temporary acceptance task.",
      ""
    ].join("\n")
  );

  return tempRepo;
}

test("phase 22.5 runtime contracts cover the shared lifecycle and closeout gates", () => {
  ensureBuiltCli();

  const runtime = require(path.join(productRoot, "dist", "core", "runtime.js"));
  const requiredContracts = [
    "Run",
    "PhaseRun",
    "Step",
    "ArtifactRef",
    "EvidenceRef",
    "Finding",
    "Decision",
    "Approval",
    "CommandResult",
    "VerificationResult",
    "ReviewResult",
    "CloseoutReceipt",
    "RepositoryRef",
    "ChangeSet",
    "CIRunRef",
    "RemoteCheckResult",
    "RemoteGateStatus",
    "RequiredGate"
  ];

  for (const contract of requiredContracts) {
    assert.ok(runtime.RUNTIME_CONTRACT_NAMES.includes(contract), `missing runtime contract: ${contract}`);
  }

  let run = runtime.buildRuntimeRun({
    runId: "run-test",
    taskPath: "TASK.md",
    activeTaskPath: "tasks/PHASE_22_5_CORE_RUNTIME_NORMALIZATION.md",
    phaseId: "22.5",
    repository: {
      root_path: productRoot,
      dirty: false
    },
    timestamp: "2026-05-20T00:00:00.000Z"
  });
  assert.equal(run.repository.project_root, productRoot);
  assert.equal(run.run_mode, "bootstrap");
  assert.equal(run.lifecycle_status, "active");

  run = runtime.recordPhaseRun(run, {
    phaseRunId: "phase-run-test",
    phaseId: "22.5",
    taskPath: "tasks/PHASE_22_5_CORE_RUNTIME_NORMALIZATION.md",
    startedAt: "2026-05-20T00:00:00.000Z"
  });
  run = runtime.recordStep(run, {
    stepId: "step-test",
    phaseRunId: "phase-run-test",
    name: "Implement runtime contracts",
    status: "passed",
    startedAt: "2026-05-20T00:01:00.000Z",
    completedAt: "2026-05-20T00:02:00.000Z"
  });
  run = runtime.recordCommandResult(run, "step-test", {
    commandResultId: "command-test",
    command: "npm run build",
    exitCode: 0,
    status: "pass",
    completedAt: "2026-05-20T00:03:00.000Z"
  });
  run = runtime.recordVerificationResult(run, {
    verification_result_id: "verification-test",
    status: "pass",
    created_at: "2026-05-20T00:04:00.000Z",
    summary: "Build and acceptance passed.",
    source: "acceptance",
    artifact_refs: [],
    command_results: []
  });
  run = runtime.recordReviewResult(run, {
    review_result_id: "review-test",
    status: "PASS",
    created_at: "2026-05-20T00:05:00.000Z",
    summary: "Review passed.",
    source: "manual",
    blockers: [],
    artifact_refs: []
  });
  run = runtime.recordFinding(run, {
    findingId: "finding-test",
    title: "Non-blocking note",
    severity: "low",
    blocking: false,
    createdAt: "2026-05-20T00:06:00.000Z"
  });
  run = runtime.recordDecision(run, {
    decisionId: "decision-test",
    title: "Keep runtime file backed",
    rationale: "Phase 22.5 excludes databases.",
    createdAt: "2026-05-20T00:07:00.000Z"
  });
  run = runtime.recordApproval(run, {
    approvalId: "approval-test",
    title: "Proceed with closeout",
    status: "approved",
    createdAt: "2026-05-20T00:08:00.000Z"
  });

  runtime.validateRuntimeRun(run);
  const missingGateReceipt = runtime.createCloseoutReceipt(run);
  assert.equal(missingGateReceipt.status, "BLOCKED");
  assert.match(missingGateReceipt.blockers.join("\n"), /Required remote gate Remote CI is missing/);

  run = runtime.recordRemoteCheckResult(run, {
    provider: "local-ci",
    providerRunId: "provider-run-123",
    status: "pass",
    explanation: "Required remote gate was recorded by the operator."
  });

  const readyReceipt = runtime.createCloseoutReceipt(run);
  runtime.validateCloseoutReceipt(readyReceipt);
  assert.equal(readyReceipt.status, "READY");
  assert.equal(readyReceipt.remote_checks[0].ci_run.provider, "local-ci");
  assert.equal(readyReceipt.remote_checks[0].ci_run.run_id, "provider-run-123");
});

test("phase 22.5 runtime reader normalizes legacy status-based run records", () => {
  ensureBuiltCli();
  const runtime = require(path.join(productRoot, "dist", "core", "runtime.js"));
  const legacyRun = {
    schema_version: 1,
    producer_command: "node bin/ch run start",
    run_id: "run-legacy",
    task_path: "TASK.md",
    status: "blocked",
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z",
    repository: {
      root_path: productRoot,
      dirty: false
    },
    phase_runs: [],
    steps: [],
    artifacts: [],
    evidence: [],
    findings: [],
    decisions: [],
    approvals: [],
    command_results: [],
    verification_results: [],
    review_results: [],
    required_gates: [],
    remote_checks: [],
    closeout_receipts: []
  };

  const normalized = runtime.validateRuntimeRun(legacyRun);
  assert.equal(normalized.run_mode, "bootstrap");
  assert.equal(normalized.lifecycle_status, "blocked");
  assert.equal(normalized.delivery_facts.length, 0);
  assert.equal(normalized.repository.project_root, productRoot);
});

test("phase 22.5 runtime schemas are provider-neutral and package-visible", () => {
  ensureBuiltCli();

  const runtimeRunSchemaPath = path.join(productRoot, "schemas", "runtime-run.schema.json");
  const closeoutSchemaPath = path.join(productRoot, "schemas", "closeout-receipt.schema.json");
  const runtimeRunSchema = readJson(runtimeRunSchemaPath);
  const closeoutSchema = readJson(closeoutSchemaPath);

  assert.ok(collectRequiredFields(runtimeRunSchema).includes("remote_checks"));
  assert.ok(collectRequiredFields(runtimeRunSchema).includes("required_gates"));
  assert.ok(collectRequiredFields(closeoutSchema).includes("remote_checks"));
  assert.ok(collectRequiredFields(closeoutSchema).includes("required_gates"));

  for (const field of [...collectRequiredFields(runtimeRunSchema), ...collectRequiredFields(closeoutSchema)]) {
    assert.doesNotMatch(field, /github/i, `provider-specific required field found: ${field}`);
  }

  const packageJson = readJson(path.join(productRoot, "package.json"));
  assert.deepEqual(packageJson.files, ["bin", "dist", "schemas", "README.md"]);
});

test("phase 22.5 run dry-run commands do not create product runtime state", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const commands = [
    ["run", "--help"],
    ["run", "start", "--task", "TASK.md", "--dry-run"],
    ["run", "status", "--dry-run"],
    ["run", "verify", "--dry-run"],
    ["run", "closeout", "--dry-run"],
    ["run", "remote-status", "--dry-run"]
  ];

  for (const args of commands) {
    const result = runCli(args, { cwd: productRoot });
    assertSuccess(result, `node bin/ch ${args.join(" ")}`);

    if (args.includes("--dry-run")) {
      assert.match(result.stdout, /dry-run: no files were written/);
    }
  }

  const afterStatus = getGitStatus(productRoot);
  assert.equal(afterStatus, beforeStatus, "dry-run commands changed product-repo git status");
  assertProductRepoBoundaryState();
});

test("phase 22.5 run commands can write local runtime state in a target repo", () => {
  ensureBuiltCli();

  const tempRepo = createRuntimeRepo();
  const start = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(start, "run start in temp repo");

  const runPath = path.join(tempRepo, ".harness", "runs", "run-0001", "run.json");
  const pointerPath = path.join(tempRepo, ".harness", "runs", "current.json");
  const stagingDbPath = path.join(tempRepo, ".harness", "runs", "run-0001", "staging.sqlite");
  const projectDbPath = path.join(tempRepo, ".harness", "memory", "project.sqlite");
  assert.ok(fs.existsSync(runPath), "runtime run was not written");
  assert.ok(fs.existsSync(pointerPath), "runtime current pointer was not written");
  assert.ok(fs.existsSync(stagingDbPath), "runtime staging DB was not written");
  assert.ok(fs.existsSync(projectDbPath), "project memory DB was not written");

  const remoteStatus = runCli(
    [
      "run",
      "remote-status",
      "--provider",
      "local-ci",
      "--run",
      "provider-run-123",
      "--status",
      "pass",
      "--explanation",
      "Recorded by acceptance test."
    ],
    { cwd: tempRepo }
  );
  assertSuccess(remoteStatus, "run remote-status in temp repo");

  const closeout = runCli(["run", "closeout"], { cwd: tempRepo });
  assertSuccess(closeout, "run closeout in temp repo");
  assert.match(closeout.stdout, /closeout: BLOCKED/);

  const run = readJson(runPath);
  const receipt = readJson(path.join(tempRepo, ".harness", "runs", "run-0001", "closeout.json"));
  assert.equal(run.run_mode, "normal");
  assert.equal(run.lifecycle_status, "blocked");
  assert.equal(normalizePathForComparison(run.repository.project_root), normalizePathForComparison(tempRepo));
  assert.equal(run.remote_checks[0].ci_run.provider, "local-ci");
  assert.equal(run.remote_checks[0].ci_run.run_id, "provider-run-123");
  assert.equal(receipt.status, "BLOCKED");
  assert.match(receipt.blockers.join("\n"), /Verification is missing/);
  assert.match(receipt.blockers.join("\n"), /Review is MISSING/);
  assert.equal(receipt.required_gates[0].status, "pass");
});

test("phase 22.5 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
