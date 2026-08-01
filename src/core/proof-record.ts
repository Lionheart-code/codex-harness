import { canonicalJson, sha256Hex } from "./evidence-types";

export type EvidenceGapCause =
  | "legacy_absent" | "producer_unavailable" | "artifact_missing"
  | "join_missing" | "join_ambiguous" | "artifact_invalid"
  | "verification_failed" | "review_non_pass" | "delivery_fact_missing"
  | "policy_forbidden" | "corrupt_record" | "attempt_missing"
  | "attempt_non_success" | "attempt_ambiguous" | "profile_unavailable"
  | "not_recorded" | "redacted";

export interface EvidenceRefV1 {
  ref_id: `sha256:${string}`;
  source_kind: "staging_record" | "procedure_artifact" | "delivery_fact" | "git_object" | "owner_directive";
  source_id: string;
  content_hash: `sha256:${string}`;
  run_instance_id: string | null;
  locator: string;
  relationship: "verifies_requirement" | "supports_assumption" | "resolves_assumption"
    | "describes_environment" | "authorizes_delivery_slice" | "explains_gap";
}

export interface TaskVerifiabilityEntryV1 {
  requirement_id: string;
  source: RequirementSourceV1;
  applicability: "mandatory" | "not_applicable";
  verification_status: "verified" | "blocked" | "not_applicable";
  applicability_authority_ref_id: string | null;
  evidence_ref_ids: string[];
  gap_ids: string[];
  assumption_ids: string[];
}

export interface RequirementSourceV1 {
  task_artifact_id: `sha256:${string}`;
  requirement_kind: "scope_clause" | "required_concept" | "required_narrowing"
    | "deferred_boundary" | "acceptance_command" | "acceptance_behavior"
    | "future_phase_boundary" | "foundation_constraint" | "schema_authority_constraint";
  normalized_heading_path: string;
  heading_path_hash: `sha256:${string}`;
  block_content_hash: `sha256:${string}`;
  duplicate_index: number;
  byte_start: number;
  byte_end: number;
}

const REQUIREMENT_HEADINGS = new Map<string, RequirementSourceV1["requirement_kind"]>([
  ["Scope", "scope_clause"],
  ["Required concepts", "required_concept"],
  ["Required narrowing", "required_narrowing"],
  ["Defer", "deferred_boundary"],
  ["Acceptance behavior", "acceptance_behavior"],
  ["Future-phase impact check", "future_phase_boundary"],
  ["Use existing repo foundations", "foundation_constraint"],
  ["Schema status", "schema_authority_constraint"]
]);

export interface ExtractedTaskRequirementV1 {
  requirement_id: `sha256:${string}`;
  source: RequirementSourceV1;
  normalized_block_text: string;
}

