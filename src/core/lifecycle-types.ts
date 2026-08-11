import { canonicalJson, sha256Hex } from "./evidence-types";

export type RunMode = "normal" | "bootstrap";
export type LifecycleStatus = "active" | "blocked" | "closed" | "harvested" | "discarded";
export type BootstrapStatus = "ready" | "blocked";
export type PayloadCompressionStatus = "identity" | "gzip";
export type RedactionState = "not_redacted" | "redacted" | "not_applicable";
export type RetentionClass = "accepted" | "audit" | "quarantine" | "discarded" | "sensitive";
export type DeliveryFactKind =
  | "pr"
  | "remote_ci"
  | "review"
  | "merge"
  | "merge_result"
  | "merge_commit"
  | "closeout_approval";
export type DeliveryFactStatus =
  | "created"
  | "updated"
  | "pass"
  | "failed"
  | "approved"
  | "rejected"
  | "merged"
  | "closed"
  | "unknown";
export type HarvestStatus = "promoted" | "discarded" | "quarantined";
export type RunIssueStatus = "open" | "resolved";
export type RunIssueRoute = "fix_pass" | "plan_amend" | "supporting_fix" | "new_task";
export type RunIssueType =
  | "uncommitted_task_activation"
  | "missing_commit_backed_activation"
  | "dirty_git_after_task_activation"
  | "task_worktree_authority_mismatch"
  | "task_branch_authority_mismatch"
  | "bootstrap_authority_ambiguous"
  | "bootstrap_authority_unmatched"
  | "missing_base_authority"
  | "worktree_bootstrap_not_ready"
  | "missing_route_context_evidence"
  | "illegal_stage_transition"
  | "invalid_stage_result"
  | "missing_deterministic_checks"
  | "missing_required_review"
  | "review_independence_violation"
  | "source_change_before_approval"
  | "scope_creep"
  | "failed_verification"
  | "review_stale_no_output"
  | "fake_closeout_evidence";

export type BootstrapIssuePhaseId = "23.8.6C" | "23.8.6C2" | "23.8.6C2A" | "23.8.7";

export type StagePacketKind = "plan" | "implementation" | "review" | "fix-pass" | "closeout";
export type StageOutcome = "PASS" | "FIX_REQUIRED" | "AMEND_REQUIRED" | "BLOCKED";
export type StageStateStatus = "ready" | "blocked" | "result_recorded" | "superseded";

export interface StageResultTransition {
  status: Exclude<StageStateStatus, "ready" | "superseded">;
  human_action_required: boolean;
  next: string;
}

export function deriveStagePacketId(packet: Pick<
  StagePacket,
  | "run_id"
  | "run_instance_id"
  | "packet_kind"
  | "procedure_id"
  | "return_procedure_id"
  | "route_decision_id"
  | "context_core_id"
  | "context_manifest_id"
  | "delta_overlay_id"
  | "source_snapshot"
>): string {
  return `stage-packet-${sha256Hex(canonicalJson({
    run_id: packet.run_id,
    run_instance_id: packet.run_instance_id,
    packet_kind: packet.packet_kind,
    procedure_id: packet.procedure_id,
    return_procedure_id: packet.return_procedure_id,
    route_decision_id: packet.route_decision_id,
    context_core_id: packet.context_core_id,
    context_manifest_id: packet.context_manifest_id,
    delta_overlay_id: packet.delta_overlay_id,
    source_snapshot: packet.source_snapshot
  })).slice(0, 24)}`;
}

const PASS_STAGE_BY_PROCEDURE: Readonly<Record<string, string>> = {
  "task-intake": "TASK_PROMPT_PACKET",
  "task-prompt-writer": "PLAN_DRAFT_PACKET",
  "draft-plan": "PLAN_REVIEW_PACKET",
  "plan-amend": "PLAN_REVIEW_PACKET",
  "plan-review": "PLAN_APPROVAL_REQUIRED",
  "architecture-review": "NEXT_SEMANTIC_REVIEW_PACKET",
  "db-storage-review": "NEXT_SEMANTIC_REVIEW_PACKET",
  implementation: "IMPLEMENTATION_REVIEW_PACKET",
  "implementation-review": "VERIFICATION_REVIEW_PACKET",
  "verification-review": "DELIVERY_FACTS_REVIEW_PACKET",
  "delivery-facts-review": "PHASE_CLOSEOUT_REVIEW_PACKET",
  "phase-closeout-review": "CLOSEOUT_PACKET"
};

const REVIEW_STAGE_BY_PROCEDURE: Readonly<Record<string, string>> = {
  "plan-review": "PLAN_REVIEW_PACKET",
  "architecture-review": "ARCHITECTURE_REVIEW_PACKET",
  "db-storage-review": "DB_STORAGE_REVIEW_PACKET",
  "implementation-review": "IMPLEMENTATION_REVIEW_PACKET",
  "verification-review": "VERIFICATION_REVIEW_PACKET",
  "delivery-facts-review": "DELIVERY_FACTS_REVIEW_PACKET",
  "phase-closeout-review": "PHASE_CLOSEOUT_REVIEW_PACKET"
};

