import * as path from "node:path";
import { error, lines } from "../core/logger";
import {
  type ApprovePlanOptions,
  type BindImplementationBaselineOptions,
  type MarkDiscardableOptions,
  type MaterializeNextTaskOptions,
  type RecordNextTaskOptions,
  type RecordProcedureOptions,
  type LaunchReviewOptions,
  type RecordRoutingEvaluationOptions,
  type DecideRoutingPolicyOptions,
  type RecordRoutingPolicySourceApplicationOptions,
  type CleanupPreparedSuccessorOptions,
  type RecordRemoteStatusOptions,
  type RemoteGateStatus,
  type RuntimeReviewLaunchResult,
  type RuntimeNextTaskDecisionResult,
  type RuntimeOperatorStatusResult,
  type RuntimePlanApprovalResult,
  type RuntimeImplementationBaselineResult,
  type RuntimeIndependentRecordResult,
  type RuntimeProcedureResult,
  type RuntimeServiceResult,
  type RuntimeBootstrapResult,
  type RuntimeTaskMaterializationResult,
  approveRuntimePlan,
  bindRuntimeImplementationBaseline,
  recordRuntimeProof,
  recordRuntimeReviewCapabilityEvidence,
  closeoutRuntimeRun,
  getRuntimeOperatorStatus,
  getRuntimeStatus,
  launchRuntimeReview,
  launchRuntimePlanningReviewBundle,
  materializeRuntimeNextTask,
  markRuntimeRunDiscardable,
  recordRuntimeNextTask,
  recordRuntimeProcedure,
  recordRuntimeRemoteStatus,
  startRuntimeRun,
  verifyRuntimeRun,
  ReviewRecursionForbiddenError,
  recordRuntimeRoutingEvaluation,
  decideRuntimeRoutingPolicy,
  recordRuntimeRoutingPolicySourceApplication,
  cleanupRuntimePreparedSuccessor
} from "../core/runtime";
import {
  prepareRuntimeStagePacket,
  recordRuntimeStageResult,
  type PrepareStagePacketOptions,
  type RecordStageResultOptions,
  type StagePacketServiceResult,
  type StageResultServiceResult
} from "../core/stage-operator";

type ParsedOptions = Record<string, string | boolean>;

const REMOTE_GATE_STATUSES: RemoteGateStatus[] = ["pass", "failed", "skipped", "missing", "unknown"];

function printRunHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch run --help",
    "  node bin/ch run start --task TASK.md [--dry-run]",
    "  node bin/ch run status [--operator] [--run <run-id>] [--merge-strategy <merge_commit|squash|rebase>] [--dry-run]",
    "  node bin/ch run verify [--run <run-id>] [--dry-run]",
    "  node bin/ch run closeout [--run <run-id>] [--dry-run]",
    "  node bin/ch run record-procedure --run <run-id> --procedure <id> --file <path> [--dry-run]",
    "  node bin/ch run prepare-packet [--run <run-id>] --kind auto|plan|implementation|review|fix-pass|closeout [--dry-run]",
    "  node bin/ch run record-stage-result [--run <run-id>] --packet <id> --file <path> [--dry-run]",
    "  node bin/ch run launch-review --run <run-id> --procedure <plan-review|implementation-review|fix-pass-review> --request <path> --output <path> [--timeout-seconds <n>] [--stale-after-seconds <n>] [--evaluation-mode approved|shadow|replay|canary] [--candidate-policy-version <id> --candidate-binding-version <id> --candidate-profile-id <id>] [--source-application-decision <id>] [--dry-run]",
    "  node bin/ch run launch-review --run <run-id> --bundle planning --lens-manifest <manifest.json> --request <path> --output <bundle.json> [--timeout-seconds <n>] [--stale-after-seconds <n>] [--dry-run]",
    "  node bin/ch run record-routing-evaluation --run <run-id> --file <bundle.json> [--dry-run]",
    "  node bin/ch run decide-routing-policy --run <run-id> --evaluation <id> --decision authorize-canary|promote|reject|rollback --policy-version <id> --binding-version <id> --approver <name> --reason <text> [--selector <file>] [--max-invocations <1-3>] [--dry-run]",
    "  node bin/ch run record-routing-policy-source-application --run <run-id> --decision <id> --commit <sha> --policy-file <path> --binding-file <path> --implementation-review <artifact-id> [--dry-run]",
    "  node bin/ch run cleanup-prepared-successor --run <run-id> --decision-id <id> --file <evidence.json> [--dry-run]",
    "  node bin/ch run approve-plan --run <run-id> --plan <path> --approver <name> [--reason <text>] [--dry-run]",
    "  node bin/ch run bind-implementation-baseline --run <run-id> --plan <path> --approval-id <id> --expected-head <sha> [--dry-run]",
    "  node bin/ch run record-proof --run <run-id> --file <proof.json> [--dry-run]",
    "  node bin/ch run record-review-capability-evidence --run <run-id> --file <evidence.json> --expected-sha <sha256> [--dry-run]",
    "  node bin/ch run record-next-task --run <run-id> (--task <path> --base-commit <sha> --file <path> [--base-ref <ref>] | --no-successor --reason <text> --decision-owner <id> --approval-id <id>) [--dry-run]",
    "  node bin/ch run materialize-next-task --run <run-id> --decision-id <id> --task <path> --branch <name> --worktree <Desktop-created-path> --enter-existing [--recover-existing-activation] [--dry-run]",
    "  node bin/ch run mark-discardable --run <run-id> --reason <reason> [--dry-run]",
    "  node bin/ch run remote-status [--run <provider-run-id>] [--provider <provider>] [--gate <gate-id>] [--name <name>] [--status pass|failed|skipped|missing|unknown] [--required true|false] [--explanation <text>] [--dry-run]",
    "",
    "Commands:",
    "  start         Start a local runtime run for a task file.",
    "  status        Read the current runtime run or preview one in dry-run mode.",
    "  verify        Run current verification commands or record installed verifier output.",
    "  closeout      Create a structured closeout receipt for the current runtime run.",
    "  record-procedure Record a self-hosting procedure artifact as durable run evidence.",
    "  prepare-packet Prepare one deterministic hookless stage packet without launching a runner.",
    "  record-stage-result Validate and ingest one supplied stage-result fixture.",
    "  launch-review Supervise a read-only review launch; policy defaults apply unless an override is within its registered bounds.",
    "  record-routing-evaluation Record an immutable routing evaluation bundle.",
    "  decide-routing-policy Record an explicit owner canary, promotion, rejection, or rollback decision.",
    "  record-routing-policy-source-application Validate and record reviewed source application.",
    "  cleanup-prepared-successor Recoverably quarantine an unopened Desktop-created successor.",
    "  approve-plan  Record explicit human approval of the reviewed plan.",
    "  bind-implementation-baseline Validate and record the immutable implementation diff base.",
    "  record-proof Validate and record one accepted proof for an eligible run.",
    "  record-review-capability-evidence Record observed safe-session-resume capability evidence.",
    "  record-next-task Record the next task decision with exact base-commit authority.",
    "  materialize-next-task Validate and enter a Codex Desktop-created successor worktree; never create one with raw Git.",
    "  mark-discardable Record an explicit discard reason for a run.",
    "  remote-status Record provider-neutral remote gate status for the current run."
  ]);
}

