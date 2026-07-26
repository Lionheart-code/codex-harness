import { createHash } from "node:crypto";

export interface ContextSourceRef {
  path: string;
  content_hash: string;
  byte_count: number;
  required: boolean;
  retrieval_mode: "inline" | "read_only_reference";
}

export interface ContextCoreInput {
  task_id: string;
  task_pointer_ref: string;
  task_contract_ref: string;
  approved_plan_ref: string;
  procedure_contract_refs: string[];
  review_tier: string;
  changed_surface_classes: string[];
  risk_classes: string[];
  run_id: string;
  run_instance_id: string;
  branch: string;
  worktree_ref: string;
  source_snapshot: string;
  immutable_base: string;
  architectural_invariants: string[];
  non_goals: string[];
  acceptance_refs: string[];
  verification_refs: string[];
  source_provenance: ContextSourceRef[];
  size_budget_bytes: number;
  redactions?: string[];
  truncations?: string[];
}

export interface ContextCore extends ContextCoreInput {
  context_core_id: string;
  content_hash: string;
  canonical_byte_count: number;
}

export interface ContextManifest {
  context_manifest_id: string;
  context_core_id: string;
  ordered_sources: ContextSourceRef[];
  mandatory_blocks_present: string[];
  omissions: string[];
  redactions: string[];
  truncations: string[];
  retrieval_capabilities: string[];
  content_hash: string;
  canonical_byte_count: number;
}

export type FindingDisposition = "open" | "claimed_fixed" | "closed" | "superseded";

export interface ReviewDeltaOverlayInput {
  context_core_id: string;
  reviewed_candidate_id: string;
  changed_files: string[];
  diff_refs: string[];
  payload_refs: string[];
  prior_review_result_ref?: string;
  findings: Array<{ finding_id: string; disposition: FindingDisposition }>;
  verification_refs: string[];
  changed_authority_surfaces: string[];
  changed_architecture_surfaces: string[];
  missing_evidence: string[];
  escalation_reasons: string[];
  size_budget_bytes: number;
  truncations?: string[];
}

export interface ReviewDeltaOverlay extends ReviewDeltaOverlayInput {
  delta_overlay_id: string;
  content_hash: string;
  canonical_byte_count: number;
}

export const DIRECT_REVIEWER_POLICY_BLOCK = [
  "## Mandatory Direct Reviewer Contract",
  "",
  "You are the already-launched independent reviewer. Produce the canonical procedure artifact directly as your final response.",
  "Do not run `run launch-review`, `launch-review`, or `codex exec`.",
  "Do not create, delegate to, or wait on another reviewer, task, session, or agent.",
  "Do not wait, poll, or test for the supervisor's configured output path; the outer Harness writes your final response there."
].join("\n");

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

export function canonicalContextJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedStrings(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))].sort();
}

function normalizedSources(values: ContextSourceRef[]): ContextSourceRef[] {
  return [...values].sort((left, right) => left.path.localeCompare(right.path) || left.content_hash.localeCompare(right.content_hash));
}

export function buildContextCore(input: ContextCoreInput): ContextCore {
  const requiredStrings = [
    input.task_id, input.task_pointer_ref, input.task_contract_ref, input.approved_plan_ref,
    input.run_id, input.run_instance_id, input.branch, input.worktree_ref, input.source_snapshot, input.immutable_base
  ];
  if (requiredStrings.some((entry) => !entry.trim())) {
    throw new Error("CONTEXT_MANDATORY_BLOCK_MISSING: context core identity is incomplete.");
  }
  if (input.worktree_ref.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(input.worktree_ref)
    || input.source_provenance.some((entry) => entry.path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(entry.path))) {
    throw new Error("CONTEXT_INCIDENTAL_ABSOLUTE_PATH_FORBIDDEN: content identities require repo-relative references.");
  }
  if (!Number.isInteger(input.size_budget_bytes) || input.size_budget_bytes <= 0) {
    throw new Error("Context core size budget must be a positive integer.");
  }
  const normalized: ContextCoreInput = {
    ...input,
    procedure_contract_refs: normalizedStrings(input.procedure_contract_refs),
    changed_surface_classes: normalizedStrings(input.changed_surface_classes),
    risk_classes: normalizedStrings(input.risk_classes),
    architectural_invariants: normalizedStrings(input.architectural_invariants),
    non_goals: normalizedStrings(input.non_goals),
    acceptance_refs: normalizedStrings(input.acceptance_refs),
    verification_refs: normalizedStrings(input.verification_refs),
    source_provenance: normalizedSources(input.source_provenance),
    redactions: normalizedStrings(input.redactions ?? []),
    truncations: normalizedStrings(input.truncations ?? [])
  };
  const canonical = canonicalContextJson(normalized);
  const byteCount = Buffer.byteLength(canonical, "utf8");
  if (byteCount > input.size_budget_bytes) {
    throw new Error(`CONTEXT_BUDGET_EXCEEDED: mandatory context core is ${byteCount} bytes, budget is ${input.size_budget_bytes}.`);
  }
  const digest = hash(canonical);
  return { ...normalized, context_core_id: `context-core-${digest}`, content_hash: `sha256:${digest}`, canonical_byte_count: byteCount };
}

