import { type HarvestRecord } from "./lifecycle-types";
import { HarvestConflictError, ProjectMemoryDatabase } from "./project-memory-db";
import { RunStagingDatabase, writeCompatibilityRunArtifacts } from "./run-staging-db";
import { type Run } from "./runtime";

export interface HarvestResult {
  run: Run;
  harvest: HarvestRecord;
  alreadyHarvested: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function countRedacted(run: Run): number {
  return run.delivery_facts.filter((fact) => typeof fact.excerpt_payload_id === "string").length;
}

function countUnresolved(run: Run): number {
  let unresolved = 0;

  const latestVerification = run.verification_results.length > 0
    ? run.verification_results[run.verification_results.length - 1]
    : undefined;
  if (!latestVerification || latestVerification.status !== "pass") {
    unresolved += 1;
  }

  const latestReview = run.review_results.length > 0
    ? run.review_results[run.review_results.length - 1]
    : undefined;
  if (!latestReview || latestReview.status !== "PASS") {
    unresolved += 1;
  }

  unresolved += run.findings.filter((finding) => finding.blocking && finding.status !== "resolved").length;
  unresolved += run.required_gates.filter((gate) => gate.required && gate.status !== "pass").length;
  return unresolved;
}

export function harvestRun(
  targetRoot: string,
  projectRoot: string,
  runId: string
): HarvestResult {
  const staging = new RunStagingDatabase(targetRoot, projectRoot, runId);
  const project = new ProjectMemoryDatabase(targetRoot, projectRoot);
  const existing = project.getHarvestRecord(runId);

  if (existing) {
    const existingRun = staging.loadRun(runId) ?? project.getRun(runId);
    if (!existingRun) {
      throw new Error(`Run ${runId} was harvested, but neither staging nor project authority can resolve the run state.`);
    }

    return {
      run: existingRun,
      harvest: existing,
      alreadyHarvested: true
    };
  }

  const run = staging.loadRun(runId);
  if (!run) {
    throw new Error(`Run not found in staging DB: ${runId}`);
  }

  if (run.lifecycle_status !== "closed" && run.lifecycle_status !== "discarded") {
    throw new Error(
      `Run ${runId} cannot be harvested while lifecycle status is ${run.lifecycle_status}. Close or discard it first.`
    );
  }

  const promotedAt = nowIso();
  const stagingStatus = staging.status();
  const acceptedRun: Run = {
    ...run,
    lifecycle_status: "harvested",
    harvested_at: promotedAt,
    updated_at: promotedAt
  };
  const deliveryFacts = staging.listDeliveryFacts(runId);
  const harvest: HarvestRecord = {
    harvest_id: `harvest-${runId}`,
    run_id: runId,
    project_run_id: runId,
    status: run.lifecycle_status === "discarded" ? "discarded" : "promoted",
    promoted_at: promotedAt,
    accepted_count: acceptedRun.command_results.length +
      acceptedRun.verification_results.length +
      acceptedRun.review_results.length +
      acceptedRun.findings.length +
      acceptedRun.decisions.length +
      acceptedRun.approvals.length +
      acceptedRun.closeout_receipts.length,
    discarded_count: Math.max(run.lifecycle_status === "discarded" ? 1 : 0, stagingStatus.discardedPayloadCount),
    quarantined_count: stagingStatus.quarantinedPayloadCount,
    redacted_count: Math.max(countRedacted(acceptedRun), stagingStatus.redactedPayloadCount),
    unresolved_count: countUnresolved(run),
    source_task_path: acceptedRun.active_task_path ?? acceptedRun.task_path,
    source_snapshot: acceptedRun.source_snapshot ?? acceptedRun.repository.head_sha ?? "unknown",
    details: {
      accepted_record_kinds: [
        "run",
        "phase_run",
        "step",
        "command_result",
        "verification_result",
        "review_result",
        "finding",
        "decision",
        "approval",
        "closeout_receipt",
        "delivery_fact"
      ],
      delivery_fact_count: deliveryFacts.length
    }
  };

  project.ensureInitialized();
  try {
    project.saveAcceptedRun(acceptedRun, deliveryFacts, harvest);
  } catch (error) {
    if (error instanceof HarvestConflictError) {
      const authorityHarvest = project.getHarvestRecord(runId);
      const authorityRun = project.getRun(runId);
      if (authorityHarvest && authorityRun) {
        return {
          run: authorityRun,
          harvest: authorityHarvest,
          alreadyHarvested: true
        };
      }
    }

    throw error;
  }
  staging.saveRun(acceptedRun);
  writeCompatibilityRunArtifacts(targetRoot, acceptedRun);

  return {
    run: acceptedRun,
    harvest,
    alreadyHarvested: false
  };
}
