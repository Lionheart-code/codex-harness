import { createHash } from "node:crypto";
import { CURRENT_SCHEMA_VERSION } from "./schema-migrations";

export const CURRENT_EVIDENCE_EVENT_VERSION = 1 as const;
export const CURRENT_PROJECTION_SCHEMA_VERSION = 1 as const;
export const DEFAULT_EVIDENCE_NAMESPACE = "default";

export type EvidenceType =
  | "run"
  | "phase_run"
  | "step"
  | "command_result"
  | "verification_result"
  | "review_result"
  | "finding"
  | "decision"
  | "approval"
  | "delivery_fact"
  | "harvest_record"
  | "closeout_receipt"
  | "remote_ci"
  | "artifact_ref"
  | "schema_metadata"
  | "projection_metadata"
  | "verified_snapshot"
  | "verification_reuse_decision";

export type EvidenceProducerType = "command" | "runtime" | "manual" | "model" | "projection";
export type EvidenceSensitivity = "public" | "local" | "sensitive";
export type RedactionStatus = "not_redacted" | "redacted" | "not_applicable";
export type LocalVerificationReuseStatus = "RUN" | "REUSED" | "STALE" | "MISSING" | "FAILED";
export type ChangeClassification = "source" | "schema" | "test" | "package" | "ci" | "docs_task_only" | "mixed" | "none";

export interface EvidenceScope {
  target_project_id: string;
  target_root: string;
  namespace: string;
  run_id?: string;
  phase_id?: string;
  task_id?: string;
  task_path?: string;
}

export interface EvidenceProducer {
  type: EvidenceProducerType;
  command?: string;
  name?: string;
  version?: string;
}

export interface ArtifactEvidenceRef {
  artifact_id: string;
  sha256: string;
  path: string;
  kind: string;
  media_type: string;
  size_bytes: number;
  producer_command?: string;
  sensitivity: EvidenceSensitivity;
  redaction_status: RedactionStatus;
  exportable: boolean;
}

export interface EvidenceProvenance {
  producer: EvidenceProducer;
  produced_at: string;
  input_fingerprint?: string;
  reusable: boolean;
  stale: boolean;
  sensitivity: EvidenceSensitivity;
  redaction_status: RedactionStatus;
  exportable: boolean;
  artifact_refs: ArtifactEvidenceRef[];
}

export interface EvidenceEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  schema_version: typeof CURRENT_SCHEMA_VERSION;
  producer_command: string;
  event_version: typeof CURRENT_EVIDENCE_EVENT_VERSION;
  event_id: string;
  sequence: number;
  evidence_type: EvidenceType;
  scope: EvidenceScope;
  provenance: EvidenceProvenance;
  payload: TPayload;
}

export interface ProjectionMetadata {
  schema_version: typeof CURRENT_SCHEMA_VERSION;
  producer_command: string;
  projection_schema_version: typeof CURRENT_PROJECTION_SCHEMA_VERSION;
  created_at: string;
  updated_at: string;
  ledger_path: string;
  adapter: string;
}

export interface ProjectionAvailability {
  available: boolean;
  adapter: string;
  message: string;
}

export interface ChangeSetFingerprint {
  fingerprint_id: string;
  target_project_id: string;
  target_root: string;
  namespace: string;
  base_commit?: string;
  current_commit?: string;
  git_status_lines: string[];
  changed_tracked_files: string[];
  untracked_files: string[];
  removed_untracked_files: string[];
  tracked_diff_fingerprint: string;
  untracked_file_hashes: Record<string, string>;
  command_set_hash: string;
  change_classification: ChangeClassification;
}

export interface VerificationCommandSpec {
  command: string;
}

export interface VerificationCommandResultEvidence {
  command: string;
  exit_code: number;
  duration_ms: number;
  stdout_artifact?: ArtifactEvidenceRef;
  stderr_artifact?: ArtifactEvidenceRef;
}

export interface VerifiedSnapshot {
  snapshot_id: string;
  target_project_id: string;
  target_root: string;
  namespace: string;
  base_commit?: string;
  current_commit?: string;
  git_status_lines: string[];
  changed_tracked_files: string[];
  untracked_files: string[];
  tracked_diff_fingerprint: string;
  untracked_file_hashes: Record<string, string>;
  verification_commands: VerificationCommandSpec[];
  command_set_hash: string;
  command_results: VerificationCommandResultEvidence[];
  timestamp: string;
  change_classification: ChangeClassification;
  fingerprint: ChangeSetFingerprint;
}

export interface VerificationReuseDecision {
  status: LocalVerificationReuseStatus;
  reason: string;
  snapshot_id?: string;
  current_fingerprint: string;
  matched_event_id?: string;
  invalidated_by: string[];
}

export interface MemoryEvidenceStatus {
  targetRoot: string;
  ledgerPath: string;
  projectionPath: string;
  artifactRoot: string;
  namespace: string;
  targetProjectId: string;
  ledgerExists: boolean;
  projectionExists: boolean;
  artifactRootExists: boolean;
  eventCount: number;
  projection: ProjectionAvailability;
}

export interface EvidenceRunSummary {
  run_id: string;
  target_project_id: string;
  target_root: string;
  namespace: string;
  phase_id?: string;
  task_path?: string;
  evidence_count: number;
  first_event_at: string;
  last_event_at: string;
}

export interface EvidenceTimelineEntry {
  event_id: string;
  sequence: number;
  evidence_type: EvidenceType;
  produced_at: string;
  summary: string;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      if (record[key] !== undefined) {
        next[key] = canonicalize(record[key]);
      }
    }

    return next;
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function buildTargetProjectId(targetRoot: string): string {
  return `local:${sha256Hex(targetRoot).slice(0, 16)}`;
}

export function buildScopedHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}
