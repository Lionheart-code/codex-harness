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

export type ClaimStatus = "evidence" | "inference" | "missing";
export interface EvidenceClaim { claim: string; status: ClaimStatus; evidence_refs: string[]; }

export interface EvidenceViewInputs {
  proofRecords?: unknown[];
  packetRecordId?: string;
  payloads?: ReadOnlyStoredPayload[];
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

function validatePayloadRefs(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`EVIDENCE_VIEW_SCHEMA_INVALID:${label}`);
  for (const entry of value) {
    const ref = object(entry, label);
    requireKeys(ref, ["payload_id", "kind", "content_hash", "raw_size_bytes", "redaction_status", "retention_class"], label);
    for (const field of ["payload_id", "kind", "content_hash", "redaction_status", "retention_class"]) requireString(ref, field, label);
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
    ? ["run", "claims", "verification", "reviews", "delivery", "remote_checks", "proof", "gaps", "inferences", "unknowns", "routing", "budget", "redaction", "truncation"]
    : kind === "accepted_context_view"
      ? ["run_instance_id", "packet_record_id", "context", "ordered_payload_refs", "claims", "transport", "retrieval", "redaction", "truncation"]
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
    if (!["evidence", "inference", "missing"].includes(String(claim.status))) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:CLAIM:status");
    requireStringArray(claim.evidence_refs, "CLAIM:evidence_refs");
  }
  if (kind === "historical_evidence_report") {
    const run = object(view.run, "HISTORICAL_RUN");
    requireKeys(run, ["run_instance_id", "run_id", "phase_id", "task_path", "lifecycle_status", "source_head", "source_snapshot",
      "implementation_baseline_head", "final_reviewed_source_head", "delivered_source_head"], "HISTORICAL_RUN");
    for (const field of ["run_instance_id", "run_id", "task_path", "lifecycle_status"]) requireString(run, field, "HISTORICAL_RUN");
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
    for (const candidate of view.remote_checks as unknown[]) {
      const remote = object(candidate, "HISTORICAL_REMOTE_CHECK");
      requireKeys(remote, ["id", "gate_id", "name", "required", "status", "recorded_at", "provider", "url", "url_hash",
        "external_run_id", "external_run_id_hash"], "HISTORICAL_REMOTE_CHECK");
      for (const field of ["id", "gate_id", "name", "status", "recorded_at", "provider"]) requireString(remote, field, "HISTORICAL_REMOTE_CHECK");
      if (typeof remote.required !== "boolean") throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_REMOTE_CHECK:required");
    }
    const proof = object(view.proof, "PROOF_AVAILABILITY");
    requireKeys(proof, ["status", "refs", "acceptance", "gap_refs", "reason"], "PROOF_AVAILABILITY");
    requireStringArray(proof.refs, "PROOF_AVAILABILITY:refs");
    requireStringArray(proof.gap_refs, "PROOF_AVAILABILITY:gap_refs");
    requireString(proof, "reason", "PROOF_AVAILABILITY");
    const routing = object(view.routing, "HISTORICAL_ROUTING");
    requireKeys(routing, ["refs", "records", "usage_refs"], "HISTORICAL_ROUTING");
    requireStringArray(routing.refs, "HISTORICAL_ROUTING:refs");
    requireStringArray(routing.usage_refs, "HISTORICAL_ROUTING:usage_refs");
    if (!Array.isArray(routing.records)) throw new Error("EVIDENCE_VIEW_SCHEMA_INVALID:HISTORICAL_ROUTING:records");
    for (const candidate of routing.records) {
      const record = object(candidate, "HISTORICAL_ROUTING_RECORD");
      requireKeys(record, ["record_id", "record_kind", "status", "created_at", "procedure_id", "route_decision_id", "route_class",
        "policy_version", "binding_version", "binding_profile_id", "context_core_id", "context_manifest_id", "delta_overlay_id", "usage_ref"],
      "HISTORICAL_ROUTING_RECORD");
      for (const field of ["record_id", "record_kind", "status", "created_at"]) requireString(record, field, "HISTORICAL_ROUTING_RECORD");
    }
  } else if (kind === "accepted_context_view") {
    requireString(view, "run_instance_id", kind);
    requireString(view, "packet_record_id", kind);
    const context = object(view.context, "ACCEPTED_CONTEXT");
    requireKeys(context, ["core_id", "core_hash", "manifest_id", "manifest_hash", "overlay_id", "core", "manifest"], "ACCEPTED_CONTEXT");
    rebuildManifest(context.manifest, rebuildCore(context.core));
    validatePayloadRefs(view.ordered_payload_refs, "ACCEPTED_CONTEXT_PAYLOAD_REF");
    const retrieval = object(view.retrieval, "ACCEPTED_CONTEXT_RETRIEVAL");
    requireKeys(retrieval, ["mode", "capabilities", "canonical_bytes", "mandatory_blocks_present"], "ACCEPTED_CONTEXT_RETRIEVAL");
    requireStringArray(retrieval.capabilities, "ACCEPTED_CONTEXT_RETRIEVAL:capabilities");
    requireStringArray(retrieval.mandatory_blocks_present, "ACCEPTED_CONTEXT_RETRIEVAL:mandatory_blocks_present");
  } else if (kind === "implementation_review_view") {
    const run = object(view.run, "IMPLEMENTATION_RUN");
    requireKeys(run, ["run_instance_id", "run_id", "phase_id", "task_path", "branch", "immutable_base", "baseline_head",
      "baseline_tree_hash", "candidate_head", "reviewed_candidate_id", "source_snapshot"], "IMPLEMENTATION_RUN");
    for (const field of ["run_instance_id", "run_id", "task_path", "baseline_head", "baseline_tree_hash", "candidate_head", "reviewed_candidate_id"]) {
      requireString(run, field, "IMPLEMENTATION_RUN");
    }
    const context = object(view.context, "IMPLEMENTATION_CONTEXT");
    requireKeys(context, ["packet_record_id", "core_id", "core_hash", "manifest_id", "manifest_hash", "core", "manifest", "payload_refs"], "IMPLEMENTATION_CONTEXT");
    const core = rebuildCore(context.core);
    rebuildManifest(context.manifest, core);
    validatePayloadRefs(context.payload_refs, "IMPLEMENTATION_CONTEXT_PAYLOAD_REF");
    const delta = object(view.delta, "IMPLEMENTATION_DELTA");
    requireKeys(delta, ["overlay_id", "overlay_hash", "changed_files", "diff_refs", "payload_refs", "changed_authority_surfaces",
      "changed_architecture_surfaces", "risks", "findings", "verification_refs", "missing_evidence", "escalation_reasons",
      "canonical_byte_count", "size_budget_bytes"], "IMPLEMENTATION_DELTA");
    for (const field of ["changed_files", "diff_refs", "payload_refs", "changed_authority_surfaces", "changed_architecture_surfaces",
      "risks", "verification_refs", "missing_evidence", "escalation_reasons"]) requireStringArray(delta[field], `IMPLEMENTATION_DELTA:${field}`);
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
  }
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
  let result = { ...body, budget: { output_bytes: 0, limit_bytes: limitBytes } };
  for (let index = 0; index < 4; index += 1) {
    result = { ...body, budget: { output_bytes: Buffer.byteLength(canonicalJson(result), "utf8"), limit_bytes: limitBytes } };
  }
  if (Buffer.byteLength(canonicalJson(result), "utf8") > limitBytes) {
    throw new Error(`EVIDENCE_VIEW_BUDGET_EXCEEDED:${limitBytes}`);
  }
  return result;
}

