import { canonicalJson, sha256Hex } from "./evidence-types";

export type ReviewFindingClass =
  | "PLAN_BLOCKER"
  | "IMPLEMENTATION_DISCRETION"
  | "IMPLEMENTATION_REVIEW_CHECK"
  | "DEFERRED_DEBT";

export interface PlanningLensFindingV1 {
  finding_id: string;
  classification: ReviewFindingClass;
  summary: string;
  primary_lens: "plan-review" | "architecture-review" | "db-storage-review";
  secondary_lenses: Array<"plan-review" | "architecture-review" | "db-storage-review">;
  decision_ids: string[];
  trace_ids: string[];
}

export interface PlanningLensResultV1 {
  schema_version: "phase-23.9.planning-lens-result.v1";
  procedure_id: "plan-review" | "architecture-review" | "db-storage-review";
  bundle_kind: "candidate" | "impact_closure";
  plan_sha: `sha256:${string}`;
  source_head: string;
  task_artifact_id: `sha256:${string}`;
  immutable_base: string;
  verdict: "PASS" | "AMEND_REQUIRED" | "BLOCKED";
  findings: PlanningLensFindingV1[];
  covered_decision_ids: string[];
  covered_trace_ids: string[];
  output_contract_id: string;
}

export function aggregatePlanBlockers(results: PlanningLensResultV1[]): {
  aggregate_id: `sha256:${string}`;
  source_result_ids: string[];
  findings: PlanningLensFindingV1[];
} {
  if (results.length === 0) throw new Error("planning_finding_aggregate_empty");
  const identity = {
    plan_sha: results[0].plan_sha,
    source_head: results[0].source_head,
    task_artifact_id: results[0].task_artifact_id,
    immutable_base: results[0].immutable_base
  };
  for (const result of results) {
    for (const [field, expected] of Object.entries(identity)) {
      if (result[field as keyof PlanningLensResultV1] !== expected) {
        throw new Error(`planning_bundle_identity_mismatch:${field}`);
      }
    }
  }
  const findings = results.flatMap((result) => result.findings)
    .filter((finding) => finding.classification === "PLAN_BLOCKER")
    .sort((a, b) => a.finding_id.localeCompare(b.finding_id));
  if (new Set(findings.map((entry) => entry.finding_id)).size !== findings.length) {
    throw new Error("planning_finding_duplicate");
  }
  const sourceResultIds = results.map((result) => `sha256:${sha256Hex(canonicalJson(result))}`).sort();
  const aggregate = { source_result_ids: sourceResultIds, findings };
  return { aggregate_id: `sha256:${sha256Hex(canonicalJson(aggregate))}`, ...aggregate };
}

export function reconcilePlanningLenses(
  results: PlanningLensResultV1[],
  requiredDecisionIds: string[],
  requiredTraceIds: string[]
): "REVIEW_COVERAGE_COMPLETE" {
  const expected = ["architecture-review", "db-storage-review", "plan-review"];
  const procedures = results.map((result) => result.procedure_id).sort();
  if (canonicalJson(procedures) !== canonicalJson(expected)) throw new Error("planning_lens_cardinality_invalid");
  if (results.some((result) => result.verdict !== "PASS")) throw new Error("planning_lens_non_pass");
  aggregatePlanBlockers(results);
  const coveredDecisions = new Set(results.flatMap((result) => result.covered_decision_ids));
  const coveredTraces = new Set(results.flatMap((result) => result.covered_trace_ids));
  const missing = [
    ...requiredDecisionIds.filter((id) => !coveredDecisions.has(id)),
    ...requiredTraceIds.filter((id) => !coveredTraces.has(id))
  ].sort();
  if (missing.length) throw new Error(`planning_review_coverage_incomplete:${missing.join(",")}`);
  return "REVIEW_COVERAGE_COMPLETE";
}
