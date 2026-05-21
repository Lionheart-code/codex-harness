import * as fs from "node:fs";
import * as path from "node:path";
import {
  EVIDENCE_LEDGER_PATH
} from "./paths";
import {
  CURRENT_EVIDENCE_EVENT_VERSION,
  type EvidenceEventEnvelope,
  type EvidenceProvenance,
  type EvidenceScope,
  type EvidenceType,
  buildScopedHash,
  canonicalJson
} from "./evidence-types";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata, validateOptionalSchemaMetadata } from "./schema-migrations";

export interface AppendEvidenceEventInput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  evidenceType: EvidenceType;
  scope: EvidenceScope;
  provenance: EvidenceProvenance;
  payload: TPayload;
  producerCommand: string;
}

export interface EvidenceLedgerValidationResult {
  ok: boolean;
  eventCount: number;
  errors: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildEventId(input: Omit<EvidenceEventEnvelope, "event_id">): string {
  return `ev_${buildScopedHash(input).slice(0, 32)}`;
}

function normalizeEvent<TPayload extends Record<string, unknown>>(
  input: AppendEvidenceEventInput<TPayload>,
  sequence: number
): EvidenceEventEnvelope<TPayload> {
  const base: Omit<EvidenceEventEnvelope<TPayload>, "event_id"> = {
    ...buildSchemaMetadata(input.producerCommand),
    event_version: CURRENT_EVIDENCE_EVENT_VERSION,
    sequence,
    evidence_type: input.evidenceType,
    scope: input.scope,
    provenance: {
      ...input.provenance,
      produced_at: input.provenance.produced_at || nowIso()
    },
    payload: input.payload
  };

  return {
    ...base,
    event_id: buildEventId(base)
  };
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, field: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is missing required string field: ${field}.`);
  }
}

function assertNumber(value: unknown, field: string, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} has invalid numeric field: ${field}.`);
  }
}

export function validateEvidenceEvent(value: unknown, label = "evidence event"): EvidenceEventEnvelope {
  const record = assertObject(value, label);
  validateOptionalSchemaMetadata(record, label);

  if (record.schema_version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`${label} is missing schema_version ${CURRENT_SCHEMA_VERSION}.`);
  }

  if (record.event_version !== CURRENT_EVIDENCE_EVENT_VERSION) {
    throw new Error(`${label} uses unsupported event_version: ${String(record.event_version)}.`);
  }

  assertString(record.producer_command, "producer_command", label);
  assertString(record.event_id, "event_id", label);
  assertNumber(record.sequence, "sequence", label);
  assertString(record.evidence_type, "evidence_type", label);
  assertObject(record.scope, `${label} scope`);
  assertObject(record.provenance, `${label} provenance`);
  assertObject(record.payload, `${label} payload`);

  return record as unknown as EvidenceEventEnvelope;
}

export class EvidenceLedger {
  readonly targetRoot: string;
  readonly ledgerPath: string;

  constructor(targetRoot: string) {
    this.targetRoot = targetRoot;
    this.ledgerPath = path.join(targetRoot, EVIDENCE_LEDGER_PATH);
  }

  initialize(): void {
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    if (!fs.existsSync(this.ledgerPath)) {
      fs.writeFileSync(this.ledgerPath, "", "utf8");
    }
  }

  exists(): boolean {
    return fs.existsSync(this.ledgerPath) && fs.statSync(this.ledgerPath).isFile();
  }

  readAll(): EvidenceEventEnvelope[] {
    if (!this.exists()) {
      return [];
    }

    const content = fs.readFileSync(this.ledgerPath, "utf8");
    const events: EvidenceEventEnvelope[] = [];

    content.split(/\r?\n/).forEach((line, index) => {
      if (line.trim().length === 0) {
        return;
      }

      try {
        events.push(validateEvidenceEvent(JSON.parse(line) as unknown, `evidence event ${index + 1}`));
      } catch (eventError) {
        const message = eventError instanceof Error ? eventError.message : String(eventError);
        throw new Error(`Unable to read ${EVIDENCE_LEDGER_PATH}:${index + 1}: ${message}`);
      }
    });

    return events;
  }

  count(): number {
    return this.readAll().length;
  }

  append<TPayload extends Record<string, unknown>>(input: AppendEvidenceEventInput<TPayload>): EvidenceEventEnvelope<TPayload> {
    this.initialize();
    const sequence = this.count() + 1;
    const event = normalizeEvent(input, sequence);
    fs.appendFileSync(this.ledgerPath, `${canonicalJson(event)}\n`, "utf8");
    return event;
  }

  validate(): EvidenceLedgerValidationResult {
    const errors: string[] = [];
    let eventCount = 0;

    try {
      const events = this.readAll();
      eventCount = events.length;

      events.forEach((event, index) => {
        if (event.sequence !== index + 1) {
          errors.push(`event ${event.event_id} has sequence ${event.sequence}; expected ${index + 1}.`);
        }
      });
    } catch (ledgerError) {
      const message = ledgerError instanceof Error ? ledgerError.message : String(ledgerError);
      errors.push(message);
    }

    return {
      ok: errors.length === 0,
      eventCount,
      errors
    };
  }
}

export function getEvidenceLedger(targetRoot: string): EvidenceLedger {
  return new EvidenceLedger(targetRoot);
}
