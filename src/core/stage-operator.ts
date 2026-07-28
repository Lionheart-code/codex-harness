import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalJson, sha256Hex } from "./evidence-types";
import {
  type ExecutionPolicy,
  type RepairPacket,
  type RunnerProfile,
  type RunIssue,
  type StageOutcome,
  type StagePacket,
  type StagePacketKind,
  type StageResult,
  type StageState,
  type StageValidationResult,
  deriveStagePacketId,
  resolveStageResultTransitionContract
} from "./lifecycle-types";
import { PayloadStore } from "./payload-store";
import {
  type ReviewOperationalRecord,
  type Run,
  getRuntimeOperatorStatus
} from "./runtime";
import {
  deriveRequiredSemanticReviews,
  readCodexReferenceBinding,
  readProcedureExecutionPolicy,
  readReviewRoutePolicy
} from "./self-hosting-review-policy";
import {
  RunStagingDatabase,
  resolveHarnessRoots,
  writeCompatibilityRunArtifacts
} from "./run-staging-db";

const PHASE_ID = "23.8.7" as const;
const RUNNER_PROFILE_ID = "runner-profile-supplied-fixture-v1";
const EXECUTION_POLICY_ID = "execution-policy-hookless-v1";
const PACKET_KINDS: StagePacketKind[] = ["plan", "implementation", "review", "fix-pass", "closeout"];
const OUTCOMES: StageOutcome[] = ["PASS", "FIX_REQUIRED", "AMEND_REQUIRED", "BLOCKED"];
const MAX_RESULT_BYTES = 512 * 1024;
const MAX_LOG_ENTRIES = 40;

export interface PrepareStagePacketOptions {
  runId?: string;
  kind: "auto" | StagePacketKind;
  dryRun?: boolean;
}

export interface RecordStageResultOptions {
  runId?: string;
  packetId: string;
  filePath: string;
  dryRun?: boolean;
}

export interface StagePacketServiceResult {
  targetRoot: string;
  projectRoot: string;
  run: Run;
  stageState: StageState;
  packet?: StagePacket;
  issue?: RunIssue;
  repairPacket?: RepairPacket;
  recorded: boolean;
  dryRun: boolean;
}

export interface StageResultServiceResult {
  targetRoot: string;
  projectRoot: string;
  run: Run;
  stageState: StageState;
  stageResult: StageResult;
  issue?: RunIssue;
  repairPacket?: RepairPacket;
  recorded: boolean;
  dryRun: boolean;
}

interface RouteContext {
  route_decision_id: string;
  route_class: string;
  routing_policy_version: string;
  binding_version: string;
  binding_profile_id: string;
  context_core_id: string;
  context_manifest_id: string;
  delta_overlay_id: string;
  context_mode: string;
  usage_ref: string;
  deterministic_evidence_state: "complete";
  parallel_policy: "serial";
  risk_classes: string[];
  changed_surfaces: string[];
  required_semantic_reviews: string[];
  profile_floor: string;
  reasoning_default: string;
  reasoning_ceiling: string;
  independence_mode: string;
  budget_class: string;
  escalation_triggers: string[];
}