function parseOptions(args: string[], valueFlags: Set<string>, booleanFlags = new Set(["dry-run"])): ParsedOptions {
  const parsed: ParsedOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const name = arg.slice(2);

    if (booleanFlags.has(name)) {
      parsed[name] = true;
      continue;
    }

    if (!valueFlags.has(name)) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }

    parsed[name] = value;
    index += 1;
  }

  return parsed;
}

function parseRequired(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("--required must be true or false.");
}

function parseRemoteStatus(value: string | boolean | undefined): RemoteGateStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !REMOTE_GATE_STATUSES.includes(value as RemoteGateStatus)) {
    throw new Error(`--status must be one of: ${REMOTE_GATE_STATUSES.join(", ")}.`);
  }

  return value as RemoteGateStatus;
}

function stringOption(options: ParsedOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
}

function dryRunOption(options: ParsedOptions): boolean {
  return options["dry-run"] === true;
}

function operatorOption(options: ParsedOptions): boolean {
  return options.operator === true;
}

function renderRunLines(title: string, result: RuntimeServiceResult): string[] {
  const run = result.run;
  const output = [
    title,
    `target root: ${result.targetRoot}`,
    `project root: ${result.projectRoot}`,
    `run id: ${run.run_id}`,
    `task path: ${run.task_path}`,
    `active task path: ${run.active_task_path ?? "(none)"}`,
    `phase: ${run.phase_id ?? "(unknown)"}`,
    `run mode: ${run.run_mode}`,
    `lifecycle status: ${run.lifecycle_status}`,
    `state: ${result.state}`,
    `state path: ${result.runPath ? path.relative(result.targetRoot, result.runPath) : "(dry-run preview)"}`,
    `project db: ${result.projectDbPath ? path.relative(result.projectRoot, result.projectDbPath) : "(unavailable)"}`,
    `staging db: ${result.stagingDbPath ? path.relative(result.targetRoot, result.stagingDbPath) : "(unavailable)"}`
  ];

  if (result.dryRun) {
    output.push("dry-run: no files were written");
  }

  return output;
}

