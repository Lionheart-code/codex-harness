import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  buildAcceptedContextView, buildHistoricalEvidenceReport, buildImplementationReviewView, validateEvidenceView
} from "../../dist/core/evidence-views.js";
import { canonicalJson } from "../../dist/core/evidence-types.js";
import { buildContextCore, buildContextManifest, buildReviewDeltaOverlay } from "../../dist/core/self-hosting-review-context.js";
import { buildRuntimeRun, extractActiveTaskPath, resolveTaskReference, validateRuntimeRun } from "../../dist/core/runtime.js";
import { deriveRequiredSemanticReviews, resolvePlanningReviewFacts } from "../../dist/core/self-hosting-review-policy.js";
import { ProjectMemoryDatabase } from "../../dist/core/project-memory-db.js";
import { openSqliteDatabase, openSqliteDatabaseReadOnly } from "../../dist/core/sqlite.js";
import { parseAuthoritativeProcedureProvenance } from "../../dist/core/run-staging-db.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function run(overrides = {}) {
  return {
    ...buildRuntimeRun({ runId: "run-view", taskPath: "TASK.md", activeTaskPath: "tasks/PHASE_24A.md",
      phaseId: "24A", repository: { root_path: "/repo", project_root: "/repo", branch: "codex/phase-24a",
        head_sha: "b".repeat(40), dirty: false }, timestamp: "2026-01-01T00:00:00.000Z" }),
    run_instance_id: "instance-24a", lifecycle_status: "harvested", source_snapshot: "a".repeat(40), ...overrides
  };
}

function promotedHarvest(sourceRun = run(), status = "promoted") {
  return { harvest_id: "harvest-24a", run_id: sourceRun.run_id, project_run_id: sourceRun.run_instance_id,
    status, promoted_at: "2026-01-01T00:10:00.000Z", accepted_count: 1, discarded_count: 0,
    quarantined_count: 0, redacted_count: 0, unresolved_count: 0,
    source_task_path: sourceRun.active_task_path, source_snapshot: sourceRun.source_snapshot, details: {} };
}

function binding() {
  return { schema_version: 3, approval_id: "approval-1", plan_artifact_hash: "sha256:" + "c".repeat(64),
    planning_review_source_head: "a".repeat(40), owner_authority_diff_hash: "sha256:" + "d".repeat(64),
    implementation_baseline_head: "a".repeat(40), implementation_baseline_tree_hash: "e".repeat(40),
    expected_tree_hash: "e".repeat(40), bound_at: "2026-01-01T00:00:00.000Z", task_artifact_id: "sha256:" + "f".repeat(64),
    run_instance_id: "instance-24a", immutable_base: "0".repeat(40), planning_cohort_id: "sha256:" + "1".repeat(64),
    required_planning_lens_ids: [], planning_lens_artifacts: [] };
}

function acceptedProofRecord() {
  const body = { schema_version: "phase-23.9.proof-record.v1", record_kind: "proof_record",
    proof_input_hash: "sha256:" + "5".repeat(64), run_instance_id: "instance-24a", run_id: "run-view",
    task_artifact_id: "sha256:" + "6".repeat(64), immutable_base: "0".repeat(40),
    activation_hash: "sha256:" + "7".repeat(64), activation_source_head: "1".repeat(40),
    implementation_baseline_head: "2".repeat(40), final_reviewed_source_head: "3".repeat(40),
    delivered_source_head: "4".repeat(40), eligibility_snapshot_id: "sha256:" + "8".repeat(64),
    evidence_gaps: [{ gap_id: "gap-1" }], acceptance: { status: "accepted" } };
  const identity = { schema_version: body.schema_version, record_kind: body.record_kind,
    run_instance_id: body.run_instance_id, task_artifact_id: body.task_artifact_id, immutable_base: body.immutable_base,
    activation_hash: body.activation_hash, activation_source_head: body.activation_source_head,
    implementation_baseline_head: body.implementation_baseline_head, final_reviewed_source_head: body.final_reviewed_source_head,
    delivered_source_head: body.delivered_source_head, eligibility_snapshot_id: body.eligibility_snapshot_id,
    proof_input_hash: body.proof_input_hash };
  return { ...body, record_id: "sha256:" + sha(canonicalJson(identity)), content_hash: "sha256:" + sha(canonicalJson(body)) };
}