interface ResultFixture {
  stage_result_id?: string;
  stage_packet_id: string;
  runner_profile_id: string;
  outcome: StageOutcome;
  summary: string;
  files_changed: string[];
  commands: string[];
  outputs: string[];
  blockers: string[];
  evidence_refs: string[];
  completed_reviews: string[];
  anomaly_codes: string[];
  waiver_refs: string[];
  validation_results: StageValidationResult[];
  bounded_progress_log: string[];
  actual_invocation_facts: Record<string, unknown> & { supplied_fixture: true };
  usage_ref: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256Hex(canonicalJson(value)).slice(0, 24)}`;
}

function requireExactRun(run: Run): asserts run is Run & { run_instance_id: string; run_revision: number } {
  if (run.phase_id !== PHASE_ID) {
    throw new Error(`STAGE_PHASE_MISMATCH: run ${run.run_id} is phase ${run.phase_id ?? "unknown"}, expected ${PHASE_ID}.`);
  }
  if (!run.run_instance_id || !Number.isInteger(run.run_revision) || (run.run_revision ?? 0) < 1) {
    throw new Error(`STAGE_RUN_IDENTITY_MISSING: run ${run.run_id} lacks exact run instance and revision identity.`);
  }
  if (run.lifecycle_status !== "active") {
    throw new Error(`STAGE_RUN_NOT_ACTIVE: run ${run.run_id} is ${run.lifecycle_status}.`);
  }
  if ((run.review_launch_claims ?? []).length > 0) {
    throw new Error("STAGE_REVIEW_CLAIM_ACTIVE: packet preparation and result ingestion require no active review launch claim.");
  }
}

function packetKindForStage(stage: string): StagePacketKind {
  if (stage === "IMPLEMENTATION_READY") {
    return "implementation";
  }
  if (stage.includes("FIX_PASS") || stage === "PLAN_AMEND_REQUIRED" || stage === "PLAN_AMEND_PACKET") {
    return "fix-pass";
  }
  if (stage.includes("CLOSEOUT") || stage === "RUN_READY_TO_CLOSE") {
    return "closeout";
  }
  if (stage.startsWith("PLAN_") || stage.startsWith("TASK_PROMPT") || stage === "TASK_INTAKE_REQUIRED" || stage === "TASK_PROMPT_REQUIRED") {
    return "plan";
  }
  return "review";
}

function procedureForStage(kind: StagePacketKind, stage: string, nextProcedureId: string): string {
  if (nextProcedureId && nextProcedureId !== "none") {
    return nextProcedureId;
  }
  if (kind === "implementation") {
    return "implementation";
  }
  if (kind === "fix-pass") {
    return stage === "PLAN_AMEND_REQUIRED" ? "plan-amend" : "fix-pass-review";
  }
  if (kind === "closeout") {
    return "phase-closeout-review";
  }
  if (kind === "plan") {
    return stage.includes("APPROVAL") ? "plan-review" : "draft-plan";
  }
  return "implementation-review";
}

export function resolveStagePacketIntent(currentStage: string, nextProcedureId = "none"): {
  kind: StagePacketKind;
  procedureId: string;
} {
  const kind = packetKindForStage(currentStage);
  return { kind, procedureId: procedureForStage(kind, currentStage, nextProcedureId) };
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`INVALID_STAGE_RESULT: ${label} must be an array of strings.`);
  }
  return value as string[];
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`INVALID_STAGE_RESULT: ${field} must be a non-empty string.`);
  }
  return value;
}

function findRouteContext(targetRoot: string, run: Run): RouteContext | undefined {
  const records = run.review_routing_records ?? [];
  const invocations = records
    .filter((record) => record.record_kind === "review_invocation")
    .slice();
  const invocation = invocations[invocations.length - 1];
  if (!invocation || invocation.status !== "success") {
    return undefined;
  }
  const payload = invocation.payload;
  const routeId = typeof payload.route_decision_id === "string" ? payload.route_decision_id : undefined;
  const required = [
    "run_instance_id", "route_class", "routing_policy_version", "binding_version", "binding_profile_id",
    "context_core_id", "context_manifest_id", "delta_overlay_id", "context_mode", "procedure_id", "review_tier",
    "usage_ref", "deterministic_evidence_state", "parallel_policy", "budget_class", "independence_mode"
  ];
  if (!routeId || required.some((field) => typeof payload[field] !== "string" || String(payload[field]).length === 0)
    || payload.run_instance_id !== run.run_instance_id
    || !Array.isArray(payload.risk_classes)
    || !Array.isArray(payload.changed_surface_classes)
    || !Array.isArray(payload.required_semantic_reviews)) {
    return undefined;
  }
  const replayMatches = records.filter((record) =>
    record.record_kind === "review_replay_packet"
    && record.payload.route_decision_id === routeId
    && record.payload.run_instance_id === run.run_instance_id
  );
  if (replayMatches.length !== 1) {
    return undefined;
  }
  const replay = replayMatches[0]!;
  if (!["accepted", "retained_not_yet_eligible"].includes(replay.status)) {
    return undefined;
  }
  const replayPayload = replay.payload;
  const exactReplayFields: Array<[string, unknown]> = [
    ["source_run_id", run.run_id],
    ["context_core_id", payload.context_core_id],
    ["context_manifest_id", payload.context_manifest_id],
    ["delta_overlay_id", payload.delta_overlay_id],
    ["policy_version", payload.routing_policy_version],
    ["binding_version", payload.binding_version],
    ["route_class", payload.route_class],
    ["binding_profile_id", payload.binding_profile_id],
    ["procedure_id", payload.procedure_id],
    ["review_tier", payload.review_tier],
    ["context_mode", payload.context_mode],
    ["usage_ref", payload.usage_ref],
    ["deterministic_evidence_state", payload.deterministic_evidence_state],
    ["parallel_policy", payload.parallel_policy],
    ["budget_class", payload.budget_class],
    ["independence_mode", payload.independence_mode]
  ];
  if (exactReplayFields.some(([field, expected]) => replayPayload[field] !== expected)
    || !Array.isArray(replayPayload.risk_classes)
    || canonicalJson(replayPayload.risk_classes) !== canonicalJson(payload.risk_classes)
    || !Array.isArray(replayPayload.changed_surface_classes)
    || canonicalJson(replayPayload.changed_surface_classes) !== canonicalJson(payload.changed_surface_classes)
    || !Array.isArray(replayPayload.required_semantic_reviews)
    || canonicalJson(replayPayload.required_semantic_reviews) !== canonicalJson(payload.required_semantic_reviews)
    || !Array.isArray(replayPayload.escalation_triggers)
    || !Array.isArray(payload.escalation_triggers)
    || canonicalJson(replayPayload.escalation_triggers) !== canonicalJson(payload.escalation_triggers)) {
    return undefined;
  }
  const duplicateRouteRecords = invocations.filter((candidate) => candidate.payload.route_decision_id === routeId);
  if (duplicateRouteRecords.length !== 1) {
    return undefined;
  }
  const routePolicy = readReviewRoutePolicy(targetRoot);
  const binding = readCodexReferenceBinding(targetRoot);
  const procedurePolicy = readProcedureExecutionPolicy(targetRoot);
  if (!["standard", "high", "extra-high"].includes(String(payload.review_tier))) {
    return undefined;
  }
  const derivedReviews = deriveRequiredSemanticReviews(
    String(payload.procedure_id),
    payload.review_tier as "standard" | "high" | "extra-high",
    (payload.changed_surface_classes as unknown[]).filter((entry): entry is string => typeof entry === "string"),
    (payload.risk_classes as unknown[]).filter((entry): entry is string => typeof entry === "string")
  );
  if (canonicalJson(derivedReviews) !== canonicalJson(payload.required_semantic_reviews)) {
    return undefined;
  }
  const policyProcedureId = String(payload.procedure_id);
  const procedure = procedurePolicy.procedures.find((candidate) => candidate.procedure_id === policyProcedureId);
  const profile = binding.profiles.find((candidate) =>
    candidate.profile_id === payload.binding_profile_id
    && candidate.route_class === payload.route_class
    && candidate.status === "accepted"
  );
  const usagePayload = new RunStagingDatabase(
    targetRoot,
    resolveHarnessRoots(targetRoot).projectRoot,
    run.run_id
  ).readPayloadRecord(String(payload.usage_ref));
  const expectedBudgetClass = payload.route_class === "critical_independent" ? "critical" : "balanced";
  if (routePolicy.accepted_policy_version !== payload.routing_policy_version
    || binding.accepted_binding_version !== payload.binding_version
    || !procedure
    || !profile
    || payload.context_mode !== procedure.context_transport
    || payload.independence_mode !== procedure.independence
    || !profile.capabilities[procedure.context_transport]
    || !usagePayload
    || usagePayload.source_run_id !== run.run_id
    || usagePayload.source_phase_id !== run.phase_id
    || usagePayload.kind !== "review-usage-facts"
    || usagePayload.media_type !== "application/json"
    || payload.deterministic_evidence_state !== "complete"
    || payload.parallel_policy !== "serial"
    || payload.budget_class !== expectedBudgetClass
    || canonicalJson(payload.escalation_triggers) !== canonicalJson(procedure.escalation_triggers)) {
    return undefined;
  }
  return {
    route_decision_id: routeId,
    route_class: String(payload.route_class),
    routing_policy_version: String(payload.routing_policy_version),
    binding_version: String(payload.binding_version),
    binding_profile_id: String(payload.binding_profile_id),
    context_core_id: String(payload.context_core_id),
    context_manifest_id: String(payload.context_manifest_id),
    delta_overlay_id: String(payload.delta_overlay_id),
    context_mode: String(payload.context_mode),
    usage_ref: String(payload.usage_ref),
    deterministic_evidence_state: "complete",
    parallel_policy: "serial",
    risk_classes: (payload.risk_classes as unknown[]).filter((entry): entry is string => typeof entry === "string"),
    changed_surfaces: (payload.changed_surface_classes as unknown[]).filter((entry): entry is string => typeof entry === "string"),
    required_semantic_reviews: (payload.required_semantic_reviews as unknown[]).filter((entry): entry is string => typeof entry === "string"),
    profile_floor: profile.profile_id,
    reasoning_default: profile.reasoning_effort,
    reasoning_ceiling: routePolicy.ordered_reasoning_ladder[routePolicy.ordered_reasoning_ladder.length - 1] ?? profile.reasoning_effort,
    independence_mode: procedure.independence,
    budget_class: String(payload.budget_class),
    escalation_triggers: [...(payload.escalation_triggers as string[])]
  };
}

function runnerProfile(timestamp: string): RunnerProfile {
  return {
    runner_profile_id: RUNNER_PROFILE_ID,
    runner_id: RUNNER_PROFILE_ID,
    phase_id: PHASE_ID,
    adapter_kind: "supplied_fixture",
    runner_kind: "supplied_fixture",
    supported_roles: ["plan", "implementation", "review", "fix-pass", "closeout"],
    supported_packet_kinds: [...PACKET_KINDS],
    structured_output_support: true,
    can_launch: false,
    write_capability: "none",
    accepts_result_fixture: true,
    description: "Hookless adapter contract: ingest a supplied result fixture; never launch a runner.",
    session_support: "none",
    status: "active",
    current: true,
    created_at: timestamp
  };
}

function executionPolicy(timestamp: string): ExecutionPolicy {
  return {
    execution_policy_id: EXECUTION_POLICY_ID,
    phase_id: PHASE_ID,
    policy_version: "phase23.8.7-hookless-v1",
    role: "fixture_ingestion",
    write_scope: "run_staging_only",
    sandbox_mode: "no_runner",
    approval_policy: "human_only",
    network_policy: "forbidden",
    command_policy: "record_only",
    timeout_policy: "not_applicable",
    allowed_paths: [".harness/runs/<run-id>/run.json", ".harness/runs/<run-id>/run-staging.sqlite"],
    forbidden_paths: ["src/**", "tasks/**", "docs/**", ".git/**"],
    allowed_runner_profile_ids: [RUNNER_PROFILE_ID],
    allowed_packet_kinds: [...PACKET_KINDS],
    deterministic_checks_required: true,
    runner_launch_allowed: false,
    provider_selection_allowed: false,
    max_result_bytes: MAX_RESULT_BYTES,
    max_log_entries: MAX_LOG_ENTRIES,
    current: true,
    created_at: timestamp
  };
}

function blockedArtifacts(run: Run & { run_instance_id: string; run_revision: number }, kind: StagePacketKind, procedureId: string, reason: string, timestamp: string) {
  const issue: RunIssue = {
    issue_id: stableId("stage-issue", { run_instance_id: run.run_instance_id, run_revision: run.run_revision, kind, procedureId, reason }),
    phase_id: PHASE_ID,
    issue_type: "missing_route_context_evidence",
    status: "open",
    blocking: true,
    created_at: timestamp,
    source: "stage_packet",
    summary: reason,
    recommended_route: "supporting_fix",
    stage_id: procedureId,
    severity: "high",
    issue_kind: "route_context_authority",
    evidence_refs: [],
    repair_required: true
  };
  const repairPacket: RepairPacket = {
    packet_id: stableId("repair", { issue_id: issue.issue_id }),
    phase_id: PHASE_ID,
    created_at: timestamp,
    route: "supporting_fix",
    summary: "Restore exact Phase 23.8.6F route and context evidence before preparing a packet.",
    next_action: "record or import the missing immutable route/context records, then retry prepare-packet",
    issue_ids: [issue.issue_id],
    prompt: "Do not select a provider or launch a runner. Restore the exact harvested route decision and replay context join.",
    target_stage: procedureId,
    required_repairs: ["exact route decision", "exact context core/manifest/delta join", "usage reference"],
    validation_refs: ["phase23.8.6f-route-context-exact-join"],
    stopping_condition: "stop until the required immutable Phase F records are present"
  };
  const state: StageState = {
    stage_state_id: stableId("stage-state", { issue_id: issue.issue_id }),
    task_id: run.active_task_path ?? run.task_path,
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    project_run_id: run.run_instance_id,
    run_revision: run.run_revision,
    phase_id: PHASE_ID,
    packet_kind: kind,
    procedure_id: procedureId,
    current_stage: procedureId,
    allowed_next_stages: [],
    missing_inputs: ["approved Phase F route decision"],
    missing_evidence: ["exact route/context replay join"],
    blockers: [reason],
    blocked_disposition: "supporting_fix",
    stop_reason: "missing_route_context_evidence",
    status: "blocked",
    stopping_condition: repairPacket.stopping_condition!,
    validation_refs: repairPacket.validation_refs!,
    human_action_required: true,
    next_allowed_action: repairPacket.next_action,
    bounded_progress_log: ["operator state resolved", "Phase F route/context exact join missing", "packet not prepared"],
    current: true,
    created_at: timestamp
  };
  return { issue, repairPacket, state };
}

function supersedeCurrent<T extends { current: boolean; superseded_by?: string }>(
  records: T[],
  replacementId: string,
  shouldSupersede: (record: T) => boolean = () => true
): T[] {
  return records.map((record) => record.current && shouldSupersede(record)
    ? { ...record, current: false, superseded_by: replacementId }
    : record);
}

export function prepareRuntimeStagePacket(cwd: string, options: PrepareStagePacketOptions): StagePacketServiceResult {
  if (!["auto", ...PACKET_KINDS].includes(options.kind)) {
    throw new Error(`--kind must be one of: auto, ${PACKET_KINDS.join(", ")}.`);
  }
  const roots = resolveHarnessRoots(cwd);
  const operator = getRuntimeOperatorStatus(roots.targetRoot, { runId: options.runId, dryRun: options.dryRun });
  if (!operator.run) {
    throw new Error("STAGE_RUN_MISSING: no runtime run is available.");
  }
  const run = operator.run;
  requireExactRun(run);
  const intent = resolveStagePacketIntent(operator.operator.current_stage, operator.operator.next_procedure_id);
  const inferredKind = intent.kind;
  const kind = options.kind === "auto" ? inferredKind : options.kind;
  if (kind !== inferredKind) {
    throw new Error(`ILLEGAL_STAGE_PACKET_KIND: operator stage ${operator.operator.current_stage} requires ${inferredKind}, not ${kind}.`);
  }
  const procedureId = kind === inferredKind
    ? intent.procedureId
    : procedureForStage(kind, operator.operator.current_stage, operator.operator.next_procedure_id);
  const route = findRouteContext(roots.targetRoot, run);
  const timestamp = nowIso();
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, run.run_id);

  if (!route) {
    const blocked = blockedArtifacts(run, kind, procedureId, "Missing exact Phase 23.8.6F route decision and replay-context evidence.", timestamp);
    const next: Run = {
      ...run,
      updated_at: timestamp,
      stage_states: [...supersedeCurrent(run.stage_states ?? [], blocked.state.stage_state_id), blocked.state],
      run_issues: [...run.run_issues.filter((issue) => issue.issue_id !== blocked.issue.issue_id), blocked.issue],
      repair_packets: [...run.repair_packets.filter((packet) => packet.packet_id !== blocked.repairPacket.packet_id), blocked.repairPacket]
    };
    if (options.dryRun) {
      return { ...roots, run: next, stageState: blocked.state, issue: blocked.issue, repairPacket: blocked.repairPacket, recorded: false, dryRun: true };
    }
    const persisted = staging.mutateRun(run.run_id, () => next, {
      expectedRunPresence: "present",
      expectedRunInstanceId: run.run_instance_id,
      expectedRunRevision: run.run_revision
    });
    writeCompatibilityRunArtifacts(roots.targetRoot, persisted);
    return { ...roots, run: persisted, stageState: blocked.state, issue: blocked.issue, repairPacket: blocked.repairPacket, recorded: true, dryRun: false };
  }

  const currentStageState = (run.stage_states ?? []).find((candidate) => candidate.current);
  const currentFixPassResult = currentStageState?.procedure_id === "fix-pass-review"
    ? (run.stage_results ?? []).find((candidate) => candidate.current && candidate.procedure_id === "fix-pass-review")
    : undefined;
  const currentFixPassPacket = currentFixPassResult
    ? (run.stage_packets ?? []).find((candidate) => candidate.stage_packet_id === currentFixPassResult.stage_packet_id)
    : undefined;
  const returnProcedureId = procedureId === "fix-pass-review"
    ? currentStageState?.procedure_id !== "fix-pass-review"
      ? currentStageState?.procedure_id ?? "implementation-review"
      : currentFixPassPacket?.return_procedure_id ?? "implementation-review"
    : procedureId;
  const packetIdentity = {
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    packet_kind: kind,
    procedure_id: procedureId,
    return_procedure_id: returnProcedureId,
    route_decision_id: route.route_decision_id,
    context_core_id: route.context_core_id,
    context_manifest_id: route.context_manifest_id,
    delta_overlay_id: route.delta_overlay_id,
    source_snapshot: run.source_snapshot ?? run.repository.head_sha ?? "unknown"
  };
  const packetId = deriveStagePacketId(packetIdentity);
  const existing = (run.stage_packets ?? []).find((packet) => packet.stage_packet_id === packetId && packet.current);
  if (existing) {
    const state = (run.stage_states ?? []).find((candidate) => candidate.current && candidate.procedure_id === procedureId);
    if (!state) {
      throw new Error("STAGE_STATE_MISSING: current deterministic packet has no current stage state.");
    }
    return { ...roots, run, stageState: state, packet: existing, recorded: false, dryRun: options.dryRun === true };
  }
  const packet: StagePacket = {
    stage_packet_id: packetId,
    packet_id: packetId,
    task_id: run.active_task_path ?? run.task_path,
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    project_run_id: run.run_instance_id,
    run_revision: run.run_revision,
    phase_id: PHASE_ID,
    packet_kind: kind,
    stage_id: procedureId,
    procedure_id: procedureId,
    return_procedure_id: returnProcedureId,
    task_path: run.active_task_path ?? run.task_path,
    source_snapshot: packetIdentity.source_snapshot,
    effective_plan_ref: run.approvals.slice().reverse().find((approval) => approval.status === "approved")?.reviewed_plan_artifact_id ?? "not_applicable",
    procedure_artifact_ref: run.evidence.slice().reverse().find((evidence) => evidence.kind === `procedure:${procedureId}`)?.evidence_id ?? "pending",
    payload_refs: [],
    evidence_refs: run.evidence.map((evidence) => evidence.evidence_id),
    input_refs: [route.route_decision_id, route.context_core_id, route.context_manifest_id, route.delta_overlay_id],
    output_contract: "one supplied StageResult fixture; no runner side effect",
    required_result_schema: "phase23.8.7-stage-result-v1",
    progress_log_contract: `ordered string array with at most ${MAX_LOG_ENTRIES} entries`,
    execution_policy_ref: EXECUTION_POLICY_ID,
    route_decision_ref: route.route_decision_id,
    route_policy_ref: route.routing_policy_version,
    provider_binding_ref: `${route.binding_version}:${route.binding_profile_id}`,
    context_core_ref: route.context_core_id,
    delta_overlay_ref: route.delta_overlay_id,
    context_manifest_ref: route.context_manifest_id,
    context_transport_ref: route.context_mode,
    usage_facts_ref: route.usage_ref,
    ...route,
    profile_floor: route.profile_floor,
    default_reasoning_effort: route.reasoning_default,
    reasoning_default: route.reasoning_default,
    reasoning_effort_ceiling: route.reasoning_ceiling,
    reasoning_ceiling: route.reasoning_ceiling,
    evidence_state: "immutable_route_and_context_joined",
    deterministic_evidence_state: route.deterministic_evidence_state,
    independence_requirement: route.independence_mode === "independent" ? "independent_reviewer_required" : "separate_review_required",
    independence_mode: route.independence_mode,
    changed_surface_classes: route.changed_surfaces,
    required_semantic_reviews: route.required_semantic_reviews,
    context_transport_mode: route.context_mode,
    parallel_policy: route.parallel_policy,
    budget: { max_result_bytes: MAX_RESULT_BYTES, max_log_entries: MAX_LOG_ENTRIES },
    budget_class: route.budget_class,
    escalation_triggers: [...route.escalation_triggers],
    runner_profile_id: RUNNER_PROFILE_ID,
    execution_policy_id: EXECUTION_POLICY_ID,
    stopping_condition: "stop after producing the bounded fixture result; do not launch another stage",
    validation_refs: ["npm run build", "npm test", "git diff --check", "exact-run-identity", "phase-f-route-context-join", "fixture-schema-v1"],
    bounded_progress_log: ["operator state resolved", "Phase F route/context exact join validated", "hookless packet prepared"],
    current: true,
    created_at: timestamp
  };
  const state: StageState = {
    stage_state_id: stableId("stage-state", { stage_packet_id: packetId }),
    task_id: run.active_task_path ?? run.task_path,
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    project_run_id: run.run_instance_id,
    run_revision: run.run_revision,
    phase_id: PHASE_ID,
    packet_kind: kind,
    procedure_id: procedureId,
    current_stage: operator.operator.current_stage,
    allowed_next_stages: [procedureId],
    missing_inputs: [],
    missing_evidence: [],
    blockers: [],
    blocked_disposition: "none",
    stop_reason: "packet_ready",
    status: "ready",
    stopping_condition: packet.stopping_condition,
    validation_refs: packet.validation_refs,
    human_action_required: true,
    next_allowed_action: `supply a result fixture to record-stage-result --packet ${packetId}`,
    bounded_progress_log: packet.bounded_progress_log,
    current: true,
    created_at: timestamp
  };
  const next: Run = {
    ...run,
    updated_at: timestamp,
    stage_states: [...supersedeCurrent(run.stage_states ?? [], state.stage_state_id), state],
    stage_packets: [...supersedeCurrent(
      run.stage_packets ?? [],
      packetId,
      (candidate) => candidate.packet_kind === kind && candidate.procedure_id === procedureId
    ), packet],
    runner_profiles: [...(run.runner_profiles ?? []).filter((profile) => profile.runner_profile_id !== RUNNER_PROFILE_ID), runnerProfile(timestamp)],
    execution_policies: [...(run.execution_policies ?? []).filter((policy) => policy.execution_policy_id !== EXECUTION_POLICY_ID), executionPolicy(timestamp)]
  };
  if (options.dryRun) {
    return { ...roots, run: next, stageState: state, packet, recorded: false, dryRun: true };
  }
  const persisted = staging.mutateRun(run.run_id, () => next, {
    expectedRunPresence: "present",
    expectedRunInstanceId: run.run_instance_id,
    expectedRunRevision: run.run_revision
  });
  writeCompatibilityRunArtifacts(roots.targetRoot, persisted);
  return { ...roots, run: persisted, stageState: state, packet, recorded: true, dryRun: false };
}

function parseValidationResults(value: unknown): StageValidationResult[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("MISSING_DETERMINISTIC_CHECKS: validation_results must contain at least one deterministic check.");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`INVALID_STAGE_RESULT: validation_results[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const status = requiredString(record, "status");
    if (status !== "pass" && status !== "fail") {
      throw new Error(`INVALID_STAGE_RESULT: validation_results[${index}].status must be pass or fail.`);
    }
    return {
      check_id: requiredString(record, "check_id"),
      status,
      summary: requiredString(record, "summary"),
      evidence_refs: stringArray(record.evidence_refs, `validation_results[${index}].evidence_refs`)
    };
  });
}

