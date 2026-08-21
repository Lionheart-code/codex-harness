import { canonicalJson, sha256Hex } from "./evidence-types";
import {
  buildContextCore,
  buildContextManifest,
  buildReviewDeltaOverlay,
  canonicalContextJson,
  type ContextCore,
  type ContextManifest,
  type ReviewDeltaOverlay
} from "./self-hosting-review-context";
import type { ReadOnlyStoredPayload } from "./run-staging-db";
import type { Run, ReviewOperationalRecord } from "./runtime";
import type { HarvestRecord } from "./lifecycle-types";
import type {
  AcceptedDeliveryFactDescriptor,
  AcceptedPayloadDescriptor,
  AcceptedPayloadLinkDescriptor,
  AcceptedProcedureArtifactDescriptor,
  AcceptedRecordDescriptor
} from "./project-memory-db";

export type ClaimStatus = "evidence" | "inference" | "missing" | "not_applicable";
export interface EvidenceClaim { claim: string; status: ClaimStatus; evidence_refs: string[]; }

export interface EvidenceViewInputs {
  proofRecords?: unknown[];
  packetRecordId?: string;
  payloads?: ReadOnlyStoredPayload[];
  harvestRecord?: HarvestRecord;
  acceptedRecordDescriptors?: AcceptedRecordDescriptor[];
  acceptedDeliveryFactDescriptors?: AcceptedDeliveryFactDescriptor[];
  acceptedProcedureArtifactDescriptors?: AcceptedProcedureArtifactDescriptor[];
  acceptedPayloadDescriptors?: AcceptedPayloadDescriptor[];
  acceptedPayloadLinkDescriptors?: AcceptedPayloadLinkDescriptor[];
  outputBudgetBytes?: number;
}

interface ValidatedContext {
  packet: ReviewOperationalRecord;
  invocation: ReviewOperationalRecord;
  core: ContextCore;
  manifest: ContextManifest;
  overlay?: ReviewDeltaOverlay;
  payloadRefs: Array<{
    payload_id: string;
    kind: string;
    content_hash: string;
    raw_size_bytes: number;
    redaction_status: string;
    retention_class: string;
  }>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${label}_INVALID`);
  }
  return value as string[];
}

function identity<T extends Record<string, unknown>>(kind: string, body: T): T & { view_id: string } {
  const view = { ...body, view_id: `sha256:${sha256Hex(canonicalJson({ kind, ...body }))}` };
  validateEvidenceView(view);
  return view;
}

function requireKeys(record: Record<string, unknown>, required: string[], label: string, exact = true): void {
  const missing = required.filter((field) => record[field] === undefined);
  const extra = exact ? Object.keys(record).filter((field) => !required.includes(field)) : [];
  if (missing.length || extra.length) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:${[...missing, ...extra].join(",")}`);
}

function requireString(record: Record<string, unknown>, field: string, label: string, nullable = false): void {
  if ((nullable && record[field] === null) || (typeof record[field] === "string" && Boolean((record[field] as string).trim()))) return;
  throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:${field}`);
}

function requireStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}`);
}

function requireBoolean(record: Record<string, unknown>, field: string, label: string): void {
  if (typeof record[field] !== "boolean") throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:${field}`);
}

function requireInteger(record: Record<string, unknown>, field: string, label: string, minimum = 0): void {
  if (!Number.isInteger(record[field]) || Number(record[field]) < minimum) {
    throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:${field}`);
  }
}

function requireNullableString(record: Record<string, unknown>, field: string, label: string): void {
  requireString(record, field, label, true);
}

function requirePattern(record: Record<string, unknown>, field: string, label: string, pattern: RegExp, nullable = false): void {
  if (nullable && record[field] === null) return;
  if (typeof record[field] !== "string" || !pattern.test(record[field] as string)) {
    throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:${field}`);
  }
}

const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const CONTENT_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const RAW_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CONTEXT_CORE_ID_PATTERN = /^context-core-[a-f0-9]{64}$/u;
const CONTEXT_MANIFEST_ID_PATTERN = /^context-manifest-[a-f0-9]{64}$/u;
const REVIEW_DELTA_ID_PATTERN = /^review-delta-[a-f0-9]{64}$/u;

function validateRedaction(value: unknown, label: string): void {
  const redaction = object(value, label);
  if (redaction.applied_before_serialization !== true || redaction.raw_payloads_exported !== false) {
    throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}`);
  }
}

function validateTruncation(value: unknown, label: string): void {
  const truncation = object(value, label);
  requireBoolean(truncation, "applied", label);
  requireInteger(truncation, "omitted_optional_count", label);
  if (truncation.reasons !== undefined) requireStringArray(truncation.reasons, `${label}:reasons`);
}

function validateProofAvailability(value: unknown, label: string): void {
  const proof = object(value, label);
  requireKeys(proof, ["status", "refs", "acceptance", "gap_refs", "reason"], label);
  if (!["recorded", "not_applicable", "missing"].includes(String(proof.status))
    || !["accepted", "not_applicable", "missing"].includes(String(proof.acceptance))) {
    throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}`);
  }
  requireStringArray(proof.refs, `${label}:refs`);
  requireStringArray(proof.gap_refs, `${label}:gap_refs`);
  requireString(proof, "reason", label);
}

function validateExternalFact(value: unknown, remote: boolean): void {
  const label = remote ? "HISTORICAL_REMOTE_CHECK" : "HISTORICAL_DELIVERY";
  const fact = object(value, label);
  const fields = remote
    ? ["id", "gate_id", "name", "required", "status", "recorded_at", "provider", "url", "url_hash", "external_run_id", "external_run_id_hash",
        "commit_sha", "conclusion", "check_conclusions", "accepted_record_id", "evidence_ref", "failure_excerpt", "failure_excerpt_hash", "redaction_status"]
    : ["id", "kind", "source", "status", "recorded_at", "commit_sha", "url", "url_hash", "external_run_id", "external_run_id_hash",
        "accepted_record_id", "excerpt_payload_ref"];
  requireKeys(fact, fields, label);
  for (const field of remote ? ["id", "gate_id", "name", "status", "recorded_at", "provider"]
    : ["id", "kind", "source", "status", "recorded_at"]) requireString(fact, field, label);
  if (remote) requireBoolean(fact, "required", label);
  requirePattern(fact, "commit_sha", label, COMMIT_PATTERN, true);
  for (const field of ["url", "external_run_id"] as const) requireNullableString(fact, field, label);
  requireString(fact, "accepted_record_id", label);
  for (const field of ["url_hash", "external_run_id_hash"] as const) requirePattern(fact, field, label, CONTENT_ID_PATTERN, true);
  if (!remote) requireNullableString(fact, "excerpt_payload_ref", label);
  if (remote) {
    for (const field of ["conclusion", "failure_excerpt", "redaction_status"]) requireString(fact, field, label);
    requireString(fact, "evidence_ref", label);
    requirePattern(fact, "failure_excerpt_hash", label, CONTENT_ID_PATTERN, true);
    if (!Array.isArray(fact.check_conclusions)) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:check_conclusions`);
    for (const candidate of fact.check_conclusions) {
      const conclusion = object(candidate, `${label}:check_conclusion`);
      requireKeys(conclusion, ["kind", "id", "status"], `${label}:check_conclusion`);
      for (const field of ["kind", "id", "status"]) requireString(conclusion, field, `${label}:check_conclusion`);
    }
  }
}

function validatePayloadRefs(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}`);
  for (const entry of value) {
    const ref = object(entry, label);
    requireKeys(ref, ["payload_id", "kind", "content_hash", "raw_size_bytes", "redaction_status", "retention_class"], label);
    for (const field of ["payload_id", "kind", "redaction_status", "retention_class"]) requireString(ref, field, label);
    requirePattern(ref, "content_hash", label, CONTENT_ID_PATTERN);
    if (!Number.isInteger(ref.raw_size_bytes) || Number(ref.raw_size_bytes) < 0) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}:raw_size_bytes`);
  }
}

