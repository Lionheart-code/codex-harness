import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { isIgnoredPlatformMetadata } from "../../dist/core/platform-metadata.js";
import { detectProductRepositoryIdentity, assertNotProductRepository } from "../../dist/core/product-repository-identity.js";
import { materializeZeroOwnerTaskState } from "../../dist/core/zero-owner-materialization.js";
import { openVerifiedTaskStateStore } from "../../dist/core/tasks.js";
import { buildSuccessorDisposition, assertCompatibleSuccessorDisposition } from "../../dist/core/successor-disposition.js";
import {
  buildReviewAttempt, buildReviewAttemptEvent, buildReviewCohort,
  buildPlanningReviewBundleRecord, parseRawReviewStartupObservation, assertPlanningBundleIdentity
} from "../../dist/core/review-cohort.js";
import { aggregatePlanBlockers, reconcilePlanningLenses, validatePlanningLensResult } from "../../dist/core/plan-contract.js";
import { buildProofRecord, extractTaskRequirements, parseProofDerivationRequest } from "../../dist/core/proof-record.js";
import {
  buildInstallerOwnershipCatalog,
  buildInstallerOwnershipCatalogEntry,
  readInstallerOwnershipCatalog
} from "../../dist/core/legacy-installer-ownership-catalog.js";
import { buildInstallerOwnershipManifest } from "../../dist/core/installer-ownership.js";
import { getManagedBaselineContents } from "../../dist/core/install.js";
import {
  applySelfInstallReconciliation,
  prepareSelfInstallReconciliation,
  rollbackSelfInstallReconciliation
} from "../../dist/core/product-self-install-reconciliation.js";
import { RunStagingDatabase } from "../../dist/core/run-staging-db.js";
import { ProjectMemoryDatabase } from "../../dist/core/project-memory-db.js";
import { importDeliveryFacts } from "../../dist/core/delivery-facts.js";
import {
  buildRuntimeRun, extractEffectiveValidationCommands, extractReviewedAuthorityOverlay,
  launchRuntimePlanningReviewBundle, createCloseoutReceipt, validateRuntimeRun
} from "../../dist/core/runtime.js";
import { harvestRun } from "../../dist/core/harvest.js";

const sha = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const require = createRequire(import.meta.url);

test("phase 23.9 ignores only case-sensitive .DS_Store", () => {
  assert.equal(isIgnoredPlatformMetadata(".DS_Store"), true);
  assert.equal(isIgnoredPlatformMetadata("nested/.DS_Store"), true);
  assert.equal(isIgnoredPlatformMetadata(".ds_store"), false);
  assert.equal(isIgnoredPlatformMetadata("Thumbs.db"), false);
});

test("phase 23.9 product guard fails before mutation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-product-root-"));
  for (const relativePath of [
    "src/core/install.ts", "src/core/runtime.ts", "schemas/install.schema.json",
    "skills/self-hosting/procedure-registry.json"
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), "{}\n");
  }
  assert.equal(detectProductRepositoryIdentity(root).is_product_repository, true);
  assert.throws(() => assertNotProductRepository(root), /product_repository_install_forbidden/);
  assert.equal(fs.existsSync(path.join(root, ".harness")), false);
});

test("phase 23.9 operator authority matches zero-owner and pre-harvest disposition rules", () => {
  const manual = fs.readFileSync(path.join(process.cwd(), "docs/HUMAN_OPERATOR_MANUAL.md"), "utf8");
  const operations = fs.readFileSync(path.join(process.cwd(), "docs/OPERATIONS_PLAN.md"), "utf8");
  const roadmap = fs.readFileSync(path.join(process.cwd(), "docs/IMPLEMENTATION_ROADMAP.md"), "utf8");
  const stageMap = fs.readFileSync(path.join(process.cwd(), "docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md"), "utf8");

  assert.match(manual, /zero matching owners, normal materialization transactionally/);
  assert.match(manual, /Before harvest, a normal self-hosting run must record exactly one/);
  assert.match(manual, /A harvested run cannot add or change that disposition/);
  assert.doesNotMatch(manual, /requires exactly one installed TaskState to own that worktree/);
  assert.doesNotMatch(manual, /A closing or harvested run may record/);
  assert.match(operations, /normal materialization\ntransactionally creates exactly one canonical installed `TaskState` owner/);
  assert.match(operations, /records exactly one successor disposition/);
  assert.match(operations, /a harvested run cannot change that disposition/);
  assert.doesNotMatch(operations, /fails closed unless exactly one installed TaskState owns/);
  assert.doesNotMatch(operations, /harvest without a next-task decision/);
  assert.match(roadmap, /before harvest, a normal self-hosting run records exactly one successor/);
  assert.match(roadmap, /a harvested run cannot add or change that disposition/);
  assert.doesNotMatch(roadmap, /a closing or harvested run may determine and record/);
  assert.doesNotMatch(roadmap, /allowing harvest without one when no successor is selected/);
  assert.match(stageMap, /selected-successor or explicit no-successor disposition/);
  assert.match(stageMap, /Harvest rejects a missing, duplicate, ambiguous, or conflicting successor/);
  assert.doesNotMatch(stageMap, /RUN_HARVESTED[^\n]+record next-task decision/);
});

test("phase 23.9 zero-owner materialization creates one exact owner and replays", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ch-owner-project-"));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "ch-owner-worktree-"));
  const input = {
    projectRoot, worktreePath: worktree, branch: "codex/phase-24",
    baseCommitSha: "a".repeat(40), taskPath: "tasks/NEXT.md",
    sourceArtifactIdentity: sha("# next task\n"),
    pointerContents: "# Current Task\n\n`tasks/NEXT.md`\n"
  };
  fs.mkdirSync(path.join(worktree, "tasks"));
  fs.writeFileSync(path.join(worktree, "tasks/NEXT.md"), "# next task\n");
  assert.equal(materializeZeroOwnerTaskState(input).created_owner, true);
  const owners = openVerifiedTaskStateStore(projectRoot).enumerate();
  assert.equal(owners.length, 1);
  assert.equal(owners[0].branch, input.branch);
  assert.equal(owners[0].worktree, fs.realpathSync.native(worktree));
  assert.equal(owners[0].base_commit_sha, input.baseCommitSha);
  assert.equal(materializeZeroOwnerTaskState(input).created_owner, false);
  assert.equal(openVerifiedTaskStateStore(projectRoot).enumerate().length, 1);
  fs.writeFileSync(path.join(worktree, "TASK.md"), "# wrong\n");
  assert.throws(() => materializeZeroOwnerTaskState(input), /pointer_readback_mismatch/);
  fs.writeFileSync(path.join(worktree, "TASK.md"), input.pointerContents);
  assert.throws(() => materializeZeroOwnerTaskState({
    ...input, taskPath: "tasks/OTHER.md"
  }), /task_contract_missing/);
  fs.writeFileSync(path.join(worktree, "tasks/NEXT.md"), "# changed\n");
  assert.throws(() => materializeZeroOwnerTaskState(input), /task_contract_identity_mismatch/);
});