function contextFixture(candidateHead = "7".repeat(40), manifestOptions = {}) {
  const core = buildContextCore({ task_id: "24A", task_pointer_ref: "TASK.md", task_contract_ref: "tasks/PHASE_24A.md",
    approved_plan_ref: "evidence/plan.md#sha256:" + "1".repeat(64), procedure_contract_refs: ["skills/review/SKILL.md"],
    review_tier: "high", changed_surface_classes: ["runtime", "storage"], risk_classes: ["storage"],
    run_id: "run-view", run_instance_id: "instance-24a", branch: "codex/phase-24a", worktree_ref: ".",
    source_snapshot: candidateHead, immutable_base: "0".repeat(40), architectural_invariants: ["read only"],
    non_goals: ["no mutation"], acceptance_refs: ["tasks/PHASE_24A.md"], verification_refs: ["npm test"],
    source_provenance: [{ path: "TASK.md", content_hash: "sha256:" + "2".repeat(64), byte_count: 10,
      required: true, retrieval_mode: "read_only_reference" }], size_budget_bytes: 65536 });
  const manifest = buildContextManifest(core, { retrieval_capabilities: ["repo_read_only", "packet_plus_retrieval"], ...manifestOptions });
  const overlay = buildReviewDeltaOverlay({ context_core_id: core.context_core_id,
    reviewed_candidate_id: "sha256:" + "3".repeat(64), changed_files: ["src/core/evidence-views.ts"],
    diff_refs: [`git-diff:${"a".repeat(40)}..${candidateHead}`], payload_refs: [], findings: [],
    verification_refs: ["verify-1"], changed_authority_surfaces: [], changed_architecture_surfaces: [],
    missing_evidence: [], escalation_reasons: ["storage"], size_budget_bytes: 32768 });
  const values = { "context-core": core, "context-manifest": manifest, "review-delta-overlay": overlay };
  const ids = { "context-core": "payload-core", "context-manifest": "payload-manifest", "review-delta-overlay": "payload-overlay" };
  const payloads = Object.entries(values).map(([kind, body]) => ({ payload_id: ids[kind], parent_record_id: "review-launch-attempt:attempt-1",
    source_run_id: "run-view", kind, media_type: "application/json", redaction_status: "not_applicable",
    retention_class: "accepted", raw_size_bytes: Buffer.byteLength(JSON.stringify(body) + "\n"),
    content_hash: "sha256:" + sha(JSON.stringify(body) + "\n"), body }));
  const packetPayload = { run_instance_id: "instance-24a", source_run_id: "run-view", procedure_id: "implementation-review",
    pass_kind: "implementation_review", context_core_id: core.context_core_id, context_core_hash: core.content_hash,
    context_manifest_id: manifest.context_manifest_id, context_manifest_hash: manifest.content_hash,
    delta_overlay_id: overlay.delta_overlay_id, delta_overlay_hash: overlay.content_hash,
    source_snapshot: "a".repeat(40), route_decision_id: "route-1", route_class: "critical_independent",
    policy_version: "policy-v1", binding_version: "binding-v1", binding_profile_id: "profile-1", review_tier: "high",
    risk_classes: ["storage"], required_semantic_reviews: ["implementation-review"], context_mode: "fresh_independent_delta",
    context_reuse: "miss", retention_class: "accepted", redaction_status: "not_redacted", usage_ref: "payload-usage",
    budget_class: "critical", independence_mode: "independent", approved_attempt_id: "attempt-1",
    payload_ids: [ids["context-core"], ids["context-manifest"], ids["review-delta-overlay"]], payload_kinds: ids };
  const packet = { record_kind: "review_replay_packet", record_id: "sha256:" + sha(canonicalJson(packetPayload)),
    created_at: "2026-01-01T00:00:02.000Z", status: "accepted", summary: "packet", payload: packetPayload };
  const invocation = { record_kind: "review_invocation", record_id: "invocation-1",
    created_at: "2026-01-01T00:00:01.000Z", status: "success", summary: "invocation", payload: {
      attempt_id: "attempt-1", procedure_id: "implementation-review", context_core_id: core.context_core_id,
      context_manifest_id: manifest.context_manifest_id, delta_overlay_id: overlay.delta_overlay_id,
      route_decision_id: "route-1", context_reuse: "miss"
    } };
  return { core, manifest, overlay, payloads, packet, invocation, records: [invocation, packet] };
}

test("Phase 24A historical report redacts external secrets before deterministic serialization and uses exact proof records", () => {
  const input = run({ verification_results: [{ verification_result_id: "verify-1", status: "PASS",
    created_at: "2026-01-01T00:00:01.000Z", summary: "ok", source: "SECRET_SENTINEL source", artifact_refs: [],
    command_results: [{ command_result_id: "command-1", command: "echo SECRET_SENTINEL", status: "PASS",
      exit_code: 0, artifact_refs: [] }] }],
    review_results: [{ review_result_id: "review-1", status: "FIX_REQUIRED", created_at: "2026-01-01T00:00:02.000Z",
      summary: "fix", source: "procedure:implementation-review", blockers: ["SECRET_SENTINEL blocker"], artifact_refs: [] }],
    remote_checks: [{ check_result_id: "check-1", gate_id: "ci", name: "SECRET_SENTINEL check", required: true,
      status: "pass", recorded_at: "2026-01-01T00:00:03.000Z", ci_run: { provider: "SECRET_SENTINEL",
        run_id: "SECRET_SENTINEL", url: "https://example.test/SECRET_SENTINEL" } }],
    delivery_facts: [{ delivery_fact_id: "delivery-1", run_id: "run-view", fact_kind: "pr", source: "github",
      status: "created", recorded_at: "2026-01-01T00:00:03.000Z", summary: "created",
      url: "https://example.test/SECRET_SENTINEL?token=SECRET_SENTINEL", external_run_id: "SECRET_SENTINEL" }] });
  const proof = acceptedProofRecord();
  const harvestRecord = promotedHarvest(input);
  const first = buildHistoricalEvidenceReport(input, { proofRecords: [proof], harvestRecord });
  const second = buildHistoricalEvidenceReport(input, { proofRecords: [proof], harvestRecord });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("SECRET_SENTINEL"), false);
  assert.equal(first.proof.status, "recorded");
  assert.ok(first.redaction.redacted_field_count >= 2);
  assert.equal(first.redaction.raw_payloads_exported, false);
});