function parseResultFixture(raw: string, packet: StagePacket): ResultFixture {
  if (Buffer.byteLength(raw, "utf8") > MAX_RESULT_BYTES) {
    throw new Error(`INVALID_STAGE_RESULT: fixture exceeds ${MAX_RESULT_BYTES} bytes.`);
  }
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_STAGE_RESULT: fixture root must be an object.");
  }
  const record = value as Record<string, unknown>;
  const outcome = requiredString(record, "outcome");
  if (!OUTCOMES.includes(outcome as StageOutcome)) {
    throw new Error(`INVALID_STAGE_RESULT: outcome must be one of ${OUTCOMES.join(", ")}.`);
  }
  const invocation = record.actual_invocation_facts;
  if (!invocation || typeof invocation !== "object" || Array.isArray(invocation) || (invocation as Record<string, unknown>).supplied_fixture !== true) {
    throw new Error("RUNNER_LAUNCH_FORBIDDEN: actual_invocation_facts must prove supplied_fixture=true.");
  }
  for (const forbidden of ["provider", "model", "selected_provider", "selected_model", "launch_command", "pid"]) {
    if (forbidden in (invocation as Record<string, unknown>)) {
      throw new Error(`RUNNER_LAUNCH_FORBIDDEN: actual_invocation_facts.${forbidden} is not allowed.`);
    }
  }
  const boundedProgressLog = stringArray(record.bounded_progress_log, "bounded_progress_log");
  if (boundedProgressLog.length > MAX_LOG_ENTRIES) {
    throw new Error(`INVALID_STAGE_RESULT: bounded_progress_log exceeds ${MAX_LOG_ENTRIES} entries.`);
  }
  return {
    ...(typeof record.stage_result_id === "string" ? { stage_result_id: record.stage_result_id } : {}),
    stage_packet_id: requiredString(record, "stage_packet_id"),
    runner_profile_id: requiredString(record, "runner_profile_id"),
    outcome: outcome as StageOutcome,
    summary: requiredString(record, "summary"),
    files_changed: stringArray(record.files_changed, "files_changed"),
    commands: stringArray(record.commands, "commands"),
    outputs: stringArray(record.outputs, "outputs"),
    blockers: stringArray(record.blockers, "blockers"),
    evidence_refs: stringArray(record.evidence_refs, "evidence_refs"),
    completed_reviews: stringArray(record.completed_reviews, "completed_reviews"),
    anomaly_codes: record.anomaly_codes === undefined ? [] : stringArray(record.anomaly_codes, "anomaly_codes"),
    waiver_refs: record.waiver_refs === undefined ? [] : stringArray(record.waiver_refs, "waiver_refs"),
    validation_results: parseValidationResults(record.validation_results),
    bounded_progress_log: boundedProgressLog,
    actual_invocation_facts: invocation as Record<string, unknown> & { supplied_fixture: true },
    usage_ref: requiredString(record, "usage_ref")
  };
}

