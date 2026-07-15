import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { type PayloadRecord, type RedactionState, type RetentionClass } from "./lifecycle-types";
import { type DatabaseLike } from "./sqlite";

export interface PayloadStoreOptions {
  chunkSizeBytes: number;
  compressionThresholdBytes: number;
}

export interface StorePayloadInput {
  parentRecordId: string;
  sourceRunId: string;
  sourcePhaseId?: string;
  sourceStepId?: string;
  kind: string;
  mediaType: string;
  summary: string;
  content: string | Buffer;
  searchableText?: string;
  boundedExcerpt?: string;
  redactionStatus?: RedactionState;
  retentionClass?: RetentionClass;
}

// These are review thresholds, not hard caps. They are chosen to surface payloads
// that are unusually large for command/check excerpts before they become durable memory.
export const PAYLOAD_WARNING_THRESHOLD_BYTES = 256 * 1024;

const DEFAULT_OPTIONS: PayloadStoreOptions = {
  chunkSizeBytes: 64 * 1024,
  compressionThresholdBytes: 8 * 1024
};

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function chunkBuffer(content: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];

  for (let offset = 0; offset < content.byteLength; offset += chunkSize) {
    chunks.push(content.subarray(offset, Math.min(offset + chunkSize, content.byteLength)));
  }

  return chunks.length > 0 ? chunks : [Buffer.alloc(0)];
}

export class PayloadStore {
  private readonly database: DatabaseLike;
  private readonly options: PayloadStoreOptions;

