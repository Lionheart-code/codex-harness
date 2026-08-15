import * as fs from "node:fs";
import * as path from "node:path";
import { importDeliveryFacts } from "../core/delivery-facts";
import { getMemoryEvidenceStore } from "../core/evidence-store";
import { harvestRun } from "../core/harvest";
import { error, lines } from "../core/logger";
import { getMemoryStatus } from "../core/memory";
import { ProjectMemoryDatabase } from "../core/project-memory-db";
import {
  RunStagingDatabase,
  formatDatabasePath,
  resolveHarnessRoots,
  resolveMemoryDbPaths
} from "../core/run-staging-db";
import { getRuntimeStatus } from "../core/runtime";
import { buildAcceptedContextView, buildHistoricalEvidenceReport, buildImplementationReviewView } from "../core/evidence-views";
import { execFileSync } from "node:child_process";

type ParsedOptions = Record<string, string | boolean>;

function printMemoryHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory --help",
    "  node bin/ch memory init [--dry-run]",
    "  node bin/ch memory status",
    "  node bin/ch memory project --help",
    "  node bin/ch memory project status",
    "  node bin/ch memory run --help",
    "  node bin/ch memory run status --run <run-id>",
    "  node bin/ch memory harvest --help",
    "  node bin/ch memory harvest --run <run-id> [--dry-run]",
    "  node bin/ch memory replay-eligibility --run-instance <exact-run-instance-id> [--packet-record <sha256:id>]",
    "  node bin/ch memory report --run-instance <exact-run-instance-id>",
    "  node bin/ch memory packet context --run-instance <exact-run-instance-id> --packet-record <sha256:id>",
    "  node bin/ch memory packet implementation-review --run-instance <exact-run-instance-id>",
    "  node bin/ch memory delivery-facts --help",
    "  node bin/ch memory delivery-facts import --run <run-id> --file <path> [--dry-run]",
    "  node bin/ch memory rebuild [--dry-run]",
    "  node bin/ch memory runs --last N",
    "  node bin/ch memory show <run-id>",
    "  node bin/ch memory export --dry-run"
  ]);
}

function printReportHelp(): void {
  lines(["Usage:", "  node bin/ch memory report --run-instance <exact-run-instance-id>",
    "  node bin/ch memory report --run <unambiguous-accepted-display-run-id>"]);
}

function printPacketHelp(): void {
  lines(["Usage:", "  node bin/ch memory packet context --run-instance <exact-run-instance-id> --packet-record <sha256:id>",
    "  node bin/ch memory packet implementation-review --run-instance <exact-run-instance-id>"]);
}

function resolveAcceptedAuthority(options: ParsedOptions) {
  const roots = resolveHarnessRoots(process.cwd());
  const memory = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);
  const instance = stringOption(options, "run-instance");
  const display = stringOption(options, "run");
  if (Boolean(instance) === Boolean(display)) throw new Error("Specify exactly one of --run-instance or --run.");
  const run = instance ? memory.getRunByInstanceIdReadOnly(instance) : (() => {
    const matches = memory.listRunsByDisplayRunIdReadOnly(display!);
    if (matches.length !== 1) throw new Error(`Accepted display run id is ambiguous or missing: ${display}.`);
    return matches[0];
  })();
  if (!run) throw new Error("Accepted exact run instance not found.");
  return { run, memory };
}

function packetPayloadIds(run: { review_routing_records?: Array<{ record_id: string; payload: Record<string, unknown> }> }, packetRecordId: string): string[] {
  const packet = run.review_routing_records?.find((record) => record.record_id === packetRecordId);
  if (!packet || !Array.isArray(packet.payload.payload_ids)
    || packet.payload.payload_ids.some((entry) => typeof entry !== "string")) {
    throw new Error("Exact review packet payload inventory is unavailable.");
  }
  return packet.payload.payload_ids as string[];
}

function runReport(args: string[]): number {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") { printReportHelp(); return 0; }
  const options = parseOptions(args, new Set(["run-instance", "run"]));
  const { run, memory } = resolveAcceptedAuthority(options);
  lines([canonicalOutput(buildHistoricalEvidenceReport(run, {
    proofRecords: memory.listAcceptedProofRecordsReadOnly(run.run_instance_id!)
  }))]);
  return 0;
}

function canonicalOutput(value: unknown): string { return JSON.stringify(value, null, 2); }