export function resolveStageResultTransition(
  packet: Pick<StagePacket, "procedure_id"> & Partial<Pick<StagePacket, "return_procedure_id">>,
  outcome: StageOutcome
): {
  status: StageState["status"];
  human: boolean;
  next: string;
} {
  const transition = resolveStageResultTransitionContract(
    packet.procedure_id,
    outcome,
    packet.return_procedure_id
  );
  if (!transition) {
    throw new Error(`INVALID_STAGE_RESULT_TRANSITION: ${packet.procedure_id} cannot report ${outcome}.`);
  }
  return {
    status: transition.status,
    human: transition.human_action_required,
    next: transition.next
  };
}

function resultIssue(run: Run, packet: StagePacket, fixture: ResultFixture, timestamp: string): { issue: RunIssue; repair: RepairPacket } | undefined {
  const failedChecks = fixture.validation_results.filter((check) => check.status === "fail");
  const missingReviews = packet.required_semantic_reviews.filter((review) => !fixture.completed_reviews.includes(review));
  const anomalyTypes: Record<string, RunIssue["issue_type"] | undefined> = {
    self_approval: "review_independence_violation",
    skipped_architecture_review: "missing_required_review",
    skipped_db_storage_review: "missing_required_review",
    amend_without_fresh_review: "missing_required_review",
    missing_implementation_review: "missing_required_review",
    evidence_masquerades_as_review: "review_independence_violation",
    blocker_note_treated_as_accept: "invalid_stage_result",
    verification_evidence_as_accepted_review: "missing_required_review",
    delivery_import_as_accepted_review: "missing_required_review",
    draft_pr_as_closeout_ready: "fake_closeout_evidence",
    missing_merge_facts_as_closeout_ready: "fake_closeout_evidence",
    superseded_delivery_facts_as_current: "fake_closeout_evidence",
    source_change_before_approval: "source_change_before_approval",
    review_hang: "review_stale_no_output",
    failed_verification: "failed_verification",
    scope_creep: "scope_creep",
    fake_closeout_evidence: "fake_closeout_evidence",
    hooks_absent: undefined,
    hooks_disabled: undefined
  };
  const unknownAnomaly = fixture.anomaly_codes.find((code) => !(code in anomalyTypes));
  if (unknownAnomaly) {
    throw new Error(`INVALID_STAGE_RESULT: unknown anomaly code ${unknownAnomaly}.`);
  }
  let issueType: RunIssue["issue_type"] | undefined;
  let summary = "";
  if (fixture.outcome === "PASS" && fixture.blockers.length > 0) {
    issueType = "invalid_stage_result";
    summary = `PASS result declares blockers: ${fixture.blockers.join("; ")}.`;
  } else if (failedChecks.length > 0) {
    issueType = "failed_verification";
    summary = `Deterministic checks failed: ${failedChecks.map((check) => check.check_id).join(", ")}.`;
  } else if (fixture.outcome === "PASS" && missingReviews.length > 0) {
    issueType = "missing_required_review";
    summary = `Required semantic reviews are missing: ${missingReviews.join(", ")}.`;
  } else if (fixture.outcome === "BLOCKED") {
    issueType = "invalid_stage_result";
    summary = fixture.blockers.join("; ") || `Stage outcome is ${fixture.outcome}.`;
  }
  if (!issueType) {
    return undefined;
  }
  const issue: RunIssue = {
    issue_id: stableId("stage-issue", { packet: packet.stage_packet_id, issueType, summary }),
    phase_id: PHASE_ID,
    issue_type: issueType,
    status: "open",
    blocking: true,
    created_at: timestamp,
    source: "stage_result",
    summary,
    recommended_route: packet.packet_kind === "plan" ? "plan_amend" : "fix_pass",
    stage_id: packet.stage_id,
    severity: "high",
    issue_kind: issueType,
    evidence_refs: fixture.evidence_refs,
    repair_required: true
  };
  const repair: RepairPacket = {
    packet_id: stableId("repair", { issue_id: issue.issue_id }),
    phase_id: PHASE_ID,
    created_at: timestamp,
    route: issue.recommended_route,
    summary: `Repair required for ${packet.procedure_id}.`,
    next_action: issue.recommended_route === "plan_amend" ? "PLAN_AMEND_PACKET" : "FIX_PASS_PACKET",
    issue_ids: [issue.issue_id],
    prompt: `Repair only the recorded failure: ${summary}`,
    target_stage: packet.procedure_id,
    required_repairs: failedChecks.map((check) => check.check_id).concat(missingReviews),
    validation_refs: packet.validation_refs,
    stopping_condition: "stop after the bounded repair and require a fresh independent review"
  };
  return { issue, repair };
}

