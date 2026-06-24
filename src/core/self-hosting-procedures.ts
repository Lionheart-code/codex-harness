import * as fs from "node:fs";
import * as path from "node:path";
import { CURRENT_SCHEMA_VERSION, assertSupportedSchemaVersion } from "./schema-migrations";

export const SELF_HOSTING_PROCEDURE_REGISTRY_PATH = path.join(
  "skills",
  "self-hosting",
  "procedure-registry.json"
);

export type SelfHostingProcedureAuthorityLevel = "binding" | "advisory" | "pattern-only";

export interface SelfHostingDiscoveryTarget {
  path: string;
  authority: "non-authoritative";
  purpose: string;
}

export interface SelfHostingOperatorContract {
  primary_outputs: string[];
  allowed_outcome_states: string[];
  durable_decision_fields?: string[];
  real_operator_choices_only?: boolean;
  latest_amendment_supersedes_prior_plan?: boolean;
}

export interface SelfHostingProcedureDescriptor {
  procedure_id: string;
  title: string;
  purpose: string;
  canonical_source_path: string;
  skill_path: string;
  source_notes_path: string;
  output_format_path: string;
  prompt_wrapper_path: string;
  required_inputs: string[];
  blocker_conditions: string[];
  evidence_to_record: string[];
  phase_23_5_dependencies: string[];
  phase_24_packet_dependencies: string[];
  authority_level: SelfHostingProcedureAuthorityLevel;
  generated_or_install_targets_non_authoritative: boolean;
  operator_contract?: SelfHostingOperatorContract;
}

export interface SelfHostingProcedureRegistry {
  schema_version: typeof CURRENT_SCHEMA_VERSION;
  producer_command: string;
  registry_id: string;
  canonical_root: string;
  discovery_targets: SelfHostingDiscoveryTarget[];
  procedures: SelfHostingProcedureDescriptor[];
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, field: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is missing required ${field}.`);
  }

  return value.trim();
}

function assertBoolean(value: unknown, field: string, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} has invalid ${field}.`);
  }

  return value;
}

function assertStringArray(value: unknown, field: string, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new Error(`${label} has invalid ${field}.`);
  }

  return value.map((entry) => entry.trim());
}

