import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { type DeliveryFactRecord, type LifecycleStatus, type RunMode } from "./lifecycle-types";
import { PAYLOAD_WARNING_THRESHOLD_BYTES, PayloadStore, type StorePayloadInput } from "./payload-store";
import {
  HARNESS_DIR,
  MEMORY_EXPORTS_DIR,
  PROJECT_MEMORY_DB_PATH,
  getRunCloseoutRelativePath,
  getRunDirectoryRelativePath,
  getRunJsonRelativePath,
  getRunStagingDbRelativePath
} from "./paths";
import { type DatabaseLike, openSqliteDatabase } from "./sqlite";
import { detectGitRepository } from "./git";
import { type Run } from "./runtime";
import { indexSelfHostingProceduresById, readSelfHostingProcedureRegistry } from "./self-hosting-procedures";

interface MutateRunOptions {
  expectedRunInstanceId?: string;
  expectedRunRevision?: number;
  expectedRunPresence?: "present" | "absent";
  seedRunIfMissing?: Run;
}

export interface HarnessRoots {
  targetRoot: string;
  projectRoot: string;
}

export interface MemoryDbPaths {
  targetRoot: string;
  projectRoot: string;
  projectDbPath: string;
  exportsRoot: string;
  runDirectory?: string;
  runJsonPath?: string;
  closeoutPath?: string;
  stagingDbPath?: string;
}

export interface DatabaseStatus {
  path: string;
  exists: boolean;
  sizeBytes: number;
  integrity: string;
  journalMode: string;
  sizeWarningThresholdBytes: number;
  payloadWarningThresholdBytes: number;
  oversizedPayloadCount: number;
  redactedPayloadCount: number;
  quarantinedPayloadCount: number;
  discardedPayloadCount: number;
  warnings: string[];
}

export interface ProcedureArtifactDescriptor {
  run_instance_id: string;
  source_run_id: string;
  procedure_id: string;
  artifact_id: string;
  payload_id: string;
  content_hash: string;
  recorded_at: string;
  provenance_json: string;
  reviewed_plan_artifact_id?: string;
  reviewed_plan_content_hash?: string;
  reviewed_evidence_artifact_id?: string;
}

export interface StagedProcedureArtifactBody {
  procedure_id: string;
  artifact_id: string;
  content_hash: string;
  body: string;
}

interface NormalizedRecordRow {
  recordKind: string;
  recordId: string;
  runId: string;
  phaseId?: string;
  taskPath: string;
  createdAt: string;
  status?: string;
  summary: string;
  payloadJson: string;
  sourceStepId?: string;
  sourceCommand?: string;
  sensitivity: string;
  retentionClass: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertAuthoritativeProcedureProvenance(value: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Authoritative procedure-artifact provenance is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Authoritative procedure-artifact provenance must be an object.");
  }
  for (const field of ["phase_id", "task_path", "worktree", "branch", "head", "source_snapshot", "base_commit", "compatibility_path"]) {
    if (typeof (parsed as Record<string, unknown>)[field] !== "string" || !(parsed as Record<string, string>)[field].trim()) {
      throw new Error(`Authoritative procedure-artifact provenance is missing ${field}.`);
    }
  }
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function safeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

// These thresholds are review prompts, not hard limits. They keep Phase 23.5
// operator-facing maintenance explicit without introducing background automation.
export const RUN_STAGING_DB_WARNING_THRESHOLD_BYTES = 16 * 1024 * 1024;
export const PROJECT_MEMORY_DB_WARNING_THRESHOLD_BYTES = 64 * 1024 * 1024;

export function resolveHarnessRoots(cwd: string): HarnessRoots {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("This command must run inside a git repository.");
  }

  return {
    targetRoot: gitStatus.rootPath,
    projectRoot: gitStatus.canonicalRootPath ?? gitStatus.rootPath
  };
}

export function resolveMemoryDbPaths(targetRoot: string, projectRoot: string, runId?: string): MemoryDbPaths {
  return {
    targetRoot,
    projectRoot,
    projectDbPath: path.join(projectRoot, PROJECT_MEMORY_DB_PATH),
    exportsRoot: path.join(projectRoot, MEMORY_EXPORTS_DIR),
    ...(runId
      ? {
          runDirectory: path.join(targetRoot, getRunDirectoryRelativePath(runId)),
          runJsonPath: path.join(targetRoot, getRunJsonRelativePath(runId)),
          closeoutPath: path.join(targetRoot, getRunCloseoutRelativePath(runId)),
          stagingDbPath: path.join(targetRoot, getRunStagingDbRelativePath(runId))
        }
      : {})
  };
}