test("phase 23.9 zero-owner materialization compensates absent and existing pointers", { skip: process.platform === "win32" }, () => {
  for (const existingPointer of [false, true]) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ch-owner-rollback-project-"));
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "ch-owner-rollback-worktree-"));
    fs.mkdirSync(path.join(worktree, "tasks"));
    fs.writeFileSync(path.join(worktree, "tasks/NEXT.md"), "# next\n");
    const pointerPath = path.join(worktree, "TASK.md");
    if (existingPointer) {
      fs.writeFileSync(pointerPath, "# preserved\n");
      fs.chmodSync(pointerPath, 0o444);
    } else {
      fs.chmodSync(worktree, 0o555);
    }
    try {
      assert.throws(() => materializeZeroOwnerTaskState({
        projectRoot, worktreePath: worktree, branch: `codex/rollback-${existingPointer}`,
        baseCommitSha: "a".repeat(40), taskPath: "tasks/NEXT.md",
        sourceArtifactIdentity: sha("# next\n"), pointerContents: "# replacement\n"
      }));
      assert.equal(openVerifiedTaskStateStore(projectRoot).enumerate().length, 0);
      assert.equal(fs.existsSync(pointerPath), existingPointer);
      if (existingPointer) assert.equal(fs.readFileSync(pointerPath, "utf8"), "# preserved\n");
    } finally {
      fs.chmodSync(worktree, 0o755);
      if (fs.existsSync(pointerPath)) fs.chmodSync(pointerPath, 0o644);
    }
  }
});

test("phase 23.9 successor disposition rejects a conflicting authority", () => {
  const selected = buildSuccessorDisposition({
    source_run_instance_id: "instance", disposition: "selected_successor",
    next_task_decision_id: sha("decision"),
    next_task: { task_path: "tasks/NEXT.md", base_commit_sha: "a".repeat(40), source_artifact_identity: sha("task") },
    no_successor: null
  });
  const none = buildSuccessorDisposition({
    source_run_instance_id: "instance", disposition: "no_successor",
    next_task_decision_id: null, next_task: null,
    no_successor: { reason: "terminal", decision_owner_id: "owner", decision_approval_id: "approval", no_successor_decision_id: sha("none") }
  });
  assert.doesNotThrow(() => assertCompatibleSuccessorDisposition(selected, selected));
  assert.throws(() => assertCompatibleSuccessorDisposition(selected, none), /successor_disposition_conflict/);
});

test("phase 23.9 raw startup observation binds one three-lens attempt", () => {
  const raw = "adapter=codex_cli\nprovider=openai\nmodel=gpt-5.6-sol\nreasoning=high\nsandbox=read-only\napproval_policy=never";
  const observation = {
    schema_version: 1, source: "codex_cli_startup_preamble_v1",
    session_id: "fresh", raw_bytes: raw, raw_sha256: sha(raw),
    raw_byte_length: Buffer.byteLength(raw),
    byte_start: 0, byte_end: Buffer.byteLength(raw)
  };
  const attemptInput = {
    run_instance_id: "instance", run_id: "run", attempt_kind: "planning_bundle",
    procedure_ids: ["plan-review", "architecture-review", "db-storage-review"],
    cohort_id: sha("cohort"), attempt_id: "attempt", claim_id: "claim", profile_id: "sol-high-read-only",
    request_artifact_hash: sha("request"), expected_bundle_output_path: "bundle.json",
    claimed_event_id: sha("claimed"), started_event_id: sha("started"), terminal_event_id: sha("terminal"),
    terminal_status: "success", verdict: null, reviewed_source_head: null,
    implementation_diff_id: null, predecessor_review_attempt_id: null,
    predecessor_review_artifact_id: null, bundle_envelope_id: sha("bundle"),
    bundle_envelope_hash: sha("envelope"),
    lens_results: ["plan-review", "architecture-review", "db-storage-review"].map((procedure_id) => ({
      procedure_id, status: "recorded", artifact_id: sha(procedure_id),
      artifact_hash: sha(procedure_id), verdict: "PASS"
    })), created_at: new Date(0).toISOString()
  };
  const attempt = buildReviewAttempt(attemptInput, observation, { model: "gpt-5.6-sol", sandbox: "read-only" });
  assert.doesNotThrow(() => assertPlanningBundleIdentity(attempt));
  assert.throws(() => buildReviewAttempt(attemptInput,
    { ...observation, raw_sha256: sha("wrong") }), /preamble_identity_invalid/);
});

test("phase 23.9 retained turn context has exact raw identity and legal event chain", () => {
  const meta = `${JSON.stringify({ type: "session_meta", payload: {
    id: "session", model_provider: "openai"
  } })}\n`;
  const turn = `${JSON.stringify({ type: "turn_context", payload: {
    cwd: "/worktree", model: "gpt-5.6-sol", effort: "high",
    sandbox_policy: { type: "read-only" }, approval_policy: "never"
  } })}\n`;
  const raw = {
    schema_version: 1, source: "codex_turn_context_v1", session_id: "session",
    rollout_path_hash: sha("/rollout"), session_meta_record_ordinal: 0,
    session_meta_raw_bytes: meta, session_meta_raw_byte_length: Buffer.byteLength(meta),
    session_meta_raw_sha256: sha(meta), turn_context_record_ordinal: 1,
    turn_context_raw_bytes: turn, turn_context_raw_byte_length: Buffer.byteLength(turn),
    turn_context_raw_sha256: sha(turn), raw_pair_sha256: sha(JSON.stringify({
      session_meta_raw_sha256: sha(meta), turn_context_raw_sha256: sha(turn)
    }))
  };
  const observed = parseRawReviewStartupObservation(raw);
  assert.deepEqual({ model: observed.model, reasoning: observed.reasoning, sandbox: observed.sandbox },
    { model: "gpt-5.6-sol", reasoning: "high", sandbox: "read-only" });
  const common = {
    run_instance_id: "instance", run_id: "run", attempt_kind: "single_review",
    cohort_id: null, attempt_id: "attempt", claim_id: "claim", procedure_ids: ["fix-pass-review"],
    request_artifact_hash: sha("request"), expected_bundle_output_path: "review.md",
    owner_token_hash: sha("owner")
  };
  const claimed = buildReviewAttemptEvent({ ...common, sequence: 1, event_type: "claimed",
    occurred_at: new Date(0).toISOString(), raw_startup_observation: null, observed_profile: null,
    terminal_status: null, error_code: null, output_artifact_hash: null });
  const started = buildReviewAttemptEvent({ ...common, sequence: 2, event_type: "started",
    occurred_at: new Date(1).toISOString(), raw_startup_observation: raw, observed_profile: observed,
    terminal_status: null, error_code: null, output_artifact_hash: null });
  const terminal = buildReviewAttemptEvent({ ...common, sequence: 3, event_type: "terminal",
    occurred_at: new Date(2).toISOString(), raw_startup_observation: null, observed_profile: null,
    terminal_status: "success", error_code: null, output_artifact_hash: sha("review") });
  assert.deepEqual([claimed.event_type, started.event_type, terminal.event_type], ["claimed", "started", "terminal"]);
  for (const [terminal_status, error_code] of [
    ["timeout", "review_timeout"], ["profile_mismatch", "review_startup_profile_mismatch:model"]
  ]) {
    const failure = buildReviewAttemptEvent({ ...common, sequence: 3, event_type: "terminal",
      occurred_at: new Date(2).toISOString(), raw_startup_observation: null, observed_profile: null,
      terminal_status, error_code, output_artifact_hash: null });
    assert.equal(failure.terminal_status, terminal_status);
  }
  const startupFailure = buildReviewAttemptEvent({ ...common, sequence: 2, event_type: "terminal",
    occurred_at: new Date(2).toISOString(), raw_startup_observation: null, observed_profile: null,
    terminal_status: "startup_observation_failed", error_code: "startup_missing", output_artifact_hash: null });
  assert.equal(startupFailure.sequence, 2);
  assert.throws(() => buildReviewAttemptEvent({ ...common, sequence: 1, event_type: "terminal",
    occurred_at: new Date(0).toISOString(), raw_startup_observation: null, observed_profile: null,
    terminal_status: "failed", error_code: "bad", output_artifact_hash: null }), /automaton_invalid/);
});

