import { canonicalJson, sha256Hex } from "./evidence-types";

export interface NormalizedObservedProfileV1 {
  adapter: string;
  provider: string;
  model: string;
  reasoning: string;
  sandbox: string;
  approval_policy: string;
}

export type RawReviewStartupObservationV1 =
  | {
      schema_version: 1;
      source_kind: "codex_cli_startup_preamble_v1";
      session_id: string;
      raw_bytes: string;
      raw_sha256: `sha256:${string}`;
      byte_start: number;
      byte_end: number;
    }
  | {
      schema_version: 1;
      source_kind: "codex_turn_context_v1";
      session_id: string;
      raw_bytes: string;
      raw_sha256: `sha256:${string}`;
      turn_ordinal: number;
      context_locator: string;
    };

export interface ReviewAttemptV1 {
  schema_version: 1;
  attempt_id: `sha256:${string}`;
  launch_kind: "single_review" | "planning_review_bundle";
  procedure_ids: string[];
  cohort_id: string | null;
  source_head: string;
  source_plan_sha: `sha256:${string}`;
  observed_profile: NormalizedObservedProfileV1;
  startup_observation_hash: `sha256:${string}`;
  terminal_status: "success" | "failed";
  artifact_ids: string[];
}

function exactSingle(values: string[], field: string): string {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (unique.length !== 1) throw new Error(`review_startup_${field}_missing_or_ambiguous`);
  return unique[0];
}

function capture(raw: string, patterns: RegExp[], field: string): string {
  return exactSingle(patterns.flatMap((pattern) => [...raw.matchAll(pattern)].map((match) => match[1])), field);
}

export function parseRawReviewStartupObservation(
  observation: RawReviewStartupObservationV1
): NormalizedObservedProfileV1 {
  const actualHash = `sha256:${sha256Hex(Buffer.from(observation.raw_bytes, "utf8"))}`;
  if (actualHash !== observation.raw_sha256) throw new Error("review_startup_raw_hash_mismatch");
  if (observation.source_kind === "codex_cli_startup_preamble_v1") {
    if (observation.byte_start < 0 || observation.byte_end <= observation.byte_start
      || Buffer.byteLength(observation.raw_bytes) !== observation.byte_end - observation.byte_start) {
      throw new Error("review_startup_preamble_byte_range_invalid");
    }
  } else if (observation.turn_ordinal < 0 || !observation.context_locator.trim()) {
    throw new Error("review_startup_turn_context_locator_invalid");
  }
  const raw = observation.raw_bytes;
  return {
    adapter: capture(raw, [/(?:adapter|adapter_id)[=:]\s*["']?([A-Za-z0-9_.-]+)/giu], "adapter"),
    provider: capture(raw, [/(?:provider|provider_id)[=:]\s*["']?([A-Za-z0-9_.-]+)/giu], "provider"),
    model: capture(raw, [/(?:model)[=:]\s*["']?([A-Za-z0-9_.-]+)/giu], "model"),
    reasoning: capture(raw, [/(?:reasoning|reasoning_effort)[=:]\s*["']?([A-Za-z0-9_.-]+)/giu], "reasoning"),
    sandbox: capture(raw, [/(?:sandbox|sandbox_mode)[=:]\s*["']?([A-Za-z0-9_.-]+)/giu], "sandbox"),
    approval_policy: capture(raw, [/(?:approval|approval_policy)[=:]\s*["']?([A-Za-z0-9_.-]+)/giu], "approval_policy")
  };
}

export function buildReviewAttempt(
  input: Omit<ReviewAttemptV1, "schema_version" | "attempt_id" | "observed_profile" | "startup_observation_hash">,
  observation: RawReviewStartupObservationV1,
  requestedProfile?: Partial<NormalizedObservedProfileV1>
): ReviewAttemptV1 {
  const observed = parseRawReviewStartupObservation(observation);
  if (requestedProfile) {
    for (const [key, value] of Object.entries(requestedProfile)) {
      if (value !== undefined && observed[key as keyof NormalizedObservedProfileV1] !== value) {
        throw new Error(`review_startup_profile_mismatch:${key}`);
      }
    }
  }
  const normalized = {
    schema_version: 1 as const,
    ...input,
    procedure_ids: [...input.procedure_ids],
    observed_profile: observed,
    startup_observation_hash: observation.raw_sha256
  };
  return { ...normalized, attempt_id: `sha256:${sha256Hex(canonicalJson(normalized))}` };
}

export function assertPlanningBundleIdentity(attempt: ReviewAttemptV1): void {
  if (attempt.launch_kind !== "planning_review_bundle"
    || canonicalJson(attempt.procedure_ids) !== canonicalJson(["plan-review", "architecture-review", "db-storage-review"])
    || attempt.cohort_id === null) {
    throw new Error("planning_review_bundle_identity_invalid");
  }
}