test("Phase 24A historical proof availability cannot be inferred from routing records", () => {
  const input = run({ review_routing_records: [{ record_kind: "routing_evaluation",
    record_id: "route-proof", created_at: "2026-01-01T00:00:01.000Z", status: "accepted", summary: "looks like proof",
    payload: { record_kind: "proof_record" } }] });
  const report = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input) });
  assert.equal(report.proof.status, "missing");
  assert.deepEqual(report.proof.refs, []);
});

test("Phase 24A bootstrap proof is honestly not applicable and creates no missing-proof gap", () => {
  const input = run({ run_mode: "bootstrap" });
  const report = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input) });
  assert.equal(report.proof.status, "not_applicable");
  assert.equal(report.claims.find((claim) => claim.claim === "proof").status, "not_applicable");
  assert.equal(report.gaps.includes("proof"), false);
});

test("Phase 24A accepted Project Memory requires an exact promoted harvest disposition", () => {
  const input = run();
  assert.throws(() => buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input, "discarded") }),
    /ACCEPTED_PROJECT_MEMORY_REQUIRED/);
  assert.throws(() => buildHistoricalEvidenceReport(input), /ACCEPTED_PROJECT_MEMORY_REQUIRED/);
  assert.equal(buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input) }).harvest.status, "promoted");
  assert.throws(() => buildHistoricalEvidenceReport(input, { harvestRecord: {
    ...promotedHarvest(input), source_task_path: "tasks/WRONG.md"
  } }), /ACCEPTED_PROJECT_MEMORY_REQUIRED/);
});

test("Phase 24A review lineage supersedes implementation FIX_REQUIRED with fix-pass PASS", () => {
  const input = run({ review_results: [
    { review_result_id: "implementation-fix", status: "FIX_REQUIRED", created_at: "2026-01-01T00:00:01.000Z",
      summary: "fix", source: "procedure:implementation-review", blockers: ["SECRET_SENTINEL"], artifact_refs: [] },
    { review_result_id: "fix-pass", status: "PASS", created_at: "2026-01-01T00:00:02.000Z",
      summary: "pass", source: "procedure:fix-pass-review", blockers: [], artifact_refs: [] }
  ] });
  const report = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input) });
  assert.equal(report.reviews.find((entry) => entry.id === "implementation-fix").disposition, "superseded");
  assert.equal(report.reviews.find((entry) => entry.id === "fix-pass").disposition, "current");
  assert.equal(JSON.stringify(report).includes("SECRET_SENTINEL"), false);
});

test("Phase 24A historical output truncates only stable optional routing and fails when mandatory core cannot fit", () => {
  const routing = Array.from({ length: 120 }, (_, index) => ({ record_kind: "routing_evaluation",
    record_id: `route-${String(index).padStart(3, "0")}`, created_at: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    status: "accepted", summary: "optional", payload: { route_class: "critical_independent", usage_ref: `usage-${index}` } }));
  const input = run({ review_routing_records: routing });
  const first = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input), outputBudgetBytes: 12_000 });
  const second = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input), outputBudgetBytes: 12_000 });
  assert.deepEqual(first, second);
  assert.equal(first.truncation.applied, true);
  assert.ok(first.truncation.omitted_optional_count > 0);
  assert.ok(first.budget.output_bytes <= first.budget.limit_bytes);
  assert.ok(Buffer.byteLength(canonicalJson(first)) <= first.budget.limit_bytes);
  assert.equal(first.run.run_instance_id, input.run_instance_id);
  assert.ok(first.routing.records.some((record) => record.record_id === "route-119"));
  assert.ok(first.routing.usage_refs.every((usageRef) =>
    first.routing.records.some((record) => record.usage_ref === usageRef)));
  assert.throws(() => buildHistoricalEvidenceReport(input, {
    harvestRecord: promotedHarvest(input), outputBudgetBytes: 256
  }), /EVIDENCE_VIEW_MANDATORY_BUDGET_EXCEEDED/);
});

test("Phase 24A historical plan authority stays bound to the exact implementation baseline approval", () => {
  const exactPlan = "sha256:" + "c".repeat(64);
  const exactReview = "sha256:" + "d".repeat(64);
  const exactBinding = { ...binding(), plan_artifact_hash: exactPlan, plan_review_artifact_hash: exactReview };
  const input = run({ implementation_baseline_head: exactBinding.implementation_baseline_head,
    implementation_baseline_binding: exactBinding,
    artifacts: [{ artifact_id: exactPlan, path: "evidence/exact-plan.md", kind: "procedure-artifact:plan-amend", description: "exact" }],
    approvals: [{ approval_id: "approval-1", title: "Reviewed plan approved", status: "approved",
      created_at: "2026-01-01T00:00:00.000Z", approver: "owner", reason: "exact",
      reviewed_plan_artifact_id: exactPlan, reviewed_plan_content_hash: "c".repeat(64), reviewed_evidence_artifact_id: exactReview },
    { approval_id: "approval-later", title: "Reviewed plan approved", status: "approved",
      created_at: "2026-01-02T00:00:00.000Z", approver: "owner", reason: "unrelated",
      reviewed_plan_artifact_id: "sha256:" + "e".repeat(64), reviewed_plan_content_hash: "e".repeat(64),
      reviewed_evidence_artifact_id: "sha256:" + "f".repeat(64) }] });
  const report = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input) });
  assert.equal(report.plan.approval_id, "approval-1");
  assert.equal(report.plan.reviewed_plan_artifact_id, exactPlan);
  assert.throws(() => buildHistoricalEvidenceReport({ ...input,
    approvals: input.approvals.map((approval) => approval.approval_id === "approval-1"
      ? { ...approval, reviewed_evidence_artifact_id: "sha256:" + "0".repeat(64) } : approval)
  }, { harvestRecord: promotedHarvest(input) }), /HISTORICAL_PLAN_APPROVAL_BINDING_MISMATCH/);
});

