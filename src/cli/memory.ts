import * as path from "node:path";
import { error, lines } from "../core/logger";
import { getMemoryEvidenceStore } from "../core/evidence-store";
import { getMemoryStatus } from "../core/memory";

type ParsedOptions = Record<string, string | boolean>;

function printMemoryHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory --help",
    "  node bin/ch memory init [--dry-run]",
    "  node bin/ch memory status",
    "  node bin/ch memory rebuild [--dry-run]",
    "  node bin/ch memory runs --last N",
    "  node bin/ch memory show <run-id>",
    "  node bin/ch memory export --dry-run"
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

function dryRunOption(options: ParsedOptions): boolean {
  return options["dry-run"] === true;
}

function stringOption(options: ParsedOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
}

async function runStatus(): Promise<number> {
  try {
    const store = getMemoryEvidenceStore(process.cwd());
    const evidenceStatus = await store.status();
    const output = [
      "codex-harness memory status",
      `target root: ${evidenceStatus.targetRoot}`
    ];

    try {
      const result = getMemoryStatus(process.cwd());
      const warningLines =
        result.warnings.length > 0
          ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
          : [];

      output.push(
        `memory root: ${result.memoryRoot}`,
        `debt: open=${result.debtCounts.open} | in_progress=${result.debtCounts.in_progress} | resolved=${result.debtCounts.resolved} | accepted=${result.debtCounts.accepted} | obsolete=${result.debtCounts.obsolete}`,
        `decisions: active=${result.decisionCounts.active} | superseded=${result.decisionCounts.superseded} | rejected=${result.decisionCounts.rejected}`,
        `agent outputs: raw=${result.agentCounts.raw} | accepted=${result.agentCounts.accepted} | stale=${result.agentCounts.stale} | rejected=${result.agentCounts.rejected}`,
        `project index: ${path.relative(result.targetRoot, result.projectIndexPath)}`,
        `debt markdown: ${path.relative(result.targetRoot, result.debtMarkdownPath)}`,
        ...warningLines
      );
    } catch (phase9Error) {
      const message = phase9Error instanceof Error ? phase9Error.message : String(phase9Error);
      output.push(`phase9 memory: unavailable (${message})`);
    }

    output.push(
      `evidence ledger: ${path.relative(evidenceStatus.targetRoot, evidenceStatus.ledgerPath)}`,
      `projection: ${path.relative(evidenceStatus.targetRoot, evidenceStatus.projectionPath)}`,
      `artifact root: ${path.relative(evidenceStatus.targetRoot, evidenceStatus.artifactRoot)}`,
      `namespace: ${evidenceStatus.namespace}`,
      `target project id: ${evidenceStatus.targetProjectId}`,
      `events: ${evidenceStatus.eventCount}`,
      `ledger exists: ${evidenceStatus.ledgerExists ? "true" : "false"}`,
      `projection exists: ${evidenceStatus.projectionExists ? "true" : "false"}`,
      `artifact root exists: ${evidenceStatus.artifactRootExists ? "true" : "false"}`,
      `sqlite adapter: ${evidenceStatus.projection.available ? "available" : "unavailable"} (${evidenceStatus.projection.message})`
    );

    lines(output);

    return 0;
  } catch (memoryError) {
    const message = memoryError instanceof Error ? memoryError.message : String(memoryError);
    error(message);
    return 1;
  }
}

async function runInit(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());
  const dryRun = dryRunOption(options);
  const store = getMemoryEvidenceStore(process.cwd());
  const result = await store.init(dryRun);

  lines([
    `codex-harness memory init${dryRun ? " (dry-run)" : ""}`,
    `target root: ${result.targetRoot}`,
    `evidence ledger: ${path.relative(result.targetRoot, result.status.ledgerPath)}`,
    `projection: ${path.relative(result.targetRoot, result.status.projectionPath)}`,
    `artifact root: ${path.relative(result.targetRoot, result.status.artifactRoot)}`,
    `sqlite adapter: ${result.status.projection.available ? "available" : "unavailable"} (${result.status.projection.message})`,
    ...(dryRun ? ["dry-run: no files were written"] : ["status: initialized"])
  ]);
  return 0;
}

