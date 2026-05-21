import * as fs from "node:fs";
import * as path from "node:path";
import { detectGitRepository } from "./git";
import {
  ARTIFACTS_DIR,
  EVIDENCE_LEDGER_PATH,
  EVIDENCE_PROJECTION_PATH,
  HARNESS_DIR,
  SHA256_ARTIFACTS_DIR
} from "./paths";
import { ArtifactStore } from "./artifact-store";
import { EvidenceLedger, type AppendEvidenceEventInput } from "./evidence-ledger";
import { ProjectionStore } from "./evidence-projection";
import { NodeSqliteProjectionAdapter, probeNodeSqliteProjection } from "./sqlite-projection-adapter";
import {
  DEFAULT_EVIDENCE_NAMESPACE,
  type EvidenceEventEnvelope,
  type EvidenceRunSummary,
  type EvidenceScope,
  type EvidenceTimelineEntry,
  type MemoryEvidenceStatus,
  type ProjectionAvailability,
  buildTargetProjectId,
  toPortablePath
} from "./evidence-types";

export interface MemoryStoreOptions {
  namespace?: string;
}

export interface MemoryStoreInitResult {
  targetRoot: string;
  dryRun: boolean;
  status: MemoryEvidenceStatus;
}

export interface MemoryStoreRebuildResult {
  targetRoot: string;
  dryRun: boolean;
  eventCount: number;
  projectionAvailable: ProjectionAvailability;
  errors: string[];
}

export interface MemoryStoreExportDryRunResult {
  targetRoot: string;
  ledgerPath: string;
  projectionPath: string;
  artifactRoot: string;
  eventCount: number;
  exportableArtifacts: number;
}

export interface MemoryStoreAppendResult {
  event: EvidenceEventEnvelope;
  projectionApplied: boolean;
  projectionMessage: string;
}

interface CurrentRunPointer {
  run_id?: string;
  run_path?: string;
}

interface CurrentRunSummary {
  run_id?: string;
  phase_id?: string;
  task_path?: string;
  active_task_path?: string;
}