  constructor(database: DatabaseLike, options: Partial<PayloadStoreOptions> = {}) {
    this.database = database;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    };
  }

  store(input: StorePayloadInput): PayloadRecord {
    const createdAt = nowIso();
    const rawBuffer = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
    const shouldCompress = rawBuffer.byteLength >= this.options.compressionThresholdBytes;
    const storedBuffer = shouldCompress ? gzipSync(rawBuffer) : rawBuffer;
    const chunks = chunkBuffer(storedBuffer, this.options.chunkSizeBytes);
    const contentHash = sha256Hex(rawBuffer);
    const payloadId = `payload-${sha256Hex(Buffer.from(`${input.parentRecordId}:${input.kind}:${contentHash}`)).slice(0, 24)}`;
    const redactionStatus = input.redactionStatus ?? "not_applicable";
    const retentionClass = input.retentionClass ?? "audit";

    const existing = this.database.prepare([
      "SELECT parent_record_id, source_run_id, source_phase_id, source_step_id, kind, media_type, summary,",
      "searchable_text, bounded_excerpt, redaction_status, retention_class, compression_status, chunk_count,",
      "raw_size_bytes, stored_size_bytes, content_hash, created_at",
      "FROM payload_index WHERE payload_id = ?"
    ].join(" ")).get(payloadId) as Record<string, unknown> | undefined;

    if (existing) {
      const expected = {
        parent_record_id: input.parentRecordId,
        source_run_id: input.sourceRunId,
        source_phase_id: input.sourcePhaseId ?? null,
        source_step_id: input.sourceStepId ?? null,
        kind: input.kind,
        media_type: input.mediaType,
        summary: input.summary,
        searchable_text: input.searchableText ?? null,
        bounded_excerpt: input.boundedExcerpt ?? null,
        redaction_status: redactionStatus,
        retention_class: retentionClass,
        compression_status: shouldCompress ? "gzip" : "identity",
        chunk_count: chunks.length,
        raw_size_bytes: rawBuffer.byteLength,
        stored_size_bytes: storedBuffer.byteLength,
        content_hash: contentHash
      };
      for (const [key, value] of Object.entries(expected)) {
        if (existing[key] !== value) {
          throw new Error(`Payload identity conflict for ${payloadId}: ${key} does not match the stored payload.`);
        }
      }
      const existingChunks = this.database.prepare(
        "SELECT chunk_order, chunk_bytes FROM payload_chunks WHERE payload_id = ? ORDER BY chunk_order ASC"
      ).all(payloadId) as Array<{ chunk_order: number; chunk_bytes: Uint8Array }>;
      if (existingChunks.length !== chunks.length || existingChunks.some((row, index) =>
        row.chunk_order !== index || !Buffer.from(row.chunk_bytes).equals(chunks[index])
      )) {
        throw new Error(`Payload identity conflict for ${payloadId}: stored chunks do not match the supplied body.`);
      }
      return {
        payload_id: payloadId,
        parent_record_id: input.parentRecordId,
        source_run_id: input.sourceRunId,
        ...(input.sourcePhaseId ? { source_phase_id: input.sourcePhaseId } : {}),
        ...(input.sourceStepId ? { source_step_id: input.sourceStepId } : {}),
        kind: input.kind,
        media_type: input.mediaType,
        summary: input.summary,
        ...(input.searchableText ? { searchable_text: input.searchableText } : {}),
        ...(input.boundedExcerpt ? { bounded_excerpt: input.boundedExcerpt } : {}),
        redaction_status: redactionStatus,
        retention_class: retentionClass,
        compression_status: shouldCompress ? "gzip" : "identity",
        chunk_count: chunks.length,
        raw_size_bytes: rawBuffer.byteLength,
        stored_size_bytes: storedBuffer.byteLength,
        content_hash: contentHash,
        created_at: String(existing.created_at)
      };
    }

    this.database.prepare([
      "INSERT INTO payload_index",
      "(",
      "  payload_id, parent_record_id, source_run_id, source_phase_id, source_step_id, kind, media_type, summary,",
      "  searchable_text, bounded_excerpt, redaction_status, retention_class, compression_status, chunk_count,",
      "  raw_size_bytes, stored_size_bytes, content_hash, created_at",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ].join(" ")).run(
      payloadId,
      input.parentRecordId,
      input.sourceRunId,
      input.sourcePhaseId ?? null,
      input.sourceStepId ?? null,
      input.kind,
      input.mediaType,
      input.summary,
      input.searchableText ?? null,
      input.boundedExcerpt ?? null,
      redactionStatus,
      retentionClass,
      shouldCompress ? "gzip" : "identity",
      chunks.length,
      rawBuffer.byteLength,
      storedBuffer.byteLength,
      contentHash,
      createdAt
    );

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      this.database.prepare(
        "INSERT INTO payload_chunks (payload_id, chunk_order, chunk_bytes) VALUES (?, ?, ?)"
      ).run(payloadId, index, chunk);
    }

    this.database.prepare(
      "INSERT INTO payload_redactions (payload_id, redaction_status, details_json, created_at) VALUES (?, ?, ?, ?)"
    ).run(payloadId, redactionStatus, JSON.stringify({ summary: input.summary }), createdAt);

    this.database.prepare(
      "INSERT INTO payload_retention (payload_id, retention_class, details_json, created_at) VALUES (?, ?, ?, ?)"
    ).run(payloadId, retentionClass, JSON.stringify({ media_type: input.mediaType }), createdAt);

    this.database.prepare(
      "INSERT INTO payload_links (payload_id, parent_record_id, link_role, created_at) VALUES (?, ?, ?, ?)"
    ).run(payloadId, input.parentRecordId, input.kind, createdAt);

    if (rawBuffer.byteLength > PAYLOAD_WARNING_THRESHOLD_BYTES) {
      this.database.prepare([
        "INSERT OR REPLACE INTO maintenance_events",
        "(event_id, db_role, event_kind, created_at, details_json)",
        "VALUES (?, ?, ?, ?, ?)"
      ].join(" ")).run(
        `payload-warning-${payloadId}`,
        "staging",
        "payload_size_warning",
        createdAt,
        JSON.stringify({
          payload_id: payloadId,
          raw_size_bytes: rawBuffer.byteLength,
          warning_threshold_bytes: PAYLOAD_WARNING_THRESHOLD_BYTES,
          rationale: "Large payloads should be summarized, redacted, quarantined, or explicitly accepted before durable reuse."
        })
      );
    }

    return {
      payload_id: payloadId,
      parent_record_id: input.parentRecordId,
      source_run_id: input.sourceRunId,
      ...(input.sourcePhaseId ? { source_phase_id: input.sourcePhaseId } : {}),
      ...(input.sourceStepId ? { source_step_id: input.sourceStepId } : {}),
      kind: input.kind,
      media_type: input.mediaType,
      summary: input.summary,
      ...(input.searchableText ? { searchable_text: input.searchableText } : {}),
      ...(input.boundedExcerpt ? { bounded_excerpt: input.boundedExcerpt } : {}),
      redaction_status: redactionStatus,
      retention_class: retentionClass,
      compression_status: shouldCompress ? "gzip" : "identity",
      chunk_count: chunks.length,
      raw_size_bytes: rawBuffer.byteLength,
      stored_size_bytes: storedBuffer.byteLength,
      content_hash: contentHash,
      created_at: createdAt
    };
  }
}
