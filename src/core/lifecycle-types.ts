export type RunMode = "normal" | "bootstrap";
export type LifecycleStatus = "active" | "blocked" | "closed" | "harvested" | "discarded";
export type PayloadCompressionStatus = "identity" | "gzip";
export type RedactionState = "not_redacted" | "redacted" | "not_applicable";
export type RetentionClass = "accepted" | "audit" | "quarantine" | "discarded" | "sensitive";
export type DeliveryFactKind =
  | "pr"
  | "remote_ci"
  | "review"
  | "merge"
  | "merge_result"
  | "merge_commit"
  | "closeout_approval";
export type DeliveryFactStatus =
  | "created"
  | "updated"
  | "pass"
  | "failed"
  | "approved"
  | "rejected"
  | "merged"
  | "closed"
  | "unknown";
export type HarvestStatus = "promoted" | "discarded" | "quarantined";

export interface PayloadRecord {
  payload_id: string;
  parent_record_id: string;
  source_run_id: string;
  source_phase_id?: string;
  source_step_id?: string;
  kind: string;
  media_type: string;
  summary: string;
  searchable_text?: string;
  bounded_excerpt?: string;
  redaction_status: RedactionState;
  retention_class: RetentionClass;
  compression_status: PayloadCompressionStatus;
  chunk_count: number;
  raw_size_bytes: number;
  stored_size_bytes: number;
  content_hash: string;
  created_at: string;
}

export interface DeliveryFactRecord {
  delivery_fact_id: string;
  run_id: string;
  fact_kind: DeliveryFactKind;
  source: string;
  status: DeliveryFactStatus;
  recorded_at: string;
  summary: string;
  url?: string;
  external_run_id?: string;
  commit_sha?: string;
  excerpt_payload_id?: string;
  metadata?: Record<string, unknown>;
}

export interface HarvestRecord {
  harvest_id: string;
  run_id: string;
  project_run_id: string;
  status: HarvestStatus;
  promoted_at: string;
  accepted_count: number;
  discarded_count: number;
  quarantined_count: number;
  redacted_count: number;
  unresolved_count: number;
  source_task_path: string;
  source_snapshot: string;
  details: Record<string, unknown>;
}
