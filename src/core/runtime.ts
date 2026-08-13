import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as os from "node:os";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { type VerifierRecord, validateVerifierRecord } from "./checks";
import { ArtifactStore as EvidenceArtifactStore } from "./artifact-store";
import { formatCommandForDisplay, runStructuredCommand } from "./command-runner";
import { MemoryEvidenceStore } from "./evidence-store";
import {
  DEFAULT_EVIDENCE_NAMESPACE,
  type ArtifactEvidenceRef,
  type EvidenceEventEnvelope,
  type EvidenceScope,
  canonicalJson,
  type VerificationCommandResultEvidence,
  type VerificationCommandSpec,
  type VerificationReuseDecision,
  type VerifiedSnapshot,
  buildTargetProjectId,
  sha256Hex
} from "./evidence-types";
import {
  buildVerificationReuseDecisionPayload,
  buildVerificationSnapshotPayload,
  captureVerifiedSnapshot,
  decideLocalVerificationReuse
} from "./verification-evidence";
import { detectGitRepository, getGitDiffPatch, getGitStatusLines, getGitStatusPaths, runGitCommand, worktreePathExistsInGit } from "./git";
import { harvestRun } from "./harvest";
import { detectInstalledLayer } from "./install";
import {
  type BootstrapIssuePhaseId,
  type BootstrapStatus,
  type DeliveryFactRecord,
  type DeliverySourceRelationshipV1,
  type LifecycleStatus,
  type RepairPacket,
  type RunIssue,
  type PayloadRecord,
  type RunMode,
  type StageState,
  type StagePacket,
  type StageResult,
  type RunnerProfile,
  type ExecutionPolicy,
  type WaiverRecord,
  deriveStagePacketId,
  resolveStageResultTransitionContract
} from "./lifecycle-types";
import { evaluateMergeFacts } from "./merge-facts";
import { ProjectMemoryDatabase } from "./project-memory-db";
import { PayloadStore } from "./payload-store";
import {
  HARNESS_DIR,
  TASK_REVIEW_FILE,
  TASK_VERIFIER_FILE,
  TASKS_DIR
} from "./paths";
import { type ReviewRecord as HarnessReviewRecord, loadTaskReviewRecord } from "./review";
import {
  RunStagingDatabase,
  type ProcedureArtifactDescriptor,
  formatDatabasePath,
  isSelfHostingRunMode,
  resolveHarnessRoots,
  resolveMemoryDbPaths,
  writeCompatibilityRunArtifacts
} from "./run-staging-db";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata, validateOptionalSchemaMetadata } from "./schema-migrations";
import {
  indexSelfHostingProceduresById,
  readSelfHostingProcedureRegistry,
  type SelfHostingProcedureDescriptor,
  type SelfHostingProcedureRegistry,
  type SelfHostingReviewLaunchProfile
} from "./self-hosting-procedures";
import {
  decideReviewRoute,
  deriveRequiredSemanticReviews,
  parseTaskPlanningReviewAuthorityFacts,
  resolvePlanningReviewFacts,
  readCodexReferenceBinding,
  readProcedureExecutionPolicy,
  readReviewRoutePolicy,
  reconcileProcedureExecutionPolicy,
  resolveReviewLaunchTiming,
  resolveCodexBinding,
  type CodexBindingProfile,
  type ReviewRouteDecision
} from "./self-hosting-review-policy";
import {
  assembleReviewRequest,
  buildContextCore,
  buildContextManifest,
  buildReviewDeltaOverlay,
  type ContextCore,
  type ContextManifest,
  type ReviewDeltaOverlay
} from "./self-hosting-review-context";
import {
  evaluatePromotionGates,
  routingEvaluationId,
  validateRoutingEvaluationBundle,
  type RoutingDecisionKind
} from "./review-routing-evaluation";
import {
  buildPreparedSuccessorCleanupReceipt,
  readPreparedSuccessorCleanupEvidence
} from "./prepared-successor-cleanup";
import { createTask, getTaskDirectory, listTasks, readTaskStateById, writeTaskState, type TaskState } from "./tasks";
import { bootstrapWorktree } from "./worktree";
import { materializeZeroOwnerTaskState } from "./zero-owner-materialization";
import { buildSuccessorDisposition } from "./successor-disposition";
import {
  buildProofRecord,
  extractTaskRequirements,
  parseProofDerivationRequest,
  type DeliverySliceV1,
  type EvidenceGapV1,
  type EvidenceRefV1,
  type ProofRecordV1,
  type ReviewOperatingContextV1
} from "./proof-record";
import {
  assertPlanningBundleIdentity,
  buildReviewAttempt,
  buildReviewAttemptRecord,
  buildReviewAttemptEvent,
  buildReviewCohort,
  buildPlanningReviewBundleRecord,
  parseRawReviewStartupObservation,
  type RawReviewStartupObservationV1
} from "./review-cohort";
import {
  aggregatePlanBlockers,
  resolvePlanningCohortDisposition,
  validatePlanningLensResult,
  type PlanningCohortDispositionResult,
  type PlanningLensResultV1
} from "./plan-contract";
import {
  buildProofEligibilitySnapshot,
  type ProcedureRequirementV1,
  type StageRequirementV1
} from "./proof-eligibility";

export const RUNTIME_CONTRACT_NAMES = [
  "Run",
  "RunIssue",
  "RepairPacket",
  "StageState",
  "StagePacket",
  "StageResult",
  "RunnerProfile",
  "ExecutionPolicy",
  "WaiverRecord",
  "PhaseRun",
  "Step",
  "ArtifactRef",
  "EvidenceRef",
  "Finding",
  "Decision",
  "Approval",
  "CommandResult",
  "VerificationResult",
  "ReviewResult",
  "CloseoutReceipt",
  "RepositoryRef",
  "ChangeSet",
  "CIRunRef",
  "RemoteCheckResult",
  "RemoteGateStatus",
  "RequiredGate"
] as const;

export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
export type CommandResultStatus = "pass" | "fail" | "unknown";
export type VerificationResultStatus = "pass" | "fail" | "captured" | "missing" | "unknown";
export type ReviewResultStatus = "PASS" | "FIX_REQUIRED" | "MISSING" | "UNKNOWN";
export type FindingSeverity = "info" | "low" | "medium" | "high";
export type FindingStatus = "open" | "resolved";
export type ApprovalStatus = "approved" | "rejected" | "pending";
export type RemoteGateStatus = "pass" | "failed" | "skipped" | "missing" | "unknown";
export type CloseoutStatus = "READY" | "BLOCKED";
type LegacyRunStatus = "running" | "ready" | "blocked" | "closed";

export interface BootstrapFact {
  fact_id: string;
  label: "active_task_path" | "branch" | "worktree_root" | "source_snapshot" | "base_commit" | "run_identity";
  value: string;
  source: "task_pointer" | "git" | "task_state" | "git_merge_base" | "runtime";
}

export interface WorkerHandoff {
  handoff_id: string;
  phase_id: "23.8.6C";
  kind: "procedure" | "implementation";
  procedure_id: string;
  next_action: string;
  prompt: string;
}

export interface RepositoryRef {
  root_path: string;
  project_root: string;
  branch?: string;
  head_sha?: string;
  task_worktree_path?: string;
  dirty: boolean;
}

export interface ChangeSet {
  git_status_lines: string[];
  changed_paths: string[];
  is_dirty: boolean;
}

export interface ArtifactRef {
  artifact_id: string;
  path: string;
  kind: string;
  producer_command?: string;
  description?: string;
}

export interface EvidenceRef {
  evidence_id: string;
  kind: string;
  summary: string;
  artifact_id?: string;
  path?: string;
}

export interface CommandResult {
  command_result_id: string;
  command: string;
  exit_code?: number;
  status: CommandResultStatus;
  started_at?: string;
  completed_at: string;
  duration_ms?: number;
  step_id?: string;
  artifact_refs: ArtifactRef[];
}

export interface Step {
  step_id: string;
  name: string;
  status: StepStatus;
  started_at: string;
  completed_at?: string;
  phase_run_id?: string;
  artifact_refs: ArtifactRef[];
  evidence_refs: EvidenceRef[];
  command_result_ids: string[];
}

export interface PhaseRun {
  phase_run_id: string;
  phase_id: string;
  task_path: string;
  status: StepStatus;
  started_at: string;
  completed_at?: string;
  step_ids: string[];
}

export interface Finding {
  finding_id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  blocking: boolean;
  created_at: string;
  details?: string;
  evidence_refs: EvidenceRef[];
}

export interface Decision {
  decision_id: string;
  title: string;
  rationale: string;
  created_at: string;
  approver?: string;
}

export interface Approval {
  approval_id: string;
  title: string;
  status: ApprovalStatus;
  created_at: string;
  approver?: string;
  reason?: string;
  reviewed_plan_artifact_id?: string;
  reviewed_plan_content_hash?: string;
  reviewed_evidence_artifact_id?: string;
}

export interface ImplementationBaselineBinding {
  schema_version: 1 | 2;
  approval_id: string;
  plan_artifact_hash: string;
  plan_review_artifact_hash?: string;
  planning_review_source_head: string;
  authority_transition?: "reviewed_source" | "owner_authorized_overlay";
  owner_authority_diff_hash: string;
  implementation_baseline_head: string;
  implementation_baseline_tree_hash: string;
  expected_tree_hash: string;
  bound_at: string;
}

export interface VerificationResult {
  verification_result_id: string;
  status: VerificationResultStatus;
  created_at: string;
  summary: string;
  source: string;
  artifact_refs: ArtifactRef[];
  command_results: CommandResult[];
}

export interface ReviewResult {
  review_result_id: string;
  status: ReviewResultStatus;
  created_at: string;
  summary: string;
  source: string;
  blockers: string[];
  artifact_refs: ArtifactRef[];
}

export interface CIRunRef {
  provider: string;
  run_id?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface RemoteCheckResult {
  check_result_id: string;
  gate_id: string;
  name: string;
  status: RemoteGateStatus;
  required: boolean;
  recorded_at: string;
  ci_run: CIRunRef;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export interface RequiredGate {
  gate_id: string;
  name: string;
  required: boolean;
  status: RemoteGateStatus;
  explanation?: string;
  check_result_id?: string;
}

export interface CloseoutReceipt {
  schema_version: typeof CURRENT_SCHEMA_VERSION;
  producer_command: string;
  receipt_id: string;
  run_id: string;
  task_path: string;
  active_task_path?: string;
  phase_id?: string;
  status: CloseoutStatus;
  created_at: string;
  repository: RepositoryRef;
  change_set: ChangeSet;
  verification_result: VerificationResult;
  review_result: ReviewResult;
  findings: Finding[];
  decisions: Decision[];
  approvals: Approval[];
  required_gates: RequiredGate[];
  remote_checks: RemoteCheckResult[];
  blockers: string[];
  delivery_facts?: DeliveryFactRecord[];
}

export interface Run {
  schema_version: typeof CURRENT_SCHEMA_VERSION;
  producer_command: string;
  run_id: string;
  run_instance_id?: string;
  run_revision?: number;
  task_path: string;
  active_task_path?: string;
  phase_id?: string;
  run_mode: RunMode;
  lifecycle_status: LifecycleStatus;
  created_at: string;
  updated_at: string;
  repository: RepositoryRef;
  phase_runs: PhaseRun[];
  steps: Step[];
  artifacts: ArtifactRef[];
  evidence: EvidenceRef[];
  findings: Finding[];
  decisions: Decision[];
  approvals: Approval[];
  command_results: CommandResult[];
  verification_results: VerificationResult[];
  review_results: ReviewResult[];
  required_gates: RequiredGate[];
  remote_checks: RemoteCheckResult[];
  delivery_facts: DeliveryFactRecord[];
  closeout_receipts: CloseoutReceipt[];
  bootstrap_status?: BootstrapStatus;
  bootstrap_facts?: BootstrapFact[];
  bootstrap_handoff?: WorkerHandoff;
  run_issues: RunIssue[];
  repair_packets: RepairPacket[];
  discard_reason?: string;
  manual_override_reason?: string;
  harvested_at?: string;
  source_snapshot?: string;
  source_staging_db_path?: string;
  implementation_baseline_head?: string;
  implementation_baseline_binding?: ImplementationBaselineBinding;
  final_reviewed_source_head?: string;
  delivered_source_head?: string;
  delivery_source_relationship?: DeliverySourceRelationshipV1;
  review_launch_claims?: ReviewLaunchClaim[];
  review_routing_records?: ReviewOperationalRecord[];
  stage_states?: StageState[];
  stage_packets?: StagePacket[];
  stage_results?: StageResult[];
  runner_profiles?: RunnerProfile[];
  execution_policies?: ExecutionPolicy[];
  waiver_records?: WaiverRecord[];
}

export interface BuildRuntimeRunInput {
  runId: string;
  taskPath: string;
  repository: RepositoryRef;
  timestamp?: string;
  activeTaskPath?: string;
  phaseId?: string;
  producerCommand?: string;
  requiredGates?: RequiredGate[];
}

export interface RuntimeServiceResult {
  targetRoot: string;
  projectRoot: string;
  dryRun: boolean;
  run: Run;
  bootstrap?: RuntimeBootstrapResult;
  runPath?: string;
  projectDbPath?: string;
  stagingDbPath?: string;
  state: "blocked" | "created" | "loaded" | "preview" | "updated";
}

export interface RuntimeBootstrapResult {
  status: BootstrapStatus;
  facts: BootstrapFact[];
  operator: RuntimeOperatorStatus;
  issues: RunIssue[];
  repairPacket?: RepairPacket;
  handoff?: WorkerHandoff;
}

export interface RuntimeVerificationResult extends RuntimeServiceResult {
  verification: VerificationResult;
}

export interface RuntimeRemoteStatusResult extends RuntimeServiceResult {
  remoteCheck: RemoteCheckResult;
}

export interface RuntimeProcedureResult extends RuntimeServiceResult {
  procedureId: string;
  evidence: EvidenceRef;
  artifact: ArtifactRef;
  recorded: boolean;
}

export interface RuntimePlanApprovalResult extends RuntimeServiceResult {
  approval: Approval;
  evidence: EvidenceRef;
  artifact: ArtifactRef;
  recorded: boolean;
}

export interface RuntimeImplementationBaselineResult extends RuntimeServiceResult {
  binding: ImplementationBaselineBinding;
  recorded: boolean;
}

export interface RuntimeIndependentRecordResult extends RuntimeServiceResult {
  recordKind: "proof_record" | "review_capability_evidence";
  recordId: string;
  recorded: boolean;
}

export interface RecordIndependentFileOptions {
  runId?: string;
  filePath: string;
  expectedSha?: string;
  dryRun?: boolean;
}

export interface LaunchPlanningReviewBundleOptions {
  runId?: string;
  requestPath: string;
  outputPath: string;
  lensManifestPath: string;
  timeoutSeconds?: number;
  staleAfterSeconds?: number;
  dryRun?: boolean;
}

export interface RuntimeNextTaskDecisionResult extends RuntimeServiceResult {
  decision: Decision;
  evidence?: EvidenceRef;
  artifact?: ArtifactRef;
  recorded: boolean;
}

export interface RuntimeTaskMaterializationResult {
  targetRoot: string;
  projectRoot: string;
  dryRun: boolean;
  decisionId: string;
  branch: string;
  worktreePath: string;
  taskPath: string;
  created: boolean;
  recoveredExistingActivation: boolean;
  taskStateId?: string;
  handoffRequired: true;
  nextAction: string;
  state: "prepared" | "preview";
}

export type ReviewLaunchStatus =
  | "success"
  | "dry_run"
  | "denied"
  | "failed"
  | "timeout"
  | "blocked"
  | "invalid_artifact";

export interface ReviewLaunchClaim {
  claim_id: string;
  attempt_id: string;
  attempt_marker: string;
  procedure_id: "plan-review" | "implementation-review" | "fix-pass-review";
  owner_token_hash: string;
  created_at: string;
  request_artifact_hash: string;
  expected_output_path: string;
  timeout_seconds: number;
  stale_after_seconds: number;
  termination_policy: "terminal_completion_only";
  pid?: number;
  progress_unknown_at?: string;
}

export interface ReviewOperationalRecord {
  record_kind: "review_invocation" | "review_replay_packet" | "routing_evaluation" | "routing_decision" | "routing_policy_application" | "prepared_successor_cleanup";
  record_id: string;
  created_at: string;
  status: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface ReviewLaunchObservation {
  status: ReviewLaunchStatus;
  attempt_id?: string;
  procedure_id: string;
  run_id: string;
  run_instance_id?: string;
  project_run_id?: string;
  adapter_id: "codex_cli";
  model?: string;
  reasoning_effort?: string;
  sandbox_mode: "read-only";
  output_mode?: "file";
  timeout_seconds?: number;
  stale_after_seconds?: number;
  termination_policy?: "terminal_completion_only";
  request_path?: string;
  request_artifact_hash?: string;
  expected_output_path?: string;
  output_path: string;
  launch_command?: string;
  working_directory?: string;
  pid?: number;
  start_time?: string;
  last_output_time?: string;
  progress_unknown_at?: string;
  terminal_exit_code?: number;
  terminal_signal?: string;
  artifact_path?: string;
  artifact_id?: string;
  artifact_present?: boolean;
  artifact_valid?: boolean;
  artifact_hash?: string;
  provenance?: "expected_output_file" | "stdout_fallback" | "final_message_fallback";
  provenance_source?: string;
  exit_code?: number;
  failure_classification?: string;
  blocked_reason?: string;
  summary: string;
  next_valid_action: string;
  stdout_tail?: string;
  stderr_tail?: string;
  payload_refs?: ReviewLaunchPayloadRef[];
  route_decision_id?: string;
  route_class?: string;
  routing_policy_version?: string;
  binding_version?: string;
  binding_profile_id?: string;
  context_core_id?: string;
  context_manifest_id?: string;
  delta_overlay_id?: string;
  context_mode?: string;
  context_reuse?: "hit" | "miss" | "rebuilt";
  context_reuse_reason?: string;
  request_bytes?: number;
  core_bytes?: number;
  delta_bytes?: number;
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_tokens?: number;
  output_tokens?: number;
  tool_call_count?: number;
  latency_ms?: number;
  evaluation_mode?: "approved" | "shadow" | "replay" | "canary";
  approved_attempt_id?: string;
  evaluation_case_id?: string;
  candidate_policy_version?: string;
  candidate_binding_version?: string;
  candidate_profile_id?: string;
  source_application_decision_id?: string;
  source_application_evaluation_id?: string;
  source_policy_file?: string;
  source_policy_blob_hash?: string;
  source_binding_file?: string;
  source_binding_blob_hash?: string;
  source_candidate_id?: string;
  pass_kind?: string;
  immutable_base?: string;
  risk_classes?: string[];
  changed_surface_classes?: string[];
  required_semantic_reviews?: string[];
  review_tier?: OperatorReviewTier;
  usage_ref?: string;
  deterministic_evidence_state?: "complete" | "incomplete";
  parallel_policy?: "serial";
  budget_class?: "balanced" | "critical";
  escalation_triggers?: string[];
  independence_mode?: string;
  canary_authorization_id?: string;
  replay_source_run_instance_id?: string;
  replay_packet_artifact_id?: string;
  predecessor_review_attempt_id?: string;
  predecessor_review_artifact_id?: string;
  predecessor_reviewed_source_head?: string;
  reviewed_source_head?: string;
  reviewed_diff_hash?: string;
  review_claim_id?: string;
  review_claim_owner_token_hash?: string;
}

export interface ReviewRecursionFacts {
  failure_classification: "REVIEW_RECURSION_FORBIDDEN";
  outer_run_instance_id: string;
  outer_procedure_id: string;
  outer_attempt_id: string;
  attempted_nested_procedure_id: string;
  outer_claim_validation: "matched" | "invalid";
  claim_created: false;
  child_spawned: false;
  artifact_wait_started: false;
  next_valid_action: "complete the outer reviewer artifact directly";
}

export class ReviewRecursionForbiddenError extends Error {
  constructor(public readonly facts: ReviewRecursionFacts) {
    super("REVIEW_RECURSION_FORBIDDEN: a launched reviewer must complete its artifact directly.");
    this.name = "ReviewRecursionForbiddenError";
  }
}

export interface ReviewLaunchPayloadRef {
  payload_id: string;
  parent_record_id: string;
  kind: string;
  media_type: string;
  summary: string;
  content_hash: string;
  source_run_id: string;
  source_phase_id?: string;
  retention_class: string;
}

export interface RuntimeReviewLaunchResult extends RuntimeServiceResult {
  observation: ReviewLaunchObservation;
}

export interface RuntimeOperationalRecordResult extends RuntimeServiceResult {
  operationalRecord: ReviewOperationalRecord;
  recorded: boolean;
}

export interface RuntimeCloseoutResult extends RuntimeServiceResult {
  receipt: CloseoutReceipt;
  closeoutPath?: string;
}

export interface RuntimeHarvestResult extends RuntimeServiceResult {
  harvest: import("./lifecycle-types").HarvestRecord;
}

export type OperatorReviewTier = "standard" | "high" | "extra-high";

export interface RuntimeOperatorStatus {
  current_stage: string;
  next_procedure_id: string;
  required_inputs: string[];
  missing_inputs: string[];
  required_evidence: string[];
  missing_evidence: string[];
  stop_reason: string;
  human_action_required: boolean;
  next_allowed_action: string;
  forbidden_actions: string[];
  review_tier: OperatorReviewTier;
  notes?: string[];
}

export interface RuntimeOperatorStatusResult {
  targetRoot: string;
  projectRoot: string;
  dryRun: boolean;
  operator: RuntimeOperatorStatus;
  run?: Run;
  runPath?: string;
  closeoutPath?: string;
}

export interface StartRuntimeRunOptions {
  taskPath: string;
  dryRun?: boolean;
}

export interface RuntimeDryRunOptions {
  dryRun?: boolean;
  runId?: string;
}

export interface RecordRemoteStatusOptions extends RuntimeDryRunOptions {
  provider?: string;
  providerRunId?: string;
  providerUrl?: string;
  gateId?: string;
  name?: string;
  status?: RemoteGateStatus;
  required?: boolean;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export interface MarkDiscardableOptions extends RuntimeDryRunOptions {
  reason: string;
}

export interface RecordProcedureOptions extends RuntimeDryRunOptions {
  procedureId: string;
  filePath: string;
}

export interface LaunchReviewOptions extends RuntimeDryRunOptions {
  procedureId: string;
  requestPath: string;
  outputPath: string;
  timeoutSeconds?: number;
  staleAfterSeconds?: number;
  evaluationMode?: "approved" | "shadow" | "replay" | "canary";
  approvedAttemptId?: string;
  evaluationCaseId?: string;
  candidatePolicyVersion?: string;
  candidateBindingVersion?: string;
  candidateProfileId?: string;
  candidateOutputPath?: string;
  sourceApplicationDecisionId?: string;
  canaryAuthorizationId?: string;
  replaySourceRunInstanceId?: string;
  replayPacketArtifactId?: string;
}

export interface RecordRoutingEvaluationOptions extends RuntimeDryRunOptions { filePath: string; }
export interface DecideRoutingPolicyOptions extends RuntimeDryRunOptions {
  evaluationId: string;
  decision: RoutingDecisionKind;
  policyVersion: string;
  bindingVersion: string;
  approver: string;
  reason: string;
  selectorPath?: string;
  maxInvocations?: number;
}
export interface RecordRoutingPolicySourceApplicationOptions extends RuntimeDryRunOptions {
  decisionId: string;
  commitSha: string;
  policyFile: string;
  bindingFile: string;
  implementationReviewArtifactId: string;
}
export interface CleanupPreparedSuccessorOptions extends RuntimeDryRunOptions {
  decisionId: string;
  filePath: string;
}

export interface ApprovePlanOptions extends RuntimeDryRunOptions {
  planPath: string;
  approver: string;
  reason?: string;
}

export interface BindImplementationBaselineOptions extends RuntimeDryRunOptions {
  planPath: string;
  approvalId: string;
  expectedHead: string;
}

export interface RecordNextTaskOptions extends RuntimeDryRunOptions {
  taskPath?: string;
  baseCommit?: string;
  baseRef?: string;
  filePath?: string;
  noSuccessor?: boolean;
  reason?: string;
  decisionOwner?: string;
  approvalId?: string;
}

export interface MaterializeNextTaskOptions extends RuntimeDryRunOptions {
  decisionId: string;
  taskPath: string;
  branch: string;
  worktreePath: string;
  create?: boolean;
  enterExisting?: boolean;
  recoverExistingActivation?: boolean;
}

export interface RecordPhaseRunInput {
  phaseRunId?: string;
  phaseId: string;
  taskPath: string;
  status?: StepStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface RecordStepInput {
  stepId?: string;
  name: string;
  status?: StepStatus;
  phaseRunId?: string;
  startedAt?: string;
  completedAt?: string;
  artifactRefs?: ArtifactRef[];
  evidenceRefs?: EvidenceRef[];
}

export interface RecordCommandResultInput {
  commandResultId?: string;
  command: string;
  exitCode?: number;
  status?: CommandResultStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  artifactRefs?: ArtifactRef[];
}

export interface RecordFindingInput {
  findingId?: string;
  title: string;
  severity: FindingSeverity;
  status?: FindingStatus;
  blocking?: boolean;
  createdAt?: string;
  details?: string;
  evidenceRefs?: EvidenceRef[];
}

export interface RecordDecisionInput {
  decisionId?: string;
  title: string;
  rationale: string;
  createdAt?: string;
  approver?: string;
}

export interface RecordApprovalInput {
  approvalId?: string;
  title: string;
  status: ApprovalStatus;
  createdAt?: string;
  approver?: string;
  reason?: string;
  reviewedPlanArtifactId?: string;
  reviewedPlanContentHash?: string;
  reviewedEvidenceArtifactId?: string;
}

interface RuntimeVerificationCommand {
  command: string;
  args: string[];
  shell: boolean;
  timeoutSeconds: number;
  displayCommand?: string;
}

interface VerificationResolution {
  verification: VerificationResult;
  snapshot: VerifiedSnapshot;
  reuseDecision: VerificationReuseDecision;
  commandEvidence: VerificationCommandResultEvidence[];
}

interface OperatorTaskContext {
  taskPath: string;
  activeTaskPath: string;
  phaseId: string;
  taskMarkdown: string;
  activeTaskMarkdown: string;
}

interface OperatorRunContext {
  run: Run;
  runPath: string;
  closeoutReceipt?: CloseoutReceipt;
  closeoutPath?: string;
  quarantinedPayloadCount: number;
  notes: string[];
}

interface OperatorEvaluationContext {
  procedureIds: Set<string>;
  taskContext: OperatorTaskContext;
  reviewTier: OperatorReviewTier;
  baseNotes: string[];
  procedureRegistry?: SelfHostingProcedureRegistry;
  proceduresById?: Map<string, SelfHostingProcedureDescriptor>;
  runContext?: OperatorRunContext;
  taggedProcedures?: Set<string>;
  latestPlanReviewResult?: ReviewResult;
  latestPlanReviewDecisionRecord?: PlanReviewDecisionRecord;
  latestImplementationChainReviewResult?: ReviewResult;
  latestArchitectureReviewResult?: ReviewResult;
  latestDbStorageReviewResult?: ReviewResult;
  latestVerification?: VerificationResult;
  latestCloseoutReceipt?: CloseoutReceipt;
  blockingFindings?: boolean;
  planApproved?: boolean;
  implementationEvidence?: boolean;
}

interface OperatorEvaluationOptions extends RuntimeDryRunOptions {
  runOverride?: Run;
}

type OperatorStageDraft = Omit<RuntimeOperatorStatus, "review_tier" | "next_procedure_id" | "human_action_required"> & {
  next_procedure_id: string;
  human_action_required?: boolean;
};

interface PlanReviewDecisionRecord {
  verdict: string;
  outcome_state: string;
  blocking_findings: string;
  required_amendments: string;
  accepted_defaults: string;
  real_operator_choices: string;
  next_allowed_action: string;
  validation_required: string;
  source_trace: string;
  future_phase_deferrals: string;
}

interface PlanReviewOperatorDecision {
  route: "approval" | "amend" | "blocked";
  stopReason: string;
  nextAllowedAction: string;
  notes: string[];
}

const RUNTIME_RUNS_DIR = path.join(HARNESS_DIR, "runs");
const CURRENT_RUN_FILE = "current.json";
const RUN_FILE = "run.json";
const CLOSEOUT_FILE = "closeout.json";
const DEFAULT_REMOTE_GATE_ID = "remote-ci";
const DEFAULT_REMOTE_GATE_NAME = "Remote CI";
const CURRENT_PHASE_RUN_ISSUE_PHASE_ID = "23.8.6C";
const BOOTSTRAP_ISSUE_PHASE_IDS = new Set<BootstrapIssuePhaseId>([
  "23.8.6C",
  "23.8.6C2",
  "23.8.6C2A"
]);

interface MatchingTaskStateSelection {
  task?: TaskState;
  selectedBy?: "sole" | "worktree" | "branch";
  unreadableTaskStateWarning?: string;
  noLiveMatch?: boolean;
  ambiguity?: {
    reason: "worktree" | "branch";
    taskIds: string[];
  };
}

function cloneRun(run: Run): Run {
  return JSON.parse(JSON.stringify(run)) as Run;
}

function withUpdatedAt(run: Run, timestamp: string): Run {
  return {
    ...run,
    updated_at: timestamp
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function normalizePathForComparison(targetPath: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function requireGitTargetRoot(cwd: string): string {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("This command must run inside a git repository.");
  }

  return gitStatus.rootPath;
}

function readGitValue(targetRoot: string, args: string[]): string | undefined {
  const result = runGitCommand(targetRoot, args);

  if (result.status !== 0 || result.error) {
    return undefined;
  }

  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeRepoRelativePath(relativePath: string): string {
  return toPortablePath(relativePath).replace(/^\.\/+/, "");
}

function isPrivateRuntimePath(relativePath: string): boolean {
  const normalized = normalizeRepoRelativePath(relativePath);
  const privatePrefixes = [
    ".codex/",
    ".agents/",
    ".harness/runs/",
    ".harness/evidence/",
    ".harness/tmp/",
    ".harness/artifacts/",
    ".harness/packets/"
  ];

  return (
    normalized === ".codex" ||
    normalized === ".agents" ||
    normalized === ".harness/runs" ||
    normalized === ".harness/evidence" ||
    normalized === ".harness/tmp" ||
    normalized === ".harness/artifacts" ||
    normalized === ".harness/packets" ||
    privatePrefixes.some((prefix) => normalized.startsWith(prefix))
  );
}

function filterPrivateRuntimeStatusLines(statusLines: string[]): string[] {
  return statusLines.filter((line) => !getGitStatusPaths([line]).every((entry) => isPrivateRuntimePath(entry)));
}

function buildChangeSet(targetRoot: string): ChangeSet {
  const gitStatusLines = filterPrivateRuntimeStatusLines(getGitStatusLines(targetRoot));
  const changedPaths = getGitStatusPaths(gitStatusLines)
    .filter((entry) => !isPrivateRuntimePath(entry))
    .map((entry) => normalizeRepoRelativePath(entry))
    .sort((left, right) => left.localeCompare(right));

  return {
    git_status_lines: gitStatusLines,
    changed_paths: [...new Set(changedPaths)],
    is_dirty: changedPaths.length > 0
  };
}

function selectTaskStateForCheckout(projectRoot: string, targetRoot: string, branch?: string): MatchingTaskStateSelection {
  if (!detectInstalledLayer(projectRoot)) {
    return {};
  }

  const taskList = listTasks(projectRoot);
  if (taskList.warnings.length > 0) {
    return {
      unreadableTaskStateWarning: taskList.warnings.join("; ")
    };
  }
  const tasks = taskList.tasks;

  if (tasks.length === 0) {
    return {};
  }

  if (tasks.length === 1) {
    return {
      task: tasks[0],
      selectedBy: "sole"
    };
  }

  const normalizedTargetRoot = normalizePathForComparison(targetRoot);
  const worktreeMatches = tasks.filter((task) =>
    typeof task.worktree === "string" && normalizePathForComparison(task.worktree) === normalizedTargetRoot
  );

  if (worktreeMatches.length > 1) {
    return {
      ambiguity: {
        reason: "worktree",
        taskIds: worktreeMatches.map((task) => task.task_id)
      }
    };
  }

  if (worktreeMatches.length === 1) {
    return {
      task: worktreeMatches[0],
      selectedBy: "worktree"
    };
  }

  const branchMatches = typeof branch === "string" && branch.trim().length > 0
    ? tasks.filter((task) => task.branch === branch)
    : [];

  if (branchMatches.length > 1) {
    return {
      ambiguity: {
        reason: "branch",
        taskIds: branchMatches.map((task) => task.task_id)
      }
    };
  }

  if (branchMatches.length === 1) {
    return {
      task: branchMatches[0],
      selectedBy: "branch"
    };
  }

  return { noLiveMatch: true };
}

function persistMaterializedTaskBaseAuthority(
  projectRoot: string,
  worktreePath: string,
  branch: string,
  baseCommitSha: string
): void {
  if (!detectInstalledLayer(projectRoot)) {
    throw new Error("Materialized task base authority requires an installed Harness task-state owner.");
  }

  const taskList = listTasks(projectRoot);
  if (taskList.warnings.length > 0) {
    throw new Error(`Materialized task base authority requires every installed task-state record to be readable: ${taskList.warnings.join("; ")}`);
  }
  const installedTasks = taskList.tasks;
  if (installedTasks.length === 0) {
    throw new Error("Materialized task base authority requires exactly one installed task-state owner.");
  }
  const normalizedWorktreePath = normalizePathForComparison(worktreePath);
  const owningTasks = installedTasks.filter((candidate) => {
    const branchMatches = candidate.branch === branch;
    const worktreeMatches = typeof candidate.worktree === "string"
      && normalizePathForComparison(candidate.worktree) === normalizedWorktreePath;
    const declaredBranchMatches = !candidate.branch || branchMatches;
    const declaredWorktreeMatches = !candidate.worktree || worktreeMatches;
    return (branchMatches || worktreeMatches) && declaredBranchMatches && declaredWorktreeMatches;
  });
  if (owningTasks.length !== 1) {
    throw new Error("Materialized task base authority requires exactly one installed task-state owner matching the requested branch/worktree.");
  }
  const task = owningTasks[0];
  if (task.base_commit_sha && task.base_commit_sha !== baseCommitSha) {
    throw new Error(`Installed task ${task.task_id} already records immutable base_commit_sha ${task.base_commit_sha}.`);
  }
  if (!task.base_commit_sha) {
    writeTaskState(projectRoot, task.task_id, {
      ...task,
      base_commit_sha: baseCommitSha,
      updated_at: nowIso()
    });
  }
}

function validateRecoveredMaterializedTaskStateOwner(
  projectRoot: string,
  worktreePath: string,
  branch: string,
  baseCommitSha: string
): TaskState | undefined {
  if (!detectInstalledLayer(projectRoot)) {
    throw new Error("Recovered materialization requires an installed Harness task-state owner.");
  }

  const taskList = listTasks(projectRoot);
  if (taskList.warnings.length > 0) {
    throw new Error(`Recovered materialization requires every installed task-state record to be readable: ${taskList.warnings.join("; ")}`);
  }
  const normalizedWorktreePath = normalizePathForComparison(worktreePath);
  const exactOwners = taskList.tasks.filter((candidate) => candidate.branch === branch
    && typeof candidate.worktree === "string"
    && normalizePathForComparison(candidate.worktree) === normalizedWorktreePath);
  const conflictingOwners = taskList.tasks.filter((candidate) => candidate.branch === branch
    || (typeof candidate.worktree === "string" && normalizePathForComparison(candidate.worktree) === normalizedWorktreePath));

  if (exactOwners.length > 1) {
    throw new Error("Recovered materialization found multiple TaskState owners for the requested branch/worktree.");
  }
  if (exactOwners.length === 1) {
    const owner = exactOwners[0];
    if (owner.base_commit_sha && owner.base_commit_sha !== baseCommitSha) {
      throw new Error(`Recovered materialization found a conflicting immutable base on TaskState ${owner.task_id}.`);
    }
    return owner;
  }
  if (conflictingOwners.length > 0) {
    throw new Error("Recovered materialization found a TaskState that partially claims the requested branch/worktree.");
  }

  return undefined;
}

function ensureRecoveredMaterializedTaskStateOwner(
  projectRoot: string,
  worktreePath: string,
  branch: string,
  baseCommitSha: string
): string | undefined {
  const owner = validateRecoveredMaterializedTaskStateOwner(projectRoot, worktreePath, branch, baseCommitSha);
  if (owner) {
    if (!owner.base_commit_sha) {
      writeTaskState(projectRoot, owner.task_id, {
        ...owner,
        base_commit_sha: baseCommitSha,
        updated_at: nowIso()
      });
    }
    return undefined;
  }

  const created = createTask(projectRoot, `Recovered successor ${branch}`, { taskType: "deployment" });
  try {
    writeTaskState(projectRoot, created.taskId, {
      ...readTaskStateById(projectRoot, created.taskId),
      branch,
      worktree: worktreePath,
      base_commit_sha: baseCommitSha,
      updated_at: nowIso()
    });
    persistMaterializedTaskBaseAuthority(projectRoot, worktreePath, branch, baseCommitSha);
    return created.taskId;
  } catch (error) {
    fs.rmSync(getTaskDirectory(projectRoot, created.taskId), { recursive: true, force: true });
    throw error;
  }
}

function assertRecoverableExistingActivation(
  worktreePath: string,
  baseCommitSha: string,
  taskPath: string
): void {
  const head = resolveExactCommit(worktreePath, "HEAD");
  if (head === baseCommitSha || !isCommitAncestor(worktreePath, baseCommitSha, head)) {
    throw new Error(`Recovered materialization requires a clean successor activation chain descending from recorded base ${baseCommitSha}.`);
  }

  const activationCommit = firstCommitAfterBase(worktreePath, baseCommitSha);
  const changedPaths = activationCommit ? changedPathsInCommit(worktreePath, activationCommit) : undefined;
  const requiredPaths = ["TASK.md", taskPath, "docs/IMPLEMENTATION_ROADMAP.md", "docs/OPERATIONS_PLAN.md"];
  const missingPaths = changedPaths
    ? requiredPaths.filter((entry) => !changedPaths.includes(entry))
    : requiredPaths;
  if (missingPaths.length > 0) {
    throw new Error(`Recovered materialization requires the first preserved activation commit to include: ${missingPaths.join(", ")}.`);
  }

  let resolvedTaskPath: string | undefined;
  try {
    const taskPointer = fs.readFileSync(path.join(worktreePath, "TASK.md"), "utf8");
    const referencedTaskPath = extractActiveTaskPath(taskPointer);
    if (referencedTaskPath) {
      const absoluteTaskPath = path.resolve(worktreePath, referencedTaskPath);
      ensureInsideTargetRoot(worktreePath, absoluteTaskPath);
      if (fs.existsSync(absoluteTaskPath) && fs.statSync(absoluteTaskPath).isFile()) {
        resolvedTaskPath = toRepoRelative(worktreePath, absoluteTaskPath);
      }
    }
  } catch {
    resolvedTaskPath = undefined;
  }
  if (resolvedTaskPath !== taskPath) {
    throw new Error(`Recovered materialization requires TASK.md to resolve to the recorded task ${taskPath}.`);
  }
}

function buildRepositoryRef(targetRoot: string): RepositoryRef {
  const roots = resolveHarnessRoots(targetRoot);
  const changeSet = buildChangeSet(targetRoot);
  const branch = readGitValue(targetRoot, ["branch", "--show-current"]);
  const headSha = readGitValue(targetRoot, ["rev-parse", "--verify", "HEAD"]);
  const taskSelection = selectTaskStateForCheckout(roots.projectRoot, targetRoot, branch);
  const taskWorktree = taskSelection.task?.worktree;

  return {
    root_path: targetRoot,
    project_root: roots.projectRoot,
    ...(branch ? { branch } : {}),
    ...(headSha ? { head_sha: headSha } : {}),
    ...(taskWorktree ? { task_worktree_path: taskWorktree } : {}),
    dirty: changeSet.is_dirty
  };
}

function defaultRequiredGates(): RequiredGate[] {
  return [
    {
      gate_id: DEFAULT_REMOTE_GATE_ID,
      name: DEFAULT_REMOTE_GATE_NAME,
      required: true,
      status: "missing",
      explanation: "No remote check status has been recorded."
    }
  ];
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function assertRequiredArray(record: Record<string, unknown>, field: string, label: string): void {
  if (!Array.isArray(record[field])) {
    throw new Error(`${label} is missing required array field: ${field}.`);
  }
}

function assertRequiredString(record: Record<string, unknown>, field: string, label: string): void {
  if (typeof record[field] !== "string" || String(record[field]).trim().length === 0) {
    throw new Error(`${label} is missing required string field: ${field}.`);
  }
}

function assertStatus(value: unknown, allowed: readonly string[], field: string, label: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} has invalid ${field}.`);
  }
}

function assertUniqueNonEmptyIds(records: unknown[], idField: string, label: string): void {
  const ids = new Set<string>();
  for (const value of records) {
    const record = assertObject(value, label);
    assertRequiredString(record, idField, label);
    const id = String(record[idField]);
    if (ids.has(id)) {
      throw new Error(`${label} has duplicate ${idField}: ${id}.`);
    }
    ids.add(id);
  }
}

function validateBootstrapFacts(value: unknown[]): BootstrapFact[] {
  assertUniqueNonEmptyIds(value, "fact_id", "bootstrap fact");
  const labels = new Set<string>();
  const allowedLabels = new Set(["active_task_path", "branch", "worktree_root", "source_snapshot", "base_commit", "run_identity"]);
  const allowedSources = new Set(["task_pointer", "git", "task_state", "git_merge_base", "runtime"]);
  const allowedPairs: Record<string, readonly string[]> = {
    active_task_path: ["task_pointer"],
    branch: ["git"],
    worktree_root: ["git", "task_state"],
    source_snapshot: ["git"],
    base_commit: ["git", "task_state", "git_merge_base"],
    run_identity: ["runtime"]
  };
  return value.map((entry) => {
    const record = assertObject(entry, "bootstrap fact");
    assertRequiredString(record, "fact_id", "bootstrap fact");
    assertRequiredString(record, "label", "bootstrap fact");
    assertRequiredString(record, "value", "bootstrap fact");
    assertRequiredString(record, "source", "bootstrap fact");
    const label = String(record.label);
    const source = String(record.source);
    if (!allowedLabels.has(label) || !allowedSources.has(source) || labels.has(label) || !allowedPairs[label]?.includes(source)) {
      throw new Error("bootstrap fact has unsupported or duplicate label/source.");
    }
    labels.add(label);
    return record as unknown as BootstrapFact;
  });
}

function validateWorkerHandoff(value: unknown): WorkerHandoff {
  const record = assertObject(value, "runtime run bootstrap_handoff");
  for (const field of ["handoff_id", "phase_id", "kind", "procedure_id", "next_action", "prompt"]) {
    assertRequiredString(record, field, "runtime run bootstrap_handoff");
  }
  const knownProcedures = new Set([
    "task-intake", "task-prompt-writer", "draft-plan", "plan-review", "plan-amend", "architecture-review",
    "db-storage-review", "implementation-review", "fix-pass-review", "verification-review", "delivery-facts-review",
    "harness-audit", "phase-closeout-review"
  ]);
  if (record.phase_id !== CURRENT_PHASE_RUN_ISSUE_PHASE_ID || (record.kind !== "procedure" && record.kind !== "implementation")) {
    throw new Error("runtime run bootstrap_handoff has unsupported phase or kind.");
  }
  if (String(record.prompt).length > 4000
    || (record.kind === "implementation" && record.procedure_id !== "implementation")
    || (record.kind === "procedure" && !knownProcedures.has(String(record.procedure_id)))) {
    throw new Error("runtime run bootstrap_handoff has invalid procedure or prompt.");
  }
  return record as unknown as WorkerHandoff;
}

function validateBootstrapIssues(value: unknown[]): RunIssue[] {
  assertUniqueNonEmptyIds(value, "issue_id", "run issue");
  const issueTypes = new Set(["uncommitted_task_activation", "missing_commit_backed_activation", "dirty_git_after_task_activation", "task_worktree_authority_mismatch", "task_branch_authority_mismatch", "bootstrap_authority_ambiguous", "bootstrap_authority_unmatched", "missing_base_authority", "worktree_bootstrap_not_ready", "missing_route_context_evidence", "illegal_stage_transition", "invalid_stage_result", "missing_deterministic_checks", "missing_required_review", "review_independence_violation", "source_change_before_approval", "scope_creep", "failed_verification", "review_stale_no_output", "fake_closeout_evidence"]);
  const routes = new Set(["fix_pass", "plan_amend", "supporting_fix", "new_task"]);
  return value.map((entry) => {
    const record = assertObject(entry, "run issue");
    for (const field of ["issue_id", "phase_id", "issue_type", "status", "created_at", "source", "summary", "recommended_route"]) {
      assertRequiredString(record, field, "run issue");
    }
    const stageIssue = record.phase_id === "23.8.7" && (record.source === "stage_packet" || record.source === "stage_result");
    const bootstrapIssue = BOOTSTRAP_ISSUE_PHASE_IDS.has(record.phase_id as BootstrapIssuePhaseId) && record.source === "bootstrap";
    if ((!bootstrapIssue && !stageIssue) || record.blocking !== true
      || !issueTypes.has(String(record.issue_type)) || !["open", "resolved"].includes(String(record.status)) || !routes.has(String(record.recommended_route))) {
      throw new Error("run issue has unsupported current-bootstrap fields.");
    }
    if (stageIssue && (
      typeof record.stage_id !== "string"
      || !["low", "medium", "high"].includes(String(record.severity))
      || typeof record.issue_kind !== "string"
      || !Array.isArray(record.evidence_refs)
      || record.repair_required !== true
    )) {
      throw new Error("stage-level run issue is missing normalized repair metadata.");
    }
    return record as unknown as RunIssue;
  });
}

function validateRepairPackets(value: unknown[], issues: RunIssue[]): RepairPacket[] {
  assertUniqueNonEmptyIds(value, "packet_id", "repair packet");
  const issueIds = new Set(issues.map((issue) => issue.issue_id));
  const routes = new Set(["fix_pass", "plan_amend", "supporting_fix", "new_task"]);
  return value.map((entry) => {
    const record = assertObject(entry, "repair packet");
    for (const field of ["packet_id", "phase_id", "created_at", "route", "summary", "next_action", "prompt"]) {
      assertRequiredString(record, field, "repair packet");
    }
    if ((!BOOTSTRAP_ISSUE_PHASE_IDS.has(record.phase_id as BootstrapIssuePhaseId) && record.phase_id !== "23.8.7") || !routes.has(String(record.route)) || !Array.isArray(record.issue_ids)
      || record.issue_ids.length === 0 || record.issue_ids.some((issueId) => typeof issueId !== "string" || !issueIds.has(issueId))) {
      throw new Error("repair packet has invalid current-bootstrap issue links.");
    }
    if (record.phase_id === "23.8.7" && (
      typeof record.target_stage !== "string"
      || !Array.isArray(record.required_repairs)
      || !Array.isArray(record.validation_refs)
      || typeof record.stopping_condition !== "string"
    )) {
      throw new Error("stage-level repair packet is missing normalized transition metadata.");
    }
    return record as unknown as RepairPacket;
  });
}

function validateStageRecordArray<T>(
  value: unknown,
  field: string,
  idField: string,
  requiredStrings: string[],
  requiredArrays: string[] = []
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`runtime run has invalid ${field}.`);
  }
  assertUniqueNonEmptyIds(value, idField, field);
  return value.map((entry) => {
    const record = assertObject(entry, field);
    for (const required of requiredStrings) {
      assertRequiredString(record, required, field);
    }
    for (const required of requiredArrays) {
      if (!Array.isArray(record[required])) {
        throw new Error(`${field} is missing required array field: ${required}.`);
      }
    }
    if (record.phase_id !== "23.8.7" || typeof record.current !== "boolean") {
      throw new Error(`${field} has unsupported phase or current-record state.`);
    }
    return record as T;
  });
}

function isAllowedStatus(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function assertRuntimeMetadata(record: Record<string, unknown>, label: string): void {
  validateOptionalSchemaMetadata(record, label);

  if (record.schema_version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`${label} is missing schema_version ${CURRENT_SCHEMA_VERSION}.`);
  }

  assertRequiredString(record, "producer_command", label);
}

function nextId(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function ensureInsideTargetRoot(targetRoot: string, absolutePath: string): void {
  const relative = path.relative(targetRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the repository: ${absolutePath}`);
  }
}

function extractActiveTaskPath(taskMarkdown: string): string | undefined {
  const match = /^Implement only:\s*(.+)$/im.exec(taskMarkdown);

  if (!match) {
    return undefined;
  }

  const value = match[1].trim();
  return value.length > 0 ? value : undefined;
}

function extractMarkdownSection(markdown: string, heading: string): string | undefined {
  const lines = markdown.split(/\r?\n/u);
  const normalizedHeading = heading.trim().toLowerCase();
  let headingDepth = 0;
  const startIndex = lines.findIndex((line) => {
    const match = /^(#{2,6})\s+(.+?)\s*$/u.exec(line.trim());
    if (match?.[2]?.trim().toLowerCase() === normalizedHeading) {
      headingDepth = match[1].length;
      return true;
    }
    return false;
  });

  if (startIndex === -1) {
    return undefined;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const candidate = /^(#{2,6})\s+/u.exec(lines[index].trim());
    if (candidate && candidate[1].length <= headingDepth) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex).join("\n");
}

function normalizeAcceptanceCommandLine(line: string): string | undefined {
  let value = line.trim();

  if (value.length === 0 || value.startsWith("#")) {
    return undefined;
  }

  const listMatch = /^(?:[-*]|\d+\.)\s+(.+)$/u.exec(value);
  if (listMatch) {
    value = listMatch[1]?.trim() ?? "";
  }

  if (value.startsWith("`") && value.endsWith("`") && value.length > 1) {
    value = value.slice(1, -1).trim();
  }

  return value.length > 0 ? value : undefined;
}

function extractAcceptanceCommands(markdown: string): string[] {
  const section = extractMarkdownSection(markdown, "Acceptance commands");

  if (!section) {
    return [];
  }

  const lines = section.split(/\r?\n/u);
  const fencedCommands: string[] = [];
  let insideFence = false;
  let sawFence = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (/^```/u.test(trimmed)) {
      insideFence = !insideFence;
      sawFence = true;
      continue;
    }

    if (!insideFence) {
      continue;
    }

    const command = normalizeAcceptanceCommandLine(rawLine);
    if (command) {
      fencedCommands.push(command);
    }
  }

  if (sawFence) {
    return fencedCommands;
  }

  return lines
    .map((line) => normalizeAcceptanceCommandLine(line))
    .filter((command): command is string => Boolean(command));
}

export function extractEffectiveValidationCommands(markdown: string): string[] {
  const section = extractMarkdownSection(markdown, "Effective Validation");
  if (!section) return [];
  const sections = [section];
  const delegated = /\bSection\s+(\d+)\s+is the complete binding validation contract\b/iu.exec(section);
  if (delegated?.[1]) {
    const heading = new RegExp(`^#{1,6}\\s+(${delegated[1]}\\.[^\\r\\n]+)\\s*$`, "imu").exec(markdown)?.[1];
    const delegatedSection = heading ? extractMarkdownSection(markdown, heading) : undefined;
    if (!delegatedSection) throw new Error("VERIFICATION_AUTHORITY_DELEGATED_SECTION_MISSING");
    sections.push(delegatedSection);
  }
  const commands: string[] = [];
  for (const line of sections.join("\n").split(/\r?\n/u)) {
    const match = /^\s*\d+\.\s+`([^`]+)`\s*$/u.exec(line);
    if (match?.[1]) {
      commands.push(match[1].trim());
      continue;
    }
    for (const inline of line.matchAll(/`([^`]+)`/gu)) {
      const candidate = inline[1]?.trim();
      if (candidate && /^(?:node|npm|npx|pnpm|yarn|git)\s+/u.test(candidate)) {
        commands.push(candidate);
      }
    }
  }
  return [...new Set(commands)];
}

function resolveRunActiveTaskMarkdown(targetRoot: string, run: Run): string | undefined {
  const candidatePaths = [run.active_task_path]
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);

  if (typeof run.task_path === "string" && run.task_path.trim().length > 0) {
    try {
      const task = resolveTaskReference(targetRoot, run.task_path);
      const resolvedTaskPath = task.activeTaskPath ?? task.taskPath;
      if (resolvedTaskPath && !candidatePaths.includes(resolvedTaskPath)) {
        candidatePaths.push(resolvedTaskPath);
      }
    } catch {
      if (candidatePaths.length === 0) {
        return undefined;
      }
    }
  }

  for (const candidatePath of candidatePaths) {
    try {
      const absoluteTaskPath = path.resolve(targetRoot, candidatePath);
      ensureInsideTargetRoot(targetRoot, absoluteTaskPath);

      if (fs.existsSync(absoluteTaskPath) && fs.statSync(absoluteTaskPath).isFile()) {
        return fs.readFileSync(absoluteTaskPath, "utf8");
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function inferVerificationTimeoutSeconds(commandLine: string): number {
  const normalized = commandLine.trim().toLowerCase();

  if (normalized === "git diff --check") {
    return 60;
  }

  if (/\b(?:npm|pnpm|yarn)\b.*\bbuild\b/u.test(normalized) || /\btsc\b/u.test(normalized)) {
    return 600;
  }

  return 1800;
}

function buildTaskAcceptanceVerificationCommand(commandLine: string): RuntimeVerificationCommand {
  const timeoutSeconds = inferVerificationTimeoutSeconds(commandLine);

  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", commandLine],
      shell: false,
      timeoutSeconds,
      displayCommand: commandLine
    };
  }

  return {
    command: "/bin/sh",
    args: ["-lc", commandLine],
    shell: false,
    timeoutSeconds,
    displayCommand: commandLine
  };
}

function inferPhaseIdFromText(markdown: string): string | undefined {
  const headingMatch = /^#\s*Phase\s+([0-9]+(?:\.[0-9]+)*(?:[A-Z][0-9]*)*)/im.exec(markdown);
  return headingMatch?.[1];
}

function inferPhaseIdFromPath(taskPath: string): string | undefined {
  const basename = path.basename(taskPath);
  const match = /^PHASE_([0-9]+(?:_[0-9]+)*(?:[A-Z][0-9]*)*)/.exec(basename);

  if (!match) {
    return undefined;
  }

  return match[1].split("_").join(".");
}

function resolveTaskReference(targetRoot: string, taskPath: string): {
  taskPath: string;
  activeTaskPath?: string;
  phaseId?: string;
} {
  const absoluteTaskPath = path.resolve(targetRoot, taskPath);
  ensureInsideTargetRoot(targetRoot, absoluteTaskPath);

  const readTaskFile = (candidatePath: string, displayPath: string): string => {
    let realPath: string;
    try {
      realPath = fs.realpathSync.native(candidatePath);
      ensureInsideTargetRoot(targetRoot, realPath);
      if (!fs.statSync(realPath).isFile()) {
        throw new Error("not a regular file");
      }
      fs.accessSync(realPath, fs.constants.R_OK);
      return fs.readFileSync(realPath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Task authority is not a readable regular file: ${displayPath} (${message})`);
    }
  };

  const relativeTaskPath = toRepoRelative(targetRoot, absoluteTaskPath);
  const taskMarkdown = readTaskFile(absoluteTaskPath, taskPath);
  const referencedTaskPath = extractActiveTaskPath(taskMarkdown);
  const resolvedActiveTaskPath = referencedTaskPath
    ? path.resolve(targetRoot, referencedTaskPath)
    : absoluteTaskPath;

  ensureInsideTargetRoot(targetRoot, resolvedActiveTaskPath);
  const activeTaskPath = referencedTaskPath
    ? toRepoRelative(targetRoot, resolvedActiveTaskPath)
    : relativeTaskPath;
  const activeTaskMarkdown = readTaskFile(resolvedActiveTaskPath, referencedTaskPath ?? taskPath);
  const phaseId = inferPhaseIdFromText(activeTaskMarkdown) ?? inferPhaseIdFromPath(activeTaskPath);

  return {
    taskPath: relativeTaskPath,
    activeTaskPath,
    ...(phaseId ? { phaseId } : {})
  };
}

interface BootstrapBaseAuthority {
  commit: string;
  source: "task_state" | "git_merge_base";
}

function bootstrapIssuePhaseId(run: Run): BootstrapIssuePhaseId {
  return BOOTSTRAP_ISSUE_PHASE_IDS.has(run.phase_id as BootstrapIssuePhaseId)
    ? run.phase_id as BootstrapIssuePhaseId
    : CURRENT_PHASE_RUN_ISSUE_PHASE_ID;
}

function isMaterializedSuccessor(run: Run): boolean {
  return ["23.8.6D", "23.8.6E", "23.8.7"].includes(run.phase_id ?? "");
}

function requiresCommitBackedBaseAuthority(run: Run): boolean {
  return run.phase_id === "23.8.6C2" || run.phase_id === "23.8.6C2A" || isMaterializedSuccessor(run);
}

function requiresCommitBackedActivation(run: Run): boolean {
  return run.phase_id === "23.8.6C2A" || isMaterializedSuccessor(run);
}

function isCommitAncestor(targetRoot: string, ancestor: string, head: string): boolean {
  return runGitCommand(targetRoot, ["merge-base", "--is-ancestor", ancestor, head]).status === 0;
}

function tryResolveExactBootstrapCommit(targetRoot: string, value: string): string | undefined {
  try {
    return resolveExactCommit(targetRoot, value);
  } catch {
    return undefined;
  }
}

function resolveBootstrapBaseAuthority(
  targetRoot: string,
  run: Run,
  task: TaskState | undefined
): BootstrapBaseAuthority | undefined {
  const head = run.source_snapshot ?? run.repository.head_sha;
  if (!head) {
    return undefined;
  }

  if (task?.base_commit_sha) {
    const commit = tryResolveExactBootstrapCommit(targetRoot, task.base_commit_sha);
    if (commit && isCommitAncestor(targetRoot, commit, head)) {
      return { commit, source: "task_state" };
    }
    return undefined;
  }

  const upstream = readGitValue(targetRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream) {
    return undefined;
  }
  const mergeBase = readGitValue(targetRoot, ["merge-base", "HEAD", upstream]);
  const commit = mergeBase ? tryResolveExactBootstrapCommit(targetRoot, mergeBase) : undefined;
  return commit && isCommitAncestor(targetRoot, commit, head)
    ? { commit, source: "git_merge_base" }
    : undefined;
}

function buildBootstrapFacts(
  run: Run,
  baseAuthority?: BootstrapBaseAuthority,
  requiresBaseAuthority = false
): BootstrapFact[] {
  const facts: BootstrapFact[] = [];
  const activeTaskPath = run.active_task_path ?? run.task_path;

  facts.push({
    fact_id: `bootstrap-fact-${facts.length + 1}`,
    label: "active_task_path",
    value: activeTaskPath,
    source: "task_pointer"
  });

  facts.push({
    fact_id: `bootstrap-fact-${facts.length + 1}`,
    label: "branch",
    value: run.repository.branch ?? "(detached)",
    source: "git"
  });

  facts.push({
    fact_id: `bootstrap-fact-${facts.length + 1}`,
    label: "worktree_root",
    value: run.repository.root_path,
    source: run.repository.task_worktree_path ? "task_state" : "git"
  });

  facts.push({
    fact_id: `bootstrap-fact-${facts.length + 1}`,
    label: "source_snapshot",
    value: run.source_snapshot ?? run.repository.head_sha ?? "(unknown)",
    source: "git"
  });

  if (baseAuthority) {
    facts.push({
      fact_id: `bootstrap-fact-${facts.length + 1}`,
      label: "base_commit",
      value: baseAuthority.commit,
      source: baseAuthority.source
    });
  } else if (!requiresBaseAuthority) {
    facts.push({
      fact_id: `bootstrap-fact-${facts.length + 1}`,
      label: "base_commit",
      value: run.source_snapshot ?? run.repository.head_sha ?? "(unknown)",
      source: "git"
    });
  }

  facts.push({
    fact_id: `bootstrap-fact-${facts.length + 1}`,
    label: "run_identity",
    value: `${run.run_id}:${run.run_instance_id ?? "pending"}:${run.bootstrap_status ?? "pending"}`,
    source: "runtime"
  });

  return facts;
}

function buildRunIssue(
  run: Run,
  issues: RunIssue[],
  input: {
    issueType: RunIssue["issue_type"];
    summary: string;
    details?: string;
    recommendedRoute?: RunIssue["recommended_route"];
    phaseId?: BootstrapIssuePhaseId;
  }
): RunIssue {
  return {
    issue_id: nextId("run-issue", issues.length),
    phase_id: input.phaseId ?? bootstrapIssuePhaseId(run),
    issue_type: input.issueType,
    status: "open",
    blocking: true,
    created_at: run.created_at,
    source: "bootstrap",
    summary: input.summary,
    ...(input.details ? { details: input.details } : {}),
    recommended_route: input.recommendedRoute ?? "fix_pass"
  };
}

function changedPathsInCommit(targetRoot: string, commit: string): string[] | undefined {
  const result = runGitCommand(targetRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=ACMR", commit]);
  if (result.error || result.status !== 0) {
    return undefined;
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((entry) => normalizeRepoRelativePath(entry.trim()))
    .filter((entry) => entry.length > 0);
}

function firstCommitAfterBase(targetRoot: string, baseCommit: string): string | undefined {
  const result = runGitCommand(targetRoot, ["rev-list", "--reverse", `${baseCommit}..HEAD`]);
  if (result.error || result.status !== 0) {
    return undefined;
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
}

function activationAuthorityPaths(targetRoot: string, run: Run): string[] {
  const activeTaskPath = run.active_task_path ?? run.task_path;
  let explicitlyNamedPolicyPaths: string[] = [];
  try {
    const taskContract = fs.readFileSync(path.join(targetRoot, activeTaskPath), "utf8");
    explicitlyNamedPolicyPaths = [...taskContract.matchAll(/`(docs\/[A-Za-z0-9_./-]*POLICY[A-Za-z0-9_./-]*\.md)`/gu)]
      .map((match) => match[1]);
  } catch {
    explicitlyNamedPolicyPaths = [];
  }

  return [...new Set([
    "TASK.md",
    activeTaskPath,
    "docs/IMPLEMENTATION_ROADMAP.md",
    "docs/OPERATIONS_PLAN.md",
    ...explicitlyNamedPolicyPaths
  ].map((entry) => normalizeRepoRelativePath(entry)))];
}

function evaluateCommitBackedActivationIssue(
  targetRoot: string,
  run: Run,
  baseAuthority: BootstrapBaseAuthority,
  changeSet: ChangeSet,
  activationRequired: boolean,
  issues: RunIssue[]
): void {
  if (!activationRequired) {
    return;
  }

  const issuePhaseId = run.phase_id === "23.8.6C2A" ? undefined : "23.8.6C2A";

  if (changeSet.changed_paths.length > 0) {
    issues.push(buildRunIssue(run, issues, {
      issueType: "missing_commit_backed_activation",
      summary: "Commit-backed task activation cannot be proven.",
      details: `Commit or remove all checkout changes before starting the successor run: ${changeSet.changed_paths.join(", ")}`,
      ...(issuePhaseId ? { phaseId: issuePhaseId } : {})
    }));
    return;
  }

  const activationCommit = firstCommitAfterBase(targetRoot, baseAuthority.commit);
  const requiredPaths = activationAuthorityPaths(targetRoot, run);
  const changedPaths = activationCommit ? changedPathsInCommit(targetRoot, activationCommit) : undefined;
  const missingPaths = changedPaths
    ? requiredPaths.filter((entry) => !changedPaths.includes(entry))
    : requiredPaths;

  if (missingPaths.length === 0) {
    return;
  }

  issues.push(buildRunIssue(run, issues, {
    issueType: "missing_commit_backed_activation",
    summary: "Commit-backed task activation cannot be proven.",
    details: activationCommit
      ? `The first post-base activation commit ${activationCommit} must include: ${missingPaths.join(", ")}`
      : `Create the first post-base activation commit after ${baseAuthority.commit} with: ${missingPaths.join(", ")}`,
    ...(issuePhaseId ? { phaseId: issuePhaseId } : {})
  }));
}

function evaluateBootstrapIssues(targetRoot: string, run: Run): {
  issues: RunIssue[];
  baseAuthority?: BootstrapBaseAuthority;
  requiresBaseAuthority: boolean;
  requiresActivation: boolean;
} {
  const issues: RunIssue[] = [];
  const changeSet = buildChangeSet(targetRoot);
  const changedPaths = new Set(changeSet.changed_paths);
  const taskSelection = selectTaskStateForCheckout(run.repository.project_root, targetRoot, run.repository.branch);
  const selectedTask = taskSelection.task;
  const requiresActivation = requiresCommitBackedActivation(run);
  const requiresBaseAuthority = requiresCommitBackedBaseAuthority(run);
  const collapseC2AActivationFailure = requiresActivation;
  const materializationIssuePhaseId: BootstrapIssuePhaseId | undefined = requiresActivation && run.phase_id !== "23.8.6C2A"
    ? "23.8.6C2A"
    : undefined;
  const addBootstrapIssue = (input: {
    issueType: RunIssue["issue_type"];
    summary: string;
    details?: string;
    recommendedRoute?: RunIssue["recommended_route"];
  }): void => {
    issues.push(buildRunIssue(run, issues, {
      ...input,
      ...(materializationIssuePhaseId ? { phaseId: materializationIssuePhaseId } : {})
    }));
  };

  if (!collapseC2AActivationFailure && changedPaths.has("TASK.md")) {
    addBootstrapIssue({
      issueType: "uncommitted_task_activation",
      summary: "TASK.md activation is uncommitted.",
      details: "Commit the active TASK.md pointer before starting or continuing the bootstrap run."
    });
  }

  const nonTaskDirtyPaths = changeSet.changed_paths.filter((entry) => entry !== "TASK.md");
  if (!collapseC2AActivationFailure && nonTaskDirtyPaths.length > 0) {
    addBootstrapIssue({
      issueType: "dirty_git_after_task_activation",
      summary: "Git is dirty after task activation.",
      details: `Clean or commit the active checkout before continuing: ${nonTaskDirtyPaths.join(", ")}`
    });
  }

  if (taskSelection.unreadableTaskStateWarning && requiresActivation) {
    addBootstrapIssue({
      issueType: "bootstrap_authority_unmatched",
      summary: "Installed task-state authority cannot be read for the current checkout.",
      details: `A materialized successor requires one readable matching TaskState: ${taskSelection.unreadableTaskStateWarning}`
    });
  } else if (taskSelection.ambiguity) {
    addBootstrapIssue({
      issueType: "bootstrap_authority_ambiguous",
      summary: "Multiple installed task records claim the current checkout authority.",
      details: `Ambiguous ${taskSelection.ambiguity.reason} matches: ${taskSelection.ambiguity.taskIds.join(", ")}`
    });
  } else if (taskSelection.noLiveMatch || (requiresActivation && !selectedTask)) {
    addBootstrapIssue({
      issueType: "bootstrap_authority_unmatched",
      summary: "No installed task record matches the current checkout.",
      details: "A materialized successor requires one readable installed TaskState matching its current worktree or branch."
    });
  }

  if (selectedTask?.worktree && normalizePathForComparison(selectedTask.worktree) !== normalizePathForComparison(targetRoot)) {
    addBootstrapIssue({
      issueType: "task_worktree_authority_mismatch",
      summary: "Installed task worktree metadata does not match the current checkout.",
      details: `Task ${selectedTask.task_id} records ${selectedTask.worktree}, but bootstrap is running from ${targetRoot}.`
    });
  }

  if (
    selectedTask?.branch
    && run.repository.branch
    && selectedTask.branch !== run.repository.branch
  ) {
    addBootstrapIssue({
      issueType: "task_branch_authority_mismatch",
      summary: "Installed task branch metadata does not match the current checkout.",
      details: `Task ${selectedTask.task_id} records branch ${selectedTask.branch}, but bootstrap is running from ${run.repository.branch}.`
    });
  }

  const taskAuthorityBlocked = Boolean(
    taskSelection.unreadableTaskStateWarning || taskSelection.ambiguity || taskSelection.noLiveMatch || (requiresActivation && !selectedTask)
  );
  const baseAuthority = requiresBaseAuthority && !taskAuthorityBlocked
    ? resolveBootstrapBaseAuthority(targetRoot, run, selectedTask)
    : undefined;
  if (requiresBaseAuthority && !taskAuthorityBlocked && !baseAuthority) {
    addBootstrapIssue({
      issueType: "missing_base_authority",
      summary: "Bootstrap base authority cannot be proven.",
      details: "Use a valid matching TaskState.base_commit_sha or configure an upstream with a resolvable merge-base."
    });
  }

  if (baseAuthority) {
    evaluateCommitBackedActivationIssue(targetRoot, run, baseAuthority, changeSet, requiresActivation, issues);
  }

  return { issues, requiresBaseAuthority, requiresActivation, ...(baseAuthority ? { baseAuthority } : {}) };
}

function buildRepairPacket(run: Run, issues: RunIssue[]): RepairPacket | undefined {
  if (issues.length === 0) {
    return undefined;
  }

  return {
    packet_id: nextId("repair-packet", run.repair_packets.length),
    phase_id: issues[0].phase_id,
    created_at: run.created_at,
    route: issues.some((issue) => issue.recommended_route === "new_task")
      ? "new_task"
      : issues.some((issue) => issue.recommended_route === "supporting_fix")
        ? "supporting_fix"
        : issues.some((issue) => issue.recommended_route === "plan_amend")
          ? "plan_amend"
          : "fix_pass",
    summary: "Repair the recorded bootstrap authority issues before continuing.",
    next_action: "repair the recorded bootstrap issues, commit the authority surface, then restart the run bootstrap",
    issue_ids: issues.map((issue) => issue.issue_id),
    prompt: "Repair the recorded bootstrap authority issues only. Do not broaden scope. Commit the task authority change, restore a clean checkout, then restart bootstrap."
  };
}

function buildWorkerHandoff(run: Run, operator: RuntimeOperatorStatus): WorkerHandoff {
  const procedureId = operator.next_procedure_id === "none" ? "implementation" : operator.next_procedure_id;
  const kind = operator.next_procedure_id === "none" ? "implementation" : "procedure";

  return {
    handoff_id: `handoff-${run.run_id}`,
    phase_id: CURRENT_PHASE_RUN_ISSUE_PHASE_ID,
    kind,
    procedure_id: procedureId,
    next_action: operator.next_allowed_action,
    prompt: operator.next_procedure_id === "none"
      ? `Perform the approved implementation work for ${run.run_id} inside ${run.active_task_path ?? run.task_path}.`
      : `Run ${operator.next_procedure_id} for ${run.run_id} and record the result through the approved harness surface only.`
  };
}

export function buildRuntimeRun(input: BuildRuntimeRunInput): Run {
  const timestamp = input.timestamp ?? nowIso();
  const repository: RepositoryRef = {
    ...input.repository,
    project_root: input.repository.project_root ?? input.repository.root_path
  };

  return {
    ...buildSchemaMetadata(input.producerCommand ?? "node bin/ch run start"),
    run_id: input.runId,
    run_instance_id: randomUUID(),
    run_revision: 1,
    task_path: input.taskPath,
    ...(input.activeTaskPath ? { active_task_path: input.activeTaskPath } : {}),
    ...(input.phaseId ? { phase_id: input.phaseId } : {}),
    run_mode: isSelfHostingRunMode(repository.project_root),
    lifecycle_status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    repository,
    phase_runs: [],
    steps: [],
    artifacts: [],
    evidence: [],
    findings: [],
    decisions: [],
    approvals: [],
    command_results: [],
    verification_results: [],
    review_results: [],
    required_gates: input.requiredGates ? [...input.requiredGates] : defaultRequiredGates(),
    remote_checks: [],
    delivery_facts: [],
    closeout_receipts: [],
    run_issues: [],
    repair_packets: [],
    stage_states: [],
    stage_packets: [],
    stage_results: [],
    runner_profiles: [],
    execution_policies: [],
    waiver_records: []
  };
}

export function validateRuntimeRun(value: unknown): Run {
  const record = assertObject(value, "runtime run");
  assertRuntimeMetadata(record, "runtime run");
  assertRequiredString(record, "run_id", "runtime run");
  assertRequiredString(record, "task_path", "runtime run");
  assertRequiredString(record, "created_at", "runtime run");
  assertRequiredString(record, "updated_at", "runtime run");
  const repositoryRecord = assertObject(record.repository, "runtime run repository");
  assertRequiredString(repositoryRecord, "root_path", "runtime run repository");

  const repository: RepositoryRef = {
    root_path: String(repositoryRecord.root_path),
    project_root: typeof repositoryRecord.project_root === "string" && repositoryRecord.project_root.trim().length > 0
      ? repositoryRecord.project_root
      : String(repositoryRecord.root_path),
    ...(typeof repositoryRecord.branch === "string" ? { branch: repositoryRecord.branch } : {}),
    ...(typeof repositoryRecord.head_sha === "string" ? { head_sha: repositoryRecord.head_sha } : {}),
    ...(typeof repositoryRecord.task_worktree_path === "string" ? { task_worktree_path: repositoryRecord.task_worktree_path } : {}),
    dirty: repositoryRecord.dirty === true
  };
  const legacyStatus = isAllowedStatus(record.status, ["running", "ready", "blocked", "closed"])
    ? (record.status as LegacyRunStatus)
    : undefined;
  const runMode = isAllowedStatus(record.run_mode, ["normal", "bootstrap"])
    ? (record.run_mode as RunMode)
    : legacyStatus
      ? isSelfHostingRunMode(repository.project_root)
      : undefined;
  const lifecycleStatus = isAllowedStatus(record.lifecycle_status, ["active", "blocked", "closed", "harvested", "discarded"])
    ? (record.lifecycle_status as LifecycleStatus)
    : legacyStatus
      ? legacyStatus === "running"
        ? "active"
        : legacyStatus === "blocked"
          ? "blocked"
          : "closed"
      : undefined;

  if (!runMode) {
    throw new Error("runtime run has invalid run_mode.");
  }

  if (!lifecycleStatus) {
    throw new Error("runtime run has invalid lifecycle_status.");
  }

  const requiredArrays = [
    "phase_runs",
    "steps",
    "artifacts",
    "evidence",
    "findings",
    "decisions",
    "approvals",
    "command_results",
    "verification_results",
    "review_results",
    "required_gates",
    "remote_checks",
    "closeout_receipts"
  ] as const;

  for (const field of requiredArrays) {
    assertRequiredArray(record, field, "runtime run");
  }

  let implementationBaselineBinding: ImplementationBaselineBinding | undefined;
  if (record.implementation_baseline_binding !== undefined) {
    const binding = assertObject(
      record.implementation_baseline_binding,
      "runtime run implementation_baseline_binding",
    );
    const requiredBindingStrings = [
      "approval_id",
      "plan_artifact_hash",
      "planning_review_source_head",
      "owner_authority_diff_hash",
      "implementation_baseline_head",
      "implementation_baseline_tree_hash",
      "expected_tree_hash",
      "bound_at",
    ] as const;
    if (binding.schema_version !== 1 && binding.schema_version !== 2) {
      throw new Error(
        "runtime run implementation_baseline_binding has invalid schema_version.",
      );
    }
    for (const field of requiredBindingStrings) {
      assertRequiredString(
        binding,
        field,
        "runtime run implementation_baseline_binding",
      );
    }
    if (binding.schema_version === 2) {
      assertRequiredString(binding, "plan_review_artifact_hash", "runtime run implementation_baseline_binding");
      if (binding.authority_transition !== "reviewed_source" && binding.authority_transition !== "owner_authorized_overlay") {
        throw new Error("runtime run implementation_baseline_binding has invalid authority_transition.");
      }
    }
    const normalizedBaselineBinding: ImplementationBaselineBinding = {
      schema_version: binding.schema_version,
      approval_id: String(binding.approval_id),
      plan_artifact_hash: String(binding.plan_artifact_hash),
      ...(binding.schema_version === 2 ? { plan_review_artifact_hash: String(binding.plan_review_artifact_hash) } : {}),
      planning_review_source_head: String(binding.planning_review_source_head),
      ...(binding.schema_version === 2 ? {
        authority_transition: binding.authority_transition as "reviewed_source" | "owner_authorized_overlay"
      } : {}),
      owner_authority_diff_hash: String(binding.owner_authority_diff_hash),
      implementation_baseline_head: String(
        binding.implementation_baseline_head,
      ),
      implementation_baseline_tree_hash: String(
        binding.implementation_baseline_tree_hash,
      ),
      expected_tree_hash: String(binding.expected_tree_hash),
      bound_at: String(binding.bound_at),
    };
    implementationBaselineBinding = normalizedBaselineBinding;
    if (
      typeof record.implementation_baseline_head !== "string" ||
      record.implementation_baseline_head !==
        normalizedBaselineBinding.implementation_baseline_head
    ) {
      throw new Error(
        "runtime run implementation baseline head and binding disagree.",
      );
    }
  } else if (record.implementation_baseline_head !== undefined) {
    throw new Error(
      "runtime run implementation_baseline_head requires an exact binding.",
    );
  }
  for (const field of ["final_reviewed_source_head", "delivered_source_head"] as const) {
    if (record[field] !== undefined
      && (typeof record[field] !== "string" || !/^[a-f0-9]{40}$/u.test(record[field] as string))) {
      throw new Error(`runtime run has invalid ${field}.`);
    }
  }
  let deliverySourceRelationship: DeliverySourceRelationshipV1 | undefined;
  if (record.delivery_source_relationship !== undefined) {
    const relationship = assertObject(
      record.delivery_source_relationship,
      "runtime run delivery_source_relationship"
    );
    const allowedKeys = new Set([
      "schema_version", "relationship", "delivered_source_head", "final_reviewed_source_head",
      "delivered_tree_hash", "final_reviewed_tree_hash", "ancestry", "delivery_fact_id"
    ]);
    if (Object.keys(relationship).some((key) => !allowedKeys.has(key))) {
      throw new Error("runtime run delivery_source_relationship has unknown fields.");
    }
    if (relationship.schema_version !== 1
      || !isAllowedStatus(relationship.relationship, ["identity", "merge_contains_exact_tree"])
      || !isAllowedStatus(relationship.ancestry, ["same_commit", "ancestor"])) {
      throw new Error("runtime run delivery_source_relationship has invalid discriminator fields.");
    }
    for (const field of [
      "delivered_source_head", "final_reviewed_source_head", "delivered_tree_hash", "final_reviewed_tree_hash"
    ] as const) {
      if (typeof relationship[field] !== "string" || !/^[a-f0-9]{40}$/u.test(relationship[field] as string)) {
        throw new Error(`runtime run delivery_source_relationship has invalid ${field}.`);
      }
    }
    assertRequiredString(relationship, "delivery_fact_id", "runtime run delivery_source_relationship");
    if (relationship.delivered_source_head !== record.delivered_source_head
      || relationship.final_reviewed_source_head !== record.final_reviewed_source_head) {
      throw new Error("runtime run delivery source head and relationship disagree.");
    }
    if ((relationship.relationship === "identity") !== (relationship.ancestry === "same_commit")) {
      throw new Error("runtime run delivery_source_relationship has inconsistent ancestry.");
    }
    deliverySourceRelationship = relationship as unknown as DeliverySourceRelationshipV1;
  } else if (record.delivered_source_head !== undefined) {
    throw new Error("runtime run delivered_source_head requires an exact delivery source relationship.");
  }

  const deliveryFacts = record.delivery_facts === undefined
    ? []
    : Array.isArray(record.delivery_facts)
      ? (record.delivery_facts as DeliveryFactRecord[])
      : (() => {
          throw new Error("runtime run is missing required array field: delivery_facts.");
        })();
  const runIssues = record.run_issues === undefined
    ? []
    : Array.isArray(record.run_issues)
      ? validateBootstrapIssues(record.run_issues)
      : (() => {
          throw new Error("runtime run has invalid run_issues.");
        })();
  const repairPackets = record.repair_packets === undefined
    ? []
    : Array.isArray(record.repair_packets)
      ? validateRepairPackets(record.repair_packets, runIssues)
      : (() => {
          throw new Error("runtime run has invalid repair_packets.");
        })();
  const bootstrapFacts = record.bootstrap_facts === undefined
    ? undefined
    : Array.isArray(record.bootstrap_facts)
      ? validateBootstrapFacts(record.bootstrap_facts)
      : (() => {
          throw new Error("runtime run has invalid bootstrap_facts.");
        })();
  const bootstrapHandoff = record.bootstrap_handoff === undefined
    ? undefined
    : validateWorkerHandoff(record.bootstrap_handoff);
  const reviewLaunchClaims = record.review_launch_claims === undefined
    ? undefined
    : validateReviewLaunchClaims(record.review_launch_claims);
  const reviewOperationalRecords = record.review_routing_records === undefined
    ? undefined
    : validateReviewOperationalRecords(record.review_routing_records);
  const stageStates = validateStageRecordArray<StageState>(
    record.stage_states,
    "stage_states",
    "stage_state_id",
    ["task_id", "run_id", "run_instance_id", "project_run_id", "phase_id", "packet_kind", "procedure_id", "current_stage", "status", "blocked_disposition", "stop_reason", "stopping_condition", "next_allowed_action", "created_at"],
    ["allowed_next_stages", "missing_inputs", "missing_evidence", "blockers", "validation_refs", "bounded_progress_log"]
  );
  const stagePackets = validateStageRecordArray<StagePacket>(
    record.stage_packets,
    "stage_packets",
    "stage_packet_id",
    ["packet_id", "task_id", "run_id", "run_instance_id", "project_run_id", "phase_id", "packet_kind", "stage_id", "procedure_id", "return_procedure_id", "effective_plan_ref", "output_contract", "required_result_schema", "stopping_condition", "progress_log_contract", "execution_policy_ref", "route_decision_ref", "route_policy_ref", "provider_binding_ref", "context_core_ref", "delta_overlay_ref", "context_manifest_ref", "context_transport_ref", "usage_facts_ref", "runner_profile_id", "created_at"],
    ["payload_refs", "evidence_refs", "input_refs", "validation_refs", "bounded_progress_log", "required_semantic_reviews", "changed_surfaces", "changed_surface_classes", "risk_classes", "escalation_triggers"]
  );
  const stageResults = validateStageRecordArray<StageResult>(
    record.stage_results,
    "stage_results",
    "stage_result_id",
    ["result_id", "stage_packet_id", "packet_id", "run_id", "run_instance_id", "project_run_id", "phase_id", "procedure_id", "runner_id", "outcome", "summary", "blocked_disposition", "progress_log_ref", "route_decision_ref", "usage_facts_ref", "payload_id", "recorded_at"],
    [
      "files_changed", "commands", "commands_run", "outputs", "blockers", "declared_blockers",
      "payload_refs", "evidence_refs", "completed_reviews", "validation_results",
      "bounded_progress_log", "anomaly_codes", "waiver_refs"
    ]
  );
  const runnerProfiles = validateStageRecordArray<RunnerProfile>(
    record.runner_profiles,
    "runner_profiles",
    "runner_profile_id",
    ["runner_id", "phase_id", "runner_kind", "write_capability", "session_support", "status", "created_at"],
    ["supported_roles", "supported_packet_kinds"]
  );
  const executionPolicies = validateStageRecordArray<ExecutionPolicy>(
    record.execution_policies,
    "execution_policies",
    "execution_policy_id",
    ["phase_id", "policy_version", "role", "write_scope", "sandbox_mode", "approval_policy", "network_policy", "command_policy", "timeout_policy", "created_at"],
    ["allowed_paths", "forbidden_paths", "allowed_runner_profile_ids", "allowed_packet_kinds"]
  );
  const waiverRecords = validateStageRecordArray<WaiverRecord>(
    record.waiver_records,
    "waiver_records",
    "waiver_id",
    ["phase_id", "run_id", "stage_packet_id", "control_id", "failed_check", "granted_by", "approver", "reason", "scope", "created_at"],
    ["evidence_refs"]
  );
  const expectedPacketKinds = ["plan", "implementation", "review", "fix-pass", "closeout"];
  if (runnerProfiles?.some((profile) =>
    profile.runner_profile_id !== "runner-profile-supplied-fixture-v1"
    || profile.runner_id !== profile.runner_profile_id
    || profile.adapter_kind !== "supplied_fixture"
    || profile.runner_kind !== "supplied_fixture"
    || canonicalJson(profile.supported_roles) !== canonicalJson(expectedPacketKinds)
    || canonicalJson(profile.supported_packet_kinds) !== canonicalJson(expectedPacketKinds)
    || profile.structured_output_support !== true
    || profile.can_launch !== false
    || profile.write_capability !== "none"
    || profile.accepts_result_fixture !== true
    || profile.description !== "Hookless adapter contract: ingest a supplied result fixture; never launch a runner."
    || profile.session_support !== "none"
    || profile.status !== "active"
    || profile.current !== true)) {
    throw new Error("runner_profiles must preserve the exact hookless supplied-fixture contract.");
  }
  const expectedAllowedPaths = [".harness/runs/<run-id>/run.json", ".harness/runs/<run-id>/run-staging.sqlite"];
  const expectedForbiddenPaths = ["src/**", "tasks/**", "docs/**", ".git/**"];
  if (executionPolicies?.some((policy) =>
    policy.phase_id !== "23.8.7"
    || policy.policy_version !== "phase23.8.7-hookless-v1"
    || policy.role !== "fixture_ingestion"
    || policy.write_scope !== "run_staging_only"
    || policy.sandbox_mode !== "no_runner"
    || policy.approval_policy !== "human_only"
    || policy.network_policy !== "forbidden"
    || policy.command_policy !== "record_only"
    || policy.timeout_policy !== "not_applicable"
    || canonicalJson(policy.allowed_paths) !== canonicalJson(expectedAllowedPaths)
    || canonicalJson(policy.forbidden_paths) !== canonicalJson(expectedForbiddenPaths)
    || canonicalJson(policy.allowed_runner_profile_ids) !== canonicalJson(["runner-profile-supplied-fixture-v1"])
    || canonicalJson(policy.allowed_packet_kinds) !== canonicalJson(expectedPacketKinds)
    || policy.deterministic_checks_required !== true
    || policy.runner_launch_allowed !== false
    || policy.provider_selection_allowed !== false
    || policy.max_result_bytes !== 512 * 1024
    || policy.max_log_entries !== 40
    || policy.current !== true)) {
    throw new Error("execution_policies must preserve the exact hookless fixture-ingestion permission contract.");
  }
  const forbiddenInvocationFields = ["provider", "model", "selected_provider", "selected_model", "launch_command", "pid"];
  if (stageResults?.some((result) => result.schema_valid !== true || result.result_schema_valid !== true
    || !["PASS", "FIX_REQUIRED", "AMEND_REQUIRED", "BLOCKED"].includes(result.outcome)
    || result.validation_results.length === 0
    || result.validation_results.some((check) =>
      typeof check !== "object"
      || check === null
      || typeof check.check_id !== "string"
      || check.check_id.trim().length === 0
      || !["pass", "fail"].includes(check.status)
      || typeof check.summary !== "string"
      || check.summary.trim().length === 0
      || !Array.isArray(check.evidence_refs)
      || check.evidence_refs.some((reference) => typeof reference !== "string")
    )
    || result.actual_invocation_facts?.supplied_fixture !== true
    || canonicalJson(result.runner_metadata) !== canonicalJson(result.actual_invocation_facts)
    || forbiddenInvocationFields.some((field) => field in result.actual_invocation_facts))) {
    throw new Error("stage_results must be valid supplied-fixture records.");
  }
  const exactRunInstanceId = typeof record.run_instance_id === "string" ? record.run_instance_id : undefined;
  const exactRunRevision = typeof record.run_revision === "number" ? record.run_revision : undefined;
  const exactRunId = String(record.run_id);
  const stageIdentityRecords = [
    ...(stageStates ?? []),
    ...(stagePackets ?? []),
    ...(stageResults ?? [])
  ];
  if (stageIdentityRecords.some((entry) =>
    entry.run_id !== exactRunId
    || entry.run_instance_id !== exactRunInstanceId
    || entry.project_run_id !== exactRunInstanceId
  )) {
    throw new Error("stage records do not exactly match the containing run identity.");
  }
  if (stageStates?.length) {
    const currentStageStateCount = stageStates.filter((entry) => entry.current).length;
    if (currentStageStateCount > 1
      || (currentStageStateCount === 0 && !stageStates.some((entry) => entry.status === "superseded"))) {
      throw new Error("stage_states must have at most one current operator state, or be fully consumed.");
    }
  }
  if (stageStates?.some((state) => !["ready", "blocked", "result_recorded", "superseded"].includes(state.status))) {
    throw new Error("stage_states has an invalid status.");
  }
  if (stageStates?.some((state) =>
    typeof state.human_action_required !== "boolean"
    || (state.current && state.status === "superseded")
    || (state.status === "blocked" && state.human_action_required !== true)
  )) {
    throw new Error("stage_states has invalid human-action or current-status semantics.");
  }
  if (stageStates?.some((state) => [
    state.allowed_next_stages,
    state.missing_inputs,
    state.missing_evidence,
    state.blockers,
    state.validation_refs,
    state.bounded_progress_log
  ].some((entries) => entries.some((entry) => typeof entry !== "string")))) {
    throw new Error("stage_states has non-string typed-array entries.");
  }
  if (stagePackets?.some((packet) => [
    packet.payload_refs,
    packet.evidence_refs,
    packet.input_refs,
    packet.validation_refs,
    packet.bounded_progress_log,
    packet.required_semantic_reviews,
    packet.changed_surfaces,
    packet.changed_surface_classes,
    packet.risk_classes,
    packet.escalation_triggers
  ].some((entries) => entries.some((entry) => typeof entry !== "string")))) {
    throw new Error("stage_packets has non-string typed-array entries.");
  }
  if (stageResults?.some((result) => [
    result.files_changed,
    result.commands,
    result.commands_run,
    result.outputs,
    result.blockers,
    result.declared_blockers,
    result.payload_refs,
    result.evidence_refs,
    result.completed_reviews,
    result.bounded_progress_log,
    result.anomaly_codes,
    result.waiver_refs
  ].some((entries) => entries.some((entry) => typeof entry !== "string")))) {
    throw new Error("stage_results has non-string typed-array entries.");
  }
  if (waiverRecords?.some((waiver) =>
    waiver.evidence_refs.some((entry) => typeof entry !== "string")
    || (waiver.expires_at !== undefined && (
      typeof waiver.expires_at !== "string"
      || !Number.isFinite(Date.parse(waiver.expires_at))
    ))
  )) {
    throw new Error("waiver_records has invalid typed-array or expiry semantics.");
  }
  if (stageStates?.some((state) =>
    !Number.isInteger(state.run_revision)
    || state.run_revision < 1
    || (exactRunRevision !== undefined && (
      state.run_revision > exactRunRevision
      || (state.current && state.run_revision + 1 !== exactRunRevision)
    ))
  )) {
    throw new Error("stage_states has invalid or stale revision semantics.");
  }
  if (stagePackets && stagePackets.filter((entry) => entry.current).length > 1) {
    throw new Error("stage_packets has more than one current packet.");
  }
  if (stagePackets?.some((packet) =>
    packet.packet_id !== packet.stage_packet_id
    || packet.stage_packet_id !== deriveStagePacketId(packet)
    || (packet.procedure_id === "fix-pass-review"
      ? ![
          "architecture-review",
          "db-storage-review",
          "implementation-review",
          "verification-review",
          "delivery-facts-review",
          "phase-closeout-review"
        ].includes(packet.return_procedure_id)
      : packet.return_procedure_id !== packet.procedure_id)
    || packet.route_decision_ref !== packet.route_decision_id
    || packet.route_policy_ref !== packet.routing_policy_version
    || packet.provider_binding_ref !== `${packet.binding_version}:${packet.binding_profile_id}`
    || packet.context_core_ref !== packet.context_core_id
    || packet.delta_overlay_ref !== packet.delta_overlay_id
    || packet.context_manifest_ref !== packet.context_manifest_id
    || packet.context_transport_ref !== packet.context_mode
    || packet.context_transport_mode !== packet.context_mode
    || packet.usage_facts_ref !== packet.usage_ref
    || packet.execution_policy_ref !== packet.execution_policy_id
    || packet.profile_floor !== packet.binding_profile_id
    || packet.default_reasoning_effort !== packet.reasoning_default
    || packet.reasoning_effort_ceiling !== packet.reasoning_ceiling
    || canonicalJson(packet.changed_surfaces) !== canonicalJson(packet.changed_surface_classes)
    || packet.parallel_policy !== "serial"
    || !Number.isInteger(packet.run_revision)
    || packet.run_revision < 1
    || (exactRunRevision !== undefined && packet.run_revision > exactRunRevision)
    || (exactRunRevision !== undefined && packet.current && packet.run_revision + 1 !== exactRunRevision)
    || packet.bounded_progress_log.length > packet.budget.max_log_entries
  )) {
    throw new Error("stage_packets has invalid identity, revision, or bounded-log semantics.");
  }
  if (stagePackets?.some((packet) => {
    const invocationMatches = (reviewOperationalRecords ?? []).filter((entry) =>
      entry.record_kind === "review_invocation"
      && entry.status === "success"
      && entry.payload.run_instance_id === exactRunInstanceId
      && entry.payload.route_decision_id === packet.route_decision_id
    );
    const replayMatches = (reviewOperationalRecords ?? []).filter((entry) =>
      entry.record_kind === "review_replay_packet"
      && ["accepted", "retained_not_yet_eligible"].includes(entry.status)
      && entry.payload.run_instance_id === exactRunInstanceId
      && entry.payload.source_run_id === exactRunId
      && entry.payload.route_decision_id === packet.route_decision_id
    );
    if (invocationMatches.length !== 1 || replayMatches.length !== 1) {
      return true;
    }
    const invocation = invocationMatches[0]!.payload;
    const replay = replayMatches[0]!.payload;
    const exactInvocationFields: Array<[unknown, unknown]> = [
      [packet.route_class, invocation.route_class],
      [packet.routing_policy_version, invocation.routing_policy_version],
      [packet.binding_version, invocation.binding_version],
      [packet.binding_profile_id, invocation.binding_profile_id],
      [packet.context_core_id, invocation.context_core_id],
      [packet.context_manifest_id, invocation.context_manifest_id],
      [packet.delta_overlay_id, invocation.delta_overlay_id],
      [packet.context_mode, invocation.context_mode],
      [packet.usage_ref, invocation.usage_ref],
      [packet.deterministic_evidence_state, invocation.deterministic_evidence_state],
      [packet.parallel_policy, invocation.parallel_policy],
      [packet.budget_class, invocation.budget_class],
      [packet.reasoning_default, invocation.reasoning_effort],
      [packet.independence_mode, invocation.independence_mode]
    ];
    const exactReplayFields: Array<[unknown, unknown]> = [
      [packet.route_class, replay.route_class],
      [packet.routing_policy_version, replay.policy_version],
      [packet.binding_version, replay.binding_version],
      [packet.binding_profile_id, replay.binding_profile_id],
      [packet.context_core_id, replay.context_core_id],
      [packet.context_manifest_id, replay.context_manifest_id],
      [packet.delta_overlay_id, replay.delta_overlay_id],
      [packet.context_mode, replay.context_mode],
      [packet.usage_ref, replay.usage_ref],
      [packet.deterministic_evidence_state, replay.deterministic_evidence_state],
      [packet.parallel_policy, replay.parallel_policy],
      [packet.budget_class, replay.budget_class],
      [packet.independence_mode, replay.independence_mode]
    ];
    return exactInvocationFields.some(([actual, expected]) => actual !== expected)
      || exactReplayFields.some(([actual, expected]) => actual !== expected)
      || packet.reasoning_ceiling !== "high"
      || packet.independence_requirement !== (packet.independence_mode === "independent"
        ? "independent_reviewer_required"
        : "separate_review_required")
      || canonicalJson(packet.risk_classes) !== canonicalJson(invocation.risk_classes)
      || canonicalJson(packet.risk_classes) !== canonicalJson(replay.risk_classes)
      || canonicalJson(packet.changed_surface_classes) !== canonicalJson(invocation.changed_surface_classes)
      || canonicalJson(packet.changed_surface_classes) !== canonicalJson(replay.changed_surface_classes)
      || canonicalJson(packet.required_semantic_reviews) !== canonicalJson(invocation.required_semantic_reviews)
      || canonicalJson(packet.required_semantic_reviews) !== canonicalJson(replay.required_semantic_reviews)
      || canonicalJson(packet.escalation_triggers) !== canonicalJson(invocation.escalation_triggers)
      || canonicalJson(packet.escalation_triggers) !== canonicalJson(replay.escalation_triggers);
  })) {
    throw new Error("stage_packets does not exactly match its authoritative Phase F invocation and replay records.");
  }
  const stagePacketById = new Map((stagePackets ?? []).map((packet) => [packet.stage_packet_id, packet]));
  const runnerProfileById = new Map((runnerProfiles ?? []).map((profile) => [profile.runner_profile_id, profile]));
  const executionPolicyById = new Map((executionPolicies ?? []).map((policy) => [policy.execution_policy_id, policy]));
  const waiverById = new Map((waiverRecords ?? []).map((waiver) => [waiver.waiver_id, waiver]));
  if (stagePackets?.some((packet) => {
    const profile = runnerProfileById.get(packet.runner_profile_id);
    const policy = executionPolicyById.get(packet.execution_policy_id);
    return !profile
      || !policy
      || !profile.current
      || !policy.current
      || canonicalJson(packet.budget) !== canonicalJson({
        max_result_bytes: policy.max_result_bytes,
        max_log_entries: policy.max_log_entries
      })
      || !profile.supported_packet_kinds.includes(packet.packet_kind)
      || !policy.allowed_runner_profile_ids.includes(packet.runner_profile_id)
      || !policy.allowed_packet_kinds.includes(packet.packet_kind);
  })) {
    throw new Error("stage_packets has invalid runner-profile or execution-policy capability binding.");
  }
  const currentStageResultCounts = new Map<string, number>();
  for (const result of stageResults ?? []) {
    if (result.current) {
      currentStageResultCounts.set(
        result.procedure_id,
        (currentStageResultCounts.get(result.procedure_id) ?? 0) + 1
      );
    }
  }
  if ([...new Set((stageResults ?? []).map((result) => result.procedure_id))]
    .some((procedureId) => currentStageResultCounts.get(procedureId) !== 1)) {
    throw new Error("stage_results must have exactly one current result per procedure.");
  }
  if (stageResults?.some((result) => {
    const packet = stagePacketById.get(result.stage_packet_id);
    const policy = packet ? executionPolicyById.get(packet.execution_policy_id) : undefined;
    return result.result_id !== result.stage_result_id
      || result.packet_id !== result.stage_packet_id
      || !packet
      || !resolveStageResultTransitionContract(result.procedure_id, result.outcome, packet.return_procedure_id)
      || packet.run_revision !== result.packet_run_revision
      || packet.route_decision_ref !== result.route_decision_ref
      || result.route_decision_id !== packet.route_decision_id
      || result.usage_ref !== packet.usage_ref
      || result.usage_facts_ref !== result.usage_ref
      || canonicalJson(result.commands_run) !== canonicalJson(result.commands)
      || canonicalJson(result.declared_blockers) !== canonicalJson(result.blockers)
      || result.payload_refs.length !== 1
      || result.payload_refs[0] !== result.payload_id
      || result.progress_log_ref !== `${result.stage_result_id}#bounded_progress_log`
      || result.runner_profile_id !== packet.runner_profile_id
      || result.runner_id !== runnerProfileById.get(result.runner_profile_id)?.runner_id
      || !policy
      || result.waiver_refs.some((waiverRef) => {
        const waiver = waiverById.get(waiverRef);
        return !waiver
          || !waiver.current
          || waiver.stage_packet_id !== result.stage_packet_id
          || (waiver.expires_at !== undefined && Date.parse(waiver.expires_at) <= Date.now())
          || !result.validation_results.some((check) => check.check_id === waiver.failed_check && check.status === "fail");
      })
      || result.bounded_progress_log.length > policy.max_log_entries;
  })) {
    throw new Error("stage_results has invalid packet, route, profile, policy, revision, or bounded-log semantics.");
  }
  if (waiverRecords?.some((waiver) =>
    waiver.run_id !== exactRunId
    || !stagePacketById.has(waiver.stage_packet_id)
    || waiver.failed_check !== waiver.control_id
  )) {
    throw new Error("waiver_records has invalid run, packet, or failed-check binding.");
  }
  const currentStageState = stageStates?.find((state) => state.current);
  if (currentStageState?.status === "ready") {
    const packet = (stagePackets ?? []).find((candidate) => candidate.current);
    if (!packet
      || currentStageState.procedure_id !== packet.procedure_id
      || currentStageState.packet_kind !== packet.packet_kind
      || canonicalJson(currentStageState.allowed_next_stages) !== canonicalJson([packet.procedure_id])
      || currentStageState.next_allowed_action !== `supply a result fixture to record-stage-result --packet ${packet.stage_packet_id}`) {
      throw new Error("current StageState does not match its ready packet transition.");
    }
  }
  if (currentStageState?.status === "result_recorded") {
    const result = (stageResults ?? []).find((candidate) =>
      candidate.procedure_id === currentStageState.procedure_id && candidate.current
    );
    const packet = result ? stagePacketById.get(result.stage_packet_id) : undefined;
    const expectedTransition = result && packet
      ? resolveStageResultTransitionContract(result.procedure_id, result.outcome, packet.return_procedure_id)
      : undefined;
    if (!result
      || !expectedTransition
      || currentStageState.human_action_required !== expectedTransition.human_action_required
      || currentStageState.current_stage !== expectedTransition.next
      || currentStageState.next_allowed_action !== expectedTransition.next
      || canonicalJson(currentStageState.allowed_next_stages) !== canonicalJson([expectedTransition.next])) {
      throw new Error("current StageState does not match its recorded result transition.");
    }
  }
  if (currentStageState?.status === "blocked") {
    const matchingIssues = runIssues.filter((issue) =>
      issue.status === "open"
      && issue.blocking
      && issue.issue_type === currentStageState.stop_reason
      && currentStageState.blockers.includes(issue.summary)
    );
    const matchingRepairs = repairPackets.filter((repair) =>
      matchingIssues.some((issue) =>
        repair.issue_ids.includes(issue.issue_id)
        && (
          (currentStageState.current_stage === repair.next_action
            && canonicalJson(currentStageState.allowed_next_stages) === canonicalJson([repair.next_action]))
          || (currentStageState.current_stage === issue.stage_id
            && currentStageState.allowed_next_stages.length === 0)
        )
      )
      && repair.route === currentStageState.blocked_disposition
      && repair.next_action === currentStageState.next_allowed_action
      && repair.stopping_condition === currentStageState.stopping_condition
      && canonicalJson(repair.validation_refs ?? []) === canonicalJson(currentStageState.validation_refs)
    );
    if (matchingIssues.length !== 1
      || matchingRepairs.length !== 1
      || canonicalJson(currentStageState.blockers) !== canonicalJson([matchingIssues[0]?.summary])
      || currentStageState.next_allowed_action === "CLOSEOUT_PACKET") {
      throw new Error("blocked StageState does not exactly match its RunIssue and RepairPacket transition.");
    }
  }

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    producer_command: String(record.producer_command),
    run_id: String(record.run_id),
    ...(typeof record.run_instance_id === "string" && record.run_instance_id.trim().length > 0
      ? { run_instance_id: record.run_instance_id }
      : {}),
    ...(typeof record.run_revision === "number" && Number.isInteger(record.run_revision) && record.run_revision >= 0
      ? { run_revision: record.run_revision }
      : {}),
    task_path: String(record.task_path),
    ...(typeof record.active_task_path === "string" ? { active_task_path: record.active_task_path } : {}),
    ...(typeof record.phase_id === "string" ? { phase_id: record.phase_id } : {}),
    run_mode: runMode,
    lifecycle_status: lifecycleStatus,
    created_at: String(record.created_at),
    updated_at: String(record.updated_at),
    repository,
    phase_runs: record.phase_runs as PhaseRun[],
    steps: record.steps as Step[],
    artifacts: record.artifacts as ArtifactRef[],
    evidence: record.evidence as EvidenceRef[],
    findings: record.findings as Finding[],
    decisions: record.decisions as Decision[],
    approvals: record.approvals as Approval[],
    command_results: record.command_results as CommandResult[],
    verification_results: record.verification_results as VerificationResult[],
    review_results: record.review_results as ReviewResult[],
    required_gates: record.required_gates as RequiredGate[],
    remote_checks: record.remote_checks as RemoteCheckResult[],
    delivery_facts: deliveryFacts,
    closeout_receipts: record.closeout_receipts as CloseoutReceipt[],
    ...(record.bootstrap_status === "ready" || record.bootstrap_status === "blocked"
      ? { bootstrap_status: record.bootstrap_status as BootstrapStatus }
      : {}),
    ...(bootstrapFacts ? { bootstrap_facts: bootstrapFacts } : {}),
    ...(bootstrapHandoff ? { bootstrap_handoff: bootstrapHandoff } : {}),
    run_issues: runIssues,
    repair_packets: repairPackets,
    ...(typeof record.discard_reason === "string" ? { discard_reason: record.discard_reason } : {}),
    ...(typeof record.manual_override_reason === "string" ? { manual_override_reason: record.manual_override_reason } : {}),
    ...(typeof record.harvested_at === "string" ? { harvested_at: record.harvested_at } : {}),
    ...(typeof record.source_snapshot === "string" ? { source_snapshot: record.source_snapshot } : {}),
    ...(typeof record.source_staging_db_path === "string" ? { source_staging_db_path: record.source_staging_db_path } : {}),
    ...(implementationBaselineBinding
      ? {
          implementation_baseline_head:
            implementationBaselineBinding.implementation_baseline_head,
          implementation_baseline_binding: implementationBaselineBinding,
        }
      : {}),
    ...(typeof record.final_reviewed_source_head === "string"
      ? { final_reviewed_source_head: record.final_reviewed_source_head }
      : {}),
    ...(typeof record.delivered_source_head === "string"
      ? { delivered_source_head: record.delivered_source_head }
      : {}),
    ...(deliverySourceRelationship
      ? { delivery_source_relationship: deliverySourceRelationship }
      : {}),
    ...(reviewLaunchClaims ? { review_launch_claims: reviewLaunchClaims } : {}),
    ...(reviewOperationalRecords ? { review_routing_records: reviewOperationalRecords } : {}),
    ...(stageStates ? { stage_states: stageStates } : {}),
    ...(stagePackets ? { stage_packets: stagePackets } : {}),
    ...(stageResults ? { stage_results: stageResults } : {}),
    ...(runnerProfiles ? { runner_profiles: runnerProfiles } : {}),
    ...(executionPolicies ? { execution_policies: executionPolicies } : {}),
    ...(waiverRecords ? { waiver_records: waiverRecords } : {})
  };
}

function validateReviewOperationalRecords(value: unknown): ReviewOperationalRecord[] {
  if (!Array.isArray(value)) throw new Error("runtime run has invalid review_routing_records.");
  return value.map((entry, index) => {
    const record = assertObject(entry, `runtime run review_routing_records[${index}]`);
    const kind = String(record.record_kind ?? "");
    if (!["review_invocation", "review_replay_packet", "routing_evaluation", "routing_decision", "routing_policy_application", "prepared_successor_cleanup"].includes(kind)) {
      throw new Error(`runtime run review_routing_records[${index}] has invalid record_kind.`);
    }
    const payload = assertObject(record.payload, `runtime run review_routing_records[${index}] payload`);
    return {
      record_kind: kind as ReviewOperationalRecord["record_kind"],
      record_id: (assertRequiredString(record, "record_id", `runtime run review_routing_records[${index}]`), String(record.record_id)),
      created_at: (assertRequiredString(record, "created_at", `runtime run review_routing_records[${index}]`), String(record.created_at)),
      status: (assertRequiredString(record, "status", `runtime run review_routing_records[${index}]`), String(record.status)),
      summary: (assertRequiredString(record, "summary", `runtime run review_routing_records[${index}]`), String(record.summary)),
      payload
    };
  });
}

function validateReviewLaunchClaims(value: unknown): ReviewLaunchClaim[] {
  if (!Array.isArray(value)) {
    throw new Error("runtime run has invalid review_launch_claims.");
  }

  return value.map((entry, index) => {
    const record = assertObject(entry, `runtime run review_launch_claims[${index}]`);
    assertRequiredString(record, "procedure_id", `runtime run review_launch_claims[${index}]`);
    const procedureId = String(record.procedure_id);
    if (!["plan-review", "implementation-review", "fix-pass-review"].includes(procedureId)) {
      throw new Error(`runtime run review_launch_claims[${index}] has invalid procedure_id.`);
    }
    assertRequiredString(record, "termination_policy", `runtime run review_launch_claims[${index}]`);
    const terminationPolicy = String(record.termination_policy);
    if (terminationPolicy !== "terminal_completion_only") {
      throw new Error(`runtime run review_launch_claims[${index}] has invalid termination_policy.`);
    }
    const timeoutSeconds = record.timeout_seconds;
    const staleAfterSeconds = record.stale_after_seconds;
    if (!Number.isInteger(timeoutSeconds) || typeof timeoutSeconds !== "number" || timeoutSeconds <= 0) {
      throw new Error(`runtime run review_launch_claims[${index}] has invalid timeout_seconds.`);
    }
    if (!Number.isInteger(staleAfterSeconds) || typeof staleAfterSeconds !== "number" || staleAfterSeconds <= 0) {
      throw new Error(`runtime run review_launch_claims[${index}] has invalid stale_after_seconds.`);
    }
    if (record.pid !== undefined && (!Number.isInteger(record.pid) || typeof record.pid !== "number" || record.pid <= 0)) {
      throw new Error(`runtime run review_launch_claims[${index}] has invalid pid.`);
    }

    return {
      claim_id: (assertRequiredString(record, "claim_id", `runtime run review_launch_claims[${index}]`), String(record.claim_id)),
      attempt_id: (assertRequiredString(record, "attempt_id", `runtime run review_launch_claims[${index}]`), String(record.attempt_id)),
      attempt_marker: (assertRequiredString(record, "attempt_marker", `runtime run review_launch_claims[${index}]`), String(record.attempt_marker)),
      procedure_id: procedureId as ReviewLaunchClaim["procedure_id"],
      owner_token_hash: (assertRequiredString(record, "owner_token_hash", `runtime run review_launch_claims[${index}]`), String(record.owner_token_hash)),
      created_at: (assertRequiredString(record, "created_at", `runtime run review_launch_claims[${index}]`), String(record.created_at)),
      request_artifact_hash: (assertRequiredString(record, "request_artifact_hash", `runtime run review_launch_claims[${index}]`), String(record.request_artifact_hash)),
      expected_output_path: (assertRequiredString(record, "expected_output_path", `runtime run review_launch_claims[${index}]`), String(record.expected_output_path)),
      timeout_seconds: timeoutSeconds,
      stale_after_seconds: staleAfterSeconds,
      termination_policy: terminationPolicy,
      ...(typeof record.pid === "number" ? { pid: record.pid } : {}),
      ...(typeof record.progress_unknown_at === "string" ? { progress_unknown_at: record.progress_unknown_at } : {})
    };
  });
}

export function validateCloseoutReceipt(value: unknown): CloseoutReceipt {
  const record = assertObject(value, "closeout receipt");
  assertRuntimeMetadata(record, "closeout receipt");
  assertRequiredString(record, "receipt_id", "closeout receipt");
  assertRequiredString(record, "run_id", "closeout receipt");
  assertRequiredString(record, "task_path", "closeout receipt");
  assertRequiredString(record, "created_at", "closeout receipt");
  assertStatus(record.status, ["READY", "BLOCKED"], "status", "closeout receipt");
  assertObject(record.repository, "closeout receipt repository");
  assertObject(record.change_set, "closeout receipt change_set");
  assertObject(record.verification_result, "closeout receipt verification_result");
  assertObject(record.review_result, "closeout receipt review_result");

  for (const field of ["findings", "decisions", "approvals", "required_gates", "remote_checks", "blockers"]) {
    assertRequiredArray(record, field, "closeout receipt");
  }

  return record as unknown as CloseoutReceipt;
}

export function recordPhaseRun(run: Run, input: RecordPhaseRunInput): Run {
  const timestamp = input.startedAt ?? nowIso();
  const next = cloneRun(run);
  const phaseRun: PhaseRun = {
    phase_run_id: input.phaseRunId ?? nextId("phase-run", next.phase_runs.length),
    phase_id: input.phaseId,
    task_path: input.taskPath,
    status: input.status ?? "running",
    started_at: timestamp,
    ...(input.completedAt ? { completed_at: input.completedAt } : {}),
    step_ids: []
  };

  next.phase_runs.push(phaseRun);
  return withUpdatedAt(next, timestamp);
}

export function recordStep(run: Run, input: RecordStepInput): Run {
  const timestamp = input.startedAt ?? nowIso();
  const next = cloneRun(run);
  const step: Step = {
    step_id: input.stepId ?? nextId("step", next.steps.length),
    name: input.name,
    status: input.status ?? "running",
    started_at: timestamp,
    ...(input.completedAt ? { completed_at: input.completedAt } : {}),
    ...(input.phaseRunId ? { phase_run_id: input.phaseRunId } : {}),
    artifact_refs: input.artifactRefs ?? [],
    evidence_refs: input.evidenceRefs ?? [],
    command_result_ids: []
  };

  next.steps.push(step);

  if (step.phase_run_id) {
    next.phase_runs = next.phase_runs.map((phaseRun) =>
      phaseRun.phase_run_id === step.phase_run_id
        ? { ...phaseRun, step_ids: [...phaseRun.step_ids, step.step_id] }
        : phaseRun
    );
  }

  return withUpdatedAt(next, timestamp);
}

export function recordCommandResult(run: Run, stepId: string | undefined, input: RecordCommandResultInput): Run {
  const timestamp = input.completedAt ?? nowIso();
  const next = cloneRun(run);
  const commandResult: CommandResult = {
    command_result_id: input.commandResultId ?? nextId("command-result", next.command_results.length),
    command: input.command,
    ...(input.exitCode !== undefined ? { exit_code: input.exitCode } : {}),
    status: input.status ?? "unknown",
    ...(input.startedAt ? { started_at: input.startedAt } : {}),
    completed_at: timestamp,
    ...(input.durationMs !== undefined ? { duration_ms: input.durationMs } : {}),
    ...(stepId ? { step_id: stepId } : {}),
    artifact_refs: input.artifactRefs ?? []
  };

  next.command_results.push(commandResult);

  if (stepId) {
    next.steps = next.steps.map((step) =>
      step.step_id === stepId
        ? { ...step, command_result_ids: [...step.command_result_ids, commandResult.command_result_id] }
        : step
    );
  }

  return withUpdatedAt(next, timestamp);
}

export function recordVerificationResult(run: Run, verification: VerificationResult): Run {
  const next = cloneRun(run);
  next.verification_results.push(verification);
  return withUpdatedAt(next, verification.created_at);
}

export function recordReviewResult(run: Run, review: ReviewResult): Run {
  const next = cloneRun(run);
  next.review_results.push(review);
  return withUpdatedAt(next, review.created_at);
}

export function recordFinding(run: Run, input: RecordFindingInput): Run {
  const timestamp = input.createdAt ?? nowIso();
  const next = cloneRun(run);
  const finding: Finding = {
    finding_id: input.findingId ?? nextId("finding", next.findings.length),
    title: input.title,
    severity: input.severity,
    status: input.status ?? "open",
    blocking: input.blocking ?? input.severity === "high",
    created_at: timestamp,
    ...(input.details ? { details: input.details } : {}),
    evidence_refs: input.evidenceRefs ?? []
  };

  next.findings.push(finding);
  return withUpdatedAt(next, timestamp);
}

export function recordDecision(run: Run, input: RecordDecisionInput): Run {
  const timestamp = input.createdAt ?? nowIso();
  const next = cloneRun(run);
  const decision: Decision = {
    decision_id: input.decisionId ?? nextId("decision", next.decisions.length),
    title: input.title,
    rationale: input.rationale,
    created_at: timestamp,
    ...(input.approver ? { approver: input.approver } : {})
  };

  next.decisions.push(decision);
  return withUpdatedAt(next, timestamp);
}

export function recordApproval(run: Run, input: RecordApprovalInput): Run {
  const timestamp = input.createdAt ?? nowIso();
  const next = cloneRun(run);
  const approval: Approval = {
    approval_id: input.approvalId ?? nextId("approval", next.approvals.length),
    title: input.title,
    status: input.status,
    created_at: timestamp,
    ...(input.approver ? { approver: input.approver } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.reviewedPlanArtifactId ? { reviewed_plan_artifact_id: input.reviewedPlanArtifactId } : {}),
    ...(input.reviewedPlanContentHash ? { reviewed_plan_content_hash: input.reviewedPlanContentHash } : {}),
    ...(input.reviewedEvidenceArtifactId ? { reviewed_evidence_artifact_id: input.reviewedEvidenceArtifactId } : {})
  };

  next.approvals.push(approval);
  return withUpdatedAt(next, timestamp);
}

export function recordRemoteCheckResult(run: Run, input: RecordRemoteStatusOptions): Run {
  const timestamp = nowIso();
  const next = cloneRun(run);
  const gateId = input.gateId ?? DEFAULT_REMOTE_GATE_ID;
  const name = input.name ?? DEFAULT_REMOTE_GATE_NAME;
  const required = input.required ?? true;
  const status = input.status ?? "unknown";
  const remoteCheck: RemoteCheckResult = {
    check_result_id: nextId("remote-check", next.remote_checks.length),
    gate_id: gateId,
    name,
    status,
    required,
    recorded_at: timestamp,
    ci_run: {
      provider: input.provider ?? "unspecified",
      ...(input.providerRunId ? { run_id: input.providerRunId } : {}),
      ...(input.providerUrl ? { url: input.providerUrl } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    },
    ...(input.explanation ? { explanation: input.explanation } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
  const nextGate: RequiredGate = {
    gate_id: gateId,
    name,
    required,
    status,
    ...(input.explanation ? { explanation: input.explanation } : {}),
    check_result_id: remoteCheck.check_result_id
  };
  const gateIndex = next.required_gates.findIndex((gate) => gate.gate_id === gateId);

  if (gateIndex >= 0) {
    next.required_gates[gateIndex] = nextGate;
  } else {
    next.required_gates.push(nextGate);
  }

  next.remote_checks.push(remoteCheck);
  return withUpdatedAt(next, timestamp);
}

function missingVerificationResult(run: Run, timestamp: string): VerificationResult {
  return {
    verification_result_id: nextId("verification", run.verification_results.length),
    status: "missing",
    created_at: timestamp,
    summary: "No verifier artifact has been recorded for this runtime run.",
    source: "runtime",
    artifact_refs: [],
    command_results: []
  };
}

function missingReviewResult(run: Run, timestamp: string): ReviewResult {
  return {
    review_result_id: nextId("review", run.review_results.length),
    status: "MISSING",
    created_at: timestamp,
    summary: "No review artifact has been recorded for this runtime run.",
    source: "runtime",
    blockers: ["Review artifact is missing."],
    artifact_refs: []
  };
}

function latestVerification(run: Run, timestamp: string): VerificationResult {
  return run.verification_results.length > 0
    ? run.verification_results[run.verification_results.length - 1]
    : missingVerificationResult(run, timestamp);
}

function latestReview(run: Run, timestamp: string): ReviewResult {
  return run.review_results.length > 0
    ? run.review_results[run.review_results.length - 1]
    : missingReviewResult(run, timestamp);
}

function readExactGitObject(targetRoot: string, revision: string, kind: "commit" | "tree"): string {
  const result = runGitCommand(targetRoot, ["rev-parse", "--verify", `${revision}^{${kind}}`]);
  const value = result.stdout.trim();
  if (result.status !== 0 || !/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error(`delivery_source_${kind}_unavailable:${revision}`);
  }
  return value;
}

export function deriveDeliverySourceRelationship(
  targetRoot: string,
  run: Pick<Run, "run_id" | "final_reviewed_source_head">,
  deliveryFacts: DeliveryFactRecord[]
): DeliverySourceRelationshipV1 | undefined {
  const merge = evaluateMergeFacts(deliveryFacts);
  if (merge.blockers.length > 0) return undefined;
  const resultFact = merge.latestBuckets.merge_result?.[0];
  const commitFact = merge.latestBuckets.merge_commit?.[0];
  const reviewedHead = run.final_reviewed_source_head;
  const deliveredHead = commitFact?.commit_sha;
  if (!reviewedHead || !resultFact || !commitFact || !deliveredHead) return undefined;
  if (!/^[a-f0-9]{40}$/u.test(deliveredHead)
    || typeof resultFact.commit_sha !== "string"
    || !/^[a-f0-9]{40}$/u.test(resultFact.commit_sha)) {
    throw new Error("delivery_source_commit_identity_invalid");
  }
  if (resultFact.commit_sha !== deliveredHead) {
    throw new Error("delivery_source_merge_facts_disagree");
  }
  const reviewedCommit = readExactGitObject(targetRoot, reviewedHead, "commit");
  const deliveredCommit = readExactGitObject(targetRoot, deliveredHead, "commit");
  const reviewedTree = readExactGitObject(targetRoot, reviewedCommit, "tree");
  const deliveredTree = readExactGitObject(targetRoot, deliveredCommit, "tree");
  if (reviewedTree !== deliveredTree) {
    throw new Error("delivery_source_tree_mismatch");
  }
  if (reviewedCommit === deliveredCommit) {
    return {
      schema_version: 1,
      relationship: "identity",
      delivered_source_head: deliveredCommit,
      final_reviewed_source_head: reviewedCommit,
      delivered_tree_hash: deliveredTree,
      final_reviewed_tree_hash: reviewedTree,
      ancestry: "same_commit",
      delivery_fact_id: commitFact.delivery_fact_id
    };
  }
  const ancestor = runGitCommand(targetRoot, ["merge-base", "--is-ancestor", reviewedCommit, deliveredCommit]);
  if (ancestor.status !== 0) {
    throw new Error("delivery_source_ancestry_mismatch");
  }
  return {
    schema_version: 1,
    relationship: "merge_contains_exact_tree",
    delivered_source_head: deliveredCommit,
    final_reviewed_source_head: reviewedCommit,
    delivered_tree_hash: deliveredTree,
    final_reviewed_tree_hash: reviewedTree,
    ancestry: "ancestor",
    delivery_fact_id: commitFact.delivery_fact_id
  };
}

function findCloseoutBlockers(
  run: Run,
  targetRoot: string,
  verification: VerificationResult,
  review: ReviewResult,
  findings: Finding[],
  requiredGates: RequiredGate[],
  deliveryFacts: DeliveryFactRecord[]
): string[] {
  const blockers: string[] = [];

  if (verification.status !== "pass") {
    blockers.push(`Verification is ${verification.status}.`);
  }

  if (review.status !== "PASS") {
    blockers.push(`Review is ${review.status}.`);
  }

  for (const finding of findings) {
    if (finding.blocking && finding.status !== "resolved") {
      blockers.push(`Blocking finding remains open: ${finding.title}`);
    }
  }

  for (const gate of requiredGates) {
    if (gate.required && gate.status !== "pass") {
      blockers.push(`Required remote gate ${gate.name} is ${gate.status}.`);
      continue;
    }

    if (!gate.required && gate.status !== "pass" && !gate.explanation) {
      blockers.push(`Non-required remote gate ${gate.name} needs an explanation for status ${gate.status}.`);
    }
  }

  for (const blocker of evaluateMergeFacts(deliveryFacts).blockers) {
    blockers.push(`Merge delivery state is blocked: ${blocker}.`);
  }

  const requiresDeliverySourceProof = Boolean(
    run.implementation_baseline_head
    || run.final_reviewed_source_head
    || run.delivered_source_head
    || run.delivery_source_relationship
  );
  if (requiresDeliverySourceProof) {
    try {
      const expected = deriveDeliverySourceRelationship(targetRoot, run, deliveryFacts);
      if (!run.delivered_source_head || !run.delivery_source_relationship) {
        blockers.push("Delivery source relationship is absent.");
      } else if (!expected
        || canonicalJson(run.delivery_source_relationship) !== canonicalJson(expected)
        || run.delivered_source_head !== expected.delivered_source_head) {
        blockers.push("Delivery source relationship is stale, malformed, or bound to a different source/tree.");
      }
    } catch (error) {
      blockers.push(`Delivery source relationship is invalid: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }

  return blockers;
}

export function createCloseoutReceipt(run: Run, targetRoot = run.repository.root_path): CloseoutReceipt {
  const timestamp = nowIso();
  const verification = latestVerification(run, timestamp);
  const review = latestReview(run, timestamp);
  const blockers = findCloseoutBlockers(
    run, targetRoot, verification, review, run.findings, run.required_gates, run.delivery_facts
  );

  return {
    ...buildSchemaMetadata("node bin/ch run closeout"),
    receipt_id: nextId("closeout", run.closeout_receipts.length),
    run_id: run.run_id,
    task_path: run.task_path,
    ...(run.active_task_path ? { active_task_path: run.active_task_path } : {}),
    ...(run.phase_id ? { phase_id: run.phase_id } : {}),
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    created_at: timestamp,
    repository: run.repository,
    change_set: buildChangeSet(run.repository.root_path),
    verification_result: verification,
    review_result: review,
    findings: run.findings,
    decisions: run.decisions,
    approvals: run.approvals,
    required_gates: run.required_gates,
    remote_checks: run.remote_checks,
    blockers,
    delivery_facts: run.delivery_facts
  };
}

function runtimeRunsDir(targetRoot: string): string {
  return path.join(targetRoot, RUNTIME_RUNS_DIR);
}

function runDirectory(targetRoot: string, runId: string): string {
  return path.join(runtimeRunsDir(targetRoot), runId);
}

function runFilePath(targetRoot: string, runId: string): string {
  return path.join(runDirectory(targetRoot, runId), RUN_FILE);
}

function currentRunPointerPath(targetRoot: string): string {
  return path.join(runtimeRunsDir(targetRoot), CURRENT_RUN_FILE);
}

function closeoutFilePath(targetRoot: string, runId: string): string {
  return path.join(runDirectory(targetRoot, runId), CLOSEOUT_FILE);
}

function buildNextRunId(targetRoot: string): string {
  const runsDir = runtimeRunsDir(targetRoot);

  if (!fs.existsSync(runsDir) || !fs.statSync(runsDir).isDirectory()) {
    return "run-0001";
  }

  const maxRunNumber = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^run-(\d+)$/.exec(entry.name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0);

  return `run-${String(maxRunNumber + 1).padStart(4, "0")}`;
}

function hasExactRunIdentity(run: Run): run is Run & { run_instance_id: string; run_revision: number } {
  return typeof run.run_instance_id === "string"
    && run.run_instance_id.trim().length > 0
    && typeof run.run_revision === "number"
    && Number.isInteger(run.run_revision)
    && run.run_revision >= 1;
}

function requireExactRunIdentity(run: Run): asserts run is Run & { run_instance_id: string; run_revision: number } {
  if (!hasExactRunIdentity(run)) {
    throw new Error(
      `Run ${run.run_id} lacks exact immutable identity. Open a fresh replacement run or migrate this legacy run before mutating or harvesting it.`
    );
  }
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function capitalizeWords(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

const LEGACY_PROCEDURE_INGESTION_SCOPE = new Set([
  "task-intake", "task-prompt-writer", "draft-plan", "plan-review", "plan-amend",
  "architecture-review", "db-storage-review", "implementation-review", "fix-pass-review",
  "verification-review", "delivery-facts-review", "phase-closeout-review"
]);

const STRICT_REVIEW_RECOMMENDATION_TOKENS = new Set(["PASS", "FIX_REQUIRED", "AMEND_REQUIRED", "BLOCKED"]);

const IMPLEMENTATION_REVIEW_RECOMMENDATION_VARIANTS = [
  { normalized: "FIX_REQUIRED", variant: "REJECT / FIX-PASS REQUIRED" },
  { normalized: "FIX_REQUIRED", variant: "FIX_REQUIRED" },
  { normalized: "PASS", variant: "ACCEPT" }
] as const;

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeRuntimeRun(targetRoot: string, run: Run, guardAction?: string): string {
  const roots = resolveHarnessRoots(targetRoot);
  const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, run.run_id);
  staging.ensureInitialized();
  const existing = staging.loadRun(run.run_id);
  const persisted = guardAction
    ? staging.mutateRun(run.run_id, (latestRun) => {
        assertNoActiveReviewLaunchClaim(latestRun, guardAction);
        if (
          latestRun.run_instance_id
          && run.run_instance_id
          && latestRun.run_instance_id !== run.run_instance_id
        ) {
          throw new Error(
            `Run ${run.run_id} identity changed from ${latestRun.run_instance_id} to ${run.run_instance_id}; refusing to overwrite authoritative staging state.`
          );
        }
        return {
          ...run,
          ...(latestRun.run_instance_id ? { run_instance_id: run.run_instance_id ?? latestRun.run_instance_id } : {})
        };
      }, {
        expectedRunInstanceId: run.run_instance_id,
        ...(existing?.run_revision !== undefined ? { expectedRunRevision: existing.run_revision } : {}),
        expectedRunPresence: existing ? "present" : "absent",
        ...(!existing ? { seedRunIfMissing: run } : {})
      })
    : (() => {
        const nextRun = (() => {
          if (!existing) {
            return run;
          }
          if (
            existing.run_instance_id
            && run.run_instance_id
            && existing.run_instance_id !== run.run_instance_id
          ) {
            throw new Error(
              `Run ${run.run_id} identity changed from ${existing.run_instance_id} to ${run.run_instance_id}; refusing to overwrite authoritative staging state.`
            );
          }
          const nextRevision = typeof existing.run_revision === "number" && Number.isInteger(existing.run_revision)
            ? existing.run_revision + 1
            : 1;
          return {
            ...run,
            ...(existing.run_instance_id ? { run_instance_id: run.run_instance_id ?? existing.run_instance_id } : {}),
            run_revision: nextRevision
          };
        })();
        staging.saveRun(nextRun);
        return nextRun;
      })();
  writeCompatibilityRunArtifacts(targetRoot, persisted);
  return runFilePath(targetRoot, persisted.run_id);
}

function readCurrentRuntimeRun(targetRoot: string): { run: Run; runPath: string } | undefined {
  const pointerPath = currentRunPointerPath(targetRoot);

  if (!fs.existsSync(pointerPath) || !fs.statSync(pointerPath).isFile()) {
    return undefined;
  }

  const pointer = assertObject(readJsonFile(pointerPath), "runtime current pointer");
  assertRequiredString(pointer, "run_id", "runtime current pointer");
  assertRequiredString(pointer, "run_path", "runtime current pointer");
  const pointerRunInstanceId =
    typeof pointer.run_instance_id === "string" && pointer.run_instance_id.trim().length > 0
      ? pointer.run_instance_id
      : undefined;

  const runPath = path.resolve(runtimeRunsDir(targetRoot), String(pointer.run_path));
  const relative = path.relative(runtimeRunsDir(targetRoot), runPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Runtime current pointer resolves outside .harness/runs.");
  }

  const roots = resolveHarnessRoots(targetRoot);
  const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, String(pointer.run_id));
  const stagedRun = staging.loadRun(String(pointer.run_id));

  if (stagedRun) {
    if (pointerRunInstanceId && stagedRun.run_instance_id && stagedRun.run_instance_id !== pointerRunInstanceId) {
      throw new Error(
        `Runtime current pointer identity mismatch for ${String(pointer.run_id)}: expected ${pointerRunInstanceId}, got ${stagedRun.run_instance_id}.`
      );
    }
    return {
      run: stagedRun,
      runPath
    };
  }

  if (!fs.existsSync(runPath) || !fs.statSync(runPath).isFile()) {
    throw new Error(`Runtime current run is missing from staging DB and compatibility JSON: ${toRepoRelative(targetRoot, runPath)}`);
  }

  return {
    run: (() => {
      const run = validateRuntimeRun(readJsonFile(runPath));
      if (pointerRunInstanceId && run.run_instance_id && run.run_instance_id !== pointerRunInstanceId) {
        throw new Error(
          `Runtime current pointer identity mismatch for ${String(pointer.run_id)}: expected ${pointerRunInstanceId}, got ${run.run_instance_id}.`
        );
      }
      return run;
    })(),
    runPath
  };
}

function buildPreviewRun(targetRoot: string, taskPath: string, producerCommand: string): Run {
  const task = resolveTaskReference(targetRoot, taskPath);
  return buildRuntimeRun({
    runId: "run-dry-run",
    taskPath: task.taskPath,
    activeTaskPath: task.activeTaskPath,
    phaseId: task.phaseId,
    repository: buildRepositoryRef(targetRoot),
    producerCommand,
    timestamp: nowIso()
  });
}

function buildEvidenceScopeForRun(targetRoot: string, run: Run): EvidenceScope {
  return {
    target_project_id: buildTargetProjectId(targetRoot),
    target_root: targetRoot,
    namespace: DEFAULT_EVIDENCE_NAMESPACE,
    run_id: run.run_id,
    ...(run.phase_id ? { phase_id: run.phase_id } : {}),
    ...(run.active_task_path ?? run.task_path ? { task_path: run.active_task_path ?? run.task_path } : {}),
    ...(run.active_task_path ?? run.task_path
      ? { task_id: path.basename(run.active_task_path ?? run.task_path).replace(/\.[^.]+$/, "") }
      : {})
  };
}

function toRuntimeArtifactRef(ref: ArtifactEvidenceRef, description?: string): ArtifactRef {
  return {
    artifact_id: ref.artifact_id,
    path: ref.path,
    kind: ref.kind,
    ...(ref.producer_command ? { producer_command: ref.producer_command } : {}),
    ...(description ? { description } : {})
  };
}

async function appendRuntimeEvidence(
  targetRoot: string,
  run: Run,
  evidenceType: EvidenceEventEnvelope["evidence_type"],
  payload: Record<string, unknown>,
  producerCommand: string,
  options: {
    artifactRefs?: ArtifactEvidenceRef[];
    reusable?: boolean;
    stale?: boolean;
    inputFingerprint?: string;
  } = {}
): Promise<EvidenceEventEnvelope> {
  const store = new MemoryEvidenceStore(targetRoot);
  const result = await store.append({
    evidenceType,
    scope: buildEvidenceScopeForRun(targetRoot, run),
    producerCommand,
    provenance: {
      producer: { type: "runtime", command: producerCommand },
      produced_at: nowIso(),
      ...(options.inputFingerprint ? { input_fingerprint: options.inputFingerprint } : {}),
      reusable: options.reusable ?? evidenceType === "verified_snapshot",
      stale: options.stale ?? false,
      sensitivity: "local",
      redaction_status: "not_applicable",
      exportable: false,
      artifact_refs: options.artifactRefs ?? []
    },
    payload
  });
  return result.event;
}

function dedupeRuntimeArtifactRefs(artifacts: ArtifactRef[]): ArtifactRef[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = `${artifact.artifact_id}:${artifact.path}:${artifact.kind}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildRuntimeVerificationDisplayCommand(command: RuntimeVerificationCommand): string {
  return command.displayCommand ?? formatCommandForDisplay(command.command, command.args);
}

function isPrePhaseFVerificationCompatibility(phaseId: string | undefined): boolean {
  if (!phaseId) return true;
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?([A-Z].*)?$/u.exec(phaseId);
  if (!match) return false;
  const numeric = [match[1], match[2] ?? "0", match[3] ?? "0"].map((entry) => Number.parseInt(entry, 10));
  const boundary = [23, 8, 6];
  for (let index = 0; index < boundary.length; index += 1) {
    if (numeric[index] !== boundary[index]) return numeric[index] < boundary[index];
  }
  const suffix = match[4];
  return !suffix || suffix[0] < "F";
}

const PLANNING_REVIEW_LENSES = ["plan-review", "architecture-review", "db-storage-review"] as const;
type PlanningReviewLensId = typeof PLANNING_REVIEW_LENSES[number];

function deriveRequiredPlanningReviewLenses(targetRoot: string, run: Run): PlanningReviewLensId[] {
  // Preserve the completed Phase 23.9 combined-cohort contract unchanged.
  if (run.phase_id === "23.9") return [...PLANNING_REVIEW_LENSES];
  const activeTaskPath = run.active_task_path ?? run.task_path;
  const taskAbsolutePath = path.join(targetRoot, activeTaskPath);
  const taskMarkdown = readUtf8FileIfExists(taskAbsolutePath) ?? "";
  // Pre-contract runs keep their historical single-lens behavior. Only an
  // explicit task-owned typed floor activates planned-facts derivation.
  if (!parseTaskPlanningReviewAuthorityFacts(taskMarkdown)) return ["plan-review"];
  const planBinding = tryResolveExactPlanEvidenceBinding(run);
  if (!planBinding || !run.run_instance_id) return ["plan-review"];
  const planArtifact = run.artifacts.find((entry) => entry.artifact_id === planBinding.artifactId);
  const planMarkdown = planArtifact?.path
    ? readUtf8FileIfExists(path.join(runDirectory(targetRoot, run.run_id), planArtifact.path)) ?? ""
    : "";
  const immutableBase = run.bootstrap_facts?.find((fact) => fact.label === "base_commit")?.value ?? run.source_snapshot;
  if (!immutableBase) throw new Error("planning_review_bundle_immutable_base_missing");
  const knownSourceFacts = reviewChangeInventory(targetRoot, immutableBase, resolveExactCommit(targetRoot, "HEAD"));
  const facts = resolvePlanningReviewFacts({
    taskMarkdown,
    planMarkdown,
    taskArtifactId: `sha256:${sha256Hex(fs.readFileSync(taskAbsolutePath))}`,
    activeTaskPath,
    phaseId: run.phase_id ?? "",
    effectivePlanArtifactId: planBinding.artifactId as `sha256:${string}`,
    runInstanceId: run.run_instance_id,
    immutableBase,
    knownChangedSurfaceClasses: knownSourceFacts.changedSurfaceClasses,
    knownRiskClasses: knownSourceFacts.riskClasses
  });
  return facts?.required_planning_lenses ?? ["plan-review"];
}

function resolveCurrentPlanningReviewCohortDisposition(
  targetRoot: string,
  projectRoot: string,
  run: Run,
  requiredLenses: readonly PlanningReviewLensId[]
): PlanningCohortDispositionResult {
  const plan = tryResolveExactPlanEvidenceBinding(run);
  if (!plan || !run.run_instance_id) {
    return { disposition: "INVALID", error_code: "planning_cohort_plan_or_run_identity_missing", missing_lenses: [] };
  }
  const staging = new RunStagingDatabase(targetRoot, projectRoot, run.run_id);
  const attempts = staging.listIndependentRecords("review_attempt", run.run_id) as Array<Record<string, unknown>>;
  const cohorts = staging.listIndependentRecords("review_cohort", run.run_id) as Array<Record<string, unknown>>;
  const currentHead = resolveExactCommit(targetRoot, "HEAD");
  const taskPath = path.join(targetRoot, run.active_task_path ?? run.task_path);
  const taskArtifactId = `sha256:${sha256Hex(fs.readFileSync(taskPath))}` as `sha256:${string}`;
  const immutableBase = run.bootstrap_facts?.find((fact) => fact.label === "base_commit")?.value ?? run.source_snapshot;
  if (!immutableBase) return { disposition: "INVALID", error_code: "planning_cohort_base_missing", missing_lenses: [] };
  const currentCohorts = cohorts.filter((cohort) => cohort.run_instance_id === run.run_instance_id
    && cohort.run_id === run.run_id && cohort.anchor_plan_sha === plan.artifactId
    && cohort.task_artifact_id === taskArtifactId && cohort.immutable_base === immutableBase
    && cohort.planning_review_source_head === currentHead);
  if (currentCohorts.length > 1) {
    return { disposition: "INVALID", error_code: "planning_cohort_identity_ambiguous", missing_lenses: [] };
  }
  const cohort = currentCohorts[0];
  if (!cohort || typeof cohort.record_id !== "string") {
    return { disposition: "INCOMPLETE", missing_lenses: [...requiredLenses] };
  }
  const matchingAttempts = attempts.filter((attempt) => attempt.attempt_kind === "planning_bundle"
    && attempt.cohort_id === cohort.record_id
    && attempt.run_instance_id === run.run_instance_id
    && attempt.run_id === run.run_id);
  const successfulAttempts = matchingAttempts.filter((attempt) => attempt.terminal_status === "success");
  if (successfulAttempts.length > 1) {
    return { disposition: "INVALID", error_code: "planning_cohort_success_ambiguous", missing_lenses: [] };
  }
  const attempt = successfulAttempts[0];
  if (!attempt) return { disposition: "INCOMPLETE", missing_lenses: [...requiredLenses] };
  const resultRefs = Array.isArray(attempt.lens_results) ? attempt.lens_results as Array<Record<string, unknown>> : [];
  const lenses = requiredLenses.flatMap((procedureId) => {
    const ref = resultRefs.find((entry) => entry.procedure_id === procedureId && entry.status === "recorded");
    if (typeof ref?.artifact_id !== "string" || typeof ref.artifact_hash !== "string") return [];
    const descriptor = staging.readProcedureArtifact(run.run_instance_id!, procedureId, ref.artifact_id);
    if (!descriptor) return [];
    const bundle = staging.listIndependentRecords("planning_review_bundle", run.run_id)
      .find((entry) => (entry as Record<string, unknown>).cohort_id === cohort.record_id) as Record<string, unknown> | undefined;
    if (!bundle || typeof bundle.raw_envelope_utf8 !== "string") return [];
    const envelope = JSON.parse(bundle.raw_envelope_utf8) as { lens_results?: PlanningLensResultV1[] };
    const result = envelope.lens_results?.find((entry) => entry.procedure_id === procedureId);
    if (!result) return [];
    let provenance: Record<string, unknown>;
    try { provenance = assertObject(JSON.parse(descriptor.provenance_json), "Planning lens provenance"); }
    catch { return []; }
    return [{
      procedure_id: procedureId,
      result,
      artifact_id: ref.artifact_id as `sha256:${string}`,
      artifact_content_hash: ref.artifact_hash as `sha256:${string}`,
      descriptor: {
        run_instance_id: descriptor.run_instance_id,
        run_id: descriptor.source_run_id,
        procedure_id: descriptor.procedure_id,
        artifact_id: descriptor.artifact_id,
        content_hash: descriptor.content_hash,
        reviewed_plan_artifact_id: descriptor.reviewed_plan_artifact_id,
        reviewed_plan_content_hash: descriptor.reviewed_plan_content_hash,
        provenance
      }
    }];
  });
  return resolvePlanningCohortDisposition({
    run_instance_id: run.run_instance_id,
    run_id: run.run_id,
    task_artifact_id: taskArtifactId,
    effective_plan_artifact_id: plan.artifactId as `sha256:${string}`,
    effective_plan_content_hash: plan.contentHash,
    immutable_base: immutableBase,
    reviewed_source_head: currentHead,
    required_lens_ids: [...requiredLenses],
    cohort_required_lens_ids: Array.isArray(cohort.required_lens_ids)
      ? cohort.required_lens_ids as PlanningReviewLensId[] : [],
    attempt_required_lens_ids: Array.isArray(attempt.procedure_ids)
      ? attempt.procedure_ids as PlanningReviewLensId[] : [],
    cohort_id: cohort.record_id as `sha256:${string}`,
    terminal_status: String(attempt.terminal_status),
    lenses
  });
}

function hasPhaseFDurableImplementationBaseline(run: Run): boolean {
  const binding = run.implementation_baseline_binding;
  return Boolean(
    run.implementation_baseline_head
    && binding
    && binding.schema_version === 2
    && binding.plan_review_artifact_hash
    && binding.authority_transition
    && run.implementation_baseline_head === binding.implementation_baseline_head
  );
}

function resolveExactApprovedPlanAuthority(
  targetRoot: string,
  run: Run
): { approval: Approval; artifact: ArtifactRef; body: string; contentHash: string } | undefined {
  const approval = [...run.approvals].reverse().find((entry) =>
    entry.title === "Reviewed plan approved" && entry.status === "approved"
  );
  if (!approval) {
    if (isPrePhaseFVerificationCompatibility(run.phase_id)) return undefined;
    throw new Error("VERIFICATION_AUTHORITY_PLAN_MISSING: Phase F and later require exact reviewed-plan approval authority.");
  }
  if (!approval.reviewed_plan_artifact_id || !/^sha256:[a-f0-9]{64}$/u.test(approval.reviewed_plan_artifact_id)
    || !/^[a-f0-9]{64}$/u.test(approval.reviewed_plan_content_hash ?? "")
    || approval.reviewed_plan_content_hash !== approval.reviewed_plan_artifact_id.slice("sha256:".length)) {
    if (isPrePhaseFVerificationCompatibility(run.phase_id)) return undefined;
    throw new Error("VERIFICATION_AUTHORITY_PLAN_IDENTITY_MISMATCH: the latest reviewed-plan approval lacks an exact plan binding.");
  }
  const artifact = run.artifacts.find((entry) =>
    entry.artifact_id === approval.reviewed_plan_artifact_id
    && ["procedure-artifact:draft-plan", "procedure-artifact:plan-amend"].includes(entry.kind)
  );
  if (!artifact) {
    if (isPrePhaseFVerificationCompatibility(run.phase_id)) return undefined;
    throw new Error("VERIFICATION_AUTHORITY_PLAN_MISSING: the exact effective approved-plan artifact is unavailable.");
  }
  const runRoot = runDirectory(targetRoot, run.run_id);
  const approvedPlanPath = path.resolve(runRoot, artifact.path);
  ensureInsideTargetRoot(runRoot, approvedPlanPath);
  if (!fs.existsSync(approvedPlanPath) || !fs.statSync(approvedPlanPath).isFile()) {
    if (isPrePhaseFVerificationCompatibility(run.phase_id)) return undefined;
    throw new Error("VERIFICATION_AUTHORITY_PLAN_MISSING: the exact effective approved-plan artifact is unavailable.");
  }
  const body = fs.readFileSync(approvedPlanPath, "utf8");
  const contentHash = sha256Hex(body);
  if (`sha256:${contentHash}` !== artifact.artifact_id || approval.reviewed_plan_content_hash !== contentHash) {
    if (isPrePhaseFVerificationCompatibility(run.phase_id)) return undefined;
    throw new Error("VERIFICATION_AUTHORITY_PLAN_IDENTITY_MISMATCH: the effective approved-plan artifact hash is not exact.");
  }
  return { approval, artifact, body, contentHash };
}

function buildSelfHostingVerificationCommands(targetRoot: string, run: Run): RuntimeVerificationCommand[] | undefined {
  const approvedPlan = resolveExactApprovedPlanAuthority(targetRoot, run);
  if (approvedPlan) {
    const effectiveCommands = extractEffectiveValidationCommands(approvedPlan.body);
    if (effectiveCommands.length > 0) {
      return effectiveCommands.map((commandLine) => buildTaskAcceptanceVerificationCommand(commandLine));
    }
    if (!isPrePhaseFVerificationCompatibility(run.phase_id)) {
      throw new Error("VERIFICATION_AUTHORITY_INVENTORY_MISSING: Phase F and later require a non-empty approved Effective Validation inventory.");
    }
  }
  const activeTaskMarkdown = resolveRunActiveTaskMarkdown(targetRoot, run);
  const taskAcceptanceCommands = activeTaskMarkdown ? extractAcceptanceCommands(activeTaskMarkdown) : [];

  if (taskAcceptanceCommands.length > 0) {
    return taskAcceptanceCommands.map((commandLine) => buildTaskAcceptanceVerificationCommand(commandLine));
  }

  const packageJsonPath = path.join(targetRoot, "package.json");

  if (!fs.existsSync(packageJsonPath) || !fs.statSync(packageJsonPath).isFile()) {
    return undefined;
  }

  try {
    const packageJson = assertObject(readJsonFile(packageJsonPath), "package.json");
    const name = typeof packageJson.name === "string" ? packageJson.name.trim() : "";
    const scripts = packageJson.scripts && typeof packageJson.scripts === "object"
      ? (packageJson.scripts as Record<string, unknown>)
      : {};

    if (name !== "codex-harness") {
      return undefined;
    }

    const commands: RuntimeVerificationCommand[] = [];
    if (typeof scripts.build === "string") {
      commands.push({ command: "npm", args: ["run", "build"], shell: false, timeoutSeconds: 600 });
    }
    if (typeof scripts.test === "string") {
      commands.push({ command: "npm", args: ["test"], shell: false, timeoutSeconds: 1800 });
    }

    return commands.length > 0 ? commands : undefined;
  } catch {
    return undefined;
  }
}

function verificationSatisfiesRequiredCommandInventory(
  targetRoot: string,
  run: Run,
  verification: VerificationResult | undefined
): boolean {
  const required = buildSelfHostingVerificationCommands(targetRoot, run)?.map(buildRuntimeVerificationDisplayCommand) ?? [];
  if (!verification || verification.status !== "pass" || required.length === 0) return false;
  const actual = verification.command_results.map((entry) => entry.command);
  return canonicalJson(actual) === canonicalJson(required)
    && verification.command_results.every((entry) => entry.status === "pass" && entry.exit_code === 0);
}

function commandSpecsToEvidence(commands: RuntimeVerificationCommand[]): VerificationCommandSpec[] {
  return commands.map((command) => ({
    command: buildRuntimeVerificationDisplayCommand(command)
  }));
}

function commandEvidenceFromVerification(verification: VerificationResult): VerificationCommandResultEvidence[] {
  return verification.command_results.map((result) => {
    const stdoutArtifact = result.artifact_refs.find((artifact) => artifact.kind === "stdout");
    const stderrArtifact = result.artifact_refs.find((artifact) => artifact.kind === "stderr");

    return {
      command: result.command,
      exit_code: result.exit_code ?? (result.status === "pass" ? 0 : 1),
      duration_ms: result.duration_ms ?? 0,
      ...(stdoutArtifact
        ? {
            stdout_artifact: {
              artifact_id: stdoutArtifact.artifact_id,
              sha256: stdoutArtifact.artifact_id.replace(/^sha256:/, ""),
              path: stdoutArtifact.path,
              kind: stdoutArtifact.kind,
              media_type: "text/plain",
              size_bytes: 0,
              sensitivity: "local",
              redaction_status: "not_applicable",
              exportable: false
            }
          }
        : {}),
      ...(stderrArtifact
        ? {
            stderr_artifact: {
              artifact_id: stderrArtifact.artifact_id,
              sha256: stderrArtifact.artifact_id.replace(/^sha256:/, ""),
              path: stderrArtifact.path,
              kind: stderrArtifact.kind,
              media_type: "text/plain",
              size_bytes: 0,
              sensitivity: "local",
              redaction_status: "not_applicable",
              exportable: false
            }
          }
        : {})
    };
  });
}

function buildRuntimeVerificationFromSnapshot(run: Run, snapshot: VerifiedSnapshot, summary: string, source: string): VerificationResult {
  const commandResults = snapshot.command_results.map((result, index) => {
    const artifactRefs = [
      ...(result.stdout_artifact ? [toRuntimeArtifactRef(result.stdout_artifact)] : []),
      ...(result.stderr_artifact ? [toRuntimeArtifactRef(result.stderr_artifact)] : [])
    ];

    return {
      command_result_id: `${source === "evidence-reuse" ? "reused" : "verification"}-command-${index + 1}`,
      command: result.command,
      exit_code: result.exit_code,
      status: result.exit_code === 0 ? "pass" : "fail",
      completed_at: snapshot.timestamp,
      duration_ms: result.duration_ms,
      artifact_refs: artifactRefs
    } satisfies CommandResult;
  });

  return {
    verification_result_id: nextId("verification", run.verification_results.length),
    status: snapshot.command_results.length > 0 && snapshot.command_results.every((result) => result.exit_code === 0) ? "pass" : "fail",
    created_at: snapshot.timestamp,
    summary,
    source,
    artifact_refs: dedupeRuntimeArtifactRefs(commandResults.flatMap((result) => result.artifact_refs)),
    command_results: commandResults
  };
}

function loadRunForMutation(
  targetRoot: string,
  dryRun: boolean,
  runId?: string,
  requireExactIdentity = true
): { run: Run; runPath?: string; state: "loaded" | "preview" } {
  const roots = resolveHarnessRoots(targetRoot);
  const current = runId
    ? (() => {
        const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, runId);
        const run = staging.loadRun(runId);
        if (run) {
          return { run, runPath: runFilePath(targetRoot, runId) };
        }

        const compatibilityRunPath = runFilePath(targetRoot, runId);
        if (fs.existsSync(compatibilityRunPath) && fs.statSync(compatibilityRunPath).isFile()) {
          return {
            run: validateRuntimeRun(readJsonFile(compatibilityRunPath)),
            runPath: compatibilityRunPath
          };
        }

        return undefined;
      })()
    : readCurrentRuntimeRun(targetRoot);

  if (current) {
    if (!dryRun && requireExactIdentity) {
      requireExactRunIdentity(current.run);
    }
    return {
      run: current.run,
      runPath: current.runPath,
      state: "loaded"
    };
  }

  if (dryRun) {
    return {
      run: buildPreviewRun(targetRoot, "TASK.md", "node bin/ch run start --dry-run"),
      state: "preview"
    };
  }

  throw new Error("No current runtime run found. Run `node bin/ch run start --task TASK.md` first.");
}

function buildPhase239ProcedureRequirements(): ProcedureRequirementV1[] {
  const always = (procedure_id: string, procedure_occurrence: ProcedureRequirementV1["procedure_occurrence"] = "single"): ProcedureRequirementV1 => ({
    procedure_id, procedure_occurrence, requirement_class: "always",
    predicate_id: "always", predicate_result: "true", basis_ref_ids: []
  });
  const conditional = (procedure_id: string, procedure_occurrence: ProcedureRequirementV1["procedure_occurrence"],
    predicate_id: string, predicate_result: ProcedureRequirementV1["predicate_result"]): ProcedureRequirementV1 => ({
    procedure_id, procedure_occurrence, requirement_class: "required_if", predicate_id,
    predicate_result, basis_ref_ids: [`predicate-contract:${predicate_id}`]
  });
  return [
    ...["task-intake", "task-prompt-writer", "draft-plan"].map((id) => always(id)),
    always("plan-review", "planning_candidate"), always("architecture-review", "planning_candidate"),
    always("db-storage-review", "planning_candidate"), always("implementation-review"),
    always("verification-review"), always("delivery-facts-review"), always("phase-closeout-review"),
    conditional("feature-decomposition", "single", "task_intake_requires_decomposition", "false"),
    conditional("plan-amend", "single", "candidate_has_plan_blocker_or_owner_external_audit", "true"),
    conditional("plan-review", "planning_closure", "amendment_manifest_intersects_lens", "true"),
    conditional("architecture-review", "planning_closure", "amendment_manifest_intersects_lens", "true"),
    conditional("db-storage-review", "planning_closure", "amendment_manifest_intersects_lens", "true"),
    conditional("fix-pass-review", "single", "implementation_chain_requires_fix", "deferred"),
    conditional("docs-consistency-review", "single", "authoritative_docs_prompts_skills_or_policy_changed", "true"),
    conditional("harness-audit", "single", "lifecycle_runtime_or_authority_contract_changed", "true")
  ];
}

function buildPhase239StageRequirements(): StageRequirementV1[] {
  const always = (stage_id: string): StageRequirementV1 => ({
    stage_id, requirement_class: "always", predicate_id: "always", predicate_result: "true", basis_ref_ids: []
  });
  const conditional = (stage_id: string, predicate_id: string,
    predicate_result: StageRequirementV1["predicate_result"]): StageRequirementV1 => ({
    stage_id, requirement_class: "required_if", predicate_id, predicate_result,
    basis_ref_ids: [`predicate-contract:${predicate_id}`]
  });
  return [
    ...["TASK_INTAKE_REQUIRED", "TASK_PROMPT_REQUIRED", "DRAFT_PLAN_REQUIRED", "PLAN_REVIEW_REQUIRED",
      "PLAN_APPROVAL_REQUIRED", "IMPLEMENTATION_READY", "IMPLEMENTATION_REVIEW_REQUIRED",
      "VERIFICATION_REVIEW_REQUIRED", "DELIVERY_FACTS_REVIEW_REQUIRED", "CLOSEOUT_REVIEW_REQUIRED",
      "CLOSEOUT_READY", "HARVEST_READY", "RUN_HARVESTED"].map(always),
    conditional("FEATURE_DECOMPOSITION_REQUIRED", "task_intake_requires_decomposition", "false"),
    conditional("PLAN_AMEND_REQUIRED", "candidate_has_plan_blocker_or_owner_external_audit", "true"),
    conditional("POST_AMEND_PLAN_REVIEW_REQUIRED", "amendment_requires_closure", "true"),
    conditional("FIX_PASS_REQUIRED", "implementation_chain_requires_fix", "deferred"),
    conditional("RUN_BLOCKED", "terminal_blocked", "deferred"),
    conditional("RUN_QUARANTINED", "terminal_quarantined", "deferred"),
    conditional("RUN_DISCARDED", "terminal_discarded", "deferred")
  ];
}

export async function startRuntimeRun(cwd: string, options: StartRuntimeRunOptions): Promise<RuntimeServiceResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const task = resolveTaskReference(targetRoot, options.taskPath);
  const seedRun = buildRuntimeRun({
    runId: dryRun ? "run-dry-run" : buildNextRunId(targetRoot),
    taskPath: task.taskPath,
    activeTaskPath: task.activeTaskPath,
    phaseId: task.phaseId,
    repository: buildRepositoryRef(targetRoot),
    timestamp: nowIso()
  });
  const seededPaths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, seedRun.run_id);
  const run: Run = {
    ...seedRun,
    source_staging_db_path: seededPaths.stagingDbPath,
    source_snapshot: seedRun.repository.head_sha
  };
  const bootstrapEvaluation = evaluateBootstrapIssues(targetRoot, run);
  const runIssues = [...bootstrapEvaluation.issues];
  const selectedTask = selectTaskStateForCheckout(run.repository.project_root, targetRoot, run.repository.branch).task;
  if (!dryRun && isMaterializedSuccessor(run) && runIssues.length === 0) {
    try {
      bootstrapWorktree(targetRoot);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      runIssues.push(buildRunIssue(run, runIssues, {
        issueType: "worktree_bootstrap_not_ready",
        summary: "Deterministic worktree bootstrap readiness cannot be proven.",
        details: `Run node bin/ch worktree bootstrap successfully before starting the successor run: ${detail}`,
        phaseId: "23.8.6C2A"
      }));
    }
  }
  const repairPacket = buildRepairPacket(run, runIssues);
  const runWithBootstrap: Run = {
    ...run,
    bootstrap_status: runIssues.length > 0 ? "blocked" : "ready",
    bootstrap_facts: buildBootstrapFacts({
      ...run,
      bootstrap_status: runIssues.length > 0 ? "blocked" : "ready"
    }, bootstrapEvaluation.baseAuthority, bootstrapEvaluation.requiresBaseAuthority),
    run_issues: runIssues,
    repair_packets: repairPacket ? [repairPacket] : []
  };
  const operatorStatus = resolveRuntimeOperatorStatus(targetRoot, {
    dryRun: true,
    runId: runWithBootstrap.run_id,
    runOverride: runWithBootstrap
  });
  const bootstrapResult: RuntimeBootstrapResult = {
    status: runWithBootstrap.bootstrap_status ?? "ready",
    facts: runWithBootstrap.bootstrap_facts ?? [],
    operator: operatorStatus.operator,
    issues: runWithBootstrap.run_issues,
    ...(repairPacket
      ? { repairPacket }
      : { handoff: buildWorkerHandoff(runWithBootstrap, operatorStatus.operator) })
  };
  const finalRun: Run = {
    ...runWithBootstrap,
    ...(bootstrapResult.handoff ? { bootstrap_handoff: bootstrapResult.handoff } : {})
  };

  if (dryRun) {
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      run: finalRun,
      bootstrap: bootstrapResult,
      projectDbPath: seededPaths.projectDbPath,
      stagingDbPath: seededPaths.stagingDbPath,
      state: "preview"
    };
  }

  if (bootstrapEvaluation.requiresActivation && runIssues.length > 0) {
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      run: finalRun,
      bootstrap: bootstrapResult,
      projectDbPath: seededPaths.projectDbPath,
      stagingDbPath: seededPaths.stagingDbPath,
      state: "blocked"
    };
  }

  const projectDb = new ProjectMemoryDatabase(targetRoot, roots.projectRoot);
  projectDb.ensureInitialized();
  let persistedRun = finalRun;
  let runPath: string;
  if (finalRun.phase_id === "23.9" && finalRun.run_mode === "normal") {
    if (!finalRun.run_instance_id || !finalRun.repository.head_sha || !selectedTask?.base_commit_sha) {
      throw new Error("proof_eligibility_start_identity_missing");
    }
    const componentPaths = [
      ["procedure_registry", "skills/self-hosting/procedure-registry.json"],
      ["execution_policy", "skills/self-hosting/procedure-execution-policy.json"],
      ["stage_map", "docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md"],
      ["predicate_contract", "src/core/proof-eligibility.ts"]
    ] as const;
    const activeTaskPath = path.join(targetRoot, finalRun.active_task_path ?? finalRun.task_path);
    const snapshot = buildProofEligibilitySnapshot({
      run_instance_id: finalRun.run_instance_id,
      task_artifact_id: `sha256:${sha256Hex(fs.readFileSync(activeTaskPath))}`,
      immutable_base: selectedTask.base_commit_sha,
      activation_source_head: finalRun.repository.head_sha,
      component_refs: componentPaths.map(([componentKind, relativePath]) => ({
        component_kind: componentKind,
        path: relativePath,
        content_hash: `sha256:${sha256Hex(fs.readFileSync(path.join(targetRoot, relativePath)))}`
      })),
      procedure_requirements: buildPhase239ProcedureRequirements(),
      stage_requirements: buildPhase239StageRequirements(),
      bootstrap_eligibility: "eligible",
      created_at: finalRun.created_at
    });
    const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, finalRun.run_id);
    staging.ensureInitialized();
    persistedRun = staging.mutateRunWithDatabase(finalRun.run_id, (seed, database) => {
      staging.storeIndependentRecord(database, {
        recordKind: "proof_eligibility_snapshot",
        recordId: snapshot.snapshot_id,
        runId: seed.run_id,
        phaseId: seed.phase_id,
        taskPath: seed.task_path,
        createdAt: snapshot.created_at,
        status: snapshot.bootstrap_eligibility,
        summary: "Immutable Phase 23.9 proof eligibility snapshot.",
        payload: snapshot
      });
      const readback = staging.readIndependentRecord(
        database,
        "proof_eligibility_snapshot",
        snapshot.snapshot_id,
        seed.run_id
      );
      if (canonicalJson(readback) !== canonicalJson(snapshot)) {
        throw new Error("proof_eligibility_snapshot_readback_failed");
      }
      return seed;
    }, {
      expectedRunInstanceId: finalRun.run_instance_id,
      expectedRunPresence: "absent",
      seedRunIfMissing: finalRun
    });
    writeCompatibilityRunArtifacts(targetRoot, persistedRun);
    runPath = runFilePath(targetRoot, persistedRun.run_id);
  } else {
    runPath = writeRuntimeRun(targetRoot, finalRun);
  }
  await appendRuntimeEvidence(
    targetRoot,
    persistedRun,
    "run",
    {
      summary: `Started runtime run ${persistedRun.run_id}.`,
      run_id: persistedRun.run_id,
      task_path: persistedRun.task_path,
      active_task_path: persistedRun.active_task_path,
      phase_id: persistedRun.phase_id,
      run_mode: persistedRun.run_mode,
      lifecycle_status: persistedRun.lifecycle_status,
      bootstrap_status: bootstrapResult.status,
      bootstrap_issue_count: bootstrapResult.issues.length,
      bootstrap_handoff_procedure: bootstrapResult.handoff?.procedure_id
    },
    "node bin/ch run start"
  );

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run: persistedRun,
    bootstrap: bootstrapResult,
    runPath,
    projectDbPath: seededPaths.projectDbPath,
    stagingDbPath: seededPaths.stagingDbPath,
    state: "created"
  };
}

function requireReviewLaunchCapability(
  proceduresById: Map<string, SelfHostingProcedureDescriptor>,
  procedureId: string
): SelfHostingProcedureDescriptor {
  if (!["plan-review", "implementation-review", "fix-pass-review"].includes(procedureId)) {
    throw new Error("--procedure must be one of: plan-review, implementation-review, fix-pass-review.");
  }

  const descriptor = proceduresById.get(procedureId);
  if (!descriptor) {
    throw new Error(`Unknown self-hosting procedure id: ${procedureId}`);
  }

  if (!descriptor.automatic_launch_capability) throw new Error(`Procedure ${procedureId} has no automatic_launch_capability.`);
  return descriptor;
}

function resolveLaunchTiming(
  targetRoot: string,
  procedureIds: string[],
  timeoutOverride: number | undefined,
  staleAfterOverride: number | undefined
): { timeoutSeconds: number; staleAfterSeconds: number; terminationPolicy: "terminal_completion_only" } {
  const policy = readProcedureExecutionPolicy(targetRoot);
  const timing = resolveReviewLaunchTiming(policy, procedureIds);
  const resolveOverride = (
    value: number | undefined,
    bounds: { minimum_seconds: number; maximum_seconds: number },
    field: string,
    fallback: number
  ): number => {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < bounds.minimum_seconds || value > bounds.maximum_seconds) {
      throw new Error(`${field} must be an integer within the registered policy range ${bounds.minimum_seconds}-${bounds.maximum_seconds}.`);
    }
    return value;
  };
  const timeoutSeconds = resolveOverride(timeoutOverride, timing.timeout_override, "--timeout-seconds", timing.timeout_seconds);
  const staleAfterSeconds = resolveOverride(staleAfterOverride, timing.stale_after_override, "--stale-after-seconds", timing.stale_after_seconds);
  if (staleAfterSeconds >= timeoutSeconds) {
    throw new Error("--stale-after-seconds must remain below the effective registered review timeout.");
  }
  return { timeoutSeconds, staleAfterSeconds, terminationPolicy: timing.termination_policy };
}

function resolveLaunchRequestPath(targetRoot: string, requestPath: string): string {
  const absolutePath = path.resolve(targetRoot, requestPath);
  ensureInsideTargetRoot(targetRoot, absolutePath);

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Review request artifact not found: ${requestPath}`);
  }

  return absolutePath;
}

function resolveLaunchOutputPath(targetRoot: string, run: Run, outputPath: string): string {
  const absolutePath = path.resolve(targetRoot, outputPath);
  ensureInsideTargetRoot(targetRoot, absolutePath);
  const relativePath = normalizeRepoRelativePath(toRepoRelative(targetRoot, absolutePath));
  const allowedPrefixes = [
    `.harness/runs/${run.run_id}/manual/`,
    `.harness/runs/${run.run_id}/evidence/`
  ];

  if (!allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    throw new Error(`Review output path must stay under .harness/runs/${run.run_id}/manual or evidence.`);
  }

  return absolutePath;
}

function boundedTail(value: string, maxLength = 4000): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function classifyReviewProcessFailure(exitCode: number | undefined, stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  if (/\b(auth|unauthori[sz]ed|forbidden|api key|model|not found)\b/u.test(combined)) {
    return "REVIEW_MODEL_OR_AUTH_FAILURE";
  }

  return exitCode === undefined ? "REVIEW_UNKNOWN_RUNTIME_FAILURE" : "REVIEW_COMMAND_FAILED";
}

function classifyInvalidReviewArtifact(reason: string | undefined, artifactPresent: boolean): string {
  if (!artifactPresent) {
    return "REVIEW_COMPLETED_ARTIFACT_MISSING";
  }

  const normalized = (reason ?? "").toLowerCase();
  if (normalized.includes("missing required section")) {
    return "REVIEW_ARTIFACT_CONTRACT_MISMATCH";
  }
  if (normalized.includes("recommendation") || normalized.includes("verdict")) {
    return "REVIEW_ARTIFACT_VERDICT_UNRECOGNIZED";
  }

  return "REVIEW_ARTIFACT_INVALID";
}

function extractMarkdownFromJsonLine(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object") {
        continue;
      }
      const record = parsed as Record<string, unknown>;
      for (const key of ["final_message", "finalMessage", "message", "content", "output"]) {
        if (typeof record[key] === "string" && record[key].trim().length > 0) {
          return record[key];
        }
      }
    } catch {
      // Keep looking for a supported final-message line.
    }
  }

  return undefined;
}

function readValidLaunchArtifact(procedureId: string, outputPath: string, stdout: string): {
  markdown?: string;
  provenance?: "expected_output_file" | "stdout_fallback" | "final_message_fallback";
  invalidReason?: string;
} {
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).isFile()) {
    const markdown = fs.readFileSync(outputPath, "utf8");
    try {
      validateReviewLaunchArtifact(procedureId, markdown);
      return { markdown, provenance: "expected_output_file" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { invalidReason: message };
    }
  }

  const finalMessage = extractMarkdownFromJsonLine(stdout);
  if (finalMessage) {
    try {
      validateReviewLaunchArtifact(procedureId, finalMessage);
      return { markdown: finalMessage, provenance: "final_message_fallback" };
    } catch {
      // Fall through to raw stdout.
    }
  }

  try {
    validateReviewLaunchArtifact(procedureId, stdout);
    return { markdown: stdout, provenance: "stdout_fallback" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { invalidReason: message };
  }
}

function activeReviewLaunchClaim(run: Run): ReviewLaunchClaim | undefined {
  return run.review_launch_claims?.[0];
}

const REVIEWER_ENV = {
  role: "CODEX_HARNESS_REVIEWER_ROLE",
  runInstanceId: "CODEX_HARNESS_REVIEW_RUN_INSTANCE_ID",
  procedureId: "CODEX_HARNESS_REVIEW_PROCEDURE_ID",
  attemptId: "CODEX_HARNESS_REVIEW_ATTEMPT_ID",
  claimId: "CODEX_HARNESS_REVIEW_CLAIM_ID",
  marker: "CODEX_HARNESS_REVIEW_ATTEMPT_MARKER"
} as const;

function buildReviewAttemptMarker(input: {
  runInstanceId: string;
  procedureId: string;
  attemptId: string;
  claimId: string;
  ownerTokenHash: string;
}): string {
  return `sha256:${sha256Hex(canonicalJson({
    claim_id: input.claimId,
    owner_token_hash: input.ownerTokenHash,
    procedure_id: input.procedureId,
    review_attempt_id: input.attemptId,
    run_instance_id: input.runInstanceId,
    role: "independent_reviewer"
  }))}`;
}

function findAuthoritativeOuterReviewRun(targetRoot: string, projectRoot: string, runInstanceId: string): Run | undefined {
  const runsRoot = runtimeRunsDir(targetRoot);
  if (!fs.existsSync(runsRoot) || !fs.statSync(runsRoot).isDirectory()) return undefined;
  for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const compatibilityPath = runFilePath(targetRoot, entry.name);
    if (!fs.existsSync(compatibilityPath)) continue;
    try {
      const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, "utf8")) as { run_instance_id?: unknown };
      if (compatibility.run_instance_id !== runInstanceId) continue;
      const staged = new RunStagingDatabase(targetRoot, projectRoot, entry.name).loadRun(entry.name);
      if (staged?.run_instance_id === runInstanceId) return staged;
    } catch {
      // A malformed compatibility candidate cannot authorize nested launch.
    }
  }
  return undefined;
}

function assertReviewRecursionAllowed(targetRoot: string, projectRoot: string, attemptedProcedureId: string): void {
  const inherited = {
    role: process.env[REVIEWER_ENV.role],
    runInstanceId: process.env[REVIEWER_ENV.runInstanceId],
    procedureId: process.env[REVIEWER_ENV.procedureId],
    attemptId: process.env[REVIEWER_ENV.attemptId],
    claimId: process.env[REVIEWER_ENV.claimId],
    marker: process.env[REVIEWER_ENV.marker]
  };
  if (!Object.values(inherited).some((value) => typeof value === "string" && value.length > 0)) return;

  const outerRun = inherited.runInstanceId
    ? findAuthoritativeOuterReviewRun(targetRoot, projectRoot, inherited.runInstanceId)
    : undefined;
  const active = outerRun ? activeReviewLaunchClaim(outerRun) : undefined;
  const expectedMarker = active && outerRun?.run_instance_id
    ? buildReviewAttemptMarker({
        runInstanceId: outerRun.run_instance_id,
        procedureId: active.procedure_id,
        attemptId: active.attempt_id,
        claimId: active.claim_id,
        ownerTokenHash: active.owner_token_hash
      })
    : undefined;
  const matched = inherited.role === "independent_reviewer"
    && !!outerRun
    && !!active
    && inherited.runInstanceId === outerRun.run_instance_id
    && inherited.procedureId === active.procedure_id
    && inherited.attemptId === active.attempt_id
    && inherited.claimId === active.claim_id
    && inherited.marker === active.attempt_marker
    && inherited.marker === expectedMarker;

  throw new ReviewRecursionForbiddenError({
    failure_classification: "REVIEW_RECURSION_FORBIDDEN",
    outer_run_instance_id: inherited.runInstanceId ?? "invalid",
    outer_procedure_id: inherited.procedureId ?? "invalid",
    outer_attempt_id: inherited.attemptId ?? "invalid",
    attempted_nested_procedure_id: attemptedProcedureId,
    outer_claim_validation: matched ? "matched" : "invalid",
    claim_created: false,
    child_spawned: false,
    artifact_wait_started: false,
    next_valid_action: "complete the outer reviewer artifact directly"
  });
}

function fileContextSource(targetRoot: string, relativePath: string, required: boolean): {
  path: string;
  content_hash: string;
  byte_count: number;
  required: boolean;
  retrieval_mode: "read_only_reference";
} {
  const absolutePath = path.join(targetRoot, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    if (required) throw new Error(`CONTEXT_MANDATORY_BLOCK_MISSING: ${relativePath}`);
    return { path: relativePath, content_hash: "unavailable", byte_count: 0, required, retrieval_mode: "read_only_reference" };
  }
  const content = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    content_hash: `sha256:${sha256Hex(content)}`,
    byte_count: content.byteLength,
    required,
    retrieval_mode: "read_only_reference"
  };
}

function reviewChangeInventory(
  targetRoot: string,
  exactBase?: string,
  exactHead?: string
): {
  changedFiles: string[];
  changedSurfaceClasses: string[];
  riskClasses: string[];
  materialChangeClasses: string[];
  candidateId: string;
} {
  const exactDiff = exactBase && exactHead
    ? runGitCommand(targetRoot, ["diff", "--name-only", exactBase, exactHead, "--"])
    : undefined;
  if (exactDiff && exactDiff.status !== 0) throw new Error("REVIEW_EXACT_DIFF_UNAVAILABLE");
  const changedFiles = [...new Set(exactDiff
    ? exactDiff.stdout.split(/\r?\n/u).filter(Boolean)
    : getGitStatusPaths(getGitStatusLines(targetRoot)))]
    .map((entry) => entry.replace(/\\/gu, "/"))
    .filter((entry) => entry !== ".DS_Store" && !entry.startsWith(".harness/") && !entry.startsWith(".codex/") && !entry.startsWith(".agents/"))
    .sort();
  const contentIdentities = changedFiles.map((relativePath) => {
    const absolutePath = path.join(targetRoot, relativePath);
    const contentHash = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()
      ? `sha256:${sha256Hex(fs.readFileSync(absolutePath))}`
      : "deleted";
    return { path: relativePath, content_hash: contentHash };
  });
  const changedSurfaceClasses = [...new Set(changedFiles.map((entry) => {
    if (entry.startsWith("docs/") || entry.startsWith("tasks/") || entry === "TASK.md") return "authority";
    if (entry.startsWith("schemas/")) return "schema";
    if (entry.startsWith("skills/") || entry.startsWith("prompts/")) return "procedure_policy";
    if (entry.startsWith("tests/")) return "acceptance";
    if (entry.includes("memory") || entry.includes("staging") || entry.includes("harvest")) return "storage";
    return "runtime";
  }))].sort();
  const riskClasses = [...new Set(changedFiles.flatMap((entry) => {
    const risks: string[] = [];
    if (entry.startsWith("docs/") || entry.startsWith("tasks/") || entry === "TASK.md" || entry.startsWith("skills/")) risks.push("authority");
    if (entry.includes("lifecycle") || entry.includes("runtime") || entry.includes("run.ts")) risks.push("lifecycle");
    if (entry.includes("memory") || entry.includes("staging") || entry.includes("harvest") || entry.startsWith("schemas/")) risks.push("storage");
    if (entry.includes("routing") || entry.includes("binding") || entry.includes("review")) risks.push("provider");
    return risks;
  }))].sort();
  const materialChangeClasses = riskClasses.filter((entry) => ["authority", "lifecycle", "storage", "security", "provider"].includes(entry));
  return {
    changedFiles,
    changedSurfaceClasses,
    riskClasses,
    materialChangeClasses,
    candidateId: `sha256:${sha256Hex(canonicalJson({
      base: exactBase ?? null,
      head: exactHead ?? null,
      files: contentIdentities,
      tracked_patch_hash: `sha256:${sha256Hex(exactBase && exactHead
        ? runGitCommand(targetRoot, ["diff", "--binary", exactBase, exactHead, "--"]).stdout
        : getGitDiffPatch(targetRoot))}`
    }))}`
  };
}

function priorReviewArtifactFindings(
  targetRoot: string,
  run: Run,
  review: ReviewResult | undefined
): Array<{ finding_id: string; disposition: "open" | "claimed_fixed" | "closed" | "superseded" }> {
  if (!review) return [];
  const artifact = review.artifact_refs[0];
  if (!artifact) throw new Error("REVIEW_DELTA_PRIOR_ARTIFACT_MISSING: prior review has no exact artifact reference.");
  const artifactPath = path.join(runDirectory(targetRoot, run.run_id), artifact.path);
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error("REVIEW_DELTA_PRIOR_ARTIFACT_MISSING: prior review artifact body is unavailable.");
  }
  const markdown = fs.readFileSync(artifactPath, "utf8");
  if (`sha256:${sha256Hex(markdown)}` !== artifact.artifact_id) {
    throw new Error("REVIEW_DELTA_PRIOR_ARTIFACT_IDENTITY_MISMATCH: prior review artifact hash is not exact.");
  }
  const resolutionSection = /## Resolution Status\s*\n([\s\S]*?)(?=\n## |\s*$)/iu.exec(markdown)?.[1] ?? "";
  const resolutionStatuses = [...resolutionSection.matchAll(/^\s*\d+\.\s*`(resolved|partially_resolved|unresolved)`/gimu)]
    .map((match) => match[1]);
  if (resolutionStatuses.length > 0) {
    return resolutionStatuses.map((status, index) => ({
      finding_id: `${artifact.artifact_id}#finding-${index + 1}`,
      disposition: status === "resolved" ? "closed" : status === "partially_resolved" ? "claimed_fixed" : "open"
    }));
  }
  if (review.status === "PASS") return [];
  const findingsSection = /## Findings\s*\n([\s\S]*?)(?=\n## |\s*$)/iu.exec(markdown)?.[1] ?? "";
  const numberedFindingIds = [...findingsSection.matchAll(/^\s*\d+\.\s+/gmu)]
    .map((_, index) => `finding-${index + 1}`);
  const namedFindingIds = [...findingsSection.matchAll(/^###\s+([^\r\n]+)\s*$/gmu)]
    .map((match) => match[1].trim())
    .filter((value) => value.length > 0);
  const findingIds = namedFindingIds.length > 0 ? namedFindingIds : numberedFindingIds;
  if (findingIds.length === 0) {
    throw new Error("REVIEW_DELTA_PRIOR_FINDINGS_UNAVAILABLE: failed prior review has no parseable finding inventory.");
  }
  return findingIds.map((findingId) => ({
    finding_id: `${artifact.artifact_id}#${findingId}`,
    disposition: "open"
  }));
}

function buildReviewExecutionPacket(targetRoot: string, run: Run, procedureId: "plan-review" | "implementation-review" | "fix-pass-review", operatorRequest: string, requestPath: string, exactFixPassBase?: string): {
  core: ContextCore;
  manifest: ContextManifest;
  overlay: ReviewDeltaOverlay;
  route: ReviewRouteDecision;
  binding: CodexBindingProfile;
  requestMarkdown: string;
  contextReuse: "hit" | "miss" | "rebuilt";
  policyVersion: string;
  bindingVersion: string;
} {
  const registry = readSelfHostingProcedureRegistry(targetRoot);
  if (!registry) throw new Error("Self-hosting procedure registry not found.");
  const executionPolicy = readProcedureExecutionPolicy(targetRoot);
  const routePolicy = readReviewRoutePolicy(targetRoot);
  const referenceBinding = readCodexReferenceBinding(targetRoot);
  reconcileProcedureExecutionPolicy(registry, executionPolicy);
  const contract = executionPolicy.procedures.find((entry) => entry.procedure_id === procedureId);
  if (!contract?.automatic_launch) throw new Error(`Procedure ${procedureId} has no automatic execution-policy capability.`);
  if (!run.run_instance_id || !run.repository.branch || !run.repository.head_sha || !run.source_snapshot) {
    throw new Error("CONTEXT_MANDATORY_BLOCK_MISSING: exact run, branch, head, or source snapshot identity is unavailable.");
  }
  const approved = [...run.approvals].reverse().find((entry) => entry.title === "Reviewed plan approved" && entry.status === "approved");
  const taskContractRef = run.active_task_path ?? run.task_path;
  const fallbackPlanContent = fs.readFileSync(path.join(targetRoot, taskContractRef));
  const effectivePlan = procedureId === "plan-review"
    ? tryResolveExactPlanEvidenceBinding(run)
    : undefined;
  const approvedMatchesEffectivePlan = Boolean(
    approved?.reviewed_plan_artifact_id
    && (!effectivePlan || approved.reviewed_plan_artifact_id === effectivePlan.artifactId)
  );
  const planArtifact = effectivePlan
    ? run.artifacts.find((entry) => entry.artifact_id === effectivePlan.artifactId)
    : approvedMatchesEffectivePlan && approved?.reviewed_plan_artifact_id
      ? run.artifacts.find((entry) => entry.artifact_id === approved.reviewed_plan_artifact_id)
    : run.phase_id === "23.8.6F"
      ? undefined
      : {
          artifact_id: `sha256:${sha256Hex(fallbackPlanContent)}`,
          path: taskContractRef,
          kind: "legacy-static-task-contract",
          description: "Pre-F launch compatibility plan reference"
        };
  if (!planArtifact) throw new Error("CONTEXT_MANDATORY_BLOCK_MISSING: effective approved plan artifact is unavailable.");
  const immutableBase = run.bootstrap_facts?.find((fact) => fact.label === "base_commit")?.value ?? run.source_snapshot;
  const reviewTier = fs.readFileSync(path.join(targetRoot, taskContractRef), "utf8").includes("`extra-high`") ? "extra-high" : "high";
  const reviewedSourceHead = resolveExactCommit(targetRoot, "HEAD");
  const sourceDirty = getGitStatusPaths(getGitStatusLines(targetRoot)).filter((entry) =>
    !entry.startsWith(".harness/") && !entry.startsWith(".codex/") && entry !== ".DS_Store");
  if (!isPrePhaseFVerificationCompatibility(run.phase_id)
    && ["implementation-review", "fix-pass-review"].includes(procedureId)
    && sourceDirty.length > 0) {
    throw new Error(`REVIEW_SOURCE_DIRTY:${sourceDirty.join(",")}`);
  }
  const fixPredecessorHead = procedureId === "fix-pass-review" ? exactFixPassBase : undefined;
  const exactDiffBase = procedureId === "implementation-review"
    ? run.implementation_baseline_head
    : procedureId === "fix-pass-review"
      ? fixPredecessorHead
      : undefined;
  if (procedureId === "fix-pass-review" && !fixPredecessorHead) {
    throw new Error("FIX_PASS_DIFF_BASE_MISSING");
  }
  const inventory = reviewChangeInventory(targetRoot, exactDiffBase, reviewedSourceHead);
  const latestVerification = run.verification_results[run.verification_results.length - 1];
  const verificationComplete = procedureId === "plan-review"
    ? false
    : verificationSatisfiesRequiredCommandInventory(targetRoot, run, latestVerification);
  const priorReviewProcedure = procedureId === "fix-pass-review" ? "implementation-review" : procedureId;
  const priorReview = [...run.review_results].reverse().find((entry) =>
    reviewSourceMatchesProcedure(entry.source, priorReviewProcedure));
  const priorFindings = priorReviewArtifactFindings(targetRoot, run, priorReview);
  const core = buildContextCore({
    task_id: run.phase_id ?? taskContractRef,
    task_pointer_ref: "TASK.md",
    task_contract_ref: taskContractRef,
    approved_plan_ref: `${planArtifact.path}#${planArtifact.artifact_id}`,
    procedure_contract_refs: [
      `skills/self-hosting/${procedureId}/SKILL.md`,
      "skills/self-hosting/procedure-execution-policy.json",
      "skills/self-hosting/review-route-policy.json"
    ],
    review_tier: reviewTier,
    changed_surface_classes: inventory.changedSurfaceClasses,
    risk_classes: inventory.riskClasses,
    run_id: run.run_id,
    run_instance_id: run.run_instance_id,
    branch: run.repository.branch,
    worktree_ref: ".",
    source_snapshot: reviewedSourceHead,
    immutable_base: immutableBase,
    architectural_invariants: ["provider-neutral lifecycle authority", "bounded automatic review launch surfaces", "independent review remains fresh"],
    non_goals: ["no generic runner", "no second adapter", "no daemon", "no automatic owner approval"],
    acceptance_refs: [taskContractRef, "docs/PHASE_ACCEPTANCE.md"],
    verification_refs: ["package.json#scripts", "tests/acceptance/phase23-8-6b1-review-launch.test.mjs"],
    source_provenance: [
      fileContextSource(targetRoot, "TASK.md", true),
      fileContextSource(targetRoot, taskContractRef, true),
      fileContextSource(targetRoot, planArtifact.path.startsWith("evidence/") ? `.harness/runs/${run.run_id}/${planArtifact.path}` : planArtifact.path, true),
      fileContextSource(targetRoot, `skills/self-hosting/${procedureId}/SKILL.md`, true)
    ],
    size_budget_bytes: routePolicy.context_budgets.context_core_bytes
  });
  const manifest = buildContextManifest(core, { retrieval_capabilities: ["repo_read_only", "packet_plus_retrieval"] });
  const overlay = buildReviewDeltaOverlay({
    context_core_id: core.context_core_id,
    reviewed_candidate_id: inventory.candidateId,
    changed_files: inventory.changedFiles,
    diff_refs: [requestPath, exactDiffBase
      ? `git-diff:${exactDiffBase}..${reviewedSourceHead}`
      : "git-diff:HEAD"],
    payload_refs: [],
    ...(priorReview ? { prior_review_result_ref: priorReview.review_result_id } : {}),
    findings: priorFindings,
    verification_refs: run.verification_results.map((entry) => entry.verification_result_id),
    changed_authority_surfaces: inventory.changedFiles.filter((entry) => entry.startsWith("docs/") || entry.startsWith("skills/") || entry.startsWith("tasks/") || entry === "TASK.md"),
    changed_architecture_surfaces: inventory.changedFiles.filter((entry) => entry.includes("ARCHITECTURE") || entry.includes("runtime") || entry.includes("routing")),
    missing_evidence: verificationComplete ? [] : ["terminal_verification_pass"],
    escalation_reasons: inventory.riskClasses,
    size_budget_bytes: routePolicy.context_budgets.delta_overlay_bytes
  });
  const contextReuse = run.review_routing_records?.some((entry) => entry.payload.context_core_id === core.context_core_id)
    ? "hit"
    : "miss";
  const route = decideReviewRoute(routePolicy, contract, {
    procedure_id: procedureId,
    review_tier: reviewTier,
    pass_kind: procedureId === "plan-review" && run.evidence.some((entry) => entry.kind === "procedure:plan-amend")
      ? "amendment_review"
      : procedureId === "plan-review" ? "initial_full_review"
        : priorReview?.status === "FIX_REQUIRED" ? "fix_pass_review" : "implementation_review",
    pass_index: run.review_results.filter((entry) => reviewSourceMatchesProcedure(entry.source, procedureId)).length,
    changed_surface_classes: core.changed_surface_classes,
    risk_classes: core.risk_classes,
    deterministic_evidence_complete: verificationComplete,
    prior_failure_count: run.review_results.filter((entry) => reviewSourceMatchesProcedure(entry.source, procedureId) && entry.status !== "PASS").length,
    independence_required: true,
    context_reuse_state: contextReuse,
    owner_budget_class: "balanced",
    open_blocker_count: run.findings.filter((entry) => entry.blocking && entry.status === "open").length,
    new_blocker_count: run.findings.filter((entry) => entry.blocking && entry.status === "open" && (!priorReview || entry.created_at >= priorReview.created_at)).length,
    delta_bytes: overlay.canonical_byte_count,
    material_change_classes: inventory.materialChangeClasses,
    ...(priorReview ? { prior_verdict: priorReview.status } : {}),
    prior_finding_dispositions: priorFindings.map((entry) => `${entry.finding_id}:${entry.disposition}`)
  });
  const binding = resolveCodexBinding(referenceBinding, route.route_class, contract.context_transport);
  if (!binding) throw new Error(`REVIEW_BINDING_CAPABILITY_UNAVAILABLE: no accepted ${route.route_class} binding supports ${contract.context_transport}.`);
  const requestMarkdown = assembleReviewRequest({
    operator_request: operatorRequest,
    context_core: core,
    context_manifest: manifest,
    delta_overlay: overlay,
    procedure_contract_ref: `skills/self-hosting/${procedureId}/SKILL.md`,
    route_decision_id: route.route_decision_id
  });
  if (Buffer.byteLength(requestMarkdown) > routePolicy.context_budgets.request_bytes) {
    throw new Error("CONTEXT_REQUEST_BUDGET_EXCEEDED: mandatory review request exceeds the approved budget.");
  }
  return { core, manifest, overlay, route, binding, requestMarkdown, contextReuse, policyVersion: routePolicy.policy_version, bindingVersion: referenceBinding.binding_version };
}

function assertNoActiveReviewLaunchClaim(run: Run, action: string): void {
  const claim = activeReviewLaunchClaim(run);
  if (claim) {
    throw new Error(
      `REVIEW_LAUNCH_OWNERSHIP_ACTIVE: ${claim.procedure_id} claim ${claim.claim_id} blocks ${action}. ` +
      "Do not replace, adopt, or advance it; wait for the owning launcher to record terminal child exit, or use explicit human cancellation and discard the run."
    );
  }
}

function reserveReviewLaunchClaim(
  targetRoot: string,
  projectRoot: string,
  currentRun: Run,
  input: Omit<ReviewLaunchClaim, "pid" | "progress_unknown_at">
): Run {
  const staging = new RunStagingDatabase(targetRoot, projectRoot, currentRun.run_id);
  if (!staging.loadRun(currentRun.run_id)) {
    staging.saveRun(currentRun);
  }
  const run = staging.mutateRun(currentRun.run_id, (latestRun) => {
    assertNoActiveReviewLaunchClaim(latestRun, "a new review launch");
    return withUpdatedAt({
      ...latestRun,
      review_launch_claims: [input]
    }, input.created_at);
  }, { expectedRunInstanceId: currentRun.run_instance_id });
  writeCompatibilityRunArtifacts(targetRoot, run);
  return run;
}

function updateReviewLaunchClaim(
  targetRoot: string,
  projectRoot: string,
  runId: string,
  claim: ReviewLaunchClaim,
  update: Partial<Pick<ReviewLaunchClaim, "pid" | "progress_unknown_at">>
): Run {
  const staging = new RunStagingDatabase(targetRoot, projectRoot, runId);
  const run = staging.mutateRun(runId, (latestRun) => {
    const active = activeReviewLaunchClaim(latestRun);
    if (!active || active.claim_id !== claim.claim_id || active.owner_token_hash !== claim.owner_token_hash) {
      throw new Error("REVIEW_LAUNCH_OWNERSHIP_LOST: only the original launcher may update this review claim.");
    }
    return withUpdatedAt({
      ...latestRun,
      review_launch_claims: [{ ...active, ...update }]
    }, nowIso());
  });
  writeCompatibilityRunArtifacts(targetRoot, run);
  return run;
}

function runCodexCliReview(profile: SelfHostingReviewLaunchProfile, input: {
  targetRoot: string;
  requestMarkdown: string;
  outputPath: string;
  timeoutSeconds: number;
  staleAfterSeconds: number;
  childEnvironment: NodeJS.ProcessEnv;
  onSpawn?: (pid: number) => void;
  onProgressUnknown?: (timestamp: string) => void;
}): Promise<{
  exitCode?: number;
  signal?: string;
  pid?: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  progressUnknownAt?: string;
  startTime: string;
  lastOutputTime?: string;
  completedTime?: string;
  launchCommand: string;
}> {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
    const args = [
      "exec",
      "-C",
      input.targetRoot,
      "-s",
      profile.sandbox_mode,
      "-m",
      profile.model,
      "-c",
      `model_reasoning_effort="${profile.reasoning_effort}"`,
      "--json",
      "-o",
      input.outputPath,
      "-"
    ];
    const launchCommand = formatCommandForDisplay("codex", args);
    const startTime = nowIso();
    let lastOutputAt = Date.now();
    let lastOutputTime: string | undefined;
    const child = spawn("codex", args, {
      cwd: input.targetRoot,
      env: input.childEnvironment,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let progressUnknownAt: string | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutSeconds * 1000);
    const staleTimer = setInterval(() => {
      if (!progressUnknownAt && Date.now() - lastOutputAt >= input.staleAfterSeconds * 1000) {
        progressUnknownAt = nowIso();
        input.onProgressUnknown?.(progressUnknownAt);
      }
    }, Math.max(100, Math.min(1000, input.staleAfterSeconds * 1000)));

    const markOutput = () => {
      lastOutputAt = Date.now();
      lastOutputTime = nowIso();
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      markOutput();
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      markOutput();
      stderr += chunk.toString("utf8");
    });
    child.on("spawn", () => {
      if (typeof child.pid === "number" && child.pid > 0) {
        input.onSpawn?.(child.pid);
      }
    });
    child.on("error", (error) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      clearInterval(staleTimer);
      resolve({
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        progressUnknownAt,
        startTime,
        lastOutputTime,
        completedTime: nowIso(),
        launchCommand
      });
    });
    child.on("close", (code, signal) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      clearInterval(staleTimer);
      resolve({
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        pid: child.pid,
        stdout,
        stderr,
        timedOut,
        progressUnknownAt,
        startTime,
        lastOutputTime,
        completedTime: nowIso(),
        launchCommand
      });
    });

    child.stdin?.end(input.requestMarkdown);
  });
}

export function parseCodexJsonlUsage(stdout: string): Pick<ReviewLaunchObservation,
  "input_tokens" | "cached_input_tokens" | "cache_write_tokens" | "output_tokens" | "tool_call_count"> {
  let inputTokens: number | undefined;
  let cachedInputTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  let outputTokens: number | undefined;
  let toolCallCount = 0;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const number = (keys: string[]): number | undefined => {
      for (const key of keys) if (typeof record[key] === "number" && Number.isFinite(record[key])) return record[key] as number;
      return undefined;
    };
    inputTokens = number(["input_tokens", "prompt_tokens"]) ?? inputTokens;
    cachedInputTokens = number(["cached_input_tokens", "cached_tokens", "cache_read_tokens"]) ?? cachedInputTokens;
    cacheWriteTokens = number(["cache_write_tokens"]) ?? cacheWriteTokens;
    outputTokens = number(["output_tokens", "completion_tokens"]) ?? outputTokens;
    if (record.type === "tool_call" || record.type === "function_call") toolCallCount += 1;
    Object.values(record).forEach(visit);
  };
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try { visit(JSON.parse(trimmed) as unknown); } catch { /* unsupported observation line */ }
  }
  return {
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cached_input_tokens: cachedInputTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cache_write_tokens: cacheWriteTokens } : {}),
    ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
    ...(toolCallCount > 0 ? { tool_call_count: toolCallCount } : {})
  };
}

function buildReviewLaunchAttemptArtifact(targetRoot: string, run: Run, observation: ReviewLaunchObservation): {
  artifact: ArtifactRef;
  evidence: EvidenceRef;
  content: string;
  absolutePath: string;
} {
  const content = `${JSON.stringify({
    ...observation,
    recorded_at: nowIso()
  }, null, 2)}\n`;
  const hash = sha256Hex(content);
  const prefix = hash.slice(0, 12);
  const relativePath = toPortablePath(path.join("evidence", `review-launch-attempt-${observation.procedure_id}-${prefix}.json`));
  const artifact: ArtifactRef = {
    artifact_id: `sha256:${hash}`,
    path: relativePath,
    kind: `review-launch-attempt:${observation.procedure_id}`,
    description: observation.summary
  };
  const evidence: EvidenceRef = {
    evidence_id: `review-launch-attempt-${observation.procedure_id}-${prefix}`,
    kind: `review-launch-attempt:${observation.procedure_id}`,
    summary: observation.summary,
    artifact_id: artifact.artifact_id,
    path: relativePath
  };

  return {
    artifact,
    evidence,
    content,
    absolutePath: path.join(runDirectory(targetRoot, run.run_id), relativePath)
  };
}

function buildProcedureArtifactFromMarkdown(targetRoot: string, run: Run, procedureId: string, sourcePath: string, markdown: string): {
  artifact: ArtifactRef;
  evidence: EvidenceRef;
  absolutePath: string;
} {
  const contentHash = sha256Hex(markdown);
  const hashPrefix = contentHash.slice(0, 12);
  const relativeArtifactPath = toPortablePath(path.join("evidence", `${procedureId}-${hashPrefix}.md`));
  const artifact: ArtifactRef = {
    artifact_id: `sha256:${contentHash}`,
    path: relativeArtifactPath,
    kind: `procedure-artifact:${procedureId}`,
    description: toRepoRelative(targetRoot, sourcePath)
  };
  const evidence: EvidenceRef = {
    evidence_id: `procedure-${procedureId}-${hashPrefix}`,
    kind: `procedure:${procedureId}`,
    summary: procedureId,
    artifact_id: artifact.artifact_id,
    path: relativeArtifactPath
  };

  return {
    artifact,
    evidence,
    absolutePath: path.join(runDirectory(targetRoot, run.run_id), relativeArtifactPath)
  };
}

function toReviewLaunchPayloadRef(record: PayloadRecord): ReviewLaunchPayloadRef {
  return {
    payload_id: record.payload_id,
    parent_record_id: record.parent_record_id,
    kind: record.kind,
    media_type: record.media_type,
    summary: record.summary,
    content_hash: `sha256:${record.content_hash}`,
    source_run_id: record.source_run_id,
    ...(record.source_phase_id ? { source_phase_id: record.source_phase_id } : {}),
    retention_class: record.retention_class
  };
}

function appendArtifactAndEvidence(run: Run, artifact: ArtifactRef, evidence: EvidenceRef, timestamp: string): Run {
  const hasArtifact = run.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id && entry.path === artifact.path);
  const hasEvidence = run.evidence.some((entry) =>
    entry.evidence_id === evidence.evidence_id
    || (entry.kind === evidence.kind && entry.artifact_id === evidence.artifact_id)
  );

  return withUpdatedAt({
    ...run,
    artifacts: hasArtifact ? run.artifacts : [...run.artifacts, artifact],
    evidence: hasEvidence ? run.evidence : [...run.evidence, evidence]
  }, timestamp);
}

function recordLaunchAttempt(
  targetRoot: string,
  rootsProjectRoot: string,
  currentRun: Run,
  observation: ReviewLaunchObservation,
  claim: ReviewLaunchClaim,
  accepted?: {
    artifact: ArtifactRef;
    evidence: EvidenceRef;
    markdown: string;
    absoluteArtifactPath: string;
  },
  packet?: {
    requestMarkdown: string;
    core: ContextCore;
    manifest: ContextManifest;
    overlay: ReviewDeltaOverlay;
    policyVersion: string;
    bindingVersion: string;
    rawStartup?: RawReviewStartupObservationV1;
  }
): Run {
  const timestamp = nowIso();
  const staging = new RunStagingDatabase(targetRoot, rootsProjectRoot, currentRun.run_id);
  if (!staging.loadRun(currentRun.run_id)) {
    staging.saveRun(currentRun);
  }
  const parentRecordId = `review-launch-attempt:${observation.attempt_id ?? randomUUID()}`;
  const payloadRefs: ReviewLaunchPayloadRef[] = [];

  if (packet) {
    for (const source of [
      { kind: "review-request-packet", mediaType: "text/markdown", summary: `${observation.procedure_id} bounded request`, content: packet.requestMarkdown },
      { kind: "context-core", mediaType: "application/json", summary: `${observation.procedure_id} ContextCore`, content: `${JSON.stringify(packet.core)}\n` },
      { kind: "context-manifest", mediaType: "application/json", summary: `${observation.procedure_id} ContextManifest`, content: `${JSON.stringify(packet.manifest)}\n` },
      { kind: "review-delta-overlay", mediaType: "application/json", summary: `${observation.procedure_id} ReviewDeltaOverlay`, content: `${JSON.stringify(packet.overlay)}\n` }
    ]) {
      payloadRefs.push(toReviewLaunchPayloadRef(staging.storePayload({
        parentRecordId,
        sourceRunId: currentRun.run_id,
        sourcePhaseId: currentRun.phase_id,
        kind: source.kind,
        mediaType: source.mediaType,
        summary: source.summary,
        content: source.content,
        searchableText: source.content.slice(0, 4000),
        boundedExcerpt: source.content.slice(0, 500),
        retentionClass: accepted ? "accepted" : "audit"
      })));
    }
  }

  if (observation.stdout_tail) {
    payloadRefs.push(toReviewLaunchPayloadRef(staging.storePayload({
      parentRecordId,
      sourceRunId: currentRun.run_id,
      sourcePhaseId: currentRun.phase_id,
      kind: "review-launch-stdout",
      mediaType: "text/plain",
      summary: `${observation.procedure_id} launch stdout tail`,
      content: observation.stdout_tail,
      searchableText: observation.stdout_tail.slice(0, 4000),
      boundedExcerpt: observation.stdout_tail.slice(0, 500),
      retentionClass: "audit"
    })));
  }

  if (observation.stderr_tail) {
    payloadRefs.push(toReviewLaunchPayloadRef(staging.storePayload({
      parentRecordId,
      sourceRunId: currentRun.run_id,
      sourcePhaseId: currentRun.phase_id,
      kind: "review-launch-stderr",
      mediaType: "text/plain",
      summary: `${observation.procedure_id} launch stderr tail`,
      content: observation.stderr_tail,
      searchableText: observation.stderr_tail.slice(0, 4000),
      boundedExcerpt: observation.stderr_tail.slice(0, 500),
      retentionClass: "audit"
    })));
  }

  if (observation.evaluation_mode && observation.evaluation_mode !== "approved" && observation.artifact_valid) {
    const candidatePath = path.resolve(targetRoot, observation.output_path);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      const candidateMarkdown = fs.readFileSync(candidatePath, "utf8");
      payloadRefs.push(toReviewLaunchPayloadRef(staging.storePayload({
        parentRecordId,
        sourceRunId: currentRun.run_id,
        sourcePhaseId: currentRun.phase_id,
        kind: "review-evaluation-output",
        mediaType: "text/markdown",
        summary: `${observation.procedure_id} non-authoritative evaluation output`,
        content: candidateMarkdown,
        searchableText: candidateMarkdown.slice(0, 4000),
        boundedExcerpt: candidateMarkdown.slice(0, 500),
        retentionClass: "audit"
      })));
    }
  }

  if (accepted && observation.provenance && observation.provenance !== "expected_output_file") {
    payloadRefs.push(toReviewLaunchPayloadRef(staging.storePayload({
      parentRecordId,
      sourceRunId: currentRun.run_id,
      sourcePhaseId: currentRun.phase_id,
      kind: `review-launch-${observation.provenance}`,
      mediaType: "text/markdown",
      summary: `${observation.procedure_id} ${observation.provenance} source`,
      content: accepted.markdown,
      searchableText: accepted.markdown.slice(0, 4000),
      boundedExcerpt: accepted.markdown.slice(0, 500),
      retentionClass: "audit"
    })));
  }

  const usageFacts = {
    input_tokens: observation.input_tokens ?? null,
    cached_input_tokens: observation.cached_input_tokens ?? null,
    cache_write_tokens: observation.cache_write_tokens ?? null,
    output_tokens: observation.output_tokens ?? null,
    tool_call_count: observation.tool_call_count ?? null,
    latency_ms: observation.latency_ms ?? null
  };
  const usageFactsJson = canonicalJson(usageFacts);
  const usagePayload = toReviewLaunchPayloadRef(staging.storePayload({
    parentRecordId,
    sourceRunId: currentRun.run_id,
    sourcePhaseId: currentRun.phase_id,
    kind: "review-usage-facts",
    mediaType: "application/json",
    summary: `${observation.procedure_id} recorded usage facts`,
    content: `${usageFactsJson}\n`,
    searchableText: usageFactsJson,
    boundedExcerpt: usageFactsJson,
    retentionClass: accepted ? "accepted" : "audit"
  }));
  payloadRefs.push(usagePayload);

  const observationWithPayloadRefs: ReviewLaunchObservation = {
    ...observation,
    review_claim_id: claim.claim_id,
    review_claim_owner_token_hash: claim.owner_token_hash,
    usage_ref: usagePayload.payload_id,
    payload_refs: payloadRefs
  };
  const attempt = buildReviewLaunchAttemptArtifact(targetRoot, currentRun, observationWithPayloadRefs);
  fs.mkdirSync(path.dirname(attempt.absolutePath), { recursive: true });
  fs.writeFileSync(attempt.absolutePath, attempt.content, "utf8");

  if (accepted) {
    fs.mkdirSync(path.dirname(accepted.absoluteArtifactPath), { recursive: true });
    fs.writeFileSync(accepted.absoluteArtifactPath, accepted.markdown, "utf8");
  }
  let acceptedCanonicalAttempt: ReturnType<typeof buildReviewAttempt> | undefined;
  let acceptedCanonicalEvents: ReturnType<typeof buildReviewAttemptEvent>[] = [];
  if (accepted && currentRun.phase_id === "23.9") {
    if (!packet?.rawStartup) throw new Error("REVIEW_ACCEPTED_RAW_STARTUP_OBSERVATION_MISSING");
    const sourcePlanSha = packet.core.approved_plan_ref.split("#").pop();
    if (!sourcePlanSha || !/^sha256:[a-f0-9]{64}$/u.test(sourcePlanSha)) {
      throw new Error("REVIEW_ACCEPTED_PLAN_IDENTITY_MISSING");
    }
    const observedProfile = parseRawReviewStartupObservation(packet.rawStartup);
    const eventCommon = {
      run_instance_id: currentRun.run_instance_id ?? "",
      run_id: currentRun.run_id,
      attempt_kind: "single_review" as const,
      cohort_id: null,
      attempt_id: claim.attempt_id,
      claim_id: claim.claim_id,
      procedure_ids: [observation.procedure_id],
      request_artifact_hash: observation.request_artifact_hash as `sha256:${string}`,
      expected_bundle_output_path: observation.expected_output_path ?? observation.output_path,
      owner_token_hash: claim.owner_token_hash as `sha256:${string}`
    };
    acceptedCanonicalEvents = [
      buildReviewAttemptEvent({ ...eventCommon, sequence: 1, event_type: "claimed", occurred_at: claim.created_at,
        raw_startup_observation: null, observed_profile: null, terminal_status: null, error_code: null, output_artifact_hash: null }),
      buildReviewAttemptEvent({ ...eventCommon, sequence: 2, event_type: "started", occurred_at: observation.start_time ?? claim.created_at,
        raw_startup_observation: packet.rawStartup, observed_profile: observedProfile, terminal_status: null, error_code: null, output_artifact_hash: null }),
      buildReviewAttemptEvent({ ...eventCommon, sequence: 3, event_type: "terminal", occurred_at: timestamp,
        raw_startup_observation: null, observed_profile: null, terminal_status: "success", error_code: null,
        output_artifact_hash: accepted.artifact.artifact_id as `sha256:${string}` })
    ];
    acceptedCanonicalAttempt = buildReviewAttempt({
      run_instance_id: currentRun.run_instance_id ?? "",
      run_id: currentRun.run_id,
      attempt_kind: "single_review",
      procedure_ids: [observation.procedure_id],
      cohort_id: null,
      attempt_id: claim.attempt_id,
      claim_id: claim.claim_id,
      profile_id: observation.binding_profile_id ?? observation.adapter_id,
      request_artifact_hash: observation.request_artifact_hash as `sha256:${string}`,
      expected_bundle_output_path: observation.expected_output_path ?? observation.output_path,
      claimed_event_id: acceptedCanonicalEvents[0].record_id,
      started_event_id: acceptedCanonicalEvents[1].record_id,
      terminal_event_id: acceptedCanonicalEvents[2].record_id,
      terminal_status: "success",
      verdict: null,
      reviewed_source_head: observation.reviewed_source_head ?? packet.core.source_snapshot,
      implementation_diff_id: (observation.reviewed_diff_hash ?? packet.overlay.content_hash) as `sha256:${string}`,
      predecessor_review_attempt_id: observation.predecessor_review_attempt_id ?? null,
      predecessor_review_artifact_id: observation.predecessor_review_artifact_id ?? null,
      bundle_envelope_id: null,
      bundle_envelope_hash: null,
      lens_results: [{
        procedure_id: observation.procedure_id,
        status: "recorded",
        artifact_id: accepted.artifact.artifact_id as `sha256:${string}`,
        artifact_hash: accepted.artifact.artifact_id as `sha256:${string}`,
        verdict: validateReviewLaunchArtifact(observation.procedure_id, accepted.markdown).status as "PASS" | "FIX_REQUIRED" | "AMEND_REQUIRED" | "BLOCKED"
      }],
      created_at: timestamp
    }, packet.rawStartup, {
      provider: "openai",
      model: observation.model,
      reasoning: observation.reasoning_effort,
      sandbox: "read-only",
      approval_policy: "never",
      workdir: targetRoot
    });
  }

  const run = staging.mutateRunWithDatabase(currentRun.run_id, (latestRun, database) => {
    const active = activeReviewLaunchClaim(latestRun);
    if (!active || active.claim_id !== claim.claim_id || active.owner_token_hash !== claim.owner_token_hash) {
      throw new Error("REVIEW_LAUNCH_OWNERSHIP_LOST: only the original launcher may record terminal review completion.");
    }
    let next = appendArtifactAndEvidence(latestRun, attempt.artifact, attempt.evidence, timestamp);
    next = withUpdatedAt({ ...next, review_launch_claims: [] }, timestamp);
    const invocationRecordId = `review-invocation-${observation.attempt_id ?? claim.attempt_id}`;
    const usageRef = observationWithPayloadRefs.usage_ref;
    const invocationPayload = {
      ...observationWithPayloadRefs,
      ...(acceptedCanonicalAttempt ? { canonical_attempt_id: acceptedCanonicalAttempt.attempt_id } : {}),
      usage_ref: usageRef
    };
    const invocationRecord: ReviewOperationalRecord = {
      record_kind: "review_invocation",
      record_id: invocationRecordId,
      created_at: timestamp,
      status: observation.status,
      summary: observation.summary,
      payload: invocationPayload as unknown as Record<string, unknown>
    };
    next = { ...next, review_routing_records: [...(next.review_routing_records ?? []), invocationRecord] };

    if (accepted) {
      next = appendArtifactAndEvidence(next, accepted.artifact, accepted.evidence, timestamp);
      const review = buildProcedureReviewResult(next, accepted.evidence.summary, accepted.artifact, accepted.markdown, timestamp);
      if (review && !next.review_results.some((entry) =>
        entry.source === review.source
        && entry.artifact_refs.some((ref) => ref.artifact_id === accepted.artifact.artifact_id)
      )) {
        next = recordReviewResult(next, review);
      }
      if (!isPrePhaseFVerificationCompatibility(latestRun.phase_id)
        && ["implementation-review", "fix-pass-review"].includes(observation.procedure_id)
        && review?.status === "PASS") {
        const exactReviewedHead = observation.reviewed_source_head ?? packet?.core.source_snapshot;
        const currentHead = resolveExactCommit(targetRoot, "HEAD");
        const dirty = getGitStatusPaths(getGitStatusLines(targetRoot)).filter((entry) =>
          !entry.startsWith(".harness/") && !entry.startsWith(".codex/") && entry !== ".DS_Store");
        if (!exactReviewedHead || currentHead !== exactReviewedHead || dirty.length > 0) {
          throw new Error("FINAL_REVIEWED_SOURCE_HEAD_REQUIRES_EXACT_CLEAN_REVIEWED_TREE");
        }
        next = { ...next, final_reviewed_source_head: exactReviewedHead };
      }
      if (!latestRun.run_instance_id) throw new Error("REVIEW_ACCEPTED_RUN_INSTANCE_MISSING");
      const reviewedPlanBinding = observation.procedure_id === "plan-review"
        ? tryResolveExactPlanEvidenceBinding(latestRun)
        : undefined;
      if (observation.procedure_id === "plan-review" && !reviewedPlanBinding) {
        throw new Error("REVIEW_ACCEPTED_PLAN_BINDING_MISSING: terminal plan-review acceptance requires the latest exact effective plan.");
      }
      const acceptedPayload = new PayloadStore(database).store({
        parentRecordId: accepted.artifact.artifact_id,
        sourceRunId: latestRun.run_id,
        sourcePhaseId: latestRun.phase_id,
        kind: `procedure-artifact-body:${observation.procedure_id}`,
        mediaType: "text/markdown",
        summary: `${observation.procedure_id} authoritative procedure body`,
        content: accepted.markdown,
        searchableText: accepted.markdown.slice(0, 4000),
        boundedExcerpt: accepted.markdown.slice(0, 500),
        retentionClass: "accepted"
      });
      staging.storeProcedureArtifact(database, {
        run_instance_id: latestRun.run_instance_id,
        source_run_id: latestRun.run_id,
        procedure_id: observation.procedure_id,
        artifact_id: accepted.artifact.artifact_id,
        payload_id: acceptedPayload.payload_id,
        content_hash: accepted.artifact.artifact_id.slice("sha256:".length),
        recorded_at: timestamp,
        provenance_json: JSON.stringify({
          phase_id: latestRun.phase_id,
          task_path: latestRun.active_task_path ?? latestRun.task_path,
          worktree: latestRun.repository.root_path,
          branch: latestRun.repository.branch,
          reviewed_source_head: observation.reviewed_source_head ?? packet?.core.source_snapshot,
          reviewed_diff_hash: observation.reviewed_diff_hash ?? packet?.overlay.content_hash,
          review_attempt_id: acceptedCanonicalAttempt?.attempt_id ?? claim.attempt_id,
          predecessor_review_attempt_id: observation.predecessor_review_attempt_id,
          predecessor_review_artifact_id: observation.predecessor_review_artifact_id,
          predecessor_reviewed_source_head: observation.predecessor_reviewed_source_head,
          compatibility_path: accepted.artifact.path
        }),
        ...(reviewedPlanBinding ? {
          reviewed_plan_artifact_id: reviewedPlanBinding.artifactId,
          reviewed_plan_content_hash: reviewedPlanBinding.contentHash,
          reviewed_evidence_artifact_id: reviewedPlanBinding.artifactId
        } : {})
      });
      const canonicalAttempt = acceptedCanonicalAttempt;
      if (latestRun.phase_id === "23.9" && (!canonicalAttempt || !packet?.rawStartup)) {
        throw new Error("REVIEW_ACCEPTED_CANONICAL_ATTEMPT_MISSING");
      }
      if (canonicalAttempt && packet?.rawStartup) {
      for (const event of acceptedCanonicalEvents) {
        staging.storeIndependentRecord(database, {
          recordKind: "review_attempt_event",
          recordId: event.record_id,
          runId: latestRun.run_id,
          phaseId: latestRun.phase_id,
          taskPath: latestRun.task_path,
          createdAt: event.occurred_at,
          status: event.event_type === "terminal" ? `terminal_${event.terminal_status}` : event.event_type,
          summary: `${observation.procedure_id} attempt ${event.event_type}.`,
          payload: event,
          retentionClass: "accepted"
        });
      }
      staging.storeIndependentRecord(database, {
        recordKind: "review_attempt",
        recordId: canonicalAttempt.record_id,
        runId: latestRun.run_id,
        phaseId: latestRun.phase_id,
        taskPath: latestRun.task_path,
        createdAt: timestamp,
        status: canonicalAttempt.terminal_status,
        summary: `${observation.procedure_id} terminal accepted attempt.`,
        payload: canonicalAttempt,
        retentionClass: "accepted"
      });
      }
      if (packet && currentRun.run_instance_id) {
        const requestPayload = payloadRefs.find((entry) => entry.kind === "review-request-packet");
        const replayPayload: Record<string, unknown> = {
            run_instance_id: currentRun.run_instance_id,
            source_run_id: currentRun.run_id,
            procedure_id: observation.procedure_id,
            pass_kind: observation.pass_kind ?? (observation.procedure_id === "plan-review" ? "initial_full_review" : "implementation_review"),
            request_payload_id: requestPayload?.payload_id ?? "unavailable",
            request_content_hash: requestPayload?.content_hash ?? observation.request_artifact_hash ?? "unavailable",
            context_core_id: packet.core.context_core_id,
            context_core_hash: packet.core.content_hash,
            context_manifest_id: packet.manifest.context_manifest_id,
            context_manifest_hash: packet.manifest.content_hash,
            delta_overlay_id: packet.overlay.delta_overlay_id,
            delta_overlay_hash: packet.overlay.content_hash,
            context_mode: observation.context_mode ?? "unavailable",
            approved_attempt_id: canonicalAttempt?.attempt_id ?? claim.attempt_id,
            route_decision_id: observation.route_decision_id ?? "unavailable",
            route_class: observation.route_class ?? "unavailable",
            policy_version: observation.routing_policy_version ?? packet.policyVersion,
            binding_version: observation.binding_version ?? packet.bindingVersion,
            binding_profile_id: observation.binding_profile_id ?? "unavailable",
            accepted_artifact_id: accepted.artifact.artifact_id,
            accepted_result_id: review?.review_result_id ?? "unavailable",
            source_snapshot: currentRun.source_snapshot ?? "unavailable",
            immutable_base: packet.core.immutable_base,
            risk_classes: packet.core.risk_classes,
            changed_surface_classes: observation.changed_surface_classes ?? packet.core.changed_surface_classes,
            required_semantic_reviews: observation.required_semantic_reviews ?? [],
            review_tier: observation.review_tier ?? "standard",
            usage_ref: usageRef,
            deterministic_evidence_state: observation.deterministic_evidence_state ?? "incomplete",
            parallel_policy: observation.parallel_policy ?? "serial",
            budget_class: observation.budget_class ?? "balanced",
            escalation_triggers: observation.escalation_triggers ?? [],
            independence_mode: observation.independence_mode ?? "unavailable",
            retention_class: "accepted",
            redaction_status: packet.core.redactions?.length ? "redacted" : "not_redacted",
            payload_ids: payloadRefs.map((entry) => entry.payload_id).sort(),
            payload_kinds: Object.fromEntries(payloadRefs.map((entry) => [entry.kind, entry.payload_id]))
        };
        const replayRecord: ReviewOperationalRecord = {
          record_kind: "review_replay_packet",
          record_id: `sha256:${sha256Hex(canonicalJson(replayPayload))}`,
          created_at: timestamp,
          status: "retained_not_yet_eligible",
          summary: `${observation.procedure_id} approved review replay packet`,
          payload: replayPayload
        };
        next = { ...next, review_routing_records: [...(next.review_routing_records ?? []), replayRecord] };
      }
    } else if (packet && latestRun.phase_id === "23.9") {
      const sourcePlanSha = packet.core.approved_plan_ref.split("#").pop();
      if (!sourcePlanSha || !/^sha256:[a-f0-9]{64}$/u.test(sourcePlanSha)) {
        throw new Error("REVIEW_FAILED_PLAN_IDENTITY_MISSING");
      }
      const failureClass = observation.status === "timeout"
        ? "timeout"
        : observation.status === "invalid_artifact"
          ? "artifact_invalid"
          : "process_failed";
      const eventCommon = {
        run_instance_id: latestRun.run_instance_id ?? "", run_id: latestRun.run_id,
        attempt_kind: "single_review" as const, cohort_id: null,
        attempt_id: claim.attempt_id, claim_id: claim.claim_id,
        procedure_ids: [observation.procedure_id],
        request_artifact_hash: observation.request_artifact_hash as `sha256:${string}`,
        expected_bundle_output_path: observation.expected_output_path ?? observation.output_path,
        owner_token_hash: claim.owner_token_hash as `sha256:${string}`
      };
      const failureEvents = [buildReviewAttemptEvent({ ...eventCommon, sequence: 1, event_type: "claimed",
        occurred_at: claim.created_at, raw_startup_observation: null, observed_profile: null,
        terminal_status: null, error_code: null, output_artifact_hash: null })];
      if (packet.rawStartup) failureEvents.push(buildReviewAttemptEvent({ ...eventCommon, sequence: 2, event_type: "started",
        occurred_at: observation.start_time ?? claim.created_at, raw_startup_observation: packet.rawStartup,
        observed_profile: parseRawReviewStartupObservation(packet.rawStartup), terminal_status: null,
        error_code: null, output_artifact_hash: null }));
      const candidateOutput = path.resolve(targetRoot, observation.output_path);
      failureEvents.push(buildReviewAttemptEvent({ ...eventCommon, sequence: packet.rawStartup ? 3 : 2,
        event_type: "terminal", occurred_at: timestamp, raw_startup_observation: null, observed_profile: null,
        terminal_status: failureClass === "timeout" ? "timeout"
          : failureClass === "artifact_invalid" ? "invalid_artifact" : "failed",
        error_code: failureClass,
        output_artifact_hash: fs.existsSync(candidateOutput)
          ? `sha256:${sha256Hex(fs.readFileSync(candidateOutput))}` : null }));
      const canonicalAttempt = buildReviewAttemptRecord({
        run_instance_id: eventCommon.run_instance_id, run_id: eventCommon.run_id,
        attempt_kind: "single_review", cohort_id: null, attempt_id: claim.attempt_id, claim_id: claim.claim_id,
        procedure_ids: eventCommon.procedure_ids, profile_id: observation.binding_profile_id ?? observation.adapter_id,
        request_artifact_hash: eventCommon.request_artifact_hash,
        expected_bundle_output_path: eventCommon.expected_bundle_output_path,
        claimed_event_id: failureEvents[0].record_id,
        started_event_id: packet.rawStartup ? failureEvents[1].record_id : null,
        terminal_event_id: failureEvents[failureEvents.length - 1].record_id,
        terminal_status: failureClass === "timeout" ? "timeout"
          : failureClass === "artifact_invalid" ? "invalid_artifact" : "failed", verdict: null,
        reviewed_source_head: observation.reviewed_source_head ?? packet.core.source_snapshot,
        implementation_diff_id: (observation.reviewed_diff_hash ?? packet.overlay.content_hash) as `sha256:${string}`,
        predecessor_review_attempt_id: observation.predecessor_review_attempt_id ?? null,
        predecessor_review_artifact_id: observation.predecessor_review_artifact_id ?? null,
        bundle_envelope_id: null, bundle_envelope_hash: null, lens_results: [], created_at: timestamp
      });
      for (const event of failureEvents) {
        staging.storeIndependentRecord(database, {
          recordKind: "review_attempt_event",
          recordId: event.record_id,
          runId: latestRun.run_id,
          phaseId: latestRun.phase_id,
          taskPath: latestRun.task_path,
          createdAt: event.occurred_at,
          status: event.event_type === "terminal" ? "terminal_failed" : event.event_type,
          summary: `${observation.procedure_id} attempt ${event.event_type}.`,
          payload: event
        });
      }
      staging.storeIndependentRecord(database, {
        recordKind: "review_attempt",
        recordId: canonicalAttempt.record_id,
        runId: latestRun.run_id,
        phaseId: latestRun.phase_id,
        taskPath: latestRun.task_path,
        createdAt: timestamp,
        status: "failed",
        summary: `${observation.procedure_id} terminal failed attempt.`,
        payload: canonicalAttempt
      });
    }

    return next;
  }, { expectedRunInstanceId: currentRun.run_instance_id });

  writeCompatibilityRunArtifacts(targetRoot, run);
  return run;
}

function extractRawStartupObservation(stdout: string): RawReviewStartupObservationV1 {
  const threadIds = stdout.split(/\r?\n/u).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const parsed = JSON.parse(line) as { type?: unknown; thread_id?: unknown };
      return parsed.type === "thread.started" && typeof parsed.thread_id === "string"
        ? [parsed.thread_id] : [];
    } catch { return []; }
  });
  const uniqueThreadIds = [...new Set(threadIds)];
  if (uniqueThreadIds.length !== 1) {
    throw new Error(`review_startup_thread_identity_cardinality_invalid:${uniqueThreadIds.length}`);
  }
  const sessionId = uniqueThreadIds[0];
  const sessionsRoot = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "sessions");
  const matchingRollouts: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith(".jsonl")) matchingRollouts.push(absolute);
    }
  };
  if (fs.existsSync(sessionsRoot)) visit(sessionsRoot);
  if (matchingRollouts.length !== 1) {
    throw new Error(`review_startup_rollout_cardinality_invalid:${matchingRollouts.length}`);
  }
  const rolloutPath = matchingRollouts[0];
  const bytes = fs.readFileSync(rolloutPath);
  const records: Array<{ ordinal: number; raw: Buffer; parsed: Record<string, unknown> }> = [];
  let start = 0;
  let ordinal = 0;
  for (let cursor = 0; cursor < bytes.length; cursor += 1) {
    if (bytes[cursor] !== 0x0a) continue;
    const raw = bytes.subarray(start, cursor + 1);
    start = cursor + 1;
    if (raw.toString("utf8").trim()) {
      try { records.push({ ordinal, raw, parsed: JSON.parse(raw.toString("utf8")) as Record<string, unknown> }); }
      catch { throw new Error(`review_startup_rollout_record_invalid:${ordinal}`); }
    }
    ordinal += 1;
  }
  if (start !== bytes.length) throw new Error("review_startup_rollout_missing_terminal_lf");
  const metas = records.filter((record) => {
    const payload = record.parsed.payload as Record<string, unknown> | undefined;
    return record.parsed.type === "session_meta"
      && (payload?.id === sessionId || payload?.session_id === sessionId);
  });
  if (metas.length !== 1) throw new Error(`review_startup_session_meta_cardinality_invalid:${metas.length}`);
  const turns = records.filter((record) => record.parsed.type === "turn_context" && record.ordinal > metas[0].ordinal);
  if (turns.length < 1) throw new Error("review_startup_turn_context_cardinality_invalid:0");
  const meta = metas[0];
  const turn = turns[0];
  const metaRaw = meta.raw.toString("utf8");
  const turnRaw = turn.raw.toString("utf8");
  return {
    schema_version: 1,
    source: "codex_turn_context_v1",
    session_id: sessionId,
    rollout_path_hash: `sha256:${sha256Hex(Buffer.from(rolloutPath, "utf8"))}`,
    session_meta_record_ordinal: meta.ordinal,
    session_meta_raw_bytes: metaRaw,
    session_meta_raw_byte_length: meta.raw.length,
    session_meta_raw_sha256: `sha256:${sha256Hex(meta.raw)}`,
    turn_context_record_ordinal: turn.ordinal,
    turn_context_raw_bytes: turnRaw,
    turn_context_raw_byte_length: turn.raw.length,
    turn_context_raw_sha256: `sha256:${sha256Hex(turn.raw)}`,
    raw_pair_sha256: `sha256:${sha256Hex(canonicalJson({
      session_meta_raw_sha256: `sha256:${sha256Hex(meta.raw)}`,
      turn_context_raw_sha256: `sha256:${sha256Hex(turn.raw)}`
    }))}`
  };
}

function rawStartupObservationHash(observation: RawReviewStartupObservationV1): `sha256:${string}` {
  return observation.source === "codex_turn_context_v1"
    ? observation.raw_pair_sha256
    : observation.raw_sha256;
}

export async function launchRuntimePlanningReviewBundle(
  cwd: string,
  options: LaunchPlanningReviewBundleOptions
): Promise<RuntimeReviewLaunchResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  if (current.run.lifecycle_status !== "active"
    || (current.run.phase_id !== "23.9" && isPrePhaseFVerificationCompatibility(current.run.phase_id))) {
    throw new Error("planning_review_bundle_requires_active_phase_23_9_or_later_run");
  }
  const registry = readSelfHostingProcedureRegistry(targetRoot);
  if (!registry) throw new Error("Self-hosting procedure registry not found.");
  const launchDescriptor = requireReviewLaunchCapability(indexSelfHostingProceduresById(registry), "plan-review");
  const launchCapability = launchDescriptor.automatic_launch_capability!;
  const bindingCandidates = readCodexReferenceBinding(targetRoot).profiles.filter((entry) =>
    entry.status === "accepted" && entry.route_class === "critical_independent"
    && entry.adapter_id === launchCapability.adapter_id
    && entry.capabilities.fresh_independent_delta && !entry.capabilities.safe_session_resume);
  if (bindingCandidates.length !== 1) {
    throw new Error(`planning_review_bundle_profile_cardinality_invalid:${bindingCandidates.length}`);
  }
  const bindingProfile = bindingCandidates[0];
  const timing = resolveLaunchTiming(targetRoot, ["plan-review", "architecture-review", "db-storage-review"], options.timeoutSeconds, options.staleAfterSeconds);
  const profile: SelfHostingReviewLaunchProfile = {
    adapter_id: launchCapability.adapter_id,
    model: bindingProfile.model,
    reasoning_effort: bindingProfile.reasoning_effort,
    sandbox_mode: "read-only",
    output_mode: "file",
    timeout_seconds: timing.timeoutSeconds,
    stale_after_seconds: timing.staleAfterSeconds,
    termination_policy: timing.terminationPolicy
  };
  const timeoutSeconds = timing.timeoutSeconds;
  const staleAfterSeconds = timing.staleAfterSeconds;
  const requestPath = resolveLaunchRequestPath(targetRoot, options.requestPath);
  const outputPath = resolveLaunchOutputPath(targetRoot, current.run, options.outputPath);
  const lensManifestPath = path.resolve(targetRoot, options.lensManifestPath);
  ensureInsideTargetRoot(targetRoot, lensManifestPath);
  const lensManifestBytes = fs.readFileSync(lensManifestPath);
  const lensManifest = JSON.parse(lensManifestBytes.toString("utf8")) as {
    schema_version?: unknown; bundle_kind?: unknown; required_lens_ids?: unknown;
    predecessor_cohort_id?: unknown; carried_lens_refs?: unknown;
  };
  const manifestKeys = Object.keys(lensManifest).sort();
  if (canonicalJson(manifestKeys) !== canonicalJson([
    "bundle_kind", "carried_lens_refs", "predecessor_cohort_id", "required_lens_ids", "schema_version"
  ]) || lensManifest.schema_version !== 1
    || !["candidate", "closure"].includes(String(lensManifest.bundle_kind))
    || !Array.isArray(lensManifest.required_lens_ids)
    || !Array.isArray(lensManifest.carried_lens_refs)) {
    throw new Error("planning_review_lens_manifest_invalid");
  }
  const expectedProcedures = lensManifest.required_lens_ids.map(String) as PlanningReviewLensId[];
  const allPlanningLenses: PlanningReviewLensId[] = ["plan-review", "architecture-review", "db-storage-review"];
  if (expectedProcedures.length < 1 || expectedProcedures.length > 3
    || new Set(expectedProcedures).size !== expectedProcedures.length
    || expectedProcedures.some((entry) => !allPlanningLenses.includes(entry))) {
    throw new Error("planning_review_lens_manifest_required_set_invalid");
  }
  const requiredProcedures = deriveRequiredPlanningReviewLenses(targetRoot, current.run);
  if (canonicalJson(expectedProcedures) !== canonicalJson(requiredProcedures)) {
    throw new Error(`planning_review_lens_manifest_required_set_mismatch:${requiredProcedures.join(",")}`);
  }
  const effectivePlanBinding = tryResolveExactPlanEvidenceBinding(current.run);
  const effectivePlanSha = effectivePlanBinding?.artifactId
    ?? (current.run.phase_id === "23.9"
      ? current.run.approvals[current.run.approvals.length - 1]?.reviewed_plan_artifact_id
      : undefined);
  if (!effectivePlanSha || !/^sha256:[a-f0-9]{64}$/u.test(effectivePlanSha)) {
    throw new Error("planning_review_bundle_effective_plan_identity_missing");
  }
  const expectedSourceHead = resolveExactCommit(targetRoot, "HEAD");
  const activeTaskPath = path.join(targetRoot, current.run.active_task_path ?? current.run.task_path);
  const expectedTaskArtifactId = `sha256:${sha256Hex(fs.readFileSync(activeTaskPath))}`;
  const expectedImmutableBase = current.run.bootstrap_facts?.find((fact) =>
    fact.label === "base_commit")?.value ?? current.run.source_snapshot;
  if (!expectedImmutableBase || !/^[a-f0-9]{40}$/u.test(expectedImmutableBase)) {
    throw new Error("planning_review_bundle_immutable_base_missing");
  }
  const expectedOutputContracts = Object.fromEntries(
    expectedProcedures.map((procedureId) => [
      procedureId,
      `sha256:${sha256Hex(fs.readFileSync(path.join(
        targetRoot, "skills", "self-hosting", procedureId, "references", "output-format.md"
      )))}`
    ])
  );
  const outputSchemaPath = "schemas/planning-review-lens-output.schema.json";
  const outputContractRefs = expectedProcedures.map((procedureId) => {
    const descriptor = registry.procedures.find((entry) => entry.procedure_id === procedureId);
    if (!descriptor) throw new Error(`planning_review_bundle_procedure_missing:${procedureId}`);
    const body = {
      procedure_id: procedureId,
      registry_contract_version: registry.contract_version,
      skill_path: descriptor.skill_path,
      skill_hash: `sha256:${sha256Hex(fs.readFileSync(path.join(targetRoot, descriptor.skill_path)))}` as `sha256:${string}`,
      output_format_path: descriptor.output_format_path,
      output_format_hash: `sha256:${sha256Hex(fs.readFileSync(path.join(targetRoot, descriptor.output_format_path)))}` as `sha256:${string}`,
      output_schema_path: outputSchemaPath,
      output_schema_hash: `sha256:${sha256Hex(fs.readFileSync(path.join(targetRoot, outputSchemaPath)))}` as `sha256:${string}`
    };
    return { ...body, output_contract_id: `sha256:${sha256Hex(canonicalJson(body))}` as `sha256:${string}` };
  });
  const contextCoreHash = `sha256:${sha256Hex(canonicalJson({
    run_instance_id: current.run.run_instance_id, run_id: current.run.run_id,
    task_artifact_id: expectedTaskArtifactId as `sha256:${string}`, immutable_base: expectedImmutableBase,
    planning_review_source_head: expectedSourceHead, anchor_plan_sha: effectivePlanSha
  }))}` as `sha256:${string}`;
  const priorCohorts = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id)
    .listIndependentRecords("review_cohort", current.run.run_id)
    .filter((entry) => (entry as { record_kind?: unknown }).record_kind === "review_cohort") as Array<{ record_id: `sha256:${string}`; created_at: string }>;
  priorCohorts.sort((left, right) => left.created_at.localeCompare(right.created_at));
  const requestBody = fs.readFileSync(requestPath, "utf8").trim();
  const bundleKind = lensManifest.bundle_kind as "candidate" | "closure";
  const predecessorCohortId = lensManifest.predecessor_cohort_id === null
    ? null : String(lensManifest.predecessor_cohort_id) as `sha256:${string}`;
  const carriedLensRefs = lensManifest.carried_lens_refs as Parameters<typeof buildReviewCohort>[0]["carried_lens_refs"];
  if (bundleKind === "closure" && !priorCohorts.some((entry) => entry.record_id === predecessorCohortId)) {
    throw new Error("planning_review_lens_manifest_predecessor_missing");
  }
  const cohort = buildReviewCohort({
    run_instance_id: current.run.run_instance_id ?? "", run_id: current.run.run_id,
    task_artifact_id: expectedTaskArtifactId as `sha256:${string}`, immutable_base: expectedImmutableBase,
    planning_review_source_head: expectedSourceHead, anchor_plan_sha: effectivePlanSha as `sha256:${string}`,
    output_contract_refs: outputContractRefs, profile_id: bindingProfile.profile_id, bundle_kind: bundleKind,
    predecessor_cohort_id: predecessorCohortId,
    required_lens_ids: expectedProcedures,
    carried_lens_refs: carriedLensRefs, context_core_hash: contextCoreHash, created_at: current.run.updated_at
  });
  const requestMarkdown = [
    requestBody,
    "",
    "Return one JSON object with schema_version=1, common identity fields, exactly",
    `the manifest-selected lens_results and lens_documents for: ${expectedProcedures.join(", ")}.`,
    "Keep each lens document untouched. Read each",
    "checked-in SKILL.md and references/output-format.md.",
    "",
    `plan_sha: ${effectivePlanSha}`,
    `source_head: ${expectedSourceHead}`,
    `task_artifact_id: ${expectedTaskArtifactId}`,
    `immutable_base: ${expectedImmutableBase}`,
    `output_contract_ids: ${canonicalJson(expectedOutputContracts)}`
    ,`review_cohort_id: ${cohort.record_id}`
    ,`lens_manifest_sha256: sha256:${sha256Hex(lensManifestBytes)}`
  ].join("\n");
  const observationBase = {
    procedure_id: "planning-review-bundle",
    run_id: current.run.run_id,
    run_instance_id: current.run.run_instance_id,
    adapter_id: profile.adapter_id,
    model: profile.model,
    reasoning_effort: profile.reasoning_effort,
    sandbox_mode: profile.sandbox_mode,
    output_mode: profile.output_mode,
    timeout_seconds: timeoutSeconds,
    stale_after_seconds: staleAfterSeconds,
    termination_policy: profile.termination_policy,
    request_path: toRepoRelative(targetRoot, requestPath),
    request_artifact_hash: `sha256:${sha256Hex(requestMarkdown)}`,
    expected_output_path: toRepoRelative(targetRoot, outputPath),
    output_path: toRepoRelative(targetRoot, outputPath)
  };
  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, current.run.run_id);
  const latestPlanningApproval = current.run.approvals[current.run.approvals.length - 1];
  const existingAttempts = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id)
    .listIndependentRecords("review_attempt", current.run.run_id)
    .filter((entry) => {
      const attempt = entry as { attempt_kind?: unknown; cohort_id?: unknown };
      return attempt.attempt_kind === "planning_bundle" && attempt.cohort_id === cohort.record_id;
    }) as Array<{ terminal_status?: unknown }>;
  const terminalAttemptStatuses = [
    "success", "spawn_failed", "startup_observation_failed", "profile_mismatch",
    "failed", "timeout", "blocked", "invalid_artifact"
  ];
  if (existingAttempts.some((entry) => entry.terminal_status === "success")
    || existingAttempts.length >= 2
    || existingAttempts.some((entry) => !terminalAttemptStatuses.includes(String(entry.terminal_status)))) {
    throw new Error("PLANNING_REVIEW_BUNDLE_RETRY_NOT_ALLOWED");
  }
  if (dryRun) {
    return {
      targetRoot, projectRoot: roots.projectRoot, dryRun, run: current.run,
      runPath: current.runPath, projectDbPath: paths.projectDbPath,
      stagingDbPath: paths.stagingDbPath, state: current.state,
      observation: {
        ...observationBase, status: "dry_run",
        summary: "Planning review bundle launch is valid; no process or artifact was created.",
        next_valid_action: "rerun without --dry-run"
      }
    };
  }
  const persistPlanningBundleFailure = (
    startedAt: string,
    failedAt: string,
    errorCode: string,
    rawStartup?: RawReviewStartupObservationV1
  ): Run => {
    const attemptId = `planning-bundle:${sha256Hex(canonicalJson({
      request_artifact_hash: observationBase.request_artifact_hash, started_at: startedAt
    }))}`;
    const common = {
      run_instance_id: current.run.run_instance_id ?? "", run_id: current.run.run_id,
      attempt_kind: "planning_bundle" as const, cohort_id: cohort.record_id,
      attempt_id: attemptId, claim_id: attemptId,
      procedure_ids: expectedProcedures,
      request_artifact_hash: observationBase.request_artifact_hash as `sha256:${string}`,
      expected_bundle_output_path: observationBase.expected_output_path,
      owner_token_hash: `sha256:${sha256Hex(attemptId)}` as `sha256:${string}`
    };
    const events = [buildReviewAttemptEvent({ ...common, sequence: 1, event_type: "claimed", occurred_at: startedAt,
      raw_startup_observation: null, observed_profile: null, terminal_status: null, error_code: null, output_artifact_hash: null })];
    if (rawStartup) events.push(buildReviewAttemptEvent({ ...common, sequence: 2, event_type: "started", occurred_at: startedAt,
      raw_startup_observation: rawStartup, observed_profile: parseRawReviewStartupObservation(rawStartup),
      terminal_status: null, error_code: null, output_artifact_hash: null }));
    events.push(buildReviewAttemptEvent({ ...common, sequence: rawStartup ? 3 : 2, event_type: "terminal", occurred_at: failedAt,
      raw_startup_observation: null, observed_profile: null,
      terminal_status: rawStartup
        ? errorCode === "timeout" ? "timeout"
          : errorCode === "artifact_invalid" ? "invalid_artifact"
            : errorCode === "profile_mismatch" ? "profile_mismatch" : "failed"
        : errorCode === "startup_observation_failed" ? "startup_observation_failed" : "spawn_failed",
      error_code: errorCode,
      output_artifact_hash: rawStartup && fs.existsSync(outputPath)
        ? `sha256:${sha256Hex(fs.readFileSync(outputPath))}` : null }));
    const attempt = buildReviewAttemptRecord({
      run_instance_id: common.run_instance_id, run_id: common.run_id, attempt_kind: common.attempt_kind,
      cohort_id: common.cohort_id, attempt_id: common.attempt_id, claim_id: common.claim_id,
      procedure_ids: common.procedure_ids, profile_id: bindingProfile.profile_id,
      request_artifact_hash: common.request_artifact_hash,
      expected_bundle_output_path: common.expected_bundle_output_path,
      claimed_event_id: events[0].record_id,
      started_event_id: rawStartup ? events[1].record_id : null,
      terminal_event_id: events[events.length - 1].record_id,
      terminal_status: rawStartup
        ? errorCode === "timeout" ? "timeout"
          : errorCode === "artifact_invalid" ? "invalid_artifact"
            : errorCode === "profile_mismatch" ? "profile_mismatch" : "failed"
        : errorCode === "startup_observation_failed" ? "startup_observation_failed" : "spawn_failed",
      verdict: null, reviewed_source_head: null,
      implementation_diff_id: null, predecessor_review_attempt_id: null,
      predecessor_review_artifact_id: null, bundle_envelope_id: null, bundle_envelope_hash: null,
      lens_results: [], created_at: failedAt
    });
    const failureStaging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
    const latest = failureStaging.loadRun(current.run.run_id) ?? current.run;
    const failedRun = failureStaging.mutateRunWithDatabase(latest.run_id, (latestRun, database) => {
      for (const event of events) failureStaging.storeIndependentRecord(database, {
        recordKind: "review_attempt_event", recordId: event.record_id,
        runId: latestRun.run_id, phaseId: latestRun.phase_id, taskPath: latestRun.task_path,
        createdAt: event.occurred_at,
        status: event.event_type === "terminal" ? "terminal_failed" : event.event_type,
        summary: `Planning review attempt ${event.event_type}.`, payload: event
      });
      failureStaging.storeIndependentRecord(database, {
        recordKind: "review_attempt", recordId: attempt.record_id,
        runId: latestRun.run_id, phaseId: latestRun.phase_id, taskPath: latestRun.task_path,
        createdAt: failedAt, status: "failed", summary: "Terminal failed planning review bundle attempt.",
        payload: attempt
      });
      return latestRun;
    }, { expectedRunInstanceId: latest.run_instance_id, expectedRunRevision: latest.run_revision, expectedRunPresence: "present" });
    writeCompatibilityRunArtifacts(targetRoot, failedRun);
    return failedRun;
  };
  const child = await runCodexCliReview(profile, {
    targetRoot, requestMarkdown, outputPath, timeoutSeconds, staleAfterSeconds,
    childEnvironment: { ...process.env }
  });
  if (child.timedOut || child.exitCode !== 0) {
    const failedAt = child.completedTime ?? nowIso();
    let failedStartup: RawReviewStartupObservationV1 | undefined;
    try { failedStartup = extractRawStartupObservation(child.stdout); } catch { /* typed below */ }
    const failedObserved = failedStartup ? parseRawReviewStartupObservation(failedStartup) : undefined;
    const failedProfileMismatch = failedObserved && (
      failedObserved.provider !== "openai"
      || failedObserved.model !== profile.model
      || failedObserved.workdir !== targetRoot
      || failedObserved.reasoning !== profile.reasoning_effort
      || failedObserved.sandbox !== "read-only"
      || failedObserved.approval_policy !== "never"
    );
    persistPlanningBundleFailure(
      child.startTime,
      failedAt,
      failedStartup
        ? failedProfileMismatch ? "profile_mismatch"
          : child.timedOut ? "timeout" : "process_failed"
        : child.pid ? "startup_observation_failed" : "spawn_failed",
      failedStartup
    );
    throw new Error(child.timedOut
      ? "PLANNING_REVIEW_BUNDLE_TIMEOUT"
      : `PLANNING_REVIEW_BUNDLE_PROCESS_FAILED:${child.exitCode ?? "spawn"}`);
  }
  let observedStartup: RawReviewStartupObservationV1 | undefined;
  try {
  const rawStartup = extractRawStartupObservation(child.stdout);
  observedStartup = rawStartup;
  const envelope = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
    schema_version: number; bundle_id: string; plan_sha: `sha256:${string}`;
    source_head: string; task_artifact_id: `sha256:${string}`; immutable_base: string;
    lens_results: PlanningLensResultV1[]; lens_documents: Record<string, string>;
  };
  const envelopeKeys = Object.keys(envelope).sort();
  if (canonicalJson(envelopeKeys) !== canonicalJson([
    "bundle_id", "immutable_base", "lens_documents", "lens_results", "plan_sha",
    "schema_version", "source_head", "task_artifact_id"
  ])) {
    throw new Error("planning_review_bundle_schema_invalid:properties");
  }
  if (!Array.isArray(envelope.lens_results) || envelope.lens_results.length !== expectedProcedures.length
    || !envelope.lens_documents || typeof envelope.lens_documents !== "object") {
    throw new Error("planning_review_bundle_schema_invalid:cardinality");
  }
  if (envelope.schema_version !== 1
    || envelope.bundle_id !== cohort.record_id
    || envelope.plan_sha !== effectivePlanSha
    || envelope.source_head !== expectedSourceHead
    || envelope.task_artifact_id !== expectedTaskArtifactId
    || envelope.immutable_base !== expectedImmutableBase
    || canonicalJson(envelope.lens_results.map((result) => result.procedure_id)) !== canonicalJson(expectedProcedures)
    || canonicalJson(Object.keys(envelope.lens_documents)) !== canonicalJson(expectedProcedures)) {
    throw new Error("planning_review_bundle_output_contract_invalid");
  }
  envelope.lens_results = envelope.lens_results.map(validatePlanningLensResult);
  for (const procedureId of expectedProcedures) {
    const result = envelope.lens_results.find((entry) => entry.procedure_id === procedureId);
    const document = envelope.lens_documents[procedureId];
    if (!result || typeof document !== "string" || !document.trim()
      || !document.includes(`sha256:${result.plan_sha.slice("sha256:".length)}`)
      || !document.includes(result.source_head)
      || !document.includes(result.task_artifact_id)
      || !document.includes(result.immutable_base)
      || result.output_contract_id !== expectedOutputContracts[procedureId]) {
      throw new Error(`planning_review_bundle_document_identity_invalid:${procedureId}`);
    }
    validatePlanningLensDocumentVerdict(result.verdict, document, procedureId);
    if (procedureId === "plan-review") validatePlanReviewArtifact(document);
    else if (!buildProcedureReviewResult(current.run, procedureId, {
      artifact_id: `sha256:${sha256Hex(document)}`,
      path: "schema-validation-only",
      kind: `procedure-artifact:${procedureId}`,
      description: "schema-validation-only"
    }, document, child.completedTime ?? nowIso())) {
      throw new Error(`planning_review_bundle_document_contract_invalid:${procedureId}`);
    }
  }
  aggregatePlanBlockers(envelope.lens_results);
  const bundleAttemptId = `planning-bundle:${sha256Hex(canonicalJson({
    request_artifact_hash: observationBase.request_artifact_hash,
    started_at: child.startTime
  }))}`;
  const bundleRecordedAt = child.completedTime ?? nowIso();
  const rawEnvelopeUtf8 = fs.readFileSync(outputPath, "utf8");
  const bundleRecord = buildPlanningReviewBundleRecord({
    run_instance_id: current.run.run_instance_id ?? "", run_id: current.run.run_id,
    cohort_id: cohort.record_id, attempt_id: bundleAttemptId,
    raw_envelope_utf8: rawEnvelopeUtf8,
    ordered_lens_refs: expectedProcedures.map((procedureId) => ({
      procedure_id: procedureId,
      artifact_id: `sha256:${sha256Hex(envelope.lens_documents[procedureId])}` as `sha256:${string}`,
      artifact_hash: `sha256:${sha256Hex(envelope.lens_documents[procedureId])}` as `sha256:${string}`,
      output_contract_id: outputContractRefs.find((entry) => entry.procedure_id === procedureId)!.output_contract_id
    })),
    created_at: bundleRecordedAt
  });
  const bundleEventCommon = {
    run_instance_id: current.run.run_instance_id ?? "", run_id: current.run.run_id,
    attempt_kind: "planning_bundle" as const, cohort_id: cohort.record_id,
    attempt_id: bundleAttemptId, claim_id: bundleAttemptId, procedure_ids: expectedProcedures,
    request_artifact_hash: observationBase.request_artifact_hash as `sha256:${string}`,
    expected_bundle_output_path: observationBase.expected_output_path,
    owner_token_hash: `sha256:${sha256Hex(bundleAttemptId)}` as `sha256:${string}`
  };
  const bundleEvents = [
    buildReviewAttemptEvent({ ...bundleEventCommon, sequence: 1, event_type: "claimed", occurred_at: child.startTime,
      raw_startup_observation: null, observed_profile: null, terminal_status: null, error_code: null, output_artifact_hash: null }),
    buildReviewAttemptEvent({ ...bundleEventCommon, sequence: 2, event_type: "started", occurred_at: child.startTime,
      raw_startup_observation: rawStartup, observed_profile: parseRawReviewStartupObservation(rawStartup),
      terminal_status: null, error_code: null, output_artifact_hash: null }),
    buildReviewAttemptEvent({ ...bundleEventCommon, sequence: 3, event_type: "terminal", occurred_at: bundleRecordedAt,
      raw_startup_observation: null, observed_profile: null, terminal_status: "success", error_code: null,
      output_artifact_hash: `sha256:${sha256Hex(fs.readFileSync(outputPath))}` })
  ];
  const attempt = buildReviewAttempt({
    run_instance_id: current.run.run_instance_id ?? "",
    run_id: current.run.run_id,
    attempt_kind: "planning_bundle",
    procedure_ids: expectedProcedures,
    cohort_id: envelope.bundle_id,
    attempt_id: bundleAttemptId,
    claim_id: bundleAttemptId,
    profile_id: bindingProfile.profile_id,
    request_artifact_hash: observationBase.request_artifact_hash as `sha256:${string}`,
    expected_bundle_output_path: observationBase.expected_output_path,
    claimed_event_id: bundleEvents[0].record_id,
    started_event_id: bundleEvents[1].record_id,
    terminal_event_id: bundleEvents[2].record_id,
    terminal_status: "success",
    verdict: null,
    reviewed_source_head: null,
    implementation_diff_id: null,
    predecessor_review_attempt_id: null,
    predecessor_review_artifact_id: null,
    bundle_envelope_id: bundleRecord.record_id,
    bundle_envelope_hash: bundleRecord.content_hash,
    lens_results: envelope.lens_results.map((result) => ({
      procedure_id: result.procedure_id,
      status: "recorded",
      artifact_id: `sha256:${sha256Hex(envelope.lens_documents[result.procedure_id])}`,
      artifact_hash: `sha256:${sha256Hex(envelope.lens_documents[result.procedure_id])}`,
      verdict: result.verdict
    })),
    created_at: bundleRecordedAt
  }, rawStartup, {
    provider: "openai", model: profile.model, workdir: targetRoot,
    reasoning: profile.reasoning_effort, sandbox: "read-only", approval_policy: "never"
  });
  assertPlanningBundleIdentity(attempt);
  const splitRoot = path.join(path.dirname(outputPath), `${path.basename(outputPath)}.lenses`);
  const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
  const latest = staging.loadRun(current.run.run_id);
  if (!latest) throw new Error("planning_review_bundle_run_missing_after_ingestion");
  const run = staging.mutateRunWithDatabase(latest.run_id, (latestRun, database) => {
    if (!latestRun.run_instance_id) throw new Error("planning_review_bundle_run_instance_missing");
    const runInstanceId = latestRun.run_instance_id;
    let nextRun = latestRun;
    const recordedAt = child.completedTime ?? nowIso();
    for (const procedureId of expectedProcedures) {
      const markdown = envelope.lens_documents[procedureId];
      const contentHash = sha256Hex(markdown);
      const hashPrefix = contentHash.slice(0, 12);
      const artifact: ArtifactRef = {
        artifact_id: `sha256:${contentHash}`,
        path: toPortablePath(path.join("evidence", `${procedureId}-${hashPrefix}.md`)),
        kind: `procedure-artifact:${procedureId}`,
        description: toRepoRelative(targetRoot, path.join(splitRoot, `${procedureId}.md`))
      };
      const evidence: EvidenceRef = {
        evidence_id: `procedure-${procedureId}-${hashPrefix}`,
        kind: `procedure:${procedureId}`,
        summary: procedureId,
        artifact_id: artifact.artifact_id,
        path: artifact.path
      };
      const review = buildProcedureReviewResult(nextRun, procedureId, artifact, markdown, recordedAt);
      if (!review) throw new Error(`planning_review_bundle_review_result_missing:${procedureId}`);
      const payload = new PayloadStore(database).store({
        parentRecordId: artifact.artifact_id,
        sourceRunId: nextRun.run_id,
        sourcePhaseId: nextRun.phase_id,
        kind: `procedure-artifact-body:${procedureId}`,
        mediaType: "text/markdown",
        summary: `${procedureId} authoritative procedure body`,
        content: markdown,
        searchableText: markdown.slice(0, 4000),
        boundedExcerpt: markdown.slice(0, 500),
        retentionClass: "audit"
      });
      staging.storeProcedureArtifact(database, {
        run_instance_id: runInstanceId,
        source_run_id: nextRun.run_id,
        procedure_id: procedureId,
        artifact_id: artifact.artifact_id,
        payload_id: payload.payload_id,
        content_hash: contentHash,
        recorded_at: recordedAt,
        provenance_json: JSON.stringify({
          phase_id: nextRun.phase_id,
          task_path: nextRun.active_task_path ?? nextRun.task_path,
          worktree: nextRun.repository.root_path,
          branch: nextRun.repository.branch,
          head: envelope.source_head,
          source_snapshot: nextRun.source_snapshot,
          base_commit: nextRun.source_snapshot,
          review_attempt_id: attempt.attempt_id,
          review_cohort_id: envelope.bundle_id,
          reviewed_source_head: envelope.source_head,
          task_artifact_id: envelope.task_artifact_id,
          immutable_base: envelope.immutable_base,
          raw_startup_observation_hash: rawStartupObservationHash(rawStartup),
          compatibility_path: artifact.path
        }),
        ...(effectivePlanBinding ? {
          reviewed_plan_artifact_id: effectivePlanSha,
          reviewed_plan_content_hash: effectivePlanBinding.contentHash,
          reviewed_evidence_artifact_id: effectivePlanSha
        } : {})
      });
      nextRun = recordReviewResult(withUpdatedAt({
        ...nextRun,
        artifacts: [...nextRun.artifacts, artifact],
        evidence: [...nextRun.evidence, evidence]
      }, recordedAt), review);
      nextRun = {
        ...nextRun,
        review_routing_records: [
          ...(nextRun.review_routing_records ?? []),
          {
            record_kind: "review_invocation",
            record_id: `planning-review-invocation-${attempt.attempt_id}-${procedureId}`,
            created_at: recordedAt,
            status: "success",
            summary: `${procedureId} terminal planning cohort invocation.`,
            payload: {
              procedure_id: procedureId,
              run_id: nextRun.run_id,
              run_instance_id: nextRun.run_instance_id,
              status: "success",
              attempt_id: attempt.attempt_id,
              review_claim_id: attempt.claim_id,
              review_claim_owner_token_hash: bundleEventCommon.owner_token_hash,
              terminal_exit_code: 0,
              artifact_id: artifact.artifact_id,
              artifact_valid: true,
              artifact_present: true,
              termination_policy: profile.termination_policy,
              reviewed_source_head: envelope.source_head,
              reviewed_plan_artifact_id: effectivePlanSha,
              review_cohort_id: envelope.bundle_id
            }
          }
        ]
      };
    }
    staging.storeIndependentRecord(database, {
      recordKind: "review_cohort", recordId: envelope.bundle_id,
      runId: latestRun.run_id, phaseId: latestRun.phase_id, taskPath: latestRun.task_path,
      createdAt: recordedAt, status: "terminal",
      summary: "Exact required-lens planning review cohort.",
      payload: cohort
    });
    for (const event of bundleEvents) {
      staging.storeIndependentRecord(database, {
        recordKind: "review_attempt_event", recordId: event.record_id,
        runId: latestRun.run_id, phaseId: latestRun.phase_id, taskPath: latestRun.task_path,
        createdAt: event.occurred_at,
        status: event.event_type === "terminal" ? `terminal_${event.terminal_status}` : event.event_type,
        summary: `Planning review attempt ${event.event_type}.`, payload: event
      });
    }
    staging.storeIndependentRecord(database, {
      recordKind: "review_attempt", recordId: attempt.record_id,
      runId: latestRun.run_id, phaseId: latestRun.phase_id, taskPath: latestRun.task_path,
      createdAt: recordedAt, status: attempt.terminal_status,
      summary: "Terminal planning review bundle attempt.", payload: attempt
    });
    staging.storeIndependentRecord(database, {
      recordKind: "planning_review_bundle", recordId: bundleRecord.record_id,
      runId: latestRun.run_id, phaseId: latestRun.phase_id, taskPath: latestRun.task_path,
      createdAt: recordedAt, status: "terminal",
      summary: "Required-lens planning review bundle.",
      payload: bundleRecord
    });
    return nextRun;
  }, {
    expectedRunInstanceId: latest.run_instance_id,
    expectedRunRevision: latest.run_revision,
    expectedRunPresence: "present"
  });
  writeCompatibilityRunArtifacts(targetRoot, run);
  fs.mkdirSync(splitRoot, { recursive: true });
  for (const procedureId of expectedProcedures) {
    fs.writeFileSync(
      path.join(splitRoot, `${procedureId}.md`),
      envelope.lens_documents[procedureId],
      { encoding: "utf8", flag: "wx" }
    );
  }
  return {
    targetRoot, projectRoot: roots.projectRoot, dryRun: false, run,
    runPath: current.runPath, projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath, state: "updated",
    observation: {
      ...observationBase, status: "success", attempt_id: attempt.attempt_id,
      artifact_path: toRepoRelative(targetRoot, outputPath),
      artifact_id: `sha256:${sha256Hex(fs.readFileSync(outputPath))}`,
      artifact_present: true, artifact_valid: true,
      summary: "Fresh planning review bundle produced and recorded three separate lens artifacts.",
      next_valid_action: "re-check operator status"
    }
  };
  } catch (error) {
    const failedAt = child.completedTime ?? nowIso();
    const errorCode = error instanceof Error && error.message.startsWith("review_startup_profile_mismatch:")
      ? "profile_mismatch"
      : !observedStartup && error instanceof Error && error.message.startsWith("review_startup_")
        ? "startup_observation_failed" : "artifact_invalid";
    persistPlanningBundleFailure(child.startTime, failedAt, errorCode, observedStartup);
    throw error;
  }
}

export async function launchRuntimeReview(cwd: string, options: LaunchReviewOptions): Promise<RuntimeReviewLaunchResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  assertReviewRecursionAllowed(targetRoot, roots.projectRoot, options.procedureId);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  if (current.run.lifecycle_status !== "active") {
    throw new Error(
      `Review launch requires an active run. Run ${current.run.run_id} is ${current.run.lifecycle_status}.`
    );
  }
  if (!isPrePhaseFVerificationCompatibility(current.run.phase_id)
    && ["implementation-review", "fix-pass-review"].includes(options.procedureId)
    && !hasPhaseFDurableImplementationBaseline(current.run)) {
    throw new Error(
      "IMPLEMENTATION_BASELINE_REQUIRED: review launch requires the exact durable implementation baseline binding."
    );
  }
  let fixPassLineage: {
    predecessorAttemptId: string;
    predecessorArtifactId: string;
    predecessorReviewedSourceHead: string;
    reviewedSourceHead: string;
    reviewedDiffHash: string;
  } | undefined;
  if (options.procedureId === "fix-pass-review") {
    const predecessors = current.run.review_results.filter((entry) =>
      reviewSourceMatchesProcedure(entry.source, "implementation-review")
      && entry.artifact_refs.length === 1);
    if (predecessors.length !== 1) {
      throw new Error(`FIX_PASS_PREDECESSOR_CARDINALITY_INVALID:${predecessors.length}`);
    }
    if (!current.run.run_instance_id) throw new Error("FIX_PASS_PREDECESSOR_RUN_INSTANCE_MISSING");
    const predecessor = predecessors[0];
    const descriptor = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id)
      .readProcedureArtifact(
        current.run.run_instance_id,
        "implementation-review",
        predecessor.artifact_refs[0].artifact_id
      );
    if (!descriptor || descriptor.content_hash !== predecessor.artifact_refs[0].artifact_id.slice("sha256:".length)) {
      throw new Error("FIX_PASS_PREDECESSOR_ARTIFACT_UNAVAILABLE");
    }
    const attempts = (current.run.review_routing_records ?? []).filter((entry) =>
      entry.record_kind === "review_invocation"
      && entry.payload.procedure_id === "implementation-review"
      && entry.payload.terminal_exit_code === 0
      && typeof entry.payload.attempt_id === "string");
    if (attempts.length !== 1) {
      throw new Error(`FIX_PASS_PREDECESSOR_ATTEMPT_CARDINALITY_INVALID:${attempts.length}`);
    }
    const predecessorInvocation = attempts[0].payload;
    const predecessorAttemptId = String(
      predecessorInvocation.canonical_attempt_id ?? predecessorInvocation.attempt_id ?? ""
    );
    const predecessorProvenance = JSON.parse(descriptor.provenance_json) as Record<string, unknown>;
    const exactBootstrapPredecessor = current.run.run_instance_id
        === "4609d822-5065-4420-a20a-820ed1eec0a9"
      && predecessorAttemptId === "af1ad890-469c-4b52-b3c5-3933235557e4"
      && descriptor.artifact_id
        === "sha256:1ba90f978edef75e2aa201843d63049db214e1d00882170b3a847930ebaf72c5";
    if (!predecessorAttemptId
      || (predecessorProvenance.review_attempt_id !== predecessorAttemptId
        && !exactBootstrapPredecessor)) {
      throw new Error("FIX_PASS_PREDECESSOR_ATTEMPT_ARTIFACT_JOIN_INVALID");
    }
    const requestPayloads = Array.isArray(predecessorInvocation.payload_refs)
      ? (predecessorInvocation.payload_refs as Array<Record<string, unknown>>).filter((entry) =>
          entry.kind === "review-request-packet"
          && entry.content_hash === predecessorInvocation.request_artifact_hash)
      : [];
    if (requestPayloads.length !== 1) {
      throw new Error("FIX_PASS_PREDECESSOR_REQUEST_IDENTITY_MISMATCH");
    }
    const predecessorBody = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id)
      .readProcedureArtifactBody({
        runInstanceId: current.run.run_instance_id,
        sourceRunId: current.run.run_id,
        procedureArtifactId: descriptor.artifact_id,
        procedureId: "implementation-review"
      }).body;
    const requestedHead = new RegExp(
      `${current.run.implementation_baseline_head}\\.\\.([a-f0-9]{40})`,
      "iu"
    ).exec(predecessorBody)?.[1];
    if (!requestedHead) throw new Error("FIX_PASS_PREDECESSOR_REVIEWED_HEAD_UNAVAILABLE");
    if (!predecessorBody.includes(requestedHead)
      || !predecessorBody.includes(`${current.run.implementation_baseline_head}..${requestedHead}`)) {
      throw new Error("FIX_PASS_PREDECESSOR_ARTIFACT_SOURCE_BINDING_MISMATCH");
    }
    const reviewedSourceHead = resolveExactCommit(targetRoot, "HEAD");
    const predecessorReviewedSourceHead = resolveExactCommit(targetRoot, requestedHead);
    if (runGitCommand(targetRoot, [
      "merge-base", "--is-ancestor", predecessorReviewedSourceHead, reviewedSourceHead
    ]).status !== 0) {
      throw new Error("FIX_PASS_DIFF_LINEAGE_INVALID");
    }
    const exactDiff = runGitCommand(targetRoot, [
      "diff", "--binary", predecessorReviewedSourceHead, reviewedSourceHead, "--"
    ]);
    if (exactDiff.status !== 0 || !exactDiff.stdout.trim()) {
      throw new Error("FIX_PASS_EXACT_DIFF_UNAVAILABLE");
    }
    if (Date.parse(descriptor.recorded_at) < Date.parse(String(attempts[0].payload.start_time ?? attempts[0].created_at))) {
      throw new Error("FIX_PASS_PREDECESSOR_ARTIFACT_ATTEMPT_ORDER_INVALID");
    }
    fixPassLineage = {
      predecessorAttemptId,
      predecessorArtifactId: descriptor.artifact_id,
      predecessorReviewedSourceHead,
      reviewedSourceHead,
      reviewedDiffHash: `sha256:${sha256Hex(exactDiff.stdout)}`
    };
  }
  const pendingSourceDecision = current.run.review_routing_records?.find((entry) => entry.record_kind === "routing_decision"
    && ["source_application_required", "rollback_source_update_required"].includes(entry.status)
    && !current.run.review_routing_records?.some((application) => application.record_kind === "routing_policy_application" && application.payload.decision_id === entry.record_id));
  if (pendingSourceDecision && options.procedureId !== "implementation-review") {
    throw new Error(`ROUTING_POLICY_SOURCE_APPLICATION_REQUIRED: decision ${pendingSourceDecision.record_id} blocks model launch until exact reviewed source application.`);
  }
  if (pendingSourceDecision && options.sourceApplicationDecisionId !== pendingSourceDecision.record_id) {
    throw new Error(`ROUTING_POLICY_SOURCE_APPLICATION_DECISION_REQUIRED: --source-application-decision must equal ${pendingSourceDecision.record_id}.`);
  }
  if (!pendingSourceDecision && options.sourceApplicationDecisionId) {
    throw new Error("ROUTING_POLICY_SOURCE_APPLICATION_DECISION_INVALID: no pending source-application decision matches the supplied ID.");
  }
  const registry = readSelfHostingProcedureRegistry(targetRoot);

  if (!registry) {
    throw new Error("Self-hosting procedure registry not found.");
  }

  const proceduresById = indexSelfHostingProceduresById(registry);
  const descriptor = requireReviewLaunchCapability(proceduresById, options.procedureId);
  const launchCapability = descriptor.automatic_launch_capability!;
  const timing = resolveLaunchTiming(targetRoot, [options.procedureId], options.timeoutSeconds, options.staleAfterSeconds);
  const profile: SelfHostingReviewLaunchProfile = {
    adapter_id: launchCapability.adapter_id,
    model: "policy-resolved",
    reasoning_effort: "policy-resolved",
    sandbox_mode: "read-only",
    output_mode: "file",
    timeout_seconds: timing.timeoutSeconds,
    stale_after_seconds: timing.staleAfterSeconds,
    termination_policy: timing.terminationPolicy
  };
  const evaluationMode = options.evaluationMode ?? "approved";
  const evaluationOnly = evaluationMode !== "approved";
  if (evaluationOnly) {
    for (const [value, flag] of [
      [options.approvedAttemptId, "--approved-attempt"],
      [options.evaluationCaseId, "--evaluation-case"],
      [options.candidatePolicyVersion, "--candidate-policy-version"],
      [options.candidateBindingVersion, "--candidate-binding-version"],
      [options.candidateProfileId, "--candidate-profile-id"],
      [options.candidateOutputPath, "--candidate-output"]
    ] as const) if (!value) throw new Error(`${flag} is required for ${evaluationMode} evaluation.`);
  }
  const timeoutSeconds = timing.timeoutSeconds;
  const staleAfterSeconds = timing.staleAfterSeconds;
  const requestPath = resolveLaunchRequestPath(targetRoot, options.requestPath);
  const outputPath = resolveLaunchOutputPath(
    targetRoot,
    current.run,
    evaluationOnly ? options.candidateOutputPath! : options.outputPath
  );
  const operatorRequestBody = fs.readFileSync(requestPath, "utf8");
  const canonicalPolicyFile = "skills/self-hosting/review-route-policy.json";
  const canonicalBindingFile = "skills/self-hosting/codex-reference-binding.json";
  const currentPolicyBlobHash = `sha256:${sha256Hex(fs.readFileSync(path.join(targetRoot, canonicalPolicyFile)))}`;
  const currentBindingBlobHash = `sha256:${sha256Hex(fs.readFileSync(path.join(targetRoot, canonicalBindingFile)))}`;
  const sourceApplicationCandidateId = pendingSourceDecision
    ? `sha256:${sha256Hex(canonicalJson({
        decision_id: pendingSourceDecision.record_id,
        evaluation_id: pendingSourceDecision.payload.evaluation_id,
        policy_file: canonicalPolicyFile,
        policy_blob_hash: currentPolicyBlobHash,
        binding_file: canonicalBindingFile,
        binding_blob_hash: currentBindingBlobHash
      }))}`
    : undefined;
  const sourceApplicationReviewContext = pendingSourceDecision && options.procedureId === "implementation-review"
    ? [
        "## Harness-enforced routing source-application review context",
        `decision_id: ${pendingSourceDecision.record_id}`,
        `decision_evaluation_id: ${String(pendingSourceDecision.payload.evaluation_id)}`,
        `candidate_policy_version: ${String(pendingSourceDecision.payload.policy_version)}`,
        `candidate_binding_version: ${String(pendingSourceDecision.payload.binding_version)}`,
        `previous_accepted_policy_version: ${String(pendingSourceDecision.payload.previous_accepted_policy_version)}`,
        `previous_accepted_binding_version: ${String(pendingSourceDecision.payload.previous_accepted_binding_version)}`,
        `previous_policy_blob_hash: ${String(pendingSourceDecision.payload.previous_policy_blob_hash)}`,
        `previous_binding_blob_hash: ${String(pendingSourceDecision.payload.previous_binding_blob_hash)}`,
        `candidate_policy_file: ${canonicalPolicyFile}`,
        `candidate_policy_blob_hash: ${currentPolicyBlobHash}`,
        `candidate_binding_file: ${canonicalBindingFile}`,
        `candidate_binding_blob_hash: ${currentBindingBlobHash}`,
        `candidate_source_identity: ${sourceApplicationCandidateId}`,
        "Review the exact owner decision, evaluation, canonical blob identities, and current policy/binding source diff directly."
      ].join("\n")
    : undefined;
  const operatorRequestMarkdown = sourceApplicationReviewContext
    ? `${operatorRequestBody.trim()}\n\n${sourceApplicationReviewContext}\n`
    : operatorRequestBody;
  const packet = buildReviewExecutionPacket(
    targetRoot,
    current.run,
    options.procedureId as "plan-review" | "implementation-review" | "fix-pass-review",
    operatorRequestMarkdown,
    toRepoRelative(targetRoot, requestPath),
    fixPassLineage?.predecessorReviewedSourceHead
  );
  const exactReviewDiffBase = options.procedureId === "implementation-review"
    ? current.run.implementation_baseline_head
    : options.procedureId === "fix-pass-review"
      ? fixPassLineage?.predecessorReviewedSourceHead
      : undefined;
  const exactReviewDiff = exactReviewDiffBase
    ? runGitCommand(targetRoot, ["diff", "--binary", exactReviewDiffBase, packet.core.source_snapshot, "--"])
    : undefined;
  if (exactReviewDiff && exactReviewDiff.status !== 0) throw new Error("REVIEW_EXACT_DIFF_UNAVAILABLE");
  const exactReviewDiffHash = exactReviewDiff
    ? `sha256:${sha256Hex(exactReviewDiff.stdout)}`
    : undefined;
  if (fixPassLineage && exactReviewDiffHash !== fixPassLineage.reviewedDiffHash) {
    throw new Error("FIX_PASS_EXACT_DIFF_IDENTITY_MISMATCH");
  }
  if (evaluationOnly) {
    const candidateSource = readCodexReferenceBinding(targetRoot);
    if (options.candidatePolicyVersion !== readReviewRoutePolicy(targetRoot).policy_version
      || candidateSource.binding_version !== options.candidateBindingVersion
      || !candidateSource.profiles.some((entry) => entry.status === "candidate" && entry.profile_id === options.candidateProfileId)) {
      throw new Error("REVIEW_CANDIDATE_VERSION_UNAVAILABLE: candidate policy, binding version, and profile must be checked in and exact.");
    }
    if (evaluationMode === "replay") {
      if (!options.replaySourceRunInstanceId || !options.replayPacketArtifactId) {
        throw new Error("--replay-source-run-instance and --replay-packet-artifact are required for replay.");
      }
      const eligibility = new ProjectMemoryDatabase(targetRoot, roots.projectRoot)
        .reviewReplayEligibility(options.replaySourceRunInstanceId, options.replayPacketArtifactId);
      if (!eligibility.eligible || eligibility.packet_record_id !== options.replayPacketArtifactId || eligibility.approved_attempt_id !== options.approvedAttemptId) {
        throw new Error(`REVIEW_REPLAY_SOURCE_INELIGIBLE: ${eligibility.reasons.join(",") || "packet identity mismatch"}`);
      }
    } else {
      const approvedAttempt = current.run.review_routing_records?.find((entry) =>
        entry.record_kind === "review_invocation"
        && entry.payload.attempt_id === options.approvedAttemptId
        && entry.payload.procedure_id === options.procedureId
        && entry.status === "success"
      );
      if (!approvedAttempt) throw new Error("REVIEW_EVALUATION_APPROVED_ATTEMPT_MISSING: exact accepted baseline attempt is unavailable.");
    }
    if (evaluationMode === "canary") {
      const authorization = current.run.review_routing_records?.find((entry) =>
        entry.record_kind === "routing_decision"
        && entry.record_id === options.canaryAuthorizationId
        && entry.status === "canary_authorized"
      );
      if (!authorization) throw new Error("REVIEW_CANARY_NOT_AUTHORIZED: exact owner decision is unavailable.");
      const invocationCount = current.run.review_routing_records?.filter((entry) => entry.record_kind === "review_invocation"
        && entry.payload.canary_authorization_id === authorization.record_id).length ?? 0;
      const maxInvocations = Number(authorization.payload.max_invocations ?? 0);
      const selector = authorization.payload.selector as {
        case_ids?: unknown;
        procedure_ids?: unknown;
        pass_kinds?: unknown;
        risk_classes?: unknown;
      } | undefined;
      if (invocationCount >= maxInvocations) throw new Error("REVIEW_CANARY_CLOSED: authorized invocation count is exhausted.");
      if (Array.isArray(selector?.case_ids) && !selector.case_ids.includes(options.evaluationCaseId)) {
        throw new Error("REVIEW_CANARY_SELECTOR_MISMATCH: evaluation case is outside the owner-approved selector.");
      }
      const priorImplementation = [...current.run.review_results].reverse().find((entry) =>
        reviewSourceMatchesProcedure(entry.source, options.procedureId)
      );
      const passKind = options.procedureId === "plan-review"
        ? (current.run.evidence.some((entry) => entry.kind === "procedure:plan-amend") ? "amendment_review" : "initial_full_review")
        : priorImplementation?.status === "FIX_REQUIRED" ? "fix_pass_review" : "implementation_review";
      const selectedProcedures = Array.isArray(selector?.procedure_ids) ? selector.procedure_ids : [];
      const selectedPassKinds = Array.isArray(selector?.pass_kinds) ? selector.pass_kinds : [];
      const selectedRiskClasses = Array.isArray(selector?.risk_classes) ? selector.risk_classes : [];
      if (!selectedProcedures.includes(options.procedureId)
        || !selectedPassKinds.includes(passKind)
        || packet.core.risk_classes.some((risk) => !selectedRiskClasses.includes(risk))) {
        throw new Error("REVIEW_CANARY_SELECTOR_MISMATCH: procedure, pass kind, or risk classes are outside the owner-approved selector.");
      }
    }
  }
  const requestMarkdown = packet.requestMarkdown;
  const requestHash = sha256Hex(requestMarkdown);
  const candidateBinding = evaluationOnly
    ? readCodexReferenceBinding(targetRoot).profiles.find((entry) => entry.status === "candidate"
      && entry.profile_id === options.candidateProfileId && entry.route_class === packet.route.route_class)
    : undefined;
  if (evaluationOnly && !candidateBinding) throw new Error("REVIEW_CANDIDATE_BINDING_UNAVAILABLE: checked-in candidate does not satisfy the route.");
  const pinnedSourceReviewProfile = pendingSourceDecision && options.procedureId === "implementation-review"
    ? (pendingSourceDecision.payload.previous_accepted_profiles as CodexBindingProfile[] | undefined)?.find((entry) => entry.route_class === packet.route.route_class)
    : undefined;
  if (pendingSourceDecision && options.procedureId === "implementation-review" && !pinnedSourceReviewProfile) {
    throw new Error("ROUTING_POLICY_SOURCE_REVIEW_BINDING_MISSING: pre-decision accepted review profile is unavailable.");
  }
  const effectiveProfile: SelfHostingReviewLaunchProfile = {
    ...profile,
    model: candidateBinding?.model ?? pinnedSourceReviewProfile?.model ?? packet.binding.model,
    reasoning_effort: candidateBinding?.reasoning_effort ?? pinnedSourceReviewProfile?.reasoning_effort ?? packet.binding.reasoning_effort
  };
  const reviewTier = getRuntimeOperatorStatus(targetRoot, {
    runId: current.run.run_id,
    dryRun: true
  }).operator.review_tier;
  const requiredSemanticReviews = deriveRequiredSemanticReviews(
    options.procedureId,
    reviewTier,
    packet.core.changed_surface_classes,
    packet.core.risk_classes
  );
  const procedureContract = readProcedureExecutionPolicy(targetRoot).procedures.find(
    (candidate) => candidate.procedure_id === options.procedureId
  );
  if (!procedureContract) {
    throw new Error(`Procedure execution policy is missing ${options.procedureId}.`);
  }

  if (path.resolve(requestPath) === path.resolve(outputPath)) {
    throw new Error("Review request and output paths must be different.");
  }

  const baseObservation = {
    procedure_id: options.procedureId as "plan-review" | "implementation-review",
    run_id: current.run.run_id,
    run_instance_id: current.run.run_instance_id,
    ...(current.run.run_instance_id ? { project_run_id: current.run.run_instance_id } : {}),
    adapter_id: profile.adapter_id,
    model: effectiveProfile.model,
    reasoning_effort: effectiveProfile.reasoning_effort,
    sandbox_mode: profile.sandbox_mode,
    output_mode: profile.output_mode,
    timeout_seconds: timeoutSeconds,
    stale_after_seconds: staleAfterSeconds,
    termination_policy: profile.termination_policy,
    request_path: toRepoRelative(targetRoot, requestPath),
    request_artifact_hash: `sha256:${requestHash}`,
    expected_output_path: toRepoRelative(targetRoot, outputPath),
    output_path: toRepoRelative(targetRoot, outputPath),
    route_decision_id: packet.route.route_decision_id,
    route_class: packet.route.route_class,
    pass_kind: options.procedureId === "plan-review"
      ? (current.run.evidence.some((entry) => entry.kind === "procedure:plan-amend") ? "amendment_review" : "initial_full_review")
      : ([...current.run.review_results].reverse().find((entry) => reviewSourceMatchesProcedure(entry.source, "implementation-review"))?.status === "FIX_REQUIRED"
          ? "fix_pass_review" : "implementation_review"),
    immutable_base: packet.core.immutable_base,
    risk_classes: packet.core.risk_classes,
    changed_surface_classes: packet.core.changed_surface_classes,
    required_semantic_reviews: requiredSemanticReviews,
    review_tier: reviewTier,
    deterministic_evidence_state: packet.overlay.missing_evidence.length === 0 ? "complete" : "incomplete",
    parallel_policy: "serial",
    budget_class: packet.route.route_class === "critical_independent" ? "critical" : "balanced",
    escalation_triggers: [...procedureContract.escalation_triggers],
    independence_mode: procedureContract.independence,
    routing_policy_version: packet.policyVersion,
    binding_version: pinnedSourceReviewProfile
      ? String(pendingSourceDecision?.payload.previous_accepted_binding_version)
      : packet.bindingVersion,
    binding_profile_id: candidateBinding?.profile_id ?? pinnedSourceReviewProfile?.profile_id ?? packet.binding.profile_id,
    context_core_id: packet.core.context_core_id,
    context_manifest_id: packet.manifest.context_manifest_id,
    delta_overlay_id: packet.overlay.delta_overlay_id,
    context_mode: "fresh_independent_delta",
    context_reuse: packet.contextReuse,
    context_reuse_reason: packet.contextReuse === "hit" ? "identical authoritative core identity" : "no prior identical core identity",
    request_bytes: Buffer.byteLength(requestMarkdown),
    core_bytes: packet.core.canonical_byte_count,
    delta_bytes: packet.overlay.canonical_byte_count
    ,evaluation_mode: evaluationMode
    ,...(options.approvedAttemptId ? { approved_attempt_id: options.approvedAttemptId } : {})
    ,...(options.evaluationCaseId ? { evaluation_case_id: options.evaluationCaseId } : {})
    ,...(options.candidatePolicyVersion ? { candidate_policy_version: options.candidatePolicyVersion } : {})
    ,...(options.candidateBindingVersion ? {
      candidate_binding_version: options.candidateBindingVersion,
      candidate_profile_id: options.candidateProfileId
    } : {})
    ,...(pendingSourceDecision ? {
      source_application_decision_id: pendingSourceDecision.record_id,
      source_application_evaluation_id: String(pendingSourceDecision.payload.evaluation_id),
      source_policy_file: canonicalPolicyFile,
      source_policy_blob_hash: currentPolicyBlobHash,
      source_binding_file: canonicalBindingFile,
      source_binding_blob_hash: currentBindingBlobHash,
      source_candidate_id: sourceApplicationCandidateId
    } : {})
    ,...(options.canaryAuthorizationId ? { canary_authorization_id: options.canaryAuthorizationId } : {})
    ,...(options.replaySourceRunInstanceId ? { replay_source_run_instance_id: options.replaySourceRunInstanceId } : {})
    ,...(options.replayPacketArtifactId ? { replay_packet_artifact_id: options.replayPacketArtifactId } : {})
    ,...(fixPassLineage ? {
      predecessor_review_attempt_id: fixPassLineage.predecessorAttemptId,
      predecessor_review_artifact_id: fixPassLineage.predecessorArtifactId,
      predecessor_reviewed_source_head: fixPassLineage.predecessorReviewedSourceHead,
      reviewed_source_head: fixPassLineage.reviewedSourceHead,
      reviewed_diff_hash: fixPassLineage.reviewedDiffHash
    } : {})
    ,...(!fixPassLineage && ["plan-review", "implementation-review", "fix-pass-review"].includes(options.procedureId) ? {
      reviewed_source_head: packet.core.source_snapshot,
      ...(exactReviewDiffHash ? { reviewed_diff_hash: exactReviewDiffHash } : {})
    } : {})
  } satisfies Omit<ReviewLaunchObservation, "status" | "summary" | "next_valid_action">;

  if (dryRun) {
    const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, current.run.run_id);
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      run: current.run,
      runPath: current.runPath,
      projectDbPath: paths.projectDbPath,
      stagingDbPath: paths.stagingDbPath,
      state: current.state,
      observation: {
        ...baseObservation,
        status: "dry_run",
        summary: "Review launch is valid; dry-run did not spawn a child process or write artifacts.",
        next_valid_action: "rerun without --dry-run to launch the supervised review"
      }
    };
  }

  const preExistingOutput = fs.existsSync(outputPath) && fs.statSync(outputPath).isFile()
    ? {
        mtimeMs: fs.statSync(outputPath).mtimeMs,
        hash: sha256Hex(fs.readFileSync(outputPath, "utf8"))
      }
    : undefined;
  const ownerToken = randomUUID();
  const attemptId = randomUUID();
  const claimId = `review-launch-${randomUUID()}`;
  const ownerTokenHash = `sha256:${sha256Hex(ownerToken)}`;
  const runInstanceId = current.run.run_instance_id;
  if (!runInstanceId) throw new Error("Review launch requires exact run instance identity.");
  const claim: ReviewLaunchClaim = {
    claim_id: claimId,
    attempt_id: attemptId,
    attempt_marker: buildReviewAttemptMarker({
      runInstanceId,
      procedureId: options.procedureId,
      attemptId,
      claimId,
      ownerTokenHash
    }),
    procedure_id: options.procedureId as "plan-review" | "implementation-review",
    owner_token_hash: ownerTokenHash,
    created_at: nowIso(),
    request_artifact_hash: `sha256:${requestHash}`,
    expected_output_path: toRepoRelative(targetRoot, outputPath),
    timeout_seconds: timeoutSeconds,
    stale_after_seconds: staleAfterSeconds,
    termination_policy: profile.termination_policy
  };
  const claimedRun = reserveReviewLaunchClaim(targetRoot, roots.projectRoot, current.run, claim);
  const startedAtMs = Date.now();
  let claimUpdateFailure: Error | undefined;
  const child = await runCodexCliReview(effectiveProfile, {
    targetRoot,
    requestMarkdown,
    outputPath,
    timeoutSeconds,
    staleAfterSeconds,
    childEnvironment: {
      ...process.env,
      [REVIEWER_ENV.role]: "independent_reviewer",
      [REVIEWER_ENV.runInstanceId]: runInstanceId,
      [REVIEWER_ENV.procedureId]: claim.procedure_id,
      [REVIEWER_ENV.attemptId]: claim.attempt_id,
      [REVIEWER_ENV.claimId]: claim.claim_id,
      [REVIEWER_ENV.marker]: claim.attempt_marker
    },
    onSpawn: (pid) => {
      try {
        updateReviewLaunchClaim(targetRoot, roots.projectRoot, claimedRun.run_id, claim, { pid });
      } catch (error) {
        claimUpdateFailure = error instanceof Error ? error : new Error(String(error));
      }
    },
    onProgressUnknown: (progressUnknownAt) => {
      try {
        updateReviewLaunchClaim(targetRoot, roots.projectRoot, claimedRun.run_id, claim, { progress_unknown_at: progressUnknownAt });
      } catch (error) {
        claimUpdateFailure = error instanceof Error ? error : new Error(String(error));
      }
    }
  });

  if (claimUpdateFailure) {
    throw new Error(`REVIEW_LAUNCH_OWNERSHIP_UNAVAILABLE: ${claimUpdateFailure.message}`);
  }

  let observation: ReviewLaunchObservation;
  let accepted: Parameters<typeof recordLaunchAttempt>[5] | undefined;
  const usage = parseCodexJsonlUsage(child.stdout);
  const latencyMs = Date.now() - startedAtMs;
  let rawStartup: RawReviewStartupObservationV1 | undefined;
  let startupFailure: string | undefined;
  if (current.run.phase_id === "23.9" && !child.timedOut && child.exitCode === 0) {
    try {
      rawStartup = extractRawStartupObservation(child.stdout);
      const observed = parseRawReviewStartupObservation(rawStartup);
      const expected = {
        provider: "openai", model: effectiveProfile.model,
        reasoning: effectiveProfile.reasoning_effort, sandbox: "read-only",
        approval_policy: "never", workdir: targetRoot
      };
      for (const [field, value] of Object.entries(expected)) {
        if (observed[field as keyof typeof observed] !== value) {
          throw new Error(`review_startup_profile_mismatch:${field}`);
        }
      }
    } catch (error) {
      startupFailure = error instanceof Error ? error.message : String(error);
    }
  }

  if (child.timedOut) {
    observation = {
      ...baseObservation,
      status: "timeout",
      attempt_id: claim.attempt_id,
      ...usage,
      latency_ms: latencyMs,
      exit_code: child.exitCode,
      terminal_exit_code: child.exitCode,
      terminal_signal: child.signal,
      pid: child.pid,
      launch_command: child.launchCommand,
      working_directory: targetRoot,
      start_time: child.startTime,
      last_output_time: child.lastOutputTime,
      ...(child.progressUnknownAt ? { progress_unknown_at: child.progressUnknownAt } : {}),
      artifact_present: fs.existsSync(outputPath),
      artifact_valid: false,
      failure_classification: "REVIEW_PROCESS_TIMEOUT",
      blocked_reason: "review process timed out",
      summary: `${options.procedureId} launch timed out.`,
      next_valid_action: "rerun launch-review after resolving the review process timeout",
      stdout_tail: boundedTail(child.stdout),
      stderr_tail: boundedTail(child.stderr)
    };
  } else if (child.exitCode !== 0) {
    observation = {
      ...baseObservation,
      status: "failed",
      attempt_id: claim.attempt_id,
      ...usage,
      latency_ms: latencyMs,
      exit_code: child.exitCode,
      terminal_exit_code: child.exitCode,
      terminal_signal: child.signal,
      pid: child.pid,
      launch_command: child.launchCommand,
      working_directory: targetRoot,
      start_time: child.startTime,
      last_output_time: child.lastOutputTime,
      ...(child.progressUnknownAt ? { progress_unknown_at: child.progressUnknownAt } : {}),
      artifact_present: fs.existsSync(outputPath),
      artifact_valid: false,
      failure_classification: classifyReviewProcessFailure(child.exitCode, child.stdout, child.stderr),
      blocked_reason: "review process exited without accepted artifact",
      summary: `${options.procedureId} review process failed before producing an accepted artifact.`,
      next_valid_action: "resolve the child review process failure and rerun launch-review",
      stdout_tail: boundedTail(child.stdout),
      stderr_tail: boundedTail(child.stderr)
    };
  } else {
    const outputAfter = fs.existsSync(outputPath) && fs.statSync(outputPath).isFile()
      ? {
          mtimeMs: fs.statSync(outputPath).mtimeMs,
          hash: sha256Hex(fs.readFileSync(outputPath, "utf8"))
        }
      : undefined;
    const staleOutput = preExistingOutput
      && outputAfter
      && outputAfter.hash === preExistingOutput.hash
      && outputAfter.mtimeMs < startedAtMs;
    const artifact = startupFailure
      ? { invalidReason: startupFailure }
      : staleOutput
      ? { invalidReason: "Review output file is stale." }
      : readValidLaunchArtifact(options.procedureId, outputPath, child.stdout);

    if (!artifact.markdown || !artifact.provenance) {
      const artifactPresent = !!outputAfter;
      observation = {
        ...baseObservation,
        status: "invalid_artifact",
        attempt_id: claim.attempt_id,
        ...usage,
        latency_ms: latencyMs,
        exit_code: child.exitCode,
        terminal_exit_code: child.exitCode,
        terminal_signal: child.signal,
        pid: child.pid,
        launch_command: child.launchCommand,
        working_directory: targetRoot,
        start_time: child.startTime,
        last_output_time: child.lastOutputTime,
        ...(child.progressUnknownAt ? { progress_unknown_at: child.progressUnknownAt } : {}),
        artifact_present: artifactPresent,
        artifact_valid: false,
        artifact_hash: outputAfter ? `sha256:${outputAfter.hash}` : undefined,
        failure_classification: staleOutput
          ? "REVIEW_ARTIFACT_STALE_FILE"
          : classifyInvalidReviewArtifact(artifact.invalidReason, artifactPresent),
        blocked_reason: artifact.invalidReason ?? "review artifact was missing or invalid",
        summary: artifact.invalidReason ?? `${options.procedureId} did not produce a valid review artifact.`,
        next_valid_action: "fix the review artifact or rerun launch-review with a valid output path",
        stdout_tail: boundedTail(child.stdout),
        stderr_tail: boundedTail(child.stderr)
      };
    } else {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, artifact.markdown, "utf8");
      const acceptedArtifact = evaluationOnly
        ? undefined
        : buildProcedureArtifactFromMarkdown(targetRoot, claimedRun, options.procedureId, outputPath, artifact.markdown);
      observation = {
        ...baseObservation,
        status: "success",
        attempt_id: claim.attempt_id,
        ...usage,
        latency_ms: latencyMs,
        exit_code: child.exitCode,
        terminal_exit_code: child.exitCode,
        terminal_signal: child.signal,
        pid: child.pid,
        launch_command: child.launchCommand,
        working_directory: targetRoot,
        start_time: child.startTime,
        last_output_time: child.lastOutputTime,
        ...(child.progressUnknownAt ? { progress_unknown_at: child.progressUnknownAt } : {}),
        ...(acceptedArtifact ? { artifact_path: acceptedArtifact.artifact.path, artifact_id: acceptedArtifact.artifact.artifact_id } : {}),
        artifact_present: true,
        artifact_valid: true,
        artifact_hash: `sha256:${sha256Hex(artifact.markdown)}`,
        provenance: artifact.provenance,
        provenance_source: artifact.provenance,
        failure_classification: evaluationOnly ? "REVIEW_EVALUATION_COMPLETED_NON_AUTHORITATIVE" : "REVIEW_COMPLETED_ARTIFACT_PRESENT",
        summary: evaluationOnly
          ? `${options.procedureId} ${evaluationMode} candidate produced a valid non-authoritative artifact.`
          : `${options.procedureId} review launch produced a valid artifact.`,
        next_valid_action: evaluationOnly ? "record the routing evaluation bundle" : "re-check operator status",
        stdout_tail: boundedTail(child.stdout),
        stderr_tail: boundedTail(child.stderr)
      };
      if (acceptedArtifact) {
        accepted = {
          artifact: acceptedArtifact.artifact,
          evidence: acceptedArtifact.evidence,
          markdown: artifact.markdown,
          absoluteArtifactPath: acceptedArtifact.absolutePath
        };
      }
    }
  }

  const run = recordLaunchAttempt(targetRoot, roots.projectRoot, claimedRun, observation, claim, accepted, {
    requestMarkdown,
    core: packet.core,
    manifest: packet.manifest,
    overlay: packet.overlay,
    policyVersion: packet.policyVersion,
    bindingVersion: packet.bindingVersion,
    rawStartup
  });
  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath: runFilePath(targetRoot, run.run_id),
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: "updated",
    observation
  };
}

function persistOperationalRecord(
  targetRoot: string,
  projectRoot: string,
  currentRun: Run,
  record: ReviewOperationalRecord
): { run: Run; recorded: boolean } {
  const existing = currentRun.review_routing_records?.find((entry) => entry.record_id === record.record_id);
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(record)) throw new Error(`Operational record identity conflict: ${record.record_id}`);
    return { run: currentRun, recorded: false };
  }
  const staging = new RunStagingDatabase(targetRoot, projectRoot, currentRun.run_id);
  const run = staging.mutateRun(currentRun.run_id, (latest) => {
    assertNoActiveReviewLaunchClaim(latest, `${record.record_kind} recording`);
    return withUpdatedAt({
      ...latest,
      review_routing_records: [...(latest.review_routing_records ?? []), record]
    }, record.created_at);
  }, { expectedRunInstanceId: currentRun.run_instance_id });
  writeCompatibilityRunArtifacts(targetRoot, run);
  return { run, recorded: true };
}

function operationalResult(
  roots: { targetRoot: string; projectRoot: string },
  current: ReturnType<typeof loadRunForMutation>,
  run: Run,
  record: ReviewOperationalRecord,
  recorded: boolean,
  dryRun: boolean
): RuntimeOperationalRecordResult {
  const paths = resolveMemoryDbPaths(roots.targetRoot, roots.projectRoot, run.run_id);
  return {
    targetRoot: roots.targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath: current.runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: dryRun ? "preview" : "updated",
    operationalRecord: record,
    recorded
  };
}

export function recordRuntimeRoutingEvaluation(cwd: string, options: RecordRoutingEvaluationOptions): RuntimeOperationalRecordResult {
  const roots = resolveHarnessRoots(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(roots.targetRoot, dryRun, options.runId);
  const filePath = path.resolve(roots.targetRoot, options.filePath);
  ensureInsideTargetRoot(roots.targetRoot, filePath);
  if (!fs.existsSync(filePath)) throw new Error(`Routing evaluation bundle not found: ${options.filePath}`);
  const bundle = validateRoutingEvaluationBundle(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
  const { evaluation_id: suppliedEvaluationId, ...evaluationIdentity } = bundle;
  if (routingEvaluationId(evaluationIdentity) !== suppliedEvaluationId) {
    throw new Error("ROUTING_EVALUATION_IDENTITY_MISMATCH: evaluation_id is not the canonical immutable bundle identity.");
  }
  if (!current.run.run_instance_id || bundle.evaluation_host_run_instance_id !== current.run.run_instance_id) {
    throw new Error("Routing evaluation host run instance does not match the active exact run.");
  }
  const candidateBinding = readCodexReferenceBinding(roots.targetRoot);
  if (candidateBinding.binding_version !== bundle.binding_version
    || !candidateBinding.profiles.some((entry) => entry.status === "candidate" && entry.profile_id === bundle.candidate_profile_id)) {
    throw new Error("ROUTING_EVALUATION_CANDIDATE_IDENTITY_INVALID: exact candidate binding version/profile is unavailable.");
  }
  const projectMemory = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);
  const sourceRun = bundle.source_run_instance_id === current.run.run_instance_id
    ? current.run
    : projectMemory.getRunByInstanceId(bundle.source_run_instance_id);
  const sourceEligibility = bundle.source_run_instance_id === current.run.run_instance_id
    ? undefined
    : projectMemory.reviewReplayEligibility(
        bundle.source_run_instance_id,
        bundle.source_packet_artifact_id
      );
  if (bundle.evaluation_mode === "replay" && (!sourceEligibility?.eligible || sourceEligibility.packet_record_id !== bundle.source_packet_artifact_id
    || sourceEligibility.approved_attempt_id !== bundle.source_approved_attempt_id)) {
    throw new Error(`ROUTING_EVALUATION_SOURCE_INVALID: ${sourceEligibility?.reasons.join(",") || "source packet/attempt mismatch"}`);
  }
  const sourceReviewBody = bundle.evaluation_mode === "replay" && sourceEligibility?.accepted_artifact_id
    ? new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot).readProcedureArtifactBody({
        projectRunId: bundle.source_run_instance_id,
        procedureArtifactId: sourceEligibility.accepted_artifact_id
      }).body
    : undefined;
  for (const entry of bundle.cases) {
    const baseline = sourceRun?.review_routing_records?.find((record) => record.record_kind === "review_invocation"
      && record.record_id === entry.baseline_observation_record_id && record.status === "success"
      && record.payload.attempt_id === entry.baseline_attempt_id && record.payload.evaluation_mode === "approved");
    if (!baseline) {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} baseline observation is unavailable.`);
    }
    const candidate = current.run.review_routing_records?.find((record) => record.record_kind === "review_invocation" && record.record_id === entry.candidate_observation_record_id);
    if (!candidate || candidate.status !== "success" || candidate.payload.attempt_id !== entry.candidate_attempt_id
      || candidate.payload.evaluation_case_id !== entry.case_id || candidate.payload.candidate_policy_version !== bundle.policy_version
      || candidate.payload.candidate_binding_version !== bundle.binding_version || candidate.payload.artifact_hash !== entry.candidate_output_hash
      || candidate.payload.context_core_id !== entry.context_core_id || candidate.payload.context_manifest_id !== entry.context_manifest_id
      || candidate.payload.delta_overlay_id !== entry.delta_overlay_id
      || candidate.payload.candidate_profile_id !== bundle.candidate_profile_id
      || candidate.payload.procedure_id !== entry.procedure_id
      || candidate.payload.pass_kind !== entry.pass_kind
      || canonicalJson(candidate.payload.risk_classes ?? []) !== canonicalJson(entry.risk_classes)
      || !(candidate.payload.payload_refs as Array<{kind?: string}> | undefined)?.some((ref) => ref.kind === "review-evaluation-output")) {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} candidate observation does not match retained Harness evidence.`);
    }
    const candidatePath = typeof candidate.payload.output_path === "string" ? path.resolve(roots.targetRoot, candidate.payload.output_path) : "";
    const candidateBody = candidatePath && fs.existsSync(candidatePath) ? fs.readFileSync(candidatePath, "utf8") : "";
    if (baseline.payload.procedure_id !== entry.procedure_id || baseline.payload.pass_kind !== entry.pass_kind
      || canonicalJson(baseline.payload.risk_classes ?? []) !== canonicalJson(entry.risk_classes)
      || baseline.payload.context_mode !== "fresh_independent_delta" || candidate.payload.context_mode !== "fresh_independent_delta") {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} procedure, pass, risk, or independence identity mismatch.`);
    }
    const baselinePath = baseline && typeof baseline.payload.output_path === "string" ? path.resolve(roots.targetRoot, baseline.payload.output_path) : "";
    const baselineBody = sourceReviewBody ?? (baselinePath && fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, "utf8") : "");
    if (!candidateBody || !baselineBody || `sha256:${sha256Hex(candidateBody)}` !== entry.candidate_output_hash
      || !candidateBody.includes(entry.candidate_verdict)
      || entry.actual_critical_findings.some((finding) => !candidateBody.includes(finding))
      || !baselineBody.includes(entry.baseline_verdict)
      || entry.expected_critical_findings.some((finding) => !baselineBody.includes(finding))) {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} findings or verdicts do not match retained output artifacts.`);
    }
    if (bundle.evaluation_mode === "replay" && entry.baseline_attempt_id !== bundle.source_approved_attempt_id) {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} baseline attempt does not match the retained source packet.`);
    }
    const baselineTokens = typeof baseline.payload.input_tokens === "number" && typeof baseline.payload.output_tokens === "number"
      ? baseline.payload.input_tokens + baseline.payload.output_tokens : undefined;
    const candidateTokens = typeof candidate.payload.input_tokens === "number" && typeof candidate.payload.output_tokens === "number"
      ? candidate.payload.input_tokens + candidate.payload.output_tokens : undefined;
    if ((entry.baseline_total_tokens !== undefined && entry.baseline_total_tokens !== baselineTokens)
      || (entry.candidate_total_tokens !== undefined && entry.candidate_total_tokens !== candidateTokens)) {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} usage totals do not match retained observations.`);
    }
    const baselineFixPasses = sourceRun?.review_results.filter((result) => reviewSourceMatchesProcedure(result.source, "fix-pass-review")).length ?? 0;
    if (entry.baseline_fix_passes !== baselineFixPasses || entry.candidate_fix_passes !== 0
      || !entry.legal_lifecycle || !entry.independence_preserved || !entry.output_valid || !entry.evidence_valid) {
      throw new Error(`ROUTING_EVALUATION_CASE_UNVERIFIED: ${entry.case_id} contains an unresolved lifecycle, independence, output, or evidence result.`);
    }
  }
  if (bundle.evaluation_mode === "canary") {
    const authorization = current.run.review_routing_records?.find((record) => record.record_kind === "routing_decision"
      && record.record_id === bundle.canary_authorization_id && record.status === "canary_authorized");
    const retainedCanaries = current.run.review_routing_records?.filter((record) => record.record_kind === "review_invocation"
      && record.status === "success" && record.payload.canary_authorization_id === bundle.canary_authorization_id) ?? [];
    if (!authorization || retainedCanaries.length !== bundle.canary_invocation_count
      || retainedCanaries.length !== bundle.cases.length || retainedCanaries.length > Number(authorization.payload.max_invocations ?? 0)) {
      throw new Error("ROUTING_EVALUATION_CANARY_CLOSURE_INVALID: retained invocations do not close the exact authorization.");
    }
  }
  const record: ReviewOperationalRecord = {
    record_kind: "routing_evaluation",
    record_id: bundle.evaluation_id,
    created_at: bundle.created_at,
    status: "recorded",
    summary: `${bundle.evaluation_mode} routing evaluation`,
    payload: bundle as unknown as Record<string, unknown>
  };
  if (dryRun) return operationalResult(roots, current, current.run, record, false, true);
  const persisted = persistOperationalRecord(roots.targetRoot, roots.projectRoot, current.run, record);
  return operationalResult(roots, current, persisted.run, record, persisted.recorded, false);
}

export function decideRuntimeRoutingPolicy(cwd: string, options: DecideRoutingPolicyOptions): RuntimeOperationalRecordResult {
  const roots = resolveHarnessRoots(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(roots.targetRoot, dryRun, options.runId);
  if (!current.run.run_instance_id) throw new Error("Routing policy decision requires exact run identity.");
  const evaluationRecord = current.run.review_routing_records?.find((entry) =>
    entry.record_kind === "routing_evaluation" && entry.record_id === options.evaluationId
  );
  if (!evaluationRecord) throw new Error(`Routing evaluation record not found: ${options.evaluationId}`);
  const bundle = validateRoutingEvaluationBundle(evaluationRecord.payload);
  const gates = evaluatePromotionGates(bundle);
  const currentRoutePolicy = readReviewRoutePolicy(roots.targetRoot);
  const currentBinding = readCodexReferenceBinding(roots.targetRoot);
  if (options.decision === "rollback") {
    if (!currentRoutePolicy.previous_accepted_policy_version || !currentBinding.previous_accepted_binding_version
      || options.policyVersion !== currentRoutePolicy.previous_accepted_policy_version
      || options.bindingVersion !== currentBinding.previous_accepted_binding_version) {
      throw new Error("ROUTING_ROLLBACK_REJECTED: rollback must target the exact checked-in previous accepted versions.");
    }
  } else if (options.policyVersion !== bundle.policy_version || options.bindingVersion !== bundle.binding_version) {
    throw new Error("ROUTING_DECISION_VERSION_MISMATCH: owner decision must bind the exact evaluation candidate versions.");
  }
  if (options.decision === "promote" && !gates.accepted) {
    throw new Error(`ROUTING_PROMOTION_REJECTED: ${gates.rejection_reasons.join(", ")}`);
  }
  if (options.decision === "promote" && bundle.evaluation_mode !== "canary") {
    throw new Error("ROUTING_PROMOTION_REJECTED: promotion requires a complete post-canary evaluation bundle.");
  }
  if (options.decision === "authorize_canary" && (!options.selectorPath || !options.maxInvocations || options.maxInvocations < 1 || options.maxInvocations > 3)) {
    throw new Error("--selector and --max-invocations between 1 and 3 are required for canary authorization.");
  }
  const selector = options.selectorPath
    ? JSON.parse(fs.readFileSync(path.resolve(roots.targetRoot, options.selectorPath), "utf8")) as Record<string, unknown>
    : undefined;
  if (options.decision === "authorize_canary") {
    const selected = selector as { case_ids?: unknown; procedure_ids?: unknown; pass_kinds?: unknown; risk_classes?: unknown };
    for (const [field, value] of [
      ["case_ids", selected.case_ids], ["procedure_ids", selected.procedure_ids],
      ["pass_kinds", selected.pass_kinds], ["risk_classes", selected.risk_classes]
    ] as const) {
      if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
        throw new Error(`ROUTING_CANARY_SELECTOR_INVALID: ${field} must be a non-empty string array.`);
      }
    }
    const caseIds = new Set(bundle.cases.map((entry) => entry.case_id));
    if ((selected.case_ids as string[]).some((entry) => !caseIds.has(entry))) {
      throw new Error("ROUTING_CANARY_SELECTOR_INVALID: case_ids must come from the exact evaluation bundle.");
    }
    const selectedCases = bundle.cases.filter((entry) => (selected.case_ids as string[]).includes(entry.case_id));
    if (selectedCases.some((entry) => !(selected.procedure_ids as string[]).includes(entry.procedure_id)
      || !(selected.pass_kinds as string[]).includes(entry.pass_kind)
      || entry.risk_classes.some((risk) => !(selected.risk_classes as string[]).includes(risk)))) {
      throw new Error("ROUTING_CANARY_SELECTOR_INVALID: procedure, pass, and risk selectors must cover every selected case.");
    }
  }
  const createdAt = nowIso();
  const state = options.decision === "authorize_canary" ? "canary_authorized"
    : options.decision === "promote" ? "source_application_required"
      : options.decision === "rollback" ? "rollback_source_update_required" : "rejected";
  const payload: Record<string, unknown> = {
    schema_version: 2,
    producer_command: "node bin/ch run decide-routing-policy",
    run_instance_id: current.run.run_instance_id,
    evaluation_id: options.evaluationId,
    decision: options.decision,
    policy_version: options.policyVersion,
    binding_version: options.bindingVersion,
    approver: options.approver,
    reason: options.reason,
    created_at: createdAt,
    state,
    promotion_gates: gates,
    evaluation_content_hash: `sha256:${sha256Hex(canonicalJson(bundle))}`,
    previous_accepted_policy_version: readReviewRoutePolicy(roots.targetRoot).accepted_policy_version,
    previous_accepted_binding_version: readCodexReferenceBinding(roots.targetRoot).accepted_binding_version,
    previous_policy_blob_hash: `sha256:${sha256Hex(fs.readFileSync(path.join(roots.targetRoot, "skills/self-hosting/review-route-policy.json")))}`,
    previous_binding_blob_hash: `sha256:${sha256Hex(fs.readFileSync(path.join(roots.targetRoot, "skills/self-hosting/codex-reference-binding.json")))}`,
    previous_accepted_profiles: currentBinding.profiles.filter((entry) => entry.status === "accepted"),
    ...(selector ? { selector } : {}),
    ...(options.maxInvocations ? { max_invocations: options.maxInvocations } : {})
  };
  const recordId = `routing-decision-${sha256Hex(canonicalJson(payload))}`;
  payload.decision_id = recordId;
  const record: ReviewOperationalRecord = {
    record_kind: "routing_decision",
    record_id: recordId,
    created_at: createdAt,
    status: state,
    summary: `${options.decision} routing policy ${options.policyVersion}/${options.bindingVersion}`,
    payload
  };
  if (dryRun) return operationalResult(roots, current, current.run, record, false, true);
  const persisted = persistOperationalRecord(roots.targetRoot, roots.projectRoot, current.run, record);
  return operationalResult(roots, current, persisted.run, record, persisted.recorded, false);
}

export function recordRuntimeRoutingPolicySourceApplication(
  cwd: string,
  options: RecordRoutingPolicySourceApplicationOptions
): RuntimeOperationalRecordResult {
  const roots = resolveHarnessRoots(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(roots.targetRoot, dryRun, options.runId);
  const decision = current.run.review_routing_records?.find((entry) =>
    entry.record_kind === "routing_decision" && entry.record_id === options.decisionId
  );
  if (!decision || !["source_application_required", "rollback_source_update_required"].includes(decision.status)) {
    throw new Error("POLICY_SOURCE_APPLICATION_NOT_AUTHORIZED: exact promotion or rollback decision is missing.");
  }
  const gitHead = runGitCommand(roots.targetRoot, ["rev-parse", "HEAD"]);
  if (gitHead.status !== 0 || gitHead.stdout.trim() !== options.commitSha) throw new Error("Policy source application commit does not match HEAD.");
  const policyPath = path.resolve(roots.targetRoot, options.policyFile);
  const bindingPath = path.resolve(roots.targetRoot, options.bindingFile);
  ensureInsideTargetRoot(roots.targetRoot, policyPath);
  ensureInsideTargetRoot(roots.targetRoot, bindingPath);
  if (toRepoRelative(roots.targetRoot, policyPath) !== "skills/self-hosting/review-route-policy.json"
    || toRepoRelative(roots.targetRoot, bindingPath) !== "skills/self-hosting/codex-reference-binding.json") {
    throw new Error("Policy source application must target the canonical checked-in route policy and Codex binding files.");
  }
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8")) as { policy_version?: string };
  const binding = JSON.parse(fs.readFileSync(bindingPath, "utf8")) as { binding_version?: string };
  if (policy.policy_version !== decision.payload.policy_version || binding.binding_version !== decision.payload.binding_version) {
    throw new Error("Policy source application versions do not match the owner decision.");
  }
  const review = current.run.artifacts.find((entry) => entry.artifact_id === options.implementationReviewArtifactId);
  const reviewResult = current.run.review_results.find((entry) =>
    entry.status === "PASS" && reviewSourceMatchesProcedure(entry.source, "implementation-review") && entry.created_at > decision.created_at
      && entry.artifact_refs.some((artifact) => artifact.artifact_id === options.implementationReviewArtifactId)
  );
  const reviewInvocation = current.run.review_routing_records?.find((entry) => entry.record_kind === "review_invocation"
    && entry.status === "success" && entry.payload.artifact_id === options.implementationReviewArtifactId
    && entry.payload.source_application_decision_id === decision.record_id
    && entry.payload.source_application_evaluation_id === decision.payload.evaluation_id
    && entry.payload.routing_policy_version === decision.payload.policy_version
    && entry.payload.binding_version === decision.payload.previous_accepted_binding_version
    && entry.payload.context_mode === "fresh_independent_delta");
  if (!review || !reviewResult || !reviewInvocation) throw new Error("Policy source application requires a post-decision independent PASS review pinned to the pre-decision accepted binding.");
  const committedPolicy = runGitCommand(roots.targetRoot, ["show", `${options.commitSha}:${options.policyFile}`]);
  const committedBinding = runGitCommand(roots.targetRoot, ["show", `${options.commitSha}:${options.bindingFile}`]);
  if (committedPolicy.status !== 0 || committedBinding.status !== 0
    || `sha256:${sha256Hex(committedPolicy.stdout)}` !== `sha256:${sha256Hex(fs.readFileSync(policyPath))}`
    || `sha256:${sha256Hex(committedBinding.stdout)}` !== `sha256:${sha256Hex(fs.readFileSync(bindingPath))}`) {
    throw new Error("Policy source application files do not match the exact committed blobs.");
  }
  const committedPolicyHash = `sha256:${sha256Hex(committedPolicy.stdout)}`;
  const committedBindingHash = `sha256:${sha256Hex(committedBinding.stdout)}`;
  const reviewedCandidateId = `sha256:${sha256Hex(canonicalJson({
    decision_id: decision.record_id,
    evaluation_id: decision.payload.evaluation_id,
    policy_file: options.policyFile,
    policy_blob_hash: committedPolicyHash,
    binding_file: options.bindingFile,
    binding_blob_hash: committedBindingHash
  }))}`;
  if (reviewInvocation.payload.source_policy_file !== options.policyFile
    || reviewInvocation.payload.source_policy_blob_hash !== committedPolicyHash
    || reviewInvocation.payload.source_binding_file !== options.bindingFile
    || reviewInvocation.payload.source_binding_blob_hash !== committedBindingHash
    || reviewInvocation.payload.source_candidate_id !== reviewedCandidateId) {
    throw new Error("ROUTING_POLICY_SOURCE_REVIEW_IDENTITY_MISMATCH: the accepted review did not inspect the exact canonical blobs committed by the owner decision.");
  }
  const createdAt = nowIso();
  const payload = {
    decision_id: options.decisionId,
    source_commit_sha: options.commitSha,
    policy_file: options.policyFile,
    policy_blob_hash: `sha256:${sha256Hex(fs.readFileSync(policyPath))}`,
    binding_file: options.bindingFile,
    binding_blob_hash: `sha256:${sha256Hex(fs.readFileSync(bindingPath))}`,
    policy_version: policy.policy_version,
    binding_version: binding.binding_version,
    implementation_review_artifact_id: options.implementationReviewArtifactId,
    run_instance_id: current.run.run_instance_id,
    applied_at: createdAt
  };
  const record: ReviewOperationalRecord = {
    record_kind: "routing_policy_application",
    record_id: `routing-policy-application-${sha256Hex(canonicalJson(payload))}`,
    created_at: createdAt,
    status: "applied",
    summary: `Applied routing policy source decision ${options.decisionId}`,
    payload
  };
  if (dryRun) return operationalResult(roots, current, current.run, record, false, true);
  const persisted = persistOperationalRecord(roots.targetRoot, roots.projectRoot, current.run, record);
  return operationalResult(roots, current, persisted.run, record, persisted.recorded, false);
}

export function cleanupRuntimePreparedSuccessor(cwd: string, options: CleanupPreparedSuccessorOptions): RuntimeOperationalRecordResult {
  const roots = resolveHarnessRoots(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(roots.targetRoot, dryRun, options.runId);
  const evidencePath = path.resolve(roots.targetRoot, options.filePath);
  ensureInsideTargetRoot(roots.targetRoot, evidencePath);
  const evidence = readPreparedSuccessorCleanupEvidence(evidencePath);
  if (evidence.decision_id !== options.decisionId) throw new Error("Prepared-successor cleanup decision identity mismatch.");
  const { record: nextTaskDecision } = readNextTaskDecision(current.run, options.decisionId);
  if (nextTaskDecision.base_commit_sha !== evidence.immutable_base) throw new Error("HANDOFF_CLEANUP_BLOCKED: evidence base does not match the predecessor decision.");
  if (fs.existsSync(evidence.cwd) || worktreePathExistsInGit(roots.targetRoot, evidence.cwd)) throw new Error("HANDOFF_CLEANUP_BLOCKED: successor worktree still exists.");
  if (new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot).hasRunForSuccessorIdentity(evidence.cwd, evidence.branch)) {
    throw new Error("HANDOFF_CLEANUP_BLOCKED: a successor run already exists for this cwd or branch.");
  }
  const receipt = buildPreparedSuccessorCleanupReceipt(roots.projectRoot, evidence);
  const existing = current.run.review_routing_records?.find((entry) => entry.record_kind === "prepared_successor_cleanup" && entry.record_id === receipt.receipt_id);
  if (existing?.status === "complete") return operationalResult(roots, current, current.run, existing, false, dryRun);
  const taskStatePath = path.join(getTaskDirectory(roots.projectRoot, evidence.task_state_id), "state.json");
  const archivedPath = path.resolve(roots.projectRoot, receipt.archived_task_state_path);
  ensureInsideTargetRoot(roots.projectRoot, archivedPath);
  const taskList = listTasks(roots.projectRoot);
  if (taskList.warnings.length > 0) throw new Error(`HANDOFF_CLEANUP_BLOCKED: unreadable TaskState records: ${taskList.warnings.join("; ")}`);
  const owners = taskList.tasks.filter((task) => task.task_id === evidence.task_state_id && task.branch === evidence.branch
    && task.worktree === evidence.cwd && task.base_commit_sha === evidence.immutable_base);
  if (!existing && owners.length !== 1) throw new Error("HANDOFF_CLEANUP_BLOCKED: exactly one matching TaskState owner is required.");
  const expectedTaskStateRef = path.relative(roots.projectRoot, taskStatePath).replace(/\\/gu, "/");
  const stateProofPath = fs.existsSync(taskStatePath) ? taskStatePath : archivedPath;
  if (evidence.task_state_path !== expectedTaskStateRef || !fs.existsSync(stateProofPath)
    || `sha256:${sha256Hex(fs.readFileSync(stateProofPath))}` !== evidence.task_state_hash) {
    throw new Error("HANDOFF_CLEANUP_BLOCKED: TaskState path or content hash does not match installed state.");
  }
  const originalBranchHead = runGitCommand(roots.targetRoot, ["rev-parse", `refs/heads/${evidence.branch}`]);
  const recoveryBranchHead = runGitCommand(roots.targetRoot, ["rev-parse", `refs/heads/${receipt.recovery_branch}`]);
  if ((originalBranchHead.status !== 0 || originalBranchHead.stdout.trim() !== evidence.immutable_base)
    && (recoveryBranchHead.status !== 0 || recoveryBranchHead.stdout.trim() !== evidence.immutable_base)) {
    throw new Error("HANDOFF_CLEANUP_BLOCKED: dormant branch does not equal the immutable base.");
  }
  const journal: ReviewOperationalRecord = {
    record_kind: "prepared_successor_cleanup",
    record_id: receipt.receipt_id,
    created_at: nowIso(),
    status: dryRun ? "prepared" : "journaled",
    summary: `Prepared recoverable cleanup for ${evidence.branch}`,
    payload: receipt as unknown as Record<string, unknown>
  };
  if (dryRun) return operationalResult(roots, current, current.run, journal, false, true);
  const journaled = existing ? { run: current.run } : persistOperationalRecord(roots.targetRoot, roots.projectRoot, current.run, journal);
  const completedSteps = new Set(Array.isArray(existing?.payload.completed_steps) ? existing.payload.completed_steps.filter((entry): entry is string => typeof entry === "string") : ["journaled"]);
  const updateJournal = (status: string, summary: string): Run => {
    const update: ReviewOperationalRecord = { ...journal, status, summary, payload: { ...receipt, status, completed_steps: [...completedSteps] } };
    const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, current.run.run_id);
    const updated = staging.mutateRun(current.run.run_id, (latest) => ({ ...latest, updated_at: nowIso(), review_routing_records: (latest.review_routing_records ?? []).map((entry) => entry.record_id === update.record_id ? update : entry) }), { expectedRunInstanceId: current.run.run_instance_id });
    writeCompatibilityRunArtifacts(roots.targetRoot, updated);
    return updated;
  };
  let latestRun = journaled.run;
  try {
    if (!completedSteps.has("branch_quarantined")) {
      if (originalBranchHead.status === 0) {
        const renameBranch = runGitCommand(roots.targetRoot, ["branch", "-m", evidence.branch, receipt.recovery_branch]);
        if (renameBranch.status !== 0) throw new Error(renameBranch.stderr.trim() || "branch quarantine failed");
      }
      completedSteps.add("branch_quarantined");
      latestRun = updateJournal("journaled", `Branch quarantined for ${evidence.branch}`);
    }
    if (!completedSteps.has("task_state_quarantined")) {
      if (!fs.existsSync(taskStatePath) && !fs.existsSync(archivedPath)) throw new Error("TaskState disappeared after cleanup journal creation");
      if (fs.existsSync(taskStatePath)) {
        fs.mkdirSync(path.dirname(archivedPath), { recursive: true });
        fs.renameSync(taskStatePath, archivedPath);
      }
      if (`sha256:${sha256Hex(fs.readFileSync(archivedPath))}` !== evidence.task_state_hash) throw new Error("archived TaskState hash mismatch");
      completedSteps.add("task_state_quarantined");
      latestRun = updateJournal("journaled", `TaskState quarantined for ${evidence.branch}`);
    }
  } catch (error) {
    updateJournal("partial", `HANDOFF_CLEANUP_PARTIAL: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`HANDOFF_CLEANUP_PARTIAL: ${error instanceof Error ? error.message : String(error)}`);
  }
  const complete: ReviewOperationalRecord = {
    ...journal,
    status: "complete",
    summary: `Recoverably quarantined prepared successor ${evidence.branch}`,
    payload: {
      ...receipt,
      status: "complete",
      completed_steps: ["journaled", "branch_quarantined", "task_state_quarantined"],
      next_action: "create a fresh Desktop successor from the recorded immutable base if recovery is required"
    }
  };
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, current.run.run_id);
  const run = staging.mutateRun(current.run.run_id, (latest) => ({
    ...latest,
    updated_at: complete.created_at,
    review_routing_records: (latest.review_routing_records ?? []).map((entry) => entry.record_id === complete.record_id ? complete : entry)
  }), { expectedRunInstanceId: latestRun.run_instance_id });
  writeCompatibilityRunArtifacts(roots.targetRoot, run);
  return operationalResult(roots, current, run, complete, true, false);
}

type RuntimeReferenceKind =
  "run" | "source" | "branch" | "file" | "artifact" | "evidence" | "verification"
  | "command" | "review" | "approval" | "decision" | "delivery" | "routing";

function resolveRuntimeReference(targetRoot: string, run: Run, reference: string): RuntimeReferenceKind | undefined {
  if (reference === `run:${run.run_instance_id}` || reference === `source:${run.source_snapshot}`
    || reference === `branch:${run.repository.branch}`) {
    return reference.startsWith("run:") ? "run" : reference.startsWith("source:") ? "source" : "branch";
  }
  if (reference.startsWith("file:")) {
    const match = /^file:([^#]+)#(sha256:[a-f0-9]{64})$/u.exec(reference);
    if (!match) return undefined;
    const absolute = path.resolve(targetRoot, match[1]);
    ensureInsideTargetRoot(targetRoot, absolute);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile()
      && `sha256:${sha256Hex(fs.readFileSync(absolute))}` === match[2]
      ? "file"
      : undefined;
  }
  const separator = reference.indexOf(":");
  if (separator <= 0) return undefined;
  const kind = reference.slice(0, separator) as RuntimeReferenceKind;
  const id = reference.slice(separator + 1);
  switch (kind) {
    case "artifact": return run.artifacts.some((entry) => entry.artifact_id === id) ? kind : undefined;
    case "evidence": return run.evidence.some((entry) => entry.evidence_id === id) ? kind : undefined;
    case "verification": return run.verification_results.some((entry) => entry.verification_result_id === id) ? kind : undefined;
    case "command": return run.verification_results.some((entry) => entry.command_results.some((command) => command.command_result_id === id)) ? kind : undefined;
    case "review": return run.review_results.some((entry) => entry.review_result_id === id) ? kind : undefined;
    case "approval": return run.approvals.some((entry) => entry.approval_id === id) ? kind : undefined;
    case "decision": return run.decisions.some((entry) => entry.decision_id === id) ? kind : undefined;
    case "delivery": return run.delivery_facts.some((entry) => entry.delivery_fact_id === id) ? kind : undefined;
    case "routing": return (run.review_routing_records ?? []).some((entry) => entry.record_id === id) ? kind : undefined;
    default: return undefined;
  }
}

const PRECHECK_REFERENCE_KINDS: Readonly<Record<string, readonly RuntimeReferenceKind[]>> = {
  task_contract_identity: ["file"],
  procedure_contract_identity: ["file"],
  required_reading: ["file", "artifact", "evidence"],
  required_command_inventory: ["verification"],
  command_results: ["verification", "command"],
  snapshot_identity: ["source", "verification"],
  commit_identity: ["source"],
  branch_identity: ["branch"],
  remote_fact_inventory: ["delivery"],
  verification_pass: ["verification"],
  implementation_review_pass: ["review"],
  delivery_facts: ["delivery"],
  next_task_decision: ["decision"],
  changed_docs_inventory: ["file", "artifact"],
  canonical_source_refs: ["file"],
  link_and_path_checks: ["verification", "command"],
  runtime_state_identity: ["run"],
  claim_inventory: ["run", "routing"],
  artifact_inventory: ["artifact"],
  lifecycle_projection: ["run"]
};

const EVIDENCE_REFERENCE_KINDS: Readonly<Record<string, readonly RuntimeReferenceKind[]>> = {
  acceptance_refs: ["file", "artifact"],
  approved_plan_ref: ["artifact"],
  architecture_refs: ["file", "artifact", "evidence"],
  artifact_refs: ["artifact"],
  canonical_source_refs: ["file"],
  command_result_refs: ["command", "verification"],
  commit_ref: ["source"],
  decision_ref: ["decision"],
  delivery_refs: ["delivery"],
  delta_ref: ["artifact", "routing"],
  diff_ref: ["artifact", "file"],
  diff_refs: ["artifact", "file"],
  docs_diff_ref: ["artifact", "file"],
  exact_plan_ref: ["artifact"],
  exact_run_identity: ["run"],
  finding_refs: ["review", "artifact"],
  intake_artifact_ref: ["artifact", "evidence"],
  operator_status_ref: ["run"],
  plan_ref: ["artifact"],
  prior_plan_ref: ["artifact"],
  prior_review_ref: ["review"],
  procedure_contract_ref: ["file"],
  remote_fact_refs: ["delivery"],
  review_ref: ["review"],
  review_tier_lenses: ["artifact", "evidence"],
  roadmap_refs: ["file"],
  run_state_ref: ["run"],
  schema_refs: ["file"],
  snapshot_ref: ["verification", "source"],
  source_identity: ["source"],
  source_refs: ["file", "artifact", "evidence"],
  storage_trace_refs: ["artifact", "evidence", "routing"],
  task_contract_ref: ["file"],
  task_contract_refs: ["file"],
  task_pointer_ref: ["file"],
  task_ref: ["file"],
  test_refs: ["command", "verification", "artifact"],
  verification_ref: ["verification"],
  verification_refs: ["verification", "command"]
};

function evidenceRoleAcceptsReference(role: string, kind: RuntimeReferenceKind): boolean {
  return EVIDENCE_REFERENCE_KINDS[role]?.includes(kind) ?? false;
}

function independenceReferenceQualifies(targetRoot: string, run: Run, procedureId: string, reference: string): boolean {
  const kind = resolveRuntimeReference(targetRoot, run, reference);
  const id = reference.slice(reference.indexOf(":") + 1);
  if (kind === "verification") {
    const verification = run.verification_results.find((entry) => entry.verification_result_id === id);
    return ["verification-review", "docs-consistency-review", "harness-audit"].includes(procedureId)
      && verificationSatisfiesRequiredCommandInventory(targetRoot, run, verification);
  }
  if (kind === "review") {
    const review = run.review_results.find((entry) => entry.review_result_id === id);
    return procedureId === "phase-closeout-review"
      && Boolean(review?.status === "PASS" && reviewSourceMatchesProcedure(review.source, "implementation-review"));
  }
  if (kind === "delivery") {
    return procedureId === "delivery-facts-review"
      && run.delivery_facts.some((entry) => entry.delivery_fact_id === id && entry.run_id === run.run_id && entry.status !== "unknown");
  }
  return false;
}

function approvalReferenceQualifies(targetRoot: string, run: Run, reference: string): boolean {
  if (!reference.startsWith("approval:")) return false;
  const approvalId = reference.slice("approval:".length);
  try {
    return resolveExactApprovedPlanAuthority(targetRoot, run)?.approval.approval_id === approvalId;
  } catch {
    return false;
  }
}

function deterministicOutputReferenceQualifies(
  targetRoot: string,
  run: Run,
  procedureId: string,
  outputRole: string,
  reference: string
): boolean {
  if (!reference.startsWith("artifact:")) return false;
  const artifactId = reference.slice("artifact:".length);
  const artifact = run.artifacts.find((entry) => entry.artifact_id === artifactId);
  if (!artifact || artifact.kind !== `procedure-output:${procedureId}:${outputRole}`
    || artifact.description !== `output_role:${outputRole}` || !artifact.producer_command) return false;
  const artifactPath = path.join(runDirectory(targetRoot, run.run_id), artifact.path);
  return fs.existsSync(artifactPath) && fs.statSync(artifactPath).isFile()
    && `sha256:${sha256Hex(fs.readFileSync(artifactPath))}` === artifact.artifact_id;
}

function deterministicPrecheckSatisfied(targetRoot: string, run: Run, procedureId: string, precheck: string): boolean {
  const latestVerification = run.verification_results[run.verification_results.length - 1];
  const verificationPassed = () => verificationSatisfiesRequiredCommandInventory(targetRoot, run, latestVerification);
  switch (precheck) {
    case "task_contract_identity":
      return fs.existsSync(path.join(targetRoot, run.active_task_path ?? run.task_path));
    case "procedure_contract_identity":
      return fs.existsSync(path.join(targetRoot, "skills", "self-hosting", procedureId, "SKILL.md"));
    case "required_reading":
      return run.evidence.length > 0;
    case "required_command_inventory":
      return verificationPassed();
    case "command_results":
    case "verification_pass":
    case "link_and_path_checks":
      return verificationPassed();
    case "snapshot_identity":
      return Boolean(run.source_snapshot && run.repository.head_sha);
    case "commit_identity":
      return Boolean(run.repository.head_sha);
    case "branch_identity":
      return Boolean(run.repository.branch);
    case "remote_fact_inventory":
    case "delivery_facts":
      return run.delivery_facts.length > 0;
    case "implementation_review_pass":
      return run.review_results.some((entry) => reviewSourceMatchesProcedure(entry.source, "implementation-review") && entry.status === "PASS");
    case "next_task_decision":
      return run.decisions.some((entry) => entry.title === "Next task decision");
    case "changed_docs_inventory":
      return reviewChangeInventory(targetRoot).changedFiles.some((entry) => entry.startsWith("docs/") || entry.startsWith("tasks/"));
    case "canonical_source_refs":
      return fs.existsSync(path.join(targetRoot, "TASK.md")) && fs.existsSync(path.join(targetRoot, "docs", "MASTER_ARCHITECTURE.md"));
    case "runtime_state_identity":
      return Boolean(run.run_instance_id && run.run_revision);
    case "claim_inventory":
      return Array.isArray(run.review_launch_claims);
    case "artifact_inventory":
      return run.artifacts.length > 0;
    case "lifecycle_projection":
      return run.lifecycle_status === "active";
    default:
      return false;
  }
}

export async function recordRuntimeProcedure(cwd: string, options: RecordProcedureOptions): Promise<RuntimeProcedureResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "procedure recording");
  const registry = readSelfHostingProcedureRegistry(targetRoot);

  if (!registry) {
    throw new Error("Self-hosting procedure registry not found.");
  }

  const proceduresById = indexSelfHostingProceduresById(registry);
  if (!proceduresById.has(options.procedureId)) {
    throw new Error(`Unknown self-hosting procedure id: ${options.procedureId}`);
  }
  if (current.run.phase_id !== "23.8.6F" && !LEGACY_PROCEDURE_INGESTION_SCOPE.has(options.procedureId)) {
    throw new Error(`Procedure ${options.procedureId} is outside the Phase ${current.run.phase_id ?? "pre-F"} replay and re-ingestion scope.`);
  }
  const executionPolicy = readProcedureExecutionPolicy(targetRoot);
  reconcileProcedureExecutionPolicy(registry, executionPolicy);
  const executionContract = executionPolicy.procedures.find((entry) => entry.procedure_id === options.procedureId);
  if (!executionContract) throw new Error(`Procedure ${options.procedureId} has no exact execution-policy contract.`);

  const absoluteSourcePath = path.resolve(targetRoot, options.filePath);
  ensureInsideTargetRoot(targetRoot, absoluteSourcePath);

  if (!fs.existsSync(absoluteSourcePath) || !fs.statSync(absoluteSourcePath).isFile()) {
    throw new Error(`Procedure artifact not found: ${options.filePath}`);
  }

  const markdown = fs.readFileSync(absoluteSourcePath, "utf8");
  if (markdown.trim().length === 0) {
    throw new Error(`Procedure artifact is empty: ${options.filePath}`);
  }
  if (/^completion_mode:\s*deterministic\s*$/imu.test(markdown)) {
    if (!executionContract.deterministic_completion_supported || executionContract.semantic_class === "semantic_required") {
      throw new Error(`DETERMINISTIC_COMPLETION_FORBIDDEN: ${options.procedureId} still requires semantic judgment.`);
    }
    const precheckLine = markdown.match(/^deterministic_prechecks:\s*(.+)$/imu)?.[1] ?? "";
    const precheckRefLine = markdown.match(/^precheck_refs:\s*(.+)$/imu)?.[1] ?? "";
    const evidenceLine = markdown.match(/^evidence_refs:\s*(.+)$/imu)?.[1] ?? "";
    const completedPrechecks = new Set(precheckLine.split(",").map((entry) => entry.trim()).filter(Boolean));
    const precheckRefs = new Map(precheckRefLine.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const separator = entry.indexOf("=");
      return separator > 0 ? [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()] : [entry, ""];
    }));
    const evidenceRefs = new Map(evidenceLine.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const separator = entry.indexOf("=");
      return separator > 0 ? [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()] : [entry, ""];
    }));
    const missingPrechecks = executionContract.deterministic_prechecks.filter((entry) => {
      const reference = precheckRefs.get(entry);
      const referenceKind = reference ? resolveRuntimeReference(targetRoot, current.run, reference) : undefined;
      const allowedKinds = PRECHECK_REFERENCE_KINDS[entry];
      return !completedPrechecks.has(entry) || !reference || !referenceKind || !allowedKinds?.includes(referenceKind)
        || !deterministicPrecheckSatisfied(targetRoot, current.run, options.procedureId, entry);
    });
    const missingEvidence = executionContract.required_evidence_contract.filter((entry) => {
      const reference = evidenceRefs.get(entry);
      const kind = reference ? resolveRuntimeReference(targetRoot, current.run, reference) : undefined;
      return !kind || !evidenceRoleAcceptsReference(entry, kind);
    });
    const missingOutputs = executionContract.required_output_contract.filter((entry) => {
      const value = markdown.match(new RegExp(`^output\\.${escapeRegExpPattern(entry)}:\\s*(.+)$`, "imu"))?.[1]?.trim();
      return !value || !deterministicOutputReferenceQualifies(targetRoot, current.run, options.procedureId, entry, value);
    });
    const residualDisposition = markdown.match(/^semantic_residual_disposition:\s*(.+)$/imu)?.[1]?.trim();
    const independenceRef = markdown.match(/^independence_ref:\s*(.+)$/imu)?.[1]?.trim();
    const approvalRef = markdown.match(/^approval_ref:\s*(.+)$/imu)?.[1]?.trim();
    const completionReferences = new Set([...precheckRefs.values(), ...evidenceRefs.values()]);
    if (missingPrechecks.length || missingEvidence.length || missingOutputs.length
      || (executionContract.semantic_residual.length > 0 && residualDisposition !== "not_applicable")
      || (executionContract.independence === "independent" && (!independenceRef
        || !completionReferences.has(independenceRef)
        || !independenceReferenceQualifies(targetRoot, current.run, options.procedureId, independenceRef)))
      || (executionContract.independence === "independent"
        && (!approvalRef || !approvalReferenceQualifies(targetRoot, current.run, approvalRef)))) {
      throw new Error(`DETERMINISTIC_COMPLETION_INCOMPLETE: prechecks=${missingPrechecks.join(",")} evidence=${missingEvidence.join(",")} outputs=${missingOutputs.join(",")}`);
    }
  }

  if (options.procedureId === "plan-review") {
    validatePlanReviewArtifact(markdown);
  }

  const contentHash = sha256Hex(markdown);
  const hashPrefix = contentHash.slice(0, 12);
  const timestamp = nowIso();
  const extension = path.extname(absoluteSourcePath) || ".md";
  const relativeArtifactPath = toPortablePath(path.join("evidence", `${options.procedureId}-${hashPrefix}${extension}`));
  const relativeSourcePath = toRepoRelative(targetRoot, absoluteSourcePath);
  const artifact: ArtifactRef = {
    artifact_id: `sha256:${contentHash}`,
    path: relativeArtifactPath,
    kind: `procedure-artifact:${options.procedureId}`,
    description: relativeSourcePath
  };
  const evidence: EvidenceRef = {
    evidence_id: `procedure-${options.procedureId}-${hashPrefix}`,
    kind: `procedure:${options.procedureId}`,
    summary: options.procedureId,
    artifact_id: artifact.artifact_id,
    path: relativeArtifactPath
  };

  const alreadyRecorded = current.run.evidence.some((entry) =>
    entry.evidence_id === evidence.evidence_id
    || (entry.kind === evidence.kind && entry.artifact_id === evidence.artifact_id)
  );

  let run = current.run;
  let recorded = !alreadyRecorded;
  const absoluteArtifactPath = path.join(runDirectory(targetRoot, current.run.run_id), relativeArtifactPath);
  const duplicateReviewFor = (candidateRun: Run, candidateReview: ReviewResult | undefined) => (
    candidateReview
      ? candidateRun.review_results.some((entry) =>
          entry.source === candidateReview.source
          && entry.artifact_refs.some((ref) => ref.artifact_id === artifact.artifact_id)
        )
      : false
  );

  if (dryRun) {
    const review = buildProcedureReviewResult(run, options.procedureId, artifact, markdown, timestamp);
    if (!alreadyRecorded) {
      run = withUpdatedAt({
        ...run,
        artifacts: [...run.artifacts, artifact],
        evidence: [...run.evidence, evidence]
      }, timestamp);
    }
    if (review && !duplicateReviewFor(run, review)) {
      run = recordReviewResult(run, review);
    }
  } else {
    const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
    if (!staging.loadRun(current.run.run_id)) {
      staging.saveRun(current.run);
    }
    run = staging.mutateRunWithDatabase(current.run.run_id, (latestRun, database) => {
      assertNoActiveReviewLaunchClaim(latestRun, "procedure recording");
      const review = buildProcedureReviewResult(latestRun, options.procedureId, artifact, markdown, timestamp);
      const duplicateEvidence = latestRun.evidence.some((entry) =>
        entry.evidence_id === evidence.evidence_id
        || (entry.kind === evidence.kind && entry.artifact_id === evidence.artifact_id)
      );

      recorded = !duplicateEvidence;
      if (!latestRun.run_instance_id) {
        throw new Error(`Procedure ${options.procedureId} cannot be recorded without an exact immutable run instance ID.`);
      }

      const reviewedPlanBinding = options.procedureId === "plan-review"
        ? tryResolveExactPlanEvidenceBinding(latestRun)
        : undefined;
      if (options.procedureId === "plan-review" && latestRun.phase_id === "23.8.6D" && !reviewedPlanBinding) {
        throw new Error("Plan review cannot be recorded without an exact effective-plan artifact identity.");
      }
      if (options.procedureId === "plan-review" && latestRun.phase_id === "23.8.6D" && reviewedPlanBinding) {
        const planDescriptor = staging.readProcedureArtifact(
          latestRun.run_instance_id,
          reviewedPlanBinding.procedureId,
          reviewedPlanBinding.artifactId,
          database
        );
        if (!planDescriptor || planDescriptor.content_hash !== reviewedPlanBinding.contentHash) {
          throw new Error("Plan review cannot prove the exact durable effective-plan artifact binding.");
        }
      }
      const existingDescriptor = staging.readProcedureArtifact(
        latestRun.run_instance_id,
        options.procedureId,
        artifact.artifact_id,
        database
      );
      if (duplicateEvidence && existingDescriptor) {
        if (review && !duplicateReviewFor(latestRun, review)) {
          return recordReviewResult(latestRun, review);
        }
        return latestRun;
      }

      const payload = new PayloadStore(database).store({
        parentRecordId: artifact.artifact_id,
        sourceRunId: latestRun.run_id,
        sourcePhaseId: latestRun.phase_id,
        kind: `procedure-artifact-body:${options.procedureId}`,
        mediaType: "text/markdown",
        summary: `${options.procedureId} authoritative procedure body`,
        content: markdown,
        searchableText: markdown.slice(0, 4000),
        boundedExcerpt: markdown.slice(0, 500),
        retentionClass: "audit"
      });
      staging.storeProcedureArtifact(database, {
        run_instance_id: latestRun.run_instance_id,
        source_run_id: latestRun.run_id,
        procedure_id: options.procedureId,
        artifact_id: artifact.artifact_id,
        payload_id: payload.payload_id,
        content_hash: contentHash,
        recorded_at: timestamp,
        provenance_json: JSON.stringify({
          phase_id: latestRun.phase_id,
          task_path: latestRun.active_task_path ?? latestRun.task_path,
          worktree: latestRun.repository.root_path,
          branch: latestRun.repository.branch,
          head: latestRun.repository.head_sha,
          source_snapshot: latestRun.source_snapshot,
          base_commit: latestRun.source_snapshot,
          compatibility_path: relativeArtifactPath
        }),
        ...(reviewedPlanBinding ? {
          reviewed_plan_artifact_id: reviewedPlanBinding.artifactId,
          reviewed_plan_content_hash: reviewedPlanBinding.contentHash,
          reviewed_evidence_artifact_id: reviewedPlanBinding.artifactId
        } : {})
      });

      let next = duplicateEvidence
        ? latestRun
        : withUpdatedAt({
            ...latestRun,
            artifacts: [...latestRun.artifacts, artifact],
            evidence: [...latestRun.evidence, evidence]
          }, timestamp);

      if (review && !duplicateReviewFor(next, review)) {
        next = recordReviewResult(next, review);
      }
      if (!isPrePhaseFVerificationCompatibility(latestRun.phase_id)
        && ["implementation-review", "fix-pass-review"].includes(options.procedureId)
        && review?.status === "PASS") {
        const head = runGitCommand(targetRoot, ["rev-parse", "HEAD"]);
        const dirty = getGitStatusPaths(getGitStatusLines(targetRoot)).filter((entry) =>
          !entry.startsWith(".harness/")
          && !entry.startsWith(".codex/")
          && entry !== ".DS_Store"
        );
        if (head.status !== 0 || !/^[a-f0-9]{40}$/u.test(head.stdout.trim()) || dirty.length > 0) {
          throw new Error("FINAL_REVIEWED_SOURCE_HEAD_REQUIRES_CLEAN_COMMITTED_TREE");
        }
        if (!hasPhaseFDurableImplementationBaseline(latestRun)) {
          throw new Error("FINAL_REVIEWED_SOURCE_HEAD_REQUIRES_IMPLEMENTATION_BASELINE");
        }
        next = { ...next, final_reviewed_source_head: head.stdout.trim() };
      }

      return next;
    }, {
      expectedRunInstanceId: current.run.run_instance_id,
      expectedRunRevision: current.run.run_revision
    });
    if (recorded) {
      fs.mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
      const temporaryPath = `${absoluteArtifactPath}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporaryPath, markdown, "utf8");
        fs.renameSync(temporaryPath, absoluteArtifactPath);
      } finally {
        if (fs.existsSync(temporaryPath)) {
          fs.rmSync(temporaryPath, { force: true });
        }
      }
    }
    writeCompatibilityRunArtifacts(targetRoot, run);
  }

  const runPath = dryRun ? current.runPath : runFilePath(targetRoot, run.run_id);
  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: dryRun && current.state === "preview" ? "preview" : "updated",
    procedureId: options.procedureId,
    evidence,
    artifact,
    recorded
  };
}

export function consumePlanApprovalStage(run: Run, approvalId: string): Run {
  const currentStageState = run.stage_states?.find((state) => state.current);
  if (!currentStageState) {
    return run;
  }
  if (currentStageState.procedure_id !== "plan-review"
    || currentStageState.status !== "result_recorded"
    || currentStageState.next_allowed_action !== "PLAN_APPROVAL_REQUIRED"
    || currentStageState.human_action_required !== true) {
    throw new Error("PLAN_APPROVAL_STAGE_MISMATCH: current StageState is not awaiting human approval of a passing plan review.");
  }
  return {
    ...run,
    stage_states: run.stage_states?.map((state) => state.stage_state_id === currentStageState.stage_state_id
      ? {
          ...state,
          current: false,
          status: "superseded",
          superseded_by: approvalId,
          human_action_required: false,
          bounded_progress_log: [...state.bounded_progress_log, "human plan approval recorded"].slice(-40)
        }
      : state)
  };
}

export async function approveRuntimePlan(cwd: string, options: ApprovePlanOptions): Promise<RuntimePlanApprovalResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "plan approval");
  const absolutePlanPath = path.resolve(targetRoot, options.planPath);
  ensureInsideTargetRoot(targetRoot, absolutePlanPath);

  if (!fs.existsSync(absolutePlanPath) || !fs.statSync(absolutePlanPath).isFile()) {
    throw new Error(`Approved plan artifact not found: ${options.planPath}`);
  }

  if (!options.approver.trim()) {
    throw new Error("Plan approval requires a non-empty approver.");
  }

  const markdown = fs.readFileSync(absolutePlanPath, "utf8");
  if (markdown.trim().length === 0) {
    throw new Error(`Approved plan artifact is empty: ${options.planPath}`);
  }

  const contentHash = sha256Hex(markdown);
  const hashPrefix = contentHash.slice(0, 12);
  const timestamp = nowIso();
  const extension = path.extname(absolutePlanPath) || ".md";
  const relativeArtifactPath = toPortablePath(path.join("evidence", `approved-plan-${hashPrefix}${extension}`));
  const relativeSourcePath = toRepoRelative(targetRoot, absolutePlanPath);
  const artifact: ArtifactRef = {
    artifact_id: `sha256:${contentHash}`,
    path: relativeArtifactPath,
    kind: "approved-plan-artifact",
    description: relativeSourcePath
  };
  const evidence: EvidenceRef = {
    evidence_id: `approved-plan-${hashPrefix}`,
    kind: "approved-plan",
    summary: "approved-plan",
    artifact_id: artifact.artifact_id,
    path: relativeArtifactPath
  };

  const staging = dryRun ? undefined : new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
  const planBinding = resolveExactPlanApprovalBinding(
    targetRoot,
    current.run.run_id,
    current.run,
    artifact.artifact_id,
    staging
      ? (runInstanceId, procedureId, procedureArtifactId) => staging.readProcedureArtifact(runInstanceId, procedureId, procedureArtifactId)
      : undefined
  );
  const effectivePlanArtifactId = planBinding.planArtifactId;

  let run = current.run;
  const hasArtifact = run.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id);
  const hasEvidence = run.evidence.some((entry) => entry.evidence_id === evidence.evidence_id);
  const planApprovalReason = [
    options.reason?.trim(),
    `effective_plan_artifact_id=${effectivePlanArtifactId}`,
    `reviewed_plan_review_artifact_id=${planBinding.planReviewArtifactId}`,
    `approved_plan_path=${relativeSourcePath}`,
    `approved_plan_artifact_id=${artifact.artifact_id}`
  ].filter(Boolean).join("; ");
  const duplicateApproval = run.approvals.find((entry) =>
    entry.status === "approved"
    && entry.approver === options.approver
    && entry.title === "Reviewed plan approved"
    && entry.reason === planApprovalReason
    && entry.reviewed_plan_artifact_id === planBinding.planArtifactId
    && entry.reviewed_plan_content_hash === planBinding.planContentHash
    && entry.reviewed_evidence_artifact_id === planBinding.planReviewArtifactId
  );

  const approval = duplicateApproval ?? {
    approval_id: `approval-reviewed-plan-${hashPrefix}-${current.run.approvals.length + 1}`,
    title: "Reviewed plan approved",
    status: "approved" as const,
    approver: options.approver,
    created_at: timestamp,
    reason: planApprovalReason,
    reviewed_plan_artifact_id: planBinding.planArtifactId,
    reviewed_plan_content_hash: planBinding.planContentHash,
    reviewed_evidence_artifact_id: planBinding.planReviewArtifactId
  };
  let finalApproval = approval;

  let recorded = !duplicateApproval;
  const absoluteArtifactPath = path.join(runDirectory(targetRoot, current.run.run_id), relativeArtifactPath);

  if (dryRun) {
    if (!hasArtifact || !hasEvidence || !duplicateApproval) {
      run = withUpdatedAt({
        ...run,
        artifacts: hasArtifact ? run.artifacts : [...run.artifacts, artifact],
        evidence: hasEvidence ? run.evidence : [...run.evidence, evidence]
      }, timestamp);
    }
    if (!duplicateApproval) {
      run = recordApproval(run, {
        approvalId: approval.approval_id,
        title: approval.title,
        status: approval.status,
        approver: approval.approver,
        reason: approval.reason,
        reviewedPlanArtifactId: approval.reviewed_plan_artifact_id,
        reviewedPlanContentHash: approval.reviewed_plan_content_hash,
        reviewedEvidenceArtifactId: approval.reviewed_evidence_artifact_id,
        createdAt: approval.created_at
      });
    }
    run = consumePlanApprovalStage(run, approval.approval_id);
  } else {
    if (!staging) {
      throw new Error("Plan approval requires a staging database outside dry-run mode.");
    }
    if (!staging.loadRun(current.run.run_id)) {
      staging.saveRun(current.run);
    }
    let writeCompatibilityArtifact = !hasArtifact || !hasEvidence || !duplicateApproval;
    run = staging.mutateRunWithDatabase(current.run.run_id, (latestRun, database) => {
      assertNoActiveReviewLaunchClaim(latestRun, "plan approval");
      const latestPlanBinding = resolveExactPlanApprovalBinding(
        targetRoot,
        latestRun.run_id,
        latestRun,
        artifact.artifact_id,
        (runInstanceId, procedureId, procedureArtifactId) => staging.readProcedureArtifact(
          runInstanceId,
          procedureId,
          procedureArtifactId,
          database
        )
      );

      const latestHasArtifact = latestRun.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id);
      const latestHasEvidence = latestRun.evidence.some((entry) => entry.evidence_id === evidence.evidence_id);
      const latestDuplicateApproval = latestRun.approvals.find((entry) =>
        entry.status === "approved"
        && entry.approver === options.approver
        && entry.title === "Reviewed plan approved"
        && entry.reason === planApprovalReason
        && entry.reviewed_plan_artifact_id === latestPlanBinding.planArtifactId
        && entry.reviewed_plan_content_hash === latestPlanBinding.planContentHash
        && entry.reviewed_evidence_artifact_id === latestPlanBinding.planReviewArtifactId
      );
      recorded = !latestDuplicateApproval;
      writeCompatibilityArtifact = !latestHasArtifact || !latestHasEvidence || !latestDuplicateApproval;
      const latestApproval = latestDuplicateApproval ?? {
        ...approval,
        approval_id: `approval-reviewed-plan-${hashPrefix}-${latestRun.approvals.length + 1}`
      };
      finalApproval = latestApproval;

      let next = latestRun;
      if (!latestHasArtifact || !latestHasEvidence || !latestDuplicateApproval) {
        next = withUpdatedAt({
          ...latestRun,
          artifacts: latestHasArtifact ? latestRun.artifacts : [...latestRun.artifacts, artifact],
          evidence: latestHasEvidence ? latestRun.evidence : [...latestRun.evidence, evidence]
        }, timestamp);
      }
      if (!latestDuplicateApproval) {
        next = recordApproval(next, {
          approvalId: latestApproval.approval_id,
          title: latestApproval.title,
          status: latestApproval.status,
          approver: latestApproval.approver,
          reason: latestApproval.reason,
          reviewedPlanArtifactId: latestApproval.reviewed_plan_artifact_id,
          reviewedPlanContentHash: latestApproval.reviewed_plan_content_hash,
          reviewedEvidenceArtifactId: latestApproval.reviewed_evidence_artifact_id,
          createdAt: latestApproval.created_at
        });
      }
      return consumePlanApprovalStage(next, latestApproval.approval_id);
    }, {
      expectedRunInstanceId: current.run.run_instance_id,
      expectedRunRevision: current.run.run_revision
    });
    if (writeCompatibilityArtifact) {
      fs.mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
      const temporaryPath = `${absoluteArtifactPath}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporaryPath, markdown, "utf8");
        fs.renameSync(temporaryPath, absoluteArtifactPath);
      } finally {
        if (fs.existsSync(temporaryPath)) {
          fs.rmSync(temporaryPath, { force: true });
        }
      }
    }
    writeCompatibilityRunArtifacts(targetRoot, run);
  }

  const runPath = dryRun ? current.runPath : runFilePath(targetRoot, run.run_id);
  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: dryRun && current.state === "preview" ? "preview" : "updated",
    approval: finalApproval,
    evidence,
    artifact,
    recorded
  };
}

const PHASE_23_9_BOOTSTRAP_BASELINE = {
  runId: "run-0001",
  runInstanceId: "4609d822-5065-4420-a20a-820ed1eec0a9",
  head: "3010ae4190e4a1320ba19621c037e0b066869f52",
  tree: "7649afe26164e4bf5469bf71e9611c469c80b03a",
  parent: "ea7107eccd7f986ce44f5b8ab228d4d1dd827c29",
  planHash: "319361d8138b82b56de8ff69afb471efe8aee47e3f8bf4f18e0d30bf8cd78592",
  authorityDiffHash:
    "80bf5536c036a9de40e1b7bbe2a0ada152846942f2fc424189a9da0fa35bb493",
  authorityPaths: [
    "docs/IMPLEMENTATION_ROADMAP.md",
    "tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md",
    "tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md",
  ],
} as const;

export async function bindRuntimeImplementationBaseline(
  cwd: string,
  options: BindImplementationBaselineOptions,
): Promise<RuntimeImplementationBaselineResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "implementation baseline binding");

  const absolutePlanPath = path.resolve(targetRoot, options.planPath);
  ensureInsideTargetRoot(targetRoot, absolutePlanPath);
  if (!fs.existsSync(absolutePlanPath) || !fs.statSync(absolutePlanPath).isFile()) {
    throw new Error(`Implementation baseline plan artifact not found: ${options.planPath}`);
  }
  const planHash = sha256Hex(fs.readFileSync(absolutePlanPath));
  const planMarkdown = fs.readFileSync(absolutePlanPath, "utf8");
  const approval = current.run.approvals.find(
    (entry) =>
      entry.approval_id === options.approvalId &&
      entry.status === "approved" &&
      entry.reviewed_plan_artifact_id === `sha256:${planHash}` &&
      entry.reviewed_plan_content_hash === planHash,
  );
  if (!approval) {
    throw new Error(
      "IMPLEMENTATION_BASELINE_APPROVAL_MISMATCH: exact current reviewed-plan approval is required.",
    );
  }
  if (!current.run.run_instance_id || !approval.reviewed_evidence_artifact_id) {
    throw new Error("IMPLEMENTATION_BASELINE_APPROVAL_MISMATCH: exact approval review identity is required.");
  }
  const baselineStaging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
  const approvalBinding = resolveExactPlanApprovalBinding(
    targetRoot,
    current.run.run_id,
    current.run,
    `sha256:${planHash}`,
    (runInstanceId, procedureId, artifactId) => baselineStaging.readProcedureArtifact(
      runInstanceId, procedureId, artifactId
    )
  );
  if (approvalBinding.planReviewArtifactId !== approval.reviewed_evidence_artifact_id) {
    throw new Error("IMPLEMENTATION_BASELINE_APPROVAL_REVIEW_MISMATCH: approval is not bound to the exact fresh plan review.");
  }

  const expectedHead = resolveExactCommit(targetRoot, options.expectedHead);
  const currentHead = resolveExactCommit(targetRoot, "HEAD");
  const branch = readGitValue(targetRoot, ["branch", "--show-current"]);
  const expectedTree = readGitValue(targetRoot, [
    "rev-parse",
    "--verify",
    `${expectedHead}^{tree}`,
  ]);
  const expectedParent = readGitValue(targetRoot, [
    "rev-parse",
    "--verify",
    `${expectedHead}^`,
  ]);
  const branchMatches = Boolean(branch && branch === current.run.repository.branch);
  const worktreeRegistered = worktreePathExistsInGit(targetRoot, targetRoot);
  const ancestryMatches = isCommitAncestor(targetRoot, expectedHead, currentHead);
  if (!branchMatches || !worktreeRegistered || !expectedTree || !ancestryMatches) {
    throw new Error(
      `IMPLEMENTATION_BASELINE_GIT_AUTHORITY_MISMATCH: branch=${branchMatches}; worktree=${worktreeRegistered}; tree=${Boolean(expectedTree)}; ancestry=${ancestryMatches}.`,
    );
  }

  const isBootstrapImport =
    current.run.run_mode === "bootstrap" &&
    current.run.run_id === PHASE_23_9_BOOTSTRAP_BASELINE.runId &&
    current.run.run_instance_id === PHASE_23_9_BOOTSTRAP_BASELINE.runInstanceId;
  let planningHead = expectedParent ?? expectedHead;
  let authorityTransition: ImplementationBaselineBinding["authority_transition"] = "owner_authorized_overlay";
  let authorityDiffHash: string;
  if (isBootstrapImport) {
    if (!expectedParent) {
      throw new Error("IMPLEMENTATION_BASELINE_BOOTSTRAP_AUTHORITY_MISMATCH: immutable bootstrap authority requires a parent commit.");
    }
    const changedPaths = runGitCommand(targetRoot, [
      "diff",
      "--name-only",
      expectedParent,
      expectedHead,
      "--",
    ]);
    const authorityDiff = runGitCommand(targetRoot, [
      "diff",
      "--binary",
      expectedParent,
      expectedHead,
      "--",
      ...PHASE_23_9_BOOTSTRAP_BASELINE.authorityPaths,
    ]);
    const exactPaths = changedPaths.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .sort();
    if (
      planHash !== PHASE_23_9_BOOTSTRAP_BASELINE.planHash ||
      expectedHead !== PHASE_23_9_BOOTSTRAP_BASELINE.head ||
      expectedTree !== PHASE_23_9_BOOTSTRAP_BASELINE.tree ||
      expectedParent !== PHASE_23_9_BOOTSTRAP_BASELINE.parent ||
      changedPaths.status !== 0 ||
      authorityDiff.status !== 0 ||
      canonicalJson(exactPaths) !==
        canonicalJson([...PHASE_23_9_BOOTSTRAP_BASELINE.authorityPaths].sort())
    ) {
      throw new Error(
        "IMPLEMENTATION_BASELINE_BOOTSTRAP_AUTHORITY_MISMATCH: run-0001 accepts only the approved authority commit, tree, parent, plan, and path set.",
      );
    }
    authorityDiffHash = `sha256:${sha256Hex(authorityDiff.stdout)}`;
    if (authorityDiffHash !== `sha256:${PHASE_23_9_BOOTSTRAP_BASELINE.authorityDiffHash}`) {
      throw new Error(
        "IMPLEMENTATION_BASELINE_BOOTSTRAP_DIFF_MISMATCH: authority diff bytes changed.",
      );
    }
    planningHead = PHASE_23_9_BOOTSTRAP_BASELINE.parent;
  } else {
    const dirty = getGitStatusPaths(getGitStatusLines(targetRoot)).filter(
      (entry) =>
        !entry.startsWith(".harness/") &&
        !entry.startsWith(".codex/") &&
        entry !== ".DS_Store",
    );
    if (currentHead !== expectedHead || dirty.length > 0) {
      throw new Error(
        "IMPLEMENTATION_BASELINE_DIRTY_CHECKOUT: permanent binding requires the clean current authority HEAD.",
      );
    }
    if (!current.run.run_instance_id) {
      throw new Error("IMPLEMENTATION_BASELINE_RUN_INSTANCE_MISSING");
    }
    const planReviews = current.run.review_results.filter((entry) =>
      entry.status === "PASS"
      && reviewSourceMatchesProcedure(entry.source, "plan-review")
      && entry.artifact_refs.length === 1
      && entry.artifact_refs[0].artifact_id === approvalBinding.planReviewArtifactId);
    if (planReviews.length !== 1) {
      throw new Error("IMPLEMENTATION_BASELINE_PLANNING_REVIEW_MISSING");
    }
    const currentPlanReview = planReviews[planReviews.length - 1];
    const descriptor = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id)
      .readProcedureArtifact(
        current.run.run_instance_id,
        "plan-review",
        currentPlanReview.artifact_refs[0].artifact_id
      );
    const provenance = descriptor
      ? JSON.parse(descriptor.provenance_json) as Record<string, unknown>
      : undefined;
    const reviewedPlanningHead = String(
      provenance?.reviewed_source_head ?? provenance?.head ?? ""
    );
    if (!descriptor || !/^[a-f0-9]{40}$/u.test(reviewedPlanningHead)
      || descriptor.source_run_id !== current.run.run_id
      || descriptor.content_hash !== approvalBinding.planReviewArtifactId.slice("sha256:".length)
      || descriptor.reviewed_plan_artifact_id !== approvalBinding.planArtifactId
      || descriptor.reviewed_plan_content_hash !== approvalBinding.planContentHash) {
      throw new Error(
        "IMPLEMENTATION_BASELINE_REVIEW_BINDING_MISMATCH: exact approved plan-review provenance is required."
      );
    }
    const exactPlan = tryResolveExactPlanEvidenceBinding(current.run);
    const exactReview = readLatestProcedureEvidenceById(current.run, "plan-review");
    if (!exactPlan || !exactReview
      || !hasTerminalAutomaticPlanReviewProvenance(current.run, exactPlan, exactReview, descriptor)) {
      throw new Error(
        "IMPLEMENTATION_BASELINE_REVIEW_BINDING_MISMATCH: terminal automatic plan-review provenance is required."
      );
    }
    planningHead = reviewedPlanningHead;
    if (expectedHead === reviewedPlanningHead) {
      authorityTransition = "reviewed_source";
      authorityDiffHash = `sha256:${sha256Hex("")}`;
    } else {
      if (expectedParent !== reviewedPlanningHead) {
        throw new Error("IMPLEMENTATION_BASELINE_PARENT_MISMATCH: an owner-authorized overlay must directly follow the exact reviewed planning source.");
      }
      const reviewedOverlay = extractReviewedAuthorityOverlay(planMarkdown);
      const changedPaths = runGitCommand(targetRoot, [
        "diff", "--name-only", expectedParent, expectedHead, "--"
      ]);
      const authorityDiff = runGitCommand(targetRoot, [
        "diff",
        "--binary",
        expectedParent,
        expectedHead,
        "--",
        ...reviewedOverlay.paths,
      ]);
      const exactPaths = changedPaths.stdout.split(/\r?\n/u).filter(Boolean).sort();
      if (changedPaths.status !== 0 || authorityDiff.status !== 0
        || canonicalJson(exactPaths) !== canonicalJson([...reviewedOverlay.paths].sort())) {
        throw new Error("IMPLEMENTATION_BASELINE_DIFF_UNAVAILABLE");
      }
      authorityDiffHash = `sha256:${sha256Hex(authorityDiff.stdout)}`;
      if (authorityDiffHash !== `sha256:${reviewedOverlay.diffHash}`) {
        throw new Error("IMPLEMENTATION_BASELINE_AUTHORITY_OVERLAY_MISMATCH");
      }
    }
  }

  const timestamp = nowIso();
  const binding: ImplementationBaselineBinding = {
    schema_version: 2,
    approval_id: approval.approval_id,
    plan_artifact_hash: planHash,
    plan_review_artifact_hash: approvalBinding.planReviewArtifactId,
    planning_review_source_head: planningHead,
    authority_transition: authorityTransition,
    owner_authority_diff_hash: authorityDiffHash,
    implementation_baseline_head: expectedHead,
    implementation_baseline_tree_hash: expectedTree,
    expected_tree_hash: expectedTree,
    bound_at: timestamp,
  };
  const existing = current.run.implementation_baseline_binding;
  if (
    existing &&
    canonicalJson({ ...existing, bound_at: timestamp }) !==
      canonicalJson(binding)
  ) {
    throw new Error(
      "IMPLEMENTATION_BASELINE_BINDING_CONFLICT: existing binding differs.",
    );
  }

  let run: Run = {
    ...current.run,
    implementation_baseline_head: expectedHead,
    implementation_baseline_binding: existing ?? binding,
  };
  const recorded = !existing;
  if (!dryRun) {
    const staging = new RunStagingDatabase(
      targetRoot,
      roots.projectRoot,
      current.run.run_id,
    );
    run = staging.mutateRunWithDatabase(
      current.run.run_id,
      (latestRun) => {
        const latestExisting = latestRun.implementation_baseline_binding;
        if (
          latestExisting &&
          canonicalJson({ ...latestExisting, bound_at: timestamp }) !==
            canonicalJson(binding)
        ) {
          throw new Error(
            "IMPLEMENTATION_BASELINE_BINDING_CONFLICT: durable binding differs.",
          );
        }
        return {
          ...latestRun,
          implementation_baseline_head: expectedHead,
          implementation_baseline_binding: latestExisting ?? binding,
        };
      },
      {
        expectedRunInstanceId: current.run.run_instance_id,
        expectedRunRevision: current.run.run_revision,
        expectedRunPresence: "present",
      },
    );
    if (
      run.implementation_baseline_head !== expectedHead ||
      run.implementation_baseline_binding?.implementation_baseline_tree_hash !==
        expectedTree
    ) {
      throw new Error("IMPLEMENTATION_BASELINE_READBACK_MISMATCH");
    }
    writeCompatibilityRunArtifacts(targetRoot, run);
  }

  const paths = resolveMemoryDbPaths(
    targetRoot,
    roots.projectRoot,
    current.run.run_id,
  );
  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath: current.runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: "updated",
    binding: run.implementation_baseline_binding ?? binding,
    recorded,
  };
}

export function extractReviewedAuthorityOverlay(planMarkdown: string): {
  diffHash: string;
  paths: string[];
} {
  const hashMatch = /owner-authorized(?: planning)? authority diff SHA-256[\s\S]{0,240}?`([a-f0-9]{64})`/iu.exec(planMarkdown);
  const section = /Preapproval owner-authority overlay[^\n]*\n[\s\S]*?(?=\n\n(?:Inspect only|No other source))/iu.exec(planMarkdown)?.[0];
  const paths = section
    ? [...section.matchAll(/^- `([^`]+)`[;,.]?$/gmu)].map((match) => match[1])
    : [];
  if (!hashMatch || paths.length === 0 || new Set(paths).size !== paths.length
    || paths.some((entry) => path.isAbsolute(entry) || entry.split("/").includes(".."))) {
    throw new Error("IMPLEMENTATION_BASELINE_REVIEWED_AUTHORITY_OVERLAY_MISSING");
  }
  return { diffHash: hashMatch[1], paths };
}

export function recordRuntimeProof(
  cwd: string,
  options: RecordIndependentFileOptions
): RuntimeIndependentRecordResult {
  const roots = resolveHarnessRoots(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(roots.targetRoot, dryRun, options.runId);
  if (current.run.phase_id !== "23.9" || current.run.run_mode !== "normal") {
    throw new Error("bootstrap_proof_ineligible");
  }
  if (!current.run.run_instance_id) throw new Error("proof_run_instance_missing");
  const requestPath = path.resolve(cwd, options.filePath);
  const requestBytes = fs.readFileSync(requestPath);
  if (options.expectedSha && sha256Hex(requestBytes) !== options.expectedSha.replace(/^sha256:/u, "")) {
    throw new Error("proof_derivation_request_hash_mismatch");
  }
  const request = parseProofDerivationRequest(requestBytes);
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, current.run.run_id);
  const snapshots = staging.listIndependentRecords("proof_eligibility_snapshot", current.run.run_id);
  if (snapshots.length !== 1) {
    throw new Error("proof_eligibility_snapshot_cardinality_invalid");
  }
  const snapshot = snapshots[0] as {
    snapshot_id: `sha256:${string}`;
    task_artifact_id: `sha256:${string}`;
    immutable_base: string;
    activation_source_head: string;
    bootstrap_eligibility: string;
    contract_marker: `sha256:${string}`;
    procedure_requirements: ProcedureRequirementV1[];
    stage_requirements: StageRequirementV1[];
  };
  if (snapshot.bootstrap_eligibility !== "eligible") throw new Error("proof_run_not_eligible");
  const taskPath = path.join(roots.targetRoot, current.run.active_task_path ?? current.run.task_path);
  const taskBytes = fs.readFileSync(taskPath);
  const requirements = extractTaskRequirements(taskBytes);
  if (`sha256:${sha256Hex(taskBytes)}` !== snapshot.task_artifact_id) {
    throw new Error("proof_task_artifact_identity_mismatch");
  }
  const evidenceRefs: EvidenceRefV1[] = [];
  const addEvidence = (
    sourceKind: EvidenceRefV1["source_kind"],
    sourceId: string,
    value: unknown,
    locator: string,
    relationship: EvidenceRefV1["relationship"]
  ): string => {
    const contentHash = `sha256:${sha256Hex(canonicalJson(value))}` as const;
    const body = {
      source_kind: sourceKind,
      source_id: sourceId,
      content_hash: contentHash,
      run_instance_id: current.run.run_instance_id!,
      locator,
      relationship
    };
    const refId = `sha256:${sha256Hex(canonicalJson(body))}` as const;
    evidenceRefs.push({ ref_id: refId, ...body });
    return refId;
  };
  const verification = [...current.run.verification_results].reverse()
    .find((entry) => entry.status === "pass"
      && entry.command_results.length > 0
      && entry.command_results.every((command) => command.status === "pass" && command.exit_code === 0));
  const review = [...current.run.review_results].reverse()
    .find((entry) => entry.status === "PASS"
      && (reviewSourceMatchesProcedure(entry.source, "fix-pass-review")
        || reviewSourceMatchesProcedure(entry.source, "implementation-review"))
      && entry.artifact_refs.length === 1);
  const deliveredHead = current.run.delivered_source_head;
  const deliveryFacts = current.run.delivery_facts.filter((fact) =>
    fact.status !== "unknown" && fact.run_id === current.run.run_id);
  const commandEvidence = new Map<string, string>();
  for (const requirement of requirements.filter((entry) =>
    entry.source.requirement_kind === "acceptance_command")) {
    const exactCommand = verification?.command_results.find((command) =>
      command.status === "pass"
      && command.exit_code === 0
      && command.command === requirement.normalized_block_text);
    if (exactCommand && verification) {
      commandEvidence.set(requirement.requirement_id, addEvidence(
        "staging_record",
        exactCommand.command_result_id,
        { verification_result_id: verification.verification_result_id, command_result: exactCommand },
        `run:${current.run.run_instance_id}:verification:${exactCommand.command_result_id}`,
        "verifies_requirement"
      ));
    }
  }
  let reviewRef: string | undefined;
  let reviewEvidenceValue: unknown;
  let reviewEvidenceSourceId: string | undefined;
  let reviewEvidenceLocator: string | undefined;
  if (review && current.run.run_instance_id && current.run.final_reviewed_source_head) {
    const procedureId = reviewSourceMatchesProcedure(review.source, "fix-pass-review")
      ? "fix-pass-review"
      : "implementation-review";
    try {
      const descriptor = staging.readProcedureArtifact(
        current.run.run_instance_id,
        procedureId,
        review.artifact_refs[0].artifact_id
      );
      const body = staging.readProcedureArtifactBody({
        runInstanceId: current.run.run_instance_id,
        sourceRunId: current.run.run_id,
        procedureArtifactId: review.artifact_refs[0].artifact_id,
        procedureId
      });
      const provenance = descriptor
        ? JSON.parse(descriptor.provenance_json) as Record<string, unknown>
        : undefined;
      const validated = validateReviewLaunchArtifact(procedureId, body.body);
      if (descriptor
        && body.artifact_id === review.artifact_refs[0].artifact_id
        && body.content_hash === descriptor.content_hash
        && provenance?.reviewed_source_head === current.run.final_reviewed_source_head
        && validated.status === "PASS") {
        reviewRef = addEvidence(
          "procedure_artifact",
          body.artifact_id,
          { descriptor, body_hash: `sha256:${body.content_hash}`, verdict: validated.status },
          review.artifact_refs[0].path,
          "verifies_requirement"
        );
        reviewEvidenceValue = { descriptor, body_hash: `sha256:${body.content_hash}`, verdict: validated.status };
        reviewEvidenceSourceId = body.artifact_id;
        reviewEvidenceLocator = review.artifact_refs[0].path;
      }
    } catch {
      reviewRef = undefined;
    }
  }
  const mergeCommit = deliveryFacts.find((fact) =>
    fact.fact_kind === "merge_commit"
    && fact.commit_sha === deliveredHead
    && ["merged", "pass", "approved"].includes(fact.status));
  const sourceRolesValid = Boolean(
    current.run.implementation_baseline_binding
    && current.run.implementation_baseline_binding.implementation_baseline_head
      === current.run.implementation_baseline_head
    && current.run.final_reviewed_source_head
    && deliveredHead
    && mergeCommit
    && runGitCommand(roots.targetRoot, [
      "merge-base", "--is-ancestor", current.run.final_reviewed_source_head, deliveredHead
    ]).status === 0
  );
  const deliveryRefs = deliveryFacts.map((fact) =>
    addEvidence("delivery_fact", fact.delivery_fact_id, fact,
      `run:${current.run.run_instance_id}:delivery:${fact.delivery_fact_id}`, "verifies_requirement"));
  const sourceRoleRefs = sourceRolesValid ? [
    ["implementation_baseline", current.run.implementation_baseline_head],
    ["final_reviewed", current.run.final_reviewed_source_head],
    ["delivered", deliveredHead]
  ].flatMap(([role, head]) => head
    ? [addEvidence("git_object", head, { role, head }, `git:${head}`, "verifies_requirement")]
    : []) : [];
  const gapAt = current.run.updated_at;
  const gaps: EvidenceGapV1[] = [];
  const addGap = (
    family: string,
    requirementIds: string[],
    underlying: "mandatory" | "optional",
    cause: EvidenceGapV1["cause"],
    ownerRefs: EvidenceGapV1["owner_refs"],
    detail: string
  ): string => {
    const identity = {
      family,
      requirement_ids: [...requirementIds].sort(),
      underlying_requirement: underlying,
      cause,
      owner_refs: ownerRefs,
      detail
    };
    const gapId = `sha256:${sha256Hex(canonicalJson(identity))}`;
    gaps.push({
      gap_id: gapId,
      family,
      requirement_ids: identity.requirement_ids,
      underlying_requirement: underlying,
      cause,
      blocking: underlying === "mandatory",
      evidence_ref_ids: [],
      owner_refs: ownerRefs,
      detail,
      detected_by: "proof_record_deriver_v1",
      created_at: gapAt
    });
    return gapId;
  };
  const taskMap = requirements.map((requirement) => {
    const evidenceRef = requirement.source.requirement_kind === "acceptance_command"
      ? commandEvidence.get(requirement.requirement_id)
      : reviewEvidenceSourceId && reviewEvidenceLocator
        ? addEvidence("procedure_artifact", `${reviewEvidenceSourceId}#${requirement.requirement_id}`,
            { review: reviewEvidenceValue, requirement_id: requirement.requirement_id, requirement_source: requirement.source },
            `${reviewEvidenceLocator}#requirement=${requirement.requirement_id}`, "verifies_requirement")
        : undefined;
    const gapId = evidenceRef ? undefined : addGap(
      requirement.source.requirement_kind === "acceptance_command" ? "deterministic_verification" : "independent_review",
      [requirement.requirement_id],
      "mandatory",
      requirement.source.requirement_kind === "acceptance_command" ? "verification_failed" : "review_non_pass",
      [{ owner_kind: "task_requirement" as const, owner_id: requirement.requirement_id, slot: "verification" }],
      `No current exact ${requirement.source.requirement_kind === "acceptance_command" ? "passing command" : "passing review"} evidence.`
    );
    return {
      requirement_id: requirement.requirement_id,
      source: requirement.source,
      applicability: "mandatory" as const,
      verification_status: evidenceRef ? "verified" as const : "blocked" as const,
      applicability_authority_ref_id: null,
      evidence_ref_ids: evidenceRef ? [evidenceRef] : [],
      gap_ids: gapId ? [gapId] : [],
      assumption_ids: []
    };
  });
  const runtimeFieldNames = ["host_os", "host_arch", "node_version", "network_access"] as const;
  const runtimeFields = runtimeFieldNames.map((fieldName) => {
    const gapId = addGap(
      "operating_envelope",
      [],
      "optional",
      "not_recorded",
      [{ owner_kind: "operating_envelope_field", owner_id: fieldName, slot: "run_start" }],
      `${fieldName} was not durably observed at run start.`
    );
    return {
      field_id: `sha256:${sha256Hex(canonicalJson({ field_name: fieldName, run_instance_id: current.run.run_instance_id }))}` as const,
      field_name: fieldName,
      status: "unavailable" as const,
      value: null,
      evidence_ref_id: null,
      gap_id: gapId,
      unavailable_cause: "not_recorded" as const
    };
  });
  const approval = [...current.run.approvals].reverse().find((entry) => entry.status === "approved");
  const reviewRoles = [
    ["planning_candidate", "plan-review"],
    ["planning_closure", "plan-review"],
    ["implementation_review", "implementation-review"],
    ["fix_pass_review", "fix-pass-review"]
  ] as const;
  const durableAttempts = staging.listIndependentRecords("review_attempt", current.run.run_id) as Array<{
    record_id?: string; attempt_id?: string; attempt_kind?: string; procedure_ids?: string[];
    cohort_id?: string | null; terminal_event_id?: string; terminal_status?: string;
    reviewed_source_head?: string | null; lens_results?: Array<{ procedure_id?: string; artifact_id?: string }>;
  }>;
  const durableEvents = staging.listIndependentRecords("review_attempt_event", current.run.run_id) as Array<{
    record_id?: string; attempt_id?: string; event_type?: string; observed_profile?: {
      adapter?: string; provider?: string; model?: string; reasoning?: string; sandbox?: string; approval_policy?: string;
    } | null;
  }>;
  const reviewContexts: ReviewOperatingContextV1[] = reviewRoles.map(([selectionRole, procedureId]) => {
    const selectedAttempts = durableAttempts.filter((attempt) => attempt.terminal_status === "success"
      && attempt.procedure_ids?.includes(procedureId)
      && (selectionRole === "implementation_review" || selectionRole === "fix_pass_review"));
    if (selectedAttempts.length === 1) {
      const attempt = selectedAttempts[0];
      const started = durableEvents.filter((event) => event.attempt_id === attempt.attempt_id
        && event.event_type === "started" && event.observed_profile);
      const artifactId = attempt.lens_results?.find((entry) => entry.procedure_id === procedureId)?.artifact_id;
      if (started.length === 1 && artifactId && attempt.terminal_event_id) {
        const profile = started[0].observed_profile!;
        const profileEvidenceRef = addEvidence("staging_record", started[0].record_id ?? `${attempt.attempt_id}:started`,
          started[0], `run:${current.run.run_instance_id}:review-attempt:${attempt.attempt_id}:started`, "describes_environment");
        const fields = (["adapter", "provider", "model", "reasoning", "sandbox", "approval_policy"] as const)
          .map((fieldName) => ({
            field_id: `sha256:${sha256Hex(canonicalJson({ attempt_id: attempt.attempt_id, field_name: fieldName }))}` as const,
            field_name: fieldName,
            status: "observed" as const,
            value: fieldName === "adapter" ? "codex_cli" : profile[fieldName] ?? null,
            evidence_ref_id: profileEvidenceRef,
            gap_id: null,
            unavailable_cause: null
          }));
        if (fields.every((field) => field.value)) {
          return {
            context_id: `sha256:${sha256Hex(canonicalJson({ attempt_id: attempt.attempt_id, procedure_id: procedureId }))}` as `sha256:${string}`,
            selection_role: selectionRole,
            procedure_id: procedureId,
            availability: "selected" as const,
            cohort_id: attempt.cohort_id ?? null,
            attempt_id: attempt.attempt_id ?? null,
            terminal_event_id: attempt.terminal_event_id,
            artifact_id: artifactId,
            source_plan_sha: (approval?.reviewed_plan_artifact_id ?? null) as `sha256:${string}` | null,
            carry_forward_ref_id: null,
            fields,
            selection_gap_ids: []
          };
        }
      }
    }
    const gapId = addGap(
      "operating_envelope",
      [],
      "optional",
      "attempt_missing",
      [{ owner_kind: "operating_envelope_attempt", owner_id: procedureId, slot: selectionRole }],
      `No exact normalized startup attempt was selected for ${selectionRole}.`
    );
    return {
      context_id: `sha256:${sha256Hex(canonicalJson({
        run_instance_id: current.run.run_instance_id, selection_role: selectionRole, procedure_id: procedureId
      }))}`,
      selection_role: selectionRole,
      procedure_id: procedureId,
      availability: "unavailable",
      cohort_id: null,
      attempt_id: null,
      terminal_event_id: null,
      artifact_id: null,
      source_plan_sha: null,
      carry_forward_ref_id: null,
      fields: [],
      selection_gap_ids: [gapId]
    };
  });
  const changed = current.run.implementation_baseline_head && deliveredHead
    ? runGitCommand(roots.targetRoot, [
        "diff", "--name-only", current.run.implementation_baseline_head, deliveredHead, "--"
      ])
    : { status: 1, stdout: "" };
  const exactPaths = changed.status === 0
    ? changed.stdout.split(/\r?\n/u).filter(Boolean).sort()
    : [];
  const approvalRef = approval
    ? addEvidence("owner_directive", approval.approval_id, approval,
      `run:${current.run.run_instance_id}:approval:${approval.approval_id}`, "authorizes_delivery_slice")
    : undefined;
  const deliverySlices: DeliverySliceV1[] = exactPaths.length && approvalRef
    ? [{
        slice_id: "sha256:" as `sha256:${string}`,
        classification: "active_task",
        authority_ref_id: approvalRef,
        exact_paths: exactPaths,
        requirement_ids: requirements.map((entry) => entry.requirement_id),
        acceptance_ref_ids: [...commandEvidence.values(), reviewRef, ...deliveryRefs]
          .filter((value): value is string => Boolean(value))
      }]
    : [];
  if (deliverySlices.length) {
    deliverySlices[0].slice_id = `sha256:${sha256Hex(canonicalJson(
      Object.fromEntries(Object.entries(deliverySlices[0]).filter(([key]) => key !== "slice_id"))
    ))}`;
  } else {
    addGap("delivery_slice", requirements.map((entry) => entry.requirement_id), "mandatory",
      "delivery_fact_missing",
      [{ owner_kind: "evidence_family", owner_id: "delivery_slice", slot: "active_task" }],
      "Exact delivered diff and owner authority are required.");
  }
  if (!deliveryRefs.length) {
    addGap("delivery", requirements.map((entry) => entry.requirement_id), "mandatory",
      "delivery_fact_missing",
      [{ owner_kind: "evidence_family", owner_id: "delivery", slot: "terminal_delivery" }],
      "No terminal exact delivery facts are available.");
  }
  if (!sourceRolesValid) {
    addGap("source_roles", requirements.map((entry) => entry.requirement_id), "mandatory",
      "join_missing",
      [{ owner_kind: "evidence_family", owner_id: "source_roles", slot: "baseline_review_delivery" }],
      "Baseline binding, reviewed procedure artifact, and exact merge-commit delivery roles do not form one validated source chain.");
  }
  const rebuilt = buildProofRecord({
    run_instance_id: current.run.run_instance_id,
    run_id: current.run.run_id,
    task_artifact_id: snapshot.task_artifact_id,
    immutable_base: snapshot.immutable_base,
    activation_hash: `sha256:${sha256Hex(canonicalJson(snapshot))}`,
    activation_source_head: snapshot.activation_source_head,
    implementation_baseline_head: current.run.implementation_baseline_head ?? null,
    final_reviewed_source_head: current.run.final_reviewed_source_head ?? null,
    delivered_source_head: deliveredHead ?? null,
    eligibility_snapshot_id: snapshot.snapshot_id,
    lifecycle_applicability: {
      snapshot_id: snapshot.snapshot_id,
      contract_marker: snapshot.contract_marker,
      procedure_requirements: snapshot.procedure_requirements.map((entry) => entry.predicate_result !== "deferred"
        ? entry
        : { ...entry, predicate_result: current.run.review_results.some((reviewResult) =>
            reviewSourceMatchesProcedure(reviewResult.source, entry.procedure_id)) ? "true" as const : "false" as const,
          basis_ref_ids: [`run:${current.run.run_instance_id}:procedure:${entry.procedure_id}`] }),
      stage_requirements: snapshot.stage_requirements.map((entry) => entry.predicate_result !== "deferred"
        ? entry
        : { ...entry, predicate_result: entry.stage_id === "FIX_PASS_REQUIRED"
            ? current.run.review_results.some((reviewResult) => reviewSourceMatchesProcedure(reviewResult.source, "fix-pass-review")) ? "true" as const : "false" as const
            : entry.stage_id === "RUN_DISCARDED" ? current.run.lifecycle_status === "discarded" ? "true" as const : "false" as const
            : entry.stage_id === "RUN_QUARANTINED" ? "false" as const
            : current.run.run_issues.length > 0 ? "true" as const : "false" as const,
          basis_ref_ids: [`run:${current.run.run_instance_id}:stage:${entry.stage_id}`] })
    },
    task_verifiability_map: taskMap,
    evidence_refs: evidenceRefs,
    evidence_families: [
      { family: "deterministic_verification", applicability: "mandatory", ref_ids: [...commandEvidence.values()], gap_ids: gaps.filter((gap) => gap.family === "deterministic_verification").map((gap) => gap.gap_id) },
      { family: "independent_review", applicability: "mandatory", ref_ids: reviewRef ? [reviewRef] : [], gap_ids: gaps.filter((gap) => gap.family === "independent_review").map((gap) => gap.gap_id) },
      { family: "delivery", applicability: "mandatory", ref_ids: deliveryRefs, gap_ids: gaps.filter((gap) => gap.family === "delivery").map((gap) => gap.gap_id) },
      { family: "source_roles", applicability: "mandatory", ref_ids: sourceRoleRefs, gap_ids: gaps.filter((gap) => gap.family === "source_roles").map((gap) => gap.gap_id) }
    ],
    assumption_ledger: [],
    operating_envelope: {
      schema_version: "phase-23.9.operating-envelope.v1",
      producer_id: "proof_record_deriver_v1",
      run_start_ref_id: snapshot.snapshot_id,
      runtime_fields: runtimeFields,
      planning_lineage: {
        lineage_id: `sha256:${sha256Hex(canonicalJson({
          run_instance_id: current.run.run_instance_id, target: approval?.reviewed_plan_artifact_id ?? null
        }))}`,
        target_plan_sha: (approval?.reviewed_plan_artifact_id ?? `sha256:${"0".repeat(64)}`) as `sha256:${string}`,
        direct_closure_cohort_id: null,
        contributing_context_ids: [],
        lens_map: []
      },
      review_contexts: reviewContexts,
      gap_ids: gaps.filter((gap) => gap.family === "operating_envelope").map((gap) => gap.gap_id)
    },
    delivery_slices: deliverySlices,
    evidence_gaps: gaps,
    created_at: current.run.updated_at
  });
  if (request.expected_record_id && request.expected_record_id !== rebuilt.record_id) {
    throw new Error("proof_expected_record_identity_mismatch");
  }
  if (rebuilt.acceptance.status !== "accepted") throw new Error(
    `proof_record_not_accepted:${rebuilt.acceptance.blocking_gap_ids.join(",")}`
  );
  const existing = staging.listIndependentRecords("proof_record", current.run.run_id)
    .find((record) => (record as { record_id?: unknown }).record_id === rebuilt.record_id);
  const recorded = existing === undefined;
  if (existing && canonicalJson(existing) !== canonicalJson(rebuilt)) {
    throw new Error("proof_record_identity_conflict");
  }
  let run = current.run;
  if (!dryRun && recorded) {
    run = staging.mutateRunWithDatabase(current.run.run_id, (latestRun, database) => {
      staging.storeIndependentRecord(database, {
        recordKind: "proof_record",
        recordId: rebuilt.record_id,
        runId: latestRun.run_id,
        phaseId: latestRun.phase_id,
        taskPath: latestRun.task_path,
        createdAt: rebuilt.created_at,
        status: rebuilt.acceptance.status,
        summary: "Accepted Phase 23.9 proof record.",
        payload: rebuilt,
        retentionClass: "accepted"
      });
      const readback = staging.readIndependentRecord(database, "proof_record", rebuilt.record_id, latestRun.run_id);
      if (canonicalJson(readback) !== canonicalJson(rebuilt)) throw new Error("proof_record_readback_failed");
      return latestRun;
    }, {
      expectedRunInstanceId: current.run.run_instance_id,
      expectedRunRevision: current.run.run_revision,
      expectedRunPresence: "present"
    });
    writeCompatibilityRunArtifacts(roots.targetRoot, run);
  }
  const paths = resolveMemoryDbPaths(roots.targetRoot, roots.projectRoot, current.run.run_id);
  return {
    targetRoot: roots.targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath: current.runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: recorded ? "updated" : "loaded",
    recordKind: "proof_record",
    recordId: rebuilt.record_id,
    recorded
  };
}

export function recordRuntimeReviewCapabilityEvidence(
  cwd: string,
  options: RecordIndependentFileOptions
): RuntimeIndependentRecordResult {
  const roots = resolveHarnessRoots(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(roots.targetRoot, dryRun, options.runId);
  const absoluteFilePath = path.resolve(cwd, options.filePath);
  const fileBytes = fs.readFileSync(absoluteFilePath);
  const fileHash = `sha256:${sha256Hex(fileBytes)}`;
  if (!options.expectedSha || options.expectedSha !== fileHash) {
    throw new Error("review_capability_evidence_file_hash_mismatch");
  }
  if (current.run.run_instance_id === "4609d822-5065-4420-a20a-820ed1eec0a9"
    && (fileHash !== "sha256:c74dd9ed79e8813e4cfde9d70d45e637fc207e27fb656831ebabe5e5694d1f22"
      || absoluteFilePath !== path.join(
        roots.targetRoot,
        ".codex",
        "phase-23-9-cohort-resume-capability-evidence.md"
      ))) {
    throw new Error("review_capability_evidence_bootstrap_authority_mismatch");
  }
  const rawText = fileBytes.toString("utf8");
  let parsed: Record<string, unknown>;
  if (fileHash === "sha256:c74dd9ed79e8813e4cfde9d70d45e637fc207e27fb656831ebabe5e5694d1f22") {
    const rows = rawText.split(/\r?\n/u).filter((line) =>
      line.startsWith("| plan-review continuation |")
      || line.startsWith("| architecture-review continuation |"));
    if (rows.length !== 2 || rows.some((row) =>
      !row.includes("`openai`, `gpt-5.6-sol`, `high`, `read-only`, `never`")
      || !row.includes("`openai`, `gpt-5.6-sol`, `high`, `danger-full-access`, `never`")
      || !row.includes("`sandbox_mismatch`"))) {
      throw new Error("review_capability_evidence_labels_invalid");
    }
    const observations = rows.map((row) => {
      const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
      return {
        attempt: cells[0],
        saved_thread: cells[1].replace(/`/gu, ""),
        requested: {
          provider: "openai", model: "gpt-5.6-sol", reasoning: "high",
          sandbox: "read-only", approval_policy: "never"
        },
        observed: {
          provider: "openai", model: "gpt-5.6-sol", reasoning: "high",
          sandbox: "danger-full-access", approval_policy: "never"
        },
        outcome: "sandbox_mismatch"
      };
    });
    const semantic = {
      schema_version: 1,
      record_kind: "review_capability_evidence",
      safe_session_resume: false,
      observations
    };
    parsed = {
      ...semantic,
      capability_id: `sha256:${sha256Hex(canonicalJson(semantic))}`
    };
  } else {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  }
  if (parsed.schema_version !== 1 || parsed.record_kind !== "review_capability_evidence"
    || parsed.safe_session_resume !== false || !Array.isArray(parsed.observations)
    || parsed.observations.length !== 2 || typeof parsed.capability_id !== "string") {
    throw new Error("review_capability_evidence_invalid");
  }
  const semantic = { ...parsed };
  delete semantic.capability_id;
  const expectedId = `sha256:${sha256Hex(canonicalJson(semantic))}`;
  if (parsed.capability_id !== expectedId) throw new Error("review_capability_evidence_identity_mismatch");
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, current.run.run_id);
  const existing = staging.listIndependentRecords("review_capability_evidence", current.run.run_id)
    .find((record) => (record as { capability_id?: unknown }).capability_id === expectedId);
  const recorded = existing === undefined;
  if (existing && canonicalJson(existing) !== canonicalJson(parsed)) {
    throw new Error("review_capability_evidence_conflict");
  }
  let run = current.run;
  if (!dryRun && recorded) {
    run = staging.mutateRunWithDatabase(current.run.run_id, (latestRun, database) => {
      staging.storeIndependentRecord(database, {
        recordKind: "review_capability_evidence",
        recordId: expectedId,
        runId: latestRun.run_id,
        phaseId: latestRun.phase_id,
        taskPath: latestRun.task_path,
        createdAt: typeof parsed.created_at === "string" ? parsed.created_at : nowIso(),
        status: "safe_session_resume=false",
        summary: "Observed review session resume capability evidence.",
        payload: parsed,
        retentionClass: "audit"
      });
      return latestRun;
    }, {
      expectedRunInstanceId: current.run.run_instance_id,
      expectedRunRevision: current.run.run_revision,
      expectedRunPresence: "present"
    });
    writeCompatibilityRunArtifacts(roots.targetRoot, run);
  }
  const paths = resolveMemoryDbPaths(roots.targetRoot, roots.projectRoot, current.run.run_id);
  return {
    targetRoot: roots.targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath: current.runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: recorded ? "updated" : "loaded",
    recordKind: "review_capability_evidence",
    recordId: expectedId,
    recorded
  };
}

export async function recordRuntimeNextTask(cwd: string, options: RecordNextTaskOptions): Promise<RuntimeNextTaskDecisionResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "next-task decision recording");
  if (
    current.run.lifecycle_status !== "closed"
    && current.run.lifecycle_status !== "harvested"
    && current.run.lifecycle_status !== "discarded"
  ) {
    throw new Error(
      `Next-task decisions require closeout or harvest context. Run ${current.run.run_id} is still ${current.run.lifecycle_status}.`
    );
  }
  if (options.noSuccessor) {
    if (!options.reason?.trim() || !options.decisionOwner?.trim() || !options.approvalId?.trim()) {
      throw new Error("--no-successor requires --reason, --decision-owner, and --approval-id.");
    }
    if (options.taskPath || options.baseCommit || options.filePath || options.baseRef) {
      throw new Error("--no-successor is mutually exclusive with --task, --base-commit, --base-ref, and --file.");
    }
    const noSuccessorDecisionId = `sha256:${sha256Hex(canonicalJson({
      run_instance_id: current.run.run_instance_id,
      reason: options.reason,
      decision_owner_id: options.decisionOwner,
      decision_approval_id: options.approvalId
    }))}`;
    const disposition = buildSuccessorDisposition({
      source_run_instance_id: current.run.run_instance_id ?? "",
      disposition: "no_successor",
      next_task_decision_id: null,
      next_task: null,
      no_successor: {
        reason: options.reason,
        decision_owner_id: options.decisionOwner,
        decision_approval_id: options.approvalId,
        no_successor_decision_id: noSuccessorDecisionId as `sha256:${string}`
      }
    });
    const timestamp = nowIso();
    const decision: Decision = {
      decision_id: disposition.record_id,
      title: "No successor selected",
      rationale: canonicalJson(disposition),
      created_at: timestamp
    };
    let run = current.run;
    let recorded = !run.decisions.some((entry) => entry.decision_id === decision.decision_id);
    if (dryRun) {
      if (recorded) {
        run = recordDecision(run, {
          decisionId: decision.decision_id,
          title: decision.title,
          rationale: decision.rationale,
          createdAt: decision.created_at
        });
      }
    } else {
      const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
      run = staging.mutateRunWithDatabase(current.run.run_id, (latestRun, database) => {
        const duplicate = latestRun.decisions.some((entry) => entry.decision_id === decision.decision_id);
        recorded = !duplicate;
        staging.storeIndependentRecord(database, {
          recordKind: "successor_disposition",
          recordId: disposition.record_id,
          runId: latestRun.run_id,
          phaseId: latestRun.phase_id,
          taskPath: latestRun.active_task_path ?? latestRun.task_path,
          createdAt: timestamp,
          status: "no_successor",
          summary: "Explicit no-successor disposition",
          payload: disposition,
          retentionClass: "accepted"
        });
        return duplicate ? latestRun : recordDecision(latestRun, {
          decisionId: decision.decision_id,
          title: decision.title,
          rationale: decision.rationale,
          createdAt: decision.created_at
        });
      }, {
        expectedRunInstanceId: current.run.run_instance_id,
        expectedRunRevision: current.run.run_revision
      });
      writeCompatibilityRunArtifacts(targetRoot, run);
    }
    const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, current.run.run_id);
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      run,
      runPath: current.runPath,
      projectDbPath: paths.projectDbPath,
      stagingDbPath: paths.stagingDbPath,
      state: "updated",
      decision,
      recorded
    };
  }
  if (!options.taskPath || !options.baseCommit || !options.filePath) {
    throw new Error("--task, --base-commit, and --file are required unless --no-successor is used.");
  }
  const absoluteSourcePath = path.resolve(targetRoot, options.filePath);
  ensureInsideTargetRoot(targetRoot, absoluteSourcePath);

  if (!fs.existsSync(absoluteSourcePath) || !fs.statSync(absoluteSourcePath).isFile()) {
    throw new Error(`Next-task decision source artifact not found: ${options.filePath}`);
  }

  const sourceMarkdown = fs.readFileSync(absoluteSourcePath, "utf8");
  if (sourceMarkdown.trim().length === 0) {
    throw new Error(`Next-task decision source artifact is empty: ${options.filePath}`);
  }

  const resolvedTask = resolveTaskReference(targetRoot, options.taskPath);
  const nextTaskPath = resolvedTask.activeTaskPath ?? resolvedTask.taskPath;
  const baseCommitSha = resolveExactCommit(targetRoot, options.baseCommit);
  if (options.baseRef) {
    const resolvedBaseRef = resolveExactCommit(targetRoot, options.baseRef);
    if (resolvedBaseRef !== baseCommitSha) {
      throw new Error(
        `Base ref ${options.baseRef} no longer points to recorded base commit ${baseCommitSha}.`
      );
    }
  }

  const artifactHash = sha256Hex(sourceMarkdown);
  const artifact: ArtifactRef = {
    artifact_id: `sha256:${artifactHash}`,
    path: toPortablePath(path.join("evidence", `next-task-source-${artifactHash.slice(0, 12)}.md`)),
    kind: "next-task-decision-source",
    description: toRepoRelative(targetRoot, absoluteSourcePath)
  };
  const decisionRecord: NextTaskDecisionRecord = {
    next_task_decision_id: `sha256:${sha256Hex(canonicalJson({
      source_run_instance_id: current.run.run_instance_id,
      task_path: nextTaskPath,
      base_commit_sha: baseCommitSha,
      source_artifact_identity: artifact.artifact_id,
      decision_record_identity: null
    }))}`,
    source_run_instance_id: current.run.run_instance_id ?? "",
    task_path: nextTaskPath,
    base_commit_sha: baseCommitSha,
    source_artifact_identity: artifact.artifact_id,
    decision_record_identity: null,
    ...(options.baseRef ? { base_ref: options.baseRef } : {})
  };
  const evidence: EvidenceRef = {
    evidence_id: `next-task-decision-${decisionRecord.next_task_decision_id.slice("sha256:".length, "sha256:".length + 12)}`,
    kind: "next-task-decision",
    summary: "next-task-decision",
    artifact_id: artifact.artifact_id,
    path: artifact.path
  };
  const decision: Decision = {
    decision_id: decisionRecord.next_task_decision_id,
    title: "Next task selected",
    rationale: canonicalJson(decisionRecord),
    created_at: nowIso()
  };
  const successorDisposition = buildSuccessorDisposition({
    source_run_instance_id: current.run.run_instance_id ?? "",
    disposition: "selected_successor",
    next_task_decision_id: decisionRecord.next_task_decision_id as `sha256:${string}`,
    next_task: {
      task_path: nextTaskPath,
      base_commit_sha: baseCommitSha,
      source_artifact_identity: artifact.artifact_id as `sha256:${string}`
    },
    no_successor: null
  });

  let run = current.run;
  let finalDecision = decision;
  let recorded = true;
  const absoluteArtifactPath = path.join(runDirectory(targetRoot, current.run.run_id), artifact.path);

  if (!dryRun) {
    fs.mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
    fs.writeFileSync(absoluteArtifactPath, sourceMarkdown, "utf8");
  }

  if (dryRun) {
    const duplicateDecision = run.decisions.find((entry) => entry.decision_id === decision.decision_id);
    recorded = !duplicateDecision;
    finalDecision = duplicateDecision ?? decision;
    if (!run.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id)) {
      run = withUpdatedAt({ ...run, artifacts: [...run.artifacts, artifact] }, decision.created_at);
    }
    if (!run.evidence.some((entry) => entry.evidence_id === evidence.evidence_id)) {
      run = withUpdatedAt({ ...run, evidence: [...run.evidence, evidence] }, decision.created_at);
    }
    if (!duplicateDecision) {
      run = recordDecision(run, {
        decisionId: finalDecision.decision_id,
        title: finalDecision.title,
        rationale: finalDecision.rationale,
        createdAt: finalDecision.created_at
      });
    }
  } else {
    const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
    if (!staging.loadRun(current.run.run_id)) {
      staging.saveRun(current.run);
    }
    run = staging.mutateRunWithDatabase(current.run.run_id, (latestRun, database) => {
      assertNoActiveReviewLaunchClaim(latestRun, "next-task decision recording");
      const duplicateDecision = latestRun.decisions.find((entry) => entry.decision_id === decision.decision_id);
      recorded = !duplicateDecision;
      finalDecision = duplicateDecision ?? decision;
      let next = latestRun;
      if (!latestRun.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id)) {
        next = withUpdatedAt({ ...next, artifacts: [...next.artifacts, artifact] }, decision.created_at);
      }
      if (!next.evidence.some((entry) => entry.evidence_id === evidence.evidence_id)) {
        next = withUpdatedAt({ ...next, evidence: [...next.evidence, evidence] }, decision.created_at);
      }
      if (!duplicateDecision) {
        next = recordDecision(next, {
          decisionId: finalDecision.decision_id,
          title: finalDecision.title,
          rationale: finalDecision.rationale,
          createdAt: finalDecision.created_at
        });
      }
      staging.storeIndependentRecord(database, {
        recordKind: "successor_disposition",
        recordId: successorDisposition.record_id,
        runId: latestRun.run_id,
        phaseId: latestRun.phase_id,
        taskPath: latestRun.active_task_path ?? latestRun.task_path,
        createdAt: decision.created_at,
        status: "selected_successor",
        summary: "Selected successor disposition",
        payload: successorDisposition,
        retentionClass: "accepted"
      });
      return next;
    }, {
      expectedRunInstanceId: current.run.run_instance_id,
      expectedRunRevision: current.run.run_revision
    });
    writeCompatibilityRunArtifacts(targetRoot, run);
  }

  const runPath = dryRun ? current.runPath : runFilePath(targetRoot, run.run_id);
  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);
  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: dryRun && current.state === "preview" ? "preview" : "updated",
    decision: finalDecision,
    evidence,
    artifact,
    recorded
  };
}

export async function materializeRuntimeNextTask(
  cwd: string,
  options: MaterializeNextTaskOptions
): Promise<RuntimeTaskMaterializationResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "next-task materialization");
  const { record } = readNextTaskDecision(current.run, options.decisionId);
  const resolvedTask = resolveTaskReference(targetRoot, options.taskPath);
  const nextTaskPath = resolvedTask.activeTaskPath ?? resolvedTask.taskPath;
  const createMode = options.create === true;
  const enterExistingMode = options.enterExisting === true;
  const recoverExistingActivation = options.recoverExistingActivation === true;

  if (createMode) {
    throw new Error(
      "HANDOFF_CREATION_FAILED: Harness cannot create a successor branch/worktree. " +
      "next_allowed_action=create the successor with Codex Desktop create_thread, verify native/Git/TaskState readback, then rerun with --enter-existing."
    );
  }

  if (!enterExistingMode) {
    throw new Error("--enter-existing is required after Codex Desktop creates the successor task/worktree.");
  }
  if (recoverExistingActivation && !enterExistingMode) {
    throw new Error("--recover-existing-activation requires --enter-existing.");
  }

  if (record.task_path !== nextTaskPath) {
    throw new Error(`Materialization task mismatch. Decision expects ${record.task_path}, got ${nextTaskPath}.`);
  }

  if (record.base_ref) {
    const currentBaseRefCommit = resolveExactCommit(targetRoot, record.base_ref);
    if (currentBaseRefCommit !== record.base_commit_sha) {
      throw new Error(
        `Recorded base ref ${record.base_ref} moved from ${record.base_commit_sha} to ${currentBaseRefCommit}.`
      );
    }
  }

  const absoluteWorktreePath = path.resolve(targetRoot, options.worktreePath);
  const nextAction = buildMaterializationHandoffAction(absoluteWorktreePath);
  let recoveredTaskStateId: string | undefined;
  let normalTaskStateId: string | undefined;
  try {
    if (!fs.existsSync(absoluteWorktreePath)) {
      throw new Error(`Existing Desktop-created worktree path does not exist: ${absoluteWorktreePath}`);
    }
    if (!worktreePathExistsInGit(targetRoot, absoluteWorktreePath)) {
      throw new Error(`Existing Desktop-created worktree is not registered with git: ${absoluteWorktreePath}`);
    }

    if (gitCurrentBranch(absoluteWorktreePath) !== options.branch) {
      throw new Error(`Materialized worktree branch mismatch. Expected ${options.branch}.`);
    }

    if (!recoverExistingActivation && resolveExactCommit(absoluteWorktreePath, "HEAD") !== record.base_commit_sha) {
      throw new Error(`Materialized worktree HEAD does not match the recorded base commit ${record.base_commit_sha}.`);
    }

    if (getGitStatusLines(absoluteWorktreePath).length > 0) {
      throw new Error(`Materialized worktree is dirty: ${absoluteWorktreePath}`);
    }

    const absoluteTaskContractPath = path.join(absoluteWorktreePath, nextTaskPath);
    if (!fs.existsSync(absoluteTaskContractPath) || !fs.statSync(absoluteTaskContractPath).isFile()) {
      throw new Error(`Next task contract is missing in the materialized worktree: ${nextTaskPath}`);
    }

    if (recoverExistingActivation) {
      assertRecoverableExistingActivation(absoluteWorktreePath, record.base_commit_sha, nextTaskPath);
      validateRecoveredMaterializedTaskStateOwner(
        roots.projectRoot,
        absoluteWorktreePath,
        options.branch,
        record.base_commit_sha
      );
      if (dryRun) {
        return {
          targetRoot,
          projectRoot: roots.projectRoot,
          dryRun,
          decisionId: record.next_task_decision_id,
          branch: options.branch,
          worktreePath: absoluteWorktreePath,
          taskPath: nextTaskPath,
          created: false,
          recoveredExistingActivation: true,
          handoffRequired: true,
          nextAction,
          state: "preview"
        };
      }
      recoveredTaskStateId = ensureRecoveredMaterializedTaskStateOwner(
        roots.projectRoot,
        absoluteWorktreePath,
        options.branch,
        record.base_commit_sha
      );
    }

    if (!recoverExistingActivation) {
      if (current.run.run_mode === "bootstrap") {
        const materialized = materializeZeroOwnerTaskState({
          projectRoot: roots.projectRoot,
          worktreePath: absoluteWorktreePath,
          branch: options.branch,
          baseCommitSha: record.base_commit_sha,
          taskPath: nextTaskPath,
          sourceArtifactIdentity: record.source_artifact_identity as `sha256:${string}`,
          pointerContents: buildNextTaskPointerMarkdown(nextTaskPath),
          dryRun
        });
        normalTaskStateId = materialized.task_state_id;
      } else if (!dryRun) {
        fs.writeFileSync(
          path.join(absoluteWorktreePath, "TASK.md"),
          buildNextTaskPointerMarkdown(nextTaskPath),
          "utf8"
        );
        persistMaterializedTaskBaseAuthority(
          roots.projectRoot,
          absoluteWorktreePath,
          options.branch,
          record.base_commit_sha
        );
      }
    } else if (!dryRun) {
      persistMaterializedTaskBaseAuthority(
        roots.projectRoot,
        absoluteWorktreePath,
        options.branch,
        record.base_commit_sha
      );
    }

    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      decisionId: record.next_task_decision_id,
      branch: options.branch,
      worktreePath: absoluteWorktreePath,
      taskPath: nextTaskPath,
      created: false,
      recoveredExistingActivation: recoverExistingActivation,
      ...((recoveredTaskStateId ?? normalTaskStateId)
        ? { taskStateId: recoveredTaskStateId ?? normalTaskStateId }
        : {}),
      handoffRequired: true,
      nextAction,
      state: dryRun ? "preview" : "prepared"
    };
  } catch (error) {
    if (recoveredTaskStateId) {
      fs.rmSync(getTaskDirectory(roots.projectRoot, recoveredTaskStateId), { recursive: true, force: true });
    }

    throw error;
  }
}

export function getRuntimeStatus(cwd: string, options: RuntimeDryRunOptions = {}): RuntimeServiceResult {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId, false);
  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, current.run.run_id);

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run: current.run,
    runPath: current.runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: current.state
  };
}

function readUtf8FileIfExists(targetPath: string): string | undefined {
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return undefined;
  }

  return fs.readFileSync(targetPath, "utf8");
}

function parseReviewRecommendation(
  markdown: string,
  options: {
    extraVariants?: ReadonlyArray<{ normalized: "PASS" | "FIX_REQUIRED"; variant: string }>;
  } = {}
): string | undefined {
  const sectionMatch = /## Recommendation\s*\n([\s\S]*?)(?=\n## |\s*$)/i.exec(markdown);

  if (!sectionMatch?.[1]) {
    return undefined;
  }

  const lines = sectionMatch[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeReviewRecommendationLine(lines[index], options.extraVariants);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeReviewRecommendationLine(
  line: string,
  extraVariants: ReadonlyArray<{ normalized: "PASS" | "FIX_REQUIRED"; variant: string }> = []
): "PASS" | "FIX_REQUIRED" | "AMEND_REQUIRED" | "BLOCKED" | undefined {
  const normalizedLine = line.trim().toUpperCase();

  if (!normalizedLine) {
    return undefined;
  }

  if (STRICT_REVIEW_RECOMMENDATION_TOKENS.has(normalizedLine)) {
    return normalizedLine as "PASS" | "FIX_REQUIRED" | "AMEND_REQUIRED" | "BLOCKED";
  }

  for (const entry of extraVariants) {
    if (normalizedLine === entry.variant) {
      return entry.normalized;
    }

    if (!normalizedLine.endsWith(entry.variant)) {
      continue;
    }

    const prefix = normalizedLine.slice(0, -entry.variant.length).trimEnd();
    if (prefix.length === 0) {
      return entry.normalized;
    }

    const trailingSeparator = prefix[prefix.length - 1];
    if (trailingSeparator && ".:;()[]/-".includes(trailingSeparator)) {
      return entry.normalized;
    }
  }

  return undefined;
}

type CombinedArchitectureDbReviewVerdict = "PASS" | "FIX_REQUIRED";
type PlanningReviewVerdict = "PASS" | "AMEND_REQUIRED" | "BLOCKED";

interface CombinedArchitectureDbReviewVerdicts {
  architectureAuthority: CombinedArchitectureDbReviewVerdict;
  persistedStorage: CombinedArchitectureDbReviewVerdict;
}

function parseCombinedReviewVerdictSection(
  markdown: string,
  heading: string
): CombinedArchitectureDbReviewVerdict | undefined {
  const sectionPattern = new RegExp(
    `^##\\s+${escapeRegExpPattern(heading)}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
    "im"
  );
  const section = sectionPattern.exec(markdown)?.[1];

  if (!section) {
    return undefined;
  }

  for (const rawLine of section.split(/\r?\n/u)) {
    const token = rawLine.trim().replace(/^\*\*(.+)\*\*$/, "$1").trim().toUpperCase();
    if (token === "PASS") {
      return "PASS";
    }
    if (token === "FAIL" || token === "FIX_REQUIRED") {
      return "FIX_REQUIRED";
    }
  }

  return undefined;
}

function parseCombinedArchitectureDbReviewVerdicts(markdown: string): CombinedArchitectureDbReviewVerdicts | undefined {
  const architectureAuthority = parseCombinedReviewVerdictSection(markdown, "Architecture / Authority Verdict");
  const persistedStorage = parseCombinedReviewVerdictSection(markdown, "Persisted Storage / No-storage-change Verdict");

  if (!architectureAuthority || !persistedStorage) {
    return undefined;
  }

  return { architectureAuthority, persistedStorage };
}

function parsePlanningLensVerdict(
  markdown: string,
  procedureId: "architecture-review" | "db-storage-review"
): PlanningReviewVerdict | undefined {
  const heading = procedureId === "architecture-review"
    ? "Keep Or Defer Decision"
    : "Recommendation";
  const sectionPattern = new RegExp(
    `^##\\s+${escapeRegExpPattern(heading)}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
    "im"
  );
  const lines = sectionPattern.exec(markdown)?.[1]?.split(/\r?\n/u)
    .map((line) => line.trim()).filter(Boolean) ?? [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const token = lines[index].replace(/^\*\*(.+)\*\*$/u, "$1").trim().toUpperCase();
    if (["PASS", "AMEND_REQUIRED", "BLOCKED"].includes(token)) return token as PlanningReviewVerdict;
  }
  return undefined;
}

export function parsePlanningLensDocumentVerdict(
  markdown: string,
  procedureId: PlanningReviewLensId
): PlanningReviewVerdict {
  if (procedureId === "plan-review") {
    const validated = validatePlanReviewArtifact(markdown);
    if (!["PASS", "AMEND_REQUIRED", "BLOCKED"].includes(validated.recommendation)) {
      throw new Error("planning_review_document_verdict_invalid:plan-review");
    }
    return validated.recommendation as PlanningReviewVerdict;
  }
  const verdict = parsePlanningLensVerdict(markdown, procedureId);
  if (!verdict) throw new Error(`planning_review_document_verdict_invalid:${procedureId}`);
  return verdict;
}

export function validatePlanningLensDocumentVerdict(
  structuredVerdict: PlanningReviewVerdict,
  markdown: string,
  procedureId: PlanningReviewLensId
): PlanningReviewVerdict {
  const documentVerdict = parsePlanningLensDocumentVerdict(markdown, procedureId);
  if (documentVerdict !== structuredVerdict) {
    throw new Error(`PLANNING_REVIEW_VERDICT_MISMATCH:${procedureId}:${structuredVerdict}:${documentVerdict}`);
  }
  return documentVerdict;
}

function validatePlanReviewArtifact(markdown: string): {
  decisionRecord: PlanReviewDecisionRecord;
  recommendation: string;
  status: ReviewResultStatus;
  summary: string;
  blockers: string[];
} {
  const decisionRecord = parsePlanReviewDecisionRecord(markdown);
  if (!decisionRecord) {
    throw new Error("Plan review artifact is missing a complete durable decision record.");
  }

  const recommendation = parseReviewRecommendation(markdown);
  if (!recommendation) {
    throw new Error("Plan review artifact is missing a Recommendation section.");
  }

  const decision = interpretPlanReviewDecisionRecord(decisionRecord);
  if (decision.route === "blocked" && decision.stopReason === "invalid_plan_review_decision_record") {
    throw new Error("Plan review artifact durable decision record is internally inconsistent.");
  }

  const normalizedRecommendation = recommendation.toUpperCase();
  if (decision.route === "approval" && normalizedRecommendation !== "PASS") {
    throw new Error("Plan review artifact recommendation must be PASS when the durable decision record routes to approval.");
  }

  if (
    decision.route === "amend"
    && normalizedRecommendation !== "AMEND_REQUIRED"
    && normalizedRecommendation !== "FIX_REQUIRED"
  ) {
    throw new Error("Plan review artifact recommendation must require follow-up when the durable decision record routes to amendment.");
  }

  if (
    decision.route === "blocked"
    && normalizedRecommendation !== "BLOCKED"
    && normalizedRecommendation !== "FIX_REQUIRED"
  ) {
    throw new Error("Plan review artifact recommendation must remain blocked when the durable decision record routes to a blocker.");
  }

  if (decision.route === "approval") {
    return {
      decisionRecord,
      recommendation: normalizedRecommendation,
      status: "PASS",
      summary: "Plan review approved the plan",
      blockers: []
    };
  }

  const summary = decisionRecord.next_allowed_action || "Plan review requires follow-up";
  return {
    decisionRecord,
    recommendation: normalizedRecommendation,
    status: "FIX_REQUIRED",
    summary,
    blockers: [summary]
  };
}

const IMPLEMENTATION_REVIEW_REQUIRED_SECTIONS = [
  "Review Surface",
  "Findings",
  "Task And Plan Compliance",
  "Verification Coverage",
  "Policy Findings",
  "Source Trace",
  "Skill Risk Check",
  "Scope Creep Check",
  "Recommendation"
] as const;

function markdownHasSection(markdown: string, sectionName: string): boolean {
  const pattern = new RegExp(`^##\\s+${escapeRegExpPattern(sectionName)}\\s*$`, "im");
  return pattern.test(markdown);
}

function validateImplementationReviewArtifact(markdown: string): {
  recommendation: "PASS" | "FIX_REQUIRED";
  status: ReviewResultStatus;
  summary: string;
  blockers: string[];
} {
  for (const sectionName of IMPLEMENTATION_REVIEW_REQUIRED_SECTIONS) {
    if (!markdownHasSection(markdown, sectionName)) {
      throw new Error(`Implementation review artifact is missing required section: ${sectionName}.`);
    }
  }

  const recommendation = parseReviewRecommendation(markdown, {
    extraVariants: IMPLEMENTATION_REVIEW_RECOMMENDATION_VARIANTS
  });

  if (recommendation !== "PASS" && recommendation !== "FIX_REQUIRED") {
    throw new Error("Implementation review artifact Recommendation must end with PASS or FIX_REQUIRED.");
  }

  return {
    recommendation,
    status: recommendation,
    summary: recommendation === "PASS" ? "Implementation Review passed" : "Implementation Review requires follow-up",
    blockers: recommendation === "PASS" ? [] : ["Implementation Review requires follow-up"]
  };
}

function validateReviewLaunchArtifact(procedureId: string, markdown: string): {
  status: ReviewResultStatus;
  summary: string;
  blockers: string[];
} {
  if (procedureId === "plan-review") {
    return validatePlanReviewArtifact(markdown);
  }

  if (procedureId === "implementation-review") {
    return validateImplementationReviewArtifact(markdown);
  }

  if (procedureId === "fix-pass-review") {
    for (const sectionName of [
      "Original Findings",
      "Resolution Status",
      "Fix-pass Scope",
      "Scope Check",
      "Source Trace",
      "Verification Follow-up",
      "Recommendation"
    ]) {
      if (!markdownHasSection(markdown, sectionName)) {
        throw new Error(`Fix-pass review artifact is missing required section: ${sectionName}.`);
      }
    }
    const statuses = parseFixPassReviewStatuses(markdown);
    if (statuses.length === 0) {
      throw new Error("Fix-pass review artifact must report at least one numbered resolution status.");
    }
    const recommendation = parseReviewRecommendation(markdown);
    if (recommendation !== "PASS" && recommendation !== "FIX_REQUIRED") {
      throw new Error("Fix-pass review artifact Recommendation must end with PASS or FIX_REQUIRED.");
    }
    const unresolved = statuses.some((status) => status !== "resolved");
    if ((recommendation === "PASS") === unresolved) {
      throw new Error("Fix-pass review Recommendation conflicts with its resolution statuses.");
    }
    return {
      status: recommendation,
      summary: recommendation === "PASS" ? "Fix-pass Review passed" : "Fix-pass Review requires follow-up",
      blockers: recommendation === "PASS" ? [] : ["Fix-pass Review requires follow-up"]
    };
  }

  throw new Error(`Unsupported review launch procedure: ${procedureId}`);
}

function parseFixPassReviewStatuses(markdown: string): Array<"resolved" | "partially_resolved" | "unresolved"> {
  const sectionMatch = /## Resolution Status\s*\n([\s\S]*?)(?=\n## |\s*$)/i.exec(markdown);
  if (!sectionMatch?.[1]) {
    return [];
  }

  const matches = [...sectionMatch[1].matchAll(/^\s*\d+\.\s*`(resolved|partially_resolved|unresolved)`/gim)];
  return matches.map((match) => match[1] as "resolved" | "partially_resolved" | "unresolved");
}

function buildProcedureReviewResult(
  run: Run,
  procedureId: string,
  artifact: ArtifactRef,
  markdown: string,
  timestamp: string
): ReviewResult | undefined {
  if (procedureId === "plan-review") {
    const validated = validatePlanReviewArtifact(markdown);
    return {
      review_result_id: nextId("review", run.review_results.length),
      status: validated.status,
      created_at: timestamp,
      summary: validated.summary,
      source: `procedure:${procedureId}`,
      blockers: validated.blockers,
      artifact_refs: [artifact]
    };
  }

  if (procedureId === "fix-pass-review") {
    const statuses = parseFixPassReviewStatuses(markdown);
    if (statuses.length === 0) {
      return undefined;
    }

    const hasUnresolved = statuses.some((status) => status !== "resolved");
    return {
      review_result_id: nextId("review", run.review_results.length),
      status: hasUnresolved ? "FIX_REQUIRED" : "PASS",
      created_at: timestamp,
      summary: hasUnresolved ? "Fix-pass Review requires follow-up" : "Fix-pass Review passed",
      source: `procedure:${procedureId}`,
      blockers: hasUnresolved ? ["Fix-pass Review requires follow-up"] : [],
      artifact_refs: [artifact]
    };
  }

  const combinedVerdicts = parseCombinedArchitectureDbReviewVerdicts(markdown);
  const combinedVerdict = procedureId === "architecture-review"
    ? combinedVerdicts?.architectureAuthority
    : procedureId === "db-storage-review"
      ? combinedVerdicts?.persistedStorage
      : undefined;

  if (combinedVerdict) {
    const label = procedureId === "architecture-review"
      ? "Architecture / authority review"
      : "Persisted storage / no-storage-change review";
    return {
      review_result_id: nextId("review", run.review_results.length),
      status: combinedVerdict,
      created_at: timestamp,
      summary: combinedVerdict === "PASS" ? `${label} passed` : `${label} requires follow-up`,
      source: `procedure:${procedureId}`,
      blockers: combinedVerdict === "PASS" ? [] : [`${label} requires follow-up`],
      artifact_refs: [artifact]
    };
  }

  const planningVerdict = procedureId === "architecture-review" || procedureId === "db-storage-review"
    ? parsePlanningLensVerdict(markdown, procedureId)
    : undefined;
  if (planningVerdict) {
    const label = procedureId === "architecture-review"
      ? "Architecture / authority review"
      : "Persisted storage / no-storage-change review";
    return {
      review_result_id: nextId("review", run.review_results.length),
      status: planningVerdict === "PASS" ? "PASS" : "FIX_REQUIRED",
      created_at: timestamp,
      summary: planningVerdict === "PASS" ? `${label} passed` : `${label} requires follow-up`,
      source: `procedure:${procedureId}`,
      blockers: planningVerdict === "PASS" ? [] : [`${label} requires follow-up`],
      artifact_refs: [artifact]
    };
  }

  const recommendation = parseReviewRecommendation(
    markdown,
    procedureId === "implementation-review"
      ? { extraVariants: IMPLEMENTATION_REVIEW_RECOMMENDATION_VARIANTS }
      : undefined
  );

  if (!recommendation) {
    return undefined;
  }

  let status: ReviewResultStatus = "UNKNOWN";
  let summary = `${capitalizeWords(procedureId)} review recorded.`;
  const blockers: string[] = [];

  if (recommendation === "PASS") {
    status = "PASS";
    summary = `${capitalizeWords(procedureId)} passed`;
  } else if (
    recommendation === "FIX_REQUIRED"
    || (procedureId !== "implementation-review" && (recommendation === "AMEND_REQUIRED" || recommendation === "BLOCKED"))
  ) {
    status = "FIX_REQUIRED";
    summary = `${capitalizeWords(procedureId)} requires follow-up`;
    blockers.push(summary);
  }

  if (status === "UNKNOWN") {
    return undefined;
  }

  return {
    review_result_id: nextId("review", run.review_results.length),
    status,
    created_at: timestamp,
    summary,
    source: `procedure:${procedureId}`,
    blockers,
    artifact_refs: [artifact]
  };
}

function resolveOperatorTaskContext(targetRoot: string): OperatorTaskContext | undefined {
  const taskPath = path.join(targetRoot, "TASK.md");
  const taskMarkdown = readUtf8FileIfExists(taskPath);

  if (!taskMarkdown) {
    return undefined;
  }

  const referencedTaskPath = extractActiveTaskPath(taskMarkdown);

  if (!referencedTaskPath) {
    return undefined;
  }

  const absoluteActiveTaskPath = path.resolve(targetRoot, referencedTaskPath);
  const relative = path.relative(targetRoot, absoluteActiveTaskPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }

  const activeTaskMarkdown = readUtf8FileIfExists(absoluteActiveTaskPath);

  if (!activeTaskMarkdown) {
    return undefined;
  }

  const activeTaskPath = toRepoRelative(targetRoot, absoluteActiveTaskPath);
  const phaseId = inferPhaseIdFromText(activeTaskMarkdown) ?? inferPhaseIdFromPath(activeTaskPath);

  if (!phaseId) {
    return undefined;
  }

  return {
    taskPath: "TASK.md",
    activeTaskPath,
    phaseId,
    taskMarkdown,
    activeTaskMarkdown
  };
}

function readRoadmapTaskPathForPhase(targetRoot: string, phaseId: string): string | undefined {
  const roadmapPath = path.join(targetRoot, "docs", "IMPLEMENTATION_ROADMAP.md");
  const roadmap = readUtf8FileIfExists(roadmapPath);

  if (!roadmap) {
    return undefined;
  }

  const headingPattern = /^##\s+Phase\s+([0-9]+(?:\.[0-9]+)*(?:[A-Z][0-9]*)*)\b.*$/gm;
  const headings = [...roadmap.matchAll(headingPattern)];
  const currentHeadingIndex = headings.findIndex((match) => match[1] === phaseId);

  if (currentHeadingIndex === -1) {
    return undefined;
  }

  const sectionStart = headings[currentHeadingIndex]?.index;

  if (sectionStart === undefined) {
    return undefined;
  }

  const sectionEnd = headings[currentHeadingIndex + 1]?.index ?? roadmap.length;
  const section = roadmap.slice(sectionStart, sectionEnd);

  if (!section) {
    return undefined;
  }

  const taskPath = /Task:\s*`([^`]+)`/m.exec(section)?.[1]?.trim();
  return taskPath && taskPath.length > 0 ? taskPath : undefined;
}

function readCurrentRunPointer(targetRoot: string): { runId: string; runPath: string } | undefined {
  const pointerPath = path.join(targetRoot, RUNTIME_RUNS_DIR, CURRENT_RUN_FILE);
  const raw = readUtf8FileIfExists(pointerPath);

  if (!raw) {
    return undefined;
  }

  const pointer = assertObject(JSON.parse(raw) as unknown, "runtime current pointer");
  assertRequiredString(pointer, "run_id", "runtime current pointer");
  assertRequiredString(pointer, "run_path", "runtime current pointer");

  const runPath = path.resolve(path.join(targetRoot, RUNTIME_RUNS_DIR), String(pointer.run_path));
  const relative = path.relative(path.join(targetRoot, RUNTIME_RUNS_DIR), runPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Runtime current pointer resolves outside .harness/runs.");
  }

  return {
    runId: String(pointer.run_id),
    runPath
  };
}

function readRunJsonForOperator(targetRoot: string, runId: string, explicitPath?: string): { run: Run; runPath: string } | undefined {
  const runPath = explicitPath ?? path.join(targetRoot, RUNTIME_RUNS_DIR, runId, RUN_FILE);
  const raw = readUtf8FileIfExists(runPath);

  if (!raw) {
    return undefined;
  }

  return {
    run: validateRuntimeRun(JSON.parse(raw) as unknown),
    runPath
  };
}

function readCloseoutReceiptForOperator(targetRoot: string, runId: string): { receipt: CloseoutReceipt; closeoutPath: string } | undefined {
  const closeoutPath = path.join(targetRoot, RUNTIME_RUNS_DIR, runId, CLOSEOUT_FILE);
  const raw = readUtf8FileIfExists(closeoutPath);

  if (!raw) {
    return undefined;
  }

  return {
    receipt: validateCloseoutReceipt(JSON.parse(raw) as unknown),
    closeoutPath
  };
}

function readQuarantinedPayloadCountReadOnly(databasePath: string): { count: number; note?: string } {
  if (!fs.existsSync(databasePath) || !fs.statSync(databasePath).isFile()) {
    return { count: 0 };
  }

  try {
    const sqlite = require("node:sqlite") as { DatabaseSync?: new (database: string, options?: Record<string, unknown>) => {
      prepare(sql: string): { get(...params: unknown[]): unknown };
      close(): void;
    } };

    if (typeof sqlite.DatabaseSync !== "function") {
      return {
        count: 0,
        note: `notes: unable to inspect quarantine state because node:sqlite DatabaseSync is unavailable for ${formatDatabasePath(path.dirname(path.dirname(databasePath)), databasePath)}`
      };
    }

    const databaseUri = pathToFileURL(databasePath);
    databaseUri.searchParams.set("mode", "ro");
    databaseUri.searchParams.set("immutable", "1");
    const database = new sqlite.DatabaseSync(databaseUri.href, { readOnly: true });

    try {
      const hasPayloadIndex = Number(
        ((database.prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'payload_index';"
        ).get() as { count?: number } | undefined)?.count ?? 0)
      );

      if (hasPayloadIndex === 0) {
        return { count: 0 };
      }

      return {
        count: Number(
          ((database.prepare(
            "SELECT COUNT(*) AS count FROM payload_index WHERE retention_class = ?;"
          ).get("quarantine") as { count?: number } | undefined)?.count ?? 0)
        )
      };
    } finally {
      database.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      count: 0,
      note: `quarantine probe unavailable: ${message}`
    };
  }
}

function loadOperatorRunContext(
  targetRoot: string,
  projectRoot: string,
  runId?: string,
  runOverride?: Run
): OperatorRunContext | undefined {
  const resolvedRun = runOverride
    ? {
        run: runOverride,
        runPath: runFilePath(targetRoot, runOverride.run_id)
      }
    : runId
    ? readRunJsonForOperator(targetRoot, runId)
    : (() => {
        const current = readCurrentRunPointer(targetRoot);
        return current ? readRunJsonForOperator(targetRoot, current.runId, current.runPath) : undefined;
      })();

  if (!resolvedRun) {
    return undefined;
  }

  const closeout = readCloseoutReceiptForOperator(targetRoot, resolvedRun.run.run_id);
  const paths = resolveMemoryDbPaths(targetRoot, projectRoot, resolvedRun.run.run_id);
  const quarantine = paths.stagingDbPath
    ? readQuarantinedPayloadCountReadOnly(paths.stagingDbPath)
    : { count: 0 };

  return {
    run: resolvedRun.run,
    runPath: resolvedRun.runPath,
    ...(closeout ? { closeoutReceipt: closeout.receipt, closeoutPath: closeout.closeoutPath } : {}),
    quarantinedPayloadCount: quarantine.count,
    notes: quarantine.note ? [quarantine.note] : []
  };
}

function scanPhase236ProcedureIds(targetRoot: string): Set<string> {
  const skillsRoot = path.join(targetRoot, "skills", "self-hosting");

  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    return new Set();
  }

  const procedureIds = new Set<string>();

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
    const content = readUtf8FileIfExists(skillPath);
    const procedureId = content ? /## procedure_id\s+`([^`]+)`/m.exec(content)?.[1]?.trim() : undefined;

    if (procedureId) {
      procedureIds.add(procedureId);
    }
  }

  return procedureIds;
}

function readPhase236ProcedureIds(targetRoot: string, registry?: SelfHostingProcedureRegistry): Set<string> {
  if (registry) {
    return new Set(registry.procedures.map((procedure) => procedure.procedure_id));
  }

  return scanPhase236ProcedureIds(targetRoot);
}

function readTaggedProcedureId(value: string | undefined, procedureIds: Set<string>): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  for (const procedureId of procedureIds) {
    if (
      normalized === procedureId ||
      normalized === `procedure:${procedureId}` ||
      normalized === `procedure_id:${procedureId}`
    ) {
      return procedureId;
    }
  }

  return undefined;
}

function collectTaggedProcedureEvidence(run: Run, procedureIds: Set<string>): Set<string> {
  const tagged = new Set<string>();

  for (const artifact of run.artifacts) {
    const procedureId = readTaggedProcedureId(artifact.kind, procedureIds) ?? readTaggedProcedureId(artifact.description, procedureIds);

    if (procedureId) {
      tagged.add(procedureId);
    }
  }

  for (const evidence of run.evidence) {
    const procedureId = readTaggedProcedureId(evidence.kind, procedureIds) ?? readTaggedProcedureId(evidence.summary, procedureIds);

    if (procedureId) {
      tagged.add(procedureId);
    }
  }

  return tagged;
}

function getProcedureRequiredInputs(
  context: OperatorEvaluationContext,
  procedureId: string,
  fallbackInputs: string[]
): string[] {
  const inputs = context.proceduresById?.get(procedureId)?.required_inputs;
  return inputs && inputs.length > 0 ? inputs : fallbackInputs;
}

function hasDurableReviewOutcome(review: ReviewResult | undefined): boolean {
  return !!review && review.status !== "MISSING" && review.status !== "UNKNOWN";
}

const PLAN_REVIEW_DURABLE_FIELD_NAMES = [
  "verdict",
  "outcome_state",
  "blocking_findings",
  "required_amendments",
  "accepted_defaults",
  "real_operator_choices",
  "next_allowed_action",
  "validation_required",
  "source_trace",
  "future_phase_deferrals"
] as const;

function parsePlanReviewDecisionRecord(markdown: string): PlanReviewDecisionRecord | undefined {
  const sectionMatch = /## Durable Decision Record\s*\n([\s\S]*?)(?=\n## |\s*$)/.exec(markdown);

  if (!sectionMatch?.[1]) {
    return undefined;
  }

  const section = sectionMatch[1];
  const values = new Map<string, string>();

  for (let index = 0; index < PLAN_REVIEW_DURABLE_FIELD_NAMES.length; index += 1) {
    const fieldName = PLAN_REVIEW_DURABLE_FIELD_NAMES[index];
    const nextFieldName = PLAN_REVIEW_DURABLE_FIELD_NAMES[index + 1];
    const pattern = nextFieldName
      ? new RegExp(`^${fieldName}:\\s*([\\s\\S]*?)^${nextFieldName}:`, "mi")
      : new RegExp(`^${fieldName}:\\s*([\\s\\S]*?)$`, "mi");
    const match = pattern.exec(section);
    const value = match?.[1]?.trim();

    if (!value) {
      return undefined;
    }

    values.set(fieldName, value);
  }

  return {
    verdict: values.get("verdict")!,
    outcome_state: values.get("outcome_state")!,
    blocking_findings: values.get("blocking_findings")!,
    required_amendments: values.get("required_amendments")!,
    accepted_defaults: values.get("accepted_defaults")!,
    real_operator_choices: values.get("real_operator_choices")!,
    next_allowed_action: values.get("next_allowed_action")!,
    validation_required: values.get("validation_required")!,
    source_trace: values.get("source_trace")!,
    future_phase_deferrals: values.get("future_phase_deferrals")!
  };
}

function normalizeDecisionToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^`([^`]+)`$/u, "$1")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function hasNamedRequiredAmendments(record: PlanReviewDecisionRecord): boolean {
  const normalized = normalizeDecisionToken(record.required_amendments);
  return normalized !== "" && normalized !== "none" && normalized !== "not_applicable" && normalized !== "n/a";
}

function interpretPlanReviewDecisionRecord(record: PlanReviewDecisionRecord): PlanReviewOperatorDecision {
  const outcomeState = normalizeDecisionToken(record.outcome_state);
  const verdict = normalizeDecisionToken(record.verdict);
  const requiresAmendments = hasNamedRequiredAmendments(record);
  const notes = [
    `plan_review_outcome_state: ${record.outcome_state}`,
    `plan_review_verdict: ${record.verdict}`
  ];

  if (
    outcomeState === "needs_contract_surface_update"
    || verdict === "amend_required"
    || requiresAmendments
  ) {
    return {
      route: "amend",
      stopReason: "plan_review_requires_amendment",
      nextAllowedAction: record.next_allowed_action,
      notes
    };
  }

  if (outcomeState === "ready_for_implementation" && verdict === "pass") {
    return {
      route: "approval",
      stopReason: "missing_plan_approval",
      nextAllowedAction: record.next_allowed_action,
      notes
    };
  }

  if (outcomeState === "decision_required") {
    return {
      route: "blocked",
      stopReason: "plan_review_operator_decision_required",
      nextAllowedAction: record.next_allowed_action,
      notes
    };
  }

  if (outcomeState === "blocked") {
    return {
      route: "blocked",
      stopReason: "plan_review_blocked",
      nextAllowedAction: record.next_allowed_action,
      notes
    };
  }

  return {
    route: "blocked",
    stopReason: "invalid_plan_review_decision_record",
    nextAllowedAction: record.next_allowed_action,
    notes: [...notes, "plan_review_decision_record_invalid: true"]
  };
}

function hasBlockingFindings(run: Run): boolean {
  return run.findings.some((finding) => finding.blocking && finding.status !== "resolved");
}

function escapeRegExpPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reviewSourceMatchesProcedure(source: string | undefined, procedureId: string): boolean {
  return source === `procedure:${procedureId}`;
}

function findLatestProcedureReviewResult(run: Run, procedureId: string): ReviewResult | undefined {
  for (let index = run.review_results.length - 1; index >= 0; index -= 1) {
    const review = run.review_results[index];
    if (reviewSourceMatchesProcedure(review.source, procedureId)) {
      return review;
    }
  }

  return undefined;
}

function reviewsShareArtifact(first: ReviewResult, second: ReviewResult): boolean {
  const firstArtifactIds = new Set(first.artifact_refs.map((artifact) => artifact.artifact_id));
  return second.artifact_refs.some((artifact) => firstArtifactIds.has(artifact.artifact_id));
}

function findLatestSuccessfulFixPassIndex(run: Run): number {
  for (let index = run.review_results.length - 1; index >= 0; index -= 1) {
    const review = run.review_results[index];
    if (review.status === "PASS" && reviewSourceMatchesProcedure(review.source, "fix-pass-review")) {
      return index;
    }
  }

  return -1;
}

function findLatestCombinedReviewFailureIndex(run: Run): number {
  for (let index = run.review_results.length - 1; index >= 0; index -= 1) {
    const review = run.review_results[index];
    if (
      review.status !== "PASS"
      && (reviewSourceMatchesProcedure(review.source, "architecture-review") || reviewSourceMatchesProcedure(review.source, "db-storage-review"))
    ) {
      return index;
    }
  }

  return -1;
}

function findLatestProcedureReviewResultForAny(run: Run, procedureIds: string[]): ReviewResult | undefined {
  for (let index = run.review_results.length - 1; index >= 0; index -= 1) {
    const review = run.review_results[index];
    if (procedureIds.some((procedureId) => reviewSourceMatchesProcedure(review.source, procedureId))) {
      return review;
    }
  }

  return undefined;
}

function findLatestProcedureEvidence(
  run: Run,
  procedureIds: Set<string>,
  procedureId: string
): EvidenceRef | undefined {
  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    const taggedProcedureId = readTaggedProcedureId(evidence.kind, procedureIds)
      ?? readTaggedProcedureId(evidence.summary, procedureIds);

    if (taggedProcedureId === procedureId) {
      return evidence;
    }
  }

  return undefined;
}

function findLatestReviewLaunchAttemptEvidence(run: Run, procedureId: string): EvidenceRef | undefined {
  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    if (evidence.kind === `review-launch-attempt:${procedureId}`) {
      return evidence;
    }
  }

  return undefined;
}

function readLatestReviewLaunchAttempt(
  runContext: OperatorRunContext,
  procedureId: string
): ReviewLaunchObservation | undefined {
  const evidence = findLatestReviewLaunchAttemptEvidence(runContext.run, procedureId);

  if (!evidence?.path) {
    return undefined;
  }

  try {
    const artifactPath = resolveRunLocalPath(runContext, evidence.path);
    const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as unknown;
    const record = assertObject(parsed, `review launch attempt ${procedureId}`);
    if (
      typeof record.status !== "string"
      || typeof record.procedure_id !== "string"
      || record.procedure_id !== procedureId
    ) {
      return undefined;
    }

    return record as unknown as ReviewLaunchObservation;
  } catch {
    return undefined;
  }
}

function buildBlockedReviewLaunchStage(
  context: OperatorEvaluationContext,
  procedureId: "plan-review" | "implementation-review" | "fix-pass-review",
  attempt: ReviewLaunchObservation
): OperatorStageDraft | undefined {
  if (attempt.status === "success" || attempt.status === "dry_run") {
    return undefined;
  }

  return buildOperatorStageDraft({
    current_stage: "REVIEW_LAUNCH_BLOCKED",
    next_procedure_id: procedureId,
    required_inputs: getProcedureRequiredInputs(context, procedureId, ["review request", "review launch profile"]),
    missing_inputs: [],
    required_evidence: [`valid ${procedureId} review artifact`],
    missing_evidence: [`valid ${procedureId} review artifact`],
    stop_reason: attempt.failure_classification ?? "review_launch_failed",
    next_allowed_action: attempt.next_valid_action,
    forbidden_actions: ["implementation", "source edits", "closeout", "phase closeout review", "harvest"],
    notes: [
      ...context.baseNotes,
      `review_launch_status: ${attempt.status}`,
      `review_launch_attempt_id: ${attempt.attempt_id ?? "(none)"}`
    ]
  });
}

function readLatestPlanReviewDecisionRecord(
  runContext: OperatorRunContext,
  procedureIds: Set<string>
): PlanReviewDecisionRecord | undefined {
  const evidence = findLatestProcedureEvidence(runContext.run, procedureIds, "plan-review");

  if (runContext.run.phase_id === "23.8.6D") {
    const markdown = readDProcedureArtifactBody(runContext, "plan-review", evidence?.artifact_id);
    return markdown ? parsePlanReviewDecisionRecord(markdown) : undefined;
  }

  if (!evidence?.path) {
    return undefined;
  }

  const absolutePath = resolveRunLocalPath(runContext, evidence.path);
  const markdown = readUtf8FileIfExists(absolutePath);
  return markdown ? parsePlanReviewDecisionRecord(markdown) : undefined;
}

function readDProcedureArtifactBody(
  runContext: OperatorRunContext,
  procedureId: string,
  artifactId: string | undefined
): string | undefined {
  if (!runContext.run.run_instance_id || !artifactId) {
    return undefined;
  }
  return new RunStagingDatabase(
    runContext.run.repository.root_path,
    runContext.run.repository.project_root,
    runContext.run.run_id
  ).readProcedureArtifactBody({
    runInstanceId: runContext.run.run_instance_id,
    sourceRunId: runContext.run.run_id,
    procedureArtifactId: artifactId,
    procedureId
  }).body;
}

function resolveRunLocalPath(runContext: OperatorRunContext, relativeOrAbsolutePath: string): string {
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }

  if (relativeOrAbsolutePath.startsWith(".harness/")) {
    return path.join(runContext.run.repository.root_path, relativeOrAbsolutePath);
  }

  return path.join(path.dirname(runContext.runPath), relativeOrAbsolutePath);
}

function readFileTimestampMs(candidatePath: string): number | undefined {
  if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) {
    return undefined;
  }

  return fs.statSync(candidatePath).mtimeMs;
}

function readProcedureEvidenceTimestampMs(runContext: OperatorRunContext, procedureId: string): number | undefined {
  const timestamps: number[] = [];

  for (const evidence of runContext.run.evidence) {
    const taggedProcedureId = readTaggedProcedureId(evidence.kind, new Set([procedureId]))
      ?? readTaggedProcedureId(evidence.summary, new Set([procedureId]));

    if (taggedProcedureId !== procedureId) {
      continue;
    }

    if (evidence.path) {
      const evidenceTimestamp = readFileTimestampMs(resolveRunLocalPath(runContext, evidence.path));
      if (evidenceTimestamp !== undefined) {
        timestamps.push(evidenceTimestamp);
      }
    }

    if (!evidence.path && evidence.artifact_id) {
      const artifact = runContext.run.artifacts.find((entry) => entry.artifact_id === evidence.artifact_id);
      if (artifact?.path) {
        const artifactTimestamp = readFileTimestampMs(resolveRunLocalPath(runContext, artifact.path));
        if (artifactTimestamp !== undefined) {
          timestamps.push(artifactTimestamp);
        }
      }
    }
  }

  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
}

function isProcedureEvidenceFreshAfter(
  runContext: OperatorRunContext,
  laterProcedureId: string,
  earlierProcedureId: string
): boolean {
  const laterTimestamp = readProcedureEvidenceTimestampMs(runContext, laterProcedureId);
  const earlierTimestamp = readProcedureEvidenceTimestampMs(runContext, earlierProcedureId);

  if (laterTimestamp === undefined || earlierTimestamp === undefined) {
    return false;
  }

  return laterTimestamp > earlierTimestamp;
}

function isPlanApproval(approval: Approval): boolean {
  if (approval.status !== "approved") {
    return false;
  }

  const text = `${approval.title} ${approval.reason ?? ""} ${approval.approver ?? ""}`.toLowerCase();
  const hasPlan = /\bplan\b/.test(text);
  const hasReviewedPlanSignal = /\b(reviewed|implementation)\b/.test(text);
  const hasApprovalBoundary = /\b(owner|human|approved|approval)\b/.test(text);
  return hasPlan && hasReviewedPlanSignal && hasApprovalBoundary;
}

function readLatestEffectivePlanEvidence(run: Run): EvidenceRef | undefined {
  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    if (evidence.kind === "procedure:plan-amend" || evidence.summary === "plan-amend") {
      return evidence;
    }
  }

  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    if (evidence.kind === "procedure:draft-plan" || evidence.summary === "draft-plan") {
      return evidence;
    }
  }

  return undefined;
}

function readLatestApprovedPlanEvidence(run: Run): EvidenceRef | undefined {
  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    if (evidence.kind === "approved-plan" || evidence.summary === "approved-plan") {
      return evidence;
    }
  }

  return undefined;
}

function isPlanAmendEvidence(evidence: EvidenceRef | undefined): boolean {
  if (!evidence) {
    return false;
  }

  return evidence.kind === "procedure:plan-amend" || evidence.summary === "plan-amend";
}

function readPlanScopeMarkdown(runContext: OperatorRunContext): string | undefined {
  const latestEffectivePlan = readLatestEffectivePlanEvidence(runContext.run);
  if (runContext.run.phase_id === "23.8.6D") {
    return readDProcedureArtifactBody(
      runContext,
      isPlanAmendEvidence(latestEffectivePlan) ? "plan-amend" : "draft-plan",
      latestEffectivePlan?.artifact_id
    );
  }
  if (isPlanAmendEvidence(latestEffectivePlan) && latestEffectivePlan?.path) {
    return readUtf8FileIfExists(resolveRunLocalPath(runContext, latestEffectivePlan.path));
  }

  const latestApprovedPlan = readLatestApprovedPlanEvidence(runContext.run);
  if (latestApprovedPlan?.path) {
    return readUtf8FileIfExists(resolveRunLocalPath(runContext, latestApprovedPlan.path));
  }

  if (latestEffectivePlan?.path) {
    return readUtf8FileIfExists(resolveRunLocalPath(runContext, latestEffectivePlan.path));
  }

  return undefined;
}

function readLatestProcedureEvidenceById(run: Run, procedureId: string): EvidenceRef | undefined {
  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    if (evidence.kind === `procedure:${procedureId}` || evidence.summary === procedureId) {
      return evidence;
    }
  }

  return undefined;
}

interface ExactPlanEvidenceBinding {
  artifactId: string;
  contentHash: string;
  procedureId: "draft-plan" | "plan-amend";
}

interface ExactPlanApprovalBinding {
  planArtifactId: string;
  planContentHash: string;
  planReviewArtifactId: string;
}

function readExactArtifactContentHash(artifactId: string, label: string): string {
  const match = /^sha256:([a-f0-9]{64})$/.exec(artifactId);
  if (!match) {
    throw new Error(`${label} must be an exact sha256 artifact identity.`);
  }
  return match[1];
}

function tryResolveExactPlanEvidenceBinding(run: Run): ExactPlanEvidenceBinding | undefined {
  const evidence = readLatestEffectivePlanEvidence(run);
  if (!evidence?.artifact_id) {
    return undefined;
  }
  return {
    artifactId: evidence.artifact_id,
    contentHash: readExactArtifactContentHash(evidence.artifact_id, "Effective plan evidence"),
    procedureId: isPlanAmendEvidence(evidence) ? "plan-amend" : "draft-plan"
  };
}

function hasTerminalAutomaticPlanReviewProvenance(
  run: Run,
  plan: ExactPlanEvidenceBinding,
  planReview: EvidenceRef,
  descriptor: ProcedureArtifactDescriptor | undefined
): boolean {
  if (!descriptor || !run.run_instance_id || !planReview.artifact_id) return false;
  let provenance: Record<string, unknown>;
  try {
    provenance = assertObject(JSON.parse(descriptor.provenance_json), "Plan-review descriptor provenance");
  } catch {
    return false;
  }
  const attemptId = provenance.review_attempt_id;
  const reviewedSourceHead = provenance.reviewed_source_head;
  if (typeof attemptId !== "string" || !attemptId || typeof reviewedSourceHead !== "string"
    || !/^[a-f0-9]{40}$/u.test(reviewedSourceHead)) {
    return false;
  }
  if (descriptor.source_run_id !== run.run_id
    || descriptor.procedure_id !== "plan-review"
    || descriptor.artifact_id !== planReview.artifact_id
    || descriptor.reviewed_plan_artifact_id !== plan.artifactId
    || descriptor.reviewed_plan_content_hash !== plan.contentHash) {
    return false;
  }
  return hasTerminalAutomaticPlanReviewInvocation(run, planReview, attemptId, reviewedSourceHead);
}

function hasTerminalAutomaticPlanReviewInvocation(
  run: Run,
  planReview: EvidenceRef,
  attemptId: string,
  reviewedSourceHead: string | undefined
): boolean {
  if (!run.run_instance_id || !planReview.artifact_id || !/^[a-f0-9]{40}$/u.test(reviewedSourceHead ?? "")) return false;
  return (run.review_routing_records ?? []).some((record) => {
    if (record.record_kind !== "review_invocation" || record.status !== "success") return false;
    const payload = record.payload;
    return payload.procedure_id === "plan-review"
      && payload.run_id === run.run_id
      && payload.run_instance_id === run.run_instance_id
      && payload.status === "success"
      && payload.attempt_id === attemptId
      && typeof payload.review_claim_id === "string"
      && payload.review_claim_id.length > 0
      && typeof payload.review_claim_owner_token_hash === "string"
      && /^sha256:[a-f0-9]{64}$/u.test(payload.review_claim_owner_token_hash)
      && payload.terminal_exit_code === 0
      && payload.artifact_id === planReview.artifact_id
      && payload.artifact_valid === true
      && payload.artifact_present === true
      && payload.termination_policy === "terminal_completion_only"
      && payload.reviewed_source_head === reviewedSourceHead;
  });
}

function resolveExactPlanApprovalBinding(
  targetRoot: string,
  runId: string,
  run: Run,
  candidateArtifactId: string,
  descriptorLookup?: (runInstanceId: string, procedureId: string, artifactId: string) => ProcedureArtifactDescriptor | undefined
): ExactPlanApprovalBinding {
  const plan = tryResolveExactPlanEvidenceBinding(run);
  if (!plan) {
    if (run.phase_id === "23.8.6D") {
      throw new Error("Plan approval cannot resolve an immutable plan binding without an exact effective-plan artifact identity.");
    }
    return resolveLegacyPlanApprovalBinding(targetRoot, runId, run, candidateArtifactId);
  }
  if (!run.run_instance_id) {
    throw new Error("Plan approval cannot resolve an immutable plan binding without an exact run instance ID.");
  }
  const requiresDurableBinding = run.phase_id === "23.8.6D"
    || !isPrePhaseFVerificationCompatibility(run.phase_id);
  if (candidateArtifactId !== plan.artifactId) {
    throw new Error(
      `Approved plan does not match the exact effective plan evidence. Expected ${plan.artifactId}, got ${candidateArtifactId}.`
    );
  }
  const planReview = readLatestProcedureEvidenceById(run, "plan-review");
  if (!planReview?.artifact_id) {
    throw new Error("Plan approval requires an exact recorded plan-review artifact identity.");
  }
  readExactArtifactContentHash(planReview.artifact_id, "Plan-review evidence");
  const descriptor = descriptorLookup?.(run.run_instance_id, "plan-review", planReview.artifact_id);
  if (requiresDurableBinding && descriptorLookup && !descriptor) {
    throw new Error("Plan approval cannot prove the exact durable plan-review binding.");
  }
  if (requiresDurableBinding && descriptor && (
    descriptor.source_run_id !== run.run_id
    || descriptor.procedure_id !== "plan-review"
    || descriptor.artifact_id !== planReview.artifact_id
    || descriptor.content_hash !== readExactArtifactContentHash(planReview.artifact_id, "Plan-review descriptor")
    || descriptor.reviewed_plan_artifact_id !== plan.artifactId
    || descriptor.reviewed_plan_content_hash !== plan.contentHash
  )) {
    throw new Error("Plan approval rejects a missing, cross-run, or mismatched immutable plan-review binding.");
  }
  if (!isPrePhaseFVerificationCompatibility(run.phase_id)
    && !hasTerminalAutomaticPlanReviewProvenance(run, plan, planReview, descriptor)) {
    throw new Error("PLAN_APPROVAL_TERMINAL_REVIEW_PROVENANCE_MISSING: Phase F and later require the exact terminal automatic plan-review authority chain.");
  }
  const requiredPlanningLenses = deriveRequiredPlanningReviewLenses(targetRoot, run);
  if (!isPrePhaseFVerificationCompatibility(run.phase_id)
    && requiredPlanningLenses.length > 1
    && resolveCurrentPlanningReviewCohortDisposition(
      targetRoot,
      run.repository.project_root,
      run,
      requiredPlanningLenses
    ).disposition !== "PASS") {
    throw new Error("PLAN_APPROVAL_REQUIRED_REVIEW_COHORT_INCOMPLETE: Phase F and later require the exact current derived planning-review cohort.");
  }
  const planDescriptor = descriptorLookup?.(run.run_instance_id, plan.procedureId, plan.artifactId);
  if (requiresDurableBinding && descriptorLookup && (!planDescriptor || planDescriptor.source_run_id !== run.run_id
    || planDescriptor.procedure_id !== plan.procedureId
    || planDescriptor.content_hash !== plan.contentHash)) {
    throw new Error("Plan approval cannot prove the exact durable effective-plan artifact binding.");
  }
  return {
    planArtifactId: plan.artifactId,
    planContentHash: plan.contentHash,
    planReviewArtifactId: planReview.artifact_id
  };
}

function resolveLegacyPlanApprovalBinding(
  targetRoot: string,
  runId: string,
  run: Run,
  candidateArtifactId: string
): ExactPlanApprovalBinding {
  const latestEffectivePlanEvidence = readLatestEffectivePlanEvidence(run);
  const latestPlanReviewEvidence = readLatestProcedureEvidenceById(run, "plan-review");
  if (!latestEffectivePlanEvidence?.path) {
    if (!latestPlanReviewEvidence?.path) {
      throw new Error("No reviewed plan evidence is recorded for this run. Record plan-review before approving a plan.");
    }
    const latestPlanReviewMarkdown = fs.readFileSync(
      path.join(path.dirname(runFilePath(targetRoot, runId)), latestPlanReviewEvidence.path),
      "utf8"
    );
    const validatedPlanReview = validatePlanReviewArtifact(latestPlanReviewMarkdown);
    if (interpretPlanReviewDecisionRecord(validatedPlanReview.decisionRecord).route !== "approval") {
      throw new Error("Plan approval without a recorded plan artifact is allowed only when the latest plan-review routes directly to approval.");
    }
    return {
      planArtifactId: candidateArtifactId,
      planContentHash: readExactArtifactContentHash(candidateArtifactId, "Legacy approved plan artifact"),
      planReviewArtifactId: latestPlanReviewEvidence.artifact_id ?? `sha256:${sha256Hex(latestPlanReviewMarkdown)}`
    };
  }
  const effectivePlanAbsolutePath = path.join(path.dirname(runFilePath(targetRoot, runId)), latestEffectivePlanEvidence.path);
  const effectivePlanMarkdown = fs.readFileSync(effectivePlanAbsolutePath, "utf8");
  const effectivePlanArtifactId = `sha256:${sha256Hex(effectivePlanMarkdown)}`;
  if (candidateArtifactId !== effectivePlanArtifactId) {
    throw new Error(
      `Approved plan does not match the latest effective plan evidence. Expected ${effectivePlanArtifactId}, got ${candidateArtifactId}.`
    );
  }
  if (!latestPlanReviewEvidence?.path) {
    throw new Error("No recorded plan-review evidence is available for legacy plan approval.");
  }
  return {
    planArtifactId: effectivePlanArtifactId,
    planContentHash: readExactArtifactContentHash(effectivePlanArtifactId, "Legacy effective plan evidence"),
    planReviewArtifactId: latestPlanReviewEvidence.artifact_id ?? `sha256:${sha256Hex(fs.readFileSync(
      path.join(path.dirname(runFilePath(targetRoot, runId)), latestPlanReviewEvidence.path),
      "utf8"
    ))}`
  };
}

interface NextTaskDecisionRecord {
  next_task_decision_id: string;
  source_run_instance_id: string;
  task_path: string;
  base_commit_sha: string;
  source_artifact_identity: string;
  decision_record_identity: string | null;
  base_ref?: string;
}

function parseNextTaskDecisionRecord(decision: Decision): NextTaskDecisionRecord | undefined {
  try {
    const parsed = JSON.parse(decision.rationale) as Partial<NextTaskDecisionRecord> & Record<string, unknown>;
    if (
      typeof parsed.next_task_decision_id !== "string"
      || typeof parsed.source_run_instance_id !== "string"
      || typeof parsed.task_path !== "string"
      || typeof parsed.base_commit_sha !== "string"
      || typeof parsed.source_artifact_identity !== "string"
      || (parsed.decision_record_identity !== null && typeof parsed.decision_record_identity !== "string")
      || (parsed.base_ref !== undefined && typeof parsed.base_ref !== "string")
    ) {
      return undefined;
    }

    return {
      next_task_decision_id: parsed.next_task_decision_id,
      source_run_instance_id: parsed.source_run_instance_id,
      task_path: parsed.task_path,
      base_commit_sha: parsed.base_commit_sha,
      source_artifact_identity: parsed.source_artifact_identity,
      decision_record_identity: parsed.decision_record_identity,
      ...(parsed.base_ref ? { base_ref: parsed.base_ref } : {})
    };
  } catch {
    return undefined;
  }
}

function buildNextTaskPointerMarkdown(taskPath: string): string {
  return [
    "# Current Task",
    "",
    `Implement only: ${taskPath}`,
    ""
  ].join("\n");
}

function buildMaterializationHandoffAction(worktreePath: string): string {
  return [
    "Stop the predecessor task or Goal from writing.",
    "Commit the successor activation authority in the prepared worktree.",
    "Run `node bin/ch worktree bootstrap` there.",
    "Open a fresh successor Codex task in that worktree, then run `node bin/ch run start --task TASK.md`.",
    `Prepared worktree: ${worktreePath}`
  ].join(" ");
}

function resolveExactCommit(targetRoot: string, value: string): string {
  const result = runGitCommand(targetRoot, ["rev-parse", "--verify", `${value}^{commit}`]);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Unable to resolve exact commit for ${value}.`);
  }
  return result.stdout.trim();
}

function gitBranchExists(targetRoot: string, branch: string): boolean {
  const result = runGitCommand(targetRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return result.status === 0;
}

function gitCurrentBranch(cwd: string): string {
  const result = runGitCommand(cwd, ["branch", "--show-current"]);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git branch --show-current failed");
  }
  return result.stdout.trim();
}

function readNextTaskDecision(run: Run, decisionId: string): { decision: Decision; record: NextTaskDecisionRecord } {
  const decision = run.decisions.find((entry) => entry.decision_id === decisionId);
  if (!decision) {
    throw new Error(`Next-task decision not found: ${decisionId}`);
  }

  const record = parseNextTaskDecisionRecord(decision);
  if (!record) {
    throw new Error(`Decision ${decisionId} is not a valid next-task decision record.`);
  }

  return { decision, record };
}

function hasApprovedPlan(runContext: OperatorRunContext): boolean {
  const approvals = runContext.run.approvals
    .filter((approval) => isPlanApproval(approval))
    .map((approval) => ({
      approval,
      timestamp: Number.isFinite(Date.parse(approval.created_at)) ? Date.parse(approval.created_at) : undefined
    }))
    .filter((entry) => entry.timestamp !== undefined) as Array<{ approval: Approval; timestamp: number }>;

  if (approvals.length === 0) {
    return false;
  }

  const latestApprovalTimestamp = Math.max(...approvals.map((entry) => entry.timestamp));
  const latestPlanAmendTimestamp = readProcedureEvidenceTimestampMs(runContext, "plan-amend");
  const latestDraftPlanTimestamp = readProcedureEvidenceTimestampMs(runContext, "draft-plan");
  const latestPlanReviewTimestamp = readProcedureEvidenceTimestampMs(runContext, "plan-review");
  const latestEffectivePlanTimestamp = latestPlanAmendTimestamp ?? latestDraftPlanTimestamp;
  const latestApprovalBoundaryTimestamp = Math.max(
    latestEffectivePlanTimestamp ?? Number.NEGATIVE_INFINITY,
    latestPlanReviewTimestamp ?? Number.NEGATIVE_INFINITY
  );

  if (Number.isFinite(latestApprovalBoundaryTimestamp) && latestApprovalTimestamp < latestApprovalBoundaryTimestamp) {
    return false;
  }

  const latestEffectivePlanArtifactId = (
    readLatestEffectivePlanEvidence(runContext.run)?.artifact_id
    ?? readLatestApprovedPlanEvidence(runContext.run)?.artifact_id
  );
  if (!latestEffectivePlanArtifactId) {
    return true;
  }

  const expectedContentHash = /^sha256:([a-f0-9]{64})$/.exec(latestEffectivePlanArtifactId)?.[1];
  return approvals.some(({ approval }) => {
    if (approval.reviewed_plan_artifact_id || approval.reviewed_plan_content_hash || approval.reviewed_evidence_artifact_id) {
      const matchesApproval = approval.reviewed_plan_artifact_id === latestEffectivePlanArtifactId
        && approval.reviewed_plan_content_hash === expectedContentHash
        && typeof approval.reviewed_evidence_artifact_id === "string"
        && approval.reviewed_evidence_artifact_id.startsWith("sha256:");
      if (!matchesApproval) {
        return false;
      }
      if (runContext.run.phase_id !== "23.8.6D"
        && isPrePhaseFVerificationCompatibility(runContext.run.phase_id)) {
        return true;
      }
      return hasExactDurableDApprovalBinding(runContext, approval, latestEffectivePlanArtifactId, expectedContentHash);
    }
    if (!isPrePhaseFVerificationCompatibility(runContext.run.phase_id)) {
      return false;
    }
    return approval.reason?.includes(`effective_plan_artifact_id=${latestEffectivePlanArtifactId}`) ?? false;
  });
}

function hasExactDurableDApprovalBinding(
  runContext: OperatorRunContext,
  approval: Approval,
  planArtifactId: string,
  planContentHash: string | undefined
): boolean {
  const planReview = readLatestProcedureEvidenceById(runContext.run, "plan-review");
  const planProcedureId = isPlanAmendEvidence(readLatestEffectivePlanEvidence(runContext.run)) ? "plan-amend" : "draft-plan";
  if (!runContext.run.run_instance_id || !planContentHash || !planReview?.artifact_id
    || approval.reviewed_evidence_artifact_id !== planReview.artifact_id) {
    return false;
  }
  const bound = runContext.run.implementation_baseline_binding;
  if (!isPrePhaseFVerificationCompatibility(runContext.run.phase_id)
    && hasPhaseFDurableImplementationBaseline(runContext.run)
    && bound?.approval_id === approval.approval_id
    && bound.plan_artifact_hash === planContentHash
    && bound.plan_review_artifact_hash === planReview.artifact_id
    && hasTerminalAutomaticPlanReviewInvocation(
      runContext.run,
      planReview,
      bound.plan_review_artifact_hash === planReview.artifact_id
        ? String((runContext.run.review_routing_records ?? []).find((record) =>
          record.record_kind === "review_invocation"
          && record.payload.procedure_id === "plan-review"
          && record.payload.artifact_id === planReview.artifact_id)?.payload.attempt_id ?? "")
        : "",
      bound.planning_review_source_head
    )) {
    return true;
  }
  try {
    const staging = new RunStagingDatabase(
      runContext.run.repository.root_path,
      runContext.run.repository.project_root,
      runContext.run.run_id
    );
    const review = staging.readProcedureArtifact(
      runContext.run.run_instance_id,
      "plan-review",
      planReview.artifact_id
    );
    const plan = staging.readProcedureArtifact(
      runContext.run.run_instance_id,
      planProcedureId,
      planArtifactId
    );
    if (!review || !plan || review.source_run_id !== runContext.run.run_id
      || review.content_hash !== planReview.artifact_id.slice("sha256:".length)
      || review.reviewed_plan_artifact_id !== planArtifactId
      || review.reviewed_plan_content_hash !== planContentHash
      || review.reviewed_evidence_artifact_id !== planArtifactId
      || plan.source_run_id !== runContext.run.run_id
      || plan.content_hash !== planContentHash) {
      return false;
    }
    let reviewProvenance: Record<string, unknown>;
    try {
      reviewProvenance = assertObject(JSON.parse(review.provenance_json), "Plan-review descriptor provenance");
    } catch {
      return false;
    }
    if (!isPrePhaseFVerificationCompatibility(runContext.run.phase_id)
      && !hasTerminalAutomaticPlanReviewInvocation(
        runContext.run,
        planReview,
        String(reviewProvenance.review_attempt_id ?? ""),
        typeof reviewProvenance.reviewed_source_head === "string" ? reviewProvenance.reviewed_source_head : undefined
      )) {
      return false;
    }
    staging.readProcedureArtifactBody({
      runInstanceId: runContext.run.run_instance_id,
      sourceRunId: runContext.run.run_id,
      procedureId: "plan-review",
      procedureArtifactId: planReview.artifact_id
    });
    return true;
  } catch {
    return false;
  }
}

function isReadOnlyActivityText(value: string): boolean {
  return /\b(review|reviewer|status|policy|delivery[- ]facts|closeout|verification|plan|prompt|intake|decomposition|harvest)\b/i.test(value);
}

function isImplementationActivityText(value: string): boolean {
  return /\b(implement|implementation|apply|source|runtime|code|edit|fix|patch|change)\b/i.test(value);
}

function isImplementationStep(step: Step): boolean {
  return isImplementationActivityText(step.name) && !isReadOnlyActivityText(step.name);
}

function isReadOnlyArtifactPath(value: string): boolean {
  return /(^|\/)\.harness\/|review\.json$|verifier\.json$|closeout\.json$|current\.json$|install\.json$|context[-_]inspect|prompt|plan|review|verification|delivery|closeout|policy|status/i.test(value);
}

function isImplementationCommandResult(result: CommandResult, implementationStepIds: Set<string>): boolean {
  if (!result.step_id || !implementationStepIds.has(result.step_id)) {
    return false;
  }

  return !isReadOnlyActivityText(result.command);
}

function isImplementationArtifact(
  artifact: Pick<ArtifactRef, "kind" | "description" | "path"> | Pick<EvidenceRef, "kind" | "summary" | "path">,
  procedureIds: Set<string>
): boolean {
  const kindValue = artifact.kind.trim();
  const secondary = "description" in artifact
    ? artifact.description ?? ""
    : ("summary" in artifact ? artifact.summary ?? "" : "");
  const combined = `${kindValue} ${secondary} ${artifact.path ?? ""}`.trim();

  if (kindValue.length === 0 || readTaggedProcedureId(kindValue, procedureIds)) {
    return false;
  }

  if (!isImplementationActivityText(combined) || isReadOnlyActivityText(combined)) {
    return false;
  }

  return !artifact.path || !isReadOnlyArtifactPath(artifact.path);
}

function isImplementationSourcePath(relativePath: string): boolean {
  const normalized = normalizeRepoRelativePath(relativePath);

  if (isPrivateRuntimePath(normalized) || isReadOnlyArtifactPath(normalized)) {
    return false;
  }

  if (
    normalized.startsWith("src/") ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("schemas/") ||
    normalized.startsWith("migrations/")
  ) {
    return true;
  }

  return false;
}

function extractRepoRelativeMarkdownPaths(markdown: string): Set<string> {
  const paths = new Set<string>();
  const pattern = /(?:^|[\s`"'(])((?:docs|tasks|skills)\/[A-Za-z0-9._/-]+|README\.md|TASK\.md)(?=$|[\s`"'.,:;)\]])/gm;

  for (const match of markdown.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }

    paths.add(normalizeRepoRelativePath(value));
  }

  return paths;
}

interface MarkdownSection {
  heading: string;
  body: string;
}

interface DocsTaskPolicyScopeRules {
  allowedPaths: Set<string>;
  forbiddenPaths: Set<string>;
  allowLiveCurrentDocs: boolean;
  allowImmediateFutureTaskContracts: boolean;
  allowedFutureTaskPaths: Set<string>;
}

const APPROVED_PLAN_SCOPE_HEADINGS = new Set([
  "allowed authority surfaces",
  "effective scope",
  "effective steps",
  "included",
  "source files or modules likely to change",
  "implementation surfaces"
]);

const TASK_SCOPE_HEADINGS = new Set([
  "required behavior",
  "acceptance behavior"
]);

const FORBIDDEN_SCOPE_HEADINGS = new Set([
  "non-goals",
  "source/runtime boundary",
  "excluded"
]);

function listMarkdownLevelTwoSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/u);
  const sections: MarkdownSection[] = [];
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = /^##\s+(.+?)\s*$/u.exec(line.trim());
    if (headingMatch) {
      if (currentHeading !== undefined) {
        sections.push({ heading: currentHeading, body: currentLines.join("\n") });
      }

      currentHeading = headingMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentHeading !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentHeading !== undefined) {
    sections.push({ heading: currentHeading, body: currentLines.join("\n") });
  }

  return sections;
}

interface RoadmapPhaseTaskEntry {
  phaseId: string;
  taskPath?: string;
}

function inferPhaseFamilyId(phaseId: string): string {
  const match = /^([0-9]+(?:\.[0-9]+)*)[A-Z]/u.exec(phaseId);
  return match?.[1] ?? phaseId;
}

function listRoadmapPhaseTaskEntries(targetRoot: string): RoadmapPhaseTaskEntry[] {
  const roadmapPath = path.join(targetRoot, "docs", "IMPLEMENTATION_ROADMAP.md");
  const roadmap = readUtf8FileIfExists(roadmapPath);

  if (!roadmap) {
    return [];
  }

  const headingPattern = /^##\s+Phase\s+([0-9]+(?:\.[0-9]+)*(?:[A-Z][0-9]*)*)\b.*$/gm;
  const headings = [...roadmap.matchAll(headingPattern)];
  const entries: RoadmapPhaseTaskEntry[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const sectionStart = heading.index;
    if (sectionStart === undefined) {
      continue;
    }

    const sectionEnd = headings[index + 1]?.index ?? roadmap.length;
    const section = roadmap.slice(sectionStart, sectionEnd);
    const taskPath = /Task:\s*`([^`]+)`/m.exec(section)?.[1]?.trim();
    entries.push({
      phaseId: heading[1],
      ...(taskPath ? { taskPath } : {})
    });
  }

  return entries;
}

function collectImmediateFutureTaskContractPaths(targetRoot: string, activePhaseId: string): Set<string> {
  const entries = listRoadmapPhaseTaskEntries(targetRoot);
  const currentIndex = entries.findIndex((entry) => entry.phaseId === activePhaseId);
  if (currentIndex === -1) {
    return new Set<string>();
  }

  const activeFamilyId = inferPhaseFamilyId(activePhaseId);
  const allowedPaths = new Set<string>();

  for (let index = currentIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    if (inferPhaseFamilyId(entry.phaseId) !== activeFamilyId) {
      break;
    }

    if (entry.taskPath) {
      allowedPaths.add(normalizeRepoRelativePath(entry.taskPath));
    }
  }

  return allowedPaths;
}

function parseScopeSectionRules(
  rules: DocsTaskPolicyScopeRules,
  section: MarkdownSection,
  explicitPathSectionHeadings: Set<string>
): void {
  const normalizedHeading = section.heading.trim().toLowerCase();
  const explicitPathHeading = explicitPathSectionHeadings.has(normalizedHeading);

  for (const line of section.body.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    const lineLower = trimmedLine.toLowerCase();
    const explicitPaths = extractRepoRelativeMarkdownPaths(trimmedLine);
    const negativePathSignal = /\b(do not edit|must not change|must not implement|no [a-z0-9/_-]+ changes|forbidden)\b/.test(lineLower);
    const positivePathSignal = explicitPathHeading
      || /\b(update|patch|keep\b.*\bin scope|keep the current\b.*\bchange in scope|source files or modules likely to change|allowed authority surfaces|implementation surfaces)\b/.test(lineLower);

    if (/\blive\/current\b.*\bauthority surfaces?\b/.test(lineLower) || /\blive\/current docs?\b/.test(lineLower) || /\boperator-facing wording\b/.test(lineLower)) {
      rules.allowLiveCurrentDocs = true;
    }

    if (/\bimmediate planned\/future\b.*\bauthority surfaces?\b/.test(lineLower) || /\bplanned\/future task contracts?\b/.test(lineLower) || /\bnear downstream planned\/future task contracts?\b/.test(lineLower)) {
      rules.allowImmediateFutureTaskContracts = true;
    }

    if (/\broadmap\b/.test(lineLower) && /\b(update|active|current|surface|surfaces|wording)\b/.test(lineLower)) {
      rules.allowedPaths.add("docs/IMPLEMENTATION_ROADMAP.md");
    }

    for (const explicitPath of explicitPaths) {
      if (negativePathSignal) {
        rules.forbiddenPaths.add(explicitPath);
        continue;
      }

      if (positivePathSignal) {
        rules.allowedPaths.add(explicitPath);
      }
    }
  }
}

function buildDocsTaskPolicyScopeRules(
  targetRoot: string,
  taskMarkdown: string,
  effectivePlanMarkdown?: string,
  activeTaskPath?: string,
  activePhaseId?: string
): DocsTaskPolicyScopeRules {
  const rules: DocsTaskPolicyScopeRules = {
    allowedPaths: new Set<string>(["TASK.md"]),
    forbiddenPaths: new Set<string>(),
    allowLiveCurrentDocs: false,
    allowImmediateFutureTaskContracts: false,
    allowedFutureTaskPaths: new Set<string>()
  };

  if (activeTaskPath) {
    rules.allowedPaths.add(normalizeRepoRelativePath(activeTaskPath));
  }

  for (const section of listMarkdownLevelTwoSections(taskMarkdown)) {
    const normalizedHeading = section.heading.trim().toLowerCase();
    if (TASK_SCOPE_HEADINGS.has(normalizedHeading)) {
      parseScopeSectionRules(rules, section, new Set<string>());
      continue;
    }

    if (FORBIDDEN_SCOPE_HEADINGS.has(normalizedHeading)) {
      parseScopeSectionRules(rules, section, new Set<string>());
    }
  }

  if (effectivePlanMarkdown) {
    for (const section of listMarkdownLevelTwoSections(effectivePlanMarkdown)) {
      const normalizedHeading = section.heading.trim().toLowerCase();
      if (APPROVED_PLAN_SCOPE_HEADINGS.has(normalizedHeading)) {
        parseScopeSectionRules(rules, section, APPROVED_PLAN_SCOPE_HEADINGS);
        continue;
      }

      if (FORBIDDEN_SCOPE_HEADINGS.has(normalizedHeading)) {
        parseScopeSectionRules(rules, section, new Set<string>());
      }
    }
  }

  if (rules.allowImmediateFutureTaskContracts && activePhaseId) {
    for (const taskPath of collectImmediateFutureTaskContractPaths(targetRoot, activePhaseId)) {
      rules.allowedFutureTaskPaths.add(taskPath);
    }
  }

  return rules;
}

function isDocsTaskPolicyOnlyImplementationScope(taskMarkdown: string, effectivePlanMarkdown?: string): boolean {
  const combined = `${taskMarkdown}\n${effectivePlanMarkdown ?? ""}`.toLowerCase();
  const docsAuthoritySignals = [
    "docs/task/verification-guidance authority only",
    "docs/task/policy authority only",
    "docs/task/procedure/policy authority only",
    "docs/task/procedure/policy authority",
    "verification-policy and authority-surface phase"
  ];
  const docsBoundarySignals = [
    "no runtime feature implementation",
    "must not change runtime code",
    "must not implement runtime features",
    "no package-script changes",
    "no ci changes",
    "no acceptance-runner code changes"
  ];

  return docsAuthoritySignals.some((signal) => combined.includes(signal))
    && docsBoundarySignals.some((signal) => combined.includes(signal));
}

function isAllowedDocsTaskPolicyImplementationPath(relativePath: string, rules: DocsTaskPolicyScopeRules): boolean {
  const normalized = normalizeRepoRelativePath(relativePath);

  if (rules.allowedPaths.has(normalized)) {
    return true;
  }

  if (rules.allowLiveCurrentDocs && (normalized === "README.md" || normalized.startsWith("docs/"))) {
    return true;
  }

  if (rules.allowedFutureTaskPaths.has(normalized)) {
    return true;
  }

  return false;
}

function classifyDocsTaskPolicyImplementationPaths(relativePaths: string[], rules: DocsTaskPolicyScopeRules): {
  allowedPaths: string[];
  forbiddenPaths: string[];
} {
  const allowedPaths: string[] = [];
  const forbiddenPaths: string[] = [];

  for (const relativePath of relativePaths) {
    const normalized = normalizeRepoRelativePath(relativePath);

    if (isPrivateRuntimePath(normalized) || isReadOnlyArtifactPath(normalized)) {
      continue;
    }

    if (rules.forbiddenPaths.has(normalized)) {
      forbiddenPaths.push(normalized);
      continue;
    }

    if (isAllowedDocsTaskPolicyImplementationPath(normalized, rules)) {
      allowedPaths.push(normalized);
      continue;
    }

    forbiddenPaths.push(normalized);
  }

  return { allowedPaths, forbiddenPaths };
}

function hasImplementationEvidence(run: Run, procedureIds: Set<string>, options: {
  allowLiveChangeProbe?: boolean;
  taskMarkdown?: string;
  effectivePlanMarkdown?: string;
  activeTaskPath?: string;
} = {}): boolean {
  const implementationStepIds = new Set(run.steps.filter((step) => isImplementationStep(step)).map((step) => step.step_id));
  const downstreamImplementationProcedures = [
    "implementation-review",
    "fix-pass-review",
    "verification-review",
    "delivery-facts-review",
    "phase-closeout-review"
  ];

  if (implementationStepIds.size > 0) {
    return true;
  }

  if (run.command_results.some((result) => isImplementationCommandResult(result, implementationStepIds))) {
    return true;
  }

  if (run.artifacts.some((artifact) => isImplementationArtifact(artifact, procedureIds))) {
    return true;
  }

  if (run.evidence.some((evidence) => isImplementationArtifact(evidence, procedureIds))) {
    return true;
  }

  if (downstreamImplementationProcedures.some((procedureId) => readLatestProcedureEvidenceById(run, procedureId))) {
    return true;
  }

  if (options.allowLiveChangeProbe) {
    try {
      const liveChangeSet = buildChangeSet(run.repository.root_path);
      if (
        options.taskMarkdown
        && isDocsTaskPolicyOnlyImplementationScope(options.taskMarkdown, options.effectivePlanMarkdown)
      ) {
        const scopeRules = buildDocsTaskPolicyScopeRules(
          run.repository.root_path,
          options.taskMarkdown,
          options.effectivePlanMarkdown,
          options.activeTaskPath,
          run.phase_id
        );
        const classifiedPaths = classifyDocsTaskPolicyImplementationPaths(liveChangeSet.changed_paths, scopeRules);
        if (classifiedPaths.forbiddenPaths.length > 0) {
          return false;
        }

        return classifiedPaths.allowedPaths.length > 0;
      }

      if (liveChangeSet.changed_paths.some((relativePath) => isImplementationSourcePath(relativePath))) {
        return true;
      }
    } catch {
      // If live git inspection fails, preserve the run-state-only fallback.
    }
  }

  return false;
}

function classifyOperatorReviewTier(taskMarkdown: string): { tier: OperatorReviewTier; notes: string[] } {
  const normalized = taskMarkdown.toLowerCase();
  const extraHighReasons: string[] = [];
  const highReasons: string[] = [];

  const extraHighPatterns: Array<[RegExp, string]> = [
    [/\boperator\b/, "operator"],
    [/\bstage routing\b/, "stage routing"],
    [/\bauthority\b/, "authority"],
    [/\blifecycle\b/, "lifecycle"],
    [/\bstorage\b/, "storage"],
    [/\bharvest\b/, "harvest"],
    [/\bprovider\b/, "provider"],
    [/\badapter\b/, "adapter"],
    [/\bschema migration\b/, "schema migration"],
    [/\bquarantine\b/, "quarantine"],
    [/\bdiscard\b/, "discard"],
    [/\bretention\b/, "retention"]
  ];
  const highPatterns: Array<[RegExp, string]> = [
    [/\bworkflow\b/, "workflow"],
    [/\bprocedure\b/, "procedure"],
    [/\barchitecture\b/, "architecture"],
    [/\bsecurity\b/, "security"],
    [/\bhooks\b/, "hooks"],
    [/\brelease\b/, "release"]
  ];

  for (const [pattern, reason] of extraHighPatterns) {
    if (pattern.test(normalized)) {
      extraHighReasons.push(reason);
    }
  }

  if (extraHighReasons.length > 0) {
    return {
      tier: "extra-high",
      notes: [
        `review_tier_reason: matched extra-high task signals (${[...new Set(extraHighReasons)].join(", ")})`,
        "review_tier_controls: anti_slop, design_invariant, scope_legality, evidence_gap, docs_consistency, future_phase_leakage"
      ]
    };
  }

  for (const [pattern, reason] of highPatterns) {
    if (pattern.test(normalized)) {
      highReasons.push(reason);
    }
  }

  if (highReasons.length > 0) {
    return {
      tier: "high",
      notes: [
        `review_tier_reason: matched high-risk task signals (${[...new Set(highReasons)].join(", ")})`,
        "review_tier_controls: anti_slop, design_invariant, scope_legality, evidence_gap, docs_consistency, future_phase_leakage"
      ]
    };
  }

  return {
    tier: "standard",
    notes: []
  };
}

function normalizeNextProcedureId(nextProcedureId: string, procedureIds: Set<string>): string {
  if (nextProcedureId === "none" || procedureIds.has(nextProcedureId)) {
    return nextProcedureId;
  }

  throw new Error(`Operator status resolved unsupported next_procedure_id: ${nextProcedureId}`);
}

function buildOperatorStatus(
  procedureIds: Set<string>,
  reviewTier: OperatorReviewTier,
  status: OperatorStageDraft
): RuntimeOperatorStatus {
  return {
    ...status,
    human_action_required: status.human_action_required ?? true,
    next_procedure_id: normalizeNextProcedureId(status.next_procedure_id, procedureIds),
    review_tier: reviewTier,
    ...(status.notes && status.notes.length > 0 ? { notes: status.notes } : {})
  };
}

function buildReviewStageAction(procedureId: string): string {
  return `open a separate read-only reviewer session and run ${procedureId}`;
}

function isBroadTaskForDirectPlan(taskMarkdown: string): boolean {
  const normalized = taskMarkdown.toLowerCase();
  return /\b(broad request|too broad|large goal|major module request|multiple modules|multi-module|spans multiple|future phases|one implementation pass|feature decomposition)\b/.test(normalized);
}

function needsTaskIntake(taskMarkdown: string): boolean {
  const normalized = taskMarkdown.toLowerCase();

  if (/\b(raw request|owner request|tbd|todo:|\?\?)\b/.test(normalized)) {
    return true;
  }

  return ![/^##?\s*goal\b/m, /^##?\s*purpose\b/m, /^##?\s*constraints?\b/m, /^##?\s*acceptance\b/m, /^##?\s*required behavior\b/m]
    .some((pattern) => pattern.test(taskMarkdown));
}

function buildOperatorStageDraft(stage: OperatorStageDraft): OperatorStageDraft {
  return stage;
}

function resolveTaskMissingStage(procedureIds: Set<string>): OperatorStageDraft {
  return buildOperatorStageDraft({
    current_stage: "NO_ACTIVE_TASK",
    next_procedure_id: "none",
    required_inputs: ["TASK.md", "active task file"],
    missing_inputs: ["active task pointer"],
    required_evidence: [],
    missing_evidence: [],
    stop_reason: "missing_active_task",
    next_allowed_action: "create or reconcile the active task pointer in TASK.md",
    forbidden_actions: ["planning", "implementation", "closeout"]
  });
}

function resolveRoadmapConflictStage(context: OperatorEvaluationContext, roadmapTaskPath?: string): OperatorStageDraft {
  return buildOperatorStageDraft({
    current_stage: "STALE_TASK_ROADMAP_CONFLICT",
    next_procedure_id: "none",
    required_inputs: ["TASK.md", "docs/IMPLEMENTATION_ROADMAP.md"],
    missing_inputs: !roadmapTaskPath ? ["roadmap phase entry"] : [],
    required_evidence: [],
    missing_evidence: [],
    stop_reason: "stale_task_roadmap_conflict",
    next_allowed_action: "reconcile TASK.md and the roadmap before implementation continues",
    forbidden_actions: ["implementation", "closeout", "import"],
    notes: !roadmapTaskPath
      ? [...context.baseNotes, `roadmap_phase_entry_missing: ${context.taskContext.phaseId}`]
      : [...context.baseNotes, `roadmap_task_path: ${roadmapTaskPath}`]
  });
}

function resolveNoActiveRunStage(context: OperatorEvaluationContext, explicitRunId?: string): OperatorStageDraft {
  return buildOperatorStageDraft({
    current_stage: "NO_ACTIVE_RUN",
    next_procedure_id: "none",
    required_inputs: ["TASK.md", "docs/IMPLEMENTATION_ROADMAP.md"],
    missing_inputs: [explicitRunId ? `explicit run context: ${explicitRunId}` : "active run context"],
    required_evidence: [],
    missing_evidence: [],
    stop_reason: "missing_active_run",
    next_allowed_action: "start or open the current runtime run before routing later workflow steps",
    forbidden_actions: ["implementation review", "closeout"],
    notes: explicitRunId
      ? [...context.baseNotes, `explicit_run_not_found: ${explicitRunId}`]
      : context.baseNotes
  });
}

function resolveTerminalRunStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  const runContext = context.runContext;

  if (!runContext) {
    return undefined;
  }

  if (runContext.run.lifecycle_status === "harvested" || runContext.run.harvested_at) {
    return buildOperatorStageDraft({
      current_stage: "RUN_HARVESTED",
      next_procedure_id: "none",
      required_inputs: [],
      missing_inputs: [],
      required_evidence: ["closeout receipt"],
      missing_evidence: [],
      stop_reason: "run_already_harvested",
      next_allowed_action: "start a new run or task for additional work",
      forbidden_actions: ["new work in the same run"],
      notes: context.baseNotes
    });
  }

  if (runContext.run.lifecycle_status === "discarded" || runContext.run.discard_reason) {
    return buildOperatorStageDraft({
      current_stage: "RUN_DISCARDED",
      next_procedure_id: "none",
      required_inputs: [],
      missing_inputs: [],
      required_evidence: ["discard reason"],
      missing_evidence: [],
      stop_reason: "run_discarded",
      next_allowed_action: "make an explicit recovery or reopen decision before resuming",
      forbidden_actions: ["resume without explicit recovery or reopen decision"],
      notes: context.baseNotes
    });
  }

  if (runContext.quarantinedPayloadCount > 0) {
    return buildOperatorStageDraft({
      current_stage: "RUN_QUARANTINED",
      next_procedure_id: "none",
      required_inputs: [],
      missing_inputs: [],
      required_evidence: ["quarantine review decision"],
      missing_evidence: ["quarantine resolution"],
      stop_reason: "run_quarantined",
      next_allowed_action: "make a manual review decision before implementation or harvest continues",
      forbidden_actions: ["implementation", "harvest", "accepted-memory writes"],
      notes: [...context.baseNotes, `quarantined_payloads: ${runContext.quarantinedPayloadCount}`]
    });
  }

  return undefined;
}

function resolveActiveReviewLaunchStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  const claim = context.runContext ? activeReviewLaunchClaim(context.runContext.run) : undefined;
  if (!claim) {
    return undefined;
  }

  return buildOperatorStageDraft({
    current_stage: "REVIEW_LAUNCH_IN_PROGRESS",
    next_procedure_id: "none",
    required_inputs: ["terminal child exit recorded by the owning review launcher"],
    missing_inputs: [],
    required_evidence: [`valid ${claim.procedure_id} review artifact or terminal launch attempt`],
    missing_evidence: [`terminal ${claim.procedure_id} launch attempt`],
    stop_reason: "review_launch_owner_active_or_unavailable",
    next_allowed_action: "wait for the original launcher to record terminal child exit; if it cannot return, explicitly cancel through the human recovery path and discard this run before starting a fresh run",
    forbidden_actions: ["replacement review launch", "procedure recording", "approval", "implementation", "verification", "closeout", "harvest"],
    notes: [
      ...context.baseNotes,
      `review_launch_claim_id: ${claim.claim_id}`,
      `review_launch_procedure: ${claim.procedure_id}`,
      ...(claim.pid ? [`review_launch_pid_observation: ${claim.pid}`] : []),
      ...(claim.progress_unknown_at ? [`review_launch_progress_unknown_at: ${claim.progress_unknown_at}`] : [])
    ]
  });
}

function resolveBootstrapRepairStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  const run = context.runContext?.run;

  if (!run) {
    return undefined;
  }

  const openIssues = run.run_issues.filter((issue) => issue.status === "open" && issue.source === "bootstrap");
  if (openIssues.length === 0) {
    return undefined;
  }

  const latestRepairPacket = run.repair_packets.length > 0
    ? run.repair_packets[run.repair_packets.length - 1]
    : undefined;

  return buildOperatorStageDraft({
    current_stage: "BOOTSTRAP_REPAIR_REQUIRED",
    next_procedure_id: "none",
    required_inputs: ["committed task authority", "clean checkout", "aligned task/worktree facts"],
    missing_inputs: [],
    required_evidence: ["resolved bootstrap run issues", "repair packet"],
    missing_evidence: ["resolved bootstrap run issues"],
    stop_reason: "bootstrap_repair_required",
    next_allowed_action: latestRepairPacket?.next_action
      ?? "repair the recorded bootstrap authority issues before planning or implementation continues",
    forbidden_actions: ["implementation", "closeout"],
    notes: [
      ...context.baseNotes,
      ...openIssues.map((issue) => `run_issue:${issue.issue_type}`),
      ...(latestRepairPacket ? [`repair_packet:${latestRepairPacket.packet_id}`] : [])
    ]
  });
}

function resolvePreImplementationStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  if (!context.runContext || !context.taggedProcedures) {
    return undefined;
  }

  const taskMarkdown = context.taskContext.activeTaskMarkdown;
  const hasPlanReviewEvidence = context.taggedProcedures.has("plan-review");
  const hasPlanAmendEvidence = context.taggedProcedures.has("plan-amend");
  const requiredPlanningLenses = deriveRequiredPlanningReviewLenses(
    context.runContext.run.repository.root_path,
    context.runContext.run
  );
  const requiresPlanningLensBundle = requiredPlanningLenses.length > 1 && !context.planApproved;
  const planningCohortDisposition = requiresPlanningLensBundle
    ? resolveCurrentPlanningReviewCohortDisposition(
        context.runContext.run.repository.root_path,
        context.runContext.run.repository.project_root,
        context.runContext.run,
        requiredPlanningLenses
      )
    : { disposition: "INCOMPLETE" as const, missing_lenses: [] };
  const missingPlanningLenses = requiredPlanningLenses
    .filter((procedureId) => !context.taggedProcedures!.has(procedureId));
  const durablePlanReviewOutcomeRecorded = hasDurableReviewOutcome(context.latestPlanReviewResult)
    && !!context.latestPlanReviewDecisionRecord;
  const planReviewDecision = context.latestPlanReviewDecisionRecord
    ? interpretPlanReviewDecisionRecord(context.latestPlanReviewDecisionRecord)
    : undefined;
  const freshPlanAmendForLatestPlanReview = planReviewDecision?.route === "amend"
    ? isProcedureEvidenceFreshAfter(context.runContext, "plan-amend", "plan-review")
    : false;
  const freshPlanReviewForLatestAmend = hasPlanAmendEvidence
    ? isProcedureEvidenceFreshAfter(context.runContext, "plan-review", "plan-amend")
    : true;

  if (requiresPlanningLensBundle && planningCohortDisposition.disposition === "INVALID") {
    return buildOperatorStageDraft({
      current_stage: "BLOCKED",
      next_procedure_id: "none",
      required_inputs: ["exact valid planning cohort identity and artifacts"],
      missing_inputs: [],
      required_evidence: requiredPlanningLenses,
      missing_evidence: [],
      stop_reason: planningCohortDisposition.error_code ?? "planning_cohort_invalid",
      next_allowed_action: "resolve the typed planning-cohort contract failure without adopting or rewriting artifacts",
      forbidden_actions: ["plan-amend", "plan approval", "implementation", "closeout"],
      notes: [...context.baseNotes, `required_planning_review_set: ${requiredPlanningLenses.join(",")}`]
    });
  }

  if (requiresPlanningLensBundle && planningCohortDisposition.disposition === "BLOCKED") {
    return buildOperatorStageDraft({
      current_stage: "BLOCKED",
      next_procedure_id: "none",
      required_inputs: ["owner decision for the complete blocked planning cohort"],
      missing_inputs: [],
      required_evidence: requiredPlanningLenses,
      missing_evidence: [],
      stop_reason: "planning_review_cohort_blocked",
      next_allowed_action: "resolve the recorded planning blocker through an explicit owner decision",
      forbidden_actions: ["plan-amend", "plan approval", "implementation", "closeout"],
      notes: [...context.baseNotes, `required_planning_review_set: ${requiredPlanningLenses.join(",")}`]
    });
  }

  if (requiresPlanningLensBundle && planningCohortDisposition.disposition === "AMEND_REQUIRED") {
    return buildOperatorStageDraft({
      current_stage: "PLAN_AMEND_REQUIRED",
      next_procedure_id: "plan-amend",
      required_inputs: ["complete current planning cohort findings"],
      missing_inputs: [],
      required_evidence: ["fresh plan-amend after the current exact cohort"],
      missing_evidence: ["fresh plan-amend after the current exact cohort"],
      stop_reason: "planning_review_cohort_requires_amendment",
      next_allowed_action: "run plan-amend, then derive and launch a fresh exact planning cohort",
      forbidden_actions: ["plan approval", "implementation", "closeout"],
      notes: [...context.baseNotes, `required_planning_review_set: ${requiredPlanningLenses.join(",")}`]
    });
  }

  if (requiresPlanningLensBundle && planningCohortDisposition.disposition === "INCOMPLETE") {
    return buildOperatorStageDraft({
      current_stage: "PLANNING_REVIEW_BUNDLE_REQUIRED",
      next_procedure_id: "plan-review",
      required_inputs: ["one candidate plan identity", "task artifact", "immutable base", "planning source HEAD"],
      missing_inputs: [],
      required_evidence: requiredPlanningLenses,
      missing_evidence: planningCohortDisposition.missing_lenses.length > 0
        ? planningCohortDisposition.missing_lenses
        : missingPlanningLenses.length > 0 ? missingPlanningLenses
        : ["current exact terminal planning review cohort"],
      stop_reason: "planning_lens_bundle_incomplete",
      next_allowed_action: "launch or continue one fresh read-only planning-review bundle; every required lens result must be terminal and exact before amendment or approval",
      forbidden_actions: ["plan-amend", "plan approval", "implementation", "closeout"],
      notes: [
        ...context.baseNotes,
        `required_planning_review_set: ${requiredPlanningLenses.join(",")}`,
        "plan_review_pass_is_not_a_prerequisite_for_specialized_lens_launch"
      ]
    });
  }

  if (!context.taggedProcedures.has("task-intake") && needsTaskIntake(taskMarkdown)) {
    return buildOperatorStageDraft({
      current_stage: "TASK_INTAKE_REQUIRED",
      next_procedure_id: "task-intake",
      required_inputs: getProcedureRequiredInputs(
        context,
        "task-intake",
        ["current TASK.md", "active task file", "relevant acceptance and boundary docs"]
      ),
      missing_inputs: [],
      required_evidence: ["task-intake"],
      missing_evidence: ["task-intake"],
      stop_reason: "missing_task_input",
      next_allowed_action: "run task-intake to normalize the active task contract",
      forbidden_actions: ["draft plan", "implementation", "closeout"],
      notes: context.baseNotes
    });
  }

  if (!context.taggedProcedures.has("feature-decomposition") && isBroadTaskForDirectPlan(taskMarkdown)) {
    return buildOperatorStageDraft({
      current_stage: "FEATURE_DECOMPOSITION_REQUIRED",
      next_procedure_id: "feature-decomposition",
      required_inputs: getProcedureRequiredInputs(
        context,
        "feature-decomposition",
        ["broad request", "roadmap and boundary docs", "constraints and non-goals"]
      ),
      missing_inputs: [],
      required_evidence: ["feature-decomposition"],
      missing_evidence: ["feature-decomposition"],
      stop_reason: "task_too_broad_for_direct_plan",
      next_allowed_action: "run feature-decomposition before direct planning or implementation",
      forbidden_actions: ["implementation"],
      notes: context.baseNotes
    });
  }

  if (!context.taggedProcedures.has("task-prompt-writer")) {
    return buildOperatorStageDraft({
      current_stage: "TASK_PROMPT_REQUIRED",
      next_procedure_id: "task-prompt-writer",
      required_inputs: getProcedureRequiredInputs(
        context,
        "task-prompt-writer",
        ["active task contract", "Phase 23.6 procedure contract", "validation commands", "repo boundaries"]
      ),
      missing_inputs: [],
      required_evidence: ["task-prompt-writer"],
      missing_evidence: ["task-prompt-writer"],
      stop_reason: "missing_task_contract",
      next_allowed_action: "run task-prompt-writer to produce bounded invocation guidance",
      forbidden_actions: ["implementation", "verification", "closeout"],
      notes: context.baseNotes
    });
  }

  if (!context.taggedProcedures.has("draft-plan") && !context.taggedProcedures.has("plan-amend") && !hasPlanReviewEvidence) {
    return buildOperatorStageDraft({
      current_stage: "PLAN_DRAFT_REQUIRED",
      next_procedure_id: "draft-plan",
      required_inputs: getProcedureRequiredInputs(
        context,
        "draft-plan",
        ["task prompt guidance", "repo context", "active constraints"]
      ),
      missing_inputs: [],
      required_evidence: ["draft-plan"],
      missing_evidence: ["draft-plan"],
      stop_reason: "missing_plan",
      next_allowed_action: "run draft-plan before implementation begins",
      forbidden_actions: ["implementation", "closeout"],
      notes: context.baseNotes
    });
  }

  if (!hasPlanReviewEvidence || !durablePlanReviewOutcomeRecorded || !freshPlanReviewForLatestAmend) {
    if (context.runContext && !hasPlanReviewEvidence) {
      const latestLaunchAttempt = readLatestReviewLaunchAttempt(context.runContext, "plan-review");
      const blockedLaunch = latestLaunchAttempt
        ? buildBlockedReviewLaunchStage(context, "plan-review", latestLaunchAttempt)
        : undefined;
      if (blockedLaunch) {
        return blockedLaunch;
      }
    }

    return buildOperatorStageDraft({
      current_stage: "PLAN_REVIEW_REQUIRED",
      next_procedure_id: "plan-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "plan-review",
        ["draft plan", "task contract", "review tier"]
      ),
      missing_inputs: [],
      required_evidence: hasPlanReviewEvidence
        ? ["plan-review", "durable plan review decision record"]
        : ["plan-review"],
      missing_evidence: !freshPlanReviewForLatestAmend
        ? ["fresh plan-review after the latest plan-amend artifact"]
        : hasPlanReviewEvidence
        ? ["durable plan review decision record"]
        : ["plan-review"],
      stop_reason: !freshPlanReviewForLatestAmend
        ? "plan_amend_requires_fresh_independent_review"
        : hasPlanReviewEvidence
        ? "missing_plan_review_decision_record"
        : "missing_plan_review",
      next_allowed_action: !freshPlanReviewForLatestAmend
        ? "launch a fresh independent plan-review against the latest effective plan-amend artifact before owner approval"
        : hasPlanReviewEvidence
        ? "record or import the durable plan-review decision record before implementation can continue"
        : buildReviewStageAction("plan-review"),
      forbidden_actions: ["implementation", "source edits", "closeout"],
      notes: !freshPlanReviewForLatestAmend
        ? [...context.baseNotes, "plan_review_stale_for_latest_plan_amend: true"]
        : hasPlanReviewEvidence
        ? [...context.baseNotes, "plan_review_progression_requires_durable_outcome: true"]
        : context.baseNotes
    });
  }

  if (planReviewDecision?.route === "blocked") {
    return buildOperatorStageDraft({
      current_stage: "BLOCKED",
      next_procedure_id: "none",
      required_inputs: ["plan-review durable decision record"],
      missing_inputs: [],
      required_evidence: ["operator resolution of the recorded plan-review decision"],
      missing_evidence: ["operator resolution of the recorded plan-review decision"],
      stop_reason: planReviewDecision.stopReason,
      next_allowed_action: planReviewDecision.nextAllowedAction,
      forbidden_actions: ["implementation", "closeout"],
      notes: [...context.baseNotes, ...planReviewDecision.notes]
    });
  }

  if (
    !context.planApproved &&
    (
      context.blockingFindings ||
      (
        planReviewDecision?.route === "amend" &&
        (!hasPlanAmendEvidence || !freshPlanAmendForLatestPlanReview || context.blockingFindings)
      )
    )
  ) {
    return buildOperatorStageDraft({
      current_stage: "PLAN_AMEND_REQUIRED",
      next_procedure_id: "plan-amend",
      required_inputs: getProcedureRequiredInputs(context, "plan-amend", ["plan review findings"]),
      missing_inputs: [],
      required_evidence: planReviewDecision?.route === "amend"
        ? ["plan-amend after the latest durable plan-review decision"]
        : ["plan-amend"],
      missing_evidence: planReviewDecision?.route === "amend" && hasPlanAmendEvidence && !freshPlanAmendForLatestPlanReview
        ? ["fresh plan-amend after the latest durable plan-review decision"]
        : ["plan-amend"],
      stop_reason: planReviewDecision?.stopReason ?? "plan_review_requires_amendment",
      next_allowed_action: planReviewDecision?.nextAllowedAction ?? "run plan-amend to address blocking review findings",
      forbidden_actions: ["implementation", "closeout"],
      notes: planReviewDecision
        ? [
            ...context.baseNotes,
            ...planReviewDecision.notes,
            ...(hasPlanAmendEvidence && !freshPlanAmendForLatestPlanReview
              ? ["plan_amend_stale_for_latest_plan_review: true"]
              : [])
          ]
        : context.baseNotes
    });
  }

  if (!context.planApproved) {
    return buildOperatorStageDraft({
      current_stage: "PLAN_APPROVAL_REQUIRED",
      next_procedure_id: "none",
      required_inputs: ["reviewed plan"],
      missing_inputs: [],
      required_evidence: ["explicit reviewed-plan owner approval"],
      missing_evidence: ["explicit reviewed-plan owner approval"],
      stop_reason: "missing_plan_approval",
      next_allowed_action: planReviewDecision?.route === "approval"
        ? planReviewDecision.nextAllowedAction
        : "obtain explicit human approval of the reviewed plan",
      forbidden_actions: ["implementation", "closeout"],
      notes: planReviewDecision ? [...context.baseNotes, ...planReviewDecision.notes] : context.baseNotes
    });
  }

  if (context.runContext && !isPrePhaseFVerificationCompatibility(context.runContext.run.phase_id)) {
    const binding = context.runContext.run.implementation_baseline_binding;
    if (!binding
      || binding.schema_version !== 2
      || !binding.plan_review_artifact_hash
      || !binding.authority_transition
      || context.runContext.run.implementation_baseline_head !== binding.implementation_baseline_head) {
      return buildOperatorStageDraft({
        current_stage: "IMPLEMENTATION_BASELINE_REQUIRED",
        next_procedure_id: "none",
        required_inputs: ["approved plan", "exact approval ID", "clean reviewed source HEAD"],
        missing_inputs: [],
        required_evidence: ["durable implementation baseline binding"],
        missing_evidence: ["durable implementation baseline binding"],
        stop_reason: "missing_implementation_baseline",
        next_allowed_action: "bind the exact approved reviewed source as the implementation baseline before implementation begins",
        forbidden_actions: ["implementation", "source edits", "implementation-review", "closeout"],
        notes: [...context.baseNotes, "implementation_baseline_required_for_phase_f_and_later: true"]
      });
    }
  }

  if (!context.implementationEvidence) {
    return buildOperatorStageDraft({
      current_stage: "IMPLEMENTATION_READY",
      next_procedure_id: "none",
      required_inputs: ["approved plan", "task contract", "allowed scope"],
      missing_inputs: [],
      required_evidence: ["implementation/source/runtime change evidence"],
      missing_evidence: ["implementation/source/runtime change evidence"],
      stop_reason: "missing_builder_handoff",
      next_allowed_action: "perform the approved implementation work inside task scope",
      forbidden_actions: ["closeout"],
      notes: context.baseNotes
    });
  }

  return undefined;
}

function resolveImplementationReviewStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  const taggedProcedures = context.taggedProcedures ?? new Set<string>();
  const hasImplementationReview = taggedProcedures.has("implementation-review");
  const hasFixPassReview = taggedProcedures.has("fix-pass-review");

  if (!hasImplementationReview && !hasFixPassReview) {
    if (context.runContext) {
      const latestLaunchAttempt = readLatestReviewLaunchAttempt(context.runContext, "implementation-review");
      const blockedLaunch = latestLaunchAttempt
        ? buildBlockedReviewLaunchStage(context, "implementation-review", latestLaunchAttempt)
        : undefined;
      if (blockedLaunch) {
        return blockedLaunch;
      }
    }

    return buildOperatorStageDraft({
      current_stage: "IMPLEMENTATION_REVIEW_REQUIRED",
      next_procedure_id: "implementation-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "implementation-review",
        ["implementation report", "changed files", "test output"]
      ),
      missing_inputs: [],
      required_evidence: ["implementation-review"],
      missing_evidence: ["implementation-review"],
      stop_reason: "missing_implementation_evidence",
      next_allowed_action: buildReviewStageAction("implementation-review"),
      forbidden_actions: ["implementation", "source edits", "closeout"],
      notes: context.baseNotes
    });
  }

  if ((hasImplementationReview || hasFixPassReview) && !context.latestImplementationChainReviewResult) {
    return buildOperatorStageDraft({
      current_stage: "BLOCKED",
      next_procedure_id: "none",
      required_inputs: ["parseable implementation/fix-pass review result"],
      missing_inputs: [],
      required_evidence: ["review-chain result with a recognized recommendation"],
      missing_evidence: ["review-chain result with a recognized recommendation"],
      stop_reason: "invalid_review_chain_evidence",
      next_allowed_action: "record or rerun a parseable implementation-review or fix-pass-review artifact before verification can continue",
      forbidden_actions: ["implementation", "source edits", "verification", "closeout", "phase closeout review", "harvest"],
      notes: [...context.baseNotes, "review_chain_parseable_result_required: true"]
    });
  }

  if (
    (context.latestImplementationChainReviewResult?.status === "FIX_REQUIRED" || context.blockingFindings) &&
    hasImplementationReview
  ) {
    const latestFixPassReviewStillRequiresFix = context.latestImplementationChainReviewResult
      ? reviewSourceMatchesProcedure(context.latestImplementationChainReviewResult.source, "fix-pass-review")
        && context.latestImplementationChainReviewResult.status === "FIX_REQUIRED"
      : false;
    return buildOperatorStageDraft({
      current_stage: "FIX_PASS_REQUIRED",
      next_procedure_id: "fix-pass-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "fix-pass-review",
        ["implementation review findings", "fix-pass diff", "fix-pass tests"]
      ),
      missing_inputs: [],
      required_evidence: latestFixPassReviewStillRequiresFix
        ? ["resolved fix-pass-review after a scoped fix-pass diff"]
        : ["fix-pass-review"],
      missing_evidence: latestFixPassReviewStillRequiresFix
        ? ["scoped fix-pass diff and resolved fix-pass-review"]
        : ["fix-pass-review"],
      stop_reason: "unresolved_review_findings",
      next_allowed_action: latestFixPassReviewStillRequiresFix
        ? "perform a scoped fix pass for the unresolved findings, then run fix-pass-review"
        : buildReviewStageAction("fix-pass-review"),
      forbidden_actions: ["closeout", "phase closeout review", "harvest"],
      notes: context.baseNotes
    });
  }

  return undefined;
}

function buildC2ACombinedReviewRequiredStage(
  context: OperatorEvaluationContext,
  missingEvidence: string[],
  stopReason: "missing_combined_architecture_db_review" | "combined_review_refresh_required"
): OperatorStageDraft {
  const fresh = stopReason === "combined_review_refresh_required";
  return buildOperatorStageDraft({
    current_stage: "COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED",
    next_procedure_id: "architecture-review",
    required_inputs: [
      "implementation diff and verification evidence",
      "active C2A task contract",
      "architecture/authority and persisted-storage/no-storage-change review surface"
    ],
    missing_inputs: [],
    required_evidence: fresh
      ? ["fresh combined architecture-review and db-storage-review after the fix pass"]
      : ["combined architecture-review and db-storage-review"],
    missing_evidence: missingEvidence,
    stop_reason: stopReason,
    next_allowed_action: fresh
      ? "run one fresh independent read-only combined architecture/authority and db-storage review, then record the artifact under both procedures"
      : "run one independent read-only combined architecture/authority and db-storage review, then record the artifact under both procedures",
    forbidden_actions: ["implementation", "source edits", "verification", "closeout", "phase closeout review", "harvest"],
    notes: context.baseNotes
  });
}

function resolveC2ACombinedArchitectureDbReviewStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  if (context.taskContext.phaseId !== "23.8.6C2A" || !context.runContext) {
    return undefined;
  }

  const taggedProcedures = context.taggedProcedures ?? new Set<string>();
  const hasArchitectureEvidence = taggedProcedures.has("architecture-review");
  const hasDbStorageEvidence = taggedProcedures.has("db-storage-review");

  if (!hasArchitectureEvidence || !hasDbStorageEvidence) {
    return buildC2ACombinedReviewRequiredStage(
      context,
      [
        ...(!hasArchitectureEvidence ? ["architecture-review"] : []),
        ...(!hasDbStorageEvidence ? ["db-storage-review"] : [])
      ],
      "missing_combined_architecture_db_review"
    );
  }

  const architectureReview = context.latestArchitectureReviewResult;
  const dbStorageReview = context.latestDbStorageReviewResult;
  if (!architectureReview || !dbStorageReview) {
    return buildOperatorStageDraft({
      current_stage: "BLOCKED",
      next_procedure_id: "none",
      required_inputs: ["parseable labeled architecture/authority and persisted-storage/no-storage-change verdicts"],
      missing_inputs: [],
      required_evidence: ["parseable combined architecture-review and db-storage-review results"],
      missing_evidence: ["parseable combined architecture-review and db-storage-review results"],
      stop_reason: "invalid_combined_architecture_db_review_evidence",
      next_allowed_action: "record or rerun one combined review artifact with both labeled verdicts under architecture-review and db-storage-review",
      forbidden_actions: ["implementation", "source edits", "verification", "closeout", "phase closeout review", "harvest"],
      notes: context.baseNotes
    });
  }

  const run = context.runContext.run;
  const architectureIndex = run.review_results.indexOf(architectureReview);
  const dbStorageIndex = run.review_results.indexOf(dbStorageReview);
  const passesTogether = architectureReview.status === "PASS"
    && dbStorageReview.status === "PASS"
    && reviewsShareArtifact(architectureReview, dbStorageReview);
  const latestFailureIndex = findLatestCombinedReviewFailureIndex(run);
  const latestFixPassIndex = findLatestSuccessfulFixPassIndex(run);
  const fixPassFollowsFailure = latestFailureIndex >= 0 && latestFixPassIndex > latestFailureIndex;

  if (latestFailureIndex >= 0 && !fixPassFollowsFailure) {
    return buildOperatorStageDraft({
      current_stage: "FIX_PASS_REQUIRED",
      next_procedure_id: "fix-pass-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "fix-pass-review",
        ["combined architecture/db review findings", "fix-pass diff", "fix-pass tests"]
      ),
      missing_inputs: [],
      required_evidence: ["fix-pass-review"],
      missing_evidence: ["fix-pass-review"],
      stop_reason: "unresolved_combined_architecture_db_review_findings",
      next_allowed_action: buildReviewStageAction("fix-pass-review"),
      forbidden_actions: ["closeout", "phase closeout review", "harvest"],
      notes: context.baseNotes
    });
  }

  if (fixPassFollowsFailure) {
    const bothPostFixPass = passesTogether
      && architectureIndex > latestFixPassIndex
      && dbStorageIndex > latestFixPassIndex;
    if (bothPostFixPass) {
      return undefined;
    }

    return buildC2ACombinedReviewRequiredStage(
      context,
      ["one shared fresh combined architecture-review and db-storage-review artifact after the fix pass"],
      "combined_review_refresh_required"
    );
  }

  if (passesTogether) {
    return undefined;
  }

  if (architectureReview.status !== "PASS" || dbStorageReview.status !== "PASS") {
    return buildOperatorStageDraft({
      current_stage: "FIX_PASS_REQUIRED",
      next_procedure_id: "fix-pass-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "fix-pass-review",
        ["combined architecture/db review findings", "fix-pass diff", "fix-pass tests"]
      ),
      missing_inputs: [],
      required_evidence: ["fix-pass-review"],
      missing_evidence: ["fix-pass-review"],
      stop_reason: "unresolved_combined_architecture_db_review_findings",
      next_allowed_action: buildReviewStageAction("fix-pass-review"),
      forbidden_actions: ["closeout", "phase closeout review", "harvest"],
      notes: context.baseNotes
    });
  }

  return buildC2ACombinedReviewRequiredStage(
    context,
    ["one shared combined architecture-review and db-storage-review artifact"],
    "missing_combined_architecture_db_review"
  );
}

function resolveVerificationStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  const taggedProcedures = context.taggedProcedures ?? new Set<string>();
  const hasVerificationReview = taggedProcedures.has("verification-review");

  if (!context.latestVerification || context.latestVerification.status !== "pass" || !hasVerificationReview) {
    return buildOperatorStageDraft({
      current_stage: "VERIFICATION_REVIEW_REQUIRED",
      next_procedure_id: "verification-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "verification-review",
        ["verification command results", "build/test evidence"]
      ),
      missing_inputs: [],
      required_evidence: ["passing verification evidence", "verification-review"],
      missing_evidence: [
        ...(!context.latestVerification || context.latestVerification.status !== "pass" ? ["passing verification evidence"] : []),
        ...(!hasVerificationReview ? ["verification-review"] : [])
      ],
      stop_reason: "missing_verification_evidence",
      next_allowed_action: buildReviewStageAction("verification-review"),
      forbidden_actions: ["implementation", "source edits", "closeout", "phase closeout review", "harvest"],
      notes: context.latestVerification
        ? [...context.baseNotes, `latest_verification_status: ${context.latestVerification.status}`]
        : context.baseNotes
    });
  }

  if ((context.runContext?.run.delivery_facts.length ?? 0) === 0 || !taggedProcedures.has("delivery-facts-review")) {
    return buildOperatorStageDraft({
      current_stage: "DELIVERY_FACTS_REVIEW_REQUIRED",
      next_procedure_id: "delivery-facts-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "delivery-facts-review",
        ["delivery facts record/import"]
      ),
      missing_inputs: [],
      required_evidence: ["delivery facts", "delivery-facts-review"],
      missing_evidence: [
        ...((context.runContext?.run.delivery_facts.length ?? 0) === 0 ? ["delivery facts"] : []),
        ...(!taggedProcedures.has("delivery-facts-review") ? ["delivery-facts-review"] : [])
      ],
      stop_reason: "missing_delivery_facts",
      next_allowed_action: buildReviewStageAction("delivery-facts-review"),
      forbidden_actions: ["implementation", "source edits", "closeout", "harvest"],
      notes: context.baseNotes
    });
  }

  return undefined;
}

function isHarvestReady(context: OperatorEvaluationContext): boolean {
  return context.latestCloseoutReceipt?.status === "READY" &&
    context.runContext?.run.lifecycle_status === "closed" &&
    !context.runContext.run.harvested_at &&
    !context.runContext.run.discard_reason;
}

function resolveCloseoutLifecycleStage(context: OperatorEvaluationContext): OperatorStageDraft {
  const taggedProcedures = context.taggedProcedures ?? new Set<string>();
  const latestCloseoutReceipt = context.latestCloseoutReceipt;

  if ((context.runContext?.run.delivery_facts.length ?? 0) === 0 || !taggedProcedures.has("delivery-facts-review")) {
    throw new Error("resolveCloseoutLifecycleStage requires delivery facts to be satisfied first.");
  }

  if (!taggedProcedures.has("phase-closeout-review") || !latestCloseoutReceipt || latestCloseoutReceipt.status === "BLOCKED") {
    return buildOperatorStageDraft({
      current_stage: "CLOSEOUT_REVIEW_REQUIRED",
      next_procedure_id: taggedProcedures.has("phase-closeout-review") ? "none" : "phase-closeout-review",
      required_inputs: getProcedureRequiredInputs(
        context,
        "phase-closeout-review",
        ["implementation review", "verification evidence", "delivery facts"]
      ),
      missing_inputs: [],
      required_evidence: ["phase-closeout-review", "ready closeout receipt"],
      missing_evidence: [
        ...(!taggedProcedures.has("phase-closeout-review") ? ["phase-closeout-review"] : []),
        ...(!latestCloseoutReceipt || latestCloseoutReceipt.status === "BLOCKED" ? ["ready closeout receipt"] : [])
      ],
      stop_reason: !latestCloseoutReceipt
        ? "missing_closeout_receipt"
        : "missing_closeout_review",
      next_allowed_action: taggedProcedures.has("phase-closeout-review")
        ? "run the closeout lifecycle command under Phase 23.5 rules to produce a ready closeout receipt"
        : buildReviewStageAction("phase-closeout-review"),
      forbidden_actions: ["implementation", "source edits", "harvest"],
      notes: latestCloseoutReceipt?.status === "BLOCKED"
        ? [...context.baseNotes, ...latestCloseoutReceipt.blockers.map((blocker) => `closeout_blocker: ${blocker}`)]
        : context.baseNotes
    });
  }

  if (isHarvestReady(context)) {
    return buildOperatorStageDraft({
      current_stage: "HARVEST_READY",
      next_procedure_id: "none",
      required_inputs: ["closeout receipt", "closed lifecycle status", "harvest candidates"],
      missing_inputs: [],
      required_evidence: ["closeout receipt", "closed lifecycle status"],
      missing_evidence: [],
      stop_reason: "harvest_ready",
      next_allowed_action: "perform the harvest lifecycle command under Phase 23.5 rules",
      forbidden_actions: ["direct accepted-memory writes without harvest"],
      notes: context.baseNotes
    });
  }

  return buildOperatorStageDraft({
    current_stage: "CLOSEOUT_READY",
    next_procedure_id: "none",
    required_inputs: ["accepted closeout review", "ready closeout receipt"],
    missing_inputs: [],
    required_evidence: ["ready closeout receipt"],
    missing_evidence: [],
    stop_reason: "closeout_ready",
    next_allowed_action: "run the closeout lifecycle command under Phase 23.5 rules",
    forbidden_actions: ["new implementation in the same run"],
    notes: context.baseNotes
  });
}

function resolvePostImplementationStage(context: OperatorEvaluationContext): OperatorStageDraft {
  return resolveImplementationReviewStage(context)
    ?? resolveC2ACombinedArchitectureDbReviewStage(context)
    ?? resolveVerificationStage(context)
    ?? resolveCloseoutLifecycleStage(context);
}

function buildOperatorEvaluationContext(targetRoot: string, projectRoot: string, options: OperatorEvaluationOptions): {
  targetRoot: string;
  projectRoot: string;
  dryRun: boolean;
  procedureIds: Set<string>;
  reviewTier: OperatorReviewTier;
  taskContext?: OperatorTaskContext;
  roadmapTaskPath?: string;
  context?: OperatorEvaluationContext;
} {
  const dryRun = options.dryRun ?? false;
  const procedureRegistry = readSelfHostingProcedureRegistry(targetRoot);
  const proceduresById = procedureRegistry ? indexSelfHostingProceduresById(procedureRegistry) : undefined;
  const procedureIds = readPhase236ProcedureIds(targetRoot, procedureRegistry);
  const taskContext = resolveOperatorTaskContext(targetRoot);

  if (!taskContext) {
    return {
      targetRoot,
      projectRoot,
      dryRun,
      procedureIds,
      reviewTier: "standard"
    };
  }

  const { tier, notes } = classifyOperatorReviewTier(taskContext.activeTaskMarkdown);
  const roadmapTaskPath = readRoadmapTaskPathForPhase(targetRoot, taskContext.phaseId);
  const runContext = loadOperatorRunContext(targetRoot, projectRoot, options.runId, options.runOverride);
  const taggedProcedures = runContext ? collectTaggedProcedureEvidence(runContext.run, procedureIds) : undefined;
  const latestCloseoutReceipt = runContext?.closeoutReceipt
    ?? (runContext && runContext.run.closeout_receipts.length > 0
      ? runContext.run.closeout_receipts[runContext.run.closeout_receipts.length - 1]
      : undefined);

  const planApproved = runContext ? hasApprovedPlan(runContext) : undefined;

  return {
    targetRoot,
    projectRoot,
    dryRun,
    procedureIds,
    reviewTier: tier,
    taskContext,
    roadmapTaskPath,
    context: {
      procedureIds,
      taskContext,
      reviewTier: tier,
      baseNotes: [...notes, ...(runContext?.notes ?? [])],
      ...(procedureRegistry ? { procedureRegistry, proceduresById } : {}),
      runContext,
      taggedProcedures,
      latestPlanReviewResult: runContext ? findLatestProcedureReviewResult(runContext.run, "plan-review") : undefined,
      latestPlanReviewDecisionRecord: runContext ? readLatestPlanReviewDecisionRecord(runContext, procedureIds) : undefined,
      latestImplementationChainReviewResult: runContext
        ? findLatestProcedureReviewResultForAny(runContext.run, ["implementation-review", "fix-pass-review"])
        : undefined,
      latestArchitectureReviewResult: runContext
        ? findLatestProcedureReviewResult(runContext.run, "architecture-review")
        : undefined,
      latestDbStorageReviewResult: runContext
        ? findLatestProcedureReviewResult(runContext.run, "db-storage-review")
        : undefined,
      latestVerification: runContext && runContext.run.verification_results.length > 0
        ? runContext.run.verification_results[runContext.run.verification_results.length - 1]
        : undefined,
      latestCloseoutReceipt,
      blockingFindings: runContext ? hasBlockingFindings(runContext.run) : undefined,
      planApproved,
      implementationEvidence: runContext
        ? hasImplementationEvidence(runContext.run, procedureIds, {
            allowLiveChangeProbe: planApproved === true && runContext.quarantinedPayloadCount === 0,
            taskMarkdown: taskContext.activeTaskMarkdown,
            effectivePlanMarkdown: runContext ? readPlanScopeMarkdown(runContext) : undefined,
            activeTaskPath: taskContext.activeTaskPath
          })
        : undefined
    }
  };
}

function resolveRuntimeOperatorStatus(cwd: string, options: OperatorEvaluationOptions = {}): RuntimeOperatorStatusResult {
  const roots = resolveHarnessRoots(cwd);
  const evaluation = buildOperatorEvaluationContext(roots.targetRoot, roots.projectRoot, options);

  if (!evaluation.taskContext || !evaluation.context) {
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      operator: buildOperatorStatus(evaluation.procedureIds, evaluation.reviewTier, resolveTaskMissingStage(evaluation.procedureIds))
    };
  }

  if (!evaluation.roadmapTaskPath || evaluation.roadmapTaskPath !== evaluation.taskContext.activeTaskPath) {
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      operator: buildOperatorStatus(
        evaluation.procedureIds,
        evaluation.reviewTier,
        resolveRoadmapConflictStage(evaluation.context, evaluation.roadmapTaskPath)
      )
    };
  }

  if (!evaluation.context.runContext) {
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      operator: buildOperatorStatus(
        evaluation.procedureIds,
        evaluation.reviewTier,
        resolveNoActiveRunStage(evaluation.context, options.runId)
      )
    };
  }

  const terminalStage = resolveTerminalRunStage(evaluation.context);

  if (terminalStage) {
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      run: evaluation.context.runContext.run,
      runPath: evaluation.context.runContext.runPath,
      closeoutPath: evaluation.context.runContext.closeoutPath,
      operator: buildOperatorStatus(evaluation.procedureIds, evaluation.reviewTier, terminalStage)
    };
  }

  const activeReviewLaunchStage = resolveActiveReviewLaunchStage(evaluation.context);

  if (activeReviewLaunchStage) {
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      run: evaluation.context.runContext.run,
      runPath: evaluation.context.runContext.runPath,
      closeoutPath: evaluation.context.runContext.closeoutPath,
      operator: buildOperatorStatus(evaluation.procedureIds, evaluation.reviewTier, activeReviewLaunchStage)
    };
  }

  const bootstrapRepairStage = resolveBootstrapRepairStage(evaluation.context);

  if (bootstrapRepairStage) {
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      run: evaluation.context.runContext.run,
      runPath: evaluation.context.runContext.runPath,
      closeoutPath: evaluation.context.runContext.closeoutPath,
      operator: buildOperatorStatus(evaluation.procedureIds, evaluation.reviewTier, bootstrapRepairStage)
    };
  }

  const currentStageState = evaluation.context.runContext.run.stage_states?.find((candidate) => candidate.current);
  if (currentStageState) {
    const nextProcedureByStage: Record<string, string> = {
      TASK_PROMPT_PACKET: "task-prompt-writer",
      PLAN_DRAFT_PACKET: "draft-plan",
      PLAN_REVIEW_PACKET: "plan-review",
      PLAN_AMEND_PACKET: "plan-amend",
      IMPLEMENTATION_REVIEW_PACKET: "implementation-review",
      FIX_PASS_PACKET: "fix-pass-review",
      NEXT_SEMANTIC_REVIEW_PACKET: "architecture-review",
      ARCHITECTURE_REVIEW_PACKET: "architecture-review",
      DB_STORAGE_REVIEW_PACKET: "db-storage-review",
      VERIFICATION_REVIEW_PACKET: "verification-review",
      DELIVERY_FACTS_REVIEW_PACKET: "delivery-facts-review",
      PHASE_CLOSEOUT_REVIEW_PACKET: "phase-closeout-review",
      CLOSEOUT_PACKET: "none",
      PLAN_APPROVAL_REQUIRED: "none",
      BLOCKED_DISPOSITION: "none"
    };
    const nextProcedureId = currentStageState.status === "ready"
      ? currentStageState.procedure_id
      : nextProcedureByStage[currentStageState.next_allowed_action] ?? "none";
    const stageProjection = buildOperatorStageDraft({
      current_stage: currentStageState.current_stage,
      next_procedure_id: nextProcedureId,
      required_inputs: currentStageState.missing_inputs,
      missing_inputs: currentStageState.missing_inputs,
      required_evidence: currentStageState.validation_refs,
      missing_evidence: currentStageState.missing_evidence,
      stop_reason: currentStageState.stop_reason,
      human_action_required: currentStageState.human_action_required,
      next_allowed_action: currentStageState.next_allowed_action,
      forbidden_actions: currentStageState.status === "blocked" ? ["stage progression", "closeout"] : ["runner launch", "provider selection"],
      notes: [`stage_state_id: ${currentStageState.stage_state_id}`, ...currentStageState.bounded_progress_log]
    });
    return {
      targetRoot: evaluation.targetRoot,
      projectRoot: evaluation.projectRoot,
      dryRun: evaluation.dryRun,
      run: evaluation.context.runContext.run,
      runPath: evaluation.context.runContext.runPath,
      closeoutPath: evaluation.context.runContext.closeoutPath,
      operator: buildOperatorStatus(evaluation.procedureIds, evaluation.reviewTier, stageProjection)
    };
  }

  const preImplementationStage = resolvePreImplementationStage(evaluation.context);
  const stage = preImplementationStage ?? resolvePostImplementationStage(evaluation.context);

  return {
    targetRoot: evaluation.targetRoot,
    projectRoot: evaluation.projectRoot,
    dryRun: evaluation.dryRun,
    run: evaluation.context.runContext.run,
    runPath: evaluation.context.runContext.runPath,
    closeoutPath: evaluation.context.runContext.closeoutPath,
      operator: buildOperatorStatus(evaluation.procedureIds, evaluation.reviewTier, stage)
  };
}

export function getRuntimeOperatorStatus(cwd: string, options: RuntimeDryRunOptions = {}): RuntimeOperatorStatusResult {
  const result = resolveRuntimeOperatorStatus(cwd, options);
  if (result.run?.stage_results?.length) {
    const staging = new RunStagingDatabase(result.targetRoot, result.projectRoot, result.run.run_id);
    for (const stageResult of result.run.stage_results) {
      const rawPayload = staging.readStageResultPayload({
        resultId: stageResult.stage_result_id,
        payloadId: stageResult.payload_id,
        sourceRunId: result.run.run_id,
        procedureId: stageResult.procedure_id
      });
      const fixture = JSON.parse(rawPayload) as Record<string, unknown>;
      const exactFixtureFields: Array<[unknown, unknown]> = [
        [fixture.stage_result_id ?? stageResult.stage_result_id, stageResult.stage_result_id],
        [fixture.stage_packet_id, stageResult.stage_packet_id],
        [fixture.runner_profile_id, stageResult.runner_profile_id],
        [fixture.outcome, stageResult.outcome],
        [fixture.summary, stageResult.summary],
        [fixture.files_changed, stageResult.files_changed],
        [fixture.commands, stageResult.commands],
        [fixture.outputs, stageResult.outputs],
        [fixture.blockers, stageResult.blockers],
        [fixture.evidence_refs, stageResult.evidence_refs],
        [fixture.completed_reviews, stageResult.completed_reviews],
        [fixture.anomaly_codes ?? [], stageResult.anomaly_codes],
        [fixture.waiver_refs ?? [], stageResult.waiver_refs],
        [fixture.validation_results, stageResult.validation_results],
        [fixture.bounded_progress_log, stageResult.bounded_progress_log],
        [fixture.actual_invocation_facts, stageResult.actual_invocation_facts],
        [fixture.usage_ref, stageResult.usage_ref]
      ];
      if (exactFixtureFields.some(([actual, expected]) => canonicalJson(actual) !== canonicalJson(expected))) {
        throw new Error("Stage result payload semantics do not exactly match its result record.");
      }
    }
  }
  return result;
}

function buildVerifierArtifact(targetRoot: string, taskId: string): ArtifactRef {
  return {
    artifact_id: "verifier-json",
    path: toPortablePath(path.join(TASKS_DIR, taskId, TASK_VERIFIER_FILE)),
    kind: "verifier",
    producer_command: "node bin/ch check",
    description: "Existing deterministic verifier artifact."
  };
}

function mapVerifierToVerification(run: Run, verifier: VerifierRecord, targetRoot: string): VerificationResult {
  const createdAt = verifier.checked_at || verifier.captured_at || nowIso();
  const commands = verifier.commands.map((command, index): CommandResult => ({
    command_result_id: `verifier-command-${index + 1}`,
    command: command.command,
    exit_code: command.exit_code,
    status: command.result,
    completed_at: createdAt,
    duration_ms: command.duration_ms,
    artifact_refs: []
  }));

  return {
    verification_result_id: nextId("verification", run.verification_results.length),
    status: verifier.result,
    created_at: createdAt,
    summary: `Verifier artifact result is ${verifier.result}.`,
    source: "verifier",
    artifact_refs: [buildVerifierArtifact(targetRoot, verifier.task_id)],
    command_results: commands
  };
}

function readInstalledVerifier(run: Run, targetRoot: string): VerificationResult {
  const timestamp = nowIso();

  if (!detectInstalledLayer(targetRoot)) {
    return {
      verification_result_id: nextId("verification", run.verification_results.length),
      status: "missing",
      created_at: timestamp,
      summary: "Installed task verifier layer is not present.",
      source: "runtime",
      artifact_refs: [],
      command_results: []
    };
  }

  try {
    const taskList = listTasks(targetRoot);

    if (taskList.tasks.length !== 1) {
      return {
        verification_result_id: nextId("verification", run.verification_results.length),
        status: "missing",
        created_at: timestamp,
        summary: `Expected exactly one installed task, found ${taskList.tasks.length}.`,
        source: "runtime",
        artifact_refs: [],
        command_results: []
      };
    }

    const task = taskList.tasks[0];
    const verifierPath = path.join(targetRoot, TASKS_DIR, task.task_id, TASK_VERIFIER_FILE);

    if (!fs.existsSync(verifierPath) || !fs.statSync(verifierPath).isFile()) {
      return {
        verification_result_id: nextId("verification", run.verification_results.length),
        status: "missing",
        created_at: timestamp,
        summary: `Verifier artifact is missing for installed task ${task.task_id}.`,
        source: "runtime",
        artifact_refs: [],
        command_results: []
      };
    }

    return mapVerifierToVerification(run, validateVerifierRecord(readJsonFile(verifierPath)), targetRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      verification_result_id: nextId("verification", run.verification_results.length),
      status: "unknown",
      created_at: timestamp,
      summary: `Unable to inspect verifier artifact: ${message}`,
      source: "runtime",
      artifact_refs: [],
      command_results: []
    };
  }
}

async function executeSelfHostingVerification(
  targetRoot: string,
  run: Run,
  commands: RuntimeVerificationCommand[]
): Promise<{ verification: VerificationResult; snapshot: VerifiedSnapshot }> {
  const store = new MemoryEvidenceStore(targetRoot);
  const artifactStore = new EvidenceArtifactStore(targetRoot);
  const roots = resolveHarnessRoots(targetRoot);
  const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, run.run_id);
  staging.ensureInitialized();
  const commandEvidence: VerificationCommandResultEvidence[] = [];
  const runtimeCommandResults: CommandResult[] = [];

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const display = buildRuntimeVerificationDisplayCommand(command);
    const startedAt = nowIso();
    const result = runStructuredCommand({
      command: command.command,
      args: command.args,
      cwd: targetRoot,
      timeout_seconds: command.timeoutSeconds,
      shell: command.shell,
      capture_stdout: true,
      capture_stderr: true
    });
    const completedAt = nowIso();
    const stdoutArtifact =
      result.stdout.length > 0
        ? artifactStore.write({
            content: result.stdout,
            kind: "stdout",
            mediaType: "text/plain",
            producerCommand: display
          })
        : undefined;
    const stderrArtifact =
      result.stderr.length > 0
        ? artifactStore.write({
            content: result.stderr,
            kind: "stderr",
            mediaType: "text/plain",
            producerCommand: display
          })
        : undefined;
    const artifactRefs = [
      ...(stdoutArtifact ? [toRuntimeArtifactRef(stdoutArtifact)] : []),
      ...(stderrArtifact ? [toRuntimeArtifactRef(stderrArtifact)] : [])
    ];
    const parentRecordId = `command-result:verification-command-${index + 1}`;

    if (stdoutArtifact) {
      staging.storePayload({
        parentRecordId,
        sourceRunId: run.run_id,
        sourcePhaseId: run.phase_id,
        kind: "stdout",
        mediaType: "text/plain",
        summary: `${display} stdout`,
        content: result.stdout,
        searchableText: result.stdout.slice(0, 4000),
        boundedExcerpt: result.stdout.slice(0, 500),
        retentionClass: "audit"
      });
    }

    if (stderrArtifact) {
      staging.storePayload({
        parentRecordId,
        sourceRunId: run.run_id,
        sourcePhaseId: run.phase_id,
        kind: "stderr",
        mediaType: "text/plain",
        summary: `${display} stderr`,
        content: result.stderr,
        searchableText: result.stderr.slice(0, 4000),
        boundedExcerpt: result.stderr.slice(0, 500),
        retentionClass: "audit"
      });
    }

    commandEvidence.push({
      command: display,
      exit_code: result.exitCode,
      duration_ms: result.durationMs,
      ...(stdoutArtifact ? { stdout_artifact: stdoutArtifact } : {}),
      ...(stderrArtifact ? { stderr_artifact: stderrArtifact } : {})
    });
    runtimeCommandResults.push({
      command_result_id: `verification-command-${index + 1}`,
      command: display,
      exit_code: result.exitCode,
      status: result.exitCode === 0 ? "pass" : "fail",
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: result.durationMs,
      artifact_refs: artifactRefs
    });

    await store.append({
      evidenceType: "command_result",
      scope: buildEvidenceScopeForRun(targetRoot, run),
      producerCommand: "node bin/ch run verify",
      provenance: {
        producer: { type: "runtime", command: "node bin/ch run verify" },
        produced_at: completedAt,
        reusable: false,
        stale: false,
        sensitivity: "local",
        redaction_status: "not_applicable",
        exportable: false,
        artifact_refs: [stdoutArtifact, stderrArtifact].filter((artifact) => artifact !== undefined)
      },
      payload: {
        summary: `${display} exited ${result.exitCode}.`,
        command: display,
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        timed_out: result.timedOut
      }
    });

    if (result.exitCode !== 0) {
      break;
    }
  }

  const snapshotTimestamp = nowIso();
  const snapshot = captureVerifiedSnapshot({
    targetRoot,
    commands: commandSpecsToEvidence(commands),
    commandResults: commandEvidence,
    timestamp: snapshotTimestamp
  });
  const passed = commandEvidence.length === commands.length && commandEvidence.every((result) => result.exit_code === 0);
  const summary = passed
    ? "Self-hosting verification commands passed."
    : `Self-hosting verification failed at ${commandEvidence[commandEvidence.length - 1]?.command ?? "unknown command"}.`;

  return {
    verification: {
      verification_result_id: nextId("verification", run.verification_results.length),
      status: passed ? "pass" : "fail",
      created_at: snapshotTimestamp,
      summary,
      source: "self-hosting",
      artifact_refs: dedupeRuntimeArtifactRefs(runtimeCommandResults.flatMap((result) => result.artifact_refs)),
      command_results: runtimeCommandResults
    },
    snapshot
  };
}

function buildReviewArtifact(taskId: string): ArtifactRef {
  return {
    artifact_id: "review-json",
    path: toPortablePath(path.join(TASKS_DIR, taskId, TASK_REVIEW_FILE)),
    kind: "review",
    producer_command: "node bin/ch review",
    description: "Existing review artifact."
  };
}

function mapHarnessReview(run: Run, taskId: string, review: HarnessReviewRecord): ReviewResult {
  return {
    review_result_id: nextId("review", run.review_results.length),
    status: review.result,
    created_at: review.created_at,
    summary: review.summary,
    source: `review:${review.mode}`,
    blockers: review.blockers,
    artifact_refs: [buildReviewArtifact(taskId)]
  };
}

function readInstalledReview(run: Run, targetRoot: string): ReviewResult {
  const timestamp = nowIso();

  if (!detectInstalledLayer(targetRoot)) {
    return {
      review_result_id: nextId("review", run.review_results.length),
      status: "MISSING",
      created_at: timestamp,
      summary: "Installed task review layer is not present.",
      source: "runtime",
      blockers: ["Review artifact is missing."],
      artifact_refs: []
    };
  }

  try {
    const taskList = listTasks(targetRoot);

    if (taskList.tasks.length !== 1) {
      return {
        review_result_id: nextId("review", run.review_results.length),
        status: "MISSING",
        created_at: timestamp,
        summary: `Expected exactly one installed task, found ${taskList.tasks.length}.`,
        source: "runtime",
        blockers: ["Review artifact is missing."],
        artifact_refs: []
      };
    }

    const task = taskList.tasks[0];
    const reviewPath = path.join(targetRoot, TASKS_DIR, task.task_id, TASK_REVIEW_FILE);

    if (!fs.existsSync(reviewPath) || !fs.statSync(reviewPath).isFile()) {
      return {
        review_result_id: nextId("review", run.review_results.length),
        status: "MISSING",
        created_at: timestamp,
        summary: `Review artifact is missing for installed task ${task.task_id}.`,
        source: "runtime",
        blockers: ["Review artifact is missing."],
        artifact_refs: []
      };
    }

    return mapHarnessReview(run, task.task_id, loadTaskReviewRecord(reviewPath, task.task_id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      review_result_id: nextId("review", run.review_results.length),
      status: "UNKNOWN",
      created_at: timestamp,
      summary: `Unable to inspect review artifact: ${message}`,
      source: "runtime",
      blockers: [`Unable to inspect review artifact: ${message}`],
      artifact_refs: []
    };
  }
}

async function resolveVerification(
  targetRoot: string,
  run: Run,
  dryRun: boolean
): Promise<VerificationResolution> {
  const selfHostingCommands = !detectInstalledLayer(targetRoot)
    ? buildSelfHostingVerificationCommands(targetRoot, run)
    : undefined;

  if (!selfHostingCommands || selfHostingCommands.length === 0) {
    const detectedVerification = readInstalledVerifier(run, targetRoot);
    const snapshot = captureVerifiedSnapshot({
      targetRoot,
      commands: commandEvidenceFromVerification(detectedVerification).length > 0
        ? detectedVerification.command_results.map((result) => ({ command: result.command }))
        : [{ command: "node bin/ch run verify" }],
      commandResults: commandEvidenceFromVerification(detectedVerification)
    });

    return {
      verification: detectedVerification,
      snapshot,
      reuseDecision: {
        status:
          detectedVerification.status === "pass"
            ? "RUN"
            : detectedVerification.status === "missing"
              ? "MISSING"
              : "FAILED",
        reason:
          detectedVerification.status === "pass"
            ? "Verification was recorded from the installed verifier artifact."
            : detectedVerification.summary,
        current_fingerprint: snapshot.fingerprint.fingerprint_id,
        invalidated_by: []
      },
      commandEvidence: snapshot.command_results
    };
  }

  const store = new MemoryEvidenceStore(targetRoot);
  const preRunSnapshot = captureVerifiedSnapshot({
    targetRoot,
    commands: commandSpecsToEvidence(selfHostingCommands)
  });

  if (dryRun) {
    return {
      verification: {
        verification_result_id: nextId("verification", run.verification_results.length),
        status: "missing",
        created_at: nowIso(),
        summary: "Dry-run does not execute self-hosting verification commands.",
        source: "runtime",
        artifact_refs: [],
        command_results: []
      },
      snapshot: preRunSnapshot,
      reuseDecision: {
        status: "MISSING",
        reason: "Dry-run does not query or execute reusable local verification evidence.",
        current_fingerprint: preRunSnapshot.fingerprint.fingerprint_id,
        invalidated_by: []
      },
      commandEvidence: []
    };
  }

  const reuse = await decideLocalVerificationReuse(store, preRunSnapshot);

  if (reuse.decision.status === "REUSED" && reuse.reusableSnapshot) {
    return {
      verification: buildRuntimeVerificationFromSnapshot(
        run,
        reuse.reusableSnapshot,
        `Local verification evidence reused from ${reuse.reusableSnapshot.snapshot_id}.`,
        "evidence-reuse"
      ),
      snapshot: reuse.reusableSnapshot,
      reuseDecision: reuse.decision,
      commandEvidence: reuse.reusableSnapshot.command_results
    };
  }

  const executed = await executeSelfHostingVerification(targetRoot, run, selfHostingCommands);
  return {
    verification: executed.verification,
    snapshot: executed.snapshot,
    reuseDecision: {
      status: executed.verification.status === "pass" ? "RUN" : "FAILED",
      reason:
        reuse.decision.status === "STALE" || reuse.decision.status === "FAILED"
          ? `Executed self-hosting verification because prior evidence was ${reuse.decision.status.toLowerCase()}.`
          : "Executed self-hosting verification for this input set.",
      current_fingerprint: executed.snapshot.fingerprint.fingerprint_id,
      invalidated_by: reuse.decision.invalidated_by,
      ...(reuse.decision.snapshot_id ? { snapshot_id: reuse.decision.snapshot_id } : {}),
      ...(reuse.decision.matched_event_id ? { matched_event_id: reuse.decision.matched_event_id } : {})
    },
    commandEvidence: executed.snapshot.command_results
  };
}

export async function verifyRuntimeRun(cwd: string, options: RuntimeDryRunOptions = {}): Promise<RuntimeVerificationResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "verification");
  const resolved = await resolveVerification(targetRoot, current.run, dryRun);
  const verification = resolved.verification;
  const run = recordVerificationResult(current.run, verification);
  const runPath = dryRun ? current.runPath : writeRuntimeRun(targetRoot, run, "verification");

  if (!dryRun) {
    await appendRuntimeEvidence(
      targetRoot,
      run,
      "verification_reuse_decision",
      buildVerificationReuseDecisionPayload(resolved.reuseDecision),
      "node bin/ch run verify",
      {
        reusable: false,
        stale: resolved.reuseDecision.status === "STALE",
        inputFingerprint: resolved.snapshot.fingerprint.fingerprint_id
      }
    );

    if (resolved.reuseDecision.status !== "REUSED") {
      await appendRuntimeEvidence(
        targetRoot,
        run,
        "verified_snapshot",
        buildVerificationSnapshotPayload(resolved.snapshot),
        "node bin/ch run verify",
        {
          artifactRefs: resolved.commandEvidence.flatMap((result) =>
            [result.stdout_artifact, result.stderr_artifact].filter((artifact) => artifact !== undefined)
          ),
          reusable: true,
          stale: resolved.reuseDecision.status === "FAILED",
          inputFingerprint: resolved.snapshot.fingerprint.fingerprint_id
        }
      );
    }

    await appendRuntimeEvidence(
      targetRoot,
      run,
      "verification_result",
      {
        summary: verification.summary,
        status: verification.status,
        source: verification.source,
        verification_result_id: verification.verification_result_id,
        local_verification: resolved.reuseDecision.status
      },
      "node bin/ch run verify",
      {
        artifactRefs: resolved.commandEvidence.flatMap((result) =>
          [result.stdout_artifact, result.stderr_artifact].filter((artifact) => artifact !== undefined)
        ),
        reusable: false,
        stale: resolved.reuseDecision.status === "FAILED",
        inputFingerprint: resolved.snapshot.fingerprint.fingerprint_id
      }
    );
  }

  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);
  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    verification,
    state: dryRun && current.state === "preview" ? "preview" : "updated"
  };
}

export async function recordRuntimeRemoteStatus(
  cwd: string,
  options: RecordRemoteStatusOptions = {}
): Promise<RuntimeRemoteStatusResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "remote status recording");
  const run = recordRemoteCheckResult(current.run, options);
  const remoteCheck = run.remote_checks[run.remote_checks.length - 1];

  if (!remoteCheck) {
    throw new Error("Remote check result was not recorded.");
  }

  const runPath = dryRun ? current.runPath : writeRuntimeRun(targetRoot, run, "remote status recording");

  if (!dryRun) {
    await appendRuntimeEvidence(
      targetRoot,
      run,
      "remote_ci",
      {
        summary: `Recorded remote gate ${remoteCheck.gate_id} as ${remoteCheck.status}.`,
        gate_id: remoteCheck.gate_id,
        name: remoteCheck.name,
        status: remoteCheck.status,
        required: remoteCheck.required,
        provider: remoteCheck.ci_run.provider,
        run_id: remoteCheck.ci_run.run_id,
        url: remoteCheck.ci_run.url
      },
      "node bin/ch run remote-status"
    );
  }

  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);
  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    remoteCheck,
    state: dryRun && current.state === "preview" ? "preview" : "updated"
  };
}

export async function markRuntimeRunDiscardable(
  cwd: string,
  options: MarkDiscardableOptions
): Promise<RuntimeServiceResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  const run: Run = {
    ...current.run,
    lifecycle_status: "discarded",
    discard_reason: options.reason,
    updated_at: nowIso()
  };

  const runPath = dryRun ? current.runPath : writeRuntimeRun(targetRoot, run);

  if (!dryRun) {
    await appendRuntimeEvidence(
      targetRoot,
      run,
      "decision",
      {
        summary: `Marked run ${run.run_id} discardable.`,
        run_id: run.run_id,
        lifecycle_status: run.lifecycle_status,
        discard_reason: options.reason
      },
      "node bin/ch run mark-discardable"
    );
  }

  const paths = resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id);
  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: paths.projectDbPath,
    stagingDbPath: paths.stagingDbPath,
    state: dryRun && current.state === "preview" ? "preview" : "updated"
  };
}

function ensureRunHasVerificationAndReview(run: Run, targetRoot: string): Run {
  let next = run;

  if (next.verification_results.length === 0) {
    next = recordVerificationResult(next, readInstalledVerifier(next, targetRoot));
  }

  if (next.review_results.length === 0) {
    next = recordReviewResult(next, readInstalledReview(next, targetRoot));
  }

  return next;
}

function refreshRunRepositorySnapshot(run: Run): Run {
  return {
    ...run,
    repository: buildRepositoryRef(run.repository.root_path)
  };
}

export async function closeoutRuntimeRun(cwd: string, options: RuntimeDryRunOptions = {}): Promise<RuntimeCloseoutResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  assertNoActiveReviewLaunchClaim(current.run, "closeout");
  const refreshedRun = refreshRunRepositorySnapshot(current.run);
  const preparedRun = ensureRunHasVerificationAndReview(refreshedRun, targetRoot);
  const receipt = createCloseoutReceipt(preparedRun);
  const run: Run = {
    ...preparedRun,
    lifecycle_status: receipt.status === "READY" ? "closed" : "blocked",
    updated_at: receipt.created_at,
    closeout_receipts: [...preparedRun.closeout_receipts, receipt]
  };

  if (dryRun) {
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      run,
      runPath: current.runPath,
      projectDbPath: resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id).projectDbPath,
      stagingDbPath: resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id).stagingDbPath,
      receipt,
      state: current.state === "preview" ? "preview" : "updated"
    };
  }

  const runPath = writeRuntimeRun(targetRoot, run, "closeout");
  const closeoutPath = closeoutFilePath(targetRoot, run.run_id);
  writeJsonFile(closeoutPath, receipt);
  await appendRuntimeEvidence(
    targetRoot,
    run,
    "closeout_receipt",
    {
      summary: `Closeout receipt is ${receipt.status}.`,
      receipt_id: receipt.receipt_id,
      status: receipt.status,
      blockers: receipt.blockers,
      closeout_path: toRepoRelative(targetRoot, closeoutPath)
    },
    "node bin/ch run closeout"
  );

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id).projectDbPath,
    stagingDbPath: resolveMemoryDbPaths(targetRoot, roots.projectRoot, run.run_id).stagingDbPath,
    closeoutPath,
    receipt,
    state: "updated"
  };
}
