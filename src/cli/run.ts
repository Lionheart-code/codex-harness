import * as path from "node:path";
import { error, lines } from "../core/logger";
import {
  type RecordRemoteStatusOptions,
  type RemoteGateStatus,
  closeoutRuntimeRun,
  getRuntimeStatus,
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
    "  node bin/ch run status [--dry-run]",
    "  node bin/ch run verify [--dry-run]",
    "  node bin/ch run closeout [--dry-run]",
    "  node bin/ch run remote-status [--provider <provider>] [--run <run-id>] [--gate <gate-id>] [--name <name>] [--status pass|failed|skipped|missing|unknown] [--required true|false] [--explanation <text>] [--dry-run]",
    "",
    "Commands:",
    "  start         Start a local runtime run for a task file.",
    "  status        Read the current runtime run or preview one in dry-run mode.",
    "  verify        Record the current verifier artifact as a runtime verification result.",
    "  closeout      Create a structured closeout receipt for the current runtime run.",
    "  remote-status Record provider-neutral remote gate status for the current run."
  ]);
}

function parseOptions(args: string[], valueFlags: Set<string>): ParsedOptions {
  const parsed: ParsedOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const name = arg.slice(2);

    if (name === "dry-run") {
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

function renderRunLines(title: string, result: ReturnType<typeof startRuntimeRun>): string[] {
  const run = result.run;
  const output = [
    title,
    `target root: ${result.targetRoot}`,
    `run id: ${run.run_id}`,
    `task path: ${run.task_path}`,
    `active task path: ${run.active_task_path ?? "(none)"}`,
    `phase: ${run.phase_id ?? "(unknown)"}`,
    `status: ${run.status}`,
    `state: ${result.state}`,
    `state path: ${result.runPath ? path.relative(result.targetRoot, result.runPath) : "(dry-run preview)"}`
  ];

  if (result.dryRun) {
    output.push("dry-run: no files were written");
  }

  return output;
}

async function runStart(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["task"]));
  const result = startRuntimeRun(process.cwd(), {
    taskPath: stringOption(options, "task") ?? "TASK.md",
    dryRun: dryRunOption(options)
  });

  lines(renderRunLines("codex-harness run start", result));
  return 0;
}

async function runStatusCommand(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());
  const result = getRuntimeStatus(process.cwd(), {
    dryRun: dryRunOption(options)
  });
  const output = renderRunLines("codex-harness run status", result);
  output.push(`steps: ${result.run.steps.length}`);
  output.push(`verification results: ${result.run.verification_results.length}`);
  output.push(`review results: ${result.run.review_results.length}`);
  output.push(`remote checks: ${result.run.remote_checks.length}`);
  lines(output);
  return 0;
}

async function runVerify(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());
  const result = verifyRuntimeRun(process.cwd(), {
    dryRun: dryRunOption(options)
  });
  const output = renderRunLines("codex-harness run verify", result);
  output.push(`verification: ${result.verification.status}`);
  output.push(`summary: ${result.verification.summary}`);
  lines(output);
  return 0;
}

async function runCloseout(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());
  const result = closeoutRuntimeRun(process.cwd(), {
    dryRun: dryRunOption(options)
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
  const result = recordRuntimeRemoteStatus(process.cwd(), remoteOptions);
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
