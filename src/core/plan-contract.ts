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

export type PlanningCohortDisposition = "INCOMPLETE" | "PASS" | "AMEND_REQUIRED" | "BLOCKED" | "INVALID";

export interface PlanningCohortLensArtifactV1 {
  procedure_id: PlanningLensResultV1["procedure_id"];
  result: PlanningLensResultV1;
  artifact_id: `sha256:${string}`;
  artifact_content_hash: `sha256:${string}`;
  descriptor: {
    run_instance_id: string;
    run_id: string;
    procedure_id: string;
    artifact_id: string;
    content_hash: string;
    reviewed_plan_artifact_id?: string;
    reviewed_plan_content_hash?: string;
    provenance: {
      review_cohort_id?: unknown;
      reviewed_source_head?: unknown;
      task_artifact_id?: unknown;
      immutable_base?: unknown;
    };
  } | null;
}

export interface PlanningCohortDispositionResult {
  disposition: PlanningCohortDisposition;
  error_code?: string;
  missing_lenses: PlanningLensResultV1["procedure_id"][];
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

export function resolvePlanningCohortDisposition(input: {
  run_instance_id: string;
  run_id: string;
  task_artifact_id: `sha256:${string}`;
  effective_plan_artifact_id: `sha256:${string}`;
  effective_plan_content_hash: string;
  immutable_base: string;
  reviewed_source_head: string;
  required_lens_ids: PlanningLensResultV1["procedure_id"][];
  cohort_required_lens_ids: PlanningLensResultV1["procedure_id"][];
  attempt_required_lens_ids: PlanningLensResultV1["procedure_id"][];
  cohort_id: `sha256:${string}`;
  terminal_status: string;
  lenses: PlanningCohortLensArtifactV1[];
}): PlanningCohortDispositionResult {
  const required = input.required_lens_ids;
  const cohortRequired = input.cohort_required_lens_ids;
  const attemptRequired = input.attempt_required_lens_ids;
  const canonicalPlanningLenses = new Set(["plan-review", "architecture-review", "db-storage-review"]);
  if (new Set(required).size !== required.length
    || new Set(cohortRequired).size !== cohortRequired.length
    || new Set(attemptRequired).size !== attemptRequired.length
    || required.some((lens) => !canonicalPlanningLenses.has(lens))
    || cohortRequired.some((lens) => !canonicalPlanningLenses.has(lens))
    || attemptRequired.some((lens) => !canonicalPlanningLenses.has(lens))
    || canonicalJson(required) !== canonicalJson(cohortRequired)
    || canonicalJson(required) !== canonicalJson(attemptRequired)) {
    return { disposition: "INVALID", error_code: "planning_cohort_required_set_mismatch", missing_lenses: [] };
  }
  const missing = required.filter((procedureId) => !input.lenses.some((entry) => entry.procedure_id === procedureId));
  if (input.terminal_status !== "success") {
    return { disposition: "INCOMPLETE", missing_lenses: missing };
  }
  if (missing.length > 0 || input.lenses.length !== required.length) {
    return { disposition: "INVALID", error_code: "planning_cohort_terminal_artifact_missing", missing_lenses: missing };
  }
  if (canonicalJson(input.lenses.map((entry) => entry.procedure_id)) !== canonicalJson(required)) {
    return { disposition: "INVALID", error_code: "planning_cohort_required_set_mismatch", missing_lenses: [] };
  }
  try {
    for (const lens of input.lenses) {
      validatePlanningLensResult(lens.result);
      const descriptor = lens.descriptor;
      if (!descriptor
        || descriptor.run_instance_id !== input.run_instance_id
        || descriptor.run_id !== input.run_id
        || descriptor.procedure_id !== lens.procedure_id
        || descriptor.artifact_id !== lens.artifact_id
        || `sha256:${descriptor.content_hash}` !== lens.artifact_content_hash
        || lens.artifact_id !== lens.artifact_content_hash
        || descriptor.reviewed_plan_artifact_id !== input.effective_plan_artifact_id
        || descriptor.reviewed_plan_content_hash !== input.effective_plan_content_hash
        || descriptor.provenance.review_cohort_id !== input.cohort_id
        || descriptor.provenance.reviewed_source_head !== input.reviewed_source_head
        || descriptor.provenance.task_artifact_id !== input.task_artifact_id
        || descriptor.provenance.immutable_base !== input.immutable_base
        || lens.result.procedure_id !== lens.procedure_id
        || lens.result.plan_sha !== input.effective_plan_artifact_id
        || lens.result.source_head !== input.reviewed_source_head
        || lens.result.task_artifact_id !== input.task_artifact_id
        || lens.result.immutable_base !== input.immutable_base) {
        throw new Error("planning_cohort_identity_mismatch");
      }
    }
    aggregatePlanBlockers(input.lenses.map((entry) => entry.result));
  } catch (error) {
    return {
      disposition: "INVALID",
      error_code: error instanceof Error ? error.message : "planning_cohort_invalid",
      missing_lenses: []
    };
  }
  const verdicts = input.lenses.map((entry) => entry.result.verdict);
  if (verdicts.includes("BLOCKED")) return { disposition: "BLOCKED", missing_lenses: [] };
  if (verdicts.includes("AMEND_REQUIRED")) return { disposition: "AMEND_REQUIRED", missing_lenses: [] };
  return { disposition: "PASS", missing_lenses: [] };
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