function persistFixtureValidationStop(
  roots: { targetRoot: string; projectRoot: string },
  run: Run & { run_instance_id: string; run_revision: number },
  packet: StagePacket,
  message: string,
  dryRun: boolean
): void {
  const timestamp = nowIso();
  const missingChecks = message.includes("MISSING_DETERMINISTIC_CHECKS");
  const issue: RunIssue = {
    issue_id: stableId("stage-issue", { packet_id: packet.stage_packet_id, message }),
    phase_id: PHASE_ID,
    issue_type: missingChecks ? "missing_deterministic_checks" : "invalid_stage_result",
    status: "open",
    blocking: true,
    created_at: timestamp,
    source: "stage_result",
    summary: message,
    recommended_route: packet.packet_kind === "plan" ? "plan_amend" : "fix_pass",
    stage_id: packet.stage_id,
    severity: "high",
    issue_kind: missingChecks ? "deterministic_checks" : "result_schema",
    evidence_refs: [],
    repair_required: true
  };
  const repair: RepairPacket = {
    packet_id: stableId("repair", { issue_id: issue.issue_id }),
    phase_id: PHASE_ID,
    created_at: timestamp,
    route: issue.recommended_route,
    summary: "A valid bounded stage-result fixture is required.",
    next_action: packet.packet_kind === "plan" ? "PLAN_AMEND_PACKET" : "FIX_PASS_PACKET",
    issue_ids: [issue.issue_id],
    prompt: `Repair the supplied result fixture only: ${message}`,
    target_stage: packet.stage_id,
    required_repairs: [missingChecks ? "record deterministic validation_results" : "satisfy phase23.8.7-stage-result-v1"],
    validation_refs: packet.validation_refs,
    stopping_condition: "stop until a corrected fixture passes schema and deterministic-check validation"
  };
  const state: StageState = {
    stage_state_id: stableId("stage-state", { issue_id: issue.issue_id }),
    task_id: packet.task_id,
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    project_run_id: packet.project_run_id,
    run_revision: run.run_revision,
    phase_id: PHASE_ID,
    packet_kind: packet.packet_kind,
    procedure_id: packet.procedure_id,
    current_stage: packet.stage_id,
    allowed_next_stages: [],
    missing_inputs: ["valid supplied StageResult fixture"],
    missing_evidence: missingChecks ? ["deterministic validation results"] : ["valid result schema"],
    blockers: [message],
    blocked_disposition: repair.route,
    stop_reason: issue.issue_type,
    status: "blocked",
    stopping_condition: repair.stopping_condition!,
    validation_refs: packet.validation_refs,
    human_action_required: true,
    next_allowed_action: repair.next_action,
    bounded_progress_log: ["fixture received", message, "progression blocked"],
    current: true,
    created_at: timestamp
  };
  if (dryRun) {
    return;
  }
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, run.run_id);
  const persisted = staging.mutateRun(run.run_id, () => ({
    ...run,
    updated_at: timestamp,
    stage_states: [...supersedeCurrent(run.stage_states ?? [], state.stage_state_id), state],
    stage_packets: (run.stage_packets ?? []).map((candidate) => candidate.current
      ? { ...candidate, run_revision: run.run_revision }
      : candidate),
    run_issues: [...run.run_issues.filter((candidate) => candidate.issue_id !== issue.issue_id), issue],
    repair_packets: [...run.repair_packets.filter((candidate) => candidate.packet_id !== repair.packet_id), repair]
  }), {
    expectedRunPresence: "present",
    expectedRunInstanceId: run.run_instance_id,
    expectedRunRevision: run.run_revision
  });
  writeCompatibilityRunArtifacts(roots.targetRoot, persisted);
}

