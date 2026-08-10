export const CURRENT_SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION;

export const LEGACY_TO_V1_MIGRATION_ID = "0001-legacy-unversioned-to-v1";

export const PRODUCT_SCHEMA_FILE_NAMES = [
  "install.schema.json",
  "task-state.schema.json",
  "verifier.schema.json",
  "review.schema.json",
  "agent-run.schema.json",
  "debt.schema.json",
  "decision.schema.json",
  "adapter-profile.schema.json",
  "governance-proposal.schema.json",
  "runtime-run.schema.json",
  "closeout-receipt.schema.json",
  "evidence-event.schema.json",
  "evidence-artifact-ref.schema.json",
  "delivery-fact.schema.json",
  "harvest-record.schema.json",
  "verified-snapshot.schema.json",
  "change-set-fingerprint.schema.json",
  "evidence-projection.schema.json",
  "self-hosting-procedure-registry.schema.json",
  "self-hosting-procedure-execution-policy.schema.json",
  "self-hosting-review-route-policy.schema.json",
  "codex-reference-binding.schema.json",
  "review-routing-evaluation.schema.json",
  "review-routing-decision.schema.json",
  "prepared-successor-cleanup.schema.json"
  ,"proof-record.schema.json"
  ,"proof-transfer-receipt.schema.json"
  ,"proof-eligibility-snapshot.schema.json"
  ,"successor-disposition.schema.json"
  ,"self-install-reconciliation.schema.json"
  ,"installer-ownership-manifest.schema.json"
  ,"installer-ownership-catalog.schema.json"
  ,"review-cohort.schema.json"
  ,"review-attempt-event.schema.json"
  ,"review-attempt.schema.json"
  ,"review-capability-evidence.schema.json"
  ,"planning-review-bundle.schema.json"
  ,"planning-review-lens-output.schema.json"
  ,"review-finding-aggregate.schema.json"
  ,"review-resume-simulation.schema.json"
] as const;

export type ProductSchemaFileName = (typeof PRODUCT_SCHEMA_FILE_NAMES)[number];

export interface SchemaMetadata {
  schema_version: SchemaVersion;
  producer_command: string;
}

export function buildSchemaMetadata(producerCommand: string): SchemaMetadata {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    producer_command: producerCommand
  };
}

export function assertSupportedSchemaVersion(value: unknown, artifactLabel: string): void {
  if (value === undefined) {
    return;
  }

  if (value !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `${artifactLabel} uses unsupported schema_version: ${String(value)}. Run \`node bin/ch schema migrate --dry-run\` and \`node bin/ch schema migrate\`.`
    );
  }
}

export function validateOptionalSchemaMetadata(
  record: Record<string, unknown>,
  artifactLabel: string
): void {
  assertSupportedSchemaVersion(record.schema_version, artifactLabel);

  if (record.producer_command !== undefined && typeof record.producer_command !== "string") {
    throw new Error(`${artifactLabel} has invalid producer_command.`);
  }

  if (record.schema_version === CURRENT_SCHEMA_VERSION && typeof record.producer_command !== "string") {
    throw new Error(`${artifactLabel} is missing producer_command for schema_version 1.`);
  }
}

export function hasCurrentSchemaVersion(record: Record<string, unknown>): boolean {
  return record.schema_version === CURRENT_SCHEMA_VERSION;
}
