import * as fs from "node:fs";
import { PAYLOAD_WARNING_THRESHOLD_BYTES } from "./payload-store";
import {
  type DeliveryFactRecord,
  type HarvestRecord,
  type LifecycleStatus
} from "./lifecycle-types";
import {
  PROJECT_MEMORY_DB_WARNING_THRESHOLD_BYTES,
  initializeMemoryDatabase,
  resolveMemoryDbPaths,
  type DatabaseStatus
} from "./run-staging-db";
import { type DatabaseLike, openSqliteDatabase } from "./sqlite";
import { type Run } from "./runtime";

export class HarvestConflictError extends Error {
  constructor(runId: string) {
    super(`Harvest already exists for run ${runId}.`);
    this.name = "HarvestConflictError";
  }
}

interface RecordRow {
  record_kind: string;
  record_id: string;
  run_id: string;
  phase_id: string | null;
  task_path: string;
  created_at: string;
  status: string | null;
  summary: string;
  payload_json: string;
  source_step_id: string | null;
  source_command: string | null;
  sensitivity: string;
  retention_class: string;
}

interface DeliveryFactRow {
  delivery_fact_id: string;
  run_id: string;
  fact_kind: string;
  source: string;
  status: string;
  recorded_at: string;
  summary: string;
  url: string | null;
  external_run_id: string | null;
  commit_sha: string | null;
  excerpt_payload_id: string | null;
  fact_json: string;
}

interface PayloadIndexRow {
  payload_id: string;
  parent_record_id: string;
  source_run_id: string;
  source_phase_id: string | null;
  source_step_id: string | null;
  kind: string;
  media_type: string;
  summary: string;
  searchable_text: string | null;
  bounded_excerpt: string | null;
  redaction_status: string;
  retention_class: string;
  compression_status: string;
  chunk_count: number;
  raw_size_bytes: number;
  stored_size_bytes: number;
  content_hash: string;
  created_at: string;
}

interface PayloadChunkRow {
  payload_id: string;
  chunk_order: number;
  chunk_bytes: Uint8Array;
}

interface PayloadRedactionRow {
  payload_id: string;
  redaction_status: string;
  details_json: string;
  created_at: string;
}

interface PayloadRetentionRow {
  payload_id: string;
  retention_class: string;
  details_json: string;
  created_at: string;
}

interface PayloadLinkRow {
  payload_id: string;
  parent_record_id: string;
  link_role: string;
  created_at: string;
}

