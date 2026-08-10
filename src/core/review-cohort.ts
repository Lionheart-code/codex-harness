import { canonicalJson, sha256Hex } from "./evidence-types";

type Sha256 = `sha256:${string}`;

export interface ProcedureOutputContractRefV1 {
  procedure_id: string;
  registry_contract_version: string;
  skill_path: string;
  skill_hash: Sha256;
  output_format_path: string;
  output_format_hash: Sha256;
  output_schema_path: string;
  output_schema_hash: Sha256;
  output_contract_id: Sha256;
}

export interface ReviewCohortV1 {
  schema_version: 1;
  record_kind: "review_cohort";
  record_id: Sha256;
  content_hash: Sha256;
  run_instance_id: string;
  run_id: string;
  task_artifact_id: Sha256;
  immutable_base: string;
  planning_review_source_head: string;
  anchor_plan_sha: Sha256;
  output_contract_refs: ProcedureOutputContractRefV1[];
  profile_id: string;
  bundle_kind: "candidate" | "closure";
  predecessor_cohort_id: Sha256 | null;
  required_lens_ids: string[];
  carried_lens_refs: Sha256[];
  context_core_hash: Sha256;
  created_at: string;
}

export function buildReviewCohort(
  input: Omit<ReviewCohortV1, "schema_version" | "record_kind" | "record_id" | "content_hash">
): ReviewCohortV1 {
  if (canonicalJson(input.required_lens_ids) !== canonicalJson(["plan-review", "architecture-review", "db-storage-review"])
    || input.output_contract_refs.length !== 3
    || new Set(input.output_contract_refs.map((entry) => entry.procedure_id)).size !== 3) {
    throw new Error("review_cohort_lens_cardinality_invalid");
  }
  for (const contract of input.output_contract_refs) {
    const expected = sha(canonicalJson(Object.fromEntries(Object.entries(contract).filter(([key]) => key !== "output_contract_id"))));
    if (contract.output_contract_id !== expected) throw new Error(`review_cohort_output_contract_identity_invalid:${contract.procedure_id}`);
  }
  const content = { schema_version: 1 as const, record_kind: "review_cohort" as const, ...input };
  const contentHash = sha(canonicalJson(content));
  return { ...content, content_hash: contentHash, record_id: contentHash };
}

export interface ObservedReviewProfileV1 {
  schema_version: 1;
  raw_source: "codex_cli_startup_preamble_v1" | "codex_turn_context_v1";
  raw_observation_hash: Sha256;
  session_id: string;
  workdir: string;
  model: string;
  provider: string;
  reasoning: string;
  sandbox: string;
  approval_policy: string;
}

export type NormalizedObservedProfileV1 = ObservedReviewProfileV1;

export type RawReviewStartupObservationV1 =
  | {
      schema_version: 1;
      source: "codex_cli_startup_preamble_v1";
      session_id: string;
      raw_bytes: string;
      raw_byte_length: number;
      raw_sha256: Sha256;
      byte_start: number;
      byte_end: number;
    }
  | {
      schema_version: 1;
      source: "codex_turn_context_v1";
      session_id: string;
      rollout_path_hash: Sha256;
      session_meta_record_ordinal: number;
      session_meta_raw_bytes: string;
      session_meta_raw_byte_length: number;
      session_meta_raw_sha256: Sha256;
      turn_context_record_ordinal: number;
      turn_context_raw_bytes: string;
      turn_context_raw_byte_length: number;
      turn_context_raw_sha256: Sha256;
      raw_pair_sha256: Sha256;
    };

