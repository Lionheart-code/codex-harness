import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type DeliveryFactKind, type DeliveryFactRecord, type DeliveryFactStatus } from "./lifecycle-types";
import { buildMergeFactOccurrenceId, isMergeFactKind, normalizeMergeFactKind } from "./merge-facts";
import { PayloadStore, type StorePayloadInput } from "./payload-store";
import { RunStagingDatabase, resolveHarnessRoots, writeCompatibilityRunArtifacts } from "./run-staging-db";
import {
  type RemoteCheckResult,
  type ReviewResult,
  type ReviewResultStatus,
  type Run,
  deriveDeliverySourceRelationship
} from "./runtime";

export interface DeliveryFactInput {
  fact_kind: DeliveryFactKind;
  source: string;
  status: DeliveryFactStatus;
  recorded_at: string;
  summary: string;
  url?: string;
  external_run_id?: string;
  commit_sha?: string;
  gate_id?: string;
  name?: string;
  required?: boolean;
  blockers?: string[];
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

interface DeliveryFactImportEnvelope {
  facts: DeliveryFactInput[];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
  return `{${entries.join(",")}}`;
}

function normalizeReviewStatus(status: DeliveryFactStatus): ReviewResultStatus {
  if (status === "approved" || status === "pass") {
    return "PASS";
  }

  if (status === "rejected" || status === "failed") {
    return "FIX_REQUIRED";
  }

  return "UNKNOWN";
}

function parseImportFile(filePath: string): DeliveryFactImportEnvelope {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Delivery facts file not found: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<DeliveryFactImportEnvelope>;
  if (!Array.isArray(parsed.facts)) {
    throw new Error("Delivery facts import must be a JSON object with a `facts` array.");
  }

  return {
    facts: parsed.facts.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`Delivery fact ${index + 1} must be an object.`);
      }

      const fact = entry as Partial<DeliveryFactInput>;
      if (
        typeof fact.fact_kind !== "string" ||
        typeof fact.source !== "string" ||
        typeof fact.status !== "string" ||
        typeof fact.recorded_at !== "string" ||
        typeof fact.summary !== "string"
      ) {
        throw new Error(`Delivery fact ${index + 1} is missing required fields.`);
      }

      return fact as DeliveryFactInput;
    })
  };
}

function nextId(prefix: string, seed: string): string {
  return `${prefix}-${seed.slice(0, 24)}`;
}

function buildDeliveryFactId(run: Run, fact: DeliveryFactInput): string {
  const normalizedFactKind = normalizeMergeFactKind(fact.fact_kind);
  if (isMergeFactKind(normalizedFactKind)) {
    if (typeof run.run_instance_id !== "string" || run.run_instance_id.trim().length === 0) {
      throw new Error(`Run ${run.run_id} lacks exact immutable identity required for merge fact ingestion.`);
    }
    return buildMergeFactOccurrenceId(run.run_instance_id, normalizedFactKind, fact);
  }

  const identity = stableJson({
    fact_kind: normalizedFactKind,
    source: fact.source.trim().toLowerCase(),
    status: fact.status,
    recorded_at: fact.recorded_at,
    summary: fact.summary,
    url: fact.url ?? null,
    external_run_id: fact.external_run_id ?? null,
    commit_sha: fact.commit_sha ?? null,
    gate_id: fact.gate_id ?? null,
    name: fact.name ?? null,
    required: fact.required ?? null,
    blockers: fact.blockers ?? [],
    metadata: fact.metadata ?? null,
    excerpt_hash: fact.excerpt ? sha256Hex(fact.excerpt) : null
  });
  return `delivery-${sha256Hex(identity).slice(0, 24)}`;
}

function toRemoteCheck(factId: string, fact: DeliveryFactInput): RemoteCheckResult | undefined {
  if (fact.fact_kind !== "remote_ci") {
    return undefined;
  }

  return {
    check_result_id: nextId("remote-check-import", factId),
    gate_id: fact.gate_id ?? "remote-ci",
    name: fact.name ?? "Imported remote CI",
    status: fact.status === "pass" ? "pass" : fact.status === "failed" ? "failed" : "unknown",
    required: fact.required ?? true,
    recorded_at: fact.recorded_at,
    ci_run: {
      provider: fact.source,
      ...(fact.external_run_id ? { run_id: fact.external_run_id } : {}),
      ...(fact.url ? { url: fact.url } : {}),
      ...(fact.metadata ? { metadata: fact.metadata } : {})
    },
    ...(fact.summary ? { explanation: fact.summary } : {}),
    ...(fact.metadata ? { metadata: fact.metadata } : {})
  };
}

function toReviewResult(factId: string, fact: DeliveryFactInput): ReviewResult | undefined {
  if (fact.fact_kind !== "review") {
    return undefined;
  }

  const reviewStatus = normalizeReviewStatus(fact.status);
  if (reviewStatus === "UNKNOWN") {
    return undefined;
  }

  return {
    review_result_id: nextId("review-import", factId),
    status: reviewStatus,
    created_at: fact.recorded_at,
    summary: fact.summary,
    source: `delivery:${fact.source}`,
    blockers: reviewStatus === "FIX_REQUIRED" ? fact.blockers ?? [fact.summary] : [],
    artifact_refs: []
  };
}

