import * as path from "node:path";
import { error, lines } from "../core/logger";
import {
  type ApprovePlanOptions,
  type MarkDiscardableOptions,
  type MaterializeNextTaskOptions,
  type RecordNextTaskOptions,
  type RecordProcedureOptions,
  type LaunchReviewOptions,
  type RecordRemoteStatusOptions,
  type RemoteGateStatus,
  type RuntimeReviewLaunchResult,
  type RuntimeNextTaskDecisionResult,
  type RuntimeOperatorStatusResult,
  type RuntimePlanApprovalResult,
  type RuntimeProcedureResult,
  type RuntimeServiceResult,
  type RuntimeBootstrapResult,
  type RuntimeTaskMaterializationResult,
  approveRuntimePlan,
  closeoutRuntimeRun,
  getRuntimeOperatorStatus,
  getRuntimeStatus,
  launchRuntimeReview,
  materializeRuntimeNextTask,
  markRuntimeRunDiscardable,
  recordRuntimeNextTask,
  recordRuntimeProcedure,
  recordRuntimeRemoteStatus,
  startRuntimeRun,
  verifyRuntimeRun
} from "../core/runtime";

type ParsedOptions = Record<string, string | boolean>;

const REMOTE_GATE_STATUSES: RemoteGateStatus[] = ["pass", "failed", "skipped", "missing", "unknown"];

function printRunHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch run --help",
    "  node bin/ch run start --task TASK.md [--dry-run]",
    "  node bin/ch run status [--operator] [--run <run-id>] [--dry-run]",
    "  node bin/ch run verify [--run <run-id>] [--dry-run]",
    "  node bin/ch run closeout [--run <run-id>] [--dry-run]",
    "  node bin/ch run record-procedure --run <run-id> --procedure <id> --file <path> [--dry-run]",
    "  node bin/ch run launch-review --run <run-id> --procedure <plan-review|implementation-review> --request <path> --output <path> [--timeout-seconds <n>] [--stale-after-seconds <n>] [--dry-run]",
    "  node bin/ch run approve-plan --run <run-id> --plan <path> --approver <name> [--reason <text>] [--dry-run]",
    "  node bin/ch run record-next-task --run <run-id> --task <path> --base-commit <sha> --file <path> [--base-ref <ref>] [--dry-run]",
    "  node bin/ch run materialize-next-task --run <run-id> --decision-id <id> --task <path> --branch <name> --worktree <path> (--create|--enter-existing) [--dry-run]",
    "  node bin/ch run mark-discardable --run <run-id> --reason <reason> [--dry-run]",
    "  node bin/ch run remote-status [--run <provider-run-id>] [--provider <provider>] [--gate <gate-id>] [--name <name>] [--status pass|failed|skipped|missing|unknown] [--required true|false] [--explanation <text>] [--dry-run]",
    "",
    "Commands:",
    "  start         Start a local runtime run for a task file.",
    "  status        Read the current runtime run or preview one in dry-run mode.",
    "  verify        Run current verification commands or record installed verifier output.",
    "  closeout      Create a structured closeout receipt for the current runtime run.",
    "  record-procedure Record a self-hosting procedure artifact as durable run evidence.",
    "  launch-review Supervise a read-only review launch and record structured launch evidence.",
    "  approve-plan  Record explicit human approval of the reviewed plan.",
    "  record-next-task Record the next task decision with exact base-commit authority.",
    "  materialize-next-task Create or enter the next task branch/worktree and start its run.",
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

function renderReviewLaunchLines(result: RuntimeReviewLaunchResult): string[] {
  const output = renderRunLines("codex-harness run launch-review", result);
  const observation = result.observation;
  output.push(`launch status: ${observation.status}`);
  output.push(`procedure: ${observation.procedure_id}`);
  output.push(`adapter: ${observation.adapter_id}`);
  output.push(`sandbox: ${observation.sandbox_mode}`);
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

function renderNextTaskDecisionLines(result: RuntimeNextTaskDecisionResult): string[] {
  const output = renderRunLines("codex-harness run record-next-task", result);
  output.push(`decision id: ${result.decision.decision_id}`);
  output.push(`recorded: ${result.recorded ? "true" : "false"}`);
  output.push(`artifact path: ${result.artifact.path}`);
  output.push(`artifact id: ${result.artifact.artifact_id}`);
  output.push(`evidence id: ${result.evidence.evidence_id}`);
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
    `state: ${result.state}`
  ];
  if (result.newRun) {
    output.push(`new run id: ${result.newRun.run_id}`);
  }
  if (result.newRunPath) {
    output.push(`new run path: ${result.newRunPath}`);
  }
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
  return 0;
}

async function runStatusCommand(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run"]), new Set(["dry-run", "operator"]));

  if (operatorOption(options)) {
    lines(
      renderOperatorLines(
        getRuntimeOperatorStatus(process.cwd(), {
          dryRun: dryRunOption(options),
          runId: stringOption(options, "run")
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
  const result = await verifyRuntimeRun(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run")
  });
  const output = renderRunLines("codex-harness run verify", result);
  output.push(`verification: ${result.verification.status}`);
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

async function runLaunchReview(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "procedure", "request", "output", "timeout-seconds", "stale-after-seconds"]));
  const procedureId = stringOption(options, "procedure");
  const requestPath = stringOption(options, "request");
  const outputPath = stringOption(options, "output");

  if (!procedureId) {
    throw new Error("--procedure is required.");
  }
  if (!requestPath) {
    throw new Error("--request is required.");
  }
  if (!outputPath) {
    throw new Error("--output is required.");
  }

  const result = await launchRuntimeReview(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    procedureId,
    requestPath,
    outputPath,
    timeoutSeconds: parsePositiveIntegerOption(options, "timeout-seconds"),
    staleAfterSeconds: parsePositiveIntegerOption(options, "stale-after-seconds")
  } satisfies LaunchReviewOptions);
  lines(renderReviewLaunchLines(result));
  return result.observation.status === "success" || result.observation.status === "dry_run" ? 0 : 1;
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

async function runRecordNextTask(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "task", "base-commit", "base-ref", "file"]));
  const taskPath = stringOption(options, "task");
  const baseCommit = stringOption(options, "base-commit");
  const filePath = stringOption(options, "file");

  if (!taskPath) {
    throw new Error("--task is required.");
  }
  if (!baseCommit) {
    throw new Error("--base-commit is required.");
  }
  if (!filePath) {
    throw new Error("--file is required.");
  }

  const result = await recordRuntimeNextTask(process.cwd(), {
    dryRun: dryRunOption(options),
    runId: stringOption(options, "run"),
    taskPath,
    baseCommit,
    baseRef: stringOption(options, "base-ref"),
    filePath
  } satisfies RecordNextTaskOptions);
  lines(renderNextTaskDecisionLines(result));
  return 0;
}

async function runMaterializeNextTask(args: string[]): Promise<number> {
  const options = parseOptions(
    args,
    new Set(["run", "decision-id", "task", "branch", "worktree"]),
    new Set(["dry-run", "create", "enter-existing"])
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
    enterExisting: options["enter-existing"] === true
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
      case "launch-review":
        return runLaunchReview(commandArgs);
      case "approve-plan":
        return runApprovePlan(commandArgs);
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
    const message = runError instanceof Error ? runError.message : String(runError);
    error(message);
    return 1;
  }
}