export function validateEvidenceView(value: unknown): void {
  const view = object(value, "EVIDENCE_VIEW");
  const kind = String(view.view_kind ?? "");
  if (!["historical_evidence_report", "accepted_context_view", "implementation_review_view"].includes(kind)) {
    throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${kind || "missing_kind"}`);
  }
  const authority = kind === "historical_evidence_report" || kind === "accepted_context_view"
    ? "accepted_project_memory"
    : "active_run_staging";
  const required = kind === "historical_evidence_report"
    ? ["run", "plan", "claims", "verification", "reviews", "delivery", "remote_checks", "proof", "gaps", "inferences", "unknowns", "routing", "provenance", "delivery_relationship", "closeout", "harvest", "budget", "redaction", "truncation"]
    : kind === "accepted_context_view"
      ? ["run_instance_id", "packet_record_id", "acceptance", "context", "ordered_payload_refs", "claims", "transport", "retrieval", "redaction", "truncation"]
      : ["run", "plan", "procedure", "context", "delta", "evidence", "route", "transport", "budget", "independence", "claims", "redaction", "truncation"];
  requireKeys(view, ["schema_version", "view_kind", "authority", ...required, "view_id"], kind);
  if (!required.length || view.schema_version !== 1 || view.authority !== authority
    || typeof view.view_id !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(view.view_id)
    || required.some((field) => view[field] === undefined)) {
    throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${kind}`);
  }
  if (!Array.isArray(view.claims)) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${kind}:claims`);
  for (const candidate of view.claims) {
    const claim = object(candidate, "CLAIM");
    requireKeys(claim, ["claim", "status", "evidence_refs"], "CLAIM");
    requireString(claim, "claim", "CLAIM");
    const statuses = kind === "historical_evidence_report"
      ? ["evidence", "inference", "missing", "not_applicable"]
      : ["evidence", "inference", "missing"];
    if (!statuses.includes(String(claim.status))) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:CLAIM:status");
    requireStringArray(claim.evidence_refs, "CLAIM:evidence_refs");
  }
  if (kind === "historical_evidence_report") {
    const run = object(view.run, "HISTORICAL_RUN");
    requireKeys(run, ["run_instance_id", "run_id", "phase_id", "task_path", "lifecycle_status", "source_head", "source_snapshot",
      "implementation_baseline_head", "final_reviewed_source_head", "delivered_source_head"], "HISTORICAL_RUN");
    for (const field of ["run_instance_id", "run_id", "task_path", "lifecycle_status"]) requireString(run, field, "HISTORICAL_RUN");
    if (run.lifecycle_status !== "harvested") throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_RUN:lifecycle_status");
    requireNullableString(run, "phase_id", "HISTORICAL_RUN");
    for (const field of ["source_head", "source_snapshot", "implementation_baseline_head", "final_reviewed_source_head",
      "delivered_source_head"]) requirePattern(run, field, "HISTORICAL_RUN", COMMIT_PATTERN, true);
    for (const field of ["verification", "reviews", "delivery", "remote_checks", "gaps", "inferences", "unknowns"]) {
      if (!Array.isArray(view[field])) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL:${field}`);
    }
    for (const candidate of view.verification as unknown[]) {
      const verification = object(candidate, "HISTORICAL_VERIFICATION");
      requireKeys(verification, ["id", "status", "source", "created_at", "artifact_refs", "commands"], "HISTORICAL_VERIFICATION");
      for (const field of ["id", "status", "source", "created_at"]) requireString(verification, field, "HISTORICAL_VERIFICATION");
      requireStringArray(verification.artifact_refs, "HISTORICAL_VERIFICATION:artifact_refs");
      if (!Array.isArray(verification.commands)) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_VERIFICATION:commands");
      for (const commandCandidate of verification.commands) {
        const command = object(commandCandidate, "HISTORICAL_COMMAND");
        requireKeys(command, ["id", "command", "status", "exit_code", "artifact_refs"], "HISTORICAL_COMMAND");
        for (const field of ["id", "command", "status"]) requireString(command, field, "HISTORICAL_COMMAND");
        if (command.exit_code !== null && !Number.isInteger(command.exit_code)) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_COMMAND:exit_code");
        requireStringArray(command.artifact_refs, "HISTORICAL_COMMAND:artifact_refs");
      }
    }
    for (const candidate of view.delivery as unknown[]) validateExternalFact(candidate, false);
    for (const candidate of view.remote_checks as unknown[]) validateExternalFact(candidate, true);
    for (const candidate of view.reviews as unknown[]) {
      const review = object(candidate, "HISTORICAL_REVIEW");
      requireKeys(review, ["id", "status", "source", "created_at", "disposition", "blockers", "artifact_refs", "procedure_artifact_refs"], "HISTORICAL_REVIEW");
      for (const field of ["id", "status", "source", "created_at", "disposition"]) requireString(review, field, "HISTORICAL_REVIEW");
      if (!["current", "superseded"].includes(String(review.disposition))) {
        throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_REVIEW:disposition");
      }
      requireStringArray(review.blockers, "HISTORICAL_REVIEW:blockers");
      requireStringArray(review.artifact_refs, "HISTORICAL_REVIEW:artifact_refs");
      requireStringArray(review.procedure_artifact_refs, "HISTORICAL_REVIEW:procedure_artifact_refs");
    }
    const plan = object(view.plan, "HISTORICAL_PLAN");
    requireKeys(plan, ["approval_id", "reviewed_plan_artifact_id", "reviewed_plan_content_hash", "reviewed_evidence_artifact_id"], "HISTORICAL_PLAN");
    requireNullableString(plan, "approval_id", "HISTORICAL_PLAN");
    requirePattern(plan, "reviewed_plan_artifact_id", "HISTORICAL_PLAN", CONTENT_ID_PATTERN, true);
    requirePattern(plan, "reviewed_plan_content_hash", "HISTORICAL_PLAN", RAW_HASH_PATTERN, true);
    requirePattern(plan, "reviewed_evidence_artifact_id", "HISTORICAL_PLAN", CONTENT_ID_PATTERN, true);
    if (view.closeout !== null) {
      const closeout = object(view.closeout, "HISTORICAL_CLOSEOUT");
      requireKeys(closeout, ["receipt_id", "status", "created_at", "blocker_count"], "HISTORICAL_CLOSEOUT");
      for (const field of ["receipt_id", "status", "created_at"]) requireString(closeout, field, "HISTORICAL_CLOSEOUT");
      requireInteger(closeout, "blocker_count", "HISTORICAL_CLOSEOUT");
    }
    if (view.delivery_relationship !== null) {
      const relationship = object(view.delivery_relationship, "HISTORICAL_DELIVERY_RELATIONSHIP");
      requireKeys(relationship, ["schema_version", "relationship", "delivered_source_head", "final_reviewed_source_head",
        "delivered_tree_hash", "final_reviewed_tree_hash", "ancestry", "delivery_fact_id"], "HISTORICAL_DELIVERY_RELATIONSHIP");
      if (relationship.schema_version !== 1) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_DELIVERY_RELATIONSHIP:schema_version");
      for (const field of ["relationship", "delivered_source_head", "final_reviewed_source_head", "delivered_tree_hash",
        "final_reviewed_tree_hash", "ancestry", "delivery_fact_id"]) requireString(relationship, field, "HISTORICAL_DELIVERY_RELATIONSHIP");
      if (!["identity", "merge_contains_exact_tree"].includes(String(relationship.relationship))
        || !["same_commit", "ancestor"].includes(String(relationship.ancestry))) {
        throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_DELIVERY_RELATIONSHIP:semantics");
      }
      for (const field of ["delivered_source_head", "final_reviewed_source_head", "delivered_tree_hash", "final_reviewed_tree_hash"]) {
        requirePattern(relationship, field, "HISTORICAL_DELIVERY_RELATIONSHIP", COMMIT_PATTERN);
      }
    }
    const harvest = object(view.harvest, "HISTORICAL_HARVEST");
    requireKeys(harvest, ["harvest_id", "status", "promoted_at", "accepted_count", "discarded_count", "quarantined_count",
      "redacted_count", "unresolved_count", "project_run_id"], "HISTORICAL_HARVEST");
    for (const field of ["harvest_id", "status", "promoted_at", "project_run_id"]) requireString(harvest, field, "HISTORICAL_HARVEST");
    if (harvest.status !== "promoted") throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_HARVEST:status");
    for (const field of ["accepted_count", "discarded_count", "quarantined_count", "redacted_count", "unresolved_count"]) {
      requireInteger(harvest, field, "HISTORICAL_HARVEST");
    }
    validateProofAvailability(view.proof, "PROOF_AVAILABILITY");
    const routing = object(view.routing, "HISTORICAL_ROUTING");
    requireKeys(routing, ["refs", "records", "usage_refs"], "HISTORICAL_ROUTING");
    requireStringArray(routing.refs, "HISTORICAL_ROUTING:refs");
    requireStringArray(routing.usage_refs, "HISTORICAL_ROUTING:usage_refs");
    if (!Array.isArray(routing.records)) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_ROUTING:records");
    for (const candidate of routing.records) {
      const record = object(candidate, "HISTORICAL_ROUTING_RECORD");
      requireKeys(record, ["record_id", "record_kind", "status", "created_at", "procedure_id", "route_decision_id", "route_class",
        "policy_version", "binding_version", "binding_profile_id", "context_core_id", "context_manifest_id", "delta_overlay_id", "usage_ref",
        "changed_surface_classes", "risk_classes", "deterministic_evidence_state", "required_semantic_reviews", "independence_mode",
        "context_mode", "context_reuse", "request_bytes", "core_bytes", "delta_bytes", "input_tokens", "cached_input_tokens",
        "output_tokens", "latency_ms", "observed_provider", "observed_model", "observed_reasoning_effort"],
      "HISTORICAL_ROUTING_RECORD");
      for (const field of ["record_id", "record_kind", "status", "created_at"]) requireString(record, field, "HISTORICAL_ROUTING_RECORD");
      for (const field of ["procedure_id", "route_decision_id", "route_class", "policy_version", "binding_version", "binding_profile_id",
        "context_core_id", "context_manifest_id", "delta_overlay_id", "usage_ref", "deterministic_evidence_state", "independence_mode",
        "context_mode", "context_reuse", "observed_provider", "observed_model", "observed_reasoning_effort"]) {
        requireNullableString(record, field, "HISTORICAL_ROUTING_RECORD");
      }
      for (const field of ["request_bytes", "core_bytes", "delta_bytes", "input_tokens", "cached_input_tokens", "output_tokens", "latency_ms"]) {
        if (record[field] !== null) requireInteger(record, field, "HISTORICAL_ROUTING_RECORD");
      }
      for (const field of ["changed_surface_classes", "risk_classes", "required_semantic_reviews"]) {
        requireStringArray(record[field], `HISTORICAL_ROUTING_RECORD:${field}`);
      }
    }
    const provenance = object(view.provenance, "HISTORICAL_PROVENANCE");
    requireKeys(provenance, ["accepted_record_refs", "delivery_fact_refs", "procedure_artifacts", "payloads", "procedure_contract_refs"], "HISTORICAL_PROVENANCE");
    requireStringArray(provenance.accepted_record_refs, "HISTORICAL_PROVENANCE:accepted_record_refs");
    requireStringArray(provenance.delivery_fact_refs, "HISTORICAL_PROVENANCE:delivery_fact_refs");
    requireStringArray(provenance.procedure_contract_refs, "HISTORICAL_PROVENANCE:procedure_contract_refs");
    if (!Array.isArray(provenance.procedure_artifacts) || !Array.isArray(provenance.payloads)) {
      throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_PROVENANCE:descriptors");
    }
    for (const candidate of provenance.procedure_artifacts) {
      const descriptor = object(candidate, "HISTORICAL_PROCEDURE_ARTIFACT");
      requireKeys(descriptor, ["procedure_id", "artifact_id", "payload_ref", "content_hash", "recorded_at",
        "reviewed_plan_artifact_id", "reviewed_plan_content_hash", "reviewed_evidence_artifact_id"], "HISTORICAL_PROCEDURE_ARTIFACT");
      for (const field of ["procedure_id", "artifact_id", "payload_ref", "content_hash", "recorded_at"]) {
        requireString(descriptor, field, "HISTORICAL_PROCEDURE_ARTIFACT");
      }
      requirePattern(descriptor, "artifact_id", "HISTORICAL_PROCEDURE_ARTIFACT", CONTENT_ID_PATTERN);
      requirePattern(descriptor, "content_hash", "HISTORICAL_PROCEDURE_ARTIFACT", CONTENT_ID_PATTERN);
      requirePattern(descriptor, "reviewed_plan_artifact_id", "HISTORICAL_PROCEDURE_ARTIFACT", CONTENT_ID_PATTERN, true);
      requirePattern(descriptor, "reviewed_plan_content_hash", "HISTORICAL_PROCEDURE_ARTIFACT", RAW_HASH_PATTERN, true);
      requirePattern(descriptor, "reviewed_evidence_artifact_id", "HISTORICAL_PROCEDURE_ARTIFACT", CONTENT_ID_PATTERN, true);
    }
    for (const candidate of provenance.payloads) {
      const descriptor = object(candidate, "HISTORICAL_PAYLOAD");
      requireKeys(descriptor, ["payload_id", "parent_record_id", "kind", "content_hash", "raw_size_bytes",
        "redaction_status", "retention_class"], "HISTORICAL_PAYLOAD");
      for (const field of ["payload_id", "parent_record_id", "kind", "content_hash", "redaction_status", "retention_class"]) {
        requireString(descriptor, field, "HISTORICAL_PAYLOAD");
      }
      requireInteger(descriptor, "raw_size_bytes", "HISTORICAL_PAYLOAD");
      requirePattern(descriptor, "content_hash", "HISTORICAL_PAYLOAD", CONTENT_ID_PATTERN);
    }
  } else if (kind === "accepted_context_view") {
    requireString(view, "run_instance_id", kind);
    requireString(view, "packet_record_id", kind);
    const acceptance = object(view.acceptance, "ACCEPTED_CONTEXT_ACCEPTANCE");
    requireKeys(acceptance, ["harvest_id", "status", "project_run_id"], "ACCEPTED_CONTEXT_ACCEPTANCE");
    for (const field of ["harvest_id", "status", "project_run_id"]) requireString(acceptance, field, "ACCEPTED_CONTEXT_ACCEPTANCE");
    if (acceptance.status !== "promoted" || acceptance.project_run_id !== view.run_instance_id) {
      throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:ACCEPTED_CONTEXT_ACCEPTANCE:binding");
    }
    const context = object(view.context, "ACCEPTED_CONTEXT");
    requireKeys(context, ["core_id", "core_hash", "manifest_id", "manifest_hash", "overlay_id", "core", "manifest"], "ACCEPTED_CONTEXT");
    const core = rebuildCore(context.core);
    const manifest = rebuildManifest(context.manifest, core);
    if (context.core_id !== core.context_core_id || context.core_hash !== core.content_hash
      || context.manifest_id !== manifest.context_manifest_id || context.manifest_hash !== manifest.content_hash) {
      throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:ACCEPTED_CONTEXT:identity");
    }
    requirePattern(context, "core_hash", "ACCEPTED_CONTEXT", CONTENT_ID_PATTERN);
    requirePattern(context, "manifest_hash", "ACCEPTED_CONTEXT", CONTENT_ID_PATTERN);
    requirePattern(context, "core_id", "ACCEPTED_CONTEXT", CONTEXT_CORE_ID_PATTERN);
    requirePattern(context, "manifest_id", "ACCEPTED_CONTEXT", CONTEXT_MANIFEST_ID_PATTERN);
    requirePattern(context, "overlay_id", "ACCEPTED_CONTEXT", REVIEW_DELTA_ID_PATTERN, true);
    validatePayloadRefs(view.ordered_payload_refs, "ACCEPTED_CONTEXT_PAYLOAD_REF");
    const retrieval = object(view.retrieval, "ACCEPTED_CONTEXT_RETRIEVAL");
    requireKeys(retrieval, ["mode", "capabilities", "canonical_bytes", "mandatory_blocks_present", "source_manifest_omissions"], "ACCEPTED_CONTEXT_RETRIEVAL");
    if (retrieval.mode !== "read_only_exact_payload_reconstruction") {
      throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:ACCEPTED_CONTEXT_RETRIEVAL:mode");
    }
    requireStringArray(retrieval.capabilities, "ACCEPTED_CONTEXT_RETRIEVAL:capabilities");
    requireStringArray(retrieval.mandatory_blocks_present, "ACCEPTED_CONTEXT_RETRIEVAL:mandatory_blocks_present");
    requireStringArray(retrieval.source_manifest_omissions, "ACCEPTED_CONTEXT_RETRIEVAL:source_manifest_omissions");
    const canonicalBytes = object(retrieval.canonical_bytes, "ACCEPTED_CONTEXT_BYTES");
    requireKeys(canonicalBytes, ["core", "manifest"], "ACCEPTED_CONTEXT_BYTES");
    requireInteger(canonicalBytes, "core", "ACCEPTED_CONTEXT_BYTES");
    requireInteger(canonicalBytes, "manifest", "ACCEPTED_CONTEXT_BYTES");
    const transport = object(view.transport, "ACCEPTED_CONTEXT_TRANSPORT");
    requireKeys(transport, ["mode", "reuse", "procedure_id"], "ACCEPTED_CONTEXT_TRANSPORT");
    for (const field of ["mode", "reuse"]) requireString(transport, field, "ACCEPTED_CONTEXT_TRANSPORT");
    requireNullableString(transport, "procedure_id", "ACCEPTED_CONTEXT_TRANSPORT");
  } else if (kind === "implementation_review_view") {
    const run = object(view.run, "IMPLEMENTATION_RUN");
    requireKeys(run, ["run_instance_id", "run_id", "phase_id", "task_path", "branch", "immutable_base", "baseline_head",
      "baseline_tree_hash", "candidate_head", "reviewed_candidate_id", "source_snapshot"], "IMPLEMENTATION_RUN");
    for (const field of ["run_instance_id", "run_id", "task_path", "baseline_head", "baseline_tree_hash", "candidate_head", "reviewed_candidate_id"]) {
      requireString(run, field, "IMPLEMENTATION_RUN");
    }
    for (const field of ["phase_id", "branch"]) requireNullableString(run, field, "IMPLEMENTATION_RUN");
    for (const field of ["immutable_base", "source_snapshot"]) requirePattern(run, field, "IMPLEMENTATION_RUN", COMMIT_PATTERN, true);
    for (const field of ["baseline_head", "baseline_tree_hash", "candidate_head"]) requirePattern(run, field, "IMPLEMENTATION_RUN", COMMIT_PATTERN);
    requirePattern(run, "reviewed_candidate_id", "IMPLEMENTATION_RUN", CONTENT_ID_PATTERN);
    const context = object(view.context, "IMPLEMENTATION_CONTEXT");
    requireKeys(context, ["packet_record_id", "core_id", "core_hash", "manifest_id", "manifest_hash", "core", "manifest", "payload_refs"], "IMPLEMENTATION_CONTEXT");
    const core = rebuildCore(context.core);
    const manifest = rebuildManifest(context.manifest, core);
    if (context.core_id !== core.context_core_id || context.core_hash !== core.content_hash
      || context.manifest_id !== manifest.context_manifest_id || context.manifest_hash !== manifest.content_hash) {
      throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:IMPLEMENTATION_CONTEXT:identity");
    }
    requirePattern(context, "core_id", "IMPLEMENTATION_CONTEXT", CONTEXT_CORE_ID_PATTERN);
    requirePattern(context, "core_hash", "IMPLEMENTATION_CONTEXT", CONTENT_ID_PATTERN);
    requirePattern(context, "manifest_id", "IMPLEMENTATION_CONTEXT", CONTEXT_MANIFEST_ID_PATTERN);
    requirePattern(context, "manifest_hash", "IMPLEMENTATION_CONTEXT", CONTENT_ID_PATTERN);
    validatePayloadRefs(context.payload_refs, "IMPLEMENTATION_CONTEXT_PAYLOAD_REF");
    const delta = object(view.delta, "IMPLEMENTATION_DELTA");
    requireKeys(delta, ["overlay_id", "overlay_hash", "changed_files", "diff_refs", "payload_refs", "changed_authority_surfaces",
      "changed_architecture_surfaces", "risks", "findings", "verification_refs", "missing_evidence", "escalation_reasons",
      "canonical_byte_count", "size_budget_bytes"], "IMPLEMENTATION_DELTA");
    for (const field of ["changed_files", "diff_refs", "payload_refs", "changed_authority_surfaces", "changed_architecture_surfaces",
      "risks", "verification_refs", "missing_evidence", "escalation_reasons"]) requireStringArray(delta[field], `IMPLEMENTATION_DELTA:${field}`);
    requirePattern(delta, "overlay_id", "IMPLEMENTATION_DELTA", REVIEW_DELTA_ID_PATTERN);
    requirePattern(delta, "overlay_hash", "IMPLEMENTATION_DELTA", CONTENT_ID_PATTERN);
    requireInteger(delta, "canonical_byte_count", "IMPLEMENTATION_DELTA");
    requireInteger(delta, "size_budget_bytes", "IMPLEMENTATION_DELTA", 1);
    if (!Array.isArray(delta.findings)) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:IMPLEMENTATION_DELTA:findings");
    for (const candidate of delta.findings) {
      const finding = object(candidate, "IMPLEMENTATION_FINDING");
      requireKeys(finding, ["finding_id", "disposition"], "IMPLEMENTATION_FINDING");
      requireString(finding, "finding_id", "IMPLEMENTATION_FINDING");
      if (!["open", "claimed_fixed", "closed", "superseded"].includes(String(finding.disposition))) {
        throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:IMPLEMENTATION_FINDING:disposition");
      }
    }
    const route = object(view.route, "IMPLEMENTATION_ROUTE");
    requireKeys(route, ["decision_id", "route_class", "policy_version", "binding_version", "binding_profile_id", "review_tier",
      "risk_classes", "required_semantic_reviews"], "IMPLEMENTATION_ROUTE");
    for (const field of ["decision_id", "route_class", "policy_version", "binding_version", "binding_profile_id", "review_tier"]) requireString(route, field, "IMPLEMENTATION_ROUTE");
    requireStringArray(route.risk_classes, "IMPLEMENTATION_ROUTE:risk_classes");
    requireStringArray(route.required_semantic_reviews, "IMPLEMENTATION_ROUTE:required_semantic_reviews");
    const plan = object(view.plan, "IMPLEMENTATION_PLAN");
    requireKeys(plan, ["artifact_id", "approval_id", "task_artifact_id", "planning_cohort_id", "required_lens_ids", "lens_artifacts"], "IMPLEMENTATION_PLAN");
    requireString(plan, "artifact_id", "IMPLEMENTATION_PLAN");
    requireString(plan, "approval_id", "IMPLEMENTATION_PLAN");
    requirePattern(plan, "artifact_id", "IMPLEMENTATION_PLAN", CONTENT_ID_PATTERN);
    requirePattern(plan, "task_artifact_id", "IMPLEMENTATION_PLAN", CONTENT_ID_PATTERN, true);
    requirePattern(plan, "planning_cohort_id", "IMPLEMENTATION_PLAN", CONTENT_ID_PATTERN, true);
    requireStringArray(plan.required_lens_ids, "IMPLEMENTATION_PLAN:required_lens_ids");
    if (!Array.isArray(plan.lens_artifacts)) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:IMPLEMENTATION_PLAN:lens_artifacts");
    for (const candidate of plan.lens_artifacts) {
      const artifact = object(candidate, "IMPLEMENTATION_LENS_ARTIFACT");
      requireKeys(artifact, ["procedure_id", "artifact_id", "artifact_content_hash"], "IMPLEMENTATION_LENS_ARTIFACT");
      for (const field of ["procedure_id", "artifact_id", "artifact_content_hash"]) requireString(artifact, field, "IMPLEMENTATION_LENS_ARTIFACT");
      requirePattern(artifact, "artifact_id", "IMPLEMENTATION_LENS_ARTIFACT", CONTENT_ID_PATTERN);
      requirePattern(artifact, "artifact_content_hash", "IMPLEMENTATION_LENS_ARTIFACT", CONTENT_ID_PATTERN);
    }
    const procedure = object(view.procedure, "IMPLEMENTATION_PROCEDURE");
    requireKeys(procedure, ["id", "source_map_ref", "execution_policy_ref", "route_policy_ref", "binding_ref"], "IMPLEMENTATION_PROCEDURE");
    for (const field of ["id", "source_map_ref", "execution_policy_ref", "route_policy_ref", "binding_ref"]) requireString(procedure, field, "IMPLEMENTATION_PROCEDURE");
    const evidence = object(view.evidence, "IMPLEMENTATION_EVIDENCE");
    requireKeys(evidence, ["verification_refs", "prior_review_refs", "routing_refs", "proof"], "IMPLEMENTATION_EVIDENCE");
    for (const field of ["verification_refs", "prior_review_refs", "routing_refs"]) requireStringArray(evidence[field], `IMPLEMENTATION_EVIDENCE:${field}`);
    validateProofAvailability(evidence.proof, "IMPLEMENTATION_EVIDENCE_PROOF");
    const transport = object(view.transport, "IMPLEMENTATION_TRANSPORT");
    requireKeys(transport, ["context_mode", "context_reuse", "retention_class", "redaction_status", "retrieval", "usage_ref"], "IMPLEMENTATION_TRANSPORT");
    for (const field of ["context_mode", "context_reuse", "retention_class", "redaction_status", "retrieval"]) requireString(transport, field, "IMPLEMENTATION_TRANSPORT");
    if (transport.retrieval !== "read_only_exact_payload_reconstruction") {
      throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:IMPLEMENTATION_TRANSPORT:retrieval");
    }
    requireNullableString(transport, "usage_ref", "IMPLEMENTATION_TRANSPORT");
    const budget = object(view.budget, "IMPLEMENTATION_BUDGET");
    requireKeys(budget, ["class", "core_bytes", "core_limit_bytes", "delta_bytes", "delta_limit_bytes"], "IMPLEMENTATION_BUDGET");
    requireString(budget, "class", "IMPLEMENTATION_BUDGET");
    for (const field of ["core_bytes", "delta_bytes"]) requireInteger(budget, field, "IMPLEMENTATION_BUDGET");
    for (const field of ["core_limit_bytes", "delta_limit_bytes"]) requireInteger(budget, field, "IMPLEMENTATION_BUDGET", 1);
    const independence = object(view.independence, "IMPLEMENTATION_INDEPENDENCE");
    requireKeys(independence, ["required", "mode", "approved_attempt_id", "builder_transcript_authority"], "IMPLEMENTATION_INDEPENDENCE");
    if (independence.required !== true || independence.builder_transcript_authority !== false) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:IMPLEMENTATION_INDEPENDENCE");
    requireString(independence, "mode", "IMPLEMENTATION_INDEPENDENCE");
    requireString(independence, "approved_attempt_id", "IMPLEMENTATION_INDEPENDENCE");
  }
  validateRedaction(view.redaction, `${kind}:redaction`);
  validateTruncation(view.truncation, `${kind}:truncation`);
  const redaction = object(view.redaction, `${kind}:redaction`);
  requireKeys(redaction, kind === "historical_evidence_report"
    ? ["applied_before_serialization", "raw_payloads_exported", "redacted_field_count", "strategy"]
    : ["applied_before_serialization", "raw_payloads_exported", "source_redactions"], `${kind}:redaction`);
  if (kind === "historical_evidence_report") {
    requireInteger(redaction, "redacted_field_count", `${kind}:redaction`);
    requireString(redaction, "strategy", `${kind}:redaction`);
    const budget = object(view.budget, "HISTORICAL_BUDGET");
    requireKeys(budget, ["output_bytes", "limit_bytes"], "HISTORICAL_BUDGET");
    requireInteger(budget, "output_bytes", "HISTORICAL_BUDGET");
    requireInteger(budget, "limit_bytes", "HISTORICAL_BUDGET", 1);
  } else {
    requireStringArray(redaction.source_redactions, `${kind}:redaction:source_redactions`);
  }
  requireKeys(object(view.truncation, `${kind}:truncation`), ["applied", "omitted_optional_count", "reasons"], `${kind}:truncation`);
  const { view_id: storedViewId, ...body } = view;
  const expectedViewId = `sha256:${sha256Hex(canonicalJson({ kind, ...body }))}`;
  if (storedViewId !== expectedViewId) throw new Error(`EVIDENCE_VIEW_ID_MISMATCH:${kind}`);
}