test("phase 23.9 cohort identity includes exact output contracts and rejects corruption", () => {
  const refs = ["plan-review", "architecture-review", "db-storage-review"].map((procedure_id) => {
    const body = {
      procedure_id, registry_contract_version: "v1", skill_path: `${procedure_id}/SKILL.md`,
      skill_hash: sha(`${procedure_id}:skill`), output_format_path: `${procedure_id}/output.md`,
      output_format_hash: sha(`${procedure_id}:format`), output_schema_path: "schemas/lens.json",
      output_schema_hash: sha("schema")
    };
    return { ...body, output_contract_id: sha(JSON.stringify(body)) };
  });
  // The product identity uses canonical key order, not insertion order.
  for (const ref of refs) {
    const body = Object.fromEntries(Object.entries(ref).filter(([key]) => key !== "output_contract_id"));
    ref.output_contract_id = sha(JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)))));
  }
  const input = {
    run_instance_id: "instance", run_id: "run", task_artifact_id: sha("task"),
    immutable_base: "a".repeat(40), planning_review_source_head: "b".repeat(40),
    anchor_plan_sha: sha("plan"), output_contract_refs: refs, profile_id: "sol-high-read-only",
    bundle_kind: "candidate", predecessor_cohort_id: null,
    required_lens_ids: ["plan-review", "architecture-review", "db-storage-review"],
    carried_lens_refs: [], context_core_hash: sha("context"), created_at: new Date(0).toISOString()
  };
  const cohort = buildReviewCohort(input);
  assert.match(cohort.record_id, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => buildReviewCohort({ ...input, output_contract_refs: [
    { ...refs[0], output_contract_id: sha("corrupt") }, refs[1], refs[2]
  ] }), /output_contract_identity_invalid/);
});

test("phase 23.9 selective closure and raw bundle record preserve exact lineage", () => {
  const contract = (procedure_id) => {
    const body = { procedure_id, registry_contract_version: "v1", skill_path: `${procedure_id}/SKILL.md`,
      skill_hash: sha("skill"), output_format_path: `${procedure_id}/output.md`, output_format_hash: sha("format"),
      output_schema_path: "schema.json", output_schema_hash: sha("schema") };
    return { ...body, output_contract_id: sha(JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))))) };
  };
  const carry = (procedure_id) => ({
    procedure_id, source_cohort_id: sha("prior"), source_plan_sha: sha("old-plan"),
    source_artifact_id: sha(`${procedure_id}:artifact`), source_artifact_hash: sha(`${procedure_id}:artifact`),
    target_plan_sha: sha("new-plan"), unchanged_decision_ids: ["D1"], unchanged_trace_ids: ["T1"],
    unchanged_contract_surface_ids: ["C1"], output_contract_id: sha(`${procedure_id}:contract`),
    validation_hash: sha(`${procedure_id}:validation`)
  });
  const cohortInput = {
    run_instance_id: "instance", run_id: "run", task_artifact_id: sha("task"),
    immutable_base: "a".repeat(40), planning_review_source_head: "b".repeat(40),
    anchor_plan_sha: sha("new-plan"), output_contract_refs: [contract("plan-review")],
    profile_id: "sol-high-read-only", bundle_kind: "closure", predecessor_cohort_id: sha("prior"),
    required_lens_ids: ["plan-review"], carried_lens_refs: [carry("architecture-review"), carry("db-storage-review")],
    context_core_hash: sha("context"), created_at: new Date(0).toISOString()
  };
  const cohort = buildReviewCohort(cohortInput);
  const rawEnvelope = '{"schema_version":1}\n';
  const bundle = buildPlanningReviewBundleRecord({
    run_instance_id: "instance", run_id: "run", cohort_id: cohort.record_id,
    attempt_id: "attempt", raw_envelope_utf8: rawEnvelope,
    ordered_lens_refs: [{ procedure_id: "plan-review", artifact_id: sha("lens"),
      artifact_hash: sha("lens"), output_contract_id: contract("plan-review").output_contract_id }],
    created_at: new Date(0).toISOString()
  });
  assert.equal(bundle.raw_envelope_hash, sha(rawEnvelope));
  assert.throws(() => buildReviewCohort({ ...cohortInput,
    required_lens_ids: ["plan-review", "architecture-review"], carried_lens_refs: [carry("architecture-review"), carry("db-storage-review")]
  }), /lens_cardinality_invalid/);
  assert.throws(() => buildReviewCohort({ ...cohortInput,
    carried_lens_refs: [
      { ...carry("architecture-review"), target_plan_sha: sha("wrong-plan") },
      carry("db-storage-review")
    ]
  }), /carry_forward_invalid/);
});