test("Phase 24A remote CI and accepted provenance projection is bounded, exact, and secret-safe", () => {
  const artifactId = "sha256:" + "4".repeat(64);
  const input = run({
    review_results: [{ review_result_id: "review-provenance", status: "PASS", created_at: "2026-01-01T00:00:01.000Z",
      summary: "pass", source: "procedure:implementation-review", blockers: [],
      artifact_refs: [{ artifact_id: artifactId, path: "evidence/review.md", kind: "review", description: "review" }] }],
    remote_checks: [{ check_result_id: "check-1", gate_id: "ci", name: "CI", required: true, status: "failed",
      recorded_at: "2026-01-01T00:00:02.000Z", ci_run: { provider: "github", run_id: "SECRET_SENTINEL", url: "https://SECRET_SENTINEL" },
      metadata: { commit_sha: "5".repeat(40), conclusion: "failed",
        jobs: [{ id: "SECRET_SENTINEL", conclusion: "failed" }], steps: [{ name: "SECRET_SENTINEL", status: "failed" }] } }]
  });
  const report = buildHistoricalEvidenceReport(input, { harvestRecord: promotedHarvest(input),
    acceptedRecordDescriptors: [{ record_id: "instance-24a:review-record", record_kind: "review_result",
      task_path: input.active_task_path, created_at: "2026-01-01T00:00:01.000Z", status: "accepted", source_step_id: null, source_command: null }],
    acceptedDeliveryFactDescriptors: [{ delivery_fact_id: "instance-24a:check-1", fact_kind: "remote_ci",
      recorded_at: "2026-01-01T00:00:02.000Z", commit_sha: "5".repeat(40), excerpt_payload_id: "payload-ci" }],
    acceptedProcedureArtifactDescriptors: [{ procedure_id: "implementation-review", artifact_id: artifactId,
      payload_id: "instance-24a:payload-review", content_hash: "4".repeat(64), recorded_at: "2026-01-01T00:00:01.000Z",
      reviewed_plan_artifact_id: null, reviewed_plan_content_hash: null, reviewed_evidence_artifact_id: null }],
    acceptedPayloadDescriptors: [
      { payload_id: "instance-24a:payload-ci", parent_record_id: "instance-24a:delivery-fact:check-1", kind: "delivery_excerpt",
        bounded_excerpt: "SECRET_SENTINEL failed log", redaction_status: "redacted", retention_class: "audit",
        raw_size_bytes: 26, content_hash: "6".repeat(64), created_at: "2026-01-01T00:00:02.000Z" },
      { payload_id: "instance-24a:payload-review", parent_record_id: "instance-24a:review-record", kind: "procedure-artifact-body:implementation-review",
        bounded_excerpt: null, redaction_status: "not_applicable", retention_class: "accepted",
        raw_size_bytes: 10, content_hash: "4".repeat(64), created_at: "2026-01-01T00:00:01.000Z" }
    ] });
  assert.equal(JSON.stringify(report).includes("SECRET_SENTINEL"), false);
  assert.equal(report.remote_checks[0].commit_sha, "5".repeat(40));
  assert.equal(report.remote_checks[0].accepted_record_id, "instance-24a:check-1");
  assert.equal(report.remote_checks[0].evidence_ref, "instance-24a:payload-ci");
  assert.deepEqual(report.reviews[0].procedure_artifact_refs, [`implementation-review:${artifactId}`]);
  assert.ok(report.provenance.payloads.some((entry) => entry.payload_id === "instance-24a:payload-ci"));
});

