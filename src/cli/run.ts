import * as path from "node:path";
import { error, lines } from "../core/logger";
import {
  type MarkDiscardableOptions,
  type RecordRemoteStatusOptions,
  type RemoteGateStatus,
  type RuntimeOperatorStatusResult,
  type RuntimeServiceResult,
  closeoutRuntimeRun,
  getRuntimeOperatorStatus,
  getRuntimeStatus,
  markRuntimeRunDiscardable,
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
    "  node bin/ch run mark-discardable --run <run-id> --reason <reason> [--dry-run]",
    "  node bin/ch run remote-status [--run <provider-run-id>] [--provider <provider>] [--gate <gate-id>] [--name <name>] [--status pass|failed|skipped|missing|unknown] [--required true|false] [--explanation <text>] [--dry-run]",
    "",
    "Commands:",
    "  start         Start a local runtime run for a task file.",
    "  status        Read the current runtime run or preview one in dry-run mode.",
    "  verify        Run current verification commands or record installed verifier output.",
    "  closeout      Create a structured closeout receipt for the current runtime run.",
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

async function runStart(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["task"]));
  const result = await startRuntimeRun(process.cwd(), {
    taskPath: stringOption(options, "task") ?? "TASK.md",
    dryRun: dryRunOption(options)
  });

  lines(renderRunLines("codex-harness run start", result));
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