function proofAvailability(run: Run, candidates: unknown[] = []): {
  status: "recorded" | "not_applicable" | "missing";
  refs: string[];
  acceptance: "accepted" | "not_applicable" | "missing";
  gap_refs: string[];
  reason: string;
} {
  const exact = candidates.flatMap((candidate) => {
    const record = object(candidate, "PROOF_RECORD");
    const acceptance = object(record.acceptance, "PROOF_ACCEPTANCE");
    if (record.record_kind !== "proof_record") return [];
    const withoutIdentity = Object.fromEntries(Object.entries(record)
      .filter(([key]) => !["record_id", "content_hash"].includes(key)));
    const identityBody = {
      schema_version: record.schema_version, record_kind: record.record_kind,
      run_instance_id: record.run_instance_id, task_artifact_id: record.task_artifact_id,
      immutable_base: record.immutable_base, activation_hash: record.activation_hash,
      activation_source_head: record.activation_source_head,
      implementation_baseline_head: record.implementation_baseline_head,
      final_reviewed_source_head: record.final_reviewed_source_head,
      delivered_source_head: record.delivered_source_head,
      eligibility_snapshot_id: record.eligibility_snapshot_id, proof_input_hash: record.proof_input_hash
    };
    if (record.schema_version !== "phase-23.9.proof-record.v1"
      || record.record_id !== `sha256:${sha256Hex(canonicalJson(identityBody))}`
      || record.content_hash !== `sha256:${sha256Hex(canonicalJson(withoutIdentity))}`) {
      throw new Error("PROOF_RECORD_IDENTITY_MISMATCH");
    }
    return record.run_instance_id === run.run_instance_id
      && record.run_id === run.run_id
      && acceptance.status === "accepted"
      && typeof record.record_id === "string"
      ? [{ ref: String(record.record_id), gapRefs: Array.isArray(record.evidence_gaps)
        ? record.evidence_gaps.flatMap((gap) => {
          const value = object(gap, "PROOF_GAP");
          return typeof value.gap_id === "string" ? [value.gap_id] : [];
        }) : [] }] : [];
  });
  if (exact.length > 1) throw new Error("PROOF_RECORD_AMBIGUOUS");
  if (exact.length === 1) return { status: "recorded", refs: [exact[0].ref], acceptance: "accepted",
    gap_refs: exact[0].gapRefs, reason: "accepted_exact_proof_record" };
  if (run.run_mode === "bootstrap") return { status: "not_applicable", refs: [], acceptance: "not_applicable",
    gap_refs: [], reason: "bootstrap_run_outside_phase_23_9_normal_proof_producer" };
  return { status: "missing", refs: [], acceptance: "missing", gap_refs: [], reason: "accepted_exact_proof_record_unavailable" };
}