const FIXABLE_REVIEW_PROCEDURES = new Set([
  "architecture-review",
  "db-storage-review",
  "implementation-review",
  "fix-pass-review",
  "verification-review",
  "delivery-facts-review",
  "phase-closeout-review"
]);

export function resolveStageResultTransitionContract(
  procedureId: string,
  outcome: StageOutcome,
  returnProcedureId?: string
): StageResultTransition | undefined {
  if (outcome === "BLOCKED") {
    return { status: "blocked", human_action_required: true, next: "BLOCKED_DISPOSITION" };
  }
  if (outcome === "AMEND_REQUIRED") {
    return procedureId === "plan-review"
      ? { status: "result_recorded", human_action_required: true, next: "PLAN_AMEND_PACKET" }
      : undefined;
  }
  if (outcome === "FIX_REQUIRED") {
    return FIXABLE_REVIEW_PROCEDURES.has(procedureId)
      ? { status: "result_recorded", human_action_required: true, next: "FIX_PASS_PACKET" }
      : undefined;
  }
  if (procedureId === "fix-pass-review") {
    const next = REVIEW_STAGE_BY_PROCEDURE[returnProcedureId ?? "implementation-review"];
    return next
      ? { status: "result_recorded", human_action_required: false, next }
      : undefined;
  }
  const next = PASS_STAGE_BY_PROCEDURE[procedureId];
  return next
    ? {
        status: "result_recorded",
        human_action_required: procedureId === "plan-review",
        next
      }
    : undefined;
}

export interface StageState {
  stage_state_id: string;
  task_id: string;
  run_id: string;
  run_instance_id: string;
  project_run_id: string;
  run_revision: number;
  phase_id: "23.8.7";
  packet_kind: StagePacketKind;
  procedure_id: string;
  current_stage: string;
  allowed_next_stages: string[];
  missing_inputs: string[];
  missing_evidence: string[];
  blockers: string[];
  blocked_disposition: string;
  stop_reason: string;
  status: StageStateStatus;
  stopping_condition: string;
  validation_refs: string[];
  human_action_required: boolean;
  next_allowed_action: string;
  bounded_progress_log: string[];
  current: boolean;
  superseded_by?: string;
  created_at: string;
}

export interface StagePacket {
  stage_packet_id: string;
  packet_id: string;
  task_id: string;
  run_id: string;
  run_instance_id: string;
  project_run_id: string;
  run_revision: number;
  phase_id: "23.8.7";
  packet_kind: StagePacketKind;
  stage_id: string;
  procedure_id: string;
  return_procedure_id: string;
  task_path: string;
  source_snapshot: string;
  effective_plan_ref: string;
  procedure_artifact_ref: string;
  payload_refs: string[];
  evidence_refs: string[];
  input_refs: string[];
  output_contract: string;
  required_result_schema: string;
  progress_log_contract: string;
  execution_policy_ref: string;
  route_decision_ref: string;
  route_policy_ref: string;
  provider_binding_ref: string;
  context_core_ref: string;
  delta_overlay_ref: string;
  context_manifest_ref: string;
  context_transport_ref: string;
  usage_facts_ref: string;
  route_decision_id: string;
  route_class: string;
  routing_policy_version: string;
  binding_version: string;
  binding_profile_id: string;
  profile_floor: string;
  default_reasoning_effort: string;
  reasoning_default: string;
  reasoning_effort_ceiling: string;
  reasoning_ceiling: string;
  changed_surfaces: string[];
  changed_surface_classes: string[];
  risk_classes: string[];
  evidence_state: string;
  deterministic_evidence_state: string;
  independence_requirement: string;
  independence_mode: string;
  context_core_id: string;
  context_manifest_id: string;
  delta_overlay_id: string;
  context_mode: string;
  context_transport_mode: string;
  required_semantic_reviews: string[];
  parallel_policy: "serial";
  budget: { max_result_bytes: number; max_log_entries: number };
  budget_class: string;
  usage_ref: string;
  escalation_triggers: string[];
  runner_profile_id: string;
  execution_policy_id: string;
  stopping_condition: string;
  validation_refs: string[];
  bounded_progress_log: string[];
  current: boolean;
  superseded_by?: string;
  created_at: string;
}

export interface StageValidationResult {
  check_id: string;
  status: "pass" | "fail";
  summary: string;
  evidence_refs: string[];
}

