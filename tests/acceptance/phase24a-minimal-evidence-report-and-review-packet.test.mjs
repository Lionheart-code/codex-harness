import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  buildAcceptedContextView, buildHistoricalEvidenceReport, buildImplementationReviewView
} from "../../dist/core/evidence-views.js";
import { buildRuntimeRun, extractActiveTaskPath } from "../../dist/core/runtime.js";

function run(overrides = {}) {
  return {
    ...buildRuntimeRun({ runId: "run-view", taskPath: "TASK.md", activeTaskPath: "tasks/PHASE_24A.md",
      phaseId: "24A", repository: { root_path: "/repo", project_root: "/repo", branch: "codex/phase-24a",
        head_sha: "b".repeat(40), dirty: false }, timestamp: "2026-01-01T00:00:00.000Z" }),
    run_instance_id: "instance-24a", lifecycle_status: "harvested", source_snapshot: "a".repeat(40), ...overrides
  };
}

test("Phase 24A historical report is deterministic, evidence-linked, and does not expose raw payloads", () => {
  const input = run({ verification_results: [{ verification_result_id: "verify-1", status: "PASS",
    created_at: "2026-01-01T00:00:01.000Z", summary: "ok", command_results: [] }] });
  const first = buildHistoricalEvidenceReport(input);
  const second = buildHistoricalEvidenceReport(input);
  assert.deepEqual(first, second);
  assert.equal(first.authority, "accepted_project_memory");
  assert.equal(first.claims.find((claim) => claim.claim === "verification").status, "evidence");
  assert.equal(JSON.stringify(first).includes("SECRET_SENTINEL"), false);
  assert.equal(first.redaction.raw_payloads_exported, false);
});

test("Phase 24A pointer grammar distinguishes one inline pointer from a multiline direct scope", () => {
  assert.equal(extractActiveTaskPath("# Current Task\n\nImplement only: tasks/NEXT.md\n"), "tasks/NEXT.md");
  assert.equal(extractActiveTaskPath("# Task\n\nImplement only:\n\n- one bounded change\n"), undefined);
  assert.throws(() => extractActiveTaskPath("Implement only: ../NEXT.md\n"), /repository-relative/);
  assert.throws(() => extractActiveTaskPath("Implement only: tasks/A.md\nImplement only: tasks/B.md\n"), /multiple/);
});

test("Phase 24A accepted context view binds exact existing core and manifest refs", () => {
  const payload = { procedure_id: "implementation-review", approved_attempt_id: "attempt-1",
    payload_ids: ["payload-manifest", "payload-core"], payload_kinds: {
      "context-core": "payload-core", "context-manifest": "payload-manifest", "review-delta-overlay": "payload-overlay"
    } };
  const packet = { record_kind: "review_replay_packet", record_id: "packet-1", created_at: "2026-01-01T00:00:02.000Z",
    status: "accepted", summary: "packet", payload };
  const view = buildAcceptedContextView(run({ review_routing_records: [packet] }), "packet-1");
  assert.equal(view.context_core_ref, "payload-core");
  assert.equal(view.context_manifest_ref, "payload-manifest");
  assert.throws(() => buildAcceptedContextView(run({ review_routing_records: [packet] }), "wrong"), /CONTEXT_PACKET/);
});

test("Phase 24A implementation review view requires the exact active baseline", () => {
  const binding = { schema_version: 3, approval_id: "approval-1", plan_artifact_hash: "sha256:" + "c".repeat(64),
    planning_review_source_head: "a".repeat(40), owner_authority_diff_hash: "sha256:" + "d".repeat(64),
    implementation_baseline_head: "a".repeat(40), implementation_baseline_tree_hash: "e".repeat(40),
    expected_tree_hash: "e".repeat(40), bound_at: "2026-01-01T00:00:00.000Z", task_artifact_id: "sha256:" + "f".repeat(64),
    run_instance_id: "instance-24a", immutable_base: "0".repeat(40), planning_cohort_id: "sha256:" + "1".repeat(64),
    required_planning_lens_ids: [], planning_lens_artifacts: [] };
  const active = run({ lifecycle_status: "active", implementation_baseline_head: binding.implementation_baseline_head,
    implementation_baseline_binding: binding });
  assert.equal(buildImplementationReviewView(active).authority, "active_run_staging");
  assert.throws(() => buildImplementationReviewView({ ...active, implementation_baseline_head: "9".repeat(40) }),
    /IMPLEMENTATION_BASELINE_REQUIRED/);
});

test("Phase 24A report and packet help are closed deterministic CLI surfaces", () => {
  const report = execFileSync(process.execPath, ["bin/ch", "memory", "report", "--help"], { encoding: "utf8" });
  const packet = execFileSync(process.execPath, ["bin/ch", "memory", "packet", "--help"], { encoding: "utf8" });
  assert.match(report, /--run-instance/);
  assert.match(packet, /implementation-review/);
});