function redactExternal(value: string | undefined): { value: string | null; hash: string | null; redacted: boolean } {
  return value
    ? { value: "[REDACTED_EXTERNAL_VALUE]", hash: `sha256:${sha256Hex(value)}`, redacted: true }
    : { value: null, hash: null, redacted: false };
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

export function buildHistoricalEvidenceReport(run: Run, inputs: EvidenceViewInputs = {}) {
  if (!run.run_instance_id || run.lifecycle_status !== "harvested") throw new Error("ACCEPTED_RUN_REQUIRED");
  const reviews = [...run.review_results].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestReviewBySource = new Map(reviews.map((review) => [review.source, review.review_result_id]));
  const verification = [...run.verification_results].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let redactedFieldCount = 0;
  const delivery = [...run.delivery_facts].sort((a, b) => a.delivery_fact_id.localeCompare(b.delivery_fact_id)).map((fact) => {
    const url = redactExternal(fact.url);
    const external = redactExternal(fact.external_run_id);
    redactedFieldCount += Number(url.redacted) + Number(external.redacted);
    return { id: fact.delivery_fact_id, kind: fact.fact_kind, source: fact.source, status: fact.status,
      recorded_at: fact.recorded_at, commit_sha: fact.commit_sha ?? null,
      url: url.value, url_hash: url.hash, external_run_id: external.value, external_run_id_hash: external.hash };
  });
  const remoteChecks = [...run.remote_checks].sort((a, b) => a.check_result_id.localeCompare(b.check_result_id)).map((check) => {
    const url = redactExternal(check.ci_run.url);
    const external = redactExternal(check.ci_run.run_id);
    redactedFieldCount += Number(url.redacted) + Number(external.redacted);
    return { id: check.check_result_id, gate_id: check.gate_id, name: check.name, required: check.required,
      status: check.status, recorded_at: check.recorded_at, provider: check.ci_run.provider,
      url: url.value, url_hash: url.hash, external_run_id: external.value, external_run_id_hash: external.hash };
  });
  const proof = proofAvailability(run, inputs.proofRecords);
  const claims: EvidenceClaim[] = [
    { claim: "run_identity", status: "evidence", evidence_refs: [`run:${run.run_instance_id}`] },
    { claim: "verification", status: verification.length ? "evidence" : "missing", evidence_refs: verification.map((v) => `verification:${v.verification_result_id}`) },
    { claim: "delivery", status: delivery.length ? "evidence" : "missing", evidence_refs: delivery.map((v) => `delivery:${v.id}`) },
    { claim: "proof", status: proof.status === "recorded" ? "evidence" : "missing", evidence_refs: proof.refs }
  ];
  const gaps = claims.filter((claim) => claim.status === "missing").map((claim) => claim.claim);
  const routingRecords = (run.review_routing_records ?? []).map((record) => ({
    record_id: record.record_id, record_kind: record.record_kind, status: record.status, created_at: record.created_at,
    procedure_id: typeof record.payload.procedure_id === "string" ? record.payload.procedure_id : null,
    route_decision_id: typeof record.payload.route_decision_id === "string" ? record.payload.route_decision_id : null,
    route_class: typeof record.payload.route_class === "string" ? record.payload.route_class : null,
    policy_version: typeof record.payload.policy_version === "string" ? record.payload.policy_version : null,
    binding_version: typeof record.payload.binding_version === "string" ? record.payload.binding_version : null,
    binding_profile_id: typeof record.payload.binding_profile_id === "string" ? record.payload.binding_profile_id : null,
    context_core_id: typeof record.payload.context_core_id === "string" ? record.payload.context_core_id : null,
    context_manifest_id: typeof record.payload.context_manifest_id === "string" ? record.payload.context_manifest_id : null,
    delta_overlay_id: typeof record.payload.delta_overlay_id === "string" ? record.payload.delta_overlay_id : null,
    usage_ref: typeof record.payload.usage_ref === "string" ? record.payload.usage_ref : null
  })).sort((left, right) => left.created_at.localeCompare(right.created_at) || left.record_id.localeCompare(right.record_id));
  return identity("historical_evidence_report", withOutputBudget({
    schema_version: 1, view_kind: "historical_evidence_report", authority: "accepted_project_memory",
    run: { run_instance_id: run.run_instance_id, run_id: run.run_id, phase_id: run.phase_id ?? null,
      task_path: run.active_task_path ?? run.task_path, lifecycle_status: run.lifecycle_status,
      source_head: run.repository.head_sha ?? null, source_snapshot: run.source_snapshot ?? null,
      implementation_baseline_head: run.implementation_baseline_head ?? null,
      final_reviewed_source_head: run.final_reviewed_source_head ?? null, delivered_source_head: run.delivered_source_head ?? null },
    claims,
    verification: verification.map((result) => ({ id: result.verification_result_id, status: result.status,
      source: result.source, created_at: result.created_at, artifact_refs: result.artifact_refs.map((ref) => ref.artifact_id).sort(),
      commands: result.command_results.map((command) => ({ id: command.command_result_id, command: command.command,
        status: command.status, exit_code: command.exit_code ?? null, artifact_refs: command.artifact_refs.map((ref) => ref.artifact_id).sort() })) })),
    reviews: reviews.map((review) => ({ id: review.review_result_id, status: review.status, source: review.source,
      created_at: review.created_at, disposition: latestReviewBySource.get(review.source) === review.review_result_id ? "current" : "superseded",
      blockers: [...review.blockers], artifact_refs: review.artifact_refs.map((ref) => ref.artifact_id).sort() })),
    delivery, remote_checks: remoteChecks, proof, gaps, inferences: [],
    unknowns: [...new Set([
      ...(remoteChecks.length === 0 ? ["remote_check_state"] : []),
      ...(run.delivery_source_relationship ? [] : ["delivery_source_relationship"])
    ])].sort(),
    routing: { refs: (run.review_routing_records ?? []).map((record) => record.record_id).sort(), records: routingRecords,
      usage_refs: [...new Set((run.review_routing_records ?? []).flatMap((record) =>
        typeof record.payload.usage_ref === "string" ? [record.payload.usage_ref] : []))].sort() },
    redaction: { applied_before_serialization: true, raw_payloads_exported: false,
      redacted_field_count: redactedFieldCount, strategy: "external_values_replaced_with_hash_bound_markers" },
    truncation: { applied: false, omitted_optional_count: 0 }
  }, 256 * 1024));
}

export function buildAcceptedContextView(run: Run, packetRecordId: string, inputs: EvidenceViewInputs = {}) {
  if (!run.run_instance_id || run.lifecycle_status !== "harvested") throw new Error("ACCEPTED_RUN_REQUIRED");
  const context = validateContext(run, packetRecordId, inputs.payloads ?? [], false);
  return identity("accepted_context_view", {
    schema_version: 1, view_kind: "accepted_context_view", authority: "accepted_project_memory",
    run_instance_id: run.run_instance_id, packet_record_id: context.packet.record_id,
    context: { core_id: context.core.context_core_id, core_hash: context.core.content_hash,
      manifest_id: context.manifest.context_manifest_id, manifest_hash: context.manifest.content_hash,
      overlay_id: context.packet.payload.delta_overlay_id ?? null,
      core: context.core, manifest: context.manifest },
    ordered_payload_refs: context.payloadRefs,
    claims: [{ claim: "context_parentage", status: "evidence", evidence_refs: [context.packet.record_id,
      context.core.context_core_id, context.manifest.context_manifest_id] }],
    transport: { mode: context.packet.payload.context_mode ?? "unknown",
      reuse: context.invocation.payload.context_reuse ?? "unknown", procedure_id: context.packet.payload.procedure_id ?? null },
    retrieval: { mode: "read_only_exact_payload_reconstruction", capabilities: context.manifest.retrieval_capabilities,
      canonical_bytes: { core: context.core.canonical_byte_count, manifest: context.manifest.canonical_byte_count },
      mandatory_blocks_present: context.manifest.mandatory_blocks_present },
    redaction: { applied_before_serialization: true, raw_payloads_exported: false,
      source_redactions: [...context.manifest.redactions] },
    truncation: { applied: context.manifest.truncations.length > 0,
      omitted_optional_count: context.manifest.omissions.length, reasons: [...context.manifest.truncations] }
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
      missing_evidence: overlay.missing_evidence, escalation_reasons: overlay.escalation_reasons,
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
    truncation: { applied: routingRefs.length > boundedRoutingRefs.length || context.manifest.truncations.length > 0,
      omitted_optional_count: routingRefs.length - boundedRoutingRefs.length + context.manifest.omissions.length,
      reasons: [...context.manifest.truncations, ...(overlay.truncations ?? [])] }
  });
}