function runPacket(args: string[]): number {
  const [kind, ...rest] = args;
  if (!kind || kind === "--help" || kind === "-h" || kind === "help") { printPacketHelp(); return 0; }
  if (kind === "context") {
    const options = parseOptions(rest, new Set(["run-instance", "run", "packet-record"]));
    const packet = stringOption(options, "packet-record");
    if (!packet) throw new Error("--packet-record is required.");
    const { run, memory } = resolveAcceptedAuthority(options);
    const payloads = memory.readPayloadBodiesReadOnly(run.run_instance_id!, packetPayloadIds(run, packet));
    lines([canonicalOutput(buildAcceptedContextView(run, packet, { payloads }))]);
    return 0;
  }
  if (kind === "implementation-review") {
    const options = parseOptions(rest, new Set(["run-instance"]));
    const instance = stringOption(options, "run-instance");
    if (!instance) throw new Error("--run-instance is required.");
    const roots = resolveHarnessRoots(process.cwd());
    const runIds = fs.existsSync(path.join(roots.targetRoot, ".harness", "runs"))
      ? fs.readdirSync(path.join(roots.targetRoot, ".harness", "runs"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
      : [];
    const matches = runIds.flatMap((runId) => {
      const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, runId);
      const candidate = staging.loadRunReadOnly();
      return candidate?.run_instance_id === instance ? [{ run: candidate, staging }] : [];
    });
    if (matches.length !== 1) throw new Error("Active exact run instance is ambiguous or missing in Staging.");
    const { run, staging } = matches[0];
    const candidateHead = execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: roots.targetRoot, encoding: "utf8"
    }).trim();
    const packet = [...(run.review_routing_records ?? [])].reverse().find((record) =>
      record.record_kind === "review_replay_packet"
      && ["implementation-review", "fix-pass-review"].includes(String(record.payload.procedure_id ?? "")));
    if (!packet) throw new Error("Exact implementation review packet is unavailable in active Staging.");
    const payloads = staging.readPayloadBodiesReadOnly(packetPayloadIds(run, packet.record_id));
    lines([canonicalOutput(buildImplementationReviewView(run, candidateHead, {
      packetRecordId: packet.record_id,
      payloads,
      proofRecords: staging.listIndependentRecordsReadOnly("proof_record", run.run_id)
    }))]);
    return 0;
  }
  throw new Error(`Unknown memory packet kind: ${kind}`);
}

function printProjectHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory project --help",
    "  node bin/ch memory project status"
  ]);
}

function printRunHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory run --help",
    "  node bin/ch memory run status --run <run-id>"
  ]);
}

function printHarvestHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory harvest --help",
    "  node bin/ch memory harvest --run <run-id> [--dry-run]"
  ]);
}

function printDeliveryFactsHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory delivery-facts --help",
    "  node bin/ch memory delivery-facts import --run <run-id> --file <path> [--dry-run]"
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

function requireRunId(options: ParsedOptions): string {
  const runId = stringOption(options, "run");
  if (!runId) {
    throw new Error("--run is required.");
  }

  return runId;
}

function buildDatabasePolicyLines(status: {
  sizeWarningThresholdBytes: number;
  payloadWarningThresholdBytes: number;
  oversizedPayloadCount: number;
  redactedPayloadCount: number;
  quarantinedPayloadCount: number;
  discardedPayloadCount: number;
  warnings: string[];
}): string[] {
  return [
    `db size warning threshold: ${status.sizeWarningThresholdBytes}`,
    `payload warning threshold: ${status.payloadWarningThresholdBytes}`,
    `payload policy: oversized=${status.oversizedPayloadCount} | redacted=${status.redactedPayloadCount} | quarantine=${status.quarantinedPayloadCount} | discarded=${status.discardedPayloadCount}`,
    ...(status.warnings.length > 0 ? ["warnings:", ...status.warnings.map((warning) => `- ${warning}`)] : [])
  ];
}

async function runStatus(): Promise<number> {
  const roots = resolveHarnessRoots(process.cwd());
  const projectDb = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);
  const projectStatus = projectDb.status();
  const store = getMemoryEvidenceStore(process.cwd());
  const evidenceStatus = await store.status();
  const output = [
    "codex-harness memory status",
    `target root: ${roots.targetRoot}`,
    `project root: ${roots.projectRoot}`,
    `project db: ${formatDatabasePath(roots.projectRoot, projectStatus.path)}`,
    `project db exists: ${projectStatus.exists ? "true" : "false"}`,
    `project db journal: ${projectStatus.journalMode}`,
    `project db integrity: ${projectStatus.integrity}`,
    ...buildDatabasePolicyLines(projectStatus)
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
    `audit ledger: ${path.relative(evidenceStatus.targetRoot, evidenceStatus.ledgerPath)}`,
    `audit projection: ${path.relative(evidenceStatus.targetRoot, evidenceStatus.projectionPath)}`,
    `artifact root: ${path.relative(evidenceStatus.targetRoot, evidenceStatus.artifactRoot)}`,
    `audit events: ${evidenceStatus.eventCount}`,
    `audit ledger exists: ${evidenceStatus.ledgerExists ? "true" : "false"}`,
    `audit projection exists: ${evidenceStatus.projectionExists ? "true" : "false"}`,
    `sqlite adapter: ${evidenceStatus.projection.available ? "available" : "unavailable"} (${evidenceStatus.projection.message})`
  );

  try {
    const runtime = getRuntimeStatus(process.cwd(), {});
    output.push(
      `current run: ${runtime.run.run_id}`,
      `current staging db: ${runtime.stagingDbPath ? path.relative(runtime.targetRoot, runtime.stagingDbPath) : "(unavailable)"}`,
      `current lifecycle: ${runtime.run.lifecycle_status}`
    );
  } catch {
    output.push("current run: unavailable");
  }

  lines(output);
  return 0;
}