test("Phase 24A accepted Project Memory read-only run selectors reject corrupt persisted RuntimeRun JSON", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase24a-project-memory-corrupt-"));
  try {
    const memory = new ProjectMemoryDatabase(root, root);
    const accepted = run();
    memory.saveAcceptedRun(accepted, [], promotedHarvest(accepted));
    assert.equal(memory.getRunByInstanceIdReadOnly(accepted.run_instance_id).run_instance_id, accepted.run_instance_id);
    const database = openSqliteDatabase(memory.projectDbPath);
    database.prepare("UPDATE project_run_instances SET run_json = ? WHERE run_instance_id = ?")
      .run(JSON.stringify({ run_id: accepted.run_id }), accepted.run_instance_id);
    database.close();
    assert.throws(() => memory.getRunByInstanceIdReadOnly(accepted.run_instance_id), /runtime run|ACCEPTED_RUNTIME_RUN/i);
    assert.throws(() => memory.listRunsByDisplayRunIdReadOnly(accepted.run_id), /runtime run|ACCEPTED_RUNTIME_RUN/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Phase 24A pointer grammar distinguishes one inline pointer from a multiline direct scope", () => {
  assert.equal(extractActiveTaskPath("# Current Task\n\nImplement only: tasks/NEXT.md\n"), "tasks/NEXT.md");
  assert.equal(extractActiveTaskPath("# Task\n\nImplement only:\n\n- one bounded change\n"), undefined);
  assert.equal(extractActiveTaskPath("# Phase 24A\n\nImplement only:\n\n- one bounded change\n\n```md\nImplement only: tasks/EVIL.md\n```\n\nExample: `Implement only: tasks/ALSO-EVIL.md`\n"), undefined);
  assert.equal(extractActiveTaskPath("# Phase 24A\n\nImplement only:\n\n- direct scope\n\nLater example:\nImplement only: tasks/EXAMPLE.md\n"), undefined);
  assert.throws(() => extractActiveTaskPath("# Current Task\n\nImplement only: ../NEXT.md\n"), /repository-relative/);
  assert.throws(() => extractActiveTaskPath("# Current Task\n\nImplement only: tasks/A.md\nImplement only: tasks/B.md\n"), /multiple/);
  assert.throws(() => extractActiveTaskPath("# Current Task\n\nImplement only:\n"), /malformed/);
});

test("Phase 24A pointer grammar keeps mixed and short Markdown fences non-authoritative", () => {
  for (const markdown of [
    "# Current Task\n\n```text\n~~~\nImplement only: tasks/EVIL.md\n",
    "# Current Task\n\n~~~text\n```\nImplement only: tasks/EVIL.md\n",
    "# Current Task\n\n````text\n```\nImplement only: tasks/EVIL.md\n"
  ]) {
    assert.throws(() => extractActiveTaskPath(markdown), /unterminated or mismatched/);
  }
  assert.equal(extractActiveTaskPath("# Current Task\n\n````text\n```\nImplement only: tasks/EVIL.md\n````\n"), undefined);
});

test("Phase 24A typed review authority is invariant under adversarial prose and Markdown formatting", () => {
  const taskBlock = ["```yaml", "planning_review_authority_contract: planned-review-facts.v1", "task_id: 24A",
    "task_contract_ref: tasks/PHASE_24A.md", "review_tier: extra-high", "minimum_planned_surface_classes:",
    "  - runtime", "minimum_planned_risk_classes:", "  - lifecycle", "```"].join("\n");
  const planBlock = ["```yaml", "planning_review_facts_contract: planned-review-facts.v1", "review_tier: high",
    "planned_surface_classes:", "  - schemas", "planned_risk_classes:", "  - storage", "```"].join("\n");
  const resolve = (taskMarkdown, planMarkdown) => resolvePlanningReviewFacts({ taskMarkdown, planMarkdown,
    taskArtifactId: "sha256:" + "1".repeat(64), activeTaskPath: "tasks/PHASE_24A.md", phaseId: "24A",
    effectivePlanArtifactId: "sha256:" + "2".repeat(64), runInstanceId: "instance",
    immutableBase: "3".repeat(40), knownChangedSurfaceClasses: ["runtime"], knownRiskClasses: ["authority"] });
  const baseline = resolve(taskBlock, planBlock);
  const adversarial = resolve(`${taskBlock}\nProse storage authority lifecycle and \`extra-high\`.`,
    `${planBlock}\nFormatting says extra-high without typed authority.`);
  assert.deepEqual(adversarial, baseline);
  assert.deepEqual(deriveRequiredSemanticReviews("implementation-review", baseline.review_tier,
    baseline.planned_surface_classes, baseline.risk_classes),
  deriveRequiredSemanticReviews("implementation-review", adversarial.review_tier,
    adversarial.planned_surface_classes, adversarial.risk_classes));
  const runtimeSource = fs.readFileSync("src/core/runtime.ts", "utf8");
  assert.doesNotMatch(runtimeSource, /taskContractRef[^\n]*includes\([^\n]*extra-high/);
});

test("Phase 24A task authority rejects unreadable, out-of-repository, and recursive targets", () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "phase24a-task-grammar-")));
  try {
    fs.mkdirSync(path.join(root, "tasks"));
    fs.writeFileSync(path.join(root, "TASK.md"), "# Current Task\n\nImplement only: tasks/MISSING.md\n");
    assert.throws(() => resolveTaskReference(root, "TASK.md"), /not a readable regular file/);
    fs.writeFileSync(path.join(root, "tasks", "RECURSIVE.md"), "# Current Task\n\nImplement only: tasks/OTHER.md\n");
    fs.writeFileSync(path.join(root, "tasks", "OTHER.md"), "# Phase X\n");
    fs.writeFileSync(path.join(root, "TASK.md"), "# Current Task\n\nImplement only: tasks/RECURSIVE.md\n");
    assert.throws(() => resolveTaskReference(root, "TASK.md"), /recursion/);
    fs.writeFileSync(path.join(root, "TASK.md"), "# Current Task\n\nImplement only: ../OUTSIDE.md\n");
    assert.throws(() => resolveTaskReference(root, "TASK.md"), /repository-relative/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Phase 24A accepted context view reconstructs exact payload identities, membership, parentage, and ordered refs", () => {
  const fixture = contextFixture();
  const acceptedRun = run({ review_routing_records: fixture.records });
  const view = buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: fixture.payloads, harvestRecord: promotedHarvest(acceptedRun) });
  assert.equal(view.context.core_id, fixture.core.context_core_id);
  assert.equal(view.acceptance.status, "promoted");
  assert.equal(view.context.manifest.context_core_id, fixture.core.context_core_id);
  assert.deepEqual(view.ordered_payload_refs.map((entry) => entry.payload_id), fixture.packet.payload.payload_ids);
  assert.throws(() => buildAcceptedContextView(acceptedRun, "wrong",
    { payloads: fixture.payloads, harvestRecord: promotedHarvest(acceptedRun) }), /CONTEXT_PACKET/);
  const missing = fixture.payloads.filter((payload) => payload.kind !== "context-manifest");
  assert.throws(() => buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: missing, harvestRecord: promotedHarvest(acceptedRun) }), /CONTEXT_PAYLOAD_BINDING_MISMATCH/);
});