export function extractTaskRequirements(taskBytes: Buffer): ExtractedTaskRequirementV1[] {
  const text = taskBytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(taskBytes) !== 0) throw new Error("task_requirement_invalid_utf8");
  const taskArtifactId = `sha256:${sha256Hex(taskBytes)}` as const;
  const lines = [...text.matchAll(/.*(?:\r?\n|$)/gu)]
    .map((match) => ({
      raw: match[0],
      text: match[0].replace(/\r?\n$/u, ""),
      start: match.index ?? 0,
      end: (match.index ?? 0) + Buffer.byteLength(match[0], "utf8")
    }))
    .filter((line) => line.raw.length > 0);
  const headingCounts = new Map<string, number>();
  const headingStack: string[] = [];
  let activeKind: RequirementSourceV1["requirement_kind"] | undefined;
  let activeHeadingPath = "";
  let acceptanceFence = false;
  let acceptanceFenceCount = 0;
  const rawBlocks: Array<{
    kind: RequirementSourceV1["requirement_kind"];
    headingPath: string;
    text: string;
    start: number;
    end: number;
  }> = [];
  let paragraph: typeof rawBlocks[number] | undefined;
  const flushParagraph = (): void => {
    if (!paragraph) return;
    paragraph.text = paragraph.text.normalize("NFC").replace(/[ \t]+$/gmu, "");
    if (paragraph.text.trim()) rawBlocks.push(paragraph);
    paragraph = undefined;
  };
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.+?)\s*$/u.exec(line.text);
    if (heading) {
      flushParagraph();
      acceptanceFence = false;
      const depth = heading[1].length;
      const name = heading[2].normalize("NFC");
      headingStack.splice(depth - 2);
      headingStack[depth - 2] = name;
      activeHeadingPath = headingStack.filter(Boolean).join(" > ");
      activeKind = REQUIREMENT_HEADINGS.get(name) ?? REQUIREMENT_HEADINGS.get(headingStack[0]);
      if (REQUIREMENT_HEADINGS.has(name) || name === "Acceptance commands") {
        headingCounts.set(name, (headingCounts.get(name) ?? 0) + 1);
      }
      continue;
    }
    const inAcceptanceCommands = headingStack[0] === "Acceptance commands";
    if (inAcceptanceCommands && /^```/u.test(line.text.trim())) {
      flushParagraph();
      acceptanceFence = !acceptanceFence;
      if (acceptanceFence) acceptanceFenceCount += 1;
      continue;
    }
    if (inAcceptanceCommands && acceptanceFence) {
      if (line.text.trim()) rawBlocks.push({
        kind: "acceptance_command",
        headingPath: activeHeadingPath,
        text: line.text.trim().normalize("NFC"),
        start: line.start,
        end: line.end
      });
      continue;
    }
    if (!activeKind || !line.text.trim()) {
      flushParagraph();
      continue;
    }
    if (/^\s*(?:[-*+]|\d+\.)\s+/u.test(line.text)) {
      flushParagraph();
      rawBlocks.push({
        kind: activeKind,
        headingPath: activeHeadingPath,
        text: line.text.trim().normalize("NFC"),
        start: line.start,
        end: line.end
      });
      continue;
    }
    if (!paragraph) {
      paragraph = {
        kind: activeKind,
        headingPath: activeHeadingPath,
        text: line.text.trim(),
        start: line.start,
        end: line.end
      };
    } else {
      paragraph.text += `\n${line.text.trim()}`;
      paragraph.end = line.end;
    }
  }
  flushParagraph();
  for (const heading of [...REQUIREMENT_HEADINGS.keys(), "Acceptance commands"]) {
    if (headingCounts.get(heading) !== 1) throw new Error(`task_requirement_heading_cardinality_invalid:${heading}`);
  }
  if (acceptanceFenceCount !== 1) throw new Error("task_requirement_acceptance_fence_cardinality_invalid");
  const duplicateCounts = new Map<string, number>();
  return rawBlocks.map((block) => {
    const headingPathHash = `sha256:${sha256Hex(block.headingPath)}` as const;
    const blockContentHash = `sha256:${sha256Hex(canonicalJson({
      requirement_kind: block.kind,
      normalized_heading_path: block.headingPath,
      normalized_block_text: block.text
    }))}` as const;
    const duplicateKey = `${block.kind}:${headingPathHash}:${blockContentHash}`;
    const duplicateIndex = (duplicateCounts.get(duplicateKey) ?? 0) + 1;
    duplicateCounts.set(duplicateKey, duplicateIndex);
    const source: RequirementSourceV1 = {
      task_artifact_id: taskArtifactId,
      requirement_kind: block.kind,
      normalized_heading_path: block.headingPath,
      heading_path_hash: headingPathHash,
      block_content_hash: blockContentHash,
      duplicate_index: duplicateIndex,
      byte_start: block.start,
      byte_end: block.end
    };
    return {
      requirement_id: `sha256:${sha256Hex(canonicalJson({
        task_artifact_id: taskArtifactId,
        requirement_kind: block.kind,
        heading_path_hash: headingPathHash,
        block_content_hash: blockContentHash,
        duplicate_index: duplicateIndex
      }))}` as const,
      source,
      normalized_block_text: block.text
    };
  }).sort((left, right) => left.requirement_id.localeCompare(right.requirement_id));
}

export interface AssumptionLedgerEntryV1 {
  assumption_id: string;
  statement: string;
  requirement_ids: string[];
  source_authority_ref_id: string;
  status: "open" | "resolved" | "rejected";
  resolution_ref_id: string | null;
  evidence_ref_ids: string[];
}

export interface GapOwnerRefV1 {
  owner_kind: "task_requirement" | "evidence_family" | "operating_envelope_field" | "operating_envelope_attempt";
  owner_id: string;
  slot: string;
}

export interface EvidenceGapV1 {
  gap_id: string;
  family: string;
  requirement_ids: string[];
  underlying_requirement: "mandatory" | "optional";
  cause: EvidenceGapCause;
  blocking: boolean;
  evidence_ref_ids: string[];
  owner_refs: GapOwnerRefV1[];
  detail: string;
  detected_by: "proof_record_deriver_v1" | "task_requirement_extractor_v1"
    | "operating_envelope_deriver_v1" | "evidence_join_validator_v1";
  created_at: string;
}

export interface ProofAcceptanceV1 {
  status: "accepted" | "rejected";
  blocking_requirement_ids: string[];
  blocking_gap_ids: string[];
  open_assumption_ids: string[];
  evaluated_by: "phase-23.9.proof-validator.v1";
  evaluated_at: string;
}

export interface EnvelopeFieldV1 {
  field_id: `sha256:${string}`;
  field_name: "host_os" | "host_arch" | "node_version" | "network_access"
    | "adapter" | "provider" | "model" | "reasoning" | "sandbox" | "approval_policy";
  status: "observed" | "declared" | "unavailable";
  value: string | null;
  evidence_ref_id: string | null;
  gap_id: string | null;
  unavailable_cause: EvidenceGapCause | null;
}

export interface ReviewOperatingContextV1 {
  context_id: `sha256:${string}`;
  selection_role: "planning_candidate" | "planning_closure" | "implementation_review" | "fix_pass_review";
  procedure_id: string;
  availability: "selected" | "unavailable";
  cohort_id: string | null;
  attempt_id: string | null;
  terminal_event_id: string | null;
  artifact_id: string | null;
  source_plan_sha: `sha256:${string}` | null;
  carry_forward_ref_id: string | null;
  fields: EnvelopeFieldV1[];
  selection_gap_ids: string[];
}

export interface PlanningReviewLineageV1 {
  lineage_id: `sha256:${string}`;
  target_plan_sha: `sha256:${string}`;
  direct_closure_cohort_id: string | null;
  contributing_context_ids: string[];
  lens_map: Array<{
    procedure_id: "plan-review" | "architecture-review" | "db-storage-review";
    context_id: string;
    source_kind: "direct" | "carried";
    carry_forward_ref_id: string | null;
  }>;
}

export interface OperatingEnvelopeV1 {
  schema_version: "phase-23.9.operating-envelope.v1";
  producer_id: "proof_record_deriver_v1";
  run_start_ref_id: string;
  runtime_fields: EnvelopeFieldV1[];
  planning_lineage: PlanningReviewLineageV1;
  review_contexts: ReviewOperatingContextV1[];
  gap_ids: string[];
}

export interface DeliverySliceV1 {
  slice_id: `sha256:${string}`;
  classification: "active_task" | "owner_approved_supporting";
  authority_ref_id: string;
  exact_paths: string[];
  requirement_ids: string[];
  acceptance_ref_ids: string[];
}

export interface EvidenceFamilyStatusV1 {
  family: string;
  applicability: "mandatory" | "optional" | "not_applicable" | "unavailable_legacy" | "unavailable_error";
  ref_ids: string[];
  gap_ids: string[];
}

export interface ProofRecordV1 {
  schema_version: "phase-23.9.proof-record.v1";
  record_kind: "proof_record";
  record_id: `sha256:${string}`;
  content_hash: `sha256:${string}`;
  proof_input_hash: `sha256:${string}`;
  run_instance_id: string;
  run_id: string;
  task_artifact_id: `sha256:${string}`;
  immutable_base: string;
  activation_hash: `sha256:${string}`;
  activation_source_head: string;
  implementation_baseline_head: string | null;
  final_reviewed_source_head: string | null;
  delivered_source_head: string | null;
  eligibility_snapshot_id: `sha256:${string}`;
  lifecycle_applicability: unknown;
  task_verifiability_map: TaskVerifiabilityEntryV1[];
  evidence_refs: EvidenceRefV1[];
  evidence_families: EvidenceFamilyStatusV1[];
  assumption_ledger: AssumptionLedgerEntryV1[];
  operating_envelope: OperatingEnvelopeV1;
  delivery_slices: DeliverySliceV1[];
  delivery_slice_manifest_hash: `sha256:${string}`;
  evidence_gaps: EvidenceGapV1[];
  acceptance: ProofAcceptanceV1;
  created_at: string;
}

function withoutKeys<T extends Record<string, unknown>>(value: T, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`proof_duplicate_${label}`);
}

function validateOperatingEnvelope(envelope: OperatingEnvelopeV1, gaps: EvidenceGapV1[]): void {
  if (envelope.schema_version !== "phase-23.9.operating-envelope.v1"
    || envelope.producer_id !== "proof_record_deriver_v1") {
    throw new Error("proof_operating_envelope_contract_invalid");
  }
  const runtimeNames = envelope.runtime_fields.map((field) => field.field_name).sort();
  if (canonicalJson(runtimeNames) !== canonicalJson(["host_arch", "host_os", "network_access", "node_version"])) {
    throw new Error("proof_runtime_envelope_field_cardinality_invalid");
  }
  const gapById = new Map(gaps.map((gap) => [gap.gap_id, gap]));
  for (const field of [
    ...envelope.runtime_fields,
    ...envelope.review_contexts.flatMap((context) => context.fields)
  ]) {
    if (field.status === "unavailable") {
      if (field.value !== null || field.evidence_ref_id !== null || !field.gap_id || !field.unavailable_cause
        || gapById.get(field.gap_id)?.cause !== field.unavailable_cause) {
        throw new Error(`proof_unavailable_envelope_field_invalid:${field.field_id}`);
      }
    } else if (!field.value || !field.evidence_ref_id || field.gap_id !== null || field.unavailable_cause !== null) {
      throw new Error(`proof_available_envelope_field_invalid:${field.field_id}`);
    }
  }
  for (const context of envelope.review_contexts) {
    const joins = [
      context.cohort_id, context.attempt_id, context.terminal_event_id,
      context.artifact_id, context.source_plan_sha, context.carry_forward_ref_id
    ];
    if (context.availability === "unavailable") {
      if (joins.some((value) => value !== null) || context.fields.length !== 0
        || context.selection_gap_ids.length !== 1 || !gapById.has(context.selection_gap_ids[0])) {
        throw new Error(`proof_unavailable_review_context_invalid:${context.context_id}`);
      }
    } else if (!context.attempt_id || !context.terminal_event_id || !context.artifact_id
      || !context.source_plan_sha || context.fields.length !== 6 || context.selection_gap_ids.length !== 0) {
      throw new Error(`proof_selected_review_context_invalid:${context.context_id}`);
    }
  }
  assertUnique(envelope.gap_ids, "operating_envelope_gap");
  for (const gapId of envelope.gap_ids) if (!gapById.has(gapId)) throw new Error(`proof_envelope_gap_missing:${gapId}`);
}

function validateDeliverySlices(slices: DeliverySliceV1[]): void {
  const allPaths = slices.flatMap((slice) => slice.exact_paths);
  assertUnique(allPaths, "delivery_path");
  for (const slice of slices) {
    if (!slice.authority_ref_id || slice.exact_paths.length === 0
      || (slice.classification === "active_task" && slice.requirement_ids.length === 0)
      || (slice.classification === "owner_approved_supporting" && slice.requirement_ids.length !== 0)) {
      throw new Error(`proof_delivery_slice_invalid:${slice.slice_id}`);
    }
    const expected = `sha256:${sha256Hex(canonicalJson(withoutKeys({ ...slice }, ["slice_id"])))}`;
    if (slice.slice_id !== expected) throw new Error(`proof_delivery_slice_identity_invalid:${slice.slice_id}`);
  }
}

export function deriveProofAcceptance(
  requirements: TaskVerifiabilityEntryV1[],
  gaps: EvidenceGapV1[],
  assumptions: AssumptionLedgerEntryV1[],
  evaluatedAt = new Date().toISOString()
): ProofAcceptanceV1 {
  const blockingRequirementIds = requirements
    .filter((entry) => entry.applicability === "mandatory" && entry.verification_status !== "verified")
    .map((entry) => entry.requirement_id).sort();
  const blockingGapIds = gaps.filter((entry) => entry.blocking).map((entry) => entry.gap_id).sort();
  const openAssumptionIds = assumptions.filter((entry) => entry.status === "open").map((entry) => entry.assumption_id).sort();
  return {
    status: blockingRequirementIds.length || blockingGapIds.length || openAssumptionIds.length ? "rejected" : "accepted",
    blocking_requirement_ids: blockingRequirementIds,
    blocking_gap_ids: blockingGapIds,
    open_assumption_ids: openAssumptionIds,
    evaluated_by: "phase-23.9.proof-validator.v1",
    evaluated_at: evaluatedAt
  };
}

export function buildProofRecord(
  input: Omit<ProofRecordV1, "schema_version" | "record_kind" | "record_id" | "content_hash"
    | "proof_input_hash" | "delivery_slice_manifest_hash" | "acceptance">
): ProofRecordV1 {
  const ids = [input.implementation_baseline_head, input.final_reviewed_source_head, input.delivered_source_head];
  const acceptance = deriveProofAcceptance(input.task_verifiability_map, input.evidence_gaps, input.assumption_ledger);
  if (ids.some((value) => value === null)) {
    acceptance.status = "rejected";
  }
  for (const gap of input.evidence_gaps) {
    if (gap.blocking !== (gap.underlying_requirement === "mandatory") || gap.owner_refs.length === 0) {
      throw new Error(`proof_gap_invalid:${gap.gap_id}`);
    }
  }
  assertUnique(input.task_verifiability_map.map((entry) => entry.requirement_id), "requirement");
  assertUnique(input.evidence_refs.map((entry) => entry.ref_id), "evidence_ref");
  assertUnique(input.evidence_gaps.map((entry) => entry.gap_id), "gap");
  for (const entry of input.task_verifiability_map) {
    if (entry.applicability === "not_applicable") {
      if (entry.verification_status !== "not_applicable" || !entry.applicability_authority_ref_id
        || entry.evidence_ref_ids.length || entry.gap_ids.length || entry.assumption_ids.length) {
        throw new Error(`proof_requirement_not_applicable_invalid:${entry.requirement_id}`);
      }
    } else if (entry.verification_status === "verified" && entry.evidence_ref_ids.length === 0) {
      throw new Error(`proof_requirement_evidence_missing:${entry.requirement_id}`);
    }
  }
  validateOperatingEnvelope(input.operating_envelope, input.evidence_gaps);
  validateDeliverySlices(input.delivery_slices);
  const deliverySliceManifestHash = `sha256:${sha256Hex(canonicalJson(input.delivery_slices))}` as const;
  const semantic = {
    eligibility_snapshot_id: input.eligibility_snapshot_id,
    lifecycle_applicability: input.lifecycle_applicability,
    task_verifiability_map: input.task_verifiability_map,
    evidence_refs: input.evidence_refs,
    evidence_families: input.evidence_families,
    assumption_ledger: input.assumption_ledger,
    operating_envelope: input.operating_envelope,
    delivery_slices: input.delivery_slices,
    evidence_gaps: input.evidence_gaps
  };
  const proofInputHash = `sha256:${sha256Hex(canonicalJson(semantic))}` as const;
  const identity = {
    schema_version: "phase-23.9.proof-record.v1",
    record_kind: "proof_record",
    run_instance_id: input.run_instance_id,
    task_artifact_id: input.task_artifact_id,
    immutable_base: input.immutable_base,
    activation_hash: input.activation_hash,
    activation_source_head: input.activation_source_head,
    implementation_baseline_head: input.implementation_baseline_head,
    final_reviewed_source_head: input.final_reviewed_source_head,
    delivered_source_head: input.delivered_source_head,
    eligibility_snapshot_id: input.eligibility_snapshot_id,
    proof_input_hash: proofInputHash
  };
  const recordId = `sha256:${sha256Hex(canonicalJson(identity))}` as const;
  const body = {
    schema_version: "phase-23.9.proof-record.v1" as const,
    record_kind: "proof_record" as const,
    record_id: recordId,
    content_hash: "sha256:" as `sha256:${string}`,
    proof_input_hash: proofInputHash,
    ...input,
    delivery_slice_manifest_hash: deliverySliceManifestHash,
    acceptance
  };
  body.content_hash = `sha256:${sha256Hex(canonicalJson(withoutKeys(body, ["record_id", "content_hash"])))}`;
  return body;
}