function renderBootstrapLines(bootstrap: RuntimeBootstrapResult): string[] {
  const output = [
    `bootstrap status: ${bootstrap.status}`,
    `operator stage: ${bootstrap.operator.current_stage}`,
    `operator next procedure: ${bootstrap.operator.next_procedure_id}`,
    `operator next action: ${bootstrap.operator.next_allowed_action}`
  ];

  for (const fact of bootstrap.facts) {
    output.push(`bootstrap fact ${fact.label}: ${fact.value} (${fact.source})`);
  }

  if (bootstrap.handoff) {
    output.push(`handoff kind: ${bootstrap.handoff.kind}`);
    output.push(`handoff procedure: ${bootstrap.handoff.procedure_id}`);
    output.push(`handoff prompt: ${bootstrap.handoff.prompt}`);
  }

  if (bootstrap.repairPacket) {
    output.push(`repair packet id: ${bootstrap.repairPacket.packet_id}`);
    output.push(`repair route: ${bootstrap.repairPacket.route}`);
    output.push(`repair next action: ${bootstrap.repairPacket.next_action}`);
  }

  for (const issue of bootstrap.issues) {
    output.push(`run issue ${issue.issue_type}: ${issue.summary}`);
  }

  return output;
}

function renderOperatorLines(result: RuntimeOperatorStatusResult): string[] {
  const output = [
    "codex-harness run status --operator",
    `current_stage: ${result.operator.current_stage}`,
    `next_procedure_id: ${result.operator.next_procedure_id}`,
    `required_inputs: ${JSON.stringify(result.operator.required_inputs)}`,
    `missing_inputs: ${JSON.stringify(result.operator.missing_inputs)}`,
    `required_evidence: ${JSON.stringify(result.operator.required_evidence)}`,
    `missing_evidence: ${JSON.stringify(result.operator.missing_evidence)}`,
    `stop_reason: ${result.operator.stop_reason}`,
    `human_action_required: ${result.operator.human_action_required ? "true" : "false"}`,
    `next_allowed_action: ${result.operator.next_allowed_action}`,
    `forbidden_actions: ${JSON.stringify(result.operator.forbidden_actions)}`,
    `review_tier: ${result.operator.review_tier}`
  ];

  if (result.operator.notes && result.operator.notes.length > 0) {
    output.push(`notes: ${JSON.stringify(result.operator.notes)}`);
  }

  if (result.dryRun) {
    output.push("dry-run: no files were written");
  }

  return output;
}