function nowIso(): string {
  return new Date().toISOString();
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

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function readCurrentRunSummary(targetRoot: string): CurrentRunSummary {
  const pointerPath = path.join(targetRoot, HARNESS_DIR, "runs", "current.json");

  if (!fs.existsSync(pointerPath) || !fs.statSync(pointerPath).isFile()) {
    return {};
  }

  try {
    const pointer = readJsonFile(pointerPath) as CurrentRunPointer;
    if (!pointer.run_path) {
      return {};
    }

    const runPath = path.resolve(path.join(targetRoot, HARNESS_DIR, "runs"), pointer.run_path);
    const relative = path.relative(path.join(targetRoot, HARNESS_DIR, "runs"), runPath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return {};
    }

    if (!fs.existsSync(runPath) || !fs.statSync(runPath).isFile()) {
      return {};
    }

    const run = readJsonFile(runPath) as CurrentRunSummary;
    return {
      run_id: typeof run.run_id === "string" ? run.run_id : pointer.run_id,
      phase_id: typeof run.phase_id === "string" ? run.phase_id : undefined,
      task_path: typeof run.active_task_path === "string" ? run.active_task_path : run.task_path,
      active_task_path: typeof run.active_task_path === "string" ? run.active_task_path : undefined
    };
  } catch {
    return {};
  }
}

function taskIdFromTaskPath(taskPath: string | undefined): string | undefined {
  if (!taskPath) {
    return undefined;
  }

  return path.basename(taskPath).replace(/\.[^.]+$/, "");
}

export function buildDefaultEvidenceScope(targetRoot: string, options: MemoryStoreOptions = {}): EvidenceScope {
  const currentRun = readCurrentRunSummary(targetRoot);
  const taskPath = currentRun.active_task_path ?? currentRun.task_path;

  return {
    target_project_id: buildTargetProjectId(targetRoot),
    target_root: targetRoot,
    namespace: options.namespace ?? DEFAULT_EVIDENCE_NAMESPACE,
    ...(currentRun.run_id ? { run_id: currentRun.run_id } : {}),
    ...(currentRun.phase_id ? { phase_id: currentRun.phase_id } : {}),
    ...(taskPath ? { task_path: toPortablePath(taskPath) } : {}),
    ...(taskIdFromTaskPath(taskPath) ? { task_id: taskIdFromTaskPath(taskPath) } : {})
  };
}

export class MemoryEvidenceStore {
  readonly targetRoot: string;
  readonly namespace: string;
  readonly ledger: EvidenceLedger;
  readonly artifacts: ArtifactStore;
  readonly projection: ProjectionStore;

  constructor(targetRoot: string, options: MemoryStoreOptions = {}) {
    this.targetRoot = targetRoot;
    this.namespace = options.namespace ?? DEFAULT_EVIDENCE_NAMESPACE;
    this.ledger = new EvidenceLedger(targetRoot);
    this.artifacts = new ArtifactStore(targetRoot);
    this.projection = new ProjectionStore(new NodeSqliteProjectionAdapter(targetRoot));
  }

  scope(): EvidenceScope {
    return buildDefaultEvidenceScope(this.targetRoot, { namespace: this.namespace });
  }

  async status(): Promise<MemoryEvidenceStatus> {
    const projection = await probeNodeSqliteProjection();
    const ledgerExists = this.ledger.exists();
    let eventCount = 0;

    if (ledgerExists) {
      eventCount = this.ledger.count();
    }

    return {
      targetRoot: this.targetRoot,
      ledgerPath: path.join(this.targetRoot, EVIDENCE_LEDGER_PATH),
      projectionPath: path.join(this.targetRoot, EVIDENCE_PROJECTION_PATH),
      artifactRoot: path.join(this.targetRoot, SHA256_ARTIFACTS_DIR),
      namespace: this.namespace,
      targetProjectId: buildTargetProjectId(this.targetRoot),
      ledgerExists,
      projectionExists: fs.existsSync(path.join(this.targetRoot, EVIDENCE_PROJECTION_PATH)),
      artifactRootExists: fs.existsSync(path.join(this.targetRoot, SHA256_ARTIFACTS_DIR)),
      eventCount,
      projection
    };
  }

  async init(dryRun: boolean): Promise<MemoryStoreInitResult> {
    if (!dryRun) {
      const shouldWriteInitEvent = !this.ledger.exists() || this.ledger.count() === 0;
      this.ledger.initialize();
      fs.mkdirSync(path.join(this.targetRoot, ARTIFACTS_DIR), { recursive: true });
      fs.mkdirSync(path.join(this.targetRoot, SHA256_ARTIFACTS_DIR), { recursive: true });
      await this.projection.init();

      if (shouldWriteInitEvent) {
        this.ledger.append({
          evidenceType: "schema_metadata",
          scope: this.scope(),
          producerCommand: "node bin/ch memory init",
          provenance: {
            producer: { type: "command", command: "node bin/ch memory init" },
            produced_at: nowIso(),
            reusable: false,
            stale: false,
            sensitivity: "local",
            redaction_status: "not_applicable",
            exportable: false,
            artifact_refs: []
          },
          payload: {
            summary: "Initialized local Memory/Evidence storage.",
            ledger_path: EVIDENCE_LEDGER_PATH,
            projection_path: EVIDENCE_PROJECTION_PATH,
            artifact_root: SHA256_ARTIFACTS_DIR
          }
        });
      }
      await this.projection.rebuild(this.ledger.readAll());
    } else {
      await this.projection.probe();
    }

    return {
      targetRoot: this.targetRoot,
      dryRun,
      status: await this.status()
    };
  }

  async append<TPayload extends Record<string, unknown>>(
    input: AppendEvidenceEventInput<TPayload>
  ): Promise<MemoryStoreAppendResult> {
    const event = this.ledger.append(input);
    const probe = await this.projection.probe();

    if (!probe.available) {
      return {
        event,
        projectionApplied: false,
        projectionMessage: probe.message
      };
    }

    await this.projection.applyEvent(event);
    return {
      event,
      projectionApplied: true,
      projectionMessage: "projection updated"
    };
  }

  async rebuild(dryRun: boolean): Promise<MemoryStoreRebuildResult> {
    const ledgerValidation = this.ledger.validate();
    const projectionAvailable = await this.projection.probe();
    const errors = [...ledgerValidation.errors];

    if (!projectionAvailable.available) {
      errors.push(projectionAvailable.message);
    }

    if (!dryRun && errors.length === 0) {
      await this.projection.rebuild(this.ledger.readAll());
      const projectionValidation = await this.projection.validate(this.ledger.readAll());
      errors.push(...projectionValidation.errors);
    }

    return {
      targetRoot: this.targetRoot,
      dryRun,
      eventCount: ledgerValidation.eventCount,
      projectionAvailable,
      errors
    };
  }

  async runs(last: number): Promise<EvidenceRunSummary[]> {
    return this.projection.queryRuns(
      {
        target_project_id: buildTargetProjectId(this.targetRoot),
        target_root: this.targetRoot,
        namespace: this.namespace
      },
      last
    );
  }

  async show(runId: string): Promise<EvidenceTimelineEntry[]> {
    return this.projection.queryTimeline(
      {
        target_project_id: buildTargetProjectId(this.targetRoot),
        target_root: this.targetRoot,
        namespace: this.namespace
      },
      runId
    );
  }

  exportDryRun(): MemoryStoreExportDryRunResult {
    const events = this.ledger.exists() ? this.ledger.readAll() : [];
    const exportableArtifacts = events
      .flatMap((event) => event.provenance.artifact_refs)
      .filter((artifact) => artifact.exportable).length;

    return {
      targetRoot: this.targetRoot,
      ledgerPath: path.join(this.targetRoot, EVIDENCE_LEDGER_PATH),
      projectionPath: path.join(this.targetRoot, EVIDENCE_PROJECTION_PATH),
      artifactRoot: path.join(this.targetRoot, SHA256_ARTIFACTS_DIR),
      eventCount: events.length,
      exportableArtifacts
    };
  }
}

export function getMemoryEvidenceStore(cwd: string, options: MemoryStoreOptions = {}): MemoryEvidenceStore {
  return new MemoryEvidenceStore(requireGitTargetRoot(cwd), options);
}