function withOutputBudget<T extends Record<string, unknown>>(body: T, limitBytes: number): T & { budget: { output_bytes: number; limit_bytes: number } } {
  const mutable = structuredClone(body) as T & {
    routing?: { records?: unknown[]; refs?: string[]; usage_refs?: string[] };
    truncation?: { applied: boolean; omitted_optional_count: number; reasons?: string[] };
  };
  const measure = () => {
    let result = { ...mutable, budget: { output_bytes: 0, limit_bytes: limitBytes } };
    for (let index = 0; index < 4; index += 1) {
      const outputBytes = Buffer.byteLength(canonicalJson({ ...result, view_id: `sha256:${"0".repeat(64)}` }), "utf8");
      result = { ...mutable, budget: { output_bytes: outputBytes, limit_bytes: limitBytes } };
    }
    return result;
  };
  let result = measure();
  while (result.budget.output_bytes > limitBytes && (mutable.routing?.records?.length ?? 0) > 0) {
    const removed = mutable.routing!.records!.shift() as { record_id?: unknown; usage_ref?: unknown } | undefined;
    if (typeof removed?.record_id === "string" && mutable.routing?.refs) {
      mutable.routing.refs = mutable.routing.refs.filter((ref) => ref !== removed.record_id);
    }
    if (typeof removed?.usage_ref === "string" && mutable.routing?.usage_refs
      && !mutable.routing.records!.some((candidate) =>
        object(candidate, "ROUTING_TRUNCATION_RECORD").usage_ref === removed.usage_ref)) {
      mutable.routing.usage_refs = mutable.routing.usage_refs.filter((ref) => ref !== removed.usage_ref);
    }
    if (mutable.truncation) {
      mutable.truncation.applied = true;
      mutable.truncation.omitted_optional_count += 1;
      mutable.truncation.reasons = [...new Set([...(mutable.truncation.reasons ?? []), "optional_routing_history_output_budget"])]
        .sort();
    }
    result = measure();
  }
  while (result.budget.output_bytes > limitBytes && (mutable.routing?.usage_refs?.length ?? 0) > 0) {
    mutable.routing!.usage_refs!.pop();
    if (mutable.truncation) {
      mutable.truncation.applied = true;
      mutable.truncation.omitted_optional_count += 1;
      mutable.truncation.reasons = [...new Set([...(mutable.truncation.reasons ?? []), "optional_usage_refs_output_budget"])]
        .sort();
    }
    result = measure();
  }
  if (result.budget.output_bytes > limitBytes) {
    throw new Error(`EVIDENCE_VIEW_MANDATORY_BUDGET_EXCEEDED:${limitBytes}`);
  }
  return result;
}