function renderProcedureLines(result: RuntimeProcedureResult): string[] {
  const output = renderRunLines("codex-harness run record-procedure", result);
  output.push(`procedure: ${result.procedureId}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  output.push(`artifact path: ${result.artifact.path}`);
  output.push(`artifact id: ${result.artifact.artifact_id}`);
  output.push(`evidence id: ${result.evidence.evidence_id}`);
  return output;
}

function renderStagePacketLines(result: StagePacketServiceResult): string[] {
  const output = [
    "codex-harness run prepare-packet",
    `target root: ${result.targetRoot}`,
    `project root: ${result.projectRoot}`,
    `run id: ${result.run.run_id}`,
    `run instance id: ${result.run.run_instance_id ?? "(missing)"}`,
    `run revision: ${result.run.run_revision ?? "(missing)"}`,
    `packet kind: ${result.stageState.packet_kind}`,
    `procedure: ${result.stageState.procedure_id}`,
    `stage status: ${result.stageState.status}`,
    `human_action_required: ${result.stageState.human_action_required ? "true" : "false"}`,
    `next_allowed_action: ${result.stageState.next_allowed_action}`,
    `recorded: ${result.recorded ? "true" : "false"}`
  ];
  if (result.packet) {
    output.push(`stage packet id: ${result.packet.stage_packet_id}`);
    output.push(`runner profile: ${result.packet.runner_profile_id}`);
    output.push(`route decision: ${result.packet.route_decision_id}`);
    output.push(`context core: ${result.packet.context_core_id}`);
    output.push(`required reviews: ${JSON.stringify(result.packet.required_semantic_reviews)}`);
  }
  if (result.issue) {
    output.push(`stop reason: ${result.issue.issue_type}`);
    output.push(`run issue: ${result.issue.summary}`);
  }
  if (result.repairPacket) {
    output.push(`repair packet id: ${result.repairPacket.packet_id}`);
  }
  if (result.dryRun) {
    output.push("dry-run: no files were written");
  }
  return output;
}

function renderStageResultLines(result: StageResultServiceResult): string[] {
  const output = [
    "codex-harness run record-stage-result",
    `target root: ${result.targetRoot}`,
    `project root: ${result.projectRoot}`,
    `run id: ${result.run.run_id}`,
    `stage result id: ${result.stageResult.stage_result_id}`,
    `stage packet id: ${result.stageResult.stage_packet_id}`,
    `outcome: ${result.stageResult.outcome}`,
    `schema valid: ${result.stageResult.schema_valid ? "true" : "false"}`,
    `payload id: ${result.stageResult.payload_id}`,
    `human_action_required: ${result.stageState.human_action_required ? "true" : "false"}`,
    `next_allowed_action: ${result.stageState.next_allowed_action}`,
    `recorded: ${result.recorded ? "true" : "false"}`
  ];
  if (result.issue) {
    output.push(`stop reason: ${result.issue.issue_type}`);
    output.push(`run issue: ${result.issue.summary}`);
  }
  if (result.repairPacket) {
    output.push(`repair packet id: ${result.repairPacket.packet_id}`);
  }
  if (result.dryRun) {
    output.push("dry-run: no files were written");
  }
  return output;
}

function renderReviewLaunchLines(result: RuntimeReviewLaunchResult): string[] {
  const output = renderRunLines("codex-harness run launch-review", result);
  const observation = result.observation;
  output.push(`launch status: ${observation.status}`);
  output.push(`procedure: ${observation.procedure_id}`);
  output.push(`adapter: ${observation.adapter_id}`);
  output.push(`sandbox: ${observation.sandbox_mode}`);
  if (observation.timeout_seconds !== undefined) output.push(`timeout seconds: ${observation.timeout_seconds}`);
  if (observation.stale_after_seconds !== undefined) output.push(`stale-after seconds: ${observation.stale_after_seconds}`);
  if (observation.termination_policy) output.push(`termination policy: ${observation.termination_policy}`);
  output.push(`output path: ${observation.output_path}`);
  if (observation.attempt_id) {
    output.push(`attempt id: ${observation.attempt_id}`);
  }
  if (observation.artifact_path) {
    output.push(`artifact path: ${observation.artifact_path}`);
  }
  if (observation.artifact_id) {
    output.push(`artifact id: ${observation.artifact_id}`);
  }
  if (observation.failure_classification) {
    output.push(`failure classification: ${observation.failure_classification}`);
  }
  output.push(`summary: ${observation.summary}`);
  output.push(`next valid action: ${observation.next_valid_action}`);
  return output;
}

function renderOperationalRecordLines(title: string, result: import("../core/runtime").RuntimeOperationalRecordResult): string[] {
  const output = renderRunLines(title, result);
  output.push(`record kind: ${result.operationalRecord.record_kind}`);
  output.push(`record id: ${result.operationalRecord.record_id}`);
  output.push(`record status: ${result.operationalRecord.status}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  return output;
}

function parsePositiveIntegerOption(options: ParsedOptions, name: string): number | undefined {
  const value = stringOption(options, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return parsed;
}

function renderPlanApprovalLines(result: RuntimePlanApprovalResult): string[] {
  const output = renderRunLines("codex-harness run approve-plan", result);
  output.push(`approval id: ${result.approval.approval_id}`);
  output.push(`approver: ${result.approval.approver ?? "(unknown)"}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  output.push(`plan artifact path: ${result.artifact.path}`);
  output.push(`plan artifact id: ${result.artifact.artifact_id}`);
  return output;
}

function renderImplementationBaselineLines(
  result: RuntimeImplementationBaselineResult,
): string[] {
  const output = renderRunLines(
    "codex-harness run bind-implementation-baseline",
    result,
  );
  output.push(
    `implementation baseline head: ${result.binding.implementation_baseline_head}`,
  );
  output.push(
    `implementation baseline tree: ${result.binding.implementation_baseline_tree_hash}`,
  );
  output.push(`approval id: ${result.binding.approval_id}`);
  output.push(`plan artifact hash: ${result.binding.plan_artifact_hash}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  return output;
}

function renderIndependentRecordLines(title: string, result: RuntimeIndependentRecordResult): string[] {
  const output = renderRunLines(title, result);
  output.push(`record kind: ${result.recordKind}`);
  output.push(`record id: ${result.recordId}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  return output;
}

function renderNextTaskDecisionLines(result: RuntimeNextTaskDecisionResult): string[] {
  const output = renderRunLines("codex-harness run record-next-task", result);
  output.push(`decision id: ${result.decision.decision_id}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  if (result.artifact) {
    output.push(`artifact path: ${result.artifact.path}`);
    output.push(`artifact id: ${result.artifact.artifact_id}`);
  }
  if (result.evidence) output.push(`evidence id: ${result.evidence.evidence_id}`);
  return output;
}

function renderMaterializationLines(result: RuntimeTaskMaterializationResult): string[] {
  const output = [
    "codex-harness run materialize-next-task",
    `target root: ${path.resolve(result.targetRoot)}`,
    `project root: ${path.resolve(result.projectRoot)}`,
    `dry run: ${result.dryRun ? "yes" : "no"}`,
    `decision id: ${result.decisionId}`,
    `task path: ${result.taskPath}`,
    `branch: ${result.branch}`,
    `worktree: ${result.worktreePath}`,
    `created: ${result.created ? "true" : "false"}`,
    `recovered existing activation: ${result.recoveredExistingActivation ? "true" : "false"}`,
    ...(result.taskStateId ? [`task-state id: ${result.taskStateId}`] : []),
    `handoff required: ${result.handoffRequired ? "true" : "false"}`,
    `next action: ${result.nextAction}`,
    `state: ${result.state}`
  ];
  return output;
}

async function runStart(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["task"]));
  const result = await startRuntimeRun(process.cwd(), {
    taskPath: stringOption(options, "task") ?? "TASK.md",
    dryRun: dryRunOption(options)
  });

  const output = renderRunLines("codex-harness run start", result);
  if (result.bootstrap) {
    output.push(...renderBootstrapLines(result.bootstrap));
  }
  lines(output);
  return result.state === "blocked" ? 1 : 0;
}

async function runStatusCommand(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "merge-strategy"]), new Set(["dry-run", "operator"]));

  if (operatorOption(options)) {
    lines(
      renderOperatorLines(
        getRuntimeOperatorStatus(process.cwd(), {
          dryRun: dryRunOption(options),
          runId: stringOption(options, "run"),
          mergeStrategy: stringOption(options, "merge-strategy")
        })
      )
    );
    return 0;
  }

  const result = getRuntimeStatus(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run")
  });
  const output = renderRunLines("codex-harness run status", result);
  output.push(`steps: ${result.run.steps.length}`);
  output.push(`verification results: ${result.run.verification_results.length}`);
  output.push(`review results: ${result.run.review_results.length}`);
  output.push(`remote checks: ${result.run.remote_checks.length}`);
  output.push(`delivery facts: ${result.run.delivery_facts.length}`);
  lines(output);
  return 0;
}

