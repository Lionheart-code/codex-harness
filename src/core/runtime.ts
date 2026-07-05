import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
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
import { detectGitRepository, getGitStatusLines, getGitStatusPaths, runGitCommand, worktreePathExistsInGit } from "./git";
import { harvestRun } from "./harvest";
import { detectInstalledLayer } from "./install";
import {
  type DeliveryFactRecord,
  type LifecycleStatus,
  type PayloadRecord,
  type RunMode
} from "./lifecycle-types";
import { evaluateMergeFacts } from "./merge-facts";
import { ProjectMemoryDatabase } from "./project-memory-db";
import {
  HARNESS_DIR,
  TASK_REVIEW_FILE,
  TASK_VERIFIER_FILE,
  TASKS_DIR
} from "./paths";
import { type ReviewRecord as HarnessReviewRecord, loadTaskReviewRecord } from "./review";
import {
  RunStagingDatabase,
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
import { listTasks } from "./tasks";

export const RUNTIME_CONTRACT_NAMES = [
  "Run",
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
  discard_reason?: string;
  manual_override_reason?: string;
  harvested_at?: string;
  source_snapshot?: string;
  source_staging_db_path?: string;
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
  runPath?: string;
  projectDbPath?: string;
  stagingDbPath?: string;
  state: "created" | "loaded" | "preview" | "updated";
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

export interface RuntimeNextTaskDecisionResult extends RuntimeServiceResult {
  decision: Decision;
  evidence: EvidenceRef;
  artifact: ArtifactRef;
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
  newRun?: Run;
  newRunPath?: string;
  state: "preview" | "updated";
}

export type ReviewLaunchStatus =
  | "success"
  | "dry_run"
  | "denied"
  | "failed"
  | "timeout"
  | "blocked"
  | "invalid_artifact";

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
  request_path?: string;
  request_artifact_hash?: string;
  expected_output_path?: string;
  output_path: string;
  launch_command?: string;
  working_directory?: string;
  pid?: number;
  start_time?: string;
  last_output_time?: string;
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
}

export interface ApprovePlanOptions extends RuntimeDryRunOptions {
  planPath: string;
  approver: string;
  reason?: string;
}

export interface RecordNextTaskOptions extends RuntimeDryRunOptions {
  taskPath: string;
  baseCommit: string;
  baseRef?: string;
  filePath: string;
}

export interface MaterializeNextTaskOptions extends RuntimeDryRunOptions {
  decisionId: string;
  taskPath: string;
  branch: string;
  worktreePath: string;
  create?: boolean;
  enterExisting?: boolean;
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
  latestVerification?: VerificationResult;
  latestCloseoutReceipt?: CloseoutReceipt;
  blockingFindings?: boolean;
  planApproved?: boolean;
  implementationEvidence?: boolean;
}

type OperatorStageDraft = Omit<RuntimeOperatorStatus, "review_tier" | "next_procedure_id"> & {
  next_procedure_id: string;
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

function buildRepositoryRef(targetRoot: string): RepositoryRef {
  const roots = resolveHarnessRoots(targetRoot);
  const changeSet = buildChangeSet(targetRoot);
  const branch = readGitValue(targetRoot, ["branch", "--show-current"]);
  const headSha = readGitValue(targetRoot, ["rev-parse", "--verify", "HEAD"]);
  const taskList = detectInstalledLayer(roots.projectRoot) ? listTasks(roots.projectRoot) : undefined;
  const taskWorktree = taskList && taskList.tasks.length === 1 ? taskList.tasks[0].worktree : undefined;

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
  const startIndex = lines.findIndex((line) => {
    const match = /^##\s+(.+?)\s*$/u.exec(line.trim());
    return match?.[1]?.trim().toLowerCase() === normalizedHeading;
  });

  if (startIndex === -1) {
    return undefined;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines[index].trim())) {
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
  const headingMatch = /^#\s*Phase\s+([0-9]+(?:\.[0-9]+)*(?:[A-Z][0-9]*)?)/im.exec(markdown);
  return headingMatch?.[1];
}

function inferPhaseIdFromPath(taskPath: string): string | undefined {
  const basename = path.basename(taskPath);
  const match = /^PHASE_([0-9]+(?:_[0-9]+)*(?:[A-Z][0-9]*)?)/.exec(basename);

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

  if (!fs.existsSync(absoluteTaskPath) || !fs.statSync(absoluteTaskPath).isFile()) {
    throw new Error(`Task file not found: ${taskPath}`);
  }

  const relativeTaskPath = toRepoRelative(targetRoot, absoluteTaskPath);
  const taskMarkdown = fs.readFileSync(absoluteTaskPath, "utf8");
  const referencedTaskPath = extractActiveTaskPath(taskMarkdown);
  const resolvedActiveTaskPath = referencedTaskPath
    ? path.resolve(targetRoot, referencedTaskPath)
    : absoluteTaskPath;

  ensureInsideTargetRoot(targetRoot, resolvedActiveTaskPath);

  const activeTaskPath = fs.existsSync(resolvedActiveTaskPath) && fs.statSync(resolvedActiveTaskPath).isFile()
    ? toRepoRelative(targetRoot, resolvedActiveTaskPath)
    : referencedTaskPath;
  const activeTaskMarkdown =
    fs.existsSync(resolvedActiveTaskPath) && fs.statSync(resolvedActiveTaskPath).isFile()
      ? fs.readFileSync(resolvedActiveTaskPath, "utf8")
      : taskMarkdown;
  const phaseId = inferPhaseIdFromText(activeTaskMarkdown) ?? inferPhaseIdFromPath(activeTaskPath ?? relativeTaskPath);

  return {
    taskPath: relativeTaskPath,
    ...(activeTaskPath ? { activeTaskPath } : {}),
    ...(phaseId ? { phaseId } : {})
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
    closeout_receipts: []
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

  const deliveryFacts = record.delivery_facts === undefined
    ? []
    : Array.isArray(record.delivery_facts)
      ? (record.delivery_facts as DeliveryFactRecord[])
      : (() => {
          throw new Error("runtime run is missing required array field: delivery_facts.");
        })();

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
    ...(typeof record.discard_reason === "string" ? { discard_reason: record.discard_reason } : {}),
    ...(typeof record.manual_override_reason === "string" ? { manual_override_reason: record.manual_override_reason } : {}),
    ...(typeof record.harvested_at === "string" ? { harvested_at: record.harvested_at } : {}),
    ...(typeof record.source_snapshot === "string" ? { source_snapshot: record.source_snapshot } : {}),
    ...(typeof record.source_staging_db_path === "string" ? { source_staging_db_path: record.source_staging_db_path } : {})
  };
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
    ...(input.reason ? { reason: input.reason } : {})
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

function findCloseoutBlockers(
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

  return blockers;
}

export function createCloseoutReceipt(run: Run): CloseoutReceipt {
  const timestamp = nowIso();
  const verification = latestVerification(run, timestamp);
  const review = latestReview(run, timestamp);
  const blockers = findCloseoutBlockers(verification, review, run.findings, run.required_gates, run.delivery_facts);

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

const PHASE_23_8_6A_ALLOWED_PROCEDURE_INGESTION = new Set([
  "task-intake",
  "task-prompt-writer",
  "draft-plan",
  "plan-review",
  "plan-amend",
  "architecture-review",
  "db-storage-review",
  "implementation-review",
  "fix-pass-review",
  "verification-review",
  "delivery-facts-review",
  "phase-closeout-review"
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

function writeRuntimeRun(targetRoot: string, run: Run): string {
  const roots = resolveHarnessRoots(targetRoot);
  const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, run.run_id);
  staging.ensureInitialized();
  const existing = staging.loadRun(run.run_id);
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
  writeCompatibilityRunArtifacts(targetRoot, nextRun);
  return runFilePath(targetRoot, nextRun.run_id);
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

function buildSelfHostingVerificationCommands(targetRoot: string, run: Run): RuntimeVerificationCommand[] | undefined {
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

  if (dryRun) {
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      run,
      projectDbPath: seededPaths.projectDbPath,
      stagingDbPath: seededPaths.stagingDbPath,
      state: "preview"
    };
  }

  const projectDb = new ProjectMemoryDatabase(targetRoot, roots.projectRoot);
  projectDb.ensureInitialized();
  const runPath = writeRuntimeRun(targetRoot, run);
  await appendRuntimeEvidence(
    targetRoot,
    run,
    "run",
    {
      summary: `Started runtime run ${run.run_id}.`,
      run_id: run.run_id,
      task_path: run.task_path,
      active_task_path: run.active_task_path,
      phase_id: run.phase_id,
      run_mode: run.run_mode,
      lifecycle_status: run.lifecycle_status
    },
    "node bin/ch run start"
  );

  return {
    targetRoot,
    projectRoot: roots.projectRoot,
    dryRun,
    run,
    runPath,
    projectDbPath: seededPaths.projectDbPath,
    stagingDbPath: seededPaths.stagingDbPath,
    state: "created"
  };
}

function requireReviewLaunchProfile(
  proceduresById: Map<string, SelfHostingProcedureDescriptor>,
  procedureId: string
): SelfHostingReviewLaunchProfile {
  if (procedureId !== "plan-review" && procedureId !== "implementation-review") {
    throw new Error("--procedure must be one of: plan-review, implementation-review.");
  }

  const descriptor = proceduresById.get(procedureId);
  if (!descriptor) {
    throw new Error(`Unknown self-hosting procedure id: ${procedureId}`);
  }

  if (!descriptor.review_launch_profile) {
    throw new Error(`Procedure ${procedureId} has no review_launch_profile.`);
  }

  return descriptor.review_launch_profile;
}

function validateLaunchSeconds(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return resolved;
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

function runCodexCliReview(profile: SelfHostingReviewLaunchProfile, input: {
  targetRoot: string;
  requestMarkdown: string;
  outputPath: string;
  timeoutSeconds: number;
  staleAfterSeconds: number;
}): Promise<{
  exitCode?: number;
  signal?: string;
  pid?: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  stale: boolean;
  startTime: string;
  lastOutputTime?: string;
  completedTime?: string;
  launchCommand: string;
}> {
  return new Promise((resolve) => {
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
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let stale = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutSeconds * 1000);
    const staleTimer = setInterval(() => {
      if (Date.now() - lastOutputAt >= input.staleAfterSeconds * 1000) {
        stale = true;
        child.kill("SIGTERM");
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
        stale,
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
        stale,
        startTime,
        lastOutputTime,
        completedTime: nowIso(),
        launchCommand
      });
    });

    child.stdin?.end(input.requestMarkdown);
  });
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
  accepted?: {
    artifact: ArtifactRef;
    evidence: EvidenceRef;
    markdown: string;
    absoluteArtifactPath: string;
  }
): Run {
  const timestamp = nowIso();
  const staging = new RunStagingDatabase(targetRoot, rootsProjectRoot, currentRun.run_id);
  if (!staging.loadRun(currentRun.run_id)) {
    staging.saveRun(currentRun);
  }
  const parentRecordId = `review-launch-attempt:${observation.attempt_id ?? randomUUID()}`;
  const payloadRefs: ReviewLaunchPayloadRef[] = [];

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

  const observationWithPayloadRefs: ReviewLaunchObservation = payloadRefs.length > 0
    ? { ...observation, payload_refs: payloadRefs }
    : observation;
  const attempt = buildReviewLaunchAttemptArtifact(targetRoot, currentRun, observationWithPayloadRefs);
  fs.mkdirSync(path.dirname(attempt.absolutePath), { recursive: true });
  fs.writeFileSync(attempt.absolutePath, attempt.content, "utf8");

  if (accepted) {
    fs.mkdirSync(path.dirname(accepted.absoluteArtifactPath), { recursive: true });
    fs.writeFileSync(accepted.absoluteArtifactPath, accepted.markdown, "utf8");
  }

  const run = staging.mutateRun(currentRun.run_id, (latestRun) => {
    let next = appendArtifactAndEvidence(latestRun, attempt.artifact, attempt.evidence, timestamp);

    if (accepted) {
      next = appendArtifactAndEvidence(next, accepted.artifact, accepted.evidence, timestamp);
      const review = buildProcedureReviewResult(next, accepted.evidence.summary, accepted.artifact, accepted.markdown, timestamp);
      if (review && !next.review_results.some((entry) =>
        entry.source === review.source
        && entry.artifact_refs.some((ref) => ref.artifact_id === accepted.artifact.artifact_id)
      )) {
        next = recordReviewResult(next, review);
      }
    }

    return next;
  }, {
    expectedRunInstanceId: currentRun.run_instance_id,
    expectedRunRevision: currentRun.run_revision
  });

  writeCompatibilityRunArtifacts(targetRoot, run);
  return run;
}

export async function launchRuntimeReview(cwd: string, options: LaunchReviewOptions): Promise<RuntimeReviewLaunchResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  const registry = readSelfHostingProcedureRegistry(targetRoot);

  if (!registry) {
    throw new Error("Self-hosting procedure registry not found.");
  }

  const proceduresById = indexSelfHostingProceduresById(registry);
  const profile = requireReviewLaunchProfile(proceduresById, options.procedureId);
  const timeoutSeconds = validateLaunchSeconds(options.timeoutSeconds, profile.timeout_seconds, "--timeout-seconds");
  const staleAfterSeconds = validateLaunchSeconds(options.staleAfterSeconds, profile.stale_after_seconds, "--stale-after-seconds");
  const requestPath = resolveLaunchRequestPath(targetRoot, options.requestPath);
  const outputPath = resolveLaunchOutputPath(targetRoot, current.run, options.outputPath);
  const requestMarkdown = fs.readFileSync(requestPath, "utf8");
  const requestHash = sha256Hex(requestMarkdown);

  if (path.resolve(requestPath) === path.resolve(outputPath)) {
    throw new Error("Review request and output paths must be different.");
  }

  const baseObservation = {
    procedure_id: options.procedureId,
    run_id: current.run.run_id,
    run_instance_id: current.run.run_instance_id,
    ...(current.run.run_instance_id ? { project_run_id: current.run.run_instance_id } : {}),
    adapter_id: profile.adapter_id,
    model: profile.model,
    reasoning_effort: profile.reasoning_effort,
    sandbox_mode: profile.sandbox_mode,
    output_mode: profile.output_mode,
    timeout_seconds: timeoutSeconds,
    stale_after_seconds: staleAfterSeconds,
    request_path: toRepoRelative(targetRoot, requestPath),
    request_artifact_hash: `sha256:${requestHash}`,
    expected_output_path: toRepoRelative(targetRoot, outputPath),
    output_path: toRepoRelative(targetRoot, outputPath)
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
  const startedAtMs = Date.now();
  const child = await runCodexCliReview(profile, {
    targetRoot,
    requestMarkdown,
    outputPath,
    timeoutSeconds,
    staleAfterSeconds
  });

  let observation: ReviewLaunchObservation;
  let accepted: Parameters<typeof recordLaunchAttempt>[4] | undefined;

  if (child.timedOut) {
    observation = {
      ...baseObservation,
      status: "timeout",
      attempt_id: randomUUID(),
      exit_code: child.exitCode,
      terminal_exit_code: child.exitCode,
      terminal_signal: child.signal,
      pid: child.pid,
      launch_command: child.launchCommand,
      working_directory: targetRoot,
      start_time: child.startTime,
      last_output_time: child.lastOutputTime,
      artifact_present: fs.existsSync(outputPath),
      artifact_valid: false,
      failure_classification: "REVIEW_PROCESS_TIMEOUT",
      blocked_reason: "review process timed out",
      summary: `${options.procedureId} launch timed out.`,
      next_valid_action: "rerun launch-review after resolving the review process timeout",
      stdout_tail: boundedTail(child.stdout),
      stderr_tail: boundedTail(child.stderr)
    };
  } else if (child.stale) {
    observation = {
      ...baseObservation,
      status: "timeout",
      attempt_id: randomUUID(),
      exit_code: child.exitCode,
      terminal_exit_code: child.exitCode,
      terminal_signal: child.signal,
      pid: child.pid,
      launch_command: child.launchCommand,
      working_directory: targetRoot,
      start_time: child.startTime,
      last_output_time: child.lastOutputTime,
      artifact_present: fs.existsSync(outputPath),
      artifact_valid: false,
      failure_classification: "REVIEW_PROCESS_STALE_NO_OUTPUT",
      blocked_reason: "review process produced no output within stale-after window",
      summary: `${options.procedureId} launch became stale without output.`,
      next_valid_action: "rerun launch-review after resolving the stale review process",
      stdout_tail: boundedTail(child.stdout),
      stderr_tail: boundedTail(child.stderr)
    };
  } else if (child.exitCode !== 0) {
    observation = {
      ...baseObservation,
      status: "failed",
      attempt_id: randomUUID(),
      exit_code: child.exitCode,
      terminal_exit_code: child.exitCode,
      terminal_signal: child.signal,
      pid: child.pid,
      launch_command: child.launchCommand,
      working_directory: targetRoot,
      start_time: child.startTime,
      last_output_time: child.lastOutputTime,
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
    const artifact = staleOutput
      ? { invalidReason: "Review output file is stale." }
      : readValidLaunchArtifact(options.procedureId, outputPath, child.stdout);

    if (!artifact.markdown || !artifact.provenance) {
      const artifactPresent = !!outputAfter;
      observation = {
        ...baseObservation,
        status: "invalid_artifact",
        attempt_id: randomUUID(),
        exit_code: child.exitCode,
        terminal_exit_code: child.exitCode,
        terminal_signal: child.signal,
        pid: child.pid,
        launch_command: child.launchCommand,
        working_directory: targetRoot,
        start_time: child.startTime,
        last_output_time: child.lastOutputTime,
        artifact_present: artifactPresent,
        artifact_valid: false,
        artifact_hash: outputAfter ? `sha256:${outputAfter.hash}` : undefined,
        failure_classification: staleOutput
          ? "REVIEW_PROCESS_STALE_NO_OUTPUT"
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
      const acceptedArtifact = buildProcedureArtifactFromMarkdown(targetRoot, current.run, options.procedureId, outputPath, artifact.markdown);
      observation = {
        ...baseObservation,
        status: "success",
        attempt_id: randomUUID(),
        exit_code: child.exitCode,
        terminal_exit_code: child.exitCode,
        terminal_signal: child.signal,
        pid: child.pid,
        launch_command: child.launchCommand,
        working_directory: targetRoot,
        start_time: child.startTime,
        last_output_time: child.lastOutputTime,
        artifact_path: acceptedArtifact.artifact.path,
        artifact_id: acceptedArtifact.artifact.artifact_id,
        artifact_present: true,
        artifact_valid: true,
        artifact_hash: acceptedArtifact.artifact.artifact_id,
        provenance: artifact.provenance,
        provenance_source: artifact.provenance,
        failure_classification: "REVIEW_COMPLETED_ARTIFACT_PRESENT",
        summary: `${options.procedureId} review launch produced a valid artifact.`,
        next_valid_action: "re-check operator status",
        stdout_tail: boundedTail(child.stdout),
        stderr_tail: boundedTail(child.stderr)
      };
      accepted = {
        artifact: acceptedArtifact.artifact,
        evidence: acceptedArtifact.evidence,
        markdown: artifact.markdown,
        absoluteArtifactPath: acceptedArtifact.absolutePath
      };
    }
  }

  const run = recordLaunchAttempt(targetRoot, roots.projectRoot, current.run, observation, accepted);
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

export async function recordRuntimeProcedure(cwd: string, options: RecordProcedureOptions): Promise<RuntimeProcedureResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  const registry = readSelfHostingProcedureRegistry(targetRoot);

  if (!registry) {
    throw new Error("Self-hosting procedure registry not found.");
  }

  const proceduresById = indexSelfHostingProceduresById(registry);
  if (!proceduresById.has(options.procedureId)) {
    throw new Error(`Unknown self-hosting procedure id: ${options.procedureId}`);
  }
  if (!PHASE_23_8_6A_ALLOWED_PROCEDURE_INGESTION.has(options.procedureId)) {
    throw new Error(
      `Procedure ${options.procedureId} is outside the Phase 23.8.6A replay and re-ingestion scope.`
    );
  }

  const absoluteSourcePath = path.resolve(targetRoot, options.filePath);
  ensureInsideTargetRoot(targetRoot, absoluteSourcePath);

  if (!fs.existsSync(absoluteSourcePath) || !fs.statSync(absoluteSourcePath).isFile()) {
    throw new Error(`Procedure artifact not found: ${options.filePath}`);
  }

  const markdown = fs.readFileSync(absoluteSourcePath, "utf8");
  if (markdown.trim().length === 0) {
    throw new Error(`Procedure artifact is empty: ${options.filePath}`);
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

  if (!dryRun && !alreadyRecorded) {
    fs.mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
    fs.writeFileSync(absoluteArtifactPath, markdown, "utf8");
  }

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
    run = staging.mutateRun(current.run.run_id, (latestRun) => {
      const review = buildProcedureReviewResult(latestRun, options.procedureId, artifact, markdown, timestamp);
      const duplicateEvidence = latestRun.evidence.some((entry) =>
        entry.evidence_id === evidence.evidence_id
        || (entry.kind === evidence.kind && entry.artifact_id === evidence.artifact_id)
      );

      recorded = !duplicateEvidence;
      if (duplicateEvidence) {
        if (review && !duplicateReviewFor(latestRun, review)) {
          return recordReviewResult(latestRun, review);
        }
        return latestRun;
      }

      let next = withUpdatedAt({
        ...latestRun,
        artifacts: [...latestRun.artifacts, artifact],
        evidence: [...latestRun.evidence, evidence]
      }, timestamp);

      if (review && !duplicateReviewFor(next, review)) {
        next = recordReviewResult(next, review);
      }

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
    procedureId: options.procedureId,
    evidence,
    artifact,
    recorded
  };
}

export async function approveRuntimePlan(cwd: string, options: ApprovePlanOptions): Promise<RuntimePlanApprovalResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
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

  const effectivePlanArtifactId = resolveEffectivePlanApprovalArtifactId(targetRoot, current.run.run_id, current.run, artifact.artifact_id);

  let run = current.run;
  const hasArtifact = run.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id);
  const hasEvidence = run.evidence.some((entry) => entry.evidence_id === evidence.evidence_id);
  const planApprovalReason = [
    options.reason?.trim(),
    `effective_plan_artifact_id=${effectivePlanArtifactId}`,
    `approved_plan_path=${relativeSourcePath}`,
    `approved_plan_artifact_id=${artifact.artifact_id}`
  ].filter(Boolean).join("; ");
  const duplicateApproval = run.approvals.find((entry) =>
    entry.status === "approved"
    && entry.approver === options.approver
    && entry.title === "Reviewed plan approved"
    && entry.reason === planApprovalReason
  );

  const approval = duplicateApproval ?? {
    approval_id: `approval-reviewed-plan-${hashPrefix}-${current.run.approvals.length + 1}`,
    title: "Reviewed plan approved",
    status: "approved" as const,
    approver: options.approver,
    created_at: timestamp,
    reason: planApprovalReason
  };
  let finalApproval = approval;

  let recorded = !duplicateApproval;
  const absoluteArtifactPath = path.join(runDirectory(targetRoot, current.run.run_id), relativeArtifactPath);

  if (!dryRun && (!hasArtifact || !hasEvidence || !duplicateApproval)) {
    fs.mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
    fs.writeFileSync(absoluteArtifactPath, markdown, "utf8");
  }

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
        createdAt: approval.created_at
      });
    }
  } else {
    const staging = new RunStagingDatabase(targetRoot, roots.projectRoot, current.run.run_id);
    if (!staging.loadRun(current.run.run_id)) {
      staging.saveRun(current.run);
    }
    run = staging.mutateRun(current.run.run_id, (latestRun) => {
      const latestEffectiveArtifactId = resolveEffectivePlanApprovalArtifactId(
        targetRoot,
        latestRun.run_id,
        latestRun,
        artifact.artifact_id
      );
      if (latestEffectiveArtifactId !== artifact.artifact_id) {
        throw new Error(
          `Approved plan does not match the latest effective plan evidence. Expected ${latestEffectiveArtifactId}, got ${artifact.artifact_id}.`
        );
      }

      const latestHasArtifact = latestRun.artifacts.some((entry) => entry.artifact_id === artifact.artifact_id);
      const latestHasEvidence = latestRun.evidence.some((entry) => entry.evidence_id === evidence.evidence_id);
      const latestDuplicateApproval = latestRun.approvals.find((entry) =>
        entry.status === "approved"
        && entry.approver === options.approver
        && entry.title === "Reviewed plan approved"
        && entry.reason === planApprovalReason
      );
      recorded = !latestDuplicateApproval;
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
          createdAt: latestApproval.created_at
        });
      }
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
    approval: finalApproval,
    evidence,
    artifact,
    recorded
  };
}

export async function recordRuntimeNextTask(cwd: string, options: RecordNextTaskOptions): Promise<RuntimeNextTaskDecisionResult> {
  const roots = resolveHarnessRoots(cwd);
  const targetRoot = roots.targetRoot;
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun, options.runId);
  if (
    current.run.lifecycle_status !== "closed"
    && current.run.lifecycle_status !== "harvested"
    && current.run.lifecycle_status !== "discarded"
  ) {
    throw new Error(
      `Next-task decisions require closeout or harvest context. Run ${current.run.run_id} is still ${current.run.lifecycle_status}.`
    );
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
    run = staging.mutateRun(current.run.run_id, (latestRun) => {
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
  const { record } = readNextTaskDecision(current.run, options.decisionId);
  const resolvedTask = resolveTaskReference(targetRoot, options.taskPath);
  const nextTaskPath = resolvedTask.activeTaskPath ?? resolvedTask.taskPath;
  const createMode = options.create === true;
  const enterExistingMode = options.enterExisting === true;

  if (createMode === enterExistingMode) {
    throw new Error("Choose exactly one materialization mode: --create or --enter-existing.");
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
  if (dryRun) {
    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      decisionId: record.next_task_decision_id,
      branch: options.branch,
      worktreePath: absoluteWorktreePath,
      taskPath: nextTaskPath,
      created: createMode,
      state: "preview"
    };
  }

  let created = false;
  let backupPath: string | undefined;
  let branchCreated = false;
  const taskPointerPath = path.join(absoluteWorktreePath, "TASK.md");

  try {
    if (createMode) {
      if (fs.existsSync(absoluteWorktreePath)) {
        throw new Error(`Materialization worktree path already exists: ${absoluteWorktreePath}`);
      }
      if (gitBranchExists(targetRoot, options.branch)) {
        throw new Error(`Materialization branch already exists: ${options.branch}`);
      }
      fs.mkdirSync(path.dirname(absoluteWorktreePath), { recursive: true });
      const addResult = runGitCommand(targetRoot, ["worktree", "add", "-b", options.branch, absoluteWorktreePath, record.base_commit_sha]);
      if (addResult.error) {
        throw addResult.error;
      }
      if (addResult.status !== 0) {
        throw new Error(addResult.stderr.trim() || "git worktree add failed");
      }
      created = true;
      branchCreated = true;
    } else {
      if (!fs.existsSync(absoluteWorktreePath)) {
        throw new Error(`Existing worktree path does not exist: ${absoluteWorktreePath}`);
      }
      if (!worktreePathExistsInGit(targetRoot, absoluteWorktreePath)) {
        throw new Error(`Existing worktree is not registered with git: ${absoluteWorktreePath}`);
      }
    }

    if (gitCurrentBranch(absoluteWorktreePath) !== options.branch) {
      throw new Error(`Materialized worktree branch mismatch. Expected ${options.branch}.`);
    }

    if (resolveExactCommit(absoluteWorktreePath, "HEAD") !== record.base_commit_sha) {
      throw new Error(`Materialized worktree HEAD does not match the recorded base commit ${record.base_commit_sha}.`);
    }

    if (getGitStatusLines(absoluteWorktreePath).length > 0) {
      throw new Error(`Materialized worktree is dirty: ${absoluteWorktreePath}`);
    }

    const absoluteTaskContractPath = path.join(absoluteWorktreePath, nextTaskPath);
    if (!fs.existsSync(absoluteTaskContractPath) || !fs.statSync(absoluteTaskContractPath).isFile()) {
      throw new Error(`Next task contract is missing in the materialized worktree: ${nextTaskPath}`);
    }

    if (fs.existsSync(taskPointerPath)) {
      backupPath = `${taskPointerPath}.codex-harness.bak`;
      fs.copyFileSync(taskPointerPath, backupPath);
    }
    fs.writeFileSync(taskPointerPath, buildNextTaskPointerMarkdown(nextTaskPath), "utf8");

    const runStartResult = await startRuntimeRun(absoluteWorktreePath, { taskPath: "TASK.md" });

    if (backupPath && fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { force: true });
    }

    return {
      targetRoot,
      projectRoot: roots.projectRoot,
      dryRun,
      decisionId: record.next_task_decision_id,
      branch: options.branch,
      worktreePath: absoluteWorktreePath,
      taskPath: nextTaskPath,
      created,
      newRun: runStartResult.run,
      newRunPath: runStartResult.runPath,
      state: "updated"
    };
  } catch (error) {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, taskPointerPath);
      fs.rmSync(backupPath, { force: true });
    }

    if (created) {
      const removeResult = runGitCommand(targetRoot, ["worktree", "remove", "--force", absoluteWorktreePath]);
      if (removeResult.error) {
        throw removeResult.error;
      }
      if (removeResult.status !== 0) {
        throw new Error(removeResult.stderr.trim() || "git worktree remove failed during rollback");
      }

      if (branchCreated) {
        const deleteBranchResult = runGitCommand(targetRoot, ["branch", "-D", options.branch]);
        if (deleteBranchResult.error) {
          throw deleteBranchResult.error;
        }
        if (deleteBranchResult.status !== 0) {
          throw new Error(deleteBranchResult.stderr.trim() || "git branch delete failed during rollback");
        }
      }
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

  const headingPattern = /^##\s+Phase\s+([0-9]+(?:\.[0-9]+)*(?:[A-Z][0-9]*)?)\b.*$/gm;
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

function loadOperatorRunContext(targetRoot: string, projectRoot: string, runId?: string): OperatorRunContext | undefined {
  const resolvedRun = runId
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
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
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
  if (!source) {
    return false;
  }

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExpPattern(procedureId)}([^a-z0-9]|$)`, "i");
  return pattern.test(source);
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
  procedureId: "plan-review" | "implementation-review",
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

  if (!evidence?.path) {
    return undefined;
  }

  const absolutePath = resolveRunLocalPath(runContext, evidence.path);
  const markdown = readUtf8FileIfExists(absolutePath);
  return markdown ? parsePlanReviewDecisionRecord(markdown) : undefined;
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

function readLatestProcedureEvidenceById(run: Run, procedureId: string): EvidenceRef | undefined {
  for (let index = run.evidence.length - 1; index >= 0; index -= 1) {
    const evidence = run.evidence[index];
    if (evidence.kind === `procedure:${procedureId}` || evidence.summary === procedureId) {
      return evidence;
    }
  }

  return undefined;
}

function resolveEffectivePlanApprovalArtifactId(
  targetRoot: string,
  runId: string,
  run: Run,
  candidateArtifactId: string
): string {
  const latestEffectivePlanEvidence = readLatestEffectivePlanEvidence(run);
  if (latestEffectivePlanEvidence?.path) {
    const effectivePlanAbsolutePath = path.join(path.dirname(runFilePath(targetRoot, runId)), latestEffectivePlanEvidence.path);
    const effectivePlanMarkdown = fs.readFileSync(effectivePlanAbsolutePath, "utf8");
    const effectivePlanArtifactId = `sha256:${sha256Hex(effectivePlanMarkdown)}`;
    if (candidateArtifactId !== effectivePlanArtifactId) {
      throw new Error(
        `Approved plan does not match the latest effective plan evidence. Expected ${effectivePlanArtifactId}, got ${candidateArtifactId}.`
      );
    }
    return effectivePlanArtifactId;
  }

  const latestPlanReviewEvidence = readLatestProcedureEvidenceById(run, "plan-review");
  if (!latestPlanReviewEvidence?.path) {
    throw new Error("No reviewed plan evidence is recorded for this run. Record plan-review before approving a plan.");
  }

  const latestPlanReviewMarkdown = fs.readFileSync(
    path.join(path.dirname(runFilePath(targetRoot, runId)), latestPlanReviewEvidence.path),
    "utf8"
  );
  const validatedPlanReview = validatePlanReviewArtifact(latestPlanReviewMarkdown);
  if (interpretPlanReviewDecisionRecord(validatedPlanReview.decisionRecord).route !== "approval") {
    throw new Error("Plan approval without a recorded plan-amend is allowed only when the latest plan-review routes directly to approval.");
  }

  return candidateArtifactId;
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

  return approvals.some(({ approval }) => approval.reason?.includes(`effective_plan_artifact_id=${latestEffectivePlanArtifactId}`));
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

function hasImplementationEvidence(run: Run, procedureIds: Set<string>, options: {
  allowLiveChangeProbe?: boolean;
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

function resolvePreImplementationStage(context: OperatorEvaluationContext): OperatorStageDraft | undefined {
  if (!context.runContext || !context.taggedProcedures) {
    return undefined;
  }

  const taskMarkdown = context.taskContext.activeTaskMarkdown;
  const hasPlanReviewEvidence = context.taggedProcedures.has("plan-review");
  const hasPlanAmendEvidence = context.taggedProcedures.has("plan-amend");
  const durablePlanReviewOutcomeRecorded = hasDurableReviewOutcome(context.latestPlanReviewResult)
    && !!context.latestPlanReviewDecisionRecord;
  const planReviewDecision = context.latestPlanReviewDecisionRecord
    ? interpretPlanReviewDecisionRecord(context.latestPlanReviewDecisionRecord)
    : undefined;
  const freshPlanAmendForLatestPlanReview = planReviewDecision?.route === "amend"
    ? isProcedureEvidenceFreshAfter(context.runContext, "plan-amend", "plan-review")
    : false;

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

  if (!hasPlanReviewEvidence || !durablePlanReviewOutcomeRecorded) {
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
      missing_evidence: hasPlanReviewEvidence
        ? ["durable plan review decision record"]
        : ["plan-review"],
      stop_reason: hasPlanReviewEvidence
        ? "missing_plan_review_decision_record"
        : "missing_plan_review",
      next_allowed_action: hasPlanReviewEvidence
        ? "record or import the durable plan-review decision record before implementation can continue"
        : buildReviewStageAction("plan-review"),
      forbidden_actions: ["implementation", "source edits", "closeout"],
      notes: hasPlanReviewEvidence
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
    ?? resolveVerificationStage(context)
    ?? resolveCloseoutLifecycleStage(context);
}

function buildOperatorEvaluationContext(targetRoot: string, projectRoot: string, options: RuntimeDryRunOptions): {
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
  const runContext = loadOperatorRunContext(targetRoot, projectRoot, options.runId);
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
      latestVerification: runContext && runContext.run.verification_results.length > 0
        ? runContext.run.verification_results[runContext.run.verification_results.length - 1]
        : undefined,
      latestCloseoutReceipt,
      blockingFindings: runContext ? hasBlockingFindings(runContext.run) : undefined,
      planApproved,
      implementationEvidence: runContext
        ? hasImplementationEvidence(runContext.run, procedureIds, {
            allowLiveChangeProbe: planApproved === true && runContext.quarantinedPayloadCount === 0
          })
        : undefined
    }
  };
}

export function getRuntimeOperatorStatus(cwd: string, options: RuntimeDryRunOptions = {}): RuntimeOperatorStatusResult {
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
  const resolved = await resolveVerification(targetRoot, current.run, dryRun);
  const verification = resolved.verification;
  const run = recordVerificationResult(current.run, verification);
  const runPath = dryRun ? current.runPath : writeRuntimeRun(targetRoot, run);

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
  const run = recordRemoteCheckResult(current.run, options);
  const remoteCheck = run.remote_checks[run.remote_checks.length - 1];

  if (!remoteCheck) {
    throw new Error("Remote check result was not recorded.");
  }

  const runPath = dryRun ? current.runPath : writeRuntimeRun(targetRoot, run);

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

  const runPath = writeRuntimeRun(targetRoot, run);
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