function redactExternal(value: string | undefined): { value: string | null; hash: string | null; redacted: boolean } {
  return value
    ? { value: "[REDACTED_EXTERNAL_VALUE]", hash: `sha256:${sha256Hex(value)}`, redacted: true }
    : { value: null, hash: null, redacted: false };
}

function redactFreeText(value: string | undefined): { value: string; hash: string | null; redacted: boolean } {
  return value?.length
    ? { value: "[REDACTED_FREE_TEXT]", hash: `sha256:${sha256Hex(value)}`, redacted: true }
    : { value: "[NO_TEXT]", hash: null, redacted: false };
}

function safeIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:/-]{0,127}$/u.test(value) ? value : null;
}

function projectSafeIdentifier(value: unknown, fallback: string | null = null): { value: string | null; redacted: boolean } {
  const safe = safeIdentifier(value);
  if (safe) return { value: safe, redacted: false };
  const material = value !== undefined && value !== null && (typeof value !== "string" || value.length > 0);
  return { value: fallback, redacted: material };
}

function requirePromotedHarvest(run: Run, record: HarvestRecord | undefined): HarvestRecord {
  if (!run.run_instance_id || run.lifecycle_status !== "harvested" || !record || record.status !== "promoted"
    || record.project_run_id !== run.run_instance_id || record.run_id !== run.run_id
    || record.source_snapshot !== run.source_snapshot
    || record.source_task_path !== (run.active_task_path ?? run.task_path)
    || !record.harvest_id || !record.promoted_at || !record.details || typeof record.details !== "object"
    || [record.accepted_count, record.discarded_count, record.quarantined_count, record.redacted_count, record.unresolved_count]
      .some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("ACCEPTED_PROJECT_MEMORY_REQUIRED");
  }
  return record;
}

function rebuildCore(value: unknown): ContextCore {
  const raw = object(value, "CONTEXT_CORE");
  const { context_core_id, content_hash, canonical_byte_count, ...input } = raw;
  const rebuilt = buildContextCore(input as unknown as Parameters<typeof buildContextCore>[0]);
  if (context_core_id !== rebuilt.context_core_id || content_hash !== rebuilt.content_hash
    || canonical_byte_count !== rebuilt.canonical_byte_count || canonicalContextJson(raw) !== canonicalContextJson(rebuilt)) {
    throw new Error("CONTEXT_CORE_IDENTITY_MISMATCH");
  }
  return rebuilt;
}

function rebuildManifest(value: unknown, core: ContextCore): ContextManifest {
  const raw = object(value, "CONTEXT_MANIFEST");
  const rebuilt = buildContextManifest(core, {
    omissions: strings(raw.omissions, "CONTEXT_MANIFEST_OMISSIONS"),
    retrieval_capabilities: strings(raw.retrieval_capabilities, "CONTEXT_MANIFEST_RETRIEVAL")
  });
  if (raw.context_core_id !== core.context_core_id || raw.context_manifest_id !== rebuilt.context_manifest_id
    || raw.content_hash !== rebuilt.content_hash || raw.canonical_byte_count !== rebuilt.canonical_byte_count
    || canonicalContextJson(raw) !== canonicalContextJson(rebuilt)) {
    throw new Error("CONTEXT_MANIFEST_IDENTITY_MISMATCH");
  }
  const mandatory = strings(raw.mandatory_blocks_present, "CONTEXT_MANDATORY_BLOCKS");
  for (const block of ["task_pointer", "task_contract", "approved_plan", "run_identity", "review_contract", "acceptance"]) {
    if (!mandatory.includes(block)) throw new Error(`CONTEXT_MANDATORY_BLOCK_MISSING:${block}`);
  }
  return rebuilt;
}

function rebuildOverlay(value: unknown, core: ContextCore): ReviewDeltaOverlay {
  const raw = object(value, "REVIEW_DELTA_OVERLAY");
  const { delta_overlay_id, content_hash, canonical_byte_count, ...input } = raw;
  const rebuilt = buildReviewDeltaOverlay(input as unknown as Parameters<typeof buildReviewDeltaOverlay>[0]);
  if (rebuilt.context_core_id !== core.context_core_id || delta_overlay_id !== rebuilt.delta_overlay_id
    || content_hash !== rebuilt.content_hash || canonical_byte_count !== rebuilt.canonical_byte_count
    || canonicalContextJson(raw) !== canonicalContextJson(rebuilt)) {
    throw new Error("REVIEW_DELTA_IDENTITY_MISMATCH");
  }
  return rebuilt;
}

function validateContext(run: Run, packetRecordId: string, payloads: ReadOnlyStoredPayload[], requireOverlay: boolean): ValidatedContext {
  const packet = run.review_routing_records?.find((entry) => entry.record_kind === "review_replay_packet"
    && entry.record_id === packetRecordId);
  if (!packet) throw new Error("CONTEXT_PACKET_RECORD_NOT_FOUND");
  if (packet.record_id !== `sha256:${sha256Hex(canonicalJson(packet.payload))}`) {
    throw new Error("CONTEXT_PACKET_IDENTITY_MISMATCH");
  }
  if (packet.payload.run_instance_id !== run.run_instance_id || packet.payload.source_run_id !== run.run_id) {
    throw new Error("CONTEXT_PACKET_RUN_IDENTITY_MISMATCH");
  }
  const attemptId = packet.payload.approved_attempt_id;
  const invocations = run.review_routing_records?.filter((entry) => entry.record_kind === "review_invocation"
    && entry.status === "success" && entry.payload.attempt_id === attemptId) ?? [];
  if (typeof attemptId !== "string" || invocations.length !== 1) throw new Error("CONTEXT_APPROVED_ATTEMPT_JOIN_MISSING");
  const invocation = invocations[0];
  for (const field of ["procedure_id", "context_core_id", "context_manifest_id", "delta_overlay_id", "route_decision_id"] as const) {
    if (packet.payload[field] !== invocation.payload[field]) throw new Error(`CONTEXT_APPROVED_ATTEMPT_JOIN_MISMATCH:${field}`);
  }
  const payloadIds = strings(packet.payload.payload_ids, "CONTEXT_PACKET_PAYLOAD_IDS");
  if (new Set(payloadIds).size !== payloadIds.length) throw new Error("CONTEXT_PACKET_PAYLOAD_IDS_AMBIGUOUS");
  const kinds = object(packet.payload.payload_kinds, "CONTEXT_PACKET_PAYLOAD_KINDS");
  const payloadById = new Map<string, ReadOnlyStoredPayload>();
  for (const payload of payloads) {
    if (payloadById.has(payload.payload_id)) throw new Error(`CONTEXT_PAYLOAD_AMBIGUOUS:${payload.payload_id}`);
    payloadById.set(payload.payload_id, payload);
  }
  const expectedParent = `review-launch-attempt:${attemptId}`;
  for (const payloadId of payloadIds) {
    const payload = payloadById.get(payloadId);
    const kind = Object.entries(kinds).find(([, id]) => id === payloadId)?.[0];
    if (!payload || !kind || payload.kind !== kind) throw new Error(`CONTEXT_PAYLOAD_BINDING_MISMATCH:${payloadId}`);
    if (![expectedParent, `${run.run_instance_id}:${expectedParent}`].includes(payload.parent_record_id)) {
      throw new Error(`CONTEXT_PAYLOAD_PARENT_MISMATCH:${payloadId}`);
    }
    if (![run.run_id, run.run_instance_id].includes(payload.source_run_id)) {
      throw new Error(`CONTEXT_PAYLOAD_RUN_MISMATCH:${payloadId}`);
    }
  }
  const resolved = new Map<string, ReadOnlyStoredPayload>();
  for (const kind of ["context-core", "context-manifest", ...(requireOverlay ? ["review-delta-overlay"] : [])]) {
    const id = kinds[kind];
    if (typeof id !== "string" || !payloadIds.includes(id)) throw new Error(`CONTEXT_MANDATORY_BLOCK_MISSING:${kind}`);
    const payload = payloadById.get(id);
    if (!payload || payload.kind !== kind || ![run.run_id, run.run_instance_id].includes(payload.source_run_id)) {
      throw new Error(`CONTEXT_PAYLOAD_BINDING_MISMATCH:${kind}`);
    }
    resolved.set(kind, payload);
  }
  const corePayload = resolved.get("context-core")!;
  const manifestPayload = resolved.get("context-manifest")!;
  const core = rebuildCore(corePayload.body);
  const manifest = rebuildManifest(manifestPayload.body, core);
  if (packet.payload.context_core_id !== core.context_core_id || packet.payload.context_core_hash !== core.content_hash
    || packet.payload.context_manifest_id !== manifest.context_manifest_id || packet.payload.context_manifest_hash !== manifest.content_hash) {
    throw new Error("CONTEXT_PACKET_OBJECT_IDENTITY_MISMATCH");
  }
  let overlay: ReviewDeltaOverlay | undefined;
  const overlayPayload = resolved.get("review-delta-overlay");
  if (overlayPayload) {
    overlay = rebuildOverlay(overlayPayload.body, core);
    if (packet.payload.delta_overlay_id !== overlay.delta_overlay_id
      || packet.payload.delta_overlay_hash !== overlay.content_hash) throw new Error("CONTEXT_PACKET_OVERLAY_IDENTITY_MISMATCH");
  }
  return {
    packet, invocation, core, manifest, overlay,
    payloadRefs: payloadIds.flatMap((payloadId) => {
      const payload = payloadById.get(payloadId);
      return payload ? [{ payload_id: payload.payload_id, kind: payload.kind, content_hash: payload.content_hash,
        raw_size_bytes: payload.raw_size_bytes, redaction_status: payload.redaction_status,
        retention_class: payload.retention_class }] : [];
    })
  };
}

function exactAcceptedRef(runInstanceId: string, sourceId: string, candidates: string[], label: string): string | null {
  const matches = candidates.filter((candidate) => candidate === `${runInstanceId}:${sourceId}`);
  if (matches.length > 1) throw new Error(`ACCEPTED_PROJECT_MEMORY_PROVENANCE_AMBIGUOUS:${label}`);
  return matches[0] ?? null;
}