interface StagingTransferSnapshot {
  records: RecordRow[];
  deliveryFacts: DeliveryFactRow[];
  payloadIndex: PayloadIndexRow[];
  payloadChunks: PayloadChunkRow[];
  payloadRedactions: PayloadRedactionRow[];
  payloadRetention: PayloadRetentionRow[];
  payloadLinks: PayloadLinkRow[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function openProjectDatabase(projectDbPath: string): DatabaseLike {
  const database = openSqliteDatabase(projectDbPath);
  initializeMemoryDatabase(database, "project");
  return database;
}

function readDatabaseStatus(projectDbPath: string): DatabaseStatus {
  const sizeWarningThresholdBytes = PROJECT_MEMORY_DB_WARNING_THRESHOLD_BYTES;
  const exists = fs.existsSync(projectDbPath);

  if (!exists) {
    return {
      path: projectDbPath,
      exists: false,
      sizeBytes: 0,
      integrity: "missing",
      journalMode: "unknown",
      sizeWarningThresholdBytes,
      payloadWarningThresholdBytes: PAYLOAD_WARNING_THRESHOLD_BYTES,
      oversizedPayloadCount: 0,
      redactedPayloadCount: 0,
      quarantinedPayloadCount: 0,
      discardedPayloadCount: 0,
      warnings: []
    };
  }

  const database = openProjectDatabase(projectDbPath);
  try {
    const integrity = database.prepare("PRAGMA integrity_check;").get() as { integrity_check?: string } | undefined;
    const journalMode = database.prepare("PRAGMA journal_mode;").get() as { journal_mode?: string } | undefined;
    const oversizedPayloadCount = Number(
      (database.prepare(
        "SELECT COUNT(*) AS count FROM payload_index WHERE raw_size_bytes > ?"
      ).get(PAYLOAD_WARNING_THRESHOLD_BYTES) as { count?: number } | undefined)?.count ?? 0
    );
    const redactedPayloadCount = Number(
      (database.prepare(
        "SELECT COUNT(*) AS count FROM payload_index WHERE redaction_status = ?"
      ).get("redacted") as { count?: number } | undefined)?.count ?? 0
    );
    const quarantinedPayloadCount = Number(
      (database.prepare(
        "SELECT COUNT(*) AS count FROM payload_index WHERE retention_class = ?"
      ).get("quarantine") as { count?: number } | undefined)?.count ?? 0
    );
    const discardedPayloadCount = Number(
      (database.prepare(
        "SELECT COUNT(*) AS count FROM payload_index WHERE retention_class = ?"
      ).get("discarded") as { count?: number } | undefined)?.count ?? 0
    );
    const sizeBytes = fs.statSync(projectDbPath).size;
    const warnings: string[] = [];

    if (sizeBytes > sizeWarningThresholdBytes) {
      warnings.push(
        `DB size ${sizeBytes} bytes exceeds the ${sizeWarningThresholdBytes}-byte review threshold; inspect retention, harvest, and export decisions.`
      );
    }

    if (oversizedPayloadCount > 0) {
      warnings.push(
        `${oversizedPayloadCount} payload(s) exceed the ${PAYLOAD_WARNING_THRESHOLD_BYTES}-byte review threshold; summarize, redact, quarantine, or explicitly accept them.`
      );
    }

    if (quarantinedPayloadCount > 0) {
      warnings.push(
        `${quarantinedPayloadCount} payload(s) are marked quarantine; operator review is required before treating them as accepted durable memory.`
      );
    }

    if (discardedPayloadCount > 0) {
      warnings.push(
        `${discardedPayloadCount} payload(s) are marked discarded; they remain audit-only compatibility state.`
      );
    }

    return {
      path: projectDbPath,
      exists,
      sizeBytes,
      integrity: typeof integrity?.integrity_check === "string" ? integrity.integrity_check : "unknown",
      journalMode: typeof journalMode?.journal_mode === "string" ? journalMode.journal_mode : "unknown",
      sizeWarningThresholdBytes,
      payloadWarningThresholdBytes: PAYLOAD_WARNING_THRESHOLD_BYTES,
      oversizedPayloadCount,
      redactedPayloadCount,
      quarantinedPayloadCount,
      discardedPayloadCount,
      warnings
    };
  } finally {
    database.close();
  }
}

function readStagingTransferSnapshot(sourceDbPath: string, runId: string): StagingTransferSnapshot {
  const source = openSqliteDatabase(sourceDbPath);

  try {
    return {
      records: source.prepare([
        "SELECT record_kind, record_id, run_id, phase_id, task_path, created_at, status, summary, payload_json, source_step_id, source_command, sensitivity, retention_class",
        "FROM records WHERE run_id = ? ORDER BY created_at ASC, record_kind ASC, record_id ASC"
      ].join(" ")).all(runId) as RecordRow[],
      deliveryFacts: source.prepare([
        "SELECT delivery_fact_id, run_id, fact_kind, source, status, recorded_at, summary, url, external_run_id, commit_sha, excerpt_payload_id, fact_json",
        "FROM delivery_facts WHERE run_id = ? ORDER BY recorded_at ASC, delivery_fact_id ASC"
      ].join(" ")).all(runId) as DeliveryFactRow[],
      payloadIndex: source.prepare([
        "SELECT payload_id, parent_record_id, source_run_id, source_phase_id, source_step_id, kind, media_type, summary, searchable_text, bounded_excerpt, redaction_status, retention_class, compression_status, chunk_count, raw_size_bytes, stored_size_bytes, content_hash, created_at",
        "FROM payload_index WHERE source_run_id = ? ORDER BY created_at ASC, payload_id ASC"
      ].join(" ")).all(runId) as PayloadIndexRow[],
      payloadChunks: source.prepare([
        "SELECT pc.payload_id, pc.chunk_order, pc.chunk_bytes",
        "FROM payload_chunks pc",
        "JOIN payload_index pi ON pi.payload_id = pc.payload_id",
        "WHERE pi.source_run_id = ?",
        "ORDER BY pc.payload_id ASC, pc.chunk_order ASC"
      ].join(" ")).all(runId) as PayloadChunkRow[],
      payloadRedactions: source.prepare([
        "SELECT pr.payload_id, pr.redaction_status, pr.details_json, pr.created_at",
        "FROM payload_redactions pr",
        "JOIN payload_index pi ON pi.payload_id = pr.payload_id",
        "WHERE pi.source_run_id = ?",
        "ORDER BY pr.payload_id ASC"
      ].join(" ")).all(runId) as PayloadRedactionRow[],
      payloadRetention: source.prepare([
        "SELECT pr.payload_id, pr.retention_class, pr.details_json, pr.created_at",
        "FROM payload_retention pr",
        "JOIN payload_index pi ON pi.payload_id = pr.payload_id",
        "WHERE pi.source_run_id = ?",
        "ORDER BY pr.payload_id ASC"
      ].join(" ")).all(runId) as PayloadRetentionRow[],
      payloadLinks: source.prepare([
        "SELECT pl.payload_id, pl.parent_record_id, pl.link_role, pl.created_at",
        "FROM payload_links pl",
        "JOIN payload_index pi ON pi.payload_id = pl.payload_id",
        "WHERE pi.source_run_id = ?",
        "ORDER BY pl.payload_id ASC, pl.parent_record_id ASC, pl.link_role ASC"
      ].join(" ")).all(runId) as PayloadLinkRow[]
    };
  } finally {
    source.close();
  }
}

export class ProjectMemoryDatabase {
  readonly targetRoot: string;
  readonly projectRoot: string;
  readonly projectDbPath: string;

  constructor(targetRoot: string, projectRoot: string) {
    this.targetRoot = targetRoot;
    this.projectRoot = projectRoot;
    this.projectDbPath = resolveMemoryDbPaths(targetRoot, projectRoot).projectDbPath;
  }

  private open(): DatabaseLike {
    return openProjectDatabase(this.projectDbPath);
  }

  ensureInitialized(): DatabaseStatus {
    const database = this.open();
    try {
      database.prepare(
        "INSERT OR REPLACE INTO maintenance_events (event_id, db_role, event_kind, created_at, details_json) VALUES (?, ?, ?, ?, ?)"
      ).run("project-init", "project", "init", nowIso(), stringify({ project_root: this.projectRoot }));
    } finally {
      database.close();
    }

    return this.status();
  }

  status(): DatabaseStatus {
    return readDatabaseStatus(this.projectDbPath);
  }

  getHarvestRecord(runId: string): HarvestRecord | undefined {
    const database = this.open();
    try {
      const row = database.prepare("SELECT details_json FROM harvest_records WHERE run_id = ?").get(runId) as { details_json?: string } | undefined;
      return row?.details_json ? (JSON.parse(row.details_json) as HarvestRecord) : undefined;
    } finally {
      database.close();
    }
  }

  getRun(runId: string): Run | undefined {
    const database = this.open();
    try {
      const row = database.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(runId) as { run_json?: string } | undefined;
      return row?.run_json ? (JSON.parse(row.run_json) as Run) : undefined;
    } finally {
      database.close();
    }
  }

  saveAcceptedRun(
    run: Run,
    deliveryFacts: DeliveryFactRecord[],
    harvestRecord: HarvestRecord
  ): void {
    const transfer = run.source_staging_db_path
      ? readStagingTransferSnapshot(run.source_staging_db_path, run.run_id)
      : undefined;
    const database = this.open();

    try {
      database.exec("BEGIN IMMEDIATE;");
      database.prepare([
        "INSERT OR REPLACE INTO runs",
        "(run_id, task_path, active_task_path, phase_id, run_mode, lifecycle_status, created_at, updated_at, target_root, project_root, repository_json, run_json, discard_reason, manual_override_reason, harvested_at, source_snapshot)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        run.run_id,
        run.task_path,
        run.active_task_path ?? null,
        run.phase_id ?? null,
        run.run_mode,
        run.lifecycle_status,
        run.created_at,
        run.updated_at,
        run.repository.root_path,
        this.projectRoot,
        stringify(run.repository),
        stringify(run),
        run.discard_reason ?? null,
        run.manual_override_reason ?? null,
        run.harvested_at ?? null,
        run.source_snapshot ?? null
      );

      database.prepare("DELETE FROM records WHERE run_id = ?").run(run.run_id);
      for (const tableName of ["records", "delivery_facts"] as const) {
        database.prepare(`DELETE FROM ${tableName} WHERE run_id = ?`).run(run.run_id);
      }

      if (transfer) {
        for (const row of transfer.records) {
          database.prepare([
            "INSERT INTO records",
            "(record_kind, record_id, run_id, phase_id, task_path, created_at, status, summary, payload_json, source_step_id, source_command, sensitivity, retention_class)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ].join(" ")).run(
            row.record_kind,
            row.record_id,
            row.run_id,
            row.phase_id,
            row.task_path,
            row.created_at,
            row.status,
            row.summary,
            row.payload_json,
            row.source_step_id,
            row.source_command,
            row.sensitivity,
            row.retention_class
          );
        }

        for (const row of transfer.deliveryFacts) {
          database.prepare([
            "INSERT OR REPLACE INTO delivery_facts",
            "(delivery_fact_id, run_id, fact_kind, source, status, recorded_at, summary, url, external_run_id, commit_sha, excerpt_payload_id, fact_json)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ].join(" ")).run(
            row.delivery_fact_id,
            row.run_id,
            row.fact_kind,
            row.source,
            row.status,
            row.recorded_at,
            row.summary,
            row.url,
            row.external_run_id,
            row.commit_sha,
            row.excerpt_payload_id,
            row.fact_json
          );
        }

        for (const row of transfer.payloadIndex) {
          database.prepare([
            "INSERT OR IGNORE INTO payload_index",
            "(payload_id, parent_record_id, source_run_id, source_phase_id, source_step_id, kind, media_type, summary, searchable_text, bounded_excerpt, redaction_status, retention_class, compression_status, chunk_count, raw_size_bytes, stored_size_bytes, content_hash, created_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ].join(" ")).run(
            row.payload_id,
            row.parent_record_id,
            row.source_run_id,
            row.source_phase_id,
            row.source_step_id,
            row.kind,
            row.media_type,
            row.summary,
            row.searchable_text,
            row.bounded_excerpt,
            row.redaction_status,
            row.retention_class,
            row.compression_status,
            row.chunk_count,
            row.raw_size_bytes,
            row.stored_size_bytes,
            row.content_hash,
            row.created_at
          );
        }

        for (const row of transfer.payloadChunks) {
          database.prepare(
            "INSERT OR IGNORE INTO payload_chunks (payload_id, chunk_order, chunk_bytes) VALUES (?, ?, ?)"
          ).run(row.payload_id, row.chunk_order, row.chunk_bytes);
        }

        for (const row of transfer.payloadRedactions) {
          database.prepare([
            "INSERT OR IGNORE INTO payload_redactions",
            "(payload_id, redaction_status, details_json, created_at)",
            "VALUES (?, ?, ?, ?)"
          ].join(" ")).run(row.payload_id, row.redaction_status, row.details_json, row.created_at);
        }

        for (const row of transfer.payloadRetention) {
          database.prepare([
            "INSERT OR IGNORE INTO payload_retention",
            "(payload_id, retention_class, details_json, created_at)",
            "VALUES (?, ?, ?, ?)"
          ].join(" ")).run(row.payload_id, row.retention_class, row.details_json, row.created_at);
        }

        for (const row of transfer.payloadLinks) {
          database.prepare([
            "INSERT OR IGNORE INTO payload_links",
            "(payload_id, parent_record_id, link_role, created_at)",
            "VALUES (?, ?, ?, ?)"
          ].join(" ")).run(row.payload_id, row.parent_record_id, row.link_role, row.created_at);
        }
      } else {
        for (const fact of deliveryFacts) {
          database.prepare([
            "INSERT OR REPLACE INTO delivery_facts",
            "(delivery_fact_id, run_id, fact_kind, source, status, recorded_at, summary, url, external_run_id, commit_sha, excerpt_payload_id, fact_json)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ].join(" ")).run(
            fact.delivery_fact_id,
            fact.run_id,
            fact.fact_kind,
            fact.source,
            fact.status,
            fact.recorded_at,
            fact.summary,
            fact.url ?? null,
            fact.external_run_id ?? null,
            fact.commit_sha ?? null,
            fact.excerpt_payload_id ?? null,
            stringify(fact)
          );
        }
      }

      database.prepare([
        "INSERT INTO harvest_records",
        "(harvest_id, run_id, project_run_id, status, promoted_at, accepted_count, discarded_count, quarantined_count, redacted_count, unresolved_count, source_task_path, source_snapshot, details_json)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        harvestRecord.harvest_id,
        harvestRecord.run_id,
        harvestRecord.project_run_id,
        harvestRecord.status,
        harvestRecord.promoted_at,
        harvestRecord.accepted_count,
        harvestRecord.discarded_count,
        harvestRecord.quarantined_count,
        harvestRecord.redacted_count,
        harvestRecord.unresolved_count,
        harvestRecord.source_task_path,
        harvestRecord.source_snapshot,
        stringify(harvestRecord)
      );
      database.prepare(
        "INSERT OR REPLACE INTO maintenance_events (event_id, db_role, event_kind, created_at, details_json) VALUES (?, ?, ?, ?, ?)"
      ).run(`harvest-${run.run_id}`, "project", "harvest", nowIso(), stringify(harvestRecord));
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      const message = error instanceof Error ? error.message : String(error);
      if (/constraint failed/i.test(message) && /harvest_records/i.test(message)) {
        throw new HarvestConflictError(run.run_id);
      }
      throw error;
    } finally {
      database.close();
    }
  }

  markRunLifecycle(runId: string, lifecycleStatus: LifecycleStatus): void {
    const database = this.open();
    try {
      database.prepare("UPDATE runs SET lifecycle_status = ?, updated_at = ? WHERE run_id = ?").run(
        lifecycleStatus,
        nowIso(),
        runId
      );
    } finally {
      database.close();
    }
  }
}