test("phase 23.9 fix attempt persists exact predecessor and diff lineage", () => {
  const observationRaw = "adapter=codex_cli\nprovider=openai\nmodel=gpt-5.6-sol\nreasoning=high\nsandbox=read-only\napproval_policy=never";
  const observation = { schema_version: 1, source: "codex_cli_startup_preamble_v1", session_id: "session",
    raw_bytes: observationRaw, raw_byte_length: Buffer.byteLength(observationRaw), raw_sha256: sha(observationRaw),
    byte_start: 0, byte_end: Buffer.byteLength(observationRaw) };
  const attempt = buildReviewAttempt({
    run_instance_id: "instance", run_id: "run", attempt_kind: "single_review", cohort_id: null,
    attempt_id: "attempt", claim_id: "claim", procedure_ids: ["fix-pass-review"], profile_id: "sol-high",
    request_artifact_hash: sha("request"), expected_bundle_output_path: "review.md",
    claimed_event_id: sha("claimed"), started_event_id: sha("started"), terminal_event_id: sha("terminal"),
    terminal_status: "success", verdict: null, reviewed_source_head: "a".repeat(40),
    implementation_diff_id: sha("exact-diff"), predecessor_review_attempt_id: "implementation-attempt",
    predecessor_review_artifact_id: sha("implementation-artifact"), bundle_envelope_id: null,
    bundle_envelope_hash: null, lens_results: [{ procedure_id: "fix-pass-review", status: "recorded",
      verdict: "PASS", artifact_id: sha("fix-artifact"), artifact_hash: sha("fix-artifact") }],
    created_at: new Date(0).toISOString()
  }, observation, { model: "gpt-5.6-sol", sandbox: "read-only" });
  assert.equal(attempt.implementation_diff_id, sha("exact-diff"));
  assert.equal(attempt.predecessor_review_attempt_id, "implementation-attempt");
  assert.equal(attempt.predecessor_review_artifact_id, sha("implementation-artifact"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-fix-attempt-"));
  const staging = new RunStagingDatabase(root, root, "run-fix-attempt");
  const run = buildRuntimeRun({
    runId: "run-fix-attempt", taskPath: "TASK.md", phaseId: "23.9",
    timestamp: new Date(0).toISOString(), repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  staging.saveRun(run);
  staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeIndependentRecord(database, {
      recordKind: "review_attempt", recordId: attempt.record_id,
      runId: run.run_id, phaseId: "23.9", taskPath: "TASK.md",
      createdAt: attempt.created_at, status: attempt.terminal_status,
      summary: "fix review attempt", payload: attempt
    });
    return current;
  });
  assert.deepEqual(staging.listIndependentRecords("review_attempt", run.run_id), [attempt]);
});

test("phase 23.9 reviewed baseline overlay is exact and source-grounded", () => {
  const diffHash = "8".repeat(64);
  const plan = [
    `owner-authorized planning authority diff SHA-256: \`${diffHash}\``,
    "", "Preapproval owner-authority overlay, already reviewed:", "",
    "- `tasks/PHASE_23_9.md`;", "- `tasks/PHASE_31.md`;", "- `docs/IMPLEMENTATION_ROADMAP.md`.",
    "", "Inspect only after this plan is recorded:"
  ].join("\n");
  assert.deepEqual(extractReviewedAuthorityOverlay(plan), {
    diffHash,
    paths: ["tasks/PHASE_23_9.md", "tasks/PHASE_31.md", "docs/IMPLEMENTATION_ROADMAP.md"]
  });
  assert.throws(() => extractReviewedAuthorityOverlay(plan.replace(diffHash, "requested")),
    /REVIEWED_AUTHORITY_OVERLAY_MISSING/);
});

test("phase 23.9 durable review and proof schemas expose closed contracts", () => {
  const readSchema = (name) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "schemas", name), "utf8"));
  const attempt = readSchema("review-attempt.schema.json");
  const event = readSchema("review-attempt-event.schema.json");
  const cohort = readSchema("review-cohort.schema.json");
  const bundle = readSchema("planning-review-bundle.schema.json");
  const proof = readSchema("proof-record.schema.json");
  assert.deepEqual(attempt.properties.verdict, { type: "null" });
  assert.deepEqual(attempt.properties.terminal_status.enum, [
    "success", "spawn_failed", "startup_observation_failed", "profile_mismatch",
    "failed", "timeout", "blocked", "invalid_artifact"
  ]);
  assert.equal(event.allOf.length, 5);
  assert.equal(event.$defs.cliPreamble.additionalProperties, false);
  assert.equal(event.$defs.turnContext.additionalProperties, false);
  assert.equal(cohort.properties.required_lens_ids.minItems, 1);
  assert.equal(bundle.$defs.bundleRecord.properties.schema_version.const,
    "phase-23.9.planning-review-bundle-record.v1");
  assert.deepEqual(proof.properties.lifecycle_applicability.required, [
    "snapshot_id", "contract_marker", "procedure_requirements", "stage_requirements"
  ]);
});

test("phase 23.9 reconciliation aggregates blockers only and requires coverage", () => {
  const shared = {
    schema_version: "phase-23.9.planning-lens-result.v1", bundle_kind: "impact_closure",
    plan_sha: sha("plan"), source_head: "a".repeat(40), task_artifact_id: sha("task"),
    immutable_base: "b".repeat(40), verdict: "PASS",
    covered_decision_ids: ["D1"], covered_trace_ids: ["T1"], output_contract_id: "contract"
  };
  const make = (procedure_id, findings = []) => ({ ...shared, procedure_id, findings });
  const results = [
    make("plan-review", [{ finding_id: "F", classification: "IMPLEMENTATION_DISCRETION", summary: "bounded", primary_lens: "plan-review", secondary_lenses: [], decision_ids: ["D1"], trace_ids: ["T1"] }]),
    make("architecture-review"), make("db-storage-review")
  ];
  assert.equal(aggregatePlanBlockers(results).findings.length, 0);
  assert.equal(reconcilePlanningLenses(results, ["D1"], ["T1"]), "REVIEW_COVERAGE_COMPLETE");
  assert.throws(() => reconcilePlanningLenses(results, ["D2"], ["T1"]), /coverage_incomplete/);
  assert.throws(() => validatePlanningLensResult({
    ...make("plan-review"), source_head: "requested"
  }), /planning_lens_result_contract_invalid/);
});

test("phase 23.9 proof is rejected until baseline review and delivery exist", () => {
  const runtimeField = (field_name) => ({
    field_id: sha(field_name), field_name, status: "observed",
    value: "observed", evidence_ref_id: sha(`ref:${field_name}`),
    gap_id: null, unavailable_cause: null
  });
  const proof = buildProofRecord({
    run_instance_id: "instance", run_id: "run", task_artifact_id: sha("task"),
    immutable_base: "a".repeat(40), activation_hash: sha("activation"),
    activation_source_head: "b".repeat(40), implementation_baseline_head: null,
    final_reviewed_source_head: null, delivered_source_head: null,
    eligibility_snapshot_id: sha("eligibility"), lifecycle_applicability: {},
    task_verifiability_map: [], evidence_refs: [], evidence_families: [],
    assumption_ledger: [],
    operating_envelope: {
      schema_version: "phase-23.9.operating-envelope.v1",
      producer_id: "proof_record_deriver_v1",
      run_start_ref_id: sha("run-start"),
      runtime_fields: ["host_os", "host_arch", "node_version", "network_access"].map(runtimeField),
      planning_lineage: {
        lineage_id: sha("lineage"), target_plan_sha: sha("plan"),
        direct_closure_cohort_id: null, contributing_context_ids: [], lens_map: []
      },
      review_contexts: [], gap_ids: []
    },
    delivery_slices: [],
    evidence_gaps: [], created_at: new Date(0).toISOString()
  });
  assert.equal(proof.acceptance.status, "rejected");
  assert.match(proof.record_id, /^sha256:[a-f0-9]{64}$/);
});