export interface ReviewAttemptV1 {
  schema_version: 1;
  record_kind: "review_attempt";
  record_id: Sha256;
  content_hash: Sha256;
  run_instance_id: string;
  run_id: string;
  attempt_kind: "single_review" | "planning_bundle";
  cohort_id: string | null;
  attempt_id: string;
  claim_id: string;
  procedure_ids: string[];
  profile_id: string;
  request_artifact_hash: Sha256;
  expected_bundle_output_path: string;
  claimed_event_id: Sha256;
  started_event_id: Sha256 | null;
  terminal_event_id: Sha256;
  terminal_status: "success" | "failed";
  verdict: "PASS" | "FIX_REQUIRED" | "AMEND_REQUIRED" | "failed" | null;
  reviewed_source_head: string | null;
  implementation_diff_id: Sha256 | null;
  predecessor_review_attempt_id: string | null;
  predecessor_review_artifact_id: string | null;
  bundle_envelope_id: string | null;
  bundle_envelope_hash: Sha256 | null;
  lens_results: Array<{ procedure_id: string; artifact_id: Sha256; verdict: string }>;
  created_at: string;
}

export interface ReviewAttemptEventV1 {
  schema_version: 1;
  record_kind: "review_attempt_event";
  record_id: Sha256;
  content_hash: Sha256;
  run_instance_id: string;
  run_id: string;
  attempt_kind: "single_review" | "planning_bundle";
  cohort_id: string | null;
  attempt_id: string;
  claim_id: string;
  procedure_ids: string[];
  sequence: 1 | 2 | 3;
  event_type: "claimed" | "started" | "terminal";
  request_artifact_hash: Sha256;
  expected_bundle_output_path: string;
  owner_token_hash: Sha256;
  occurred_at: string;
  raw_startup_observation: RawReviewStartupObservationV1 | null;
  observed_profile: ObservedReviewProfileV1 | null;
  terminal_status: "success" | "failed" | null;
  error_code: string | null;
  output_artifact_hash: Sha256 | null;
}

export function buildReviewAttemptEvent(
  input: Omit<ReviewAttemptEventV1, "schema_version" | "record_kind" | "record_id" | "content_hash">
): ReviewAttemptEventV1 {
  const sequenceValid = input.sequence === 1 && input.event_type === "claimed"
    || input.sequence === 2 && ["started", "terminal"].includes(input.event_type)
    || input.sequence === 3 && input.event_type === "terminal";
  if (!sequenceValid
    || (input.event_type === "started") !== Boolean(input.raw_startup_observation && input.observed_profile)
    || (input.event_type === "terminal") !== Boolean(input.terminal_status)) {
    throw new Error("review_attempt_event_automaton_invalid");
  }
  const content = { schema_version: 1 as const, record_kind: "review_attempt_event" as const, ...input };
  const contentHash = sha(canonicalJson(content));
  return { ...content, content_hash: contentHash, record_id: contentHash };
}

function sha(bytes: string): Sha256 {
  return `sha256:${sha256Hex(Buffer.from(bytes, "utf8"))}`;
}

function parseJsonRecord(raw: string, expectedType: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw.trimEnd()); } catch { throw new Error(`review_startup_${expectedType}_invalid_json`); }
  if (!parsed || typeof parsed !== "object" || (parsed as { type?: unknown }).type !== expectedType) {
    throw new Error(`review_startup_${expectedType}_record_invalid`);
  }
  return parsed as Record<string, unknown>;
}