test("Phase 24A accepted context distinguishes source manifest omissions from output truncation", () => {
  const fixture = contextFixture("7".repeat(40), { omissions: ["optional historical note unavailable"] });
  const acceptedRun = run({ review_routing_records: fixture.records });
  const view = buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: fixture.payloads, harvestRecord: promotedHarvest(acceptedRun) });
  assert.deepEqual(view.retrieval.source_manifest_omissions, ["optional historical note unavailable"]);
  assert.equal(view.truncation.applied, false);
  assert.equal(view.truncation.omitted_optional_count, 0);
});

test("Phase 24A accepted context view fails closed on hash and parentage mismatches", () => {
  const fixture = contextFixture();
  const acceptedRun = run({ review_routing_records: fixture.records });
  const badPacketPayload = { ...fixture.packet.payload, context_core_hash: "sha256:" + "9".repeat(64) };
  const badPacket = { ...fixture.packet, record_id: "sha256:" + sha(canonicalJson(badPacketPayload)), payload: badPacketPayload };
  const badPacketRun = run({ review_routing_records: [fixture.invocation, badPacket] });
  assert.throws(() => buildAcceptedContextView(badPacketRun, badPacket.record_id,
    { payloads: fixture.payloads, harvestRecord: promotedHarvest(badPacketRun) }), /OBJECT_IDENTITY_MISMATCH/);
  const badManifest = { ...fixture.manifest, context_core_id: "context-core-" + "8".repeat(64) };
  const badPayloads = fixture.payloads.map((payload) => payload.kind === "context-manifest" ? { ...payload, body: badManifest } : payload);
  assert.throws(() => buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: badPayloads, harvestRecord: promotedHarvest(acceptedRun) }), /MANIFEST_IDENTITY_MISMATCH/);
  const badParent = fixture.payloads.map((payload) => payload.kind === "context-core"
    ? { ...payload, parent_record_id: "review-launch-attempt:wrong" } : payload);
  assert.throws(() => buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: badParent, harvestRecord: promotedHarvest(acceptedRun) }), /CONTEXT_PAYLOAD_PARENT_MISMATCH/);
});

test("Phase 24A implementation review view includes exact overlay, route, policy, proof, and baseline bindings", () => {
  const candidate = "7".repeat(40);
  const fixture = contextFixture(candidate);
  const exactBinding = binding();
  const active = run({ lifecycle_status: "active", implementation_baseline_head: exactBinding.implementation_baseline_head,
    implementation_baseline_binding: exactBinding, review_routing_records: fixture.records });
  const view = buildImplementationReviewView(active, candidate, { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads });
  assert.equal(view.run.candidate_head, candidate);
  assert.deepEqual(view.delta.changed_files, ["src/core/evidence-views.ts"]);
  assert.equal(view.route.policy_version, "policy-v1");
  assert.equal(view.transport.retrieval, "read_only_exact_payload_reconstruction");
  assert.equal(view.evidence.proof.status, "missing");
  assert.throws(() => buildImplementationReviewView({ ...active, implementation_baseline_head: "9".repeat(40) }, candidate,
    { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads }), /IMPLEMENTATION_BASELINE_REQUIRED/);
  assert.throws(() => buildImplementationReviewView(active, "6".repeat(40),
    { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads }), /CANDIDATE_BINDING_MISMATCH/);
});

test("Phase 24A implementation review bounded history reports truthful truncation", () => {
  const candidate = "7".repeat(40);
  const fixture = contextFixture(candidate);
  const exactBinding = binding();
  const history = Array.from({ length: 70 }, (_, index) => ({ record_kind: "routing_evaluation",
    record_id: `history-${String(index).padStart(3, "0")}`, created_at: `2025-12-31T23:${String(index % 60).padStart(2, "0")}:00.000Z`,
    status: "accepted", summary: "history", payload: {} }));
  const active = run({ lifecycle_status: "active", implementation_baseline_head: exactBinding.implementation_baseline_head,
    implementation_baseline_binding: exactBinding, review_routing_records: [...history, ...fixture.records] });
  const view = buildImplementationReviewView(active, candidate,
    { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads });
  assert.equal(view.truncation.applied, true);
  assert.ok(view.truncation.omitted_optional_count > 0);
  assert.ok(view.truncation.reasons.includes("bounded_routing_history_limit"));
});