test("phase 23.9 delivery import persists exact-tree source authority and closeout rejects drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-delivery-source-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "phase23-9@example.invalid");
  git("config", "user.name", "Phase 23.9 Test");
  fs.writeFileSync(path.join(root, "source.txt"), "reviewed\n");
  git("add", "source.txt");
  git("commit", "-q", "-m", "reviewed");
  const reviewedHead = git("rev-parse", "HEAD");
  const reviewedTree = git("rev-parse", "HEAD^{tree}");
  git("commit", "-q", "--allow-empty", "-m", "delivered");
  const deliveredHead = git("rev-parse", "HEAD");

  const makeRun = (runId) => ({
    ...buildRuntimeRun({
      runId,
      taskPath: "TASK.md",
      phaseId: "23.9",
      repository: { root_path: root, project_root: root, dirty: false },
      requiredGates: []
    }),
    final_reviewed_source_head: reviewedHead,
    verification_results: [{
      verification_result_id: "verification-1", status: "pass",
      created_at: new Date(0).toISOString(), summary: "pass", source: "test",
      artifact_refs: [], command_results: []
    }],
    review_results: [{
      review_result_id: "review-1", status: "PASS",
      created_at: new Date(0).toISOString(), summary: "pass", source: "test",
      blockers: [], artifact_refs: []
    }]
  });
  const factsFor = (commitSha) => ({ facts: [
    {
      fact_kind: "merge_result", source: "github", status: "merged",
      recorded_at: new Date(1).toISOString(), summary: "merged", commit_sha: commitSha
    },
    {
      fact_kind: "merge_commit", source: "github", status: "merged",
      recorded_at: new Date(1).toISOString(), summary: "merge commit", commit_sha: commitSha
    }
  ] });

  const identityRun = makeRun("run-delivery-source-identity");
  const identityStaging = new RunStagingDatabase(root, root, identityRun.run_id);
  identityStaging.saveRun(identityRun);
  const identityFactsPath = path.join(root, "delivery-facts-identity.json");
  fs.writeFileSync(identityFactsPath, `${JSON.stringify(factsFor(reviewedHead))}\n`);
  const identity = importDeliveryFacts(root, identityRun.run_id, identityFactsPath);
  assert.equal(identity.run.delivery_source_relationship.relationship, "identity");
  assert.equal(identity.run.delivery_source_relationship.ancestry, "same_commit");
  assert.equal(identity.run.delivery_source_relationship.delivered_tree_hash, reviewedTree);

  const run = makeRun("run-delivery-source");
  const staging = new RunStagingDatabase(root, root, run.run_id);
  staging.saveRun(run);
  const factsPath = path.join(root, "delivery-facts.json");
  fs.writeFileSync(factsPath, `${JSON.stringify(factsFor(deliveredHead))}\n`);
  const imported = importDeliveryFacts(root, run.run_id, factsPath);
  assert.equal(imported.run.delivered_source_head, deliveredHead);
  assert.deepEqual(imported.run.delivery_source_relationship, {
    schema_version: 1,
    relationship: "merge_contains_exact_tree",
    delivered_source_head: deliveredHead,
    final_reviewed_source_head: reviewedHead,
    delivered_tree_hash: reviewedTree,
    final_reviewed_tree_hash: reviewedTree,
    ancestry: "ancestor",
    delivery_fact_id: imported.run.delivery_facts.find((fact) => fact.fact_kind === "merge_commit").delivery_fact_id
  });
  assert.deepEqual(staging.loadRun(run.run_id).delivery_source_relationship,
    imported.run.delivery_source_relationship);
  assert.equal(createCloseoutReceipt(imported.run, root).status, "READY");

  const missing = { ...imported.run, delivered_source_head: undefined, delivery_source_relationship: undefined };
  assert.match(createCloseoutReceipt(missing, root).blockers.join("\n"), /relationship is absent/);
  const stale = {
    ...imported.run,
    delivery_source_relationship: {
      ...imported.run.delivery_source_relationship,
      delivery_fact_id: "delivery-stale"
    }
  };
  assert.match(createCloseoutReceipt(stale, root).blockers.join("\n"), /stale, malformed/);
  const differentSource = {
    ...imported.run,
    final_reviewed_source_head: deliveredHead
  };
  assert.match(createCloseoutReceipt(differentSource, root).blockers.join("\n"), /stale, malformed/);
  assert.throws(() => validateRuntimeRun({
    ...imported.run,
    delivery_source_relationship: {
      ...imported.run.delivery_source_relationship,
      ancestry: "same_commit"
    }
  }), /inconsistent ancestry/);

  fs.writeFileSync(path.join(root, "source.txt"), "changed after review\n");
  git("add", "source.txt");
  git("commit", "-q", "-m", "different delivered tree");
  const changedHead = git("rev-parse", "HEAD");
  const rejectedRun = makeRun("run-delivery-source-rejected");
  const rejectedStaging = new RunStagingDatabase(root, root, rejectedRun.run_id);
  rejectedStaging.saveRun(rejectedRun);
  const rejectedFactsPath = path.join(root, "delivery-facts-rejected.json");
  fs.writeFileSync(rejectedFactsPath, `${JSON.stringify(factsFor(changedHead))}\n`);
  assert.throws(
    () => importDeliveryFacts(root, rejectedRun.run_id, rejectedFactsPath),
    /delivery_source_tree_mismatch/
  );
  assert.equal(rejectedStaging.loadRun(rejectedRun.run_id).delivered_source_head, undefined);
  assert.equal(rejectedStaging.loadRun(rejectedRun.run_id).delivery_source_relationship, undefined);

  const symbolicRun = makeRun("run-delivery-source-symbolic");
  const symbolicStaging = new RunStagingDatabase(root, root, symbolicRun.run_id);
  symbolicStaging.saveRun(symbolicRun);
  const symbolicFactsPath = path.join(root, "delivery-facts-symbolic.json");
  fs.writeFileSync(symbolicFactsPath, `${JSON.stringify(factsFor("HEAD"))}\n`);
  assert.throws(
    () => importDeliveryFacts(root, symbolicRun.run_id, symbolicFactsPath),
    /delivery_source_commit_identity_invalid/
  );
  assert.equal(symbolicStaging.loadRun(symbolicRun.run_id).delivery_facts.length, 0);
  assert.equal(symbolicStaging.loadRun(symbolicRun.run_id).delivered_source_head, undefined);

  const unrelatedHead = git("commit-tree", reviewedTree, "-m", "unrelated equal tree");
  const unrelatedRun = makeRun("run-delivery-source-unrelated");
  const unrelatedStaging = new RunStagingDatabase(root, root, unrelatedRun.run_id);
  unrelatedStaging.saveRun(unrelatedRun);
  const unrelatedFactsPath = path.join(root, "delivery-facts-unrelated.json");
  fs.writeFileSync(unrelatedFactsPath, `${JSON.stringify(factsFor(unrelatedHead))}\n`);
  assert.throws(
    () => importDeliveryFacts(root, unrelatedRun.run_id, unrelatedFactsPath),
    /delivery_source_ancestry_mismatch/
  );
  assert.equal(unrelatedStaging.loadRun(unrelatedRun.run_id).delivery_facts.length, 0);

  const rollbackRun = makeRun("run-delivery-source-rollback");
  const rollbackStaging = new RunStagingDatabase(root, root, rollbackRun.run_id);
  rollbackStaging.saveRun(rollbackRun);
  const sqlite = require("node:sqlite");
  const database = new sqlite.DatabaseSync(rollbackStaging.paths.stagingDbPath);
  database.exec([
    "CREATE TRIGGER phase23_9_force_delivery_failure",
    "BEFORE INSERT ON delivery_facts",
    "BEGIN SELECT RAISE(ABORT, 'forced_delivery_persistence_failure'); END;"
  ].join(" "));
  database.close();
  const rollbackFactsPath = path.join(root, "delivery-facts-rollback.json");
  fs.writeFileSync(rollbackFactsPath, `${JSON.stringify(factsFor(deliveredHead))}\n`);
  assert.throws(
    () => importDeliveryFacts(root, rollbackRun.run_id, rollbackFactsPath),
    /forced_delivery_persistence_failure/
  );
  const rolledBack = rollbackStaging.loadRun(rollbackRun.run_id);
  assert.equal(rolledBack.delivery_facts.length, 0);
  assert.equal(rolledBack.delivered_source_head, undefined);
  assert.equal(rolledBack.delivery_source_relationship, undefined);
});