function assertDiscoveryTargets(value: unknown, label: string): SelfHostingDiscoveryTarget[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} has invalid discovery_targets.`);
  }

  return value.map((entry, index) => {
    const item = assertObject(entry, `${label} discovery_targets[${index}]`);
    const targetPath = assertString(item.path, "path", `${label} discovery_targets[${index}]`);
    const authority = assertString(item.authority, "authority", `${label} discovery_targets[${index}]`);
    const purpose = assertString(item.purpose, "purpose", `${label} discovery_targets[${index}]`);

    if (authority !== "non-authoritative") {
      throw new Error(`${label} discovery_targets[${index}] must be non-authoritative.`);
    }

    return {
      path: targetPath,
      authority,
      purpose
    };
  });
}

function assertPathInsideCanonicalRoot(
  fieldValue: string,
  field: keyof Pick<SelfHostingProcedureDescriptor, "canonical_source_path" | "skill_path" | "source_notes_path" | "output_format_path">,
  canonicalRoot: string,
  label: string
): string {
  const normalized = toPortablePath(fieldValue);
  const normalizedRoot = toPortablePath(canonicalRoot);

  if (!normalized.startsWith(normalizedRoot)) {
    throw new Error(`${label} ${field} must stay inside ${normalizedRoot}.`);
  }

  return normalized;
}

function getExpectedPromptWrapperPath(procedureId: string): string {
  return `prompts/self-hosting/${procedureId}.md`;
}

function assertPromptWrapperPath(fieldValue: string, procedureId: string, label: string): string {
  const normalized = toPortablePath(fieldValue);
  const expectedPath = getExpectedPromptWrapperPath(procedureId);

  if (normalized !== expectedPath) {
    throw new Error(`${label} prompt_wrapper_path must be ${expectedPath}.`);
  }

  return normalized;
}

function assertOperatorContract(value: unknown, label: string): SelfHostingOperatorContract | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = assertObject(value, label);
  const primaryOutputs = assertStringArray(record.primary_outputs, "primary_outputs", label);
  const allowedOutcomeStates = assertStringArray(record.allowed_outcome_states, "allowed_outcome_states", label);
  const durableDecisionFields = record.durable_decision_fields === undefined
    ? undefined
    : assertStringArray(record.durable_decision_fields, "durable_decision_fields", label);

  return {
    primary_outputs: primaryOutputs,
    allowed_outcome_states: allowedOutcomeStates,
    ...(durableDecisionFields ? { durable_decision_fields: durableDecisionFields } : {}),
    ...(record.real_operator_choices_only === undefined
      ? {}
      : { real_operator_choices_only: assertBoolean(record.real_operator_choices_only, "real_operator_choices_only", label) }),
    ...(record.latest_amendment_supersedes_prior_plan === undefined
      ? {}
      : {
          latest_amendment_supersedes_prior_plan: assertBoolean(
            record.latest_amendment_supersedes_prior_plan,
            "latest_amendment_supersedes_prior_plan",
            label
          )
        })
  };
}

export function validateSelfHostingProcedureRegistry(value: unknown): SelfHostingProcedureRegistry {
  const record = assertObject(value, "self-hosting procedure registry");
  assertSupportedSchemaVersion(record.schema_version, SELF_HOSTING_PROCEDURE_REGISTRY_PATH);
  if (record.schema_version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`${SELF_HOSTING_PROCEDURE_REGISTRY_PATH} must declare schema_version ${CURRENT_SCHEMA_VERSION}.`);
  }

  const producerCommand = assertString(record.producer_command, "producer_command", "self-hosting procedure registry");
  const registryId = assertString(record.registry_id, "registry_id", "self-hosting procedure registry");
  const canonicalRoot = assertString(record.canonical_root, "canonical_root", "self-hosting procedure registry");
  const normalizedCanonicalRoot = toPortablePath(canonicalRoot);
  const discoveryTargets = assertDiscoveryTargets(record.discovery_targets, "self-hosting procedure registry");

  if (normalizedCanonicalRoot !== "skills/self-hosting/") {
    throw new Error("self-hosting procedure registry canonical_root must remain skills/self-hosting/.");
  }

  if (!Array.isArray(record.procedures) || record.procedures.length === 0) {
    throw new Error("self-hosting procedure registry must list at least one procedure.");
  }

  const seenProcedureIds = new Set<string>();
  const procedures = record.procedures.map((entry, index) => {
    const item = assertObject(entry, `self-hosting procedure registry procedures[${index}]`);
    const procedureId = assertString(item.procedure_id, "procedure_id", `self-hosting procedure registry procedures[${index}]`);

    if (seenProcedureIds.has(procedureId)) {
      throw new Error(`self-hosting procedure registry lists duplicate procedure_id: ${procedureId}`);
    }
    seenProcedureIds.add(procedureId);

    const authorityLevel = assertString(
      item.authority_level,
      "authority_level",
      `self-hosting procedure registry procedures[${index}]`
    ) as SelfHostingProcedureAuthorityLevel;

    if (!["binding", "advisory", "pattern-only"].includes(authorityLevel)) {
      throw new Error(`self-hosting procedure registry procedure ${procedureId} has invalid authority_level.`);
    }

    const operatorContract = assertOperatorContract(
      item.operator_contract,
      `self-hosting procedure registry procedure ${procedureId}`
    );

    return {
      procedure_id: procedureId,
      title: assertString(item.title, "title", `self-hosting procedure registry procedures[${index}]`),
      purpose: assertString(item.purpose, "purpose", `self-hosting procedure registry procedures[${index}]`),
      canonical_source_path: assertPathInsideCanonicalRoot(
        assertString(item.canonical_source_path, "canonical_source_path", `self-hosting procedure registry procedures[${index}]`),
        "canonical_source_path",
        canonicalRoot,
        `self-hosting procedure registry procedure ${procedureId}`
      ),
      skill_path: assertPathInsideCanonicalRoot(
        assertString(item.skill_path, "skill_path", `self-hosting procedure registry procedures[${index}]`),
        "skill_path",
        canonicalRoot,
        `self-hosting procedure registry procedure ${procedureId}`
      ),
      source_notes_path: assertPathInsideCanonicalRoot(
        assertString(item.source_notes_path, "source_notes_path", `self-hosting procedure registry procedures[${index}]`),
        "source_notes_path",
        canonicalRoot,
        `self-hosting procedure registry procedure ${procedureId}`
      ),
      output_format_path: assertPathInsideCanonicalRoot(
        assertString(item.output_format_path, "output_format_path", `self-hosting procedure registry procedures[${index}]`),
        "output_format_path",
        canonicalRoot,
        `self-hosting procedure registry procedure ${procedureId}`
      ),
      prompt_wrapper_path: assertPromptWrapperPath(
        assertString(item.prompt_wrapper_path, "prompt_wrapper_path", `self-hosting procedure registry procedures[${index}]`),
        procedureId,
        `self-hosting procedure registry procedure ${procedureId}`
      ),
      required_inputs: assertStringArray(item.required_inputs, "required_inputs", `self-hosting procedure registry procedures[${index}]`),
      blocker_conditions: assertStringArray(
        item.blocker_conditions,
        "blocker_conditions",
        `self-hosting procedure registry procedures[${index}]`
      ),
      evidence_to_record: assertStringArray(
        item.evidence_to_record,
        "evidence_to_record",
        `self-hosting procedure registry procedures[${index}]`
      ),
      phase_23_5_dependencies: assertStringArray(
        item.phase_23_5_dependencies,
        "phase_23_5_dependencies",
        `self-hosting procedure registry procedures[${index}]`
      ),
      phase_24_packet_dependencies: assertStringArray(
        item.phase_24_packet_dependencies,
        "phase_24_packet_dependencies",
        `self-hosting procedure registry procedures[${index}]`
      ),
      authority_level: authorityLevel,
      generated_or_install_targets_non_authoritative: assertBoolean(
        item.generated_or_install_targets_non_authoritative,
        "generated_or_install_targets_non_authoritative",
        `self-hosting procedure registry procedures[${index}]`
      ),
      ...(operatorContract ? { operator_contract: operatorContract } : {})
    };
  });

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    producer_command: producerCommand,
    registry_id: registryId,
    canonical_root: normalizedCanonicalRoot,
    discovery_targets: discoveryTargets,
    procedures
  };
}

export function readSelfHostingProcedureRegistry(targetRoot: string): SelfHostingProcedureRegistry | undefined {
  const registryPath = path.join(targetRoot, SELF_HOSTING_PROCEDURE_REGISTRY_PATH);

  if (!fs.existsSync(registryPath) || !fs.statSync(registryPath).isFile()) {
    return undefined;
  }

  const value = JSON.parse(fs.readFileSync(registryPath, "utf8")) as unknown;
  return validateSelfHostingProcedureRegistry(value);
}

export function indexSelfHostingProceduresById(
  registry: SelfHostingProcedureRegistry
): Map<string, SelfHostingProcedureDescriptor> {
  return new Map(registry.procedures.map((procedure) => [procedure.procedure_id, procedure]));
}