async function runVerify(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run"]));
  if (!dryRunOption(options)) {
    lines([
      "verification: running",
      "expected_duration: full self-hosting verification commonly takes 9-18 minutes as the suite grows; wait for real exit and do not launch a duplicate while this process is alive."
    ]);
  }
  const result = await verifyRuntimeRun(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run")
  });
  const output = renderRunLines("codex-harness run verify", result);
  const durationMs = result.verification.command_results.reduce(
    (total, commandResult) => total + (typeof commandResult.duration_ms === "number" ? commandResult.duration_ms : 0),
    0
  );
  output.push(`verification: ${result.verification.status}`);
  output.push(`verification_duration_ms: ${durationMs}`);
  output.push(`summary: ${result.verification.summary}`);
  lines(output);
  return 0;
}

async function runCloseout(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run"]));
  const result = await closeoutRuntimeRun(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run")
  });
  const output = renderRunLines("codex-harness run closeout", result);
  output.push(`closeout: ${result.receipt.status}`);
  output.push(`receipt path: ${result.closeoutPath ? path.relative(result.targetRoot, result.closeoutPath) : "(dry-run preview)"}`);
  output.push(`blockers: ${result.receipt.blockers.length}`);

  if (result.receipt.blockers.length > 0) {
    output.push(...result.receipt.blockers.map((blocker) => `- ${blocker}`));
  }

  lines(output);
  return 0;
}

async function runRecordProcedure(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "procedure", "file"]));
  const procedureId = stringOption(options, "procedure");
  const filePath = stringOption(options, "file");

  if (!procedureId) {
    throw new Error("--procedure is required.");
  }

  if (!filePath) {
    throw new Error("--file is required.");
  }

  const result = await recordRuntimeProcedure(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    procedureId,
    filePath
  } satisfies RecordProcedureOptions);
  lines(renderProcedureLines(result));
  return 0;
}

async function runPreparePacket(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "kind"]));
  const kind = stringOption(options, "kind");
  if (!kind) {
    throw new Error("--kind is required.");
  }
  const result = prepareRuntimeStagePacket(process.cwd(), {
    runId: stringOption(options, "run"),
    kind,
    dryRun: dryRunOption(options)
  } as PrepareStagePacketOptions);
  lines(renderStagePacketLines(result));
  return result.stageState.status === "blocked" ? 1 : 0;
}

async function runRecordStageResult(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "packet", "file"]));
  const packetId = stringOption(options, "packet");
  const filePath = stringOption(options, "file");
  if (!packetId) {
    throw new Error("--packet is required.");
  }
  if (!filePath) {
    throw new Error("--file is required.");
  }
  const result = recordRuntimeStageResult(process.cwd(), {
    runId: stringOption(options, "run"),
    packetId,
    filePath,
    dryRun: dryRunOption(options)
  } satisfies RecordStageResultOptions);
  lines(renderStageResultLines(result));
  return result.issue ? 1 : 0;
}

