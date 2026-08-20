import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { PAYLOAD_WARNING_THRESHOLD_BYTES } from "./payload-store";
import {
  type DeliveryFactRecord,
  type HarvestRecord,
  type LifecycleStatus
} from "./lifecycle-types";
import {
  PROJECT_MEMORY_DB_WARNING_THRESHOLD_BYTES,
  initializeMemoryDatabase,
  parseAuthoritativeProcedureProvenance,
  readStoredPayloadBody,
  resolveMemoryDbPaths,
  type ReadOnlyStoredPayload,
  type DatabaseStatus
} from "./run-staging-db";
import { type DatabaseLike, openSqliteDatabase, openSqliteDatabaseReadOnly } from "./sqlite";
import { type Run } from "./runtime";
import { canonicalJson } from "./evidence-types";
import { indexSelfHostingProceduresById, readSelfHostingProcedureRegistry } from "./self-hosting-procedures";

export class HarvestConflictError extends Error {
  constructor(runId: string) {
    super(`Harvest already exists for run ${runId}.`);
    this.name = "HarvestConflictError";
  }
}

export class AmbiguousDisplayRunIdError extends Error {
  constructor(runId: string) {
    super(`Display run id ${runId} matches multiple exact run instances in project memory.`);
    this.name = "AmbiguousDisplayRunIdError";
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

interface ProcedureArtifactRow {
  run_instance_id: string;
  source_run_id: string;
  procedure_id: string;
  artifact_id: string;
  payload_id: string;
  content_hash: string;
  recorded_at: string;
  provenance_json: string;
  reviewed_plan_artifact_id: string | null;
  reviewed_plan_content_hash: string | null;
  reviewed_evidence_artifact_id: string | null;
}

interface StagingTransferSnapshot {
  records: RecordRow[];
  deliveryFacts: DeliveryFactRow[];
  payloadIndex: PayloadIndexRow[];
  payloadChunks: PayloadChunkRow[];
  payloadRedactions: PayloadRedactionRow[];
  payloadRetention: PayloadRetentionRow[];
  payloadLinks: PayloadLinkRow[];
  procedureArtifacts: ProcedureArtifactRow[];
}

export interface AuthoritativeProcedureArtifactBody {
  project_run_id: string;
  procedure_id: string;
  artifact_id: string;
  content_hash: string;
  recorded_at: string;
  body: string;
  provenance: Record<string, unknown>;
  reviewed_plan_artifact_id?: string;
  reviewed_plan_content_hash?: string;
  reviewed_evidence_artifact_id?: string;
}

export interface ReviewReplayEligibility {
  run_instance_id: string;
  eligible: boolean;
  source_status: string;
  packet_record_id?: string;
  approved_attempt_id?: string;
  accepted_artifact_id?: string;
  accepted_result_id?: string;
  payload_count: number;
  reconstructed_payload_count: number;
  reasons: string[];
}

export interface AcceptedRecordDescriptor {
  record_id: string;
  record_kind: string;
  task_path: string;
  created_at: string;
  status: string | null;
  source_step_id: string | null;
  source_command: string | null;
}

export interface AcceptedDeliveryFactDescriptor {
  delivery_fact_id: string;
  fact_kind: string;
  recorded_at: string;
  commit_sha: string | null;
  excerpt_payload_id: string | null;
}

export interface AcceptedProcedureArtifactDescriptor {
  procedure_id: string;
  artifact_id: string;
  payload_id: string;
  content_hash: string;
  recorded_at: string;
  reviewed_plan_artifact_id: string | null;
  reviewed_plan_content_hash: string | null;
  reviewed_evidence_artifact_id: string | null;
}

export interface AcceptedPayloadDescriptor {
  payload_id: string;
  parent_record_id: string;
  kind: string;
  bounded_excerpt: string | null;
  redaction_status: string;
  retention_class: string;
  raw_size_bytes: number;
  content_hash: string;
  created_at: string;
}

export interface AcceptedPayloadLinkDescriptor {
  payload_id: string;
  parent_record_id: string;
  link_role: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseAcceptedRuntimeRun(value: unknown, expectedInstanceId: string, expectedDisplayRunId?: string): Run {
  if (typeof value !== "string") throw new Error("ACCEPTED_RUNTIME_RUN_JSON_MISSING");
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error("ACCEPTED_RUNTIME_RUN_JSON_INVALID"); }
  const { validateRuntimeRun } = require("./runtime") as { validateRuntimeRun: (candidate: unknown) => Run };
  const run = validateRuntimeRun(parsed);
  if (run.run_instance_id !== expectedInstanceId
    || (expectedDisplayRunId !== undefined && run.run_id !== expectedDisplayRunId)) {
    throw new Error("ACCEPTED_RUNTIME_RUN_IDENTITY_MISMATCH");
  }
  return run;
}

function parseExactHarvestRecord(value: unknown, expectedInstanceId: string, expectedDisplayRunId: string): HarvestRecord {
  if (typeof value !== "string") throw new Error("ACCEPTED_HARVEST_JSON_MISSING");
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error("ACCEPTED_HARVEST_JSON_INVALID"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ACCEPTED_HARVEST_RECORD_INVALID");
  const record = parsed as Record<string, unknown>;
  for (const field of ["harvest_id", "run_id", "project_run_id", "status", "promoted_at", "source_task_path", "source_snapshot"] as const) {
    if (typeof record[field] !== "string" || !record[field]) throw new Error(`ACCEPTED_HARVEST_RECORD_INVALID:${field}`);
  }
  for (const field of ["accepted_count", "discarded_count", "quarantined_count", "redacted_count", "unresolved_count"] as const) {
    if (!Number.isInteger(record[field]) || Number(record[field]) < 0) throw new Error(`ACCEPTED_HARVEST_RECORD_INVALID:${field}`);
  }
  if (!record.details || typeof record.details !== "object" || Array.isArray(record.details)
    || record.project_run_id !== expectedInstanceId || record.run_id !== expectedDisplayRunId) {
    throw new Error("ACCEPTED_HARVEST_RECORD_IDENTITY_MISMATCH");
  }
  return record as unknown as HarvestRecord;
}

function openProjectDatabase(projectDbPath: string): DatabaseLike {
  const database = openSqliteDatabase(projectDbPath);
  initializeMemoryDatabase(database, "project");
  return database;
}

function hasExactRunIdentity(run: Run): run is Run & { run_instance_id: string } {
  return typeof run.run_instance_id === "string" && run.run_instance_id.trim().length > 0;
}

function namespaceProjectRowId(runInstanceId: string, rowId: string): string {
  return `${runInstanceId}:${rowId}`;
}

function namespaceProjectTransferSnapshot(
  runInstanceId: string,
  sourceRunId: string,
  transfer: StagingTransferSnapshot
): StagingTransferSnapshot {
  for (const descriptor of transfer.procedureArtifacts) {
    if (descriptor.run_instance_id !== runInstanceId || descriptor.source_run_id !== sourceRunId) {
      throw new Error("Procedure artifact harvest rejects a descriptor that does not match the exact staged run instance.");
    }
  }
  return {
    records: transfer.records.map((row) => ({
      ...row,
      record_id: namespaceProjectRowId(runInstanceId, row.record_id),
      run_id: runInstanceId
    })),
    deliveryFacts: transfer.deliveryFacts.map((row) => ({
      ...row,
      delivery_fact_id: namespaceProjectRowId(runInstanceId, row.delivery_fact_id),
      run_id: runInstanceId
    })),
    payloadIndex: transfer.payloadIndex.map((row) => ({
      ...row,
      payload_id: namespaceProjectRowId(runInstanceId, row.payload_id),
      parent_record_id: namespaceProjectRowId(runInstanceId, row.parent_record_id),
      source_run_id: runInstanceId
    })),
    payloadChunks: transfer.payloadChunks.map((row) => ({
      ...row,
      payload_id: namespaceProjectRowId(runInstanceId, row.payload_id)
    })),
    payloadRedactions: transfer.payloadRedactions.map((row) => ({
      ...row,
      payload_id: namespaceProjectRowId(runInstanceId, row.payload_id)
    })),
    payloadRetention: transfer.payloadRetention.map((row) => ({
      ...row,
      payload_id: namespaceProjectRowId(runInstanceId, row.payload_id)
    })),
    payloadLinks: transfer.payloadLinks.map((row) => ({
      ...row,
      payload_id: namespaceProjectRowId(runInstanceId, row.payload_id),
      parent_record_id: namespaceProjectRowId(runInstanceId, row.parent_record_id)
    })),
    procedureArtifacts: transfer.procedureArtifacts.map((row) => ({
      ...row,
      run_instance_id: runInstanceId,
      source_run_id: runInstanceId,
      payload_id: namespaceProjectRowId(runInstanceId, row.payload_id)
    }))
  };
}

function namespaceProjectDeliveryFacts(
  runInstanceId: string,
  deliveryFacts: DeliveryFactRecord[]
): DeliveryFactRecord[] {
  return deliveryFacts.map((fact) => ({
    ...fact,
    delivery_fact_id: namespaceProjectRowId(runInstanceId, fact.delivery_fact_id),
    run_id: runInstanceId
  }));
}

function migrateProjectExactAuthority(database: DatabaseLike): void {
  const runRows = database.prepare(
    "SELECT run_id, run_json, created_at, updated_at FROM runs ORDER BY updated_at ASC, run_id ASC"
  ).all() as Array<{ run_id: string; run_json: string; created_at: string; updated_at: string }>;

  for (const row of runRows) {
    const run = JSON.parse(row.run_json) as Run;
    if (hasExactRunIdentity(run)) {
      database.prepare([
        "INSERT OR REPLACE INTO project_run_instances",
        "(run_instance_id, run_id, project_run_id, run_json, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        run.run_instance_id,
        run.run_id,
        run.run_instance_id,
        row.run_json,
        row.created_at,
        row.updated_at
      );
    } else {
      database.prepare([
        "INSERT OR IGNORE INTO legacy_unresolved_runs",
        "(legacy_row_id, run_id, run_json, blocker_reason, captured_at)",
        "VALUES (?, ?, ?, ?, ?)"
      ].join(" ")).run(
        `legacy-${row.run_id}`,
        row.run_id,
        row.run_json,
        "missing_run_instance_id",
        row.updated_at
      );
    }
  }

  const harvestRows = database.prepare(
    "SELECT details_json FROM harvest_records ORDER BY promoted_at ASC, harvest_id ASC"
  ).all() as Array<{ details_json: string }>;
  for (const row of harvestRows) {
    const harvest = JSON.parse(row.details_json) as HarvestRecord;
    const exactRuns = database.prepare(
      "SELECT run_json FROM project_run_instances WHERE run_id = ? ORDER BY updated_at DESC"
    ).all(harvest.run_id) as Array<{ run_json: string }>;
    if (exactRuns.length !== 1) {
      continue;
    }
    const run = JSON.parse(exactRuns[0].run_json) as Run;
    if (!hasExactRunIdentity(run)) {
      continue;
    }
    database.prepare([
      "INSERT OR REPLACE INTO project_harvest_records_exact",
      "(run_instance_id, run_id, promoted_at, harvest_json)",
      "VALUES (?, ?, ?, ?)"
    ].join(" ")).run(run.run_instance_id, run.run_id, harvest.promoted_at, row.details_json);
  }
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

function readStagingTransferSnapshot(sourceDbPath: string, runId: string, runInstanceId: string): StagingTransferSnapshot {
  const source = openSqliteDatabase(sourceDbPath);

  try {
    return {
      records: source.prepare([
        "SELECT record_kind, record_id, run_id, phase_id, task_path, created_at, status, summary, payload_json, source_step_id, source_command, sensitivity, retention_class",
        "FROM records WHERE run_id = ? AND record_kind NOT IN",
        "('proof_eligibility_snapshot','successor_disposition','review_cohort','review_attempt','review_attempt_event','review_capability_evidence','planning_review_bundle','review_finding_aggregate')",
        "ORDER BY created_at ASC, record_kind ASC, record_id ASC"
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
      ,procedureArtifacts: source.prepare([
        "SELECT run_instance_id, source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json,",
        "reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id",
        "FROM procedure_artifacts WHERE source_run_id = ? AND run_instance_id = ? ORDER BY recorded_at ASC, artifact_id ASC"
      ].join(" ")).all(runId, runInstanceId) as ProcedureArtifactRow[]
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
      migrateProjectExactAuthority(database);
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

  getHarvestRecordByRunInstanceId(runInstanceId: string): HarvestRecord | undefined {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const row = database.prepare(
        "SELECT harvest_json FROM project_harvest_records_exact WHERE run_instance_id = ?"
      ).get(runInstanceId) as { harvest_json?: string } | undefined;
      return row?.harvest_json ? (JSON.parse(row.harvest_json) as HarvestRecord) : undefined;
    } finally {
      database.close();
    }
  }

  listHarvestRecordsByDisplayRunId(runId: string): HarvestRecord[] {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const rows = database.prepare(
        "SELECT harvest_json FROM project_harvest_records_exact WHERE run_id = ? ORDER BY promoted_at DESC"
      ).all(runId) as Array<{ harvest_json?: string }>;
      return rows
        .map((row) => row.harvest_json ? (JSON.parse(row.harvest_json) as HarvestRecord) : undefined)
        .filter((entry): entry is HarvestRecord => Boolean(entry));
    } finally {
      database.close();
    }
  }

  getHarvestRecord(runId: string): HarvestRecord | undefined {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const exactRows = database.prepare(
        "SELECT harvest_json FROM project_harvest_records_exact WHERE run_id = ? ORDER BY promoted_at DESC"
      ).all(runId) as Array<{ harvest_json?: string }>;
      if (exactRows.length > 1) {
        throw new AmbiguousDisplayRunIdError(runId);
      }
      if (exactRows.length === 1 && exactRows[0]?.harvest_json) {
        return JSON.parse(exactRows[0].harvest_json) as HarvestRecord;
      }
      const row = database.prepare("SELECT details_json FROM harvest_records WHERE run_id = ?").get(runId) as { details_json?: string } | undefined;
      return row?.details_json ? (JSON.parse(row.details_json) as HarvestRecord) : undefined;
    } finally {
      database.close();
    }
  }

  getRunByInstanceId(runInstanceId: string): Run | undefined {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const row = database.prepare(
        "SELECT run_json FROM project_run_instances WHERE run_instance_id = ?"
      ).get(runInstanceId) as { run_json?: string } | undefined;
      return row?.run_json ? (JSON.parse(row.run_json) as Run) : undefined;
    } finally {
      database.close();
    }
  }

  listRunsByDisplayRunId(runId: string): Run[] {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const rows = database.prepare(
        "SELECT run_json FROM project_run_instances WHERE run_id = ? ORDER BY updated_at DESC"
      ).all(runId) as Array<{ run_json?: string }>;
      return rows
        .map((row) => row.run_json ? (JSON.parse(row.run_json) as Run) : undefined)
        .filter((entry): entry is Run => Boolean(entry));
    } finally {
      database.close();
    }
  }

  getRun(runId: string): Run | undefined {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const exactRows = database.prepare(
        "SELECT run_json FROM project_run_instances WHERE run_id = ? ORDER BY updated_at DESC"
      ).all(runId) as Array<{ run_json?: string }>;
      if (exactRows.length > 1) {
        throw new AmbiguousDisplayRunIdError(runId);
      }
      if (exactRows.length === 1 && exactRows[0]?.run_json) {
        return JSON.parse(exactRows[0].run_json) as Run;
      }
      const row = database.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(runId) as { run_json?: string } | undefined;
      return row?.run_json ? (JSON.parse(row.run_json) as Run) : undefined;
    } finally {
      database.close();
    }
  }

  hasRunForSuccessorIdentity(cwd: string, branch: string): boolean {
    const database = this.open();
    try {
      migrateProjectExactAuthority(database);
      const rows = database.prepare("SELECT run_json FROM project_run_instances").all() as Array<{ run_json?: string }>;
      return rows.some((row) => {
        if (!row.run_json) return false;
        const run = JSON.parse(row.run_json) as Run;
        return run.repository.branch === branch
          || run.repository.root_path === cwd
          || run.repository.task_worktree_path === cwd;
      });
    } finally {
      database.close();
    }
  }

  reviewReplayEligibility(runInstanceId: string, packetRecordId?: string): ReviewReplayEligibility {
    const run = this.getRunByInstanceId(runInstanceId);
    const harvest = this.getHarvestRecordByRunInstanceId(runInstanceId);
    const reasons: string[] = [];
    if (!run) reasons.push("source_run_missing");
    if (!harvest) reasons.push("source_harvest_missing");
    if (run && run.lifecycle_status !== "harvested") reasons.push("source_not_harvested");
    const packets = run?.review_routing_records?.filter((entry) => entry.record_kind === "review_replay_packet") ?? [];
    const packet = packetRecordId
      ? packets.find((entry) => entry.record_id === packetRecordId)
      : packets.length === 1 ? packets[0] : undefined;
    if (!packetRecordId && packets.length > 1) reasons.push("replay_packet_identity_required");
    if (packetRecordId && !packet) reasons.push("requested_replay_packet_missing");
    if (!packet) reasons.push(run?.phase_id === "23.8.6F" ? "review_replay_packet_missing" : "legacy_pre_f_replay_packet_missing");
    if (packet && packet.record_id !== `sha256:${createHash("sha256").update(canonicalJson(packet.payload)).digest("hex")}`) {
      reasons.push("review_replay_packet_identity_mismatch");
    }
    const payloadIds = packet && Array.isArray(packet.payload.payload_ids)
      ? packet.payload.payload_ids.filter((entry): entry is string => typeof entry === "string")
      : [];
    if (packet && payloadIds.length === 0) reasons.push("replay_payload_index_empty");
    const payloadKinds = packet?.payload.payload_kinds && typeof packet.payload.payload_kinds === "object"
      ? packet.payload.payload_kinds as Record<string, unknown>
      : {};
    for (const kind of ["review-request-packet", "context-core", "context-manifest", "review-delta-overlay"]) {
      if (typeof payloadKinds[kind] !== "string" || !payloadIds.includes(payloadKinds[kind] as string)) {
        reasons.push(`replay_payload_kind_missing:${kind}`);
      }
    }
    const approvedAttemptId = typeof packet?.payload.approved_attempt_id === "string" ? packet.payload.approved_attempt_id : undefined;
    const acceptedArtifactId = typeof packet?.payload.accepted_artifact_id === "string" ? packet.payload.accepted_artifact_id : undefined;
    const acceptedResultId = typeof packet?.payload.accepted_result_id === "string" ? packet.payload.accepted_result_id : undefined;
    const invocation = approvedAttemptId ? run?.review_routing_records?.find((entry) => entry.record_kind === "review_invocation"
      && entry.status === "success" && entry.payload.attempt_id === approvedAttemptId) : undefined;
    const result = acceptedResultId ? run?.review_results.find((entry) => entry.review_result_id === acceptedResultId
      && entry.status === "PASS" && entry.artifact_refs.some((artifact) => artifact.artifact_id === acceptedArtifactId)) : undefined;
    const artifact = acceptedArtifactId ? run?.artifacts.find((entry) => entry.artifact_id === acceptedArtifactId) : undefined;
    if (!approvedAttemptId || !invocation) reasons.push("approved_attempt_join_missing");
    if (!acceptedArtifactId || !artifact) reasons.push("accepted_artifact_join_missing");
    if (!acceptedResultId || !result) reasons.push("accepted_result_join_missing");
    const procedureId = typeof packet?.payload.procedure_id === "string" ? packet.payload.procedure_id : undefined;
    if (!procedureId || invocation?.payload.procedure_id !== procedureId
      || !result || result.source !== `procedure:${procedureId}`
      || artifact?.kind !== `procedure-artifact:${procedureId}`) {
      reasons.push("packet_procedure_join_mismatch");
    }
    if (packet?.payload.pass_kind !== invocation?.payload.pass_kind
      || packet?.payload.immutable_base !== invocation?.payload.immutable_base
      || canonicalJson(packet?.payload.risk_classes ?? []) !== canonicalJson(invocation?.payload.risk_classes ?? [])) {
      reasons.push("packet_pass_risk_base_join_mismatch");
    }
    for (const [field, invocationField] of [
      ["context_core_id", "context_core_id"], ["context_manifest_id", "context_manifest_id"], ["delta_overlay_id", "delta_overlay_id"],
      ["route_decision_id", "route_decision_id"], ["policy_version", "routing_policy_version"], ["binding_version", "binding_version"]
    ] as const) {
      if (!packet || typeof packet.payload[field] !== "string" || packet.payload[field] !== invocation?.payload[invocationField]) reasons.push(`packet_attempt_identity_mismatch:${field}`);
    }
    if (packet?.payload.run_instance_id !== runInstanceId || packet.payload.source_run_id !== run?.run_id
      || packet.payload.source_snapshot !== run?.source_snapshot) reasons.push("packet_source_identity_mismatch");
    let reconstructed = 0;
    let reconstructedRequestHash: string | undefined;
    const reconstructedKinds = new Map<string, unknown>();
    const database = this.open();
    try {
      for (const payloadId of payloadIds) {
        const projectPayloadId = namespaceProjectRowId(runInstanceId, payloadId);
        const index = database.prepare([
          "SELECT compression_status, chunk_count, raw_size_bytes, content_hash FROM payload_index WHERE payload_id = ?"
        ].join(" ")).get(projectPayloadId) as { compression_status?: string; chunk_count?: number; raw_size_bytes?: number; content_hash?: string } | undefined;
        if (!index) {
          reasons.push(`payload_missing:${payloadId}`);
          continue;
        }
        const chunks = database.prepare(
          "SELECT chunk_order, chunk_bytes FROM payload_chunks WHERE payload_id = ? ORDER BY chunk_order ASC"
        ).all(projectPayloadId) as Array<{ chunk_order: number; chunk_bytes: Uint8Array }>;
        if (chunks.length !== index.chunk_count || chunks.some((entry, order) => entry.chunk_order !== order)) {
          reasons.push(`payload_chunks_invalid:${payloadId}`);
          continue;
        }
        const stored = Buffer.concat(chunks.map((entry) => Buffer.from(entry.chunk_bytes)));
        const raw = index.compression_status === "gzip" ? gunzipSync(stored) : stored;
        if (raw.byteLength !== index.raw_size_bytes || sha256Hex(raw) !== index.content_hash) {
          reasons.push(`payload_hash_mismatch:${payloadId}`);
          continue;
        }
        if (payloadId === packet?.payload.request_payload_id) reconstructedRequestHash = `sha256:${sha256Hex(raw)}`;
        const kind = Object.entries(payloadKinds).find(([, id]) => id === payloadId)?.[0];
        if (kind && kind !== "review-request-packet") {
          try {
            reconstructedKinds.set(kind, JSON.parse(raw.toString("utf8")) as unknown);
          } catch {
            reasons.push(`payload_json_invalid:${kind}`);
          }
        }
        reconstructed += 1;
      }
    } finally {
      database.close();
    }
    if (!reconstructedRequestHash || reconstructedRequestHash !== packet?.payload.request_content_hash) reasons.push("request_materialization_mismatch");
    for (const [kind, idField, hashField] of [
      ["context-core", "context_core_id", "context_core_hash"],
      ["context-manifest", "context_manifest_id", "context_manifest_hash"],
      ["review-delta-overlay", "delta_overlay_id", "delta_overlay_hash"]
    ] as const) {
      const value = reconstructedKinds.get(kind) as Record<string, unknown> | undefined;
      if (!value || value[idField] !== packet?.payload[idField] || value.content_hash !== packet?.payload[hashField]) {
        reasons.push(`payload_object_identity_mismatch:${kind}`);
      }
    }
    return {
      run_instance_id: runInstanceId,
      eligible: reasons.length === 0,
      source_status: run?.lifecycle_status ?? "missing",
      ...(packet ? { packet_record_id: packet.record_id } : {}),
      ...(approvedAttemptId ? { approved_attempt_id: approvedAttemptId } : {}),
      ...(acceptedArtifactId ? { accepted_artifact_id: acceptedArtifactId } : {}),
      ...(acceptedResultId ? { accepted_result_id: acceptedResultId } : {}),
      payload_count: payloadIds.length,
      reconstructed_payload_count: reconstructed,
      reasons: [...new Set(reasons)].sort()
    };
  }

  saveAcceptedRun(
    run: Run,
    deliveryFacts: DeliveryFactRecord[],
    harvestRecord: HarvestRecord
  ): void {
    if (!hasExactRunIdentity(run)) {
      throw new Error(`Accepted run ${run.run_id} lacks exact immutable identity.`);
    }
    const sourceStagingPath = run.source_staging_db_path
      ?? path.join(this.targetRoot, ".harness", "runs", run.run_id, "staging.sqlite");
    const transfer = fs.existsSync(sourceStagingPath)
      ? namespaceProjectTransferSnapshot(
          run.run_instance_id,
          run.run_id,
          readStagingTransferSnapshot(sourceStagingPath, run.run_id, run.run_instance_id)
        )
      : undefined;
    const namespacedDeliveryFacts = namespaceProjectDeliveryFacts(run.run_instance_id, deliveryFacts);
    const database = this.open();

    try {
      database.exec("BEGIN IMMEDIATE;");
      migrateProjectExactAuthority(database);
      const existingExactHarvest = database.prepare(
        "SELECT harvest_json FROM project_harvest_records_exact WHERE run_instance_id = ?"
      ).get(run.run_instance_id) as { harvest_json?: string } | undefined;
      if (existingExactHarvest?.harvest_json) {
        throw new HarvestConflictError(run.run_id);
      }
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
      database.prepare([
        "INSERT OR REPLACE INTO project_run_instances",
        "(run_instance_id, run_id, project_run_id, run_json, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        run.run_instance_id,
        run.run_id,
        run.run_instance_id,
        stringify(run),
        run.created_at,
        run.updated_at
      );

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

        const proofRows = transfer.records.filter((row) => row.record_kind === "proof_record");
        if (run.phase_id === "23.9" && run.run_mode === "normal" && proofRows.length !== 1) {
          throw new Error(`project_proof_transfer_requires_one_accepted_proof:${proofRows.length}`);
        }
        if (proofRows.length > 1) {
          throw new Error("project_proof_transfer_corrupt");
        }
        if (proofRows.length === 1) {
          const proof = proofRows[0];
          const parsedProof = JSON.parse(proof.payload_json) as { acceptance?: { status?: string }; record_id?: string };
          if (parsedProof.acceptance?.status !== "accepted" || parsedProof.record_id !== proof.record_id.replace(`${run.run_instance_id}:`, "")) {
            throw new Error("project_proof_transfer_corrupt");
          }
          const destinationProofId = proof.record_id;
          const sourceProofId = parsedProof.record_id;
          const payloadHash = `sha256:${sha256Hex(Buffer.from(proof.payload_json))}`;
          const mapping = {
            source_run_instance_id: run.run_instance_id,
            project_run_id: run.run_instance_id,
            source_proof_record_id: sourceProofId,
            destination_proof_record_id: destinationProofId,
            harvest_id: harvestRecord.harvest_id
          };
          const mappingHash = `sha256:${createHash("sha256").update(canonicalJson(mapping)).digest("hex")}`;
          const receiptBody = {
            schema_version: 1,
            record_kind: "proof_transfer_receipt",
            ...mapping,
            payload_hash: payloadHash,
            mapping_hash: mappingHash,
            created_at: harvestRecord.promoted_at
          };
          const receiptId = `sha256:${createHash("sha256").update(canonicalJson(receiptBody)).digest("hex")}`;
          const receipt = { ...receiptBody, receipt_id: receiptId };
          database.prepare([
            "INSERT INTO records",
            "(record_kind, record_id, run_id, phase_id, task_path, created_at, status, summary, payload_json, source_step_id, source_command, sensitivity, retention_class)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)"
          ].join(" ")).run(
            "proof_transfer_receipt",
            receiptId,
            run.run_instance_id,
            run.phase_id ?? null,
            run.active_task_path ?? run.task_path,
            harvestRecord.promoted_at,
            "accepted",
            "Atomic proof transfer receipt",
            canonicalJson(receipt),
            "node bin/ch run harvest",
            "local",
            "accepted"
          );
          const proofReadback = database.prepare(
            "SELECT payload_json FROM records WHERE record_kind = 'proof_record' AND record_id = ? AND run_id = ?"
          ).get(destinationProofId, run.run_instance_id) as { payload_json?: string } | undefined;
          const receiptReadback = database.prepare(
            "SELECT payload_json FROM records WHERE record_kind = 'proof_transfer_receipt' AND record_id = ? AND run_id = ?"
          ).get(receiptId, run.run_instance_id) as { payload_json?: string } | undefined;
          if (proofReadback?.payload_json !== proof.payload_json || receiptReadback?.payload_json !== canonicalJson(receipt)) {
            throw new Error("project_proof_transfer_corrupt");
          }
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

        for (const row of transfer.procedureArtifacts) {
          const payloadIndex = database.prepare([
            "SELECT parent_record_id, source_run_id, kind, media_type, compression_status, chunk_count, raw_size_bytes, content_hash",
            "FROM payload_index WHERE payload_id = ?"
          ].join(" ")).get(row.payload_id) as Record<string, unknown> | undefined;
          const linked = database.prepare(
            "SELECT 1 AS linked FROM payload_links WHERE payload_id = ? AND parent_record_id = ? AND link_role = ?"
          ).get(row.payload_id, `${row.run_instance_id}:${row.artifact_id}`, `procedure-artifact-body:${row.procedure_id}`) as { linked?: number } | undefined;
          const direct = payloadIndex?.parent_record_id === `${row.run_instance_id}:${row.artifact_id}`
            && payloadIndex?.kind === `procedure-artifact-body:${row.procedure_id}`;
          if (!payloadIndex
            || (!direct && linked?.linked !== 1)
            || payloadIndex.source_run_id !== row.source_run_id
            || payloadIndex.media_type !== "text/markdown"
            || !["identity", "gzip"].includes(String(payloadIndex.compression_status))
            || payloadIndex.content_hash !== row.content_hash) {
            throw new Error(`Procedure artifact harvest rejects a mismatched payload index for ${row.artifact_id}.`);
          }
          const payloadChunks = database.prepare(
            "SELECT chunk_order, chunk_bytes FROM payload_chunks WHERE payload_id = ? ORDER BY chunk_order ASC"
          ).all(row.payload_id) as Array<{ chunk_order: number; chunk_bytes: Uint8Array }>;
          if (payloadChunks.length !== payloadIndex.chunk_count || payloadChunks.some((chunk, order) => chunk.chunk_order !== order)) {
            throw new Error(`Procedure artifact harvest rejects malformed payload chunks for ${row.artifact_id}.`);
          }
          const storedPayload = Buffer.concat(payloadChunks.map((chunk) => Buffer.from(chunk.chunk_bytes)));
          const rawPayload = payloadIndex.compression_status === "gzip" ? gunzipSync(storedPayload) : storedPayload;
          if (rawPayload.byteLength !== payloadIndex.raw_size_bytes || sha256Hex(rawPayload) !== row.content_hash) {
            throw new Error(`Procedure artifact harvest rejects a payload body mismatch for ${row.artifact_id}.`);
          }
          const existing = database.prepare([
            "SELECT source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json,",
            "reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id",
            "FROM procedure_artifacts WHERE run_instance_id = ? AND procedure_id = ? AND artifact_id = ?"
          ].join(" ")).get(row.run_instance_id, row.procedure_id, row.artifact_id) as ProcedureArtifactRow | undefined;
          if (existing) {
            for (const [key, value] of Object.entries({
              source_run_id: row.source_run_id,
              procedure_id: row.procedure_id,
              artifact_id: row.artifact_id,
              payload_id: row.payload_id,
              content_hash: row.content_hash,
              recorded_at: row.recorded_at,
              provenance_json: row.provenance_json,
              reviewed_plan_artifact_id: row.reviewed_plan_artifact_id,
              reviewed_plan_content_hash: row.reviewed_plan_content_hash,
              reviewed_evidence_artifact_id: row.reviewed_evidence_artifact_id
            })) {
              if (existing[key as keyof ProcedureArtifactRow] !== value) {
                throw new Error(`Procedure artifact harvest conflict for ${row.artifact_id}: ${key} does not match the accepted descriptor.`);
              }
            }
          } else {
            database.prepare([
              "INSERT INTO procedure_artifacts",
              "(run_instance_id, source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json, reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id)",
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ].join(" ")).run(
              row.run_instance_id,
              row.source_run_id,
              row.procedure_id,
              row.artifact_id,
              row.payload_id,
              row.content_hash,
              row.recorded_at,
              row.provenance_json,
              row.reviewed_plan_artifact_id,
              row.reviewed_plan_content_hash,
              row.reviewed_evidence_artifact_id
            );
          }
        }
      } else {
        for (const fact of namespacedDeliveryFacts) {
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

      const expectedTransfer = harvestRecord.details;
      const destinationDescriptor = database.prepare([
        "SELECT COUNT(*) AS descriptor_count, COUNT(DISTINCT payload_id) AS payload_count",
        "FROM procedure_artifacts WHERE run_instance_id = ?"
      ].join(" ")).get(run.run_instance_id) as { descriptor_count?: number; payload_count?: number } | undefined;
      const destinationPayload = database.prepare([
        "SELECT COALESCE(SUM(pi.chunk_count), 0) AS chunk_count, COALESCE(SUM(pi.raw_size_bytes), 0) AS byte_count",
        "FROM payload_index pi WHERE pi.payload_id IN (SELECT DISTINCT payload_id FROM procedure_artifacts WHERE run_instance_id = ?)"
      ].join(" ")).get(run.run_instance_id) as { chunk_count?: number; byte_count?: number } | undefined;
      const destinationTransfer = {
        procedure_artifact_transfer_count: Number(destinationDescriptor?.descriptor_count ?? 0),
        procedure_artifact_payload_transfer_count: Number(destinationDescriptor?.payload_count ?? 0),
        procedure_artifact_payload_chunk_transfer_count: Number(destinationPayload?.chunk_count ?? 0),
        procedure_artifact_payload_byte_count: Number(destinationPayload?.byte_count ?? 0)
      };
      for (const [field, actual] of Object.entries(destinationTransfer)) {
        const expected = expectedTransfer[field as keyof typeof expectedTransfer];
        if (expected !== undefined && expected !== actual) {
          throw new Error(`Procedure artifact harvest source/destination transfer mismatch for ${field}.`);
        }
      }

      database.prepare([
        "INSERT OR REPLACE INTO harvest_records",
        "(harvest_id, run_id, project_run_id, status, promoted_at, accepted_count, discarded_count, quarantined_count, redacted_count, unresolved_count, source_task_path, source_snapshot, details_json)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        harvestRecord.harvest_id,
        run.run_instance_id,
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
      database.prepare([
        "INSERT INTO project_harvest_records_exact",
        "(run_instance_id, run_id, promoted_at, harvest_json)",
        "VALUES (?, ?, ?, ?)"
      ].join(" ")).run(
        run.run_instance_id,
        harvestRecord.run_id,
        harvestRecord.promoted_at,
        stringify({
          ...harvestRecord,
          project_run_id: run.run_instance_id
        } satisfies HarvestRecord)
      );
      database.prepare(
        "INSERT OR REPLACE INTO maintenance_events (event_id, db_role, event_kind, created_at, details_json) VALUES (?, ?, ?, ?, ?)"
      ).run(`harvest-${run.run_instance_id}`, "project", "harvest", nowIso(), stringify(harvestRecord));
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      const message = error instanceof Error ? error.message : String(error);
      if (/constraint failed/i.test(message) && /(harvest_records|project_harvest_records_exact)/i.test(message)) {
        throw new HarvestConflictError(run.run_id);
      }
      throw error;
    } finally {
      database.close();
    }
  }

  readProcedureArtifactBody(input: { projectRunId: string; procedureArtifactId: string; procedureId?: string }): AuthoritativeProcedureArtifactBody {
    if (!input.projectRunId.trim() || !input.procedureArtifactId.startsWith("sha256:")) {
      throw new Error("Authoritative procedure-artifact readback requires an exact project run ID and sha256 artifact ID.");
    }
    const registry = readSelfHostingProcedureRegistry(this.targetRoot);
    const proceduresById = registry ? indexSelfHostingProceduresById(registry) : undefined;
    if (!proceduresById || (input.procedureId && !proceduresById.has(input.procedureId))) {
      throw new Error(`Authoritative procedure-artifact readback rejects an unresolved canonical procedure ID: ${input.procedureId ?? "<registry unavailable>"}.`);
    }
    const database = this.open();
    try {
      const rows = database.prepare([
        "SELECT run_instance_id, source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json,",
        "reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id",
        `FROM procedure_artifacts WHERE run_instance_id = ? AND artifact_id = ?${input.procedureId ? " AND procedure_id = ?" : ""}`
      ].join(" ")).all(...(input.procedureId
        ? [input.projectRunId, input.procedureArtifactId, input.procedureId]
        : [input.projectRunId, input.procedureArtifactId])) as ProcedureArtifactRow[];
      if (rows.length !== 1) {
        throw new Error(`Authoritative procedure-artifact readback could not prove one exact descriptor for ${input.procedureArtifactId}.`);
      }
      const row = rows[0];
      if (row.source_run_id !== input.projectRunId || row.content_hash !== row.artifact_id.slice("sha256:".length)) {
        throw new Error("Authoritative procedure-artifact descriptor is malformed or does not match its exact project run.");
      }
      if (!proceduresById.has(row.procedure_id) || (input.procedureId && row.procedure_id !== input.procedureId)) {
        throw new Error("Authoritative procedure-artifact descriptor does not match its canonical procedure identity.");
      }
      if ((row.reviewed_plan_artifact_id === null) !== (row.reviewed_plan_content_hash === null)
        || (row.reviewed_plan_artifact_id !== null && row.reviewed_plan_content_hash !== row.reviewed_plan_artifact_id.slice("sha256:".length))) {
        throw new Error("Authoritative procedure-artifact reviewed-plan binding is malformed.");
      }
      const provenance = parseAuthoritativeProcedureProvenance(row.provenance_json, row.procedure_id);
      if (row.procedure_id === "plan-review" && (row.reviewed_plan_artifact_id || provenance.phase_id === "23.8.6D")) {
        if (!row.reviewed_plan_artifact_id || !row.reviewed_plan_content_hash) {
          throw new Error("Authoritative plan-review readback requires an exact reviewed-plan binding.");
        }
        const planRows = database.prepare([
          "SELECT procedure_id, content_hash FROM procedure_artifacts",
          "WHERE run_instance_id = ? AND artifact_id = ?"
        ].join(" ")).all(input.projectRunId, row.reviewed_plan_artifact_id) as Array<{ procedure_id: string; content_hash: string }>;
        if (planRows.length !== 1
          || !["draft-plan", "plan-amend"].includes(planRows[0].procedure_id)
          || planRows[0].content_hash !== row.reviewed_plan_content_hash) {
          throw new Error("Authoritative plan-review readback rejects a missing, ambiguous, or mismatched reviewed-plan descriptor.");
        }
        if (row.reviewed_evidence_artifact_id !== row.reviewed_plan_artifact_id) {
          throw new Error("Authoritative plan-review readback rejects a mismatched reviewed-evidence binding.");
        }
      }
      const index = database.prepare([
        "SELECT parent_record_id, source_run_id, kind, media_type, compression_status, chunk_count, raw_size_bytes, content_hash",
        "FROM payload_index WHERE payload_id = ?"
      ].join(" ")).get(row.payload_id) as Record<string, unknown> | undefined;
      const linked = database.prepare(
        "SELECT 1 AS linked FROM payload_links WHERE payload_id = ? AND parent_record_id = ? AND link_role = ?"
      ).get(row.payload_id, `${input.projectRunId}:${row.artifact_id}`, `procedure-artifact-body:${row.procedure_id}`) as { linked?: number } | undefined;
      const direct = index?.parent_record_id === `${input.projectRunId}:${row.artifact_id}`
        && index?.kind === `procedure-artifact-body:${row.procedure_id}`;
      if (!index || (!direct && linked?.linked !== 1) || index.source_run_id !== input.projectRunId
        || index.media_type !== "text/markdown"
        || !["identity", "gzip"].includes(String(index.compression_status)) || index.content_hash !== row.content_hash) {
        throw new Error("Authoritative procedure-artifact payload index does not match its descriptor.");
      }
      const chunks = database.prepare(
        "SELECT chunk_order, chunk_bytes FROM payload_chunks WHERE payload_id = ? ORDER BY chunk_order ASC"
      ).all(row.payload_id) as Array<{ chunk_order: number; chunk_bytes: Uint8Array }>;
      if (chunks.length !== index.chunk_count || chunks.some((chunk, order) => chunk.chunk_order !== order)) {
        throw new Error("Authoritative procedure-artifact payload chunks are missing, duplicated, or out of order.");
      }
      const stored = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.chunk_bytes)));
      const raw = index.compression_status === "gzip" ? gunzipSync(stored) : stored;
      if (raw.byteLength !== index.raw_size_bytes || sha256Hex(raw) !== row.content_hash) {
        throw new Error("Authoritative procedure-artifact body hash does not match its immutable descriptor.");
      }
      return {
        project_run_id: input.projectRunId,
        procedure_id: row.procedure_id,
        artifact_id: row.artifact_id,
        content_hash: row.content_hash,
        recorded_at: row.recorded_at,
        body: raw.toString("utf8"),
        provenance,
        ...(row.reviewed_plan_artifact_id ? { reviewed_plan_artifact_id: row.reviewed_plan_artifact_id } : {}),
        ...(row.reviewed_plan_content_hash ? { reviewed_plan_content_hash: row.reviewed_plan_content_hash } : {}),
        ...(row.reviewed_evidence_artifact_id ? { reviewed_evidence_artifact_id: row.reviewed_evidence_artifact_id } : {})
      };
    } finally {
      database.close();
    }
  }

  getRunByInstanceIdReadOnly(runInstanceId: string): Run | undefined {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      const row = database.prepare("SELECT run_instance_id, run_id, run_json FROM project_run_instances WHERE run_instance_id = ?")
        .get(runInstanceId) as { run_instance_id?: string; run_id?: string; run_json?: string } | undefined;
      return row ? parseAcceptedRuntimeRun(row.run_json, String(row.run_instance_id), String(row.run_id)) : undefined;
    } finally { database.close(); }
  }

  getHarvestRecordByRunInstanceIdReadOnly(runInstanceId: string): HarvestRecord | undefined {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      const row = database.prepare(
        "SELECT run_instance_id, run_id, harvest_json FROM project_harvest_records_exact WHERE run_instance_id = ?"
      ).get(runInstanceId) as { run_instance_id?: string; run_id?: string; harvest_json?: string } | undefined;
      return row ? parseExactHarvestRecord(row.harvest_json, String(row.run_instance_id), String(row.run_id)) : undefined;
    } finally { database.close(); }
  }

  listRunsByDisplayRunIdReadOnly(runId: string): Run[] {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      return (database.prepare("SELECT run_instance_id, run_id, run_json FROM project_run_instances WHERE run_id = ? ORDER BY updated_at DESC")
        .all(runId) as Array<{ run_instance_id: string; run_id: string; run_json?: string }>)
        .map((row) => parseAcceptedRuntimeRun(row.run_json, row.run_instance_id, row.run_id));
    } finally { database.close(); }
  }

  listAcceptedRecordDescriptorsReadOnly(runInstanceId: string): AcceptedRecordDescriptor[] {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      return database.prepare([
        "SELECT record_id, record_kind, task_path, created_at, status, source_step_id, source_command",
        "FROM records WHERE run_id = ? ORDER BY created_at ASC, record_kind ASC, record_id ASC"
      ].join(" ")).all(runInstanceId) as AcceptedRecordDescriptor[];
    } finally { database.close(); }
  }

  listAcceptedDeliveryFactDescriptorsReadOnly(runInstanceId: string): AcceptedDeliveryFactDescriptor[] {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      return database.prepare([
        "SELECT delivery_fact_id, fact_kind, recorded_at, commit_sha, excerpt_payload_id",
        "FROM delivery_facts WHERE run_id = ? ORDER BY recorded_at ASC, delivery_fact_id ASC"
      ].join(" ")).all(runInstanceId) as AcceptedDeliveryFactDescriptor[];
    } finally { database.close(); }
  }

