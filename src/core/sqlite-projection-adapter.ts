import * as fs from "node:fs";
import * as path from "node:path";
import {
  EVIDENCE_LEDGER_PATH,
  EVIDENCE_PROJECTION_PATH
} from "./paths";
import {
  CURRENT_PROJECTION_SCHEMA_VERSION,
  type EvidenceEventEnvelope,
  type EvidenceRunSummary,
  type EvidenceScope,
  type EvidenceTimelineEntry,
  type ProjectionAvailability,
  type VerifiedSnapshot,
  canonicalJson
} from "./evidence-types";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata } from "./schema-migrations";
import { type ProjectionAdapter, type ProjectionValidationResult } from "./evidence-projection";

interface StatementLike {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
}

interface SqliteModuleLike {
  DatabaseSync?: new (database: string) => DatabaseLike;
}

interface EventRow {
  event_id: string;
  event_sequence: number;
  evidence_type: string;
  produced_at: string;
  target_project_id: string;
  target_root: string;
  namespace: string;
  run_id: string | null;
  phase_id: string | null;
  task_path: string | null;
  summary: string;
  event_json: string;
}

const SQLITE_SPECIFIER = "node:sqlite";

async function loadNodeSqlite(): Promise<SqliteModuleLike> {
  return (await import(SQLITE_SPECIFIER)) as SqliteModuleLike;
}

function projectionUnavailable(error: unknown): ProjectionAvailability {
  const message = error instanceof Error ? error.message : String(error);
  return {
    available: false,
    adapter: "node:sqlite",
    message: `node:sqlite is unavailable or unsupported in this Node runtime: ${message}`
  };
}

function requiredString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function summarizeEvent(event: EvidenceEventEnvelope): string {
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.summary === "string" && payload.summary.trim().length > 0) {
    return payload.summary;
  }

  if (typeof payload.status === "string") {
    return `${event.evidence_type}: ${payload.status}`;
  }

  if (typeof payload.run_id === "string") {
    return `${event.evidence_type}: ${payload.run_id}`;
  }

  return event.evidence_type;
}

function isVerifiedSnapshotEvent(event: EvidenceEventEnvelope): boolean {
  return event.evidence_type === "verified_snapshot";
}

function getVerifiedSnapshot(event: EvidenceEventEnvelope): VerifiedSnapshot | undefined {
  if (!isVerifiedSnapshotEvent(event)) {
    return undefined;
  }

  const snapshot = event.payload as unknown as VerifiedSnapshot;
  if (typeof snapshot.snapshot_id !== "string" || typeof snapshot.fingerprint?.fingerprint_id !== "string") {
    return undefined;
  }

  return snapshot;
}