async function runInit(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set());
  const dryRun = dryRunOption(options);
  const roots = resolveHarnessRoots(process.cwd());
  const paths = resolveMemoryDbPaths(roots.targetRoot, roots.projectRoot);
  const store = getMemoryEvidenceStore(process.cwd());
  const projectDb = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);

  if (!dryRun) {
    fs.mkdirSync(paths.exportsRoot, { recursive: true });
    projectDb.ensureInitialized();
    await store.init(false);
  }

  lines([
    `codex-harness memory init${dryRun ? " (dry-run)" : ""}`,
    `target root: ${roots.targetRoot}`,
    `project root: ${roots.projectRoot}`,
    `project db: ${formatDatabasePath(roots.projectRoot, paths.projectDbPath)}`,
    `exports root: ${formatDatabasePath(roots.projectRoot, paths.exportsRoot)}`,
    `audit ledger: ${path.relative(roots.targetRoot, path.join(roots.targetRoot, ".harness", "evidence", "events.jsonl"))}`,
    `audit projection: ${path.relative(roots.targetRoot, path.join(roots.targetRoot, ".harness", "evidence", "projection.sqlite"))}`,
    ...(dryRun ? ["dry-run: no files were written"] : ["status: initialized"])
  ]);
  return 0;
}

async function runProjectStatus(): Promise<number> {
  const roots = resolveHarnessRoots(process.cwd());
  const projectDb = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);
  const status = projectDb.status();
  lines([
    "codex-harness memory project status",
    `target root: ${roots.targetRoot}`,
    `project root: ${roots.projectRoot}`,
    `project db: ${formatDatabasePath(roots.projectRoot, status.path)}`,
    `exists: ${status.exists ? "true" : "false"}`,
    `size bytes: ${status.sizeBytes}`,
    `journal mode: ${status.journalMode}`,
    `integrity: ${status.integrity}`,
    ...buildDatabasePolicyLines(status)
  ]);
  return 0;
}

async function runStagingStatus(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run"]));
  const runId = requireRunId(options);
  const roots = resolveHarnessRoots(process.cwd());
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, runId);
  const status = staging.status();
  const run = staging.loadRun(runId);
  lines([
    "codex-harness memory run status",
    `target root: ${roots.targetRoot}`,
    `project root: ${roots.projectRoot}`,
    `run id: ${runId}`,
    `staging db: ${formatDatabasePath(roots.targetRoot, status.path)}`,
    `exists: ${status.exists ? "true" : "false"}`,
    `size bytes: ${status.sizeBytes}`,
    `journal mode: ${status.journalMode}`,
    `integrity: ${status.integrity}`,
    `lifecycle status: ${run?.lifecycle_status ?? "(missing)"}`,
    `run mode: ${run?.run_mode ?? "(missing)"}`,
    `delivery facts: ${run?.delivery_facts.length ?? 0}`,
    ...buildDatabasePolicyLines(status)
  ]);
  return 0;
}