function resolveHistoricalPlanAuthority(run: Run): {
  approval_id: string | null;
  reviewed_plan_artifact_id: string | null;
  reviewed_plan_content_hash: string | null;
  reviewed_evidence_artifact_id: string | null;
} {
  const binding = run.implementation_baseline_binding;
  if (binding) {
    const artifactId = binding.plan_artifact_hash.startsWith("sha256:")
      ? binding.plan_artifact_hash : `sha256:${binding.plan_artifact_hash}`;
    const contentHash = artifactId.slice("sha256:".length);
    const matches = run.approvals.filter((entry) => entry.approval_id === binding.approval_id);
    if (matches.length !== 1) throw new Error("HISTORICAL_PLAN_APPROVAL_BINDING_MISMATCH");
    const approval = matches[0];
    if (approval.status !== "approved" || approval.reviewed_plan_artifact_id !== artifactId
      || approval.reviewed_plan_content_hash !== contentHash
      || (binding.plan_review_artifact_hash !== undefined
        && approval.reviewed_evidence_artifact_id !== binding.plan_review_artifact_hash)
      || !run.artifacts.some((artifact) => artifact.artifact_id === artifactId)) {
      throw new Error("HISTORICAL_PLAN_APPROVAL_BINDING_MISMATCH");
    }
    return { approval_id: approval.approval_id, reviewed_plan_artifact_id: artifactId,
      reviewed_plan_content_hash: contentHash, reviewed_evidence_artifact_id: approval.reviewed_evidence_artifact_id ?? null };
  }
  const candidates = run.approvals.filter((entry) => entry.status === "approved" && entry.reviewed_plan_artifact_id);
  if (candidates.length > 1) throw new Error("HISTORICAL_PLAN_APPROVAL_AMBIGUOUS");
  const approval = candidates[0];
  return { approval_id: approval?.approval_id ?? null,
    reviewed_plan_artifact_id: approval?.reviewed_plan_artifact_id ?? null,
    reviewed_plan_content_hash: approval?.reviewed_plan_content_hash ?? null,
    reviewed_evidence_artifact_id: approval?.reviewed_evidence_artifact_id ?? null };
}

function projectedConclusions(metadata: Record<string, unknown> | undefined): {
  values: Array<{ kind: string; id: string; status: string }>;
  redactedCount: number;
} {
  const output: Array<{ kind: string; id: string; status: string }> = [];
  let redactedCount = 0;
  for (const kind of ["jobs", "checks", "steps"] as const) {
    const values = metadata?.[kind];
    if (!Array.isArray(values)) continue;
    for (const candidate of values) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const record = candidate as Record<string, unknown>;
      const status = projectSafeIdentifier(record.conclusion ?? record.status);
      const id = redactExternal(typeof record.id === "string" ? record.id
        : typeof record.name === "string" ? record.name : undefined);
      redactedCount += Number(id.redacted) + Number(status.redacted);
      if (status.value) output.push({ kind: kind.slice(0, -1), id: id.value ?? "[NO_EXTERNAL_ID]", status: status.value });
    }
  }
  return { values: output.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)), redactedCount };
}

