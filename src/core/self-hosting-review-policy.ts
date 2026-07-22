import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { type SelfHostingProcedureRegistry } from "./self-hosting-procedures";

export const PROCEDURE_EXECUTION_POLICY_PATH = "skills/self-hosting/procedure-execution-policy.json";
export const REVIEW_ROUTE_POLICY_PATH = "skills/self-hosting/review-route-policy.json";
export const CODEX_REFERENCE_BINDING_PATH = "skills/self-hosting/codex-reference-binding.json";

export type SemanticClass = "deterministic_only" | "semantic_optional" | "semantic_required";
export type ReviewRouteClass = "deterministic_no_model" | "balanced_routine" | "complex_judgment" | "critical_independent";
export type ReviewPassKind =
  | "initial_full_review"
  | "amendment_review"
  | "implementation_review"
  | "fix_pass_review"
  | "regression_reopen"
  | "verification_check"
  | "delivery_check"
  | "closeout_check";
export type ContextTransportMode = "fresh_packet" | "resume_same_role" | "packet_plus_retrieval" | "fresh_independent_delta";

export interface ProcedureExecutionContract {
  procedure_id: string;
  canonical_contract_ref: string;
  semantic_class: SemanticClass;
  deterministic_prechecks: string[];
  semantic_residual: string[];
  minimum_route: ReviewRouteClass;
  escalation_triggers: string[];
  independence: "none" | "same_role" | "independent";
  context_transport: ContextTransportMode;
  automatic_launch: boolean;
  deterministic_completion_supported: boolean;
  required_output_contract: string[];
  required_evidence_contract: string[];
  direct_artifact_required?: boolean;
  nested_review_launch_forbidden?: boolean;
}

export interface ProcedureExecutionPolicy {
  schema_version: 1;
  producer_command: string;
  contract_version: string;
  policy_id: string;
  procedures: ProcedureExecutionContract[];
}

export interface ReviewRoutePolicy {
  schema_version: 1;
  producer_command: string;
  contract_version: string;
  policy_id: string;
  policy_version: string;
  accepted_policy_version: string;
  previous_accepted_policy_version?: string;
  ordered_route_ladder: ReviewRouteClass[];
  ordered_reasoning_ladder: string[];
  critical_risk_classes: string[];
  reopen_triggers: string[];
  context_budgets: Record<string, number>;
  promotion_thresholds: Record<string, number | boolean>;
}

export interface CodexBindingProfile {
  profile_id: string;
  route_class: ReviewRouteClass;
  adapter_id: "codex_cli";
  model: string;
  reasoning_effort: string;
  verbosity: "low" | "medium" | "high";
  status: "accepted" | "candidate" | "rollback";
  capabilities: {
    fresh_packet: boolean;
    resume_same_role: boolean;
    packet_plus_retrieval: boolean;
    fresh_independent_delta: boolean;
    jsonl_usage: boolean;
  };
}

export interface CodexReferenceBinding {
  schema_version: 1;
  producer_command: string;
  contract_version: string;
  binding_id: string;
  binding_version: string;
  accepted_binding_version: string;
  previous_accepted_binding_version?: string;
  source_trace: Array<Record<string, string>>;
  capability_snapshot: Record<string, unknown>;
  profiles: CodexBindingProfile[];
}

export interface ReviewRouteInputs {
  procedure_id: string;
  review_tier: "standard" | "high" | "extra-high";
  pass_kind: ReviewPassKind;
  pass_index: number;
  changed_surface_classes: string[];
  risk_classes: string[];
  deterministic_evidence_complete: boolean;
  prior_failure_count: number;
  independence_required: boolean;
  context_reuse_state: "hit" | "miss" | "rebuilt";
  owner_budget_class: "economy" | "balanced" | "critical";
  prior_verdict?: string;
  prior_finding_dispositions?: string[];
  open_blocker_count: number;
  new_blocker_count: number;
  delta_bytes: number;
  material_change_classes: string[];
  previous_route_outcome?: string;
  reviewer_disagreement?: boolean;
  structured_output_failure?: boolean;
}