test("phase 23.9 accepts a proof whose requirement map is extracted from frozen task bytes", () => {
  const taskBytes = fs.readFileSync(path.join(process.cwd(),
    "tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md"));
  const requirements = extractTaskRequirements(taskBytes);
  const evidence_refs = requirements.map((requirement) => ({
    ref_id: sha(`evidence:${requirement.requirement_id}`), source_kind: "procedure_artifact",
    source_id: `${sha("review")}#${requirement.requirement_id}`, content_hash: sha(requirement.requirement_id),
    run_instance_id: "instance", locator: `review#${requirement.requirement_id}`,
    relationship: "verifies_requirement"
  }));
  const runtimeField = (field_name) => ({
    field_id: sha(field_name), field_name, status: "observed", value: "observed",
    evidence_ref_id: evidence_refs[0].ref_id, gap_id: null, unavailable_cause: null
  });
  const proof = buildProofRecord({
    run_instance_id: "instance", run_id: "run", task_artifact_id: sha(taskBytes),
    immutable_base: "a".repeat(40), activation_hash: sha("activation"),
    activation_source_head: "b".repeat(40), implementation_baseline_head: "c".repeat(40),
    final_reviewed_source_head: "d".repeat(40), delivered_source_head: "e".repeat(40),
    eligibility_snapshot_id: sha("eligibility"), lifecycle_applicability: { resolved: true },
    task_verifiability_map: requirements.map((requirement, index) => ({
      requirement_id: requirement.requirement_id, source: requirement.source,
      applicability: "mandatory", verification_status: "verified",
      applicability_authority_ref_id: null, evidence_ref_ids: [evidence_refs[index].ref_id],
      gap_ids: [], assumption_ids: []
    })),
    evidence_refs, evidence_families: [{
      family: "task_requirements", applicability: "mandatory",
      ref_ids: evidence_refs.map((entry) => entry.ref_id), gap_ids: []
    }], assumption_ledger: [],
    operating_envelope: {
      schema_version: "phase-23.9.operating-envelope.v1", producer_id: "proof_record_deriver_v1",
      run_start_ref_id: sha("run-start"),
      runtime_fields: ["host_os", "host_arch", "node_version", "network_access"].map(runtimeField),
      planning_lineage: { lineage_id: sha("lineage"), target_plan_sha: sha("plan"),
        direct_closure_cohort_id: null, contributing_context_ids: [], lens_map: [] },
      review_contexts: [], gap_ids: []
    }, delivery_slices: [], evidence_gaps: [], created_at: new Date(0).toISOString()
  });
  assert.equal(proof.acceptance.status, "accepted");
  assert.equal(proof.task_verifiability_map.length, requirements.length);
});

test("phase 23.9 proof command accepts derivation requests, never caller-authored proof", () => {
  assert.deepEqual(parseProofDerivationRequest(Buffer.from('{"schema_version":1}')), {
    schema_version: 1
  });
  assert.throws(() => parseProofDerivationRequest(Buffer.from(JSON.stringify({
    schema_version: 1,
    acceptance: { status: "accepted" },
    task_verifiability_map: []
  }))), /proof_derivation_request_invalid/);
});

test("phase 23.9 procedure sequences are internal, unique, and monotonic", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-sequence-"));
  const staging = new RunStagingDatabase(root, root, "run-sequence");
  const run = buildRuntimeRun({
    runId: "run-sequence",
    taskPath: "TASK.md",
    phaseId: "23.9",
    timestamp: new Date(0).toISOString(),
    repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  staging.saveRun(run);
  const descriptor = (suffix, provenance = {}) => ({
    run_instance_id: run.run_instance_id,
    source_run_id: run.run_id,
    procedure_id: "plan-review",
    artifact_id: sha(`artifact:${suffix}`),
    payload_id: `payload-${suffix}`,
    content_hash: createHash("sha256").update(`artifact:${suffix}`).digest("hex"),
    recorded_at: new Date(Number(suffix) * 1000).toISOString(),
    provenance_json: JSON.stringify({ phase_id: "23.9", ...provenance })
  });
  staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeProcedureArtifact(database, descriptor("1"));
    return current;
  });
  const stored = staging.readProcedureArtifact(
    run.run_instance_id, "plan-review", descriptor("1").artifact_id
  );
  assert.equal(JSON.parse(stored.provenance_json).recording_sequence, 1);
  assert.throws(() => staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeProcedureArtifact(database, descriptor("2", { recording_sequence: 1 }));
    return current;
  }), /procedure_recording_sequence_not_next/);
  assert.throws(() => staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeProcedureArtifact(database, descriptor("3"));
    staging.storeProcedureArtifact(database, descriptor("4", { recording_sequence: 2 }));
    return current;
  }), /procedure_recording_sequence_not_next/);
  assert.equal(staging.readProcedureArtifact(
    run.run_instance_id, "plan-review", descriptor("3").artifact_id
  ), undefined);
});

test("phase 23.9 review bundle records compensate as one transaction", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-bundle-transaction-"));
  const staging = new RunStagingDatabase(root, root, "run-bundle");
  const run = buildRuntimeRun({
    runId: "run-bundle", taskPath: "TASK.md", phaseId: "23.9",
    timestamp: new Date(0).toISOString(), repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  staging.saveRun(run);
  assert.throws(() => staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    for (const [recordKind, recordId] of [
      ["review_cohort", sha("cohort")], ["review_attempt_event", sha("event")],
      ["review_attempt", sha("attempt")], ["planning_review_bundle", sha("bundle")]
    ]) {
      staging.storeIndependentRecord(database, {
        recordKind, recordId, runId: run.run_id, phaseId: "23.9", taskPath: "TASK.md",
        createdAt: new Date(0).toISOString(), status: "terminal", summary: recordKind,
        payload: { record_kind: recordKind, record_id: recordId }
      });
    }
    throw new Error("injected_bundle_failure");
  }), /injected_bundle_failure/);
  for (const kind of ["review_cohort", "review_attempt_event", "review_attempt", "planning_review_bundle"]) {
    assert.equal(staging.listIndependentRecords(kind, run.run_id).length, 0);
  }
});