export function initializeMemoryDatabase(database: DatabaseLike, role: "project" | "staging"): void {
  const statements = [
    "PRAGMA journal_mode = WAL;",
    "PRAGMA wal_autocheckpoint = 1000;",
    "PRAGMA auto_vacuum = INCREMENTAL;",
    "PRAGMA optimize;",
    "CREATE TABLE IF NOT EXISTS db_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS runs (",
    "  run_id TEXT PRIMARY KEY,",
    "  task_path TEXT NOT NULL,",
    "  active_task_path TEXT,",
    "  phase_id TEXT,",
    "  run_mode TEXT NOT NULL,",
    "  lifecycle_status TEXT NOT NULL,",
    "  created_at TEXT NOT NULL,",
    "  updated_at TEXT NOT NULL,",
    "  target_root TEXT NOT NULL,",
    "  project_root TEXT NOT NULL,",
    "  repository_json TEXT NOT NULL,",
    "  run_json TEXT NOT NULL,",
    "  discard_reason TEXT,",
    "  manual_override_reason TEXT,",
    "  harvested_at TEXT,",
    "  source_snapshot TEXT",
    ");",
    "CREATE TABLE IF NOT EXISTS records (",
    "  record_kind TEXT NOT NULL,",
    "  record_id TEXT NOT NULL,",
    "  run_id TEXT NOT NULL,",
    "  phase_id TEXT,",
    "  task_path TEXT NOT NULL,",
    "  created_at TEXT NOT NULL,",
    "  status TEXT,",
    "  summary TEXT NOT NULL,",
    "  payload_json TEXT NOT NULL,",
    "  source_step_id TEXT,",
    "  source_command TEXT,",
    "  sensitivity TEXT NOT NULL,",
    "  retention_class TEXT NOT NULL,",
    "  PRIMARY KEY (record_kind, record_id, run_id)",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_records_run ON records (run_id, record_kind, created_at);",
    "CREATE TABLE IF NOT EXISTS delivery_facts (",
    "  delivery_fact_id TEXT PRIMARY KEY,",
    "  run_id TEXT NOT NULL,",
    "  fact_kind TEXT NOT NULL,",
    "  source TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  recorded_at TEXT NOT NULL,",
    "  summary TEXT NOT NULL,",
    "  url TEXT,",
    "  external_run_id TEXT,",
    "  commit_sha TEXT,",
    "  excerpt_payload_id TEXT,",
    "  fact_json TEXT NOT NULL",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_delivery_run ON delivery_facts (run_id, fact_kind, recorded_at);",
    "CREATE TABLE IF NOT EXISTS harvest_records (",
    "  harvest_id TEXT PRIMARY KEY,",
    "  run_id TEXT NOT NULL UNIQUE,",
    "  project_run_id TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  promoted_at TEXT NOT NULL,",
    "  accepted_count INTEGER NOT NULL,",
    "  discarded_count INTEGER NOT NULL,",
    "  quarantined_count INTEGER NOT NULL,",
    "  redacted_count INTEGER NOT NULL,",
    "  unresolved_count INTEGER NOT NULL,",
    "  source_task_path TEXT NOT NULL,",
    "  source_snapshot TEXT NOT NULL,",
    "  details_json TEXT NOT NULL",
    ");",
    ...(role === "project"
      ? [
          "CREATE TABLE IF NOT EXISTS project_run_instances (",
          "  run_instance_id TEXT PRIMARY KEY,",
          "  run_id TEXT NOT NULL,",
          "  project_run_id TEXT NOT NULL UNIQUE,",
          "  run_json TEXT NOT NULL,",
          "  created_at TEXT NOT NULL,",
          "  updated_at TEXT NOT NULL",
          ");",
          "CREATE INDEX IF NOT EXISTS idx_project_run_instances_display ON project_run_instances (run_id, updated_at);",
          "CREATE TABLE IF NOT EXISTS project_harvest_records_exact (",
          "  run_instance_id TEXT PRIMARY KEY,",
          "  run_id TEXT NOT NULL,",
          "  promoted_at TEXT NOT NULL,",
          "  harvest_json TEXT NOT NULL",
          ");",
          "CREATE INDEX IF NOT EXISTS idx_project_harvest_records_display ON project_harvest_records_exact (run_id, promoted_at);",
          "CREATE TABLE IF NOT EXISTS legacy_unresolved_runs (",
          "  legacy_row_id TEXT PRIMARY KEY,",
          "  run_id TEXT NOT NULL,",
          "  run_json TEXT NOT NULL,",
          "  blocker_reason TEXT NOT NULL,",
          "  captured_at TEXT NOT NULL",
          ");",
          "CREATE INDEX IF NOT EXISTS idx_legacy_unresolved_runs_display ON legacy_unresolved_runs (run_id, captured_at);"
        ]
      : []),
    "CREATE TABLE IF NOT EXISTS maintenance_events (",
    "  event_id TEXT PRIMARY KEY,",
    "  db_role TEXT NOT NULL,",
    "  event_kind TEXT NOT NULL,",
    "  created_at TEXT NOT NULL,",
    "  details_json TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS payload_index (",
    "  payload_id TEXT PRIMARY KEY,",
    "  parent_record_id TEXT NOT NULL,",
    "  source_run_id TEXT NOT NULL,",
    "  source_phase_id TEXT,",
    "  source_step_id TEXT,",
    "  kind TEXT NOT NULL,",
    "  media_type TEXT NOT NULL,",
    "  summary TEXT NOT NULL,",
    "  searchable_text TEXT,",
    "  bounded_excerpt TEXT,",
    "  redaction_status TEXT NOT NULL,",
    "  retention_class TEXT NOT NULL,",
    "  compression_status TEXT NOT NULL,",
    "  chunk_count INTEGER NOT NULL,",
    "  raw_size_bytes INTEGER NOT NULL,",
    "  stored_size_bytes INTEGER NOT NULL,",
    "  content_hash TEXT NOT NULL,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS payload_chunks (",
    "  payload_id TEXT NOT NULL,",
    "  chunk_order INTEGER NOT NULL,",
    "  chunk_bytes BLOB NOT NULL,",
    "  PRIMARY KEY (payload_id, chunk_order)",
    ");",
    "CREATE TABLE IF NOT EXISTS payload_redactions (",
    "  payload_id TEXT PRIMARY KEY,",
    "  redaction_status TEXT NOT NULL,",
    "  details_json TEXT NOT NULL,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS payload_retention (",
    "  payload_id TEXT PRIMARY KEY,",
    "  retention_class TEXT NOT NULL,",
    "  details_json TEXT NOT NULL,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS payload_links (",
    "  payload_id TEXT NOT NULL,",
    "  parent_record_id TEXT NOT NULL,",
    "  link_role TEXT NOT NULL,",
    "  created_at TEXT NOT NULL,",
    "  PRIMARY KEY (payload_id, parent_record_id, link_role)",
    ");",
    "CREATE TABLE IF NOT EXISTS procedure_artifacts (",
    "  run_instance_id TEXT NOT NULL,",
    "  source_run_id TEXT NOT NULL,",
    "  procedure_id TEXT NOT NULL,",
    "  artifact_id TEXT NOT NULL,",
    "  payload_id TEXT NOT NULL,",
    "  content_hash TEXT NOT NULL,",
    "  recorded_at TEXT NOT NULL,",
    "  provenance_json TEXT NOT NULL,",
    "  reviewed_plan_artifact_id TEXT,",
    "  reviewed_plan_content_hash TEXT,",
    "  reviewed_evidence_artifact_id TEXT,",
    "  PRIMARY KEY (run_instance_id, procedure_id, artifact_id)",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_procedure_artifacts_run ON procedure_artifacts (run_instance_id, procedure_id, recorded_at);",
    "CREATE INDEX IF NOT EXISTS idx_payload_run ON payload_index (source_run_id, kind, created_at);"
  ];
  database.exec(statements.join("\n"));

  database.prepare("INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)").run("role", role);
  database.prepare("INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)").run("initialized_at", nowIso());
  database.prepare("INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)").run(
    "payload_warning_threshold_bytes",
    String(PAYLOAD_WARNING_THRESHOLD_BYTES)
  );
  database.prepare("INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)").run(
    "db_warning_threshold_bytes",
    String(role === "project" ? PROJECT_MEMORY_DB_WARNING_THRESHOLD_BYTES : RUN_STAGING_DB_WARNING_THRESHOLD_BYTES)
  );
}