export interface ReviewRouteDecision {
  route_decision_id: string;
  policy_version: string;
  procedure_id: string;
  pass_kind: ReviewPassKind;
  pass_index: number;
  route_class: ReviewRouteClass;
  minimum_route: ReviewRouteClass;
  escalation_reasons: string[];
  downgrade_applied: boolean;
  authoritative_inputs_hash: string;
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

export function canonicalReviewPolicyJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function contentId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(canonicalReviewPolicyJson(value)).digest("hex")}`;
}

function readJson<T>(targetRoot: string, relativePath: string, label: string): T {
  const absolutePath = path.join(targetRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} not found: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;
}

export function readProcedureExecutionPolicy(targetRoot: string): ProcedureExecutionPolicy {
  const policy = readJson<ProcedureExecutionPolicy>(targetRoot, PROCEDURE_EXECUTION_POLICY_PATH, "Procedure execution policy");
  if (policy.schema_version !== 1 || !policy.contract_version || !Array.isArray(policy.procedures)) {
    throw new Error("Procedure execution policy is invalid.");
  }
  return policy;
}

export function readReviewRoutePolicy(targetRoot: string): ReviewRoutePolicy {
  const policy = readJson<ReviewRoutePolicy>(targetRoot, REVIEW_ROUTE_POLICY_PATH, "Review route policy");
  if (policy.schema_version !== 1 || policy.accepted_policy_version !== policy.policy_version) {
    throw new Error("Review route policy has an unsupported or inactive policy version.");
  }
  if (new Set(policy.ordered_route_ladder).size !== policy.ordered_route_ladder.length) {
    throw new Error("Review route policy route ladder must contain unique adjacent steps.");
  }
  return policy;
}

export function readCodexReferenceBinding(targetRoot: string): CodexReferenceBinding {
  const binding = readJson<CodexReferenceBinding>(targetRoot, CODEX_REFERENCE_BINDING_PATH, "Codex reference binding");
  if (binding.schema_version !== 1 || binding.accepted_binding_version !== binding.binding_version || !Array.isArray(binding.source_trace) || binding.source_trace.length === 0) {
    throw new Error("Codex reference binding has an unsupported or inactive binding version.");
  }
  return binding;
}

export function reconcileProcedureExecutionPolicy(
  registry: SelfHostingProcedureRegistry,
  policy: ProcedureExecutionPolicy
): void {
  const registryIds = registry.procedures.map((entry) => entry.procedure_id).sort();
  const policyIds = policy.procedures.map((entry) => entry.procedure_id).sort();
  if (JSON.stringify(registryIds) !== JSON.stringify(policyIds)) {
    throw new Error(`Procedure execution policy coverage mismatch: registry=${registryIds.join(",")} policy=${policyIds.join(",")}.`);
  }
  const automatic = policy.procedures.filter((entry) => entry.automatic_launch).map((entry) => entry.procedure_id).sort();
  if (JSON.stringify(automatic) !== JSON.stringify(["implementation-review", "plan-review"])) {
    throw new Error("Automatic review launch must remain limited to plan-review and implementation-review.");
  }
  for (const contract of policy.procedures) {
    const descriptor = registry.procedures.find((entry) => entry.procedure_id === contract.procedure_id);
    if (!descriptor || contract.canonical_contract_ref !== descriptor.skill_path) {
      throw new Error(`${contract.procedure_id} execution policy does not cite its canonical procedure contract.`);
    }
    if (contract.deterministic_completion_supported && contract.required_output_contract.length === 0) {
      throw new Error(`${contract.procedure_id} deterministic completion lacks the typed output contract.`);
    }
    if (contract.automatic_launch && (!contract.direct_artifact_required || !contract.nested_review_launch_forbidden)) {
      throw new Error(`${contract.procedure_id} automatic launch lacks the direct-artifact anti-recursion contract.`);
    }
  }
}

function routeIndex(policy: ReviewRoutePolicy, route: ReviewRouteClass): number {
  const index = policy.ordered_route_ladder.indexOf(route);
  if (index < 0) {
    throw new Error(`Route ${route} is absent from the approved ordered ladder.`);
  }
  return index;
}

export function decideReviewRoute(
  policy: ReviewRoutePolicy,
  contract: ProcedureExecutionContract,
  input: ReviewRouteInputs
): ReviewRouteDecision {
  if (!Number.isInteger(input.pass_index) || input.pass_index < 0 || input.delta_bytes < 0) {
    throw new Error("Review route inputs contain an invalid pass index or delta size.");
  }
  const normalized: ReviewRouteInputs = {
    ...input,
    changed_surface_classes: [...new Set(input.changed_surface_classes)].sort(),
    risk_classes: [...new Set(input.risk_classes)].sort(),
    prior_finding_dispositions: [...new Set(input.prior_finding_dispositions ?? [])].sort(),
    material_change_classes: [...new Set(input.material_change_classes)].sort()
  };
  const escalationReasons: string[] = [];
  const criticalRisk = normalized.risk_classes.some((risk) => policy.critical_risk_classes.includes(risk));
  const reopen = normalized.material_change_classes.some((entry) => policy.reopen_triggers.includes(entry));
  if (!normalized.deterministic_evidence_complete) escalationReasons.push("deterministic_evidence_incomplete");
  if (criticalRisk) escalationReasons.push("critical_risk_class");
  if (reopen) escalationReasons.push("material_reopen_trigger");
  if (normalized.new_blocker_count > 0) escalationReasons.push("new_blocker");
  if (normalized.reviewer_disagreement) escalationReasons.push("reviewer_disagreement");
  if (normalized.structured_output_failure) escalationReasons.push("structured_output_failure");

  let route = contract.minimum_route;
  if (contract.semantic_class === "deterministic_only" && normalized.deterministic_evidence_complete) {
    route = "deterministic_no_model";
  } else if (criticalRisk || reopen || normalized.new_blocker_count > 0 || normalized.reviewer_disagreement) {
    route = "critical_independent";
  } else if (normalized.prior_failure_count > 0 || !normalized.deterministic_evidence_complete) {
    route = routeIndex(policy, contract.minimum_route) > routeIndex(policy, "complex_judgment")
      ? contract.minimum_route
      : "complex_judgment";
  }

  let downgradeApplied = false;
  const boundedRepeat = normalized.pass_kind === "amendment_review" || normalized.pass_kind === "fix_pass_review";
  if (boundedRepeat && normalized.context_reuse_state === "hit" && escalationReasons.length === 0 && normalized.open_blocker_count === 0) {
    const currentIndex = routeIndex(policy, route);
    const floorIndex = routeIndex(policy, contract.minimum_route);
    const adjacent = Math.max(floorIndex, currentIndex - 1);
    if (adjacent < currentIndex) {
      route = policy.ordered_route_ladder[adjacent];
      downgradeApplied = true;
    }
  }

  const hash = createHash("sha256").update(canonicalReviewPolicyJson(normalized)).digest("hex");
  return {
    route_decision_id: contentId("review-route", { policy_version: policy.policy_version, input: normalized, route }),
    policy_version: policy.policy_version,
    procedure_id: input.procedure_id,
    pass_kind: input.pass_kind,
    pass_index: input.pass_index,
    route_class: route,
    minimum_route: contract.minimum_route,
    escalation_reasons: escalationReasons.sort(),
    downgrade_applied: downgradeApplied,
    authoritative_inputs_hash: `sha256:${hash}`
  };
}

export function resolveCodexBinding(
  binding: CodexReferenceBinding,
  route: ReviewRouteClass,
  mode: ContextTransportMode
): CodexBindingProfile | undefined {
  return binding.profiles.find((profile) =>
    profile.status === "accepted"
    && profile.route_class === route
    && profile.capabilities[mode]
  );
}