test("Phase 24A immutable SQLite read opens a WAL-mode database without filesystem writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase24a-wal-"));
  const databasePath = path.join(root, "staging.sqlite");
  const writable = openSqliteDatabase(databasePath);
  writable.exec("PRAGMA journal_mode=WAL; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES ('accepted');");
  writable.close();
  try {
    const tracked = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].filter(fs.existsSync);
    const before = new Map(tracked.map((file) => [file, sha(fs.readFileSync(file))]));
    fs.chmodSync(root, 0o555);
    const readOnly = openSqliteDatabaseReadOnly(databasePath);
    try {
      assert.equal(readOnly.prepare("SELECT value FROM evidence").get().value, "accepted");
    } finally { readOnly.close(); }
    assert.deepEqual(new Map(tracked.map((file) => [file, sha(fs.readFileSync(file))])), before);
  } finally {
    fs.chmodSync(root, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Phase 24A read-only SQLite fails closed on active WAL bytes without mutating DB, WAL, or SHM", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase24a-active-wal-"));
  const databasePath = path.join(root, "staging.sqlite");
  const writable = openSqliteDatabase(databasePath);
  try {
    writable.exec("PRAGMA journal_mode=WAL; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES ('active');");
    const tracked = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].filter(fs.existsSync);
    const before = new Map(tracked.map((file) => [file, sha(fs.readFileSync(file))]));
    fs.chmodSync(root, 0o555);
    assert.throws(() => openSqliteDatabaseReadOnly(databasePath), /SQLITE_READ_ACTIVE_WAL_UNAVAILABLE/);
    assert.deepEqual(new Map(tracked.map((file) => [file, sha(fs.readFileSync(file))])), before);
  } finally {
    fs.chmodSync(root, 0o755);
    writable.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Phase 24A fix-pass readback accepts exact semantic-review provenance and rejects legacy-field substitution", () => {
  const provenance = { phase_id: "24A", task_path: "tasks/PHASE_24A.md", worktree: "/repo",
    branch: "codex/phase-24a", reviewed_source_head: "7".repeat(40), reviewed_diff_hash: "sha256:" + "8".repeat(64),
    review_attempt_id: "attempt-1", compatibility_path: "evidence/implementation-review.md" };
  assert.deepEqual(parseAuthoritativeProcedureProvenance(JSON.stringify(provenance), "implementation-review"), provenance);
  assert.throws(() => parseAuthoritativeProcedureProvenance(JSON.stringify({ ...provenance,
    reviewed_source_head: undefined, head: "7".repeat(40) }), "implementation-review"), /source_snapshot/);
});

test("Phase 24A schemas reject ungoverned top-level fields and type the material evidence contracts", () => {
  for (const file of ["historical-evidence-report.schema.json", "context-export-view.schema.json", "implementation-review-view.schema.json"]) {
    const schema = JSON.parse(fs.readFileSync(path.join("schemas", file), "utf8"));
    assert.equal(schema.additionalProperties, false);
    assert.ok(Object.keys(schema.properties).length >= 13);
  }
  const implementation = JSON.parse(fs.readFileSync("schemas/implementation-review-view.schema.json", "utf8"));
  assert.ok(implementation.required.includes("delta"));
  assert.ok(implementation.required.includes("route"));
  assert.ok(implementation.required.includes("budget"));
  assert.ok(implementation.properties.context.properties.core.$ref.includes("contextCore"));
  const fixture = contextFixture();
  const acceptedRun = run({ review_routing_records: fixture.records });
  const accepted = buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: fixture.payloads, harvestRecord: promotedHarvest(acceptedRun) });
  const malformedContext = structuredClone(accepted);
  malformedContext.ordered_payload_refs[0].unexpected = true;
  assert.throws(() => validateEvidenceView(malformedContext), /SCHEMA_INVALID/);
  for (const mutate of [
    (view) => { view.retrieval.canonical_bytes.core = "bad"; },
    (view) => { view.transport.mode = []; },
    (view) => { view.redaction.source_redactions = "bad"; },
    (view) => { view.truncation.omitted_optional_count = -1; }
  ]) {
    const malformed = structuredClone(accepted); mutate(malformed);
    assert.throws(() => validateEvidenceView(malformed), /SCHEMA_INVALID/);
  }
  const exactBinding = binding();
  const implementationView = buildImplementationReviewView(run({ lifecycle_status: "active",
    implementation_baseline_head: exactBinding.implementation_baseline_head, implementation_baseline_binding: exactBinding,
    review_routing_records: fixture.records }), "7".repeat(40), { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads });
  const malformedRoute = structuredClone(implementationView);
  malformedRoute.route.risk_classes = "storage";
  assert.throws(() => validateEvidenceView(malformedRoute), /SCHEMA_INVALID/);
  for (const mutate of [
    (view) => { view.plan.lens_artifacts = {}; },
    (view) => { view.procedure.source_map_ref = null; },
    (view) => { view.evidence.verification_refs = "bad"; },
    (view) => { view.transport.context_reuse = []; },
    (view) => { view.budget.core_bytes = -1; },
    (view) => { view.independence.required = false; },
    (view) => { view.delta.findings = [{ finding_id: "x", disposition: "invalid" }]; }
  ]) {
    const malformed = structuredClone(implementationView); mutate(malformed);
    assert.throws(() => validateEvidenceView(malformed), /SCHEMA_INVALID/);
  }
  const historicalRun = run({ verification_results: [{ verification_result_id: "verify", status: "PASS",
    created_at: "2026-01-01T00:00:01.000Z", summary: "ok", source: "test", artifact_refs: [], command_results: [] }] });
  const historical = buildHistoricalEvidenceReport(historicalRun, { harvestRecord: promotedHarvest(historicalRun) });
  for (const mutate of [
    (view) => { view.verification[0].commands = {}; },
    (view) => { view.harvest.accepted_count = -1; },
    (view) => { view.routing.records = {}; },
    (view) => { view.provenance.procedure_artifacts = {}; },
    (view) => { view.budget.limit_bytes = 0; }
  ]) {
    const malformed = structuredClone(historical); mutate(malformed);
    assert.throws(() => validateEvidenceView(malformed), /SCHEMA_INVALID/);
  }
});

