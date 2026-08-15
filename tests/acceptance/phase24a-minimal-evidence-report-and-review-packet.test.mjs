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
import { buildRuntimeRun, extractActiveTaskPath } from "../../dist/core/runtime.js";
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

function contextFixture(candidateHead = "7".repeat(40)) {
  const core = buildContextCore({ task_id: "24A", task_pointer_ref: "TASK.md", task_contract_ref: "tasks/PHASE_24A.md",
    approved_plan_ref: "evidence/plan.md#sha256:" + "1".repeat(64), procedure_contract_refs: ["skills/review/SKILL.md"],
    review_tier: "high", changed_surface_classes: ["runtime", "storage"], risk_classes: ["storage"],
    run_id: "run-view", run_instance_id: "instance-24a", branch: "codex/phase-24a", worktree_ref: ".",
    source_snapshot: candidateHead, immutable_base: "0".repeat(40), architectural_invariants: ["read only"],
    non_goals: ["no mutation"], acceptance_refs: ["tasks/PHASE_24A.md"], verification_refs: ["npm test"],
    source_provenance: [{ path: "TASK.md", content_hash: "sha256:" + "2".repeat(64), byte_count: 10,
      required: true, retrieval_mode: "read_only_reference" }], size_budget_bytes: 65536 });
  const manifest = buildContextManifest(core, { retrieval_capabilities: ["repo_read_only", "packet_plus_retrieval"] });
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
    created_at: "2026-01-01T00:00:01.000Z", summary: "ok", source: "run verify", artifact_refs: [], command_results: [] }],
    delivery_facts: [{ delivery_fact_id: "delivery-1", run_id: "run-view", fact_kind: "pr", source: "github",
      status: "created", recorded_at: "2026-01-01T00:00:03.000Z", summary: "created",
      url: "https://example.test/SECRET_SENTINEL?token=SECRET_SENTINEL", external_run_id: "SECRET_SENTINEL" }] });
  const proof = acceptedProofRecord();
  const first = buildHistoricalEvidenceReport(input, { proofRecords: [proof] });
  const second = buildHistoricalEvidenceReport(input, { proofRecords: [proof] });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("SECRET_SENTINEL"), false);
  assert.equal(first.proof.status, "recorded");
  assert.equal(first.redaction.redacted_field_count, 2);
  assert.equal(first.redaction.raw_payloads_exported, false);
});

test("Phase 24A historical proof availability cannot be inferred from routing records", () => {
  const report = buildHistoricalEvidenceReport(run({ review_routing_records: [{ record_kind: "routing_evaluation",
    record_id: "route-proof", created_at: "2026-01-01T00:00:01.000Z", status: "accepted", summary: "looks like proof",
    payload: { record_kind: "proof_record" } }] }));
  assert.equal(report.proof.status, "missing");
  assert.deepEqual(report.proof.refs, []);
});

test("Phase 24A pointer grammar distinguishes one inline pointer from a multiline direct scope", () => {
  assert.equal(extractActiveTaskPath("# Current Task\n\nImplement only: tasks/NEXT.md\n"), "tasks/NEXT.md");
  assert.equal(extractActiveTaskPath("# Task\n\nImplement only:\n\n- one bounded change\n"), undefined);
  assert.throws(() => extractActiveTaskPath("Implement only: ../NEXT.md\n"), /repository-relative/);
  assert.throws(() => extractActiveTaskPath("Implement only: tasks/A.md\nImplement only: tasks/B.md\n"), /multiple/);
});

test("Phase 24A accepted context view reconstructs exact payload identities, membership, parentage, and ordered refs", () => {
  const fixture = contextFixture();
  const view = buildAcceptedContextView(run({ review_routing_records: fixture.records }), fixture.packet.record_id,
    { payloads: fixture.payloads });
  assert.equal(view.context.core_id, fixture.core.context_core_id);
  assert.equal(view.context.manifest.context_core_id, fixture.core.context_core_id);
  assert.deepEqual(view.ordered_payload_refs.map((entry) => entry.payload_id), fixture.packet.payload.payload_ids);
  assert.throws(() => buildAcceptedContextView(run({ review_routing_records: fixture.records }), "wrong",
    { payloads: fixture.payloads }), /CONTEXT_PACKET/);
  const missing = fixture.payloads.filter((payload) => payload.kind !== "context-manifest");
  assert.throws(() => buildAcceptedContextView(run({ review_routing_records: fixture.records }), fixture.packet.record_id,
    { payloads: missing }), /CONTEXT_PAYLOAD_BINDING_MISMATCH/);
});

test("Phase 24A accepted context view fails closed on hash and parentage mismatches", () => {
  const fixture = contextFixture();
  const badPacketPayload = { ...fixture.packet.payload, context_core_hash: "sha256:" + "9".repeat(64) };
  const badPacket = { ...fixture.packet, record_id: "sha256:" + sha(canonicalJson(badPacketPayload)), payload: badPacketPayload };
  assert.throws(() => buildAcceptedContextView(run({ review_routing_records: [fixture.invocation, badPacket] }), badPacket.record_id,
    { payloads: fixture.payloads }), /OBJECT_IDENTITY_MISMATCH/);
  const badManifest = { ...fixture.manifest, context_core_id: "context-core-" + "8".repeat(64) };
  const badPayloads = fixture.payloads.map((payload) => payload.kind === "context-manifest" ? { ...payload, body: badManifest } : payload);
  assert.throws(() => buildAcceptedContextView(run({ review_routing_records: fixture.records }), fixture.packet.record_id,
    { payloads: badPayloads }), /MANIFEST_IDENTITY_MISMATCH/);
  const badParent = fixture.payloads.map((payload) => payload.kind === "context-core"
    ? { ...payload, parent_record_id: "review-launch-attempt:wrong" } : payload);
  assert.throws(() => buildAcceptedContextView(run({ review_routing_records: fixture.records }), fixture.packet.record_id,
    { payloads: badParent }), /CONTEXT_PAYLOAD_PARENT_MISMATCH/);
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
  const accepted = buildAcceptedContextView(run({ review_routing_records: fixture.records }), fixture.packet.record_id,
    { payloads: fixture.payloads });
  const malformedContext = structuredClone(accepted);
  malformedContext.ordered_payload_refs[0].unexpected = true;
  assert.throws(() => validateEvidenceView(malformedContext), /SCHEMA_INVALID/);
  const exactBinding = binding();
  const implementationView = buildImplementationReviewView(run({ lifecycle_status: "active",
    implementation_baseline_head: exactBinding.implementation_baseline_head, implementation_baseline_binding: exactBinding,
    review_routing_records: fixture.records }), "7".repeat(40), { packetRecordId: fixture.packet.record_id, payloads: fixture.payloads });
  const malformedRoute = structuredClone(implementationView);
  malformedRoute.route.risk_classes = "storage";
  assert.throws(() => validateEvidenceView(malformedRoute), /SCHEMA_INVALID/);
});

test("Phase 24A report and packet help are closed deterministic CLI surfaces", () => {
  const report = execFileSync(process.execPath, ["bin/ch", "memory", "report", "--help"], { encoding: "utf8" });
  const packet = execFileSync(process.execPath, ["bin/ch", "memory", "packet", "--help"], { encoding: "utf8" });
  assert.match(report, /--run-instance/);
  assert.match(packet, /implementation-review/);
});