test("phase 23.9 production planning bundle persists typed failure and one retry", async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ch-planning-bundle-runtime-")));
  fs.cpSync(path.join(process.cwd(), "skills", "self-hosting"), path.join(root, "skills", "self-hosting"), {
    recursive: true
  });
  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), "schemas/planning-review-lens-output.schema.json"),
    path.join(root, "schemas/planning-review-lens-output.schema.json")
  );
  fs.mkdirSync(path.join(root, "tasks"), { recursive: true });
  fs.writeFileSync(path.join(root, "tasks/PHASE_23_9.md"), "# Phase 23.9\n");
  fs.writeFileSync(path.join(root, "TASK.md"), "# Current Task\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const staging = new RunStagingDatabase(root, root, "run-bundle-runtime");
  const run = buildRuntimeRun({
    runId: "run-bundle-runtime", taskPath: "TASK.md", phaseId: "23.9",
    timestamp: new Date(0).toISOString(), repository: {
      root_path: root, project_root: root, branch: "codex/test", head_sha: head, dirty: false
    }
  });
  staging.saveRun({
    ...run,
    source_snapshot: head,
    active_task_path: "tasks/PHASE_23_9.md",
    approvals: [{
      approval_id: "approval", title: "reviewed plan", status: "approved",
      created_at: new Date(0).toISOString(), approver: "owner", reason: "fixture",
      reviewed_plan_artifact_id: sha("plan"), reviewed_plan_content_hash: sha("plan").slice(7),
      reviewed_evidence_artifact_id: sha("review")
    }]
  });
  fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex/request.md"), "Review the exact candidate.\n");
  fs.writeFileSync(path.join(root, ".codex/lenses.json"), JSON.stringify({
    schema_version: 1, bundle_kind: "candidate",
    predecessor_cohort_id: null,
    required_lens_ids: ["plan-review", "architecture-review", "db-storage-review"],
    carried_lens_refs: []
  }));
  const fakeBin = path.join(root, "fake-bin");
  const codexHome = path.join(root, "codex-home");
  const sessionId = "phase239-runtime-fixture";
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.join(codexHome, "sessions"), { recursive: true });
  fs.writeFileSync(path.join(fakeBin, "codex"), [
    "#!/usr/bin/env node",
    `process.stdout.write(${JSON.stringify(`${JSON.stringify({ type: "thread.started", thread_id: sessionId })}\n`)});`,
    "if (process.env.CODEX_FAKE_SLEEP === '1') setTimeout(() => process.exit(0), 3000);",
    "else process.exit(1);", ""
  ].join("\n"));
  fs.chmodSync(path.join(fakeBin, "codex"), 0o755);
  fs.writeFileSync(path.join(codexHome, "sessions", `rollout-${sessionId}.jsonl`), [
    JSON.stringify({ type: "session_meta", payload: { id: sessionId, model_provider: "openai" } }),
    JSON.stringify({ type: "turn_context", payload: {
      cwd: root, model: "gpt-5.6-sol", effort: "high",
      sandbox_policy: { type: "read-only" }, approval_policy: "never"
    } }), ""
  ].join("\n"));
  const priorPath = process.env.PATH;
  const priorCodexHome = process.env.CODEX_HOME;
  const priorFakeSleep = process.env.CODEX_FAKE_SLEEP;
  process.env.PATH = `${fakeBin}${path.delimiter}${priorPath ?? ""}`;
  process.env.CODEX_HOME = codexHome;
  process.env.CODEX_FAKE_SLEEP = "1";
  const launch = () => launchRuntimePlanningReviewBundle(root, {
    runId: run.run_id, requestPath: ".codex/request.md",
    outputPath: ".harness/runs/run-bundle-runtime/manual/bundle.json",
    lensManifestPath: ".codex/lenses.json", timeoutSeconds: 1, staleAfterSeconds: 1
  });
  try {
    await assert.rejects(launch(), /PLANNING_REVIEW_BUNDLE_TIMEOUT/);
    let attempts = staging.listIndependentRecords("review_attempt", run.run_id);
    let events = staging.listIndependentRecords("review_attempt_event", run.run_id);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].terminal_status, "timeout");
    assert.deepEqual(events.map((entry) => entry.sequence).sort(), [1, 2, 3]);
    assert.equal(staging.listIndependentRecords("review_cohort", run.run_id).length, 0);
    assert.equal(staging.listIndependentRecords("planning_review_bundle", run.run_id).length, 0);
    assert.equal(staging.loadRun(run.run_id).review_results.length, 0);
    process.env.CODEX_FAKE_SLEEP = "0";
    fs.writeFileSync(path.join(codexHome, "sessions", `rollout-${sessionId}.jsonl`), [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, model_provider: "openai" } }),
      JSON.stringify({ type: "turn_context", payload: {
        cwd: root, model: "gpt-5.6-terra", effort: "high",
        sandbox_policy: { type: "read-only" }, approval_policy: "never"
      } }), ""
    ].join("\n"));
    await assert.rejects(launch(), /PLANNING_REVIEW_BUNDLE_PROCESS_FAILED/);
    attempts = staging.listIndependentRecords("review_attempt", run.run_id);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.map((entry) => entry.terminal_status).sort(), ["profile_mismatch", "timeout"]);
    await assert.rejects(launch(), /PLANNING_REVIEW_BUNDLE_RETRY_NOT_ALLOWED/);
  } finally {
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    if (priorCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = priorCodexHome;
    if (priorFakeSleep === undefined) delete process.env.CODEX_FAKE_SLEEP;
    else process.env.CODEX_FAKE_SLEEP = priorFakeSleep;
  }
});

test("phase 23.9 corrupt proof transfer rolls back project run and receipt", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-proof-transfer-"));
  const staging = new RunStagingDatabase(root, root, "run-proof");
  const run = buildRuntimeRun({
    runId: "run-proof", taskPath: "TASK.md", phaseId: "23.9",
    timestamp: new Date(0).toISOString(), repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  staging.saveRun(run);
  staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeIndependentRecord(database, {
      recordKind: "proof_record", recordId: sha("proof"), runId: run.run_id,
      phaseId: "23.9", taskPath: "TASK.md", createdAt: new Date(0).toISOString(),
      status: "accepted", summary: "corrupt proof",
      payload: { record_id: sha("different-proof"), acceptance: { status: "accepted" } },
      retentionClass: "accepted"
    });
    return current;
  });
  const stored = staging.loadRun(run.run_id);
  const project = new ProjectMemoryDatabase(root, root);
  const harvest = {
    harvest_id: "harvest-run-proof", run_id: run.run_id, project_run_id: run.run_instance_id,
    status: "promoted", promoted_at: new Date(1).toISOString(), accepted_count: 1,
    discarded_count: 0, quarantined_count: 0, redacted_count: 0, unresolved_count: 0,
    source_task_path: "TASK.md", source_snapshot: "a".repeat(40), details: {}
  };
  assert.throws(() => project.saveAcceptedRun(stored, [], harvest), /project_proof_transfer_corrupt/);
  assert.equal(project.getRunByInstanceId(run.run_instance_id), undefined);
  assert.equal(project.getHarvestRecordByRunInstanceId(run.run_instance_id), undefined);
});

test("phase 23.9 harvest preserves discarded runs and gates later self-hosting runs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-harvest-"));
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"codex-harness"}\n');
  const discarded = buildRuntimeRun({
    runId: "run-discarded", taskPath: "TASK.md", phaseId: "23.9",
    timestamp: new Date(0).toISOString(),
    repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  const discardedStaging = new RunStagingDatabase(root, root, discarded.run_id);
  discardedStaging.saveRun({ ...discarded, lifecycle_status: "discarded" });
  assert.equal(harvestRun(root, root, discarded.run_id).harvest.status, "discarded");

  const later = buildRuntimeRun({
    runId: "run-later", taskPath: "TASK.md", phaseId: "24",
    timestamp: new Date(0).toISOString(),
    repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "b".repeat(40), dirty: false
    }
  });
  const laterStaging = new RunStagingDatabase(root, root, later.run_id);
  laterStaging.saveRun({ ...later, lifecycle_status: "closed" });
  assert.throws(() => harvestRun(root, root, later.run_id), /successor_disposition_cardinality_invalid:0/);
});

