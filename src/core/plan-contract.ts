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

const LENSES = ["plan-review", "architecture-review", "db-storage-review"] as const;
const FINDING_CLASSES: ReviewFindingClass[] = [
  "PLAN_BLOCKER",
  "IMPLEMENTATION_DISCRETION",
  "IMPLEMENTATION_REVIEW_CHECK",
  "DEFERRED_DEBT"
];

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())
    || new Set(value).size !== value.length) {
    throw new Error(`planning_lens_${label}_invalid`);
  }
}

export function validatePlanningLensResult(value: unknown): PlanningLensResultV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("planning_lens_result_invalid");
  }
  const result = value as PlanningLensResultV1;
  if (result.schema_version !== "phase-23.9.planning-lens-result.v1"
    || !LENSES.includes(result.procedure_id)
    || !["candidate", "impact_closure"].includes(result.bundle_kind)
    || !/^sha256:[a-f0-9]{64}$/u.test(result.plan_sha)
    || !/^[a-f0-9]{40}$/u.test(result.source_head)
    || !/^sha256:[a-f0-9]{64}$/u.test(result.task_artifact_id)
    || !/^[a-f0-9]{40}$/u.test(result.immutable_base)
    || !["PASS", "AMEND_REQUIRED", "BLOCKED"].includes(result.verdict)
    || typeof result.output_contract_id !== "string" || !result.output_contract_id.trim()
    || !Array.isArray(result.findings)) {
    throw new Error("planning_lens_result_contract_invalid");
  }
  assertStringArray(result.covered_decision_ids, "covered_decisions");
  assertStringArray(result.covered_trace_ids, "covered_traces");
  for (const finding of result.findings) {
    if (!finding || typeof finding !== "object"
      || typeof finding.finding_id !== "string" || !finding.finding_id.trim()
      || !FINDING_CLASSES.includes(finding.classification)
      || typeof finding.summary !== "string" || !finding.summary.trim()
      || !LENSES.includes(finding.primary_lens)
      || !Array.isArray(finding.secondary_lenses)
      || finding.secondary_lenses.some((lens) => !LENSES.includes(lens))) {
      throw new Error("planning_lens_finding_contract_invalid");
    }
    assertStringArray(finding.decision_ids, "finding_decisions");
    assertStringArray(finding.trace_ids, "finding_traces");
  }
  assertStringArray(result.findings.map((finding) => finding.finding_id), "finding_ids");
  return result;
}

export function aggregatePlanBlockers(results: PlanningLensResultV1[]): {
  aggregate_id: `sha256:${string}`;
  source_result_ids: string[];
  findings: PlanningLensFindingV1[];
} {
  if (results.length === 0) throw new Error("planning_finding_aggregate_empty");
  results.forEach(validatePlanningLensResult);
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