export function importDeliveryFacts(
  cwd: string,
  runId: string,
  filePath: string,
  dryRun = false
): { run: Run; imported: DeliveryFactRecord[] } {
  const roots = resolveHarnessRoots(cwd);
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, runId);
  const run = staging.loadRun(runId);

  if (!run) {
    throw new Error(`Run not found in staging DB: ${runId}`);
  }
  const parsed = parseImportFile(path.resolve(cwd, filePath));
  const buildImportedRun = (sourceRun: Run, storeExcerpt?: (input: StorePayloadInput) => string) => {
    const imported: DeliveryFactRecord[] = [];
    const nextRun: Run = JSON.parse(JSON.stringify(sourceRun)) as Run;
    const knownFacts = new Map<string, DeliveryFactRecord>();
    for (const existing of nextRun.delivery_facts) {
      knownFacts.set(existing.delivery_fact_id, existing);
    }
    const remoteChecks = new Map(nextRun.remote_checks.map((entry) => [entry.check_result_id, entry] as const));
    const reviewResults = new Map(nextRun.review_results.map((entry) => [entry.review_result_id, entry] as const));

    for (const fact of parsed.facts) {
    const normalizedFactKind = normalizeMergeFactKind(fact.fact_kind);
    const deliveryFactId = buildDeliveryFactId(nextRun, fact);
    const existingFact = knownFacts.get(deliveryFactId);
    let excerptPayloadId: string | undefined;
    if (existingFact?.excerpt_payload_id) {
      excerptPayloadId = existingFact.excerpt_payload_id;
    } else if (fact.excerpt && storeExcerpt) {
      excerptPayloadId = storeExcerpt({
        parentRecordId: `delivery-fact:${deliveryFactId}`,
        sourceRunId: nextRun.run_id,
        sourcePhaseId: nextRun.phase_id,
        kind: "delivery_excerpt",
        mediaType: "text/plain",
        summary: `${normalizedFactKind} excerpt`,
        content: fact.excerpt,
        searchableText: fact.excerpt.slice(0, 4000),
        boundedExcerpt: fact.excerpt.slice(0, 500),
        retentionClass: "audit"
      });
    }

    const deliveryFact: DeliveryFactRecord = {
      ...(existingFact ?? {}),
      delivery_fact_id: deliveryFactId,
      run_id: nextRun.run_id,
      fact_kind: normalizedFactKind,
      source: fact.source,
      status: fact.status,
      recorded_at: fact.recorded_at,
      summary: fact.summary,
      ...(fact.url ? { url: fact.url } : {}),
      ...(fact.external_run_id ? { external_run_id: fact.external_run_id } : {}),
      ...(fact.commit_sha ? { commit_sha: fact.commit_sha } : {}),
      ...(excerptPayloadId ? { excerpt_payload_id: excerptPayloadId } : existingFact?.excerpt_payload_id ? { excerpt_payload_id: existingFact.excerpt_payload_id } : {}),
      ...(fact.metadata ? { metadata: fact.metadata } : {})
    };
    imported.push(deliveryFact);
    knownFacts.set(deliveryFactId, deliveryFact);

    const remoteCheck = toRemoteCheck(deliveryFactId, fact);
    if (remoteCheck) {
      remoteChecks.set(remoteCheck.check_result_id, remoteCheck);
      const gateIndex = nextRun.required_gates.findIndex((gate) => gate.gate_id === remoteCheck.gate_id);
      const nextGate = {
        gate_id: remoteCheck.gate_id,
        name: remoteCheck.name,
        required: remoteCheck.required,
        status: remoteCheck.status,
        explanation: remoteCheck.explanation,
        check_result_id: remoteCheck.check_result_id
      };
      if (gateIndex >= 0) {
        nextRun.required_gates[gateIndex] = nextGate;
      } else {
        nextRun.required_gates.push(nextGate);
      }
    }

    const reviewResult = toReviewResult(deliveryFactId, fact);
    if (reviewResult) {
      reviewResults.set(reviewResult.review_result_id, reviewResult);
    } else if (fact.fact_kind === "review") {
      reviewResults.delete(nextId("review-import", deliveryFactId));
    }
    }

    nextRun.delivery_facts = [...knownFacts.values()].sort((left, right) => {
    const timeCompare = left.recorded_at.localeCompare(right.recorded_at);
    return timeCompare !== 0 ? timeCompare : left.delivery_fact_id.localeCompare(right.delivery_fact_id);
  });
    nextRun.remote_checks = [...remoteChecks.values()].sort((left, right) => {
    const timeCompare = left.recorded_at.localeCompare(right.recorded_at);
    return timeCompare !== 0 ? timeCompare : left.check_result_id.localeCompare(right.check_result_id);
  });
    nextRun.review_results = [...reviewResults.values()].sort((left, right) => {
    const timeCompare = left.created_at.localeCompare(right.created_at);
    return timeCompare !== 0 ? timeCompare : left.review_result_id.localeCompare(right.review_result_id);
  });
    const relationship = deriveDeliverySourceRelationship(
      roots.targetRoot,
      nextRun,
      nextRun.delivery_facts
    );
    if (relationship) {
      nextRun.delivered_source_head = relationship.delivered_source_head;
      nextRun.delivery_source_relationship = relationship;
    }
    nextRun.updated_at = new Date().toISOString();
    return { nextRun, imported };
  };

  if (!dryRun) {
    let imported: DeliveryFactRecord[] = [];
    const persistedRun = staging.mutateRunWithDatabase(runId, (latestRun, database) => {
      if ((latestRun.review_launch_claims?.length ?? 0) > 0) {
        throw new Error("REVIEW_LAUNCH_OWNERSHIP_ACTIVE: delivery-fact import is blocked until the original review launcher records terminal exit or the run is explicitly discarded.");
      }
      const built = buildImportedRun(latestRun, (input) => new PayloadStore(database).store(input).payload_id);
      imported = built.imported;
      return built.nextRun;
    }, { expectedRunInstanceId: run.run_instance_id });
    writeCompatibilityRunArtifacts(roots.targetRoot, persistedRun);
    return {
      run: persistedRun,
      imported
    };
  }

  const { nextRun, imported } = buildImportedRun(run);
  return {
    run: nextRun,
    imported
  };
}
