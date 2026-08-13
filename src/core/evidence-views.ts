import { canonicalJson, sha256Hex } from "./evidence-types";
import type { Run } from "./runtime";

export type ClaimStatus = "evidence" | "inference" | "missing";
export interface EvidenceClaim { claim: string; status: ClaimStatus; evidence_refs: string[]; }

function identity<T extends Record<string, unknown>>(kind: string, body: T): T & { view_id: string } {
  return { ...body, view_id: `sha256:${sha256Hex(canonicalJson({ kind, ...body }))}` };
}

function proofAvailability(run: Run): { status: "recorded" | "not_applicable" | "missing"; refs: string[] } {
  const refs = run.review_routing_records?.filter((entry) => entry.record_kind === "routing_evaluation"
    && String(entry.payload.record_kind ?? "").includes("proof")).map((entry) => entry.record_id) ?? [];
  if (refs.length > 0) return { status: "recorded", refs };
  return { status: run.phase_id === "23.9" && run.run_mode === "normal" ? "missing" : "not_applicable", refs: [] };
}

export function buildHistoricalEvidenceReport(run: Run) {
  if (!run.run_instance_id || run.lifecycle_status !== "harvested") throw new Error("ACCEPTED_RUN_REQUIRED");
  const reviews = [...run.review_results].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const verification = [...run.verification_results].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const delivery = [...run.delivery_facts].sort((a, b) => a.delivery_fact_id.localeCompare(b.delivery_fact_id));
  const claims: EvidenceClaim[] = [
    { claim: "run_identity", status: "evidence", evidence_refs: [`run:${run.run_instance_id}`] },
    { claim: "verification", status: verification.length ? "evidence" : "missing", evidence_refs: verification.map((v) => `verification:${v.verification_result_id}`) },
    { claim: "delivery", status: delivery.length ? "evidence" : "missing", evidence_refs: delivery.map((v) => `delivery:${v.delivery_fact_id}`) }
  ];
  return identity("historical_evidence_report", {
    schema_version: 1, view_kind: "historical_evidence_report", authority: "accepted_project_memory",
    run: { run_instance_id: run.run_instance_id, run_id: run.run_id, phase_id: run.phase_id ?? null,
      task_path: run.active_task_path ?? run.task_path, lifecycle_status: run.lifecycle_status,
      source_head: run.repository.head_sha ?? null, source_snapshot: run.source_snapshot ?? null },
    claims, verification: verification.map((v) => ({ id: v.verification_result_id, status: v.status,
      command_refs: v.command_results.map((c) => c.command_result_id) })),
    reviews: reviews.map((v) => ({ id: v.review_result_id, status: v.status, source: v.source,
      artifact_refs: v.artifact_refs.map((a) => a.artifact_id) })),
    delivery: delivery.map((v) => ({ id: v.delivery_fact_id, kind: v.fact_kind, status: v.status,
      commit_sha: v.commit_sha ?? null, url: v.url ?? null, external_run_id: v.external_run_id ?? null })),
    proof: proofAvailability(run),
    routing_refs: (run.review_routing_records ?? []).map((r) => r.record_id).sort(),
    redaction: { applied_before_serialization: true, raw_payloads_exported: false },
    truncation: { applied: false, omitted_optional_count: 0 }
  });
}

export function buildAcceptedContextView(run: Run, packetRecordId: string) {
  if (!run.run_instance_id || run.lifecycle_status !== "harvested") throw new Error("ACCEPTED_RUN_REQUIRED");
  const packet = run.review_routing_records?.find((entry) => entry.record_kind === "review_replay_packet"
    && entry.record_id === packetRecordId);
  if (!packet) throw new Error("CONTEXT_PACKET_RECORD_NOT_FOUND");
  const payload = packet.payload;
  const kinds = payload.payload_kinds && typeof payload.payload_kinds === "object"
    ? payload.payload_kinds as Record<string, unknown> : {};
  for (const required of ["context-core", "context-manifest"]) {
    if (typeof kinds[required] !== "string") throw new Error(`CONTEXT_MANDATORY_BLOCK_MISSING:${required}`);
  }
  return identity("accepted_context_view", {
    schema_version: 1, view_kind: "accepted_context_view", authority: "accepted_project_memory",
    run_instance_id: run.run_instance_id, packet_record_id: packet.record_id,
    context_core_ref: kinds["context-core"], context_manifest_ref: kinds["context-manifest"],
    review_delta_overlay_ref: kinds["review-delta-overlay"] ?? null,
    ordered_payload_refs: Array.isArray(payload.payload_ids) ? [...payload.payload_ids].filter((v): v is string => typeof v === "string").sort() : [],
    procedure_id: payload.procedure_id ?? null, approved_attempt_id: payload.approved_attempt_id ?? null,
    retrieval: "read_only_reference_only", reuse: payload.context_reuse ?? "unknown",
    claims: [{ claim: "context_parentage", status: "evidence", evidence_refs: [packet.record_id, String(kinds["context-core"]), String(kinds["context-manifest"])] }],
    redaction: { applied_before_serialization: true, raw_payloads_exported: false },
    truncation: { applied: false, omitted_optional_count: 0 }
  });
}

export function buildImplementationReviewView(run: Run) {
  if (!run.run_instance_id || run.lifecycle_status !== "active") throw new Error("ACTIVE_STAGING_RUN_REQUIRED");
  const binding = run.implementation_baseline_binding;
  if (!binding || binding.implementation_baseline_head !== run.implementation_baseline_head) {
    throw new Error("IMPLEMENTATION_BASELINE_REQUIRED");
  }
  return identity("implementation_review_view", {
    schema_version: 1, view_kind: "implementation_review_view", authority: "active_run_staging",
    run: { run_instance_id: run.run_instance_id, run_id: run.run_id, phase_id: run.phase_id ?? null,
      task_path: run.active_task_path ?? run.task_path, branch: run.repository.branch ?? null,
      immutable_base: binding.immutable_base ?? null, baseline_head: binding.implementation_baseline_head,
      candidate_head: run.repository.head_sha ?? null },
    plan: { artifact_id: binding.plan_artifact_hash, approval_id: binding.approval_id,
      planning_cohort_id: binding.planning_cohort_id ?? null },
    procedure: { id: "implementation-review", source_map_ref: "docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md" },
    evidence: { verification_refs: run.verification_results.map((v) => v.verification_result_id).sort(),
      prior_review_refs: run.review_results.map((v) => v.review_result_id).sort(),
      routing_refs: (run.review_routing_records ?? []).map((v) => v.record_id).sort(), proof: proofAvailability(run) },
    independence: { required: true, builder_transcript_authority: false },
    claims: [{ claim: "exact_implementation_baseline", status: "evidence", evidence_refs: [
      `source:${binding.implementation_baseline_head}`, `approval:${binding.approval_id}`, binding.plan_artifact_hash
    ] }],
    redaction: { applied_before_serialization: true, raw_payloads_exported: false },
    truncation: { applied: false, omitted_optional_count: 0 }
  });
}
