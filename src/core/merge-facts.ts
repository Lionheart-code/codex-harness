import { canonicalJson, sha256Hex } from "./evidence-types";
import { type DeliveryFactKind, type DeliveryFactRecord } from "./lifecycle-types";

export type MergeFactKind = "merge_result" | "merge_commit";

export interface MergeFactEvaluation {
  blockers: string[];
  latestBuckets: Partial<Record<MergeFactKind, DeliveryFactRecord[]>>;
}

export function normalizeMergeFactKind(kind: DeliveryFactKind): DeliveryFactKind {
  return kind === "merge" ? "merge_result" : kind;
}

export function isMergeFactKind(kind: DeliveryFactKind): kind is MergeFactKind {
  return normalizeMergeFactKind(kind) === "merge_result" || normalizeMergeFactKind(kind) === "merge_commit";
}

function buildMergeConcordance(fact: DeliveryFactRecord): string {
  return canonicalJson({
    status: fact.status,
    commit_sha: fact.commit_sha ?? null,
    url: fact.url ?? null,
    external_run_id: fact.external_run_id ?? null
  });
}

function latestMergeFactBucket(deliveryFacts: DeliveryFactRecord[], factKind: MergeFactKind): DeliveryFactRecord[] {
  const matchingFacts = deliveryFacts
    .filter((fact) => normalizeMergeFactKind(fact.fact_kind) === factKind)
    .sort((left, right) => {
      const timeCompare = right.recorded_at.localeCompare(left.recorded_at);
      return timeCompare !== 0 ? timeCompare : left.delivery_fact_id.localeCompare(right.delivery_fact_id);
    });

  if (matchingFacts.length === 0) {
    return [];
  }

  const latestRecordedAt = matchingFacts[0].recorded_at;
  return matchingFacts.filter((fact) => fact.recorded_at === latestRecordedAt);
}

function bucketHasConflict(bucket: DeliveryFactRecord[]): boolean {
  if (bucket.length <= 1) {
    return false;
  }

  return new Set(bucket.map((fact) => buildMergeConcordance(fact))).size > 1;
}

function bucketSatisfiesHarvest(bucket: DeliveryFactRecord[], factKind: MergeFactKind): boolean {
  if (bucket.length === 0 || bucketHasConflict(bucket)) {
    return false;
  }

  if (factKind === "merge_result") {
    return bucket[0].status === "merged";
  }

  return bucket[0].status === "merged" && typeof bucket[0].commit_sha === "string" && bucket[0].commit_sha.trim().length > 0;
}

export function evaluateMergeFacts(deliveryFacts: DeliveryFactRecord[]): MergeFactEvaluation {
  const mergeResultBucket = latestMergeFactBucket(deliveryFacts, "merge_result");
  const mergeCommitBucket = latestMergeFactBucket(deliveryFacts, "merge_commit");
  const blockers: string[] = [];

  if (mergeResultBucket.length === 0) {
    blockers.push("missing_merge_result");
  } else if (bucketHasConflict(mergeResultBucket)) {
    blockers.push("merge_fact_conflict:merge_result");
  } else if (!bucketSatisfiesHarvest(mergeResultBucket, "merge_result")) {
    blockers.push(`missing_merge_result:latest_status=${mergeResultBucket[0].status}`);
  }

  if (mergeCommitBucket.length === 0) {
    blockers.push("missing_merge_commit");
  } else if (bucketHasConflict(mergeCommitBucket)) {
    blockers.push("merge_fact_conflict:merge_commit");
  } else if (!bucketSatisfiesHarvest(mergeCommitBucket, "merge_commit")) {
    const commitState = mergeCommitBucket[0].commit_sha?.trim().length ? mergeCommitBucket[0].commit_sha : "missing";
    blockers.push(`missing_merge_commit:latest_status=${mergeCommitBucket[0].status}:commit_sha=${commitState}`);
  }

  return {
    blockers,
    latestBuckets: {
      merge_result: mergeResultBucket,
      merge_commit: mergeCommitBucket
    }
  };
}

export function buildMergeFactOccurrenceId(
  runInstanceId: string,
  factKind: MergeFactKind,
  fact: {
    source: string;
    status: string;
    recorded_at: string;
    url?: string;
    external_run_id?: string;
    commit_sha?: string;
  }
): string {
  const identity = canonicalJson({
    run_instance_id: runInstanceId,
    fact_kind: factKind,
    source: fact.source.trim().toLowerCase(),
    status: fact.status,
    commit_sha: fact.commit_sha ?? null,
    url: fact.url ?? null,
    external_run_id: fact.external_run_id ?? null,
    recorded_at: fact.recorded_at
  });
  return `delivery-${sha256Hex(identity).slice(0, 24)}`;
}