async function runRebuild(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());
  const dryRun = dryRunOption(options);
  const store = getMemoryEvidenceStore(process.cwd());
  const result = await store.rebuild(dryRun);
  const output = [
    `codex-harness memory rebuild${dryRun ? " (dry-run)" : ""}`,
    `target root: ${result.targetRoot}`,
    `events: ${result.eventCount}`,
    `sqlite adapter: ${result.projectionAvailable.available ? "available" : "unavailable"} (${result.projectionAvailable.message})`
  ];

  if (dryRun) {
    output.push("dry-run: no files were written");
  }

  if (result.errors.length > 0) {
    output.push("status: blocked");
    output.push(...result.errors.map((entry) => `- ${entry}`));
    lines(output);
    return 1;
  }

  output.push("status: projection is rebuildable");
  lines(output);
  return 0;
}

async function runRuns(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["last"]));
  const last = Number.parseInt(stringOption(options, "last") ?? "10", 10);

  if (!Number.isInteger(last) || last < 1) {
    throw new Error("--last must be a positive integer.");
  }

  const store = getMemoryEvidenceStore(process.cwd());
  const runs = await store.runs(last);
  const output = ["codex-harness memory runs", `target root: ${store.targetRoot}`, `count: ${runs.length}`];

  output.push(
    ...runs.map(
      (run) =>
        `- ${run.run_id} | namespace=${run.namespace} | events=${run.evidence_count} | last=${run.last_event_at} | task=${run.task_path ?? "(none)"}`
    )
  );
  lines(output);
  return 0;
}

async function runShow(args: string[]): Promise<number> {
  if (args.length !== 1 || args[0].startsWith("--")) {
    throw new Error("Usage: node bin/ch memory show <run-id>");
  }

  const runId = args[0];
  const store = getMemoryEvidenceStore(process.cwd());
  const timeline = await store.show(runId);
  const output = ["codex-harness memory show", `target root: ${store.targetRoot}`, `run id: ${runId}`, `events: ${timeline.length}`];

  output.push(
    ...timeline.map(
      (entry) => `- ${entry.sequence} | ${entry.evidence_type} | ${entry.produced_at} | ${entry.summary}`
    )
  );
  lines(output);
  return 0;
}

async function runExport(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());

  if (!dryRunOption(options)) {
    throw new Error("Phase 23 only supports `node bin/ch memory export --dry-run`.");
  }

  const store = getMemoryEvidenceStore(process.cwd());
  const result = store.exportDryRun();

  lines([
    "codex-harness memory export (dry-run)",
    `target root: ${result.targetRoot}`,
    `evidence ledger: ${path.relative(result.targetRoot, result.ledgerPath)}`,
    `projection: ${path.relative(result.targetRoot, result.projectionPath)}`,
    `artifact root: ${path.relative(result.targetRoot, result.artifactRoot)}`,
    `events: ${result.eventCount}`,
    `exportable artifacts: ${result.exportableArtifacts}`,
    "dry-run: no files were written"
  ]);
  return 0;
}

export async function runMemory(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printMemoryHelp();
    return 0;
  }

  try {
    switch (subcommand) {
      case "init":
        return await runInit(subcommandArgs);
      case "status":
        if (subcommandArgs.length > 0) {
          throw new Error(`Unknown memory status argument(s): ${subcommandArgs.join(", ")}`);
        }
        return await runStatus();
      case "rebuild":
        return await runRebuild(subcommandArgs);
      case "runs":
        return await runRuns(subcommandArgs);
      case "show":
        return await runShow(subcommandArgs);
      case "export":
        return await runExport(subcommandArgs);
      default:
        error(`Unknown memory subcommand: ${subcommand}`);
        printMemoryHelp();
        return 1;
    }
  } catch (memoryError) {
    const message = memoryError instanceof Error ? memoryError.message : String(memoryError);
    error(message);
    return 1;
  }
}