export function buildHistoricalEvidenceReport(run: Run, inputs: EvidenceViewInputs = {}) {
  const harvest = requirePromotedHarvest(run, inputs.harvestRecord);
  const runInstanceId = run.run_instance_id!;
  const acceptedRecords = [...(inputs.acceptedRecordDescriptors ?? [])];
  const acceptedDeliveryFacts = [...(inputs.acceptedDeliveryFactDescriptors ?? [])];
  const acceptedProcedureArtifacts = [...(inputs.acceptedProcedureArtifactDescriptors ?? [])];
  const acceptedPayloads = [...(inputs.acceptedPayloadDescriptors ?? [])];
  const acceptedPayloadLinks = [...(inputs.acceptedPayloadLinkDescriptors ?? [])];
  const selectedTaskPath = run.active_task_path ?? run.task_path;
  for (const descriptor of acceptedRecords) {
    if (!descriptor.record_id.startsWith(`${runInstanceId}:`) || !descriptor.record_kind
      || descriptor.task_path !== selectedTaskPath) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:record");
    }
  }
  for (const descriptor of acceptedDeliveryFacts) {
    if (!descriptor.delivery_fact_id.startsWith(`${runInstanceId}:`) || !descriptor.fact_kind
      || (descriptor.commit_sha !== null && !COMMIT_PATTERN.test(descriptor.commit_sha))) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:delivery");
    }
  }
  for (const descriptor of acceptedProcedureArtifacts) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(descriptor.artifact_id)
      || descriptor.content_hash !== descriptor.artifact_id.slice("sha256:".length)
      || !descriptor.payload_id.startsWith(`${runInstanceId}:`)
      || (descriptor.reviewed_plan_artifact_id === null) !== (descriptor.reviewed_plan_content_hash === null)
      || (descriptor.reviewed_plan_artifact_id !== null
        && descriptor.reviewed_plan_content_hash !== descriptor.reviewed_plan_artifact_id.slice("sha256:".length))) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:procedure_artifact");
    }
  }
  for (const descriptor of acceptedPayloads) {
    if (!descriptor.payload_id.startsWith(`${runInstanceId}:`) || !descriptor.parent_record_id.startsWith(`${runInstanceId}:`)
      || !/^[a-f0-9]{64}$/u.test(descriptor.content_hash) || descriptor.raw_size_bytes < 0) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:payload");
    }
  }
  if (new Set(acceptedPayloads.map((entry) => entry.payload_id)).size !== acceptedPayloads.length
    || new Set(acceptedProcedureArtifacts.map((entry) => `${entry.procedure_id}:${entry.artifact_id}`)).size !== acceptedProcedureArtifacts.length
    || new Set(acceptedPayloadLinks.map((entry) => `${entry.payload_id}:${entry.parent_record_id}:${entry.link_role}`)).size !== acceptedPayloadLinks.length) {
    throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_AMBIGUOUS:graph");
  }
  if (acceptedPayloadLinks.some((link) => !link.payload_id.startsWith(`${runInstanceId}:`)
    || !link.parent_record_id.startsWith(`${runInstanceId}:`) || !link.link_role.trim())) {
    throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:payload_link");
  }
  const payloadsById = new Map(acceptedPayloads.map((entry) => [entry.payload_id, entry]));
  for (const artifact of acceptedProcedureArtifacts) {
    const payload = payloadsById.get(artifact.payload_id);
    const expectedParent = `${runInstanceId}:${artifact.artifact_id}`;
    const expectedKind = `procedure-artifact-body:${artifact.procedure_id}`;
    const linked = acceptedPayloadLinks.filter((link) => link.payload_id === artifact.payload_id
      && link.parent_record_id === expectedParent && link.link_role === expectedKind);
    if (!payload || payload.content_hash !== artifact.content_hash
      || !((payload.parent_record_id === expectedParent && payload.kind === expectedKind) || linked.length === 1)) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:procedure_payload_graph");
    }
    if (linked.length > 1) throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_AMBIGUOUS:procedure_payload_graph");
  }
  for (const link of acceptedPayloadLinks.filter((entry) => entry.link_role.startsWith("procedure-artifact-body:"))) {
    if (!acceptedProcedureArtifacts.some((artifact) => artifact.payload_id === link.payload_id
      && link.parent_record_id === `${runInstanceId}:${artifact.artifact_id}`
      && link.link_role === `procedure-artifact-body:${artifact.procedure_id}`)) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_PROVENANCE_INVALID:payload_link");
    }
  }
  const acceptedDeliveryIds = acceptedDeliveryFacts.map((entry) => entry.delivery_fact_id);
  const payloadBySourceId = new Map(acceptedPayloads.map((entry) => [entry.payload_id.slice(`${runInstanceId}:`.length), entry]));
  const requireDeliveryPayload = (descriptor: AcceptedDeliveryFactDescriptor, label: string) => {
    if (!descriptor.excerpt_payload_id) return undefined;
    const payload = payloadBySourceId.get(descriptor.excerpt_payload_id);
    if (!payload) throw new Error(`${label}_PAYLOAD_MISSING`);
    const sourceFactId = descriptor.delivery_fact_id.slice(`${runInstanceId}:`.length);
    const expectedParent = `${runInstanceId}:delivery-fact:${sourceFactId}`;
    const links = acceptedPayloadLinks.filter((link) => link.payload_id === payload.payload_id
      && link.link_role === "delivery_excerpt");
    const exactLinks = links.filter((link) => link.parent_record_id === expectedParent);
    if (exactLinks.length > 1) throw new Error(`${label}_PAYLOAD_PROVENANCE_AMBIGUOUS`);
    if (links.some((link) => link.parent_record_id !== expectedParent)
      || payload.kind !== "delivery_excerpt"
      || !((payload.parent_record_id === expectedParent) || exactLinks.length === 1)) {
      throw new Error(`${label}_PAYLOAD_PROVENANCE_INVALID`);
    }
    return payload;
  };
  const reviews = [...run.review_results].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const reviewLineage = (source: string) => /(?:^|:)fix-pass-review$/u.test(source)
    || /(?:^|:)implementation-review$/u.test(source) ? "implementation" : source;
  const latestReviewByLineage = new Map(reviews.map((review) => [reviewLineage(review.source), review.review_result_id]));
  const verification = [...run.verification_results].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let redactedFieldCount = 0;
  const identifier = (value: unknown, fallback: string | null = null) => {
    const projected = projectSafeIdentifier(value, fallback);
    redactedFieldCount += Number(projected.redacted);
    return projected.value;
  };
  const delivery = [...run.delivery_facts].sort((a, b) => a.delivery_fact_id.localeCompare(b.delivery_fact_id)).map((fact) => {
    const url = redactExternal(fact.url);
    const external = redactExternal(fact.external_run_id);
    redactedFieldCount += Number(url.redacted) + Number(external.redacted);
    const source = redactFreeText(fact.source);
    redactedFieldCount += Number(source.redacted);
    const acceptedRecordId = exactAcceptedRef(runInstanceId, fact.delivery_fact_id, acceptedDeliveryIds, "delivery");
    if (!acceptedRecordId) throw new Error("ACCEPTED_PROJECT_MEMORY_DELIVERY_BINDING_MISSING");
    const deliveryDescriptor = acceptedDeliveryFacts.find((entry) => entry.delivery_fact_id === acceptedRecordId)!;
    if (deliveryDescriptor.fact_kind !== fact.fact_kind || deliveryDescriptor.recorded_at !== fact.recorded_at
      || deliveryDescriptor.commit_sha !== (fact.commit_sha ?? null)) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_DELIVERY_BINDING_MISMATCH");
    }
    const excerptPayloadRef = requireDeliveryPayload(deliveryDescriptor, "ACCEPTED_PROJECT_MEMORY_DELIVERY")?.payload_id ?? null;
    return { id: fact.delivery_fact_id, kind: fact.fact_kind, source: source.value, status: fact.status,
      recorded_at: fact.recorded_at, commit_sha: fact.commit_sha ?? null,
      url: url.value, url_hash: url.hash, external_run_id: external.value, external_run_id_hash: external.hash,
      accepted_record_id: acceptedRecordId, excerpt_payload_ref: excerptPayloadRef };
  });
  const remoteChecks = [...run.remote_checks].sort((a, b) => a.check_result_id.localeCompare(b.check_result_id)).map((check) => {
    const url = redactExternal(check.ci_run.url);
    const external = redactExternal(check.ci_run.run_id);
    redactedFieldCount += Number(url.redacted) + Number(external.redacted);
    const name = redactFreeText(check.name);
    redactedFieldCount += Number(name.redacted);
    const acceptedRecordId = exactAcceptedRef(runInstanceId, check.check_result_id, acceptedDeliveryIds, "remote_ci");
    if (!acceptedRecordId) throw new Error("ACCEPTED_PROJECT_MEMORY_REMOTE_CHECK_BINDING_MISSING");
    const deliveryDescriptor = acceptedDeliveryFacts.find((entry) => entry.delivery_fact_id === acceptedRecordId);
    if (!deliveryDescriptor || deliveryDescriptor.fact_kind !== "remote_ci" || deliveryDescriptor.recorded_at !== check.recorded_at) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_REMOTE_CHECK_BINDING_MISMATCH");
    }
    const payload = requireDeliveryPayload(deliveryDescriptor, "ACCEPTED_PROJECT_MEMORY_REMOTE_CHECK");
    const excerpt = redactFreeText(payload?.bounded_excerpt ?? undefined);
    redactedFieldCount += Number(excerpt.redacted);
    const currentCommit = check.metadata?.commit_sha;
    if (currentCommit !== undefined && currentCommit !== null
      && (typeof currentCommit !== "string" || !COMMIT_PATTERN.test(currentCommit))) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_REMOTE_CHECK_BINDING_MISMATCH");
    }
    if (typeof currentCommit === "string" && deliveryDescriptor.commit_sha !== null
      && currentCommit !== deliveryDescriptor.commit_sha) {
      throw new Error("ACCEPTED_PROJECT_MEMORY_REMOTE_CHECK_BINDING_MISMATCH");
    }
    const commitSha = deliveryDescriptor.commit_sha;
    const conclusions = projectedConclusions(check.metadata);
    redactedFieldCount += conclusions.redactedCount;
    const provider = identifier(check.ci_run.provider, "[REDACTED_IDENTIFIER]")!;
    const conclusion = identifier(check.metadata?.conclusion, check.status)!;
    return { id: check.check_result_id, gate_id: check.gate_id, name: name.value, required: check.required,
      status: check.status, recorded_at: check.recorded_at, provider,
      url: url.value, url_hash: url.hash, external_run_id: external.value, external_run_id_hash: external.hash,
      commit_sha: commitSha, conclusion,
      check_conclusions: conclusions.values, accepted_record_id: acceptedRecordId,
      evidence_ref: payload?.payload_id ?? acceptedRecordId, failure_excerpt: excerpt.value,
      failure_excerpt_hash: excerpt.hash, redaction_status: payload?.redaction_status ?? "not_recorded" };
  });
  const proof = proofAvailability(run, inputs.proofRecords);
  const claims: EvidenceClaim[] = [
    { claim: "run_identity", status: "evidence", evidence_refs: [`run:${run.run_instance_id}`] },
    { claim: "verification", status: verification.length ? "evidence" : "missing", evidence_refs: verification.map((v) => `verification:${v.verification_result_id}`) },
    { claim: "delivery", status: delivery.length ? "evidence" : "missing", evidence_refs: delivery.map((v) => `delivery:${v.id}`) },
    { claim: "proof", status: proof.status === "recorded" ? "evidence"
      : proof.status === "not_applicable" ? "not_applicable" : "missing", evidence_refs: proof.refs }
  ];
  const gaps = claims.filter((claim) => claim.status === "missing").map((claim) => claim.claim);
  const routingRecords = (run.review_routing_records ?? []).map((record) => ({
    record_id: record.record_id, record_kind: record.record_kind, status: record.status, created_at: record.created_at,
    procedure_id: identifier(record.payload.procedure_id), route_decision_id: identifier(record.payload.route_decision_id),
    route_class: identifier(record.payload.route_class), policy_version: identifier(record.payload.policy_version),
    binding_version: identifier(record.payload.binding_version), binding_profile_id: identifier(record.payload.binding_profile_id),
    context_core_id: identifier(record.payload.context_core_id), context_manifest_id: identifier(record.payload.context_manifest_id),
    delta_overlay_id: identifier(record.payload.delta_overlay_id), usage_ref: identifier(record.payload.usage_ref),
    changed_surface_classes: Array.isArray(record.payload.changed_surface_classes)
      ? record.payload.changed_surface_classes.filter((value): value is string => typeof value === "string").sort() : [],
    risk_classes: Array.isArray(record.payload.risk_classes)
      ? record.payload.risk_classes.filter((value): value is string => typeof value === "string").sort() : [],
    deterministic_evidence_state: identifier(record.payload.deterministic_evidence_state),
    required_semantic_reviews: Array.isArray(record.payload.required_semantic_reviews)
      ? record.payload.required_semantic_reviews.filter((value): value is string => typeof value === "string").sort() : [],
    independence_mode: identifier(record.payload.independence_mode),
    context_mode: identifier(record.payload.context_mode), context_reuse: identifier(record.payload.context_reuse),
    request_bytes: Number.isInteger(record.payload.request_bytes) ? record.payload.request_bytes : null,
    core_bytes: Number.isInteger(record.payload.core_bytes) ? record.payload.core_bytes : null,
    delta_bytes: Number.isInteger(record.payload.delta_bytes) ? record.payload.delta_bytes : null,
    input_tokens: Number.isInteger(record.payload.input_tokens) ? record.payload.input_tokens : null,
    cached_input_tokens: Number.isInteger(record.payload.cached_input_tokens) ? record.payload.cached_input_tokens : null,
    output_tokens: Number.isInteger(record.payload.output_tokens) ? record.payload.output_tokens : null,
    latency_ms: Number.isInteger(record.payload.latency_ms) ? record.payload.latency_ms : null,
    observed_provider: identifier(record.payload.observed_provider ?? record.payload.provider),
    observed_model: identifier(record.payload.observed_model ?? record.payload.model),
    observed_reasoning_effort: identifier(record.payload.observed_reasoning_effort ?? record.payload.reasoning_effort)
  })).sort((left, right) => left.created_at.localeCompare(right.created_at) || left.record_id.localeCompare(right.record_id));
  const planAuthority = resolveHistoricalPlanAuthority(run);
  const closeouts = [...run.closeout_receipts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const closeout = closeouts[closeouts.length - 1];
  return identity("historical_evidence_report", withOutputBudget({
    schema_version: 1, view_kind: "historical_evidence_report", authority: "accepted_project_memory",
    run: { run_instance_id: run.run_instance_id, run_id: run.run_id, phase_id: run.phase_id ?? null,
      task_path: run.active_task_path ?? run.task_path, lifecycle_status: run.lifecycle_status,
      source_head: run.repository.head_sha ?? null, source_snapshot: run.source_snapshot ?? null,
      implementation_baseline_head: run.implementation_baseline_head ?? null,
      final_reviewed_source_head: run.final_reviewed_source_head ?? null, delivered_source_head: run.delivered_source_head ?? null },
    plan: planAuthority,
    claims,
    verification: verification.map((result) => {
      const source = redactFreeText(result.source); redactedFieldCount += Number(source.redacted);
      return { id: result.verification_result_id, status: result.status,
      source: source.value, created_at: result.created_at, artifact_refs: result.artifact_refs.map((ref) => ref.artifact_id).sort(),
      commands: result.command_results.map((command) => { const text = redactFreeText(command.command); redactedFieldCount += Number(text.redacted); return ({ id: command.command_result_id, command: text.value,
        status: command.status, exit_code: command.exit_code ?? null, artifact_refs: command.artifact_refs.map((ref) => ref.artifact_id).sort() }); }) }; }),
    reviews: reviews.map((review) => ({ id: review.review_result_id, status: review.status,
      source: identifier(review.source, "[REDACTED_IDENTIFIER]")!,
      created_at: review.created_at, disposition: latestReviewByLineage.get(reviewLineage(review.source)) === review.review_result_id ? "current" : "superseded",
      blockers: review.blockers.map((blocker) => { const redacted = redactFreeText(blocker); redactedFieldCount += Number(redacted.redacted); return redacted.value; }),
      artifact_refs: review.artifact_refs.map((ref) => ref.artifact_id).sort(),
      procedure_artifact_refs: acceptedProcedureArtifacts.filter((descriptor) =>
        review.artifact_refs.some((ref) => ref.artifact_id === descriptor.artifact_id))
        .map((descriptor) => `${descriptor.procedure_id}:${descriptor.artifact_id}`).sort() })),
    delivery, remote_checks: remoteChecks, proof, gaps, inferences: [],
    delivery_relationship: run.delivery_source_relationship ?? null,
    closeout: closeout ? { receipt_id: closeout.receipt_id, status: closeout.status, created_at: closeout.created_at,
      blocker_count: closeout.blockers.length } : null,
    harvest: { harvest_id: harvest.harvest_id, status: harvest.status, promoted_at: harvest.promoted_at,
      accepted_count: harvest.accepted_count, discarded_count: harvest.discarded_count,
      quarantined_count: harvest.quarantined_count, redacted_count: harvest.redacted_count,
      unresolved_count: harvest.unresolved_count, project_run_id: harvest.project_run_id },
    unknowns: [...new Set([
      ...(remoteChecks.length === 0 ? ["remote_check_state"] : []),
      ...(run.delivery_source_relationship ? [] : ["delivery_source_relationship"])
    ])].sort(),
    routing: { refs: (run.review_routing_records ?? []).map((record) => record.record_id).sort(), records: routingRecords,
      usage_refs: [...new Set((run.review_routing_records ?? []).flatMap((record) =>
        typeof record.payload.usage_ref === "string" ? [record.payload.usage_ref] : []))].sort() },
    provenance: {
      accepted_record_refs: acceptedRecords.map((descriptor) => descriptor.record_id).sort(),
      delivery_fact_refs: acceptedDeliveryFacts.map((descriptor) => descriptor.delivery_fact_id).sort(),
      procedure_artifacts: acceptedProcedureArtifacts.map((descriptor) => ({
        procedure_id: descriptor.procedure_id, artifact_id: descriptor.artifact_id,
        payload_ref: descriptor.payload_id, content_hash: `sha256:${descriptor.content_hash}`,
        recorded_at: descriptor.recorded_at, reviewed_plan_artifact_id: descriptor.reviewed_plan_artifact_id,
        reviewed_plan_content_hash: descriptor.reviewed_plan_content_hash,
        reviewed_evidence_artifact_id: descriptor.reviewed_evidence_artifact_id
      })),
      payloads: acceptedPayloads.map((descriptor) => ({
        payload_id: descriptor.payload_id, parent_record_id: descriptor.parent_record_id, kind: descriptor.kind,
        content_hash: `sha256:${descriptor.content_hash}`, raw_size_bytes: descriptor.raw_size_bytes,
        redaction_status: descriptor.redaction_status, retention_class: descriptor.retention_class
      })),
      procedure_contract_refs: ["docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md", "skills/self-hosting/procedure-registry.json"]
    },
    redaction: { applied_before_serialization: true, raw_payloads_exported: false,
      redacted_field_count: redactedFieldCount, strategy: "external_values_replaced_with_hash_bound_markers" },
    truncation: { applied: false, omitted_optional_count: 0, reasons: [] }
  }, inputs.outputBudgetBytes ?? 256 * 1024));
}