test("phase 23.9 reconciliation stops on drift and preserves runtime and source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-reconcile-product-"));
  const priorHome = process.env.HOME;
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ch-reconcile-home-"));
  try {
    for (const relativePath of [
      "src/core/install.ts", "src/core/runtime.ts", "schemas/install.schema.json",
      "skills/self-hosting/procedure-registry.json"
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), `${relativePath}\n`);
    }
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    const managed = getManagedBaselineContents("0.1.0");
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8"
    }).trim();
    const sourceTree = execFileSync("git", ["rev-parse", `${sourceCommit}^{tree}`], {
      cwd: root, encoding: "utf8"
    }).trim();
    const sourceInstall = execFileSync("git", ["show", `${sourceCommit}:src/core/install.ts`], {
      cwd: root
    });
    const catalog = buildInstallerOwnershipCatalog([
      buildInstallerOwnershipCatalogEntry({
        provenance: {
          kind: "committed_historical_source",
          source_id: sourceCommit,
          source_content_hash: sha(sourceTree),
          manifest_path: "src/core/install.ts",
          manifest_content_hash: sha(sourceInstall),
          review_authority_ref: sha("fixture-review")
        },
        inventory: [
          {
            path: ".harness/config.toml", content_hash: sha(managed.configToml),
            disposition: "quarantine", owner: "installer"
          },
          {
            path: ".harness/templates/managed/agents-block.md",
            content_hash: sha(managed.agentsBlock),
            disposition: "quarantine", owner: "installer"
          },
          {
            path: ".harness/templates/managed/config.toml",
            content_hash: sha(managed.configToml),
            disposition: "quarantine", owner: "installer"
          }
        ]
      })
    ]);
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets/installer-ownership-catalog.v1.json"),
      `${JSON.stringify(catalog, null, 2)}\n`);
    execFileSync("git", ["add", "assets/installer-ownership-catalog.v1.json"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "catalog"], { cwd: root });
    for (const [relativePath, contents] of [
      [".harness/config.toml", managed.configToml],
      [".harness/templates/managed/agents-block.md", managed.agentsBlock],
      [".harness/templates/managed/config.toml", managed.configToml],
      [".harness/runs/retained.txt", "runtime\n"],
      [".harness/evidence/retained.txt", "evidence\n"]
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), contents);
    }
    const manifest = buildInstallerOwnershipManifest(root, [
      {
        path: ".harness/config.toml", content_hash: sha(managed.configToml),
        disposition: "quarantine", owner: "installer"
      },
      {
        path: ".harness/templates/managed/agents-block.md", content_hash: sha(managed.agentsBlock),
        disposition: "quarantine", owner: "installer"
      },
      {
        path: ".harness/templates/managed/config.toml", content_hash: sha(managed.configToml),
        disposition: "quarantine", owner: "installer"
      }
    ]);
    fs.writeFileSync(path.join(root, ".harness/installer-ownership.v1.json"),
      `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(root, ".harness/install.json"), `${JSON.stringify({
      harness_version: "0.1.0", ownership_manifest: manifest.manifest_id
    })}\n`);
    fs.mkdirSync(path.join(root, ".harness/runs/reviewed"), { recursive: true });
    fs.writeFileSync(path.join(root, ".harness/runs/reviewed/run.json"), `${JSON.stringify({
      approvals: [{ status: "approved", reviewed_plan_artifact_id: sha("fixture-review") }]
    })}\n`);
    fs.writeFileSync(path.join(root, "AGENTS.md"),
      `unrelated\n${managed.agentsBlock}tail\n`);
    const journal = prepareSelfInstallReconciliation(root);
    fs.writeFileSync(path.join(root, ".harness/config.toml"), "drift\n");
    assert.throws(() => applySelfInstallReconciliation(journal), /reconciliation_(managed_content|inventory)_drift/);
    assert.equal(fs.readFileSync(path.join(root, ".harness/runs/retained.txt"), "utf8"), "runtime\n");
    assert.equal(fs.existsSync(path.join(root, ".harness/install.json")), true);
    fs.writeFileSync(path.join(root, ".harness/config.toml"), managed.configToml);
    fs.writeFileSync(path.join(root, "AGENTS.md"),
      `unrelated\n${managed.agentsBlock.replace("Treat `.harness/`", "Treat altered `.harness/`")}tail\n`);
    assert.throws(() => applySelfInstallReconciliation(journal), /managed_agents_block_drift/);
    fs.writeFileSync(path.join(root, "AGENTS.md"), `unrelated\n${managed.agentsBlock}tail\n`);
    const quarantine = path.join(
      root, ".harness/self-install-reconciliation/quarantine", journal.journal_id.slice(7),
      ".harness/config.toml"
    );
    fs.mkdirSync(path.dirname(quarantine), { recursive: true });
    fs.copyFileSync(path.join(root, ".harness/config.toml"), quarantine);
    fs.rmSync(path.join(root, ".harness/config.toml"));
    const completed = applySelfInstallReconciliation({
      ...journal,
      state: "applying",
      completed_steps: [],
      error: null
    });
    assert.equal(completed.state, "completed_receipt");
    assert.equal(fs.existsSync(path.join(root, ".harness/install.json")), false);
    assert.equal(fs.readFileSync(path.join(root, ".harness/runs/retained.txt"), "utf8"), "runtime\n");
    assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "unrelated\ntail\n");
    const rolledBack = rollbackSelfInstallReconciliation(completed);
    assert.equal(rolledBack.state, "rolled_back");
    assert.equal(fs.existsSync(path.join(root, ".harness/install.json")), true);
    assert.equal(fs.readFileSync(path.join(root, ".harness/config.toml"), "utf8"), managed.configToml);
    assert.equal(fs.readFileSync(path.join(root, ".harness/runs/retained.txt"), "utf8"), "runtime\n");
    assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"),
      `unrelated\n${managed.agentsBlock}tail\n`);
    fs.writeFileSync(path.join(root, ".harness/templates/managed/unowned.txt"), "unknown\n");
    const ambiguous = prepareSelfInstallReconciliation(root, true);
    assert.ok(ambiguous.items.some((item) => item.path.endsWith("unowned.txt")
      && item.disposition === "ambiguous_stop"));
    assert.throws(() => applySelfInstallReconciliation(ambiguous), /reconciliation_ambiguous_inventory/);
  } finally {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  }
});

test("phase 23.9 validation delegation is source-grounded, not plan-hash-specific", () => {
  const plan = [
    "### 15. Ordered implementation slices and validation",
    "",
    "Commands:",
    "",
    "- `npm run build`;",
    "- `node --test tests/acceptance/example.test.mjs`;",
    "",
    "## Effective Validation",
    "",
    "Section 15 is the complete binding validation contract."
  ].join("\n");
  assert.deepEqual(extractEffectiveValidationCommands(plan), [
    "npm run build",
    "node --test tests/acceptance/example.test.mjs"
  ]);
});

test("phase 23.9 frozen task extraction is stable and includes foundation authority", () => {
  const taskBytes = fs.readFileSync(path.join(
    process.cwd(),
    "tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md"
  ));
  const first = extractTaskRequirements(taskBytes);
  const second = extractTaskRequirements(taskBytes);
  assert.deepEqual(first, second);
  assert.ok(first.some((entry) => entry.source.requirement_kind === "foundation_constraint"));
  assert.ok(first.some((entry) => entry.source.requirement_kind === "schema_authority_constraint"));
  assert.ok(first.some((entry) => entry.source.requirement_kind === "acceptance_command"));
  assert.equal(new Set(first.map((entry) => entry.requirement_id)).size, first.length);
});

test("phase 23.9 exposes the exact bounded command surface and canonical catalog", () => {
  const help = execFileSync(process.execPath, ["bin/ch", "run", "--help"], {
    cwd: process.cwd(), encoding: "utf8"
  });
  assert.match(help, /launch-review --run <run-id> --bundle planning/);
  assert.match(help, /implementation-review\|fix-pass-review/);
  assert.match(help, /record-proof/);
  assert.match(help, /record-review-capability-evidence/);
  const catalog = readInstallerOwnershipCatalog(path.join(
    process.cwd(), "assets/installer-ownership-catalog.v1.json"
  ));
  assert.ok(Array.isArray(catalog.manifest_entries));
  assert.match(catalog.catalog_id, /^sha256:[a-f0-9]{64}$/);
});