  listAcceptedProcedureArtifactDescriptorsReadOnly(runInstanceId: string): AcceptedProcedureArtifactDescriptor[] {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      const rows = database.prepare([
        "SELECT procedure_id, artifact_id, payload_id, content_hash, recorded_at, reviewed_plan_artifact_id,",
        "reviewed_plan_content_hash, reviewed_evidence_artifact_id FROM procedure_artifacts",
        "WHERE run_instance_id = ? AND source_run_id = ? ORDER BY recorded_at ASC, procedure_id ASC, artifact_id ASC"
      ].join(" ")).all(runInstanceId, runInstanceId) as AcceptedProcedureArtifactDescriptor[];
      const registry = readSelfHostingProcedureRegistry(this.targetRoot);
      const procedures = registry ? indexSelfHostingProceduresById(registry) : undefined;
      if (!procedures || rows.some((row) => !procedures.has(row.procedure_id)
        || !/^sha256:[a-f0-9]{64}$/u.test(row.artifact_id)
        || row.content_hash !== row.artifact_id.slice("sha256:".length)
        || !row.payload_id.startsWith(`${runInstanceId}:`))) {
        throw new Error("ACCEPTED_PROCEDURE_ARTIFACT_DESCRIPTOR_INVALID");
      }
      return rows;
    } finally { database.close(); }
  }

  listAcceptedPayloadDescriptorsReadOnly(runInstanceId: string): AcceptedPayloadDescriptor[] {
    const prefix = `${runInstanceId}:%`;
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      return database.prepare([
        "SELECT payload_id, parent_record_id, kind, bounded_excerpt, redaction_status, retention_class,",
        "raw_size_bytes, content_hash, created_at FROM payload_index",
        "WHERE source_run_id = ? AND payload_id LIKE ? ORDER BY created_at ASC, payload_id ASC"
      ].join(" ")).all(runInstanceId, prefix) as AcceptedPayloadDescriptor[];
    } finally { database.close(); }
  }

  listAcceptedPayloadLinkDescriptorsReadOnly(runInstanceId: string): AcceptedPayloadLinkDescriptor[] {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      return database.prepare([
        "SELECT pl.payload_id, pl.parent_record_id, pl.link_role FROM payload_links pl",
        "JOIN payload_index pi ON pi.payload_id = pl.payload_id",
        "WHERE pi.source_run_id = ? ORDER BY pl.payload_id ASC, pl.parent_record_id ASC, pl.link_role ASC"
      ].join(" ")).all(runInstanceId) as AcceptedPayloadLinkDescriptor[];
    } finally { database.close(); }
  }

  listAcceptedProofRecordsReadOnly(runInstanceId: string): unknown[] {
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      const rows = database.prepare([
        "SELECT payload_json FROM records WHERE record_kind = 'proof_record' AND run_id = ?",
        "ORDER BY created_at ASC, record_id ASC"
      ].join(" ")).all(runInstanceId) as Array<{ payload_json: string }>;
      return rows.map((row) => JSON.parse(row.payload_json));
    } finally { database.close(); }
  }

  readPayloadBodyReadOnly(runInstanceId: string, payloadId: string): ReadOnlyStoredPayload | undefined {
    return this.readPayloadBodiesReadOnly(runInstanceId, [payloadId])[0];
  }

  readPayloadBodiesReadOnly(runInstanceId: string, payloadIds: string[]): ReadOnlyStoredPayload[] {
    if (new Set(payloadIds).size !== payloadIds.length) throw new Error("PAYLOAD_READ_IDS_AMBIGUOUS");
    const database = openSqliteDatabaseReadOnly(this.projectDbPath);
    try {
      return payloadIds.flatMap((payloadId) => {
        const payload = readStoredPayloadBody(database, namespaceProjectRowId(runInstanceId, payloadId), payloadId);
        return payload ? [payload] : [];
      });
    } finally { database.close(); }
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