export function buildAcceptedContextView(run: Run, packetRecordId: string, inputs: EvidenceViewInputs = {}) {
  const harvest = requirePromotedHarvest(run, inputs.harvestRecord);
  const context = validateContext(run, packetRecordId, inputs.payloads ?? [], false);
  return identity("accepted_context_view", {
    schema_version: 1, view_kind: "accepted_context_view", authority: "accepted_project_memory",
    run_instance_id: run.run_instance_id, packet_record_id: context.packet.record_id,
    acceptance: { harvest_id: harvest.harvest_id, status: harvest.status, project_run_id: harvest.project_run_id },
    context: { core_id: context.core.context_core_id, core_hash: context.core.content_hash,
      manifest_id: context.manifest.context_manifest_id, manifest_hash: context.manifest.content_hash,
      overlay_id: context.packet.payload.delta_overlay_id ?? null,
      core: context.core, manifest: context.manifest },
    ordered_payload_refs: context.payloadRefs,
    claims: [{ claim: "context_parentage", status: "evidence", evidence_refs: [context.packet.record_id,
      context.core.context_core_id, context.manifest.context_manifest_id] }],
    transport: { mode: safeIdentifier(context.packet.payload.context_mode) ?? "unknown",
      reuse: safeIdentifier(context.invocation.payload.context_reuse) ?? "unknown",
      procedure_id: safeIdentifier(context.packet.payload.procedure_id) },
    retrieval: { mode: "read_only_exact_payload_reconstruction", capabilities: context.manifest.retrieval_capabilities,
      canonical_bytes: { core: context.core.canonical_byte_count, manifest: context.manifest.canonical_byte_count },
      mandatory_blocks_present: context.manifest.mandatory_blocks_present,
      source_manifest_omissions: [...context.manifest.omissions] },
    redaction: { applied_before_serialization: true, raw_payloads_exported: false,
      source_redactions: [...context.manifest.redactions] },
    truncation: { applied: context.manifest.truncations.length > 0,
      omitted_optional_count: context.manifest.truncations.length, reasons: [...context.manifest.truncations] }
  });
}

export function buildImplementationReviewView(run: Run, candidateHead = run.repository.head_sha ?? null, inputs: EvidenceViewInputs = {}) {
  if (!run.run_instance_id || run.lifecycle_status !== "active") throw new Error("ACTIVE_STAGING_RUN_REQUIRED");
  const binding = run.implementation_baseline_binding;
  if (!binding || binding.implementation_baseline_head !== run.implementation_baseline_head) {
    throw new Error("IMPLEMENTATION_BASELINE_REQUIRED");
  }
  if (!candidateHead || !/^[a-f0-9]{40}$/u.test(candidateHead)) throw new Error("IMPLEMENTATION_CANDIDATE_HEAD_REQUIRED");
  if (!inputs.packetRecordId) throw new Error("IMPLEMENTATION_REVIEW_PACKET_REQUIRED");
  const context = validateContext(run, inputs.packetRecordId, inputs.payloads ?? [], true);
  const overlay = context.overlay!;
  if (context.core.source_snapshot !== candidateHead || context.packet.payload.source_snapshot !== run.source_snapshot) {
    throw new Error("IMPLEMENTATION_REVIEW_CANDIDATE_BINDING_MISMATCH");
  }
  const proof = proofAvailability(run, inputs.proofRecords);
  const routingRefs = (run.review_routing_records ?? []).map((record) => record.record_id).sort();
  const boundedRoutingRefs = routingRefs.slice(-64);
  const truncationReasons = [...new Set([
    ...(routingRefs.length > boundedRoutingRefs.length ? ["bounded_routing_history_limit"] : []),
    ...context.manifest.truncations,
    ...(overlay.truncations ?? [])
  ])].sort();
  return identity("implementation_review_view", {
    schema_version: 1, view_kind: "implementation_review_view", authority: "active_run_staging",
    run: { run_instance_id: run.run_instance_id, run_id: run.run_id, phase_id: run.phase_id ?? null,
      task_path: run.active_task_path ?? run.task_path, branch: run.repository.branch ?? null,
      immutable_base: binding.immutable_base ?? null, baseline_head: binding.implementation_baseline_head,
      baseline_tree_hash: binding.implementation_baseline_tree_hash, candidate_head: candidateHead,
      reviewed_candidate_id: overlay.reviewed_candidate_id, source_snapshot: run.source_snapshot ?? null },
    plan: { artifact_id: binding.plan_artifact_hash.startsWith("sha256:")
        ? binding.plan_artifact_hash : `sha256:${binding.plan_artifact_hash}`, approval_id: binding.approval_id,
      task_artifact_id: binding.task_artifact_id ?? null, planning_cohort_id: binding.planning_cohort_id ?? null,
      required_lens_ids: binding.required_planning_lens_ids ?? [], lens_artifacts: binding.planning_lens_artifacts ?? [] },
    procedure: { id: context.packet.payload.procedure_id, source_map_ref: "docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md",
      execution_policy_ref: "skills/self-hosting/procedure-execution-policy.json",
      route_policy_ref: "skills/self-hosting/review-route-policy.json",
      binding_ref: "skills/self-hosting/codex-reference-binding.json" },
    context: { packet_record_id: context.packet.record_id, core_id: context.core.context_core_id,
      core_hash: context.core.content_hash, manifest_id: context.manifest.context_manifest_id,
      manifest_hash: context.manifest.content_hash, core: context.core, manifest: context.manifest,
      payload_refs: context.payloadRefs },
    delta: { overlay_id: overlay.delta_overlay_id, overlay_hash: overlay.content_hash,
      changed_files: overlay.changed_files, diff_refs: overlay.diff_refs, payload_refs: overlay.payload_refs,
      changed_authority_surfaces: overlay.changed_authority_surfaces,
      changed_architecture_surfaces: overlay.changed_architecture_surfaces,
      risks: context.core.risk_classes, findings: overlay.findings, verification_refs: overlay.verification_refs,
      missing_evidence: overlay.missing_evidence.map(() => "[REDACTED_FREE_TEXT]"),
      escalation_reasons: overlay.escalation_reasons.map(() => "[REDACTED_FREE_TEXT]"),
      canonical_byte_count: overlay.canonical_byte_count, size_budget_bytes: overlay.size_budget_bytes },
    evidence: { verification_refs: run.verification_results.map((result) => result.verification_result_id).sort(),
      prior_review_refs: run.review_results.map((review) => review.review_result_id).sort(),
      routing_refs: boundedRoutingRefs, proof },
    route: { decision_id: context.packet.payload.route_decision_id, route_class: context.packet.payload.route_class,
      policy_version: context.packet.payload.policy_version, binding_version: context.packet.payload.binding_version,
      binding_profile_id: context.packet.payload.binding_profile_id, review_tier: context.packet.payload.review_tier,
      risk_classes: context.packet.payload.risk_classes, required_semantic_reviews: context.packet.payload.required_semantic_reviews },
    transport: { context_mode: context.packet.payload.context_mode, context_reuse: context.invocation.payload.context_reuse ?? "unknown",
      retention_class: context.packet.payload.retention_class, redaction_status: context.packet.payload.redaction_status,
      retrieval: "read_only_exact_payload_reconstruction", usage_ref: context.packet.payload.usage_ref ?? null },
    budget: { class: context.packet.payload.budget_class, core_bytes: context.core.canonical_byte_count,
      core_limit_bytes: context.core.size_budget_bytes, delta_bytes: overlay.canonical_byte_count,
      delta_limit_bytes: overlay.size_budget_bytes },
    independence: { required: true, mode: context.packet.payload.independence_mode,
      approved_attempt_id: context.packet.payload.approved_attempt_id, builder_transcript_authority: false },
    claims: [{ claim: "exact_implementation_baseline", status: "evidence", evidence_refs: [
      `source:${binding.implementation_baseline_head}`, `approval:${binding.approval_id}`,
      binding.plan_artifact_hash.startsWith("sha256:") ? binding.plan_artifact_hash : `sha256:${binding.plan_artifact_hash}`
    ] }, { claim: "exact_review_context", status: "evidence", evidence_refs: [context.packet.record_id,
      context.core.context_core_id, context.manifest.context_manifest_id, overlay.delta_overlay_id] }],
    redaction: { applied_before_serialization: true, raw_payloads_exported: false,
      source_redactions: [...context.manifest.redactions] },
    truncation: { applied: truncationReasons.length > 0,
      omitted_optional_count: routingRefs.length - boundedRoutingRefs.length
        + context.manifest.truncations.length + (overlay.truncations ?? []).length,
      reasons: truncationReasons }
  });
}