export function buildContextManifest(core: ContextCore, options: {
  omissions?: string[];
  retrieval_capabilities?: string[];
} = {}): ContextManifest {
  const requiredSources = core.source_provenance.filter((entry) => entry.required);
  if (requiredSources.some((entry) => !entry.content_hash || entry.byte_count < 0)) {
    throw new Error("CONTEXT_MANDATORY_BLOCK_MISSING: required source identity is incomplete.");
  }
  const base = {
    context_core_id: core.context_core_id,
    ordered_sources: normalizedSources(core.source_provenance),
    mandatory_blocks_present: ["task_pointer", "task_contract", "approved_plan", "run_identity", "review_contract", "acceptance"],
    omissions: normalizedStrings(options.omissions ?? []),
    redactions: normalizedStrings(core.redactions ?? []),
    truncations: normalizedStrings(core.truncations ?? []),
    retrieval_capabilities: normalizedStrings(options.retrieval_capabilities ?? ["repo_read_only"])
  };
  const canonical = canonicalContextJson(base);
  const digest = hash(canonical);
  return { ...base, context_manifest_id: `context-manifest-${digest}`, content_hash: `sha256:${digest}`, canonical_byte_count: Buffer.byteLength(canonical) };
}

export function buildReviewDeltaOverlay(input: ReviewDeltaOverlayInput): ReviewDeltaOverlay {
  if (!input.context_core_id || !input.reviewed_candidate_id) {
    throw new Error("Review delta overlay requires core and candidate identity.");
  }
  const normalized: ReviewDeltaOverlayInput = {
    ...input,
    changed_files: normalizedStrings(input.changed_files),
    diff_refs: normalizedStrings(input.diff_refs),
    payload_refs: normalizedStrings(input.payload_refs),
    findings: [...input.findings].sort((left, right) => left.finding_id.localeCompare(right.finding_id)),
    verification_refs: normalizedStrings(input.verification_refs),
    changed_authority_surfaces: normalizedStrings(input.changed_authority_surfaces),
    changed_architecture_surfaces: normalizedStrings(input.changed_architecture_surfaces),
    missing_evidence: normalizedStrings(input.missing_evidence),
    escalation_reasons: normalizedStrings(input.escalation_reasons),
    truncations: normalizedStrings(input.truncations ?? [])
  };
  const canonical = canonicalContextJson(normalized);
  const byteCount = Buffer.byteLength(canonical);
  if (byteCount > input.size_budget_bytes) {
    throw new Error(`CONTEXT_DELTA_BUDGET_EXCEEDED: delta is ${byteCount} bytes, budget is ${input.size_budget_bytes}.`);
  }
  const digest = hash(canonical);
  return { ...normalized, delta_overlay_id: `review-delta-${digest}`, content_hash: `sha256:${digest}`, canonical_byte_count: byteCount };
}

export function assembleReviewRequest(input: {
  operator_request: string;
  context_core: ContextCore;
  context_manifest: ContextManifest;
  delta_overlay: ReviewDeltaOverlay;
  procedure_contract_ref: string;
  route_decision_id: string;
}): string {
  return [
    DIRECT_REVIEWER_POLICY_BLOCK,
    "",
    "## Review Packet Identity",
    "",
    `- context core: \`${input.context_core.context_core_id}\` (${input.context_core.content_hash})`,
    `- context manifest: \`${input.context_manifest.context_manifest_id}\` (${input.context_manifest.content_hash})`,
    `- delta overlay: \`${input.delta_overlay.delta_overlay_id}\` (${input.delta_overlay.content_hash})`,
    `- procedure contract: \`${input.procedure_contract_ref}\``,
    `- route decision: \`${input.route_decision_id}\``,
    "",
    "## Operator Request",
    "",
    input.operator_request.trim()
  ].join("\n").trimEnd() + "\n";
}