async function runHarvest(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run"]));
  const runId = requireRunId(options);
  const dryRun = dryRunOption(options);
  const roots = resolveHarnessRoots(process.cwd());

  if (dryRun) {
    const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, runId);
    const run = staging.loadRun(runId);

    if (!run) {
      throw new Error(`Run not found in staging DB: ${runId}`);
    }

    lines([
      "codex-harness memory harvest (dry-run)",
      `target root: ${roots.targetRoot}`,
      `project root: ${roots.projectRoot}`,
      `run id: ${runId}`,
      `lifecycle status: ${run.lifecycle_status}`,
      `project db: ${path.relative(roots.projectRoot, resolveMemoryDbPaths(roots.targetRoot, roots.projectRoot, runId).projectDbPath)}`,
      `staging db: ${path.relative(roots.targetRoot, resolveMemoryDbPaths(roots.targetRoot, roots.projectRoot, runId).stagingDbPath ?? "")}`,
      "dry-run: no files were written"
    ]);
    return 0;
  }

  const result = harvestRun(roots.targetRoot, roots.projectRoot, runId);
  lines([
    "codex-harness memory harvest",
    `target root: ${roots.targetRoot}`,
    `project root: ${roots.projectRoot}`,
    `run id: ${runId}`,
    `already harvested: ${result.alreadyHarvested ? "true" : "false"}`,
    `harvest status: ${result.harvest.status}`,
    `accepted count: ${result.harvest.accepted_count}`,
    `discarded count: ${result.harvest.discarded_count}`,
    `quarantined count: ${result.harvest.quarantined_count}`,
    `redacted count: ${result.harvest.redacted_count}`,
    `unresolved count: ${result.harvest.unresolved_count}`,
    `delivery facts: ${result.run.delivery_facts.length}`,
    `procedure artifact transfer count: ${result.harvest.details.procedure_artifact_transfer_count ?? "unknown (legacy receipt)"}`,
    `procedure artifact payload transfer count: ${result.harvest.details.procedure_artifact_payload_transfer_count ?? "unknown (legacy receipt)"}`,
    `procedure artifact payload chunk transfer count: ${result.harvest.details.procedure_artifact_payload_chunk_transfer_count ?? "unknown (legacy receipt)"}`,
    `procedure artifact payload byte count: ${result.harvest.details.procedure_artifact_payload_byte_count ?? "unknown (legacy receipt)"}`
  ]);
  return 0;
}

async function runDeliveryFactsImport(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run", "file"]));
  const runId = requireRunId(options);
  const filePath = stringOption(options, "file");
  if (!filePath) {
    throw new Error("--file is required.");
  }

  const result = importDeliveryFacts(process.cwd(), runId, filePath, dryRunOption(options));
  lines([
    `codex-harness memory delivery-facts import${dryRunOption(options) ? " (dry-run)" : ""}`,
    `run id: ${runId}`,
    `file: ${filePath}`,
    `imported facts: ${result.imported.length}`,
    `run lifecycle: ${result.run.lifecycle_status}`,
    ...(dryRunOption(options) ? ["dry-run: no files were written"] : [])
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

  output.push("status: audit projection is rebuildable");
  lines(output);
  return 0;
}

async function runReplayEligibility(args: string[]): Promise<number> {
  const options = parseOptions(args, new Set(["run-instance", "packet-record"]));
  const runInstanceId = stringOption(options, "run-instance");
  if (!runInstanceId) throw new Error("--run-instance is required.");
  const roots = resolveHarnessRoots(process.cwd());
  const result = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot).reviewReplayEligibility(
    runInstanceId,
    stringOption(options, "packet-record")
  );
  lines([
    "codex-harness memory replay-eligibility",
    `run instance: ${result.run_instance_id}`,
    `eligible: ${result.eligible ? "true" : "false"}`,
    `source status: ${result.source_status}`,
    `packet record: ${result.packet_record_id ?? "missing"}`,
    `approved attempt: ${result.approved_attempt_id ?? "missing"}`,
    `accepted artifact: ${result.accepted_artifact_id ?? "missing"}`,
    `accepted result: ${result.accepted_result_id ?? "missing"}`,
    `payload count: ${result.payload_count}`,
    `reconstructed payload count: ${result.reconstructed_payload_count}`,
    `reasons: ${JSON.stringify(result.reasons)}`
  ]);
  return result.eligible ? 0 : 1;
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
    throw new Error("Phase 23.5 only supports `node bin/ch memory export --dry-run`.");
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

async function runProject(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printProjectHelp();
    return 0;
  }

  if (subcommand !== "status" || subcommandArgs.length > 0) {
    throw new Error(`Unknown memory project subcommand: ${[subcommand, ...subcommandArgs].join(" ")}`);
  }

  return runProjectStatus();
}

async function runStaging(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printRunHelp();
    return 0;
  }

  if (subcommand !== "status") {
    throw new Error(`Unknown memory run subcommand: ${subcommand}`);
  }

  return runStagingStatus(subcommandArgs);
}

async function runDeliveryFacts(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printDeliveryFactsHelp();
    return 0;
  }

  if (subcommand !== "import") {
    throw new Error(`Unknown memory delivery-facts subcommand: ${subcommand}`);
  }

  return runDeliveryFactsImport(subcommandArgs);
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
      case "project":
        return await runProject(subcommandArgs);
      case "run":
        return await runStaging(subcommandArgs);
      case "harvest":
        if (subcommandArgs[0] === "--help" || subcommandArgs[0] === "-h" || subcommandArgs[0] === "help") {
          printHarvestHelp();
          return 0;
        }
        return await runHarvest(subcommandArgs);
      case "replay-eligibility":
        return await runReplayEligibility(subcommandArgs);
      case "report":
        return runReport(subcommandArgs);
      case "packet":
        return runPacket(subcommandArgs);
      case "delivery-facts":
        return await runDeliveryFacts(subcommandArgs);
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