function buildWhere(scope: Partial<EvidenceScope>, params: unknown[]): string {
  const clauses: string[] = [];

  if (scope.target_project_id) {
    clauses.push("target_project_id = ?");
    params.push(scope.target_project_id);
  }

  if (scope.target_root) {
    clauses.push("target_root = ?");
    params.push(scope.target_root);
  }

  if (scope.namespace) {
    clauses.push("namespace = ?");
    params.push(scope.namespace);
  }

  if (scope.run_id) {
    clauses.push("run_id = ?");
    params.push(scope.run_id);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

export async function probeNodeSqliteProjection(): Promise<ProjectionAvailability> {
  try {
    const sqlite = await loadNodeSqlite();

    if (typeof sqlite.DatabaseSync !== "function") {
      return {
        available: false,
        adapter: "node:sqlite",
        message: "node:sqlite loaded, but DatabaseSync is not available."
      };
    }

    return {
      available: true,
      adapter: "node:sqlite",
      message: "node:sqlite DatabaseSync is available."
    };
  } catch (error) {
    return projectionUnavailable(error);
  }
}

export class NodeSqliteProjectionAdapter implements ProjectionAdapter {
  readonly name = "node:sqlite";
  private readonly targetRoot: string;
  private readonly projectionPath: string;
  private database: DatabaseLike | undefined;

  constructor(targetRoot: string) {
    this.targetRoot = targetRoot;
    this.projectionPath = path.join(targetRoot, EVIDENCE_PROJECTION_PATH);
  }

  async probe(): Promise<ProjectionAvailability> {
    return probeNodeSqliteProjection();
  }

  private async open(): Promise<DatabaseLike> {
    if (this.database) {
      return this.database;
    }

    const probe = await this.probe();
    if (!probe.available) {
      throw new Error(
        `${probe.message}\nProjection commands require a Node runtime with node:sqlite. Upgrade Node or run under a supported runtime.`
      );
    }

    fs.mkdirSync(path.dirname(this.projectionPath), { recursive: true });
    const sqlite = await loadNodeSqlite();
    if (typeof sqlite.DatabaseSync !== "function") {
      throw new Error("node:sqlite loaded, but DatabaseSync is not available.");
    }

    this.database = new sqlite.DatabaseSync(this.projectionPath);
    return this.database;
  }

  async init(): Promise<void> {
    const db = await this.open();
    db.exec([
      "PRAGMA journal_mode = WAL;",
      "CREATE TABLE IF NOT EXISTS projection_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS evidence_events (",
      "  event_id TEXT PRIMARY KEY,",
      "  event_sequence INTEGER NOT NULL,",
      "  evidence_type TEXT NOT NULL,",
      "  produced_at TEXT NOT NULL,",
      "  target_project_id TEXT NOT NULL,",
      "  target_root TEXT NOT NULL,",
      "  namespace TEXT NOT NULL,",
      "  run_id TEXT,",
      "  phase_id TEXT,",
      "  task_path TEXT,",
      "  summary TEXT NOT NULL,",
      "  event_json TEXT NOT NULL",
      ");",
      "CREATE INDEX IF NOT EXISTS idx_evidence_scope ON evidence_events (target_project_id, target_root, namespace, run_id);",
      "CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_events (evidence_type, produced_at);",
      "CREATE TABLE IF NOT EXISTS verification_snapshots (",
      "  snapshot_id TEXT PRIMARY KEY,",
      "  event_id TEXT NOT NULL,",
      "  fingerprint_id TEXT NOT NULL,",
      "  target_project_id TEXT NOT NULL,",
      "  target_root TEXT NOT NULL,",
      "  namespace TEXT NOT NULL,",
      "  base_commit TEXT,",
      "  current_commit TEXT,",
      "  command_set_hash TEXT NOT NULL,",
      "  success INTEGER NOT NULL,",
      "  created_at TEXT NOT NULL,",
      "  snapshot_json TEXT NOT NULL",
      ");",
      "CREATE INDEX IF NOT EXISTS idx_verification_snapshot_scope ON verification_snapshots ",
      "  (target_project_id, target_root, namespace, fingerprint_id, success, created_at);"
    ].join("\n"));

    const metadata = {
      ...buildSchemaMetadata("node bin/ch memory init"),
      projection_schema_version: CURRENT_PROJECTION_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      ledger_path: EVIDENCE_LEDGER_PATH,
      adapter: this.name
    };
    db.prepare("INSERT OR REPLACE INTO projection_metadata (key, value) VALUES (?, ?)").run(
      "schema",
      canonicalJson(metadata)
    );
  }

  async close(): Promise<void> {
    if (this.database) {
      this.database.close();
      this.database = undefined;
    }
  }

  async applyEvent(event: EvidenceEventEnvelope): Promise<void> {
    await this.init();
    const db = await this.open();
    db.prepare([
      "INSERT OR REPLACE INTO evidence_events",
      "(event_id, event_sequence, evidence_type, produced_at, target_project_id, target_root, namespace, run_id, phase_id, task_path, summary, event_json)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ].join(" ")).run(
      event.event_id,
      event.sequence,
      event.evidence_type,
      event.provenance.produced_at,
      event.scope.target_project_id,
      event.scope.target_root,
      event.scope.namespace,
      event.scope.run_id ?? null,
      event.scope.phase_id ?? null,
      event.scope.task_path ?? null,
      summarizeEvent(event),
      canonicalJson(event)
    );

    const snapshot = getVerifiedSnapshot(event);
    if (snapshot) {
      const success =
        snapshot.command_results.length > 0 && snapshot.command_results.every((result) => result.exit_code === 0)
          ? 1
          : 0;
      db.prepare([
        "INSERT OR REPLACE INTO verification_snapshots",
        "(snapshot_id, event_id, fingerprint_id, target_project_id, target_root, namespace, base_commit, current_commit, command_set_hash, success, created_at, snapshot_json)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        snapshot.snapshot_id,
        event.event_id,
        snapshot.fingerprint.fingerprint_id,
        snapshot.target_project_id,
        snapshot.target_root,
        snapshot.namespace,
        snapshot.base_commit ?? null,
        snapshot.current_commit ?? null,
        snapshot.command_set_hash,
        success,
        snapshot.timestamp,
        canonicalJson(snapshot)
      );
    }
  }

  async rebuild(events: EvidenceEventEnvelope[]): Promise<void> {
    await this.init();
    const db = await this.open();
    db.exec("DELETE FROM verification_snapshots; DELETE FROM evidence_events;");

    for (const event of events) {
      await this.applyEvent(event);
    }
  }

  async validate(events: EvidenceEventEnvelope[]): Promise<ProjectionValidationResult> {
    await this.init();
    const db = await this.open();
    const row = db.prepare("SELECT COUNT(*) AS count FROM evidence_events").get() as { count?: number } | undefined;
    const projectedCount = typeof row?.count === "number" ? row.count : 0;
    const errors: string[] = [];

    if (projectedCount !== events.length) {
      errors.push(`projection event count ${projectedCount} does not match ledger event count ${events.length}.`);
    }

    return {
      ok: errors.length === 0,
      adapter: this.name,
      eventCount: projectedCount,
      errors
    };
  }

  async queryRuns(scope: Partial<EvidenceScope>, limit: number): Promise<EvidenceRunSummary[]> {
    await this.init();
    const db = await this.open();
    const params: unknown[] = [];
    const where = buildWhere(scope, params);
    const rows = db.prepare([
      "SELECT run_id, target_project_id, target_root, namespace, phase_id, task_path,",
      "COUNT(*) AS evidence_count, MIN(produced_at) AS first_event_at, MAX(produced_at) AS last_event_at",
      "FROM evidence_events",
      where,
      where ? "AND run_id IS NOT NULL" : "WHERE run_id IS NOT NULL",
      "GROUP BY run_id, target_project_id, target_root, namespace, phase_id, task_path",
      "ORDER BY last_event_at DESC",
      "LIMIT ?"
    ].join(" ")).all(...params, Math.max(1, limit)) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      run_id: requiredString(row.run_id),
      target_project_id: requiredString(row.target_project_id),
      target_root: requiredString(row.target_root),
      namespace: requiredString(row.namespace),
      ...(typeof row.phase_id === "string" ? { phase_id: row.phase_id } : {}),
      ...(typeof row.task_path === "string" ? { task_path: row.task_path } : {}),
      evidence_count: typeof row.evidence_count === "number" ? row.evidence_count : 0,
      first_event_at: requiredString(row.first_event_at),
      last_event_at: requiredString(row.last_event_at)
    }));
  }

  async queryTimeline(scope: Partial<EvidenceScope>, runId: string): Promise<EvidenceTimelineEntry[]> {
    await this.init();
    const db = await this.open();
    const params: unknown[] = [];
    const where = buildWhere({ ...scope, run_id: runId }, params);
    const rows = db.prepare([
      "SELECT event_id, event_sequence, evidence_type, produced_at, summary",
      "FROM evidence_events",
      where,
      "ORDER BY event_sequence ASC"
    ].join(" ")).all(...params) as EventRow[];

    return rows.map((row) => ({
      event_id: row.event_id,
      sequence: row.event_sequence,
      evidence_type: row.evidence_type as EvidenceTimelineEntry["evidence_type"],
      produced_at: row.produced_at,
      summary: row.summary
    }));
  }

  async queryLatestVerifiedSnapshot(
    scope: Pick<EvidenceScope, "target_project_id" | "target_root" | "namespace">,
    fingerprintId: string
  ): Promise<{ event: EvidenceEventEnvelope; snapshot: VerifiedSnapshot } | undefined> {
    await this.init();
    const db = await this.open();
    const row = db.prepare([
      "SELECT vs.snapshot_json AS snapshot_json, ee.event_json AS event_json",
      "FROM verification_snapshots vs",
      "JOIN evidence_events ee ON ee.event_id = vs.event_id",
      "WHERE vs.target_project_id = ? AND vs.target_root = ? AND vs.namespace = ? AND vs.fingerprint_id = ? AND vs.success = 1",
      "ORDER BY vs.created_at DESC",
      "LIMIT 1"
    ].join(" ")).get(
      scope.target_project_id,
      scope.target_root,
      scope.namespace,
      fingerprintId
    ) as { snapshot_json?: string; event_json?: string } | undefined;

    if (!row?.snapshot_json || !row.event_json) {
      return undefined;
    }

    return {
      event: JSON.parse(row.event_json) as EvidenceEventEnvelope,
      snapshot: JSON.parse(row.snapshot_json) as VerifiedSnapshot
    };
  }
}