async function runLaunchReview(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set([
    "run", "procedure", "bundle", "lens-manifest", "request", "output", "timeout-seconds", "stale-after-seconds",
    "evaluation-mode", "approved-attempt", "evaluation-case", "candidate-policy-version",
    "candidate-binding-version", "candidate-profile-id", "candidate-output", "canary-authorization",
    "source-application-decision",
    "replay-source-run-instance", "replay-packet-artifact"
  ]));
  const procedureId = stringOption(options, "procedure");
  const bundle = stringOption(options, "bundle");
  const requestPath = stringOption(options, "request");
  const outputPath = stringOption(options, "output");
  const evaluationMode = stringOption(options, "evaluation-mode");
  if (evaluationMode && !["approved", "shadow", "replay", "canary"].includes(evaluationMode)) {
    throw new Error("--evaluation-mode must be one of: approved, shadow, replay, canary.");
  }

  if ((procedureId ? 1 : 0) + (bundle ? 1 : 0) !== 1) {
    throw new Error("Exactly one of --procedure or --bundle is required.");
  }
  if (!requestPath) {
    throw new Error("--request is required.");
  }
  if (!outputPath) {
    throw new Error("--output is required.");
  }

  if (bundle) {
    if (bundle !== "planning") throw new Error("--bundle must be planning.");
    const lensManifestPath = stringOption(options, "lens-manifest");
    if (!lensManifestPath) throw new Error("--lens-manifest is required for planning bundles.");
    const result = await launchRuntimePlanningReviewBundle(process.cwd(), {
      dryRun: dryRunOption(options),
      runId: stringOption(options, "run"),
      requestPath,
      outputPath,
      lensManifestPath,
      timeoutSeconds: parsePositiveIntegerOption(options, "timeout-seconds"),
      staleAfterSeconds: parsePositiveIntegerOption(options, "stale-after-seconds")
    });
    lines(renderReviewLaunchLines(result));
    return result.observation.status === "success" || result.observation.status === "dry_run" ? 0 : 1;
  }
  const result = await launchRuntimeReview(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    procedureId: procedureId!,
    requestPath,
    outputPath,
    timeoutSeconds: parsePositiveIntegerOption(options, "timeout-seconds"),
    staleAfterSeconds: parsePositiveIntegerOption(options, "stale-after-seconds"),
    evaluationMode: evaluationMode as LaunchReviewOptions["evaluationMode"],
    approvedAttemptId: stringOption(options, "approved-attempt"),
    evaluationCaseId: stringOption(options, "evaluation-case"),
    candidatePolicyVersion: stringOption(options, "candidate-policy-version"),
    candidateBindingVersion: stringOption(options, "candidate-binding-version"),
    candidateProfileId: stringOption(options, "candidate-profile-id"),
    candidateOutputPath: stringOption(options, "candidate-output"),
    sourceApplicationDecisionId: stringOption(options, "source-application-decision"),
    canaryAuthorizationId: stringOption(options, "canary-authorization"),
    replaySourceRunInstanceId: stringOption(options, "replay-source-run-instance"),
    replayPacketArtifactId: stringOption(options, "replay-packet-artifact")
  } satisfies LaunchReviewOptions);
  lines(renderReviewLaunchLines(result));
  return result.observation.status === "success" || result.observation.status === "dry_run" ? 0 : 1;
}

async function runRecordRoutingEvaluation(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "file"]));
  const filePath = stringOption(options, "file");
  if (!filePath) throw new Error("--file is required.");
  const result = recordRuntimeRoutingEvaluation(process.cwd(), {
    runId: stringOption(options, "run"), filePath, dryRun: dryRunOption(options)
  } satisfies RecordRoutingEvaluationOptions);
  lines(renderOperationalRecordLines("codex-harness run record-routing-evaluation", result));
  return 0;
}

async function runDecideRoutingPolicy(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set([
    "run", "evaluation", "decision", "policy-version", "binding-version", "approver", "reason", "selector", "max-invocations"
  ]));
  const required = (name: string): string => {
    const value = stringOption(options, name);
    if (!value) throw new Error(`--${name} is required.`);
    return value;
  };
  const decision = required("decision");
  if (!["authorize-canary", "promote", "reject", "rollback"].includes(decision)) {
    throw new Error("--decision must be one of: authorize-canary, promote, reject, rollback.");
  }
  const result = decideRuntimeRoutingPolicy(process.cwd(), {
    runId: stringOption(options, "run"),
    evaluationId: required("evaluation"),
    decision: decision.replace("-", "_") as DecideRoutingPolicyOptions["decision"],
    policyVersion: required("policy-version"),
    bindingVersion: required("binding-version"),
    approver: required("approver"),
    reason: required("reason"),
    selectorPath: stringOption(options, "selector"),
    maxInvocations: parsePositiveIntegerOption(options, "max-invocations"),
    dryRun: dryRunOption(options)
  });
  lines(renderOperationalRecordLines("codex-harness run decide-routing-policy", result));
  return 0;
}

async function runRecordRoutingPolicySourceApplication(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "decision", "commit", "policy-file", "binding-file", "implementation-review"]));
  const required = (name: string): string => {
    const value = stringOption(options, name);
    if (!value) throw new Error(`--${name} is required.`);
    return value;
  };
  const result = recordRuntimeRoutingPolicySourceApplication(process.cwd(), {
    runId: stringOption(options, "run"),
    decisionId: required("decision"),
    commitSha: required("commit"),
    policyFile: required("policy-file"),
    bindingFile: required("binding-file"),
    implementationReviewArtifactId: required("implementation-review"),
    dryRun: dryRunOption(options)
  });
  lines(renderOperationalRecordLines("codex-harness run record-routing-policy-source-application", result));
  return 0;
}

