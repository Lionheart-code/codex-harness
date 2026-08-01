import { type HarvestRecord } from "./lifecycle-types";
import { evaluateMergeFacts } from "./merge-facts";
import { AmbiguousDisplayRunIdError, HarvestConflictError, ProjectMemoryDatabase } from "./project-memory-db";
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

function hasExactRunIdentity(run: Run): run is Run & { run_instance_id: string; run_revision: number } {
  return typeof run.run_instance_id === "string"
    && run.run_instance_id.trim().length > 0
    && typeof run.run_revision === "number"
    && Number.isInteger(run.run_revision)
    && run.run_revision >= 1;
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
  const run = staging.loadRun(runId);
  if (!run) {
    const existingHarvests = project.listHarvestRecordsByDisplayRunId(runId);
    const existingRuns = project.listRunsByDisplayRunId(runId);
    if (existingHarvests.length === 1 && existingRuns.length === 1) {
      return {
        run: existingRuns[0],
        harvest: existingHarvests[0],
        alreadyHarvested: true
      };
    }
    if (existingHarvests.length > 1 || existingRuns.length > 1) {
      throw new AmbiguousDisplayRunIdError(runId);
    }
    throw new Error(`Run not found in staging DB: ${runId}`);
  }
  if (run.phase_id === "23.9") {
    const dispositions = staging.listIndependentRecords("successor_disposition", runId);
    if (dispositions.length !== 1) {
      throw new Error(`successor_disposition_cardinality_invalid:${dispositions.length}`);
    }
  }
  if (!hasExactRunIdentity(run)) {
    throw new Error(
      `Run ${runId} lacks exact immutable identity and cannot be harvested. Open a fresh replacement run or migrate this legacy run first.`
    );
  }

  const existing = project.getHarvestRecordByRunInstanceId(run.run_instance_id);
  if (existing) {
    const existingRun = project.getRunByInstanceId(run.run_instance_id);
    if (!existingRun) {
      throw new Error(`Run ${runId} was harvested, but neither staging nor project authority can resolve the run state.`);
    }
    if (!hasExactRunIdentity(existingRun)) {
      throw new Error(
        `Harvest authority for ${runId} lacks exact immutable identity and cannot authorize retry or replacement.`
      );
    }

    return {
      run: existingRun,
      harvest: existing,
      alreadyHarvested: true
    };
  }
  if (run.lifecycle_status !== "closed" && run.lifecycle_status !== "discarded") {
    throw new Error(
      `Run ${runId} cannot be harvested while lifecycle status is ${run.lifecycle_status}. Close or discard it first.`
    );
  }
  if (run.lifecycle_status !== "discarded") {
    const mergeBlockers = evaluateMergeFacts(run.delivery_facts).blockers;
    if (mergeBlockers.length > 0) {
      throw new Error(
        `Run ${runId} cannot be harvested until merge delivery facts are satisfied: ${mergeBlockers.join(", ")}`
      );
    }
  }

  const promotedAt = nowIso();
  const stagingStatus = staging.status();
  const deliveryFacts = staging.listDeliveryFacts(runId);
  const procedureArtifactTransferStats = staging.getProcedureArtifactTransferStats(run.run_instance_id);
  project.ensureInitialized();
  let harvest: HarvestRecord | undefined;
  let acceptedRun: Run | undefined;
  try {
    acceptedRun = staging.mutateRun(runId, (latestRun) => {
      if ((latestRun.review_launch_claims?.length ?? 0) > 0) {
        throw new Error("REVIEW_LAUNCH_OWNERSHIP_ACTIVE: harvest is blocked until the original review launcher records terminal exit or the run is explicitly discarded.");
      }
      const nextRun: Run = {
        ...latestRun,
        lifecycle_status: "harvested",
        harvested_at: promotedAt,
        updated_at: promotedAt
      };
      harvest = {
        harvest_id: `harvest-${runId}`,
        run_id: runId,
        project_run_id: run.run_instance_id,
        status: latestRun.lifecycle_status === "discarded" ? "discarded" : "promoted",
        promoted_at: promotedAt,
        accepted_count: nextRun.command_results.length + nextRun.verification_results.length + nextRun.review_results.length +
          nextRun.findings.length + nextRun.decisions.length + nextRun.approvals.length + nextRun.closeout_receipts.length,
        discarded_count: Math.max(latestRun.lifecycle_status === "discarded" ? 1 : 0, stagingStatus.discardedPayloadCount),
        quarantined_count: stagingStatus.quarantinedPayloadCount,
        redacted_count: Math.max(countRedacted(nextRun), stagingStatus.redactedPayloadCount),
        unresolved_count: countUnresolved(latestRun),
        source_task_path: nextRun.active_task_path ?? nextRun.task_path,
        source_snapshot: nextRun.source_snapshot ?? nextRun.repository.head_sha ?? "unknown",
        details: {
          accepted_record_kinds: ["run", "phase_run", "step", "command_result", "verification_result", "review_result", "finding", "decision", "approval", "closeout_receipt", "delivery_fact", "review_invocation", "review_replay_packet", "routing_evaluation", "routing_decision", "routing_policy_application", "prepared_successor_cleanup"],
          delivery_fact_count: deliveryFacts.length,
          ...procedureArtifactTransferStats
        }
      };
      project.saveAcceptedRun(nextRun, deliveryFacts, harvest);
      return nextRun;
    }, { expectedRunInstanceId: run.run_instance_id });
  } catch (error) {
    if (error instanceof HarvestConflictError) {
      const authorityHarvest = project.getHarvestRecordByRunInstanceId(run.run_instance_id);
      const authorityRun = project.getRunByInstanceId(run.run_instance_id);
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
  if (!acceptedRun || !harvest) {
    throw new Error(`Harvest ${runId} did not produce accepted state.`);
  }
  writeCompatibilityRunArtifacts(targetRoot, acceptedRun);

  return {
    run: acceptedRun,
    harvest,
    alreadyHarvested: false
  };
}