export function recordRuntimeStageResult(cwd: string, options: RecordStageResultOptions): StageResultServiceResult {
  const roots = resolveHarnessRoots(cwd);
  const operator = getRuntimeOperatorStatus(roots.targetRoot, { runId: options.runId, dryRun: options.dryRun });
  if (!operator.run) {
    throw new Error("STAGE_RUN_MISSING: no runtime run is available.");
  }
  const run = operator.run;
  requireExactRun(run);
  const packet = (run.stage_packets ?? []).find((candidate) => candidate.stage_packet_id === options.packetId);
  if (!packet) {
    throw new Error(`STAGE_PACKET_NOT_FOUND: ${options.packetId} is missing.`);
  }
  if (packet.run_id !== run.run_id || packet.run_instance_id !== run.run_instance_id || packet.route_decision_id.length === 0) {
    throw new Error("STAGE_PACKET_IDENTITY_MISMATCH: packet identity does not exactly match the active run.");
  }
  if (packet.current && packet.run_revision + 1 !== run.run_revision) {
    throw new Error("STAGE_PACKET_STALE_REVISION: packet revision no longer exactly precedes the active run revision.");
  }
  const policy = (run.execution_policies ?? []).find((candidate) => candidate.execution_policy_id === packet.execution_policy_id && candidate.current);
  const profile = (run.runner_profiles ?? []).find((candidate) => candidate.runner_profile_id === packet.runner_profile_id && candidate.current);
  if (!policy || !profile || policy.runner_launch_allowed || policy.provider_selection_allowed || profile.can_launch || profile.write_capability !== "none") {
    throw new Error("EXECUTION_POLICY_INVALID: hookless execution policy or runner profile is missing or permits execution.");
  }
  const absolutePath = path.resolve(roots.targetRoot, options.filePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`INVALID_STAGE_RESULT: fixture file not found: ${options.filePath}.`);
  }
  const raw = fs.readFileSync(absolutePath, "utf8");
  let fixture: ResultFixture;
  try {
    fixture = parseResultFixture(raw, packet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    persistFixtureValidationStop(roots, run, packet, message, options.dryRun === true);
    throw error;
  }
  if (fixture.stage_packet_id !== packet.stage_packet_id || fixture.runner_profile_id !== profile.runner_profile_id) {
    throw new Error("STAGE_RESULT_IDENTITY_MISMATCH: fixture packet or runner profile identity is not exact.");
  }
  if (fixture.usage_ref !== packet.usage_ref) {
    throw new Error("STAGE_RESULT_USAGE_MISMATCH: fixture usage reference does not match the packet.");
  }
  const now = Date.now();
  for (const waiverRef of fixture.waiver_refs) {
    const waiver = (run.waiver_records ?? []).find((candidate) =>
      candidate.waiver_id === waiverRef
      && candidate.current
      && candidate.run_id === run.run_id
      && candidate.stage_packet_id === packet.stage_packet_id
    );
    const expiry = waiver?.expires_at === undefined ? undefined : Date.parse(waiver.expires_at);
    if (!waiver || (expiry !== undefined && (!Number.isFinite(expiry) || expiry <= now))) {
      throw new Error(`WAIVER_INVALID: ${waiverRef} is missing, expired, superseded, or bound to another packet.`);
    }
    if (!fixture.validation_results.some((check) => check.check_id === waiver.failed_check && check.status === "fail")) {
      throw new Error(`WAIVER_INVALID: ${waiverRef} is not bound to an actual failed validation check.`);
    }
  }
  const canonicalFixture = canonicalJson(JSON.parse(raw) as unknown);
  const resultId = fixture.stage_result_id ?? stableId("stage-result", {
    stage_packet_id: packet.stage_packet_id,
    fixture: JSON.parse(raw) as unknown
  });
  const existing = (run.stage_results ?? []).find((result) => result.stage_result_id === resultId);
  if (existing) {
    const comparable = {
      stage_packet_id: existing.stage_packet_id,
      runner_profile_id: existing.runner_profile_id,
      outcome: existing.outcome,
      summary: existing.summary,
      files_changed: existing.files_changed,
      commands: existing.commands,
      outputs: existing.outputs,
      blockers: existing.blockers,
      evidence_refs: existing.evidence_refs,
      completed_reviews: existing.completed_reviews,
      anomaly_codes: existing.anomaly_codes,
      waiver_refs: existing.waiver_refs,
      validation_results: existing.validation_results,
      bounded_progress_log: existing.bounded_progress_log,
      actual_invocation_facts: existing.actual_invocation_facts,
      usage_ref: existing.usage_ref
    };
    const requested = { ...fixture };
    delete requested.stage_result_id;
    if (canonicalJson(comparable) !== canonicalJson(requested)) {
      throw new Error(`STAGE_RESULT_CONFLICT: ${resultId} already exists with different content.`);
    }
    const state = (run.stage_states ?? []).find((candidate) => candidate.current);
    if (!state) {
      throw new Error("STAGE_STATE_MISSING: idempotent result has no current state.");
    }
    return { ...roots, run, stageState: state, stageResult: existing, recorded: false, dryRun: options.dryRun === true };
  }
  if (!packet.current) {
    throw new Error(`STAGE_PACKET_NOT_CURRENT: ${options.packetId} is superseded and has no identical recorded result.`);
  }
  const timestamp = nowIso();
  const issueArtifacts = resultIssue(run, packet, fixture, timestamp);
  const transition = resolveStageResultTransition(packet, fixture.outcome);
  const state: StageState = {
    stage_state_id: stableId("stage-state", { stage_result_id: resultId, next: transition.next }),
    task_id: run.active_task_path ?? run.task_path,
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    project_run_id: run.run_instance_id,
    run_revision: run.run_revision,
    phase_id: PHASE_ID,
    packet_kind: packet.packet_kind,
    procedure_id: packet.procedure_id,
    current_stage: issueArtifacts?.repair.next_action ?? transition.next,
    allowed_next_stages: [issueArtifacts?.repair.next_action ?? transition.next],
    missing_inputs: issueArtifacts ? issueArtifacts.repair.required_repairs ?? [] : [],
    missing_evidence: issueArtifacts ? issueArtifacts.repair.validation_refs ?? [] : [],
    blockers: issueArtifacts ? [issueArtifacts.issue.summary] : [],
    blocked_disposition: issueArtifacts ? issueArtifacts.repair.route : "none",
    stop_reason: issueArtifacts ? issueArtifacts.issue.issue_type : "result_recorded",
    status: issueArtifacts ? "blocked" : transition.status,
    stopping_condition: issueArtifacts?.repair.stopping_condition ?? "stop after recording this result; do not collapse or skip the next stage",
    validation_refs: packet.validation_refs,
    human_action_required: issueArtifacts ? true : transition.human,
    next_allowed_action: issueArtifacts?.repair.next_action ?? transition.next,
    bounded_progress_log: [...fixture.bounded_progress_log, "fixture schema validated", "stage result recorded"].slice(-MAX_LOG_ENTRIES),
    current: true,
    created_at: timestamp
  };
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, run.run_id);
  let builtResult: StageResult | undefined;
  const buildNext = (payloadId: string): Run => {
    builtResult = {
      stage_result_id: resultId,
      result_id: resultId,
      stage_packet_id: packet.stage_packet_id,
      packet_id: packet.stage_packet_id,
      run_id: run.run_id,
      run_instance_id: run.run_instance_id,
      project_run_id: run.run_instance_id,
      packet_run_revision: packet.run_revision,
      phase_id: PHASE_ID,
      procedure_id: packet.procedure_id,
      runner_profile_id: profile.runner_profile_id,
      runner_id: profile.runner_id,
      runner_metadata: fixture.actual_invocation_facts,
      outcome: fixture.outcome,
      summary: fixture.summary,
      files_changed: fixture.files_changed,
      commands: fixture.commands,
      commands_run: fixture.commands,
      outputs: fixture.outputs,
      blockers: fixture.blockers,
      declared_blockers: fixture.blockers,
      blocked_disposition: issueArtifacts?.repair.route ?? "none",
      payload_refs: [payloadId],
      evidence_refs: fixture.evidence_refs,
      completed_reviews: fixture.completed_reviews,
      anomaly_codes: fixture.anomaly_codes,
      waiver_refs: fixture.waiver_refs,
      validation_results: fixture.validation_results,
      bounded_progress_log: fixture.bounded_progress_log,
      progress_log_ref: `${resultId}#bounded_progress_log`,
      route_decision_ref: packet.route_decision_ref,
      route_decision_id: packet.route_decision_id,
      actual_invocation_facts: fixture.actual_invocation_facts,
      usage_ref: fixture.usage_ref,
      usage_facts_ref: fixture.usage_ref,
      payload_id: payloadId,
      schema_valid: true,
      result_schema_valid: true,
      current: true,
      recorded_at: timestamp
    };
    return {
      ...run,
      updated_at: timestamp,
      stage_states: [...supersedeCurrent(run.stage_states ?? [], state.stage_state_id), state],
      stage_packets: (run.stage_packets ?? []).map((candidate) => candidate.stage_packet_id === packet.stage_packet_id
        ? { ...candidate, current: false, superseded_by: resultId }
        : candidate),
      stage_results: [...supersedeCurrent(
        run.stage_results ?? [],
        resultId,
        (candidate) => candidate.procedure_id === packet.procedure_id
      ), builtResult],
      ...(issueArtifacts
        ? {
            run_issues: [...run.run_issues.filter((candidate) => candidate.issue_id !== issueArtifacts.issue.issue_id), issueArtifacts.issue],
            repair_packets: [...run.repair_packets.filter((candidate) => candidate.packet_id !== issueArtifacts.repair.packet_id), issueArtifacts.repair]
          }
        : {})
    };
  };
  if (options.dryRun) {
    const preview = buildNext(stableId("payload-preview", canonicalFixture));
    return { ...roots, run: preview, stageState: state, stageResult: builtResult!, ...(issueArtifacts ? { issue: issueArtifacts.issue, repairPacket: issueArtifacts.repair } : {}), recorded: false, dryRun: true };
  }
  const persisted = staging.mutateRunWithDatabase(run.run_id, (_current, database) => {
    const payload = new PayloadStore(database).store({
      parentRecordId: resultId,
      sourceRunId: run.run_id,
      sourcePhaseId: PHASE_ID,
      sourceStepId: packet.procedure_id,
      kind: "stage_result_fixture",
      mediaType: "application/json",
      summary: `Stage result fixture for ${packet.procedure_id}.`,
      content: raw,
      searchableText: `${packet.procedure_id} ${fixture.outcome} ${fixture.summary}`,
      boundedExcerpt: raw.slice(0, 2000),
      retentionClass: "accepted"
    });
    return buildNext(payload.payload_id);
  }, {
    expectedRunPresence: "present",
    expectedRunInstanceId: run.run_instance_id,
    expectedRunRevision: run.run_revision
  });
  const readback = staging.readStageResultPayload({
    resultId,
    payloadId: builtResult!.payload_id,
    sourceRunId: run.run_id,
    procedureId: packet.procedure_id
  });
  if (canonicalJson(JSON.parse(readback) as unknown) !== canonicalFixture) {
    throw new Error("STAGE_RESULT_PAYLOAD_MISMATCH: stored fixture content differs from the accepted result.");
  }
  writeCompatibilityRunArtifacts(roots.targetRoot, persisted);
  return {
    ...roots,
    run: persisted,
    stageState: state,
    stageResult: builtResult!,
    ...(issueArtifacts ? { issue: issueArtifacts.issue, repairPacket: issueArtifacts.repair } : {}),
    recorded: true,
    dryRun: false
  };
}