async function runCleanupPreparedSuccessor(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "decision-id", "file"]));
  const decisionId = stringOption(options, "decision-id");
  const filePath = stringOption(options, "file");
  if (!decisionId) throw new Error("--decision-id is required.");
  if (!filePath) throw new Error("--file is required.");
  const result = cleanupRuntimePreparedSuccessor(process.cwd(), {
    runId: stringOption(options, "run"), decisionId, filePath, dryRun: dryRunOption(options)
  });
  lines(renderOperationalRecordLines("codex-harness run cleanup-prepared-successor", result));
  return 0;
}

async function runApprovePlan(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "plan", "approver", "reason"]));
  const planPath = stringOption(options, "plan");
  const approver = stringOption(options, "approver");

  if (!planPath) {
    throw new Error("--plan is required.");
  }

  if (!approver) {
    throw new Error("--approver is required.");
  }

  const result = await approveRuntimePlan(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    planPath,
    approver,
    reason: stringOption(options, "reason")
  } satisfies ApprovePlanOptions);
  lines(renderPlanApprovalLines(result));
  return 0;
}

async function runBindImplementationBaseline(args: string[]): Promise<number> {
  const options = parseOptions(
    args,
    new Set(["run", "plan", "approval-id", "expected-head"]),
  );
  const planPath = stringOption(options, "plan");
  const approvalId = stringOption(options, "approval-id");
  const expectedHead = stringOption(options, "expected-head");
  if (!planPath) throw new Error("--plan is required.");
  if (!approvalId) throw new Error("--approval-id is required.");
  if (!expectedHead) throw new Error("--expected-head is required.");
  const result = await bindRuntimeImplementationBaseline(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    planPath,
    approvalId,
    expectedHead,
  } satisfies BindImplementationBaselineOptions);
  lines(renderImplementationBaselineLines(result));
  return 0;
}

function runIndependentFileCommand(
  args: string[],
  kind: "proof" | "review-capability"
): number {
  const options = parseOptions(args, new Set(["run", "file", "expected-sha"]));
  const filePath = stringOption(options, "file");
  if (!filePath) throw new Error("--file is required.");
  const serviceOptions = {
    runId: stringOption(options, "run"),
    filePath,
    expectedSha: stringOption(options, "expected-sha"),
    dryRun: dryRunOption(options)
  };
  const result = kind === "proof"
    ? recordRuntimeProof(process.cwd(), serviceOptions)
    : recordRuntimeReviewCapabilityEvidence(process.cwd(), serviceOptions);
  lines(renderIndependentRecordLines(
    kind === "proof"
      ? "codex-harness run record-proof"
      : "codex-harness run record-review-capability-evidence",
    result
  ));
  return 0;
}

async function runRecordNextTask(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set([
    "run", "task", "base-commit", "base-ref", "file",
    "reason", "decision-owner", "approval-id"
  ]), new Set(["dry-run", "no-successor"]));
  const taskPath = stringOption(options, "task");
  const baseCommit = stringOption(options, "base-commit");
  const filePath = stringOption(options, "file");
  const noSuccessor = options["no-successor"] === true;

  const result = await recordRuntimeNextTask(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    taskPath,
    baseCommit,
    baseRef: stringOption(options, "base-ref"),
    filePath,
    noSuccessor,
    reason: stringOption(options, "reason"),
    decisionOwner: stringOption(options, "decision-owner"),
    approvalId: stringOption(options, "approval-id")
  } satisfies RecordNextTaskOptions);
  lines(renderNextTaskDecisionLines(result));
  return 0;
}

async function runMaterializeNextTask(args: string[]): Promise<number> {
  const options = parseOptions(
    args,
    new Set(["run", "decision-id", "task", "branch", "worktree"]),
    new Set(["dry-run", "create", "enter-existing", "recover-existing-activation"])
  );
  const decisionId = stringOption(options, "decision-id");
  const taskPath = stringOption(options, "task");
  const branch = stringOption(options, "branch");
  const worktreePath = stringOption(options, "worktree");

  if (!decisionId) {
    throw new Error("--decision-id is required.");
  }
  if (!taskPath) {
    throw new Error("--task is required.");
  }
  if (!branch) {
    throw new Error("--branch is required.");
  }
  if (!worktreePath) {
    throw new Error("--worktree is required.");
  }

  const result = await materializeRuntimeNextTask(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    decisionId,
    taskPath,
    branch,
    worktreePath,
    create: options.create === true,
    enterExisting: options["enter-existing"] === true,
    recoverExistingActivation: options["recover-existing-activation"] === true
  } satisfies MaterializeNextTaskOptions);
  lines(renderMaterializationLines(result));
  return 0;
}