export interface StageResult {
  stage_result_id: string;
  result_id: string;
  stage_packet_id: string;
  packet_id: string;
  run_id: string;
  run_instance_id: string;
  project_run_id: string;
  packet_run_revision: number;
  phase_id: "23.8.7";
  procedure_id: string;
  runner_profile_id: string;
  runner_id: string;
  runner_metadata: Record<string, unknown>;
  outcome: StageOutcome;
  summary: string;
  files_changed: string[];
  commands: string[];
  commands_run: string[];
  outputs: string[];
  blockers: string[];
  declared_blockers: string[];
  blocked_disposition: string;
  payload_refs: string[];
  evidence_refs: string[];
  completed_reviews: string[];
  anomaly_codes: string[];
  waiver_refs: string[];
  validation_results: StageValidationResult[];
  bounded_progress_log: string[];
  progress_log_ref: string;
  route_decision_ref: string;
  route_decision_id: string;
  actual_invocation_facts: Record<string, unknown> & { supplied_fixture: true };
  usage_ref: string;
  usage_facts_ref: string;
  payload_id: string;
  schema_valid: true;
  result_schema_valid: true;
  current: boolean;
  superseded_by?: string;
  recorded_at: string;
}

export interface RunnerProfile {
  runner_profile_id: string;
  runner_id: string;
  phase_id: "23.8.7";
  adapter_kind: "supplied_fixture";
  runner_kind: "supplied_fixture";
  supported_roles: string[];
  supported_packet_kinds: StagePacketKind[];
  structured_output_support: true;
  can_launch: false;
  write_capability: "none";
  accepts_result_fixture: true;
  description: string;
  session_support: "none";
  status: "active";
  current: boolean;
  created_at: string;
}

export interface ExecutionPolicy {
  execution_policy_id: string;
  phase_id: "23.8.7";
  policy_version: string;
  role: "fixture_ingestion";
  write_scope: "run_staging_only";
  sandbox_mode: "no_runner";
  approval_policy: "human_only";
  network_policy: "forbidden";
  command_policy: "record_only";
  timeout_policy: "not_applicable";
  allowed_paths: string[];
  forbidden_paths: string[];
  allowed_runner_profile_ids: string[];
  allowed_packet_kinds: StagePacketKind[];
  deterministic_checks_required: true;
  runner_launch_allowed: false;
  provider_selection_allowed: false;
  max_result_bytes: number;
  max_log_entries: number;
  current: boolean;
  created_at: string;
}

export interface WaiverRecord {
  waiver_id: string;
  phase_id: "23.8.7";
  run_id: string;
  stage_packet_id: string;
  control_id: string;
  failed_check: string;
  granted_by: string;
  approver: string;
  reason: string;
  scope: string;
  evidence_refs: string[];
  expires_at?: string;
  current: boolean;
  created_at: string;
}

export interface PayloadRecord {
  payload_id: string;
  parent_record_id: string;
  source_run_id: string;
  source_phase_id?: string;
  source_step_id?: string;
  kind: string;
  media_type: string;
  summary: string;
  searchable_text?: string;
  bounded_excerpt?: string;
  redaction_status: RedactionState;
  retention_class: RetentionClass;
  compression_status: PayloadCompressionStatus;
  chunk_count: number;
  raw_size_bytes: number;
  stored_size_bytes: number;
  content_hash: string;
  created_at: string;
}

export interface DeliveryFactRecord {
  delivery_fact_id: string;
  run_id: string;
  fact_kind: DeliveryFactKind;
  source: string;
  status: DeliveryFactStatus;
  recorded_at: string;
  summary: string;
  url?: string;
  external_run_id?: string;
  commit_sha?: string;
  excerpt_payload_id?: string;
  metadata?: Record<string, unknown>;
}

export interface DeliverySourceRelationshipV1 {
  schema_version: 1;
  relationship: "identity" | "merge_contains_exact_tree";
  delivered_source_head: string;
  final_reviewed_source_head: string;
  delivered_tree_hash: string;
  final_reviewed_tree_hash: string;
  ancestry: "same_commit" | "ancestor";
  delivery_fact_id: string;
}

export interface RunIssue {
  issue_id: string;
  phase_id: BootstrapIssuePhaseId;
  issue_type: RunIssueType;
  status: RunIssueStatus;
  blocking: true;
  created_at: string;
  source: "bootstrap" | "stage_packet" | "stage_result";
  summary: string;
  details?: string;
  recommended_route: RunIssueRoute;
  stage_id?: string;
  severity?: "low" | "medium" | "high";
  issue_kind?: string;
  evidence_refs?: string[];
  repair_required?: boolean;
}

export interface RepairPacket {
  packet_id: string;
  phase_id: BootstrapIssuePhaseId;
  created_at: string;
  route: RunIssueRoute;
  summary: string;
  next_action: string;
  issue_ids: string[];
  prompt: string;
  target_stage?: string;
  required_repairs?: string[];
  validation_refs?: string[];
  stopping_condition?: string;
}

export interface HarvestRecord {
  harvest_id: string;
  run_id: string;
  project_run_id: string;
  status: HarvestStatus;
  promoted_at: string;
  accepted_count: number;
  discarded_count: number;
  quarantined_count: number;
  redacted_count: number;
  unresolved_count: number;
  source_task_path: string;
  source_snapshot: string;
  details: Record<string, unknown> & {
    procedure_artifact_transfer_count?: number;
    procedure_artifact_payload_transfer_count?: number;
    procedure_artifact_payload_chunk_transfer_count?: number;
    procedure_artifact_payload_byte_count?: number;
  };
}