test("Phase 24A validators recompute view identity for every view kind", () => {
  const acceptedRun = run({ review_routing_records: contextFixture().records });
  const fixture = contextFixture();
  acceptedRun.review_routing_records = fixture.records;
  const historical = buildHistoricalEvidenceReport(acceptedRun, { harvestRecord: promotedHarvest(acceptedRun) });
  const accepted = buildAcceptedContextView(acceptedRun, fixture.packet.record_id,
    { payloads: fixture.payloads, harvestRecord: promotedHarvest(acceptedRun) });
  const exactBinding = binding();
  const active = run({ lifecycle_status: "active", implementation_baseline_head: exactBinding.implementation_baseline_head,
    implementation_baseline_binding: exactBinding, review_routing_records: fixture.records });
  const implementation = buildImplementationReviewView(active, "7".repeat(40),
    { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads });
  for (const view of [historical, accepted, implementation]) {
    const tampered = structuredClone(view);
    tampered.claims[0].claim = "tampered_material_claim";
    assert.throws(() => validateEvidenceView(tampered), /EVIDENCE_VIEW_ID_MISMATCH/);
  }
});

test("Phase 24A runtime v3 schema and parser require complete exact cohort authority while v1 and v2 remain readable", () => {
  const base = run({ lifecycle_status: "active" });
  const common = { approval_id: "approval", plan_artifact_hash: "sha256:" + "1".repeat(64),
    planning_review_source_head: "2".repeat(40), owner_authority_diff_hash: "sha256:" + "3".repeat(64),
    implementation_baseline_head: "4".repeat(40), implementation_baseline_tree_hash: "5".repeat(40),
    expected_tree_hash: "5".repeat(40), bound_at: "2026-01-01T00:00:00.000Z" };
  assert.doesNotThrow(() => validateRuntimeRun({ ...base, implementation_baseline_head: common.implementation_baseline_head,
    implementation_baseline_binding: { schema_version: 1, ...common } }));
  assert.doesNotThrow(() => validateRuntimeRun({ ...base, implementation_baseline_head: common.implementation_baseline_head,
    implementation_baseline_binding: { schema_version: 2, ...common, plan_review_artifact_hash: "sha256:" + "6".repeat(64),
      authority_transition: "reviewed_source" } }));
  const v3 = { schema_version: 3, ...common, plan_review_artifact_hash: "sha256:" + "6".repeat(64),
    authority_transition: "reviewed_source", task_artifact_id: "sha256:" + "7".repeat(64), run_instance_id: base.run_instance_id,
    immutable_base: "8".repeat(40), planning_cohort_id: "sha256:" + "9".repeat(64), required_planning_lens_ids: ["plan-review"],
    planning_lens_artifacts: [{ procedure_id: "plan-review", artifact_id: "sha256:" + "a".repeat(64),
      artifact_content_hash: "sha256:" + "b".repeat(64) }] };
  assert.doesNotThrow(() => validateRuntimeRun({ ...base, implementation_baseline_head: common.implementation_baseline_head,
    implementation_baseline_binding: v3 }));
  assert.throws(() => validateRuntimeRun({ ...base, implementation_baseline_head: common.implementation_baseline_head,
    implementation_baseline_binding: { ...v3, planning_lens_artifacts: [] } }), /incomplete planning_lens_artifacts/);
  const schema = JSON.parse(fs.readFileSync("schemas/runtime-run.schema.json", "utf8"));
  assert.ok(schema.allOf.some((entry) => entry.if?.properties?.implementation_baseline_binding?.properties?.schema_version?.const === 3));
});

test("Phase 24A report and packet help are closed deterministic CLI surfaces", () => {
  const report = execFileSync(process.execPath, ["bin/ch", "memory", "report", "--help"], { encoding: "utf8" });
  const packet = execFileSync(process.execPath, ["bin/ch", "memory", "packet", "--help"], { encoding: "utf8" });
  assert.match(report, /--run-instance/);
  assert.match(packet, /implementation-review/);
});