async function runMarkDiscardable(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "reason"]));
  const runId = stringOption(options, "run");
  const reason = stringOption(options, "reason");

  if (!runId) {
    throw new Error("--run is required.");
  }

  if (!reason) {
    throw new Error("--reason is required.");
  }

  const result = await markRuntimeRunDiscardable(process.cwd(), {
    dryRun: dryRunOption(options),
    runId,
    reason
  } satisfies MarkDiscardableOptions);
  const output = renderRunLines("codex-harness run mark-discardable", result);
  output.push(`discard reason: ${reason}`);
  lines(output);
  return 0;
}

async function runRemoteStatus(args: string[]): Promise<number> {
  const options = parseOptions(
    args,
    new Set(["provider", "run", "url", "gate", "name", "status", "required", "explanation"])
  );
  const remoteOptions: RecordRemoteStatusOptions = {
    dryRun: dryRunOption(options),
    provider: stringOption(options, "provider"),
    providerRunId: stringOption(options, "run"),
    providerUrl: stringOption(options, "url"),
    gateId: stringOption(options, "gate"),
    name: stringOption(options, "name"),
    status: parseRemoteStatus(options.status),
    required: parseRequired(options.required),
    explanation: stringOption(options, "explanation")
  };
  const result = await recordRuntimeRemoteStatus(process.cwd(), remoteOptions);
  const output = renderRunLines("codex-harness run remote-status", result);
  output.push(`remote gate: ${result.remoteCheck.gate_id}`);
  output.push(`remote name: ${result.remoteCheck.name}`);
  output.push(`provider: ${result.remoteCheck.ci_run.provider}`);
  output.push(`status: ${result.remoteCheck.status}`);
  output.push(`required: ${result.remoteCheck.required ? "true" : "false"}`);

  if (result.remoteCheck.explanation) {
    output.push(`explanation: ${result.remoteCheck.explanation}`);
  }

  lines(output);
  return 0;
}

export async function runRuntime(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    printRunHelp();
    return 0;
  }

  const [command, ...commandArgs] = args;

  try {
    switch (command) {
      case "start":
        return runStart(commandArgs);
      case "status":
        return runStatusCommand(commandArgs);
      case "verify":
        return runVerify(commandArgs);
      case "closeout":
        return runCloseout(commandArgs);
      case "record-procedure":
        return runRecordProcedure(commandArgs);
      case "prepare-packet":
        return runPreparePacket(commandArgs);
      case "record-stage-result":
        return runRecordStageResult(commandArgs);
      case "launch-review":
        return await runLaunchReview(commandArgs);
      case "record-routing-evaluation":
        return runRecordRoutingEvaluation(commandArgs);
      case "decide-routing-policy":
        return runDecideRoutingPolicy(commandArgs);
      case "record-routing-policy-source-application":
        return runRecordRoutingPolicySourceApplication(commandArgs);
      case "cleanup-prepared-successor":
        return runCleanupPreparedSuccessor(commandArgs);
      case "approve-plan":
        return runApprovePlan(commandArgs);
      case "bind-implementation-baseline":
        return runBindImplementationBaseline(commandArgs);
      case "record-proof":
        return runIndependentFileCommand(commandArgs, "proof");
      case "record-review-capability-evidence":
        return runIndependentFileCommand(commandArgs, "review-capability");
      case "record-next-task":
        return runRecordNextTask(commandArgs);
      case "materialize-next-task":
        return runMaterializeNextTask(commandArgs);
      case "mark-discardable":
        return runMarkDiscardable(commandArgs);
      case "remote-status":
        return runRemoteStatus(commandArgs);
      default:
        error(`Unknown run command: ${command}`);
        printRunHelp();
        return 1;
    }
  } catch (runError) {
    const recursionError = runError instanceof ReviewRecursionForbiddenError
      ? runError
      : runError && typeof runError === "object"
        && (runError as { name?: unknown }).name === "ReviewRecursionForbiddenError"
        && (runError as { facts?: unknown }).facts
        ? runError as ReviewRecursionForbiddenError
        : undefined;
    if (recursionError) {
      const facts = recursionError.facts;
      lines([
        `failure classification: ${facts.failure_classification}`,
        `outer run instance: ${facts.outer_run_instance_id}`,
        `outer procedure: ${facts.outer_procedure_id}`,
        `outer attempt id: ${facts.outer_attempt_id}`,
        `attempted nested procedure: ${facts.attempted_nested_procedure_id}`,
        `outer claim validation: ${facts.outer_claim_validation}`,
        `claim created: ${facts.claim_created ? "true" : "false"}`,
        `child spawned: ${facts.child_spawned ? "true" : "false"}`,
        `artifact wait started: ${facts.artifact_wait_started ? "true" : "false"}`,
        `next valid action: ${facts.next_valid_action}`
      ]);
      return 1;
    }
    const message = runError instanceof Error ? runError.message : String(runError);
    error(message);
    return 1;
  }
}