function openInitializedDatabase(databasePath: string, role: "project" | "staging"): DatabaseLike {
  const database = openSqliteDatabase(databasePath);
  initializeMemoryDatabase(database, role);
  return database;
}

function databaseStatus(databasePath: string, role: "project" | "staging"): DatabaseStatus {
  const sizeWarningThresholdBytes = role === "project"
    ? PROJECT_MEMORY_DB_WARNING_THRESHOLD_BYTES
    : RUN_STAGING_DB_WARNING_THRESHOLD_BYTES;
  const exists = fs.existsSync(databasePath);

  if (!exists) {
    return {
      path: databasePath,
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

  const database = openInitializedDatabase(databasePath, role);
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
    const sizeBytes = fs.statSync(databasePath).size;
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
      path: databasePath,
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

function buildSummary(prefix: string, status: string): string {
  return `${prefix} is ${status}.`;
}

function normalizeRecordRows(run: Run): NormalizedRecordRow[] {
  const taskPath = run.active_task_path ?? run.task_path;
  const rows: NormalizedRecordRow[] = [
    {
      recordKind: "run",
      recordId: run.run_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: run.created_at,
      status: run.lifecycle_status,
      summary: buildSummary(`Run ${run.run_id}`, run.lifecycle_status),
      payloadJson: stringify(run),
      sensitivity: "local",
      retentionClass: "audit"
    }
  ];

  for (const phaseRun of safeArray(run.phase_runs)) {
    rows.push({
      recordKind: "phase_run",
      recordId: phaseRun.phase_run_id,
      runId: run.run_id,
      phaseId: phaseRun.phase_id,
      taskPath: phaseRun.task_path,
      createdAt: phaseRun.started_at,
      status: phaseRun.status,
      summary: buildSummary(`Phase ${phaseRun.phase_id}`, phaseRun.status),
      payloadJson: stringify(phaseRun),
      sensitivity: "local",
      retentionClass: "audit"
    });
  }

  for (const step of safeArray(run.steps)) {
    rows.push({
      recordKind: "step",
      recordId: step.step_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: step.started_at,
      status: step.status,
      summary: buildSummary(`Step ${step.name}`, step.status),
      payloadJson: stringify(step),
      sensitivity: "local",
      retentionClass: "audit"
    });
  }

  for (const commandResult of safeArray(run.command_results)) {
    rows.push({
      recordKind: "command_result",
      recordId: commandResult.command_result_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: commandResult.completed_at,
      status: commandResult.status,
      summary: buildSummary(commandResult.command, commandResult.status),
      payloadJson: stringify(commandResult),
      sourceStepId: commandResult.step_id,
      sourceCommand: commandResult.command,
      sensitivity: "local",
      retentionClass: "audit"
    });
  }

  for (const verification of safeArray(run.verification_results)) {
    rows.push({
      recordKind: "verification_result",
      recordId: verification.verification_result_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: verification.created_at,
      status: verification.status,
      summary: verification.summary,
      payloadJson: stringify(verification),
      sensitivity: "local",
      retentionClass: "audit"
    });
  }

  for (const review of safeArray(run.review_results)) {
    rows.push({
      recordKind: "review_result",
      recordId: review.review_result_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: review.created_at,
      status: review.status,
      summary: review.summary,
      payloadJson: stringify(review),
      sensitivity: "local",
      retentionClass: "audit"
    });
  }

  for (const finding of safeArray(run.findings)) {
    rows.push({
      recordKind: "finding",
      recordId: finding.finding_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: finding.created_at,
      status: finding.status,
      summary: finding.title,
      payloadJson: stringify(finding),
      sensitivity: "local",
      retentionClass: "accepted"
    });
  }

  for (const decision of safeArray(run.decisions)) {
    rows.push({
      recordKind: "decision",
      recordId: decision.decision_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: decision.created_at,
      summary: decision.title,
      payloadJson: stringify(decision),
      sensitivity: "local",
      retentionClass: "accepted"
    });
  }

  for (const approval of safeArray(run.approvals)) {
    rows.push({
      recordKind: "approval",
      recordId: approval.approval_id,
      runId: run.run_id,
      phaseId: run.phase_id,
      taskPath,
      createdAt: approval.created_at,
      status: approval.status,
      summary: approval.title,
      payloadJson: stringify(approval),
      sensitivity: "local",
      retentionClass: "accepted"
    });
  }

  for (const receipt of safeArray(run.closeout_receipts)) {
    rows.push({
      recordKind: "closeout_receipt",
      recordId: receipt.receipt_id,
      runId: run.run_id,
      phaseId: receipt.phase_id ?? run.phase_id,
      taskPath: receipt.active_task_path ?? receipt.task_path,
      createdAt: receipt.created_at,
      status: receipt.status,
      summary: buildSummary(`Closeout ${receipt.receipt_id}`, receipt.status),
      payloadJson: stringify(receipt),
      sensitivity: "local",
      retentionClass: "accepted"
    });
  }

  return rows;
}

function normalizeDeliveryFacts(run: Run): DeliveryFactRecord[] {
  const facts: DeliveryFactRecord[] = [];

  for (const fact of safeArray(run.delivery_facts)) {
    facts.push(fact);
  }

  for (const remoteCheck of safeArray(run.remote_checks)) {
    facts.push({
      delivery_fact_id: remoteCheck.check_result_id,
      run_id: run.run_id,
      fact_kind: "remote_ci",
      source: remoteCheck.ci_run.provider,
      status: remoteCheck.status === "pass" ? "pass" : remoteCheck.status === "failed" ? "failed" : "unknown",
      recorded_at: remoteCheck.recorded_at,
      summary: remoteCheck.explanation ?? `${remoteCheck.name} is ${remoteCheck.status}.`,
      ...(remoteCheck.ci_run.url ? { url: remoteCheck.ci_run.url } : {}),
      ...(remoteCheck.ci_run.run_id ? { external_run_id: remoteCheck.ci_run.run_id } : {}),
      ...(typeof remoteCheck.metadata?.commit_sha === "string" ? { commit_sha: remoteCheck.metadata.commit_sha } : {}),
      ...(remoteCheck.metadata ? { metadata: remoteCheck.metadata } : {})
    });
  }

  return facts;
}

function parseRunJson(value: unknown, runId: string): Run {
  if (typeof value !== "string") {
    throw new Error(`Stored run ${runId} is missing run_json.`);
  }

  const parsed = JSON.parse(value) as unknown;
  const { validateRuntimeRun } = require("./runtime") as {
    validateRuntimeRun: (candidate: unknown) => Run;
  };
  return validateRuntimeRun(parsed);
}

export class RunStagingDatabase {
  readonly roots: HarnessRoots;
  readonly runId: string;
  readonly paths: MemoryDbPaths;

  constructor(targetRoot: string, projectRoot: string, runId: string) {
    this.roots = { targetRoot, projectRoot };
    this.runId = runId;
    this.paths = resolveMemoryDbPaths(targetRoot, projectRoot, runId);
  }

  private open(): DatabaseLike {
    if (!this.paths.stagingDbPath) {
      throw new Error("Run staging DB path is unavailable.");
    }

    return openInitializedDatabase(this.paths.stagingDbPath, "staging");
  }

  ensureInitialized(): DatabaseStatus {
    const database = this.open();
    try {
      database.prepare(
        "INSERT OR REPLACE INTO maintenance_events (event_id, db_role, event_kind, created_at, details_json) VALUES (?, ?, ?, ?, ?)"
      ).run(`maint-${this.runId}-init`, "staging", "init", nowIso(), stringify({ run_id: this.runId }));
    } finally {
      database.close();
    }

    return this.status();
  }

  status(): DatabaseStatus {
    if (!this.paths.stagingDbPath) {
      throw new Error("Run staging DB path is unavailable.");
    }

    return databaseStatus(this.paths.stagingDbPath, "staging");
  }

  storePayload(input: StorePayloadInput) {
    const database = this.open();

    try {
      const store = new PayloadStore(database);
      return store.store(input);
    } finally {
      database.close();
    }
  }

  readProcedureArtifact(
    runInstanceId: string,
    procedureId: string,
    artifactId: string,
    database?: DatabaseLike
  ): ProcedureArtifactDescriptor | undefined {
    const ownedDatabase = database ?? this.open();
    try {
      const row = ownedDatabase.prepare([
        "SELECT run_instance_id, source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json,",
        "reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id",
        "FROM procedure_artifacts WHERE run_instance_id = ? AND procedure_id = ? AND artifact_id = ?"
      ].join(" ")).get(runInstanceId, procedureId, artifactId) as Record<string, unknown> | undefined;
      if (!row) {
        return undefined;
      }
      return {
        run_instance_id: String(row.run_instance_id),
        source_run_id: String(row.source_run_id),
        procedure_id: String(row.procedure_id),
        artifact_id: String(row.artifact_id),
        payload_id: String(row.payload_id),
        content_hash: String(row.content_hash),
        recorded_at: String(row.recorded_at),
        provenance_json: String(row.provenance_json),
        ...(typeof row.reviewed_plan_artifact_id === "string" ? { reviewed_plan_artifact_id: row.reviewed_plan_artifact_id } : {}),
        ...(typeof row.reviewed_plan_content_hash === "string" ? { reviewed_plan_content_hash: row.reviewed_plan_content_hash } : {}),
        ...(typeof row.reviewed_evidence_artifact_id === "string" ? { reviewed_evidence_artifact_id: row.reviewed_evidence_artifact_id } : {})
      };
    } finally {
      if (!database) {
        ownedDatabase.close();
      }
    }
  }

  readProcedureArtifactBody(input: {
    runInstanceId: string;
    sourceRunId: string;
    procedureArtifactId: string;
    procedureId?: string;
  }): StagedProcedureArtifactBody {
    if (!input.runInstanceId.trim() || !input.sourceRunId.trim() || !input.procedureArtifactId.startsWith("sha256:")) {
      throw new Error("Authoritative procedure-artifact staging readback requires exact run and artifact identities.");
    }
    const registry = readSelfHostingProcedureRegistry(this.roots.targetRoot);
    const proceduresById = registry ? indexSelfHostingProceduresById(registry) : undefined;
    if (!proceduresById || (input.procedureId && !proceduresById.has(input.procedureId))) {
      throw new Error(`Authoritative procedure-artifact staging readback rejects an unresolved canonical procedure ID: ${input.procedureId ?? "<registry unavailable>"}.`);
    }
    const database = this.open();
    try {
      const rows = database.prepare([
        "SELECT run_instance_id, source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json,",
        "reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id",
        "FROM procedure_artifacts WHERE run_instance_id = ? AND artifact_id = ?"
      ].join(" ")).all(input.runInstanceId, input.procedureArtifactId) as Array<ProcedureArtifactDescriptor>;
      if (rows.length !== 1) {
        throw new Error(`Authoritative procedure-artifact staging readback could not prove one exact descriptor for ${input.procedureArtifactId}.`);
      }
      const row = rows[0];
      if (row.source_run_id !== input.sourceRunId || row.content_hash !== row.artifact_id.slice("sha256:".length)
        || !proceduresById.has(row.procedure_id) || (input.procedureId && row.procedure_id !== input.procedureId)) {
        throw new Error("Authoritative procedure-artifact staging descriptor is malformed or mismatched.");
      }
      assertAuthoritativeProcedureProvenance(row.provenance_json);
      if (row.procedure_id === "plan-review") {
        if (!row.reviewed_plan_artifact_id || !row.reviewed_plan_content_hash
          || row.reviewed_plan_content_hash !== row.reviewed_plan_artifact_id.slice("sha256:".length)
          || row.reviewed_evidence_artifact_id !== row.reviewed_plan_artifact_id) {
          throw new Error("Authoritative plan-review staging readback requires an exact reviewed-plan binding.");
        }
        const planRows = database.prepare([
          "SELECT procedure_id, content_hash FROM procedure_artifacts",
          "WHERE run_instance_id = ? AND artifact_id = ?"
        ].join(" ")).all(input.runInstanceId, row.reviewed_plan_artifact_id) as Array<{ procedure_id: string; content_hash: string }>;
        if (planRows.length !== 1 || !["draft-plan", "plan-amend"].includes(planRows[0].procedure_id)
          || planRows[0].content_hash !== row.reviewed_plan_content_hash) {
          throw new Error("Authoritative plan-review staging readback rejects a missing, ambiguous, or mismatched reviewed-plan descriptor.");
        }
      }
      const index = database.prepare([
        "SELECT parent_record_id, source_run_id, kind, media_type, compression_status, chunk_count, raw_size_bytes, content_hash",
        "FROM payload_index WHERE payload_id = ?"
      ].join(" ")).get(row.payload_id) as Record<string, unknown> | undefined;
      if (!index || index.parent_record_id !== row.artifact_id || index.source_run_id !== input.sourceRunId
        || index.kind !== `procedure-artifact-body:${row.procedure_id}` || index.media_type !== "text/markdown"
        || !["identity", "gzip"].includes(String(index.compression_status)) || index.content_hash !== row.content_hash) {
        throw new Error("Authoritative procedure-artifact staging payload index does not match its descriptor.");
      }
      const chunks = database.prepare(
        "SELECT chunk_order, chunk_bytes FROM payload_chunks WHERE payload_id = ? ORDER BY chunk_order ASC"
      ).all(row.payload_id) as Array<{ chunk_order: number; chunk_bytes: Uint8Array }>;
      if (chunks.length !== index.chunk_count || chunks.some((chunk, order) => chunk.chunk_order !== order)) {
        throw new Error("Authoritative procedure-artifact staging payload chunks are missing, duplicated, or out of order.");
      }
      const stored = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.chunk_bytes)));
      const raw = index.compression_status === "gzip" ? gunzipSync(stored) : stored;
      if (raw.byteLength !== index.raw_size_bytes || sha256Hex(raw) !== row.content_hash) {
        throw new Error("Authoritative procedure-artifact staging body hash does not match its immutable descriptor.");
      }
      return {
        procedure_id: row.procedure_id,
        artifact_id: row.artifact_id,
        content_hash: row.content_hash,
        body: raw.toString("utf8")
      };
    } finally {
      database.close();
    }
  }

  storeProcedureArtifact(database: DatabaseLike, descriptor: ProcedureArtifactDescriptor): void {
    const existing = database.prepare([
      "SELECT source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json,",
      "reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id",
      "FROM procedure_artifacts WHERE run_instance_id = ? AND procedure_id = ? AND artifact_id = ?"
    ].join(" ")).get(descriptor.run_instance_id, descriptor.procedure_id, descriptor.artifact_id) as Record<string, unknown> | undefined;
    if (existing) {
      for (const [key, value] of Object.entries({
        source_run_id: descriptor.source_run_id,
        procedure_id: descriptor.procedure_id,
        artifact_id: descriptor.artifact_id,
        payload_id: descriptor.payload_id,
        content_hash: descriptor.content_hash,
        recorded_at: descriptor.recorded_at,
        provenance_json: descriptor.provenance_json,
        reviewed_plan_artifact_id: descriptor.reviewed_plan_artifact_id ?? null,
        reviewed_plan_content_hash: descriptor.reviewed_plan_content_hash ?? null,
        reviewed_evidence_artifact_id: descriptor.reviewed_evidence_artifact_id ?? null
      })) {
        if (existing[key] !== value) {
          throw new Error(`Procedure artifact identity conflict for ${descriptor.artifact_id}: ${key} does not match the stored descriptor.`);
        }
      }
      return;
    }
    database.prepare([
      "INSERT INTO procedure_artifacts",
      "(run_instance_id, source_run_id, procedure_id, artifact_id, payload_id, content_hash, recorded_at, provenance_json, reviewed_plan_artifact_id, reviewed_plan_content_hash, reviewed_evidence_artifact_id)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ].join(" ")).run(
      descriptor.run_instance_id,
      descriptor.source_run_id,
      descriptor.procedure_id,
      descriptor.artifact_id,
      descriptor.payload_id,
      descriptor.content_hash,
      descriptor.recorded_at,
      descriptor.provenance_json,
      descriptor.reviewed_plan_artifact_id ?? null,
      descriptor.reviewed_plan_content_hash ?? null,
      descriptor.reviewed_evidence_artifact_id ?? null
    );
  }

  private persistRun(database: DatabaseLike, run: Run): void {
    const persistedRun: Run = {
      ...run,
      ...(typeof run.run_revision === "number" && Number.isInteger(run.run_revision) && run.run_revision >= 1
        ? {}
        : { run_revision: 1 })
    };
    database.prepare([
      "INSERT OR REPLACE INTO runs",
      "(run_id, task_path, active_task_path, phase_id, run_mode, lifecycle_status, created_at, updated_at, target_root, project_root, repository_json, run_json, discard_reason, manual_override_reason, harvested_at, source_snapshot)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ].join(" ")).run(
      persistedRun.run_id,
      persistedRun.task_path,
      persistedRun.active_task_path ?? null,
      persistedRun.phase_id ?? null,
      persistedRun.run_mode,
      persistedRun.lifecycle_status,
      persistedRun.created_at,
      persistedRun.updated_at,
      this.roots.targetRoot,
      this.roots.projectRoot,
      stringify(persistedRun.repository),
      stringify(persistedRun),
      persistedRun.discard_reason ?? null,
      persistedRun.manual_override_reason ?? null,
      persistedRun.harvested_at ?? null,
      persistedRun.source_snapshot ?? null
    );
    database.prepare("DELETE FROM records WHERE run_id = ?").run(persistedRun.run_id);
    for (const row of normalizeRecordRows(persistedRun)) {
      database.prepare([
        "INSERT INTO records",
        "(record_kind, record_id, run_id, phase_id, task_path, created_at, status, summary, payload_json, source_step_id, source_command, sensitivity, retention_class)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        row.recordKind,
        row.recordId,
        row.runId,
        row.phaseId ?? null,
        row.taskPath,
        row.createdAt,
        row.status ?? null,
        row.summary,
        row.payloadJson,
        row.sourceStepId ?? null,
        row.sourceCommand ?? null,
        row.sensitivity,
        row.retentionClass
      );
    }

    database.prepare("DELETE FROM delivery_facts WHERE run_id = ?").run(persistedRun.run_id);
    for (const fact of normalizeDeliveryFacts(persistedRun)) {
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

  saveRun(run: Run): void {
    const database = this.open();

    try {
      database.exec("BEGIN IMMEDIATE;");
      this.persistRun(database, run);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    } finally {
      database.close();
    }
  }

  mutateRun(runId: string, mutator: (run: Run) => Run, options: MutateRunOptions = {}): Run {
    return this.mutateRunWithDatabase(runId, (run) => mutator(run), options);
  }

  mutateRunWithDatabase(
    runId: string,
    mutator: (run: Run, database: DatabaseLike) => Run,
    options: MutateRunOptions = {}
  ): Run {
    const database = this.open();

    try {
      database.exec("BEGIN IMMEDIATE;");
      const row = database.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(runId) as { run_json?: string } | undefined;
      if (options.expectedRunPresence === "absent" && row) {
        throw new Error(`Run ${runId} appeared in staging DB while applying a compatibility mutation; refusing to overwrite authoritative state.`);
      }
      if (options.expectedRunPresence === "present" && !row) {
        throw new Error(`Run ${runId} disappeared from staging DB while applying a staged mutation.`);
      }
      if (!row && !options.seedRunIfMissing) {
        throw new Error(`Run not found in staging DB: ${runId}`);
      }
      if (options.seedRunIfMissing && options.seedRunIfMissing.run_id !== runId) {
        throw new Error(`Seed run ${options.seedRunIfMissing.run_id} does not match staged mutation run ${runId}.`);
      }

      const current = row
        ? parseRunJson(row.run_json, runId)
        : options.seedRunIfMissing!;
      if (
        options.expectedRunInstanceId
        && current.run_instance_id
        && current.run_instance_id !== options.expectedRunInstanceId
      ) {
        throw new Error(
          `Run ${runId} identity changed while applying a staged mutation. Expected ${options.expectedRunInstanceId}, got ${current.run_instance_id}.`
        );
      }
      if (
        options.expectedRunRevision !== undefined
        && typeof current.run_revision === "number"
        && current.run_revision !== options.expectedRunRevision
      ) {
        throw new Error(
          `Run ${runId} revision changed while applying a staged mutation. Expected ${options.expectedRunRevision}, got ${current.run_revision}.`
        );
      }
      const next = mutator(current, database);
      const nextRevision = typeof current.run_revision === "number" && Number.isInteger(current.run_revision)
        ? current.run_revision + 1
        : 1;
      this.persistRun(database, {
        ...next,
        ...(current.run_instance_id ? { run_instance_id: next.run_instance_id ?? current.run_instance_id } : {}),
        run_revision: nextRevision
      });
      database.exec("COMMIT;");
      return {
        ...next,
        ...(current.run_instance_id ? { run_instance_id: next.run_instance_id ?? current.run_instance_id } : {}),
        run_revision: nextRevision
      };
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    } finally {
      database.close();
    }
  }

  loadRun(runId = this.runId): Run | undefined {
    const database = this.open();

    try {
      const row = database.prepare("SELECT run_json FROM runs WHERE run_id = ?").get(runId) as { run_json?: string } | undefined;
      return row ? parseRunJson(row.run_json, runId) : undefined;
    } finally {
      database.close();
    }
  }

  recordDeliveryFacts(runId: string, deliveryFacts: DeliveryFactRecord[]): Run {
    const run = this.loadRun(runId);

    if (!run) {
      throw new Error(`Run not found in staging DB: ${runId}`);
    }

    const merged = new Map<string, DeliveryFactRecord>();
    for (const fact of safeArray(run.delivery_facts)) {
      merged.set(fact.delivery_fact_id, fact);
    }
    for (const fact of deliveryFacts) {
      merged.set(fact.delivery_fact_id, fact);
    }

    const next: Run = {
      ...run,
      updated_at: nowIso(),
      delivery_facts: [...merged.values()].sort((left, right) => left.recorded_at.localeCompare(right.recorded_at))
    };
    this.saveRun(next);
    return next;
  }

  markLifecycle(runId: string, lifecycleStatus: LifecycleStatus, reason: string): Run {
    const run = this.loadRun(runId);

    if (!run) {
      throw new Error(`Run not found in staging DB: ${runId}`);
    }

    const updatedAt = nowIso();
    const next: Run = {
      ...run,
      updated_at: updatedAt,
      lifecycle_status: lifecycleStatus,
      ...(lifecycleStatus === "discarded" ? { discard_reason: reason } : {}),
      ...(lifecycleStatus === "harvested" ? { harvested_at: updatedAt } : {})
    };
    this.saveRun(next);
    return next;
  }

  recordManualOverride(runId: string, reason: string): Run {
    const run = this.loadRun(runId);

    if (!run) {
      throw new Error(`Run not found in staging DB: ${runId}`);
    }

    const next: Run = {
      ...run,
      updated_at: nowIso(),
      manual_override_reason: reason
    };
    this.saveRun(next);
    return next;
  }

  listDeliveryFacts(runId = this.runId): DeliveryFactRecord[] {
    const database = this.open();

    try {
      const rows = database.prepare(
        "SELECT fact_json FROM delivery_facts WHERE run_id = ? ORDER BY recorded_at ASC"
      ).all(runId) as Array<{ fact_json?: string }>;
      return rows.flatMap((row) => (typeof row.fact_json === "string" ? [JSON.parse(row.fact_json) as DeliveryFactRecord] : []));
    } finally {
      database.close();
    }
  }
}

export function isSelfHostingRunMode(targetRoot: string): RunMode {
  const packageJsonPath = path.join(targetRoot, "package.json");

  if (!fs.existsSync(packageJsonPath) || !fs.statSync(packageJsonPath).isFile()) {
    return "normal";
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
    return packageJson.name === "codex-harness" ? "bootstrap" : "normal";
  } catch {
    return "normal";
  }
}

export function formatDatabasePath(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

export function writeCompatibilityRunArtifacts(targetRoot: string, run: Run, closeoutOnly = false): void {
  const paths = resolveMemoryDbPaths(targetRoot, run.repository.project_root ?? targetRoot, run.run_id);

  if (!paths.runJsonPath) {
    throw new Error("Compatibility run JSON path is unavailable.");
  }

  fs.mkdirSync(path.dirname(paths.runJsonPath), { recursive: true });

  if (!closeoutOnly) {
    fs.writeFileSync(paths.runJsonPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(targetRoot, HARNESS_DIR, "runs", "current.json"), `${JSON.stringify({
      run_id: run.run_id,
      ...(run.run_instance_id ? { run_instance_id: run.run_instance_id } : {}),
      run_path: toPortablePath(path.relative(path.join(targetRoot, HARNESS_DIR, "runs"), paths.runJsonPath)),
      updated_at: run.updated_at
    }, null, 2)}\n`, "utf8");
  }

  if (paths.closeoutPath && safeArray(run.closeout_receipts).length > 0) {
    fs.writeFileSync(
      paths.closeoutPath,
      `${JSON.stringify(run.closeout_receipts[run.closeout_receipts.length - 1], null, 2)}\n`,
      "utf8"
    );
  }
}
