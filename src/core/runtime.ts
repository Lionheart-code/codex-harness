import * as fs from "node:fs";
import * as path from "node:path";
import { type VerifierRecord, validateVerifierRecord } from "./checks";
import { ArtifactStore as EvidenceArtifactStore } from "./artifact-store";
import { formatCommandForDisplay, runStructuredCommand } from "./command-runner";
import { MemoryEvidenceStore } from "./evidence-store";
import {
  DEFAULT_EVIDENCE_NAMESPACE,
  type ArtifactEvidenceRef,
  type EvidenceEventEnvelope,
  type EvidenceScope,
  type VerificationCommandResultEvidence,
  type VerificationCommandSpec,
  type VerificationReuseDecision,
  type VerifiedSnapshot,
  buildTargetProjectId
} from "./evidence-types";
import {
  buildVerificationReuseDecisionPayload,
  buildVerificationSnapshotPayload,
  captureVerifiedSnapshot,
  decideLocalVerificationReuse
} from "./verification-evidence";
import { detectGitRepository, getGitStatusLines, getGitStatusPaths, runGitCommand } from "./git";
import { detectInstalledLayer } from "./install";
import {
  HARNESS_DIR,
  TASK_REVIEW_FILE,
  TASK_VERIFIER_FILE,
  TASKS_DIR
} from "./paths";
import { type ReviewRecord as HarnessReviewRecord, loadTaskReviewRecord } from "./review";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata, validateOptionalSchemaMetadata } from "./schema-migrations";
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

export type RunStatus = "running" | "ready" | "blocked" | "closed";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
export type CommandResultStatus = "pass" | "fail" | "unknown";
export type VerificationResultStatus = "pass" | "fail" | "captured" | "missing" | "unknown";
export type ReviewResultStatus = "PASS" | "FIX_REQUIRED" | "MISSING" | "UNKNOWN";
export type FindingSeverity = "info" | "low" | "medium" | "high";
export type FindingStatus = "open" | "resolved";
export type ApprovalStatus = "approved" | "rejected" | "pending";
export type RemoteGateStatus = "pass" | "failed" | "skipped" | "missing" | "unknown";
export type CloseoutStatus = "READY" | "BLOCKED";

export interface RepositoryRef {
  root_path: string;
  branch?: string;
  head_sha?: string;
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
}

export interface Run {
  schema_version: typeof CURRENT_SCHEMA_VERSION;
  producer_command: string;
  run_id: string;
  task_path: string;
  active_task_path?: string;
  phase_id?: string;
  status: RunStatus;
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
  closeout_receipts: CloseoutReceipt[];
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
  dryRun: boolean;
  run: Run;
  runPath?: string;
  state: "created" | "loaded" | "preview" | "updated";
}

export interface RuntimeVerificationResult extends RuntimeServiceResult {
  verification: VerificationResult;
}

export interface RuntimeRemoteStatusResult extends RuntimeServiceResult {
  remoteCheck: RemoteCheckResult;
}

export interface RuntimeCloseoutResult extends RuntimeServiceResult {
  receipt: CloseoutReceipt;
  closeoutPath?: string;
}

export interface StartRuntimeRunOptions {
  taskPath: string;
  dryRun?: boolean;
}

export interface RuntimeDryRunOptions {
  dryRun?: boolean;
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
}

interface VerificationResolution {
  verification: VerificationResult;
  snapshot: VerifiedSnapshot;
  reuseDecision: VerificationReuseDecision;
  commandEvidence: VerificationCommandResultEvidence[];
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
  const changeSet = buildChangeSet(targetRoot);
  const branch = readGitValue(targetRoot, ["branch", "--show-current"]);
  const headSha = readGitValue(targetRoot, ["rev-parse", "--verify", "HEAD"]);

