import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { type SelfHostingProcedureRegistry } from "./self-hosting-procedures";

export const PROCEDURE_EXECUTION_POLICY_PATH = "skills/self-hosting/procedure-execution-policy.json";
export const PROCEDURE_EXECUTION_POLICY_SCHEMA_PATH = "schemas/self-hosting-procedure-execution-policy.schema.json";
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
  review_launch?: ReviewLaunchTimingPolicy;
}

export interface ReviewLaunchTimingPolicy {
  timeout_seconds: number;
  stale_after_seconds: number;
  timeout_override: {
    minimum_seconds: number;
    maximum_seconds: number;
  };
  stale_after_override: {
    minimum_seconds: number;
    maximum_seconds: number;
  };
  termination_policy: "terminal_completion_only";
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
    safe_session_resume: false;
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

export interface TaskPlanningReviewAuthorityFactsV1 {
  contract: "planned-review-facts.v1";
  task_id: string;
  task_contract_ref: string;
  review_tier: "standard" | "high" | "extra-high";
  minimum_planned_surface_classes: string[];
  minimum_planned_risk_classes: string[];
}

export interface PlanBoundPlanningReviewFactsV1 {
  contract: "planned-review-facts.v1";
  review_tier: "standard" | "high" | "extra-high";
  planned_surface_classes: string[];
  planned_risk_classes: string[];
}

export interface ResolvedPlanningReviewFactsV1 {
  contract: "planned-review-facts.v1";
  task_artifact_id: `sha256:${string}`;
  task_contract_ref: string;
  effective_plan_artifact_id: `sha256:${string}`;
  run_instance_id: string;
  immutable_base: string;
  review_tier: "standard" | "high" | "extra-high";
  planned_surface_classes: string[];
  risk_classes: string[];
  required_semantic_reviews: string[];
  required_planning_lenses: Array<"plan-review" | "architecture-review" | "db-storage-review">;
}

const REVIEW_TIERS = ["standard", "high", "extra-high"] as const;
const PLANNING_LENSES = ["plan-review", "architecture-review", "db-storage-review"] as const;
const REVIEW_SURFACE_CLASSES = [
  "acceptance", "authority", "authority_docs", "docs", "docs_task_only", "harness", "policy",
  "procedure_policy", "runtime", "schema", "schemas", "storage", "task"
] as const;
const REVIEW_RISK_CLASSES = [
  "adapter", "architecture", "authority", "conflicting_evidence", "database", "db", "harness", "lifecycle",
  "provider", "retention", "schema", "security", "storage", "weak_evidence"
] as const;

function readTopLevelYamlFences(markdown: string): string[] {
  const blocks: string[] = [];
  let active: { marker: "`" | "~"; length: number; yaml: boolean; lines: string[] } | undefined;
  for (const line of markdown.split(/\r?\n/u)) {
    if (active) {
      const close = /^(?: {0,3})(`{3,}|~{3,})[ \t]*$/u.exec(line);
      if (close && close[1][0] === active.marker && close[1].length >= active.length) {
        if (active.yaml) blocks.push(active.lines.join("\n"));
        active = undefined;
      } else if (active.yaml) {
        active.lines.push(line);
      }
      continue;
    }
    const open = /^(?: {0,3})(`{3,}|~{3,})([^\r\n]*)$/u.exec(line);
    if (!open) continue;
    const info = open[2].trim().split(/[ \t]+/u)[0]?.toLowerCase() ?? "";
    active = { marker: open[1][0] as "`" | "~", length: open[1].length,
      yaml: info === "yaml", lines: [] };
  }
  return blocks;
}

function readStructuredReviewFactsBlock(
  markdown: string,
  contractKey: string,
  allowedKeys: readonly string[]
): Map<string, string | string[]> | undefined {
  const blocks = readTopLevelYamlFences(markdown);
  const matching = blocks.filter((candidate) => new RegExp(`^\\s*${contractKey}:\\s*planned-review-facts\\.v1\\s*$`, "mu").test(candidate));
  if (matching.length === 0) return undefined;
  if (matching.length !== 1) throw new Error(`planning_review_facts_ambiguous:${contractKey}`);
  const block = matching[0];
  const values = new Map<string, string | string[]>();
  let arrayKey: string | undefined;
  for (const rawLine of block.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("- ") && arrayKey) {
      (values.get(arrayKey) as string[]).push(trimmed.slice(2).trim());
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator < 1) throw new Error(`planning_review_facts_invalid:${contractKey}`);
    const key = trimmed.slice(0, separator).trim();
    if (!allowedKeys.includes(key) || values.has(key)) throw new Error(`planning_review_facts_field_invalid:${key}`);
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!rawValue) {
      values.set(key, []);
      arrayKey = key;
      continue;
    }
    values.set(key, rawValue.replace(/^(["'])(.*)\1$/u, "$2"));
    arrayKey = undefined;
  }
  if (values.get(contractKey) === "planned-review-facts.v1") return values;
  return undefined;
}

function requireStructuredString(values: Map<string, string | string[]>, key: string): string {
  const value = values.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`planning_review_facts_field_invalid:${key}`);
  return value;
}

function requireStructuredStringArray(values: Map<string, string | string[]>, key: string): string[] {
  const value = values.get(key);
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !entry.trim())
    || new Set(value).size !== value.length) {
    throw new Error(`planning_review_facts_field_invalid:${key}`);
  }
  return [...value];
}

function requireReviewTier(value: string): "standard" | "high" | "extra-high" {
  if (!REVIEW_TIERS.includes(value as typeof REVIEW_TIERS[number])) {
    throw new Error("planning_review_facts_review_tier_invalid");
  }
  return value as typeof REVIEW_TIERS[number];
}

function requireReviewClasses(values: string[], vocabulary: readonly string[], field: string): string[] {
  if (values.some((value) => !vocabulary.includes(value))) {
    throw new Error(`planning_review_facts_field_invalid:${field}`);
  }
  return values;
}

export function parseTaskPlanningReviewAuthorityFacts(markdown: string): TaskPlanningReviewAuthorityFactsV1 | undefined {
  const values = readStructuredReviewFactsBlock(markdown, "planning_review_authority_contract", [
    "planning_review_authority_contract", "task_id", "task_contract_ref", "review_tier",
    "minimum_planned_surface_classes", "minimum_planned_risk_classes"
  ]);
  if (!values) return undefined;
  return {
    contract: "planned-review-facts.v1",
    task_id: requireStructuredString(values, "task_id"),
    task_contract_ref: requireStructuredString(values, "task_contract_ref"),
    review_tier: requireReviewTier(requireStructuredString(values, "review_tier")),
    minimum_planned_surface_classes: requireReviewClasses(
      requireStructuredStringArray(values, "minimum_planned_surface_classes"), REVIEW_SURFACE_CLASSES,
      "minimum_planned_surface_classes"),
    minimum_planned_risk_classes: requireReviewClasses(
      requireStructuredStringArray(values, "minimum_planned_risk_classes"), REVIEW_RISK_CLASSES,
      "minimum_planned_risk_classes")
  };
}

export function parsePlanBoundPlanningReviewFacts(markdown: string): PlanBoundPlanningReviewFactsV1 | undefined {
  const values = readStructuredReviewFactsBlock(markdown, "planning_review_facts_contract", [
    "planning_review_facts_contract", "review_tier", "planned_surface_classes", "planned_risk_classes"
  ]);
  if (!values) return undefined;
  return {
    contract: "planned-review-facts.v1",
    review_tier: requireReviewTier(requireStructuredString(values, "review_tier")),
    planned_surface_classes: requireReviewClasses(
      requireStructuredStringArray(values, "planned_surface_classes"), REVIEW_SURFACE_CLASSES, "planned_surface_classes"),
    planned_risk_classes: requireReviewClasses(
      requireStructuredStringArray(values, "planned_risk_classes"), REVIEW_RISK_CLASSES, "planned_risk_classes")
  };
}

export function resolvePlanningReviewFacts(input: {
  taskMarkdown: string;
  planMarkdown: string;
  taskArtifactId: `sha256:${string}`;
  activeTaskPath: string;
  phaseId: string;
  effectivePlanArtifactId: `sha256:${string}`;
  runInstanceId: string;
  immutableBase: string;
  knownChangedSurfaceClasses?: string[];
  knownRiskClasses?: string[];
}): ResolvedPlanningReviewFactsV1 | undefined {
  const task = parseTaskPlanningReviewAuthorityFacts(input.taskMarkdown);
  if (!task) return undefined;
  const plan = parsePlanBoundPlanningReviewFacts(input.planMarkdown);
  if (!plan) throw new Error("planning_review_plan_facts_missing");
  if (task.task_id !== input.phaseId || task.task_contract_ref !== input.activeTaskPath) {
    throw new Error("planning_review_task_facts_identity_mismatch");
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(input.taskArtifactId)
    || !/^sha256:[a-f0-9]{64}$/u.test(input.effectivePlanArtifactId)
    || !input.runInstanceId.trim() || !/^[a-f0-9]{40}$/u.test(input.immutableBase)) {
    throw new Error("planning_review_facts_binding_invalid");
  }
  requireReviewClasses(input.knownChangedSurfaceClasses ?? [], REVIEW_SURFACE_CLASSES, "knownChangedSurfaceClasses");
  requireReviewClasses(input.knownRiskClasses ?? [], REVIEW_RISK_CLASSES, "knownRiskClasses");
  const reviewTier = REVIEW_TIERS[Math.max(REVIEW_TIERS.indexOf(task.review_tier), REVIEW_TIERS.indexOf(plan.review_tier))];
  const plannedSurfaceClasses = [...new Set([
    ...task.minimum_planned_surface_classes,
    ...plan.planned_surface_classes,
    ...(input.knownChangedSurfaceClasses ?? [])
  ])].sort();
  const riskClasses = [...new Set([
    ...task.minimum_planned_risk_classes,
    ...plan.planned_risk_classes,
    ...(input.knownRiskClasses ?? [])
  ])].sort();
  const requiredSemanticReviews = deriveRequiredSemanticReviews(
    "plan-review", reviewTier, plannedSurfaceClasses, riskClasses
  );
  const requiredPlanningLenses = PLANNING_LENSES.filter((lens) => requiredSemanticReviews.includes(lens));
  return {
    contract: "planned-review-facts.v1",
    task_artifact_id: input.taskArtifactId,
    task_contract_ref: input.activeTaskPath,
    effective_plan_artifact_id: input.effectivePlanArtifactId,
    run_instance_id: input.runInstanceId,
    immutable_base: input.immutableBase,
    review_tier: reviewTier,
    planned_surface_classes: plannedSurfaceClasses,
    risk_classes: riskClasses,
    required_semantic_reviews: requiredSemanticReviews,
    required_planning_lenses: requiredPlanningLenses
  };
}

export function deriveRequiredSemanticReviews(
  procedureId: string,
  reviewTier: "standard" | "high" | "extra-high",
  changedSurfaceClasses: string[],
  riskClasses: string[]
): string[] {
  const reviews = new Set<string>();
  if (procedureId === "implementation") {
    reviews.add("implementation-review");
  } else if ([
    "plan-review",
    "architecture-review",
    "db-storage-review",
    "implementation-review",
    "fix-pass-review",
    "verification-review",
    "delivery-facts-review",
    "phase-closeout-review"
  ].includes(procedureId)) {
    reviews.add(procedureId);
  }
  const risks = new Set(riskClasses);
  if (reviewTier === "extra-high"
    || ["architecture", "authority", "lifecycle", "security", "provider", "adapter"].some((value) => risks.has(value))) {
    reviews.add("architecture-review");
  }
  if (["database", "db", "storage", "retention", "schema"].some((value) => risks.has(value))) {
    reviews.add("db-storage-review");
  }
  const surfaces = new Set(changedSurfaceClasses);
  if (["docs", "docs_task_only", "task", "authority_docs"].some((value) => surfaces.has(value))) {
    reviews.add("docs-consistency-review");
  }
  if (surfaces.has("harness") || risks.has("harness")) {
    reviews.add("harness-audit");
  }
  return [...reviews].sort();
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

function assertSchemaValidation(value: unknown, schema: unknown, label: string): void {
  const rule = assertObject(schema, `${label} schema`);
  if ("const" in rule && canonicalReviewPolicyJson(value) !== canonicalReviewPolicyJson(rule.const)) {
    throw new Error(`${label} must equal the registered schema constant.`);
  }
  if (Array.isArray(rule.enum) && !rule.enum.some((entry) => canonicalReviewPolicyJson(entry) === canonicalReviewPolicyJson(value))) {
    throw new Error(`${label} is not one of the registered schema values.`);
  }
  if (rule.type === "object") {
    const record = assertObject(value, label);
    const properties = rule.properties === undefined ? {} : assertObject(rule.properties, `${label} schema properties`);
    const required = rule.required === undefined ? [] : rule.required;
    if (!Array.isArray(required) || required.some((field) => typeof field !== "string")) {
      throw new Error(`${label} schema required must be a string array.`);
    }
    for (const field of required) {
      if (!(field in record)) throw new Error(`${label} is missing required property: ${field}.`);
    }
    if (rule.additionalProperties === false) {
      const unknown = Object.keys(record).filter((field) => !(field in properties));
      if (unknown.length > 0) throw new Error(`${label} contains unknown properties: ${unknown.sort().join(",")}.`);
    }
    for (const [field, childSchema] of Object.entries(properties)) {
      if (field in record) assertSchemaValidation(record[field], childSchema, `${label}.${field}`);
    }
    return;
  }
  if (rule.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    if (typeof rule.minItems === "number" && value.length < rule.minItems) {
      throw new Error(`${label} must contain at least ${rule.minItems} items.`);
    }
    if (rule.items !== undefined) value.forEach((entry, index) => assertSchemaValidation(entry, rule.items, `${label}[${index}]`));
    return;
  }
  if (rule.type === "string") {
    if (typeof value !== "string") throw new Error(`${label} must be a string.`);
    if (typeof rule.minLength === "number" && value.length < rule.minLength) {
      throw new Error(`${label} must have at least ${rule.minLength} characters.`);
    }
    if (typeof rule.pattern === "string" && !(new RegExp(rule.pattern, "u")).test(value)) {
      throw new Error(`${label} does not match the registered schema pattern.`);
    }
    return;
  }
  if (rule.type === "integer") {
    if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
    if (typeof rule.minimum === "number" && Number(value) < rule.minimum) {
      throw new Error(`${label} must be at least ${rule.minimum}.`);
    }
    return;
  }
  if (rule.type === "boolean" && typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

export function validateProcedureExecutionPolicySchema(targetRoot: string, policy: unknown): asserts policy is ProcedureExecutionPolicy {
  const schema = readJson<unknown>(
    targetRoot,
    PROCEDURE_EXECUTION_POLICY_SCHEMA_PATH,
    "Procedure execution policy schema"
  );
  assertSchemaValidation(policy, schema, "Procedure execution policy");
}

export function readProcedureExecutionPolicy(targetRoot: string): ProcedureExecutionPolicy {
  const policy = readJson<unknown>(targetRoot, PROCEDURE_EXECUTION_POLICY_PATH, "Procedure execution policy");
  validateProcedureExecutionPolicySchema(targetRoot, policy);
  if (policy.schema_version !== 1 || !policy.contract_version || !Array.isArray(policy.procedures)) {
    throw new Error("Procedure execution policy is invalid.");
  }
  for (const procedure of policy.procedures) {
    const label = `Procedure execution policy ${procedure.procedure_id}`;
    if (procedure.automatic_launch) {
      if (!procedure.review_launch) throw new Error(`${label} requires review_launch timing authority.`);
      assertReviewLaunchTimingPolicy(procedure.review_launch, label);
    } else if (procedure.review_launch) {
      throw new Error(`${label} may not define review_launch timing without automatic_launch.`);
    }
  }
  return policy;
}

function assertReviewLaunchTimingPolicy(policy: ReviewLaunchTimingPolicy, label: string): void {
  const positiveInteger = (value: unknown, field: string): number => {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      throw new Error(`${label} review_launch ${field} must be a positive integer.`);
    }
    return Number(value);
  };
  const timeoutSeconds = positiveInteger(policy.timeout_seconds, "timeout_seconds");
  const staleAfterSeconds = positiveInteger(policy.stale_after_seconds, "stale_after_seconds");
  const timeoutMinimum = positiveInteger(policy.timeout_override?.minimum_seconds, "timeout_override.minimum_seconds");
  const timeoutMaximum = positiveInteger(policy.timeout_override?.maximum_seconds, "timeout_override.maximum_seconds");
  const staleMinimum = positiveInteger(policy.stale_after_override?.minimum_seconds, "stale_after_override.minimum_seconds");
  const staleMaximum = positiveInteger(policy.stale_after_override?.maximum_seconds, "stale_after_override.maximum_seconds");
  if (policy.termination_policy !== "terminal_completion_only") {
    throw new Error(`${label} review_launch termination_policy must be terminal_completion_only.`);
  }
  if (staleAfterSeconds >= timeoutSeconds) {
    throw new Error(`${label} review_launch stale_after_seconds must remain below timeout_seconds.`);
  }
  if (timeoutMinimum < timeoutSeconds || timeoutMaximum < timeoutMinimum) {
    throw new Error(`${label} review_launch timeout override bounds may not shorten the registered timeout.`);
  }
  if (staleMinimum < staleAfterSeconds || staleMaximum < staleMinimum || staleMaximum >= timeoutSeconds) {
    throw new Error(`${label} review_launch stale override bounds are invalid.`);
  }
}

export function resolveReviewLaunchTiming(
  policy: ProcedureExecutionPolicy,
  procedureIds: string[]
): ReviewLaunchTimingPolicy {
  const timings = procedureIds.map((procedureId) => {
    const procedure = policy.procedures.find((entry) => entry.procedure_id === procedureId);
    if (!procedure?.automatic_launch || !procedure.review_launch) {
      throw new Error(`REVIEW_TIMING_POLICY_UNAVAILABLE: ${procedureId} has no registered automatic review timing.`);
    }
    return procedure.review_launch;
  });
  if (timings.length === 0) throw new Error("REVIEW_TIMING_POLICY_UNAVAILABLE: no registered review procedures were selected.");
  const authoritative = timings[0];
  if (timings.some((timing) => canonicalReviewPolicyJson(timing) !== canonicalReviewPolicyJson(authoritative))) {
    throw new Error("REVIEW_BUNDLE_TIMING_POLICY_CONFLICT: selected review procedures do not share one registered timing policy.");
  }
  return authoritative;
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
  const snapshot = binding.capability_snapshot;
  const automatic = snapshot.automatic_procedures;
  if (snapshot.planning_bundle !== undefined
    && (snapshot.safe_session_resume !== false || snapshot.read_only_sandbox !== true
      || snapshot.planning_bundle !== true || snapshot.single_review !== true
      || JSON.stringify(automatic) !== JSON.stringify([
        "architecture-review", "db-storage-review", "fix-pass-review", "implementation-review", "plan-review"
      ]))) {
    throw new Error("Codex reference binding capability snapshot is not the exact Phase 23.9 production binding.");
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
  if (JSON.stringify(automatic) !== JSON.stringify([
    "architecture-review", "db-storage-review", "fix-pass-review", "implementation-review", "plan-review"
  ])) {
    throw new Error("Automatic review launch does not match the Phase 23.9 planning-bundle and standalone-review allowlist.");
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