export function parseRawReviewStartupObservation(
  observation: RawReviewStartupObservationV1
): ObservedReviewProfileV1 {
  if (observation.source === "codex_cli_startup_preamble_v1") {
    if (sha(observation.raw_bytes) !== observation.raw_sha256
      || Buffer.byteLength(observation.raw_bytes) !== observation.raw_byte_length
      || observation.byte_start < 0 || observation.byte_end <= observation.byte_start
      || observation.raw_byte_length !== observation.byte_end - observation.byte_start) {
      throw new Error("review_startup_preamble_identity_invalid");
    }
    const fields = new Map<string, string>(observation.raw_bytes.split(/\r?\n/u).map((line): [string, string] => {
      const match = /^([a-z_]+)=(.+)$/u.exec(line);
      return match ? [match[1], match[2]] : ["", ""];
    }).filter(([key]) => key));
    const values = {
      adapter: fields.get("adapter") ?? "",
      provider: fields.get("provider") ?? "",
      model: fields.get("model") ?? "",
      reasoning: fields.get("reasoning") ?? "",
      sandbox: fields.get("sandbox") ?? "",
      approval_policy: fields.get("approval_policy") ?? ""
    };
    if (fields.size !== 6 || Object.values(values).some((value) => !value)) {
      throw new Error("review_startup_preamble_projection_invalid");
    }
    return {
      schema_version: 1,
      raw_source: observation.source,
      raw_observation_hash: observation.raw_sha256,
      session_id: observation.session_id,
      workdir: "unavailable-in-cli-preamble",
      provider: values.provider,
      model: values.model,
      reasoning: values.reasoning,
      sandbox: values.sandbox,
      approval_policy: values.approval_policy
    };
  }
  if (sha(observation.session_meta_raw_bytes) !== observation.session_meta_raw_sha256
    || sha(observation.turn_context_raw_bytes) !== observation.turn_context_raw_sha256
    || Buffer.byteLength(observation.session_meta_raw_bytes) !== observation.session_meta_raw_byte_length
    || Buffer.byteLength(observation.turn_context_raw_bytes) !== observation.turn_context_raw_byte_length
    || sha(observation.session_meta_raw_bytes + observation.turn_context_raw_bytes) !== observation.raw_pair_sha256
    || observation.session_meta_record_ordinal < 0
    || observation.turn_context_record_ordinal <= observation.session_meta_record_ordinal) {
    throw new Error("review_startup_turn_context_identity_invalid");
  }
  const meta = parseJsonRecord(observation.session_meta_raw_bytes, "session_meta");
  const turn = parseJsonRecord(observation.turn_context_raw_bytes, "turn_context");
  const metaPayload = meta.payload as Record<string, unknown> | undefined;
  const turnPayload = turn.payload as Record<string, unknown> | undefined;
  const sandbox = turnPayload?.sandbox_policy as Record<string, unknown> | undefined;
  const sessionId = String(metaPayload?.id ?? metaPayload?.session_id ?? "");
  const values = {
    session_id: sessionId,
    workdir: String(turnPayload?.cwd ?? ""),
    model: String(turnPayload?.model ?? ""),
    provider: String(metaPayload?.model_provider ?? ""),
    reasoning: String(turnPayload?.effort ?? ""),
    sandbox: String(sandbox?.type ?? ""),
    approval_policy: String(turnPayload?.approval_policy ?? "")
  };
  if (sessionId !== observation.session_id || Object.values(values).some((value) => !value)) {
    throw new Error("review_startup_turn_context_projection_invalid");
  }
  return {
    schema_version: 1,
    raw_source: observation.source,
    raw_observation_hash: observation.raw_pair_sha256,
    ...values
  };
}

export function buildReviewAttempt(
  input: Omit<ReviewAttemptV1, "schema_version" | "record_kind" | "record_id" | "content_hash">,
  observation: RawReviewStartupObservationV1,
  requestedProfile?: Partial<ObservedReviewProfileV1>
): ReviewAttemptV1 {
  const observed = parseRawReviewStartupObservation(observation);
  for (const [key, value] of Object.entries(requestedProfile ?? {})) {
    if (value !== undefined && observed[key as keyof ObservedReviewProfileV1] !== value) {
      throw new Error(`review_startup_profile_mismatch:${key}`);
    }
  }
  return buildReviewAttemptRecord(input);
}

export function buildReviewAttemptRecord(
  input: Omit<ReviewAttemptV1, "schema_version" | "record_kind" | "record_id" | "content_hash">
): ReviewAttemptV1 {
  const content = {
    schema_version: 1 as const,
    record_kind: "review_attempt" as const,
    ...input,
    procedure_ids: [...input.procedure_ids],
    lens_results: input.lens_results.map((entry) => ({ ...entry }))
  };
  const contentHash = sha(canonicalJson(content));
  return { ...content, content_hash: contentHash, record_id: contentHash };
}

export function assertPlanningBundleIdentity(attempt: ReviewAttemptV1): void {
  if (attempt.attempt_kind !== "planning_bundle"
    || canonicalJson(attempt.procedure_ids) !== canonicalJson(["plan-review", "architecture-review", "db-storage-review"])
    || attempt.cohort_id === null) {
    throw new Error("planning_review_bundle_identity_invalid");
  }
}