  return {
    root_path: targetRoot,
    ...(branch ? { branch } : {}),
    ...(headSha ? { head_sha: headSha } : {}),
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

function inferPhaseIdFromText(markdown: string): string | undefined {
  const headingMatch = /^#\s*Phase\s+([0-9]+(?:\.[0-9]+)?)/im.exec(markdown);
  return headingMatch?.[1];
}

function inferPhaseIdFromPath(taskPath: string): string | undefined {
  const basename = path.basename(taskPath);
  const match = /^PHASE_([0-9]+(?:_[0-9]+)?)/.exec(basename);

  if (!match) {
    return undefined;
  }

  const parts = match[1].split("_");
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join("")}`;
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

  return {
    ...buildSchemaMetadata(input.producerCommand ?? "node bin/ch run start"),
    run_id: input.runId,
    task_path: input.taskPath,
    ...(input.activeTaskPath ? { active_task_path: input.activeTaskPath } : {}),
    ...(input.phaseId ? { phase_id: input.phaseId } : {}),
    status: "running",
    created_at: timestamp,
    updated_at: timestamp,
    repository: input.repository,
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
  assertStatus(record.status, ["running", "ready", "blocked", "closed"], "status", "runtime run");
  assertObject(record.repository, "runtime run repository");

  for (const field of [
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
  ]) {
    assertRequiredArray(record, field, "runtime run");
  }

  return record as unknown as Run;
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
  requiredGates: RequiredGate[]
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

  return blockers;
}

export function createCloseoutReceipt(run: Run): CloseoutReceipt {
  const timestamp = nowIso();
  const verification = latestVerification(run, timestamp);
  const review = latestReview(run, timestamp);
  const blockers = findCloseoutBlockers(verification, review, run.findings, run.required_gates);

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
    blockers
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

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeRuntimeRun(targetRoot: string, run: Run): string {
  const runPath = runFilePath(targetRoot, run.run_id);
  writeJsonFile(runPath, run);
  writeJsonFile(currentRunPointerPath(targetRoot), {
    run_id: run.run_id,
    run_path: path.join(run.run_id, RUN_FILE),
    updated_at: run.updated_at
  });
  return runPath;
}

function readCurrentRuntimeRun(targetRoot: string): { run: Run; runPath: string } | undefined {
  const pointerPath = currentRunPointerPath(targetRoot);

  if (!fs.existsSync(pointerPath) || !fs.statSync(pointerPath).isFile()) {
    return undefined;
  }

  const pointer = assertObject(readJsonFile(pointerPath), "runtime current pointer");
  assertRequiredString(pointer, "run_id", "runtime current pointer");
  assertRequiredString(pointer, "run_path", "runtime current pointer");

  const runPath = path.resolve(runtimeRunsDir(targetRoot), String(pointer.run_path));
  const relative = path.relative(runtimeRunsDir(targetRoot), runPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Runtime current pointer resolves outside .harness/runs.");
  }

  if (!fs.existsSync(runPath) || !fs.statSync(runPath).isFile()) {
    throw new Error(`Runtime current run is missing: ${toRepoRelative(targetRoot, runPath)}`);
  }

  return {
    run: validateRuntimeRun(readJsonFile(runPath)),
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

function buildSelfHostingVerificationCommands(targetRoot: string): RuntimeVerificationCommand[] | undefined {
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
    command: formatCommandForDisplay(command.command, command.args)
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

function loadRunForMutation(targetRoot: string, dryRun: boolean): { run: Run; runPath?: string; state: "loaded" | "preview" } {
  const current = readCurrentRuntimeRun(targetRoot);

  if (current) {
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
  const targetRoot = requireGitTargetRoot(cwd);
  const dryRun = options.dryRun ?? false;
  const task = resolveTaskReference(targetRoot, options.taskPath);
  const run = buildRuntimeRun({
    runId: dryRun ? "run-dry-run" : buildNextRunId(targetRoot),
    taskPath: task.taskPath,
    activeTaskPath: task.activeTaskPath,
    phaseId: task.phaseId,
    repository: buildRepositoryRef(targetRoot),
    timestamp: nowIso()
  });

  if (dryRun) {
    return {
      targetRoot,
      dryRun,
      run,
      state: "preview"
    };
  }

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
      status: run.status
    },
    "node bin/ch run start"
  );

  return {
    targetRoot,
    dryRun,
    run,
    runPath,
    state: "created"
  };
}

export function getRuntimeStatus(cwd: string, options: RuntimeDryRunOptions = {}): RuntimeServiceResult {
  const targetRoot = requireGitTargetRoot(cwd);
  const dryRun = options.dryRun ?? false;
  const current = readCurrentRuntimeRun(targetRoot);

  if (current) {
    return {
      targetRoot,
      dryRun,
      run: current.run,
      runPath: current.runPath,
      state: "loaded"
    };
  }

  if (dryRun) {
    return {
      targetRoot,
      dryRun,
      run: buildPreviewRun(targetRoot, "TASK.md", "node bin/ch run status --dry-run"),
      state: "preview"
    };
  }

  throw new Error("No current runtime run found. Run `node bin/ch run start --task TASK.md` first.");
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
  const commandEvidence: VerificationCommandResultEvidence[] = [];
  const runtimeCommandResults: CommandResult[] = [];

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const display = formatCommandForDisplay(command.command, command.args);
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
  const selfHostingCommands = !detectInstalledLayer(targetRoot) ? buildSelfHostingVerificationCommands(targetRoot) : undefined;

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
  const targetRoot = requireGitTargetRoot(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun);
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

  return {
    targetRoot,
    dryRun,
    run,
    runPath,
    verification,
    state: dryRun && current.state === "preview" ? "preview" : "updated"
  };
}

export async function recordRuntimeRemoteStatus(
  cwd: string,
  options: RecordRemoteStatusOptions = {}
): Promise<RuntimeRemoteStatusResult> {
  const targetRoot = requireGitTargetRoot(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun);
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

  return {
    targetRoot,
    dryRun,
    run,
    runPath,
    remoteCheck,
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

export async function closeoutRuntimeRun(cwd: string, options: RuntimeDryRunOptions = {}): Promise<RuntimeCloseoutResult> {
  const targetRoot = requireGitTargetRoot(cwd);
  const dryRun = options.dryRun ?? false;
  const current = loadRunForMutation(targetRoot, dryRun);
  const preparedRun = ensureRunHasVerificationAndReview(current.run, targetRoot);
  const receipt = createCloseoutReceipt(preparedRun);
  const run: Run = {
    ...preparedRun,
    status: receipt.status === "READY" ? "ready" : "blocked",
    updated_at: receipt.created_at,
    closeout_receipts: [...preparedRun.closeout_receipts, receipt]
  };

  if (dryRun) {
    return {
      targetRoot,
      dryRun,
      run,
      runPath: current.runPath,
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
    dryRun,
    run,
    runPath,
    closeoutPath,
    receipt,
    state: "updated"
  };
}
