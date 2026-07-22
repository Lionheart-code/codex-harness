import { createHash } from "node:crypto";
import { canonicalReviewPolicyJson } from "./self-hosting-review-policy";

export type EvaluationMode = "approved" | "shadow" | "replay" | "canary";
export type RoutingDecisionKind = "authorize_canary" | "promote" | "reject" | "rollback";

export interface ReviewReplayPacket {
  record_kind: "review_replay_packet";
  record_id: string;
  run_instance_id: string;
  source_run_id: string;
  procedure_id: "plan-review" | "implementation-review";
  pass_kind: string;
  request_payload_id: string;
  request_content_hash: string;
  context_core_id: string;
  context_core_hash: string;
  context_manifest_id: string;
  context_manifest_hash: string;
  delta_overlay_id: string;
  delta_overlay_hash: string;
  approved_attempt_id: string;
  route_decision_id: string;
  policy_version: string;
  binding_version: string;
  accepted_artifact_id: string;
  accepted_result_id: string;
  source_snapshot: string;
  immutable_base: string;
  risk_classes: string[];
  retention_class: "accepted" | "audit";
  redaction_status: "not_redacted" | "redacted";
  payload_ids: string[];
  created_at: string;
}

export interface RoutingEvaluationCaseResult {
  case_id: string;
  procedure_id: "plan-review" | "implementation-review";
  pass_kind: string;
  risk_classes: string[];
  baseline_attempt_id: string;
  candidate_attempt_id: string;
  expected_critical_findings: string[];
  actual_critical_findings: string[];
  baseline_verdict: string;
  candidate_verdict: string;
  legal_lifecycle: boolean;
  independence_preserved: boolean;
  output_valid: boolean;
  evidence_valid: boolean;
  baseline_fix_passes: number;
  candidate_fix_passes: number;
  baseline_total_tokens?: number;
  candidate_total_tokens?: number;
  baseline_cost?: number;
  candidate_cost?: number;
  rate_card_version?: string;
  baseline_observation_record_id: string;
  candidate_observation_record_id: string;
  candidate_output_hash: string;
  context_core_id: string;
  context_manifest_id: string;
  delta_overlay_id: string;
}

export interface ReviewRoutingEvaluationBundle {
  schema_version: 1;
  producer_command: string;
  contract_version: string;
  evaluation_id: string;
  evaluation_host_run_instance_id: string;
  source_run_instance_id: string;
  source_lifecycle_status: "closed" | "harvested" | "discarded" | "active";
  source_packet_artifact_id: string;
  source_approved_attempt_id: string;
  evaluation_mode: "shadow" | "replay" | "canary";
  policy_version: string;
  binding_version: string;
  candidate_profile_id: string;
  canary_authorization_id?: string;
  canary_invocation_count?: number;
  canary_closed?: boolean;
  cases: RoutingEvaluationCaseResult[];
  created_at: string;
}

export interface PromotionGateResult {
  accepted: boolean;
  rejection_reasons: string[];
}

export function validateRoutingEvaluationBundle(value: unknown): ReviewRoutingEvaluationBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Routing evaluation bundle must be an object.");
  const bundle = value as ReviewRoutingEvaluationBundle;
  if (bundle.schema_version !== 1 || !bundle.evaluation_id || !bundle.policy_version
    || !bundle.binding_version || !bundle.candidate_profile_id || !Array.isArray(bundle.cases) || bundle.cases.length === 0) {
    throw new Error("Routing evaluation bundle is incomplete.");
  }
  if (bundle.evaluation_mode === "replay" && bundle.source_lifecycle_status === "active") {
    throw new Error("Historical replay source must be closed, harvested, or evaluation-only discarded.");
  }
  if (bundle.evaluation_host_run_instance_id === bundle.source_run_instance_id && bundle.evaluation_mode === "replay") {
    throw new Error("Replay evaluation host and historical source run instances must differ.");
  }
  const caseIds = new Set<string>();
  for (const entry of bundle.cases) {
    for (const field of ["case_id", "procedure_id", "pass_kind", "baseline_attempt_id", "candidate_attempt_id", "baseline_observation_record_id", "candidate_observation_record_id", "candidate_output_hash", "context_core_id", "context_manifest_id", "delta_overlay_id"] as const) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) throw new Error(`Routing evaluation case is missing ${field}.`);
    }
    if (caseIds.has(entry.case_id)) throw new Error(`Routing evaluation contains duplicate case_id ${entry.case_id}.`);
    if (!Array.isArray(entry.risk_classes) || entry.risk_classes.some((risk) => typeof risk !== "string" || !risk.trim())) {
      throw new Error(`Routing evaluation case ${entry.case_id} has invalid risk_classes.`);
    }
    caseIds.add(entry.case_id);
  }
  if (bundle.evaluation_mode === "canary" && (!bundle.canary_authorization_id || !bundle.canary_closed || !bundle.canary_invocation_count || bundle.canary_invocation_count < 1 || bundle.canary_invocation_count > 3)) {
    throw new Error("Post-canary evaluation must bind a closed authorization and 1-3 invocations.");
  }
  return bundle;
}

export function evaluatePromotionGates(bundle: ReviewRoutingEvaluationBundle): PromotionGateResult {
  const reasons: string[] = [];
  for (const entry of bundle.cases) {
    const expected = new Set(entry.expected_critical_findings);
    const actual = new Set(entry.actual_critical_findings);
    if ([...expected].some((finding) => !actual.has(finding))) reasons.push(`${entry.case_id}:critical_blocker_miss`);
    if (!entry.legal_lifecycle) reasons.push(`${entry.case_id}:illegal_lifecycle_progression`);
    if (!entry.independence_preserved) reasons.push(`${entry.case_id}:independence_violation`);
    if (!entry.output_valid || !entry.evidence_valid) reasons.push(`${entry.case_id}:output_or_evidence_failure`);
    if (entry.candidate_fix_passes > entry.baseline_fix_passes) reasons.push(`${entry.case_id}:additional_fix_pass`);
    if (entry.candidate_verdict !== entry.baseline_verdict && entry.expected_critical_findings.length > 0) reasons.push(`${entry.case_id}:critical_verdict_regression`);
    if (entry.baseline_cost !== undefined || entry.candidate_cost !== undefined) {
      if (!entry.rate_card_version || entry.baseline_cost === undefined || entry.candidate_cost === undefined) reasons.push(`${entry.case_id}:incomplete_rate_card_inputs`);
      else if (entry.candidate_cost >= entry.baseline_cost) reasons.push(`${entry.case_id}:full_run_cost_not_lower`);
    } else if (entry.baseline_total_tokens === undefined || entry.candidate_total_tokens === undefined) {
      reasons.push(`${entry.case_id}:usage_unavailable`);
    } else if (entry.candidate_total_tokens >= entry.baseline_total_tokens) {
      reasons.push(`${entry.case_id}:billed_tokens_not_lower`);
    }
  }
  return { accepted: reasons.length === 0, rejection_reasons: [...new Set(reasons)].sort() };
}

export function routingEvaluationId(bundle: Omit<ReviewRoutingEvaluationBundle, "evaluation_id">): string {
  return `routing-evaluation-${createHash("sha256").update(canonicalReviewPolicyJson(bundle)).digest("hex")}`;
}
