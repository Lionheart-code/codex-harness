import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  productRoot,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const runtime = require(path.join(productRoot, "dist/core/runtime.js"));
const lifecycle = require(path.join(productRoot, "dist/core/lifecycle-types.js"));
const stagingModule = require(path.join(productRoot, "dist/core/run-staging-db.js"));
const stageOperator = require(path.join(productRoot, "dist/core/stage-operator.js"));
const sqliteModule = require(path.join(productRoot, "dist/core/sqlite.js"));

function createFixtureRepo() {
  const parent = createTempDirectory("codex-harness-phase23-8-7-");
  const repo = path.join(parent, "repo");
  assertSuccess(runCommand("git", ["clone", "--quiet", "--no-hardlinks", productRoot, repo]), "clone fixture repository");
  configureLocalGitIdentity(repo);
  return { parent, repo };
}

function routeRecords(run) {
  const route = {
    route_decision_id: `route-exact-${run.run_id}`,
    route_class: "balanced_routine",
    routing_policy_version: "phase23.8.6f-route-v1",
    binding_version: "phase23.8.6f-codex-v1",
    binding_profile_id: "accepted-balanced-routine",
    context_core_id: "context-core-exact",
    context_manifest_id: "context-manifest-exact",
    delta_overlay_id: "delta-overlay-exact",
    context_mode: "fresh_independent_delta",
    usage_ref: `pending-usage-${run.run_id}`,
    run_instance_id: run.run_instance_id,
    procedure_id: "implementation-review",
    review_tier: "extra-high",
    reasoning_effort: "high",
    deterministic_evidence_state: "complete",
    parallel_policy: "serial",
    budget_class: "balanced",
    independence_mode: "independent",
    escalation_triggers: [
      "architecture",
      "authority",
      "lifecycle",
      "storage",
      "security",
      "conflicting_evidence"
    ],
    risk_classes: ["storage"],
    changed_surface_classes: ["docs_task_only", "harness"],
    required_semantic_reviews: [
      "architecture-review",
      "db-storage-review",
      "docs-consistency-review",
      "harness-audit",
      "implementation-review"
    ]
  };
  return [
    {
      record_kind: "review_invocation",
      record_id: `invocation-exact-${run.run_id}`,
      created_at: "2026-07-27T00:00:01.000Z",
      status: "success",
      summary: "Exact Phase F invocation.",
      payload: route
    },
    {
      record_kind: "review_replay_packet",
      record_id: `replay-exact-${run.run_id}`,
      created_at: "2026-07-27T00:00:02.000Z",
      status: "accepted",
      summary: "Exact Phase F replay packet.",
      payload: {
        ...route,
        run_instance_id: run.run_instance_id,
        source_run_id: run.run_id,
        policy_version: route.routing_policy_version,
        binding_version: route.binding_version,
        route_class: route.route_class,
        binding_profile_id: route.binding_profile_id,
        procedure_id: route.procedure_id,
        review_tier: route.review_tier,
        usage_ref: route.usage_ref,
        deterministic_evidence_state: route.deterministic_evidence_state,
        parallel_policy: route.parallel_policy,
        budget_class: route.budget_class,
        escalation_triggers: [...route.escalation_triggers],
        risk_classes: ["storage"],
        changed_surface_classes: ["docs_task_only", "harness"],
        required_semantic_reviews: [...route.required_semantic_reviews]
      }
    }
  ];
}

function seedRun(repo, withRoute = true, runId = "run-0001") {
  let run = runtime.buildRuntimeRun({
    runId,
    taskPath: "TASK.md",
    activeTaskPath: "tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md",
    phaseId: "23.8.7",
    repository: {
      root_path: repo,
      project_root: repo,
      dirty: false
    },
    timestamp: "2026-07-27T00:00:00.000Z"
  });
  run = {
    ...run,
    bootstrap_status: "ready",
    bootstrap_handoff: {
      handoff_id: "handoff-run-0001",
      phase_id: "23.8.6C",
      kind: "procedure",
      procedure_id: "task-intake",
      next_action: "run task-intake",
      prompt: "Run task-intake and record it through Harness."
    },
    source_snapshot: run.repository.head_sha ?? "activation",
    review_routing_records: withRoute ? routeRecords(run) : []
  };
  const runDir = path.join(repo, ".harness", "runs", run.run_id);
  fs.mkdirSync(runDir, { recursive: true });
  writeText(path.join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeText(path.join(repo, ".harness", "runs", "current.json"), `${JSON.stringify({
    run_id: run.run_id,
    run_path: `${run.run_id}/run.json`,
    updated_at: run.updated_at
  }, null, 2)}\n`);
  const roots = stagingModule.resolveHarnessRoots(repo);
  const staging = new stagingModule.RunStagingDatabase(repo, roots.projectRoot, run.run_id);
  staging.saveRun(run);
  if (withRoute) {
    const usagePayload = staging.storePayload({
      parentRecordId: `invocation-exact-${run.run_id}`,
      sourceRunId: run.run_id,
      sourcePhaseId: run.phase_id,
      kind: "review-usage-facts",
      mediaType: "application/json",
      summary: "Exact Phase F usage facts.",
      content: "{\"input_tokens\":10,\"output_tokens\":5}\n",
      retentionClass: "accepted"
    });
    for (const record of run.review_routing_records) {
      record.payload.usage_ref = usagePayload.payload_id;
    }
    staging.saveRun(run);
    writeText(path.join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  }
  return run;
}

function readRun(repo, runId = "run-0001") {
  return JSON.parse(fs.readFileSync(path.join(repo, ".harness", "runs", runId, "run.json"), "utf8"));
}

function seedCurrentPacketProcedure(repo, procedureId, packetKind) {
  const run = readRun(repo);
  const packet = run.stage_packets.find((candidate) => candidate.current);
  const state = run.stage_states.find((candidate) => candidate.current);
  packet.packet_kind = packetKind;
  packet.procedure_id = procedureId;
  packet.return_procedure_id = procedureId;
  packet.stage_id = procedureId;
  const packetId = lifecycle.deriveStagePacketId(packet);
  packet.stage_packet_id = packetId;
  packet.packet_id = packetId;
  state.packet_kind = packetKind;
  state.procedure_id = procedureId;
  state.allowed_next_stages = [procedureId];
  state.next_allowed_action = `supply a result fixture to record-stage-result --packet ${packetId}`;
  const staging = new stagingModule.RunStagingDatabase(repo, repo, run.run_id);
  staging.saveRun(run);
  stagingModule.writeCompatibilityRunArtifacts(repo, run);
  assert.doesNotThrow(() => runtime.validateRuntimeRun(run));
  return packet;
}

function validResultFixture(packet, overrides = {}) {
  return {
    stage_packet_id: packet.stage_packet_id,
    runner_profile_id: packet.runner_profile_id,
    outcome: "PASS",
    summary: "Fixture completed the bounded task-intake stage.",
    files_changed: [],
    commands: ["node -e deterministic-check"],
    outputs: ["deterministic check passed"],
    blockers: [],
    evidence_refs: ["fixture:evidence"],
    completed_reviews: [...packet.required_semantic_reviews],
    anomaly_codes: [],
    waiver_refs: [],
    validation_results: [
      { check_id: "deterministic-check", status: "pass", summary: "passed", evidence_refs: ["fixture:evidence"] }
    ],
    bounded_progress_log: ["fixture received", "checks complete"],
    actual_invocation_facts: { supplied_fixture: true },
    usage_ref: packet.usage_ref,
    ...overrides
  };
}

test("Phase 23.8.7 prepares an exact hookless packet and idempotently ingests a supplied result", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    const prepared = runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo });
    assertSuccess(prepared, "prepare hookless packet");
    assert.match(prepared.stdout, /packet kind: plan/);
    assert.match(prepared.stdout, /human_action_required: true/);
    const afterPrepare = readRun(repo);
    const packet = afterPrepare.stage_packets.at(-1);
    assert.equal(packet.route_decision_id, "route-exact-run-0001");
    assert.equal(packet.context_core_id, "context-core-exact");
    for (const field of [
      "route_decision_ref", "route_policy_ref", "provider_binding_ref", "route_class",
      "profile_floor", "reasoning_default", "reasoning_ceiling", "changed_surface_classes",
      "risk_classes", "deterministic_evidence_state", "independence_mode", "context_core_ref",
      "delta_overlay_ref", "context_manifest_ref", "context_transport_mode",
      "required_semantic_reviews", "parallel_policy", "budget_class", "usage_facts_ref",
      "escalation_triggers"
    ]) {
      assert.ok(field in packet, `packet must carry exact Phase F field ${field}`);
    }
    assert.ok(packet.validation_refs.includes("npm run build"));
    assert.ok(packet.validation_refs.includes("npm test"));
    assert.ok(packet.validation_refs.includes("git diff --check"));
    assert.ok(packet.required_semantic_reviews.includes("architecture-review"));
    assert.ok(packet.required_semantic_reviews.includes("db-storage-review"));
    assert.ok(packet.required_semantic_reviews.includes("docs-consistency-review"));
    assert.ok(packet.required_semantic_reviews.includes("harness-audit"));
    assert.deepEqual(packet.escalation_triggers, routeRecords(afterPrepare)[0].payload.escalation_triggers);
    assert.equal(afterPrepare.runner_profiles.at(-1).can_launch, false);
    assert.equal(afterPrepare.execution_policies.at(-1).provider_selection_allowed, false);
    const replayedPacket = runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo });
    assertSuccess(replayedPacket, "identical packet preparation is idempotent");
    assert.match(replayedPacket.stdout, new RegExp(`stage packet id: ${packet.stage_packet_id}`));
    assert.match(replayedPacket.stdout, /recorded: false/);

    const fixturePath = path.join(repo, "result-fixture.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
    const recorded = runCli([
      "run", "record-stage-result", "--run", "run-0001",
      "--packet", packet.stage_packet_id, "--file", fixturePath
    ], { cwd: repo });
    assertSuccess(recorded, "record supplied stage result");
    assert.match(recorded.stdout, /schema valid: true/);
    const afterResult = readRun(repo);
    assert.equal(afterResult.stage_results.length, 1);
    assert.match(afterResult.stage_results[0].payload_id, /^payload-/);
    assert.equal(afterResult.stage_results[0].actual_invocation_facts.supplied_fixture, true);
    const database = sqliteModule.openSqliteDatabase(path.join(repo, ".harness", "runs", "run-0001", "staging.sqlite"));
    try {
      const payload = database.prepare("SELECT payload_id, content_hash FROM payload_index WHERE payload_id = ?").get(afterResult.stage_results[0].payload_id);
      assert.equal(payload.payload_id, afterResult.stage_results[0].payload_id);
      assert.match(payload.content_hash, /^[a-f0-9]{64}$/);
    } finally {
      database.close();
    }

    const replay = runCli([
      "run", "record-stage-result", "--run", "run-0001",
      "--packet", packet.stage_packet_id, "--file", fixturePath
    ], { cwd: repo });
    assertSuccess(replay, "identical result fixture replay is idempotent");
    assert.match(replay.stdout, /recorded: false/);
    assert.equal(readRun(repo).stage_results.length, 1);

    const conflicting = validResultFixture(packet, {
      stage_result_id: afterResult.stage_results[0].stage_result_id,
      summary: "conflicting replay"
    });
    writeText(fixturePath, `${JSON.stringify(conflicting, null, 2)}\n`);
    const conflict = runCli([
      "run", "record-stage-result", "--run", "run-0001",
      "--packet", packet.stage_packet_id, "--file", fixturePath
    ], { cwd: repo });
    assertFailure(conflict, "conflicting result replay fails closed");
    assert.match(conflict.stderr, /STAGE_RESULT_CONFLICT/);

    const operator = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
    assertSuccess(operator, "stage result projects into operator status");
    assert.match(operator.stdout, /current_stage: TASK_PROMPT_PACKET/);
    assert.match(operator.stdout, /next_procedure_id: task-prompt-writer/);
    assert.match(operator.stdout, /human_action_required: false/);
    const nextPacket = runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo });
    assertSuccess(nextPacket, "operator progression prepares the next distinct packet");
    assert.match(nextPacket.stdout, /procedure: task-prompt-writer/);
    const nextPacketRecord = readRun(repo).stage_packets.find((candidate) => candidate.current);
    writeText(fixturePath, `${JSON.stringify(validResultFixture(nextPacketRecord, {
      summary: "Fixture completed the bounded task-prompt stage."
    }), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", nextPacketRecord.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "record next distinct stage result"
    );
    assert.equal(readRun(repo).stage_results.filter((candidate) => candidate.current).length, 2, "unrelated stage results remain independently current");
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 resolves every packet kind from typed operator stage state", () => {
  assert.deepEqual(stageOperator.resolveStagePacketIntent("TASK_INTAKE_REQUIRED", "task-intake"), { kind: "plan", procedureId: "task-intake" });
  assert.deepEqual(stageOperator.resolveStagePacketIntent("IMPLEMENTATION_READY"), { kind: "implementation", procedureId: "implementation" });
  assert.deepEqual(stageOperator.resolveStagePacketIntent("IMPLEMENTATION_REVIEW_REQUIRED", "implementation-review"), { kind: "review", procedureId: "implementation-review" });
  assert.deepEqual(stageOperator.resolveStagePacketIntent("PLAN_AMEND_REQUIRED", "plan-amend"), { kind: "fix-pass", procedureId: "plan-amend" });
  assert.deepEqual(stageOperator.resolveStagePacketIntent("FIX_PASS_REVIEW_REQUIRED", "fix-pass-review"), { kind: "fix-pass", procedureId: "fix-pass-review" });
  assert.deepEqual(stageOperator.resolveStagePacketIntent("CLOSEOUT_REVIEW_REQUIRED", "phase-closeout-review"), { kind: "closeout", procedureId: "phase-closeout-review" });
  assert.equal(stageOperator.resolveStageResultTransition({ procedure_id: "implementation-review" }, "FIX_REQUIRED").next, "FIX_PASS_PACKET");
  assert.equal(stageOperator.resolveStageResultTransition({ procedure_id: "implementation-review" }, "PASS").next, "VERIFICATION_REVIEW_PACKET");
  assert.equal(stageOperator.resolveStageResultTransition({ procedure_id: "verification-review" }, "PASS").next, "DELIVERY_FACTS_REVIEW_PACKET");
  assert.equal(stageOperator.resolveStageResultTransition({ procedure_id: "delivery-facts-review" }, "PASS").next, "PHASE_CLOSEOUT_REVIEW_PACKET");
  assert.equal(stageOperator.resolveStageResultTransition({ procedure_id: "phase-closeout-review" }, "PASS").next, "CLOSEOUT_PACKET");
  assert.equal(
    stageOperator.resolveStageResultTransition({
      procedure_id: "fix-pass-review",
      return_procedure_id: "architecture-review"
    }, "PASS").next,
    "ARCHITECTURE_REVIEW_PACKET"
  );
  assert.equal(
    stageOperator.resolveStageResultTransition({
      procedure_id: "fix-pass-review",
      return_procedure_id: "db-storage-review"
    }, "PASS").next,
    "DB_STORAGE_REVIEW_PACKET"
  );
  assert.throws(
    () => stageOperator.resolveStageResultTransition({ procedure_id: "plan-review" }, "FIX_REQUIRED"),
    /INVALID_STAGE_RESULT_TRANSITION/
  );
  assert.throws(
    () => stageOperator.resolveStageResultTransition({ procedure_id: "implementation-review" }, "AMEND_REQUIRED"),
    /INVALID_STAGE_RESULT_TRANSITION/
  );
});

test("Phase 23.8.7 accepts reviewed Effective Validation command tables without weakening plan identity", () => {
  const markdown = [
    "## Effective Validation",
    "",
    "| Invariant | Required evidence |",
    "| --- | --- |",
    "| Storage | `run.json` remains projection |",
    "| Contract acceptance | `npm run build`; exactly one `npm test`; `git diff --check` |",
    "",
    "## Residual Risks"
  ].join("\n");
  assert.deepEqual(runtime.extractEffectiveValidationCommands(markdown), ["npm run build", "npm test", "git diff --check"]);
});

test("Phase 23.8.7 fails closed on missing route context and malformed or executable fixtures", () => {
  const missing = createFixtureRepo();
  try {
    seedRun(missing.repo, false);
    const blocked = runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: missing.repo });
    assertFailure(blocked, "missing route context blocks packet");
    assert.match(blocked.stdout, /stop reason: missing_route_context_evidence/);
    const blockedRun = readRun(missing.repo);
    assert.equal(blockedRun.run_issues.at(-1).issue_type, "missing_route_context_evidence");
    assert.equal(blockedRun.repair_packets.at(-1).stopping_condition.length > 0, true);
  } finally {
    removeDirectory(missing.parent);
  }

  const malformed = createFixtureRepo();
  try {
    seedRun(malformed.repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: malformed.repo }), "prepare packet for malformed fixtures");
    const packet = readRun(malformed.repo).stage_packets.at(-1);
    const fixturePath = path.join(malformed.repo, "result-fixture.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, { validation_results: [] }), null, 2)}\n`);
    const missingChecks = runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: malformed.repo });
    assertFailure(missingChecks, "missing deterministic checks");
    assert.match(missingChecks.stderr, /MISSING_DETERMINISTIC_CHECKS/);
    assert.equal(readRun(malformed.repo).stage_states.at(-1).stop_reason, "missing_deterministic_checks");

    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      actual_invocation_facts: { supplied_fixture: true, provider: "forbidden" }
    }), null, 2)}\n`);
    const executable = runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: malformed.repo });
    assertFailure(executable, "provider selection is forbidden");
    assert.match(executable.stderr, /RUNNER_LAUNCH_FORBIDDEN/);
  } finally {
    removeDirectory(malformed.parent);
  }
});

test("Phase 23.8.7 rejects cross-instance, conflicting, duplicate, and stale Phase F authority", () => {
  const { parent, repo } = createFixtureRepo();
  const scenarios = [
    {
      name: "cross-instance",
      mutate(run) {
        run.review_routing_records[0].payload.run_instance_id = "other-instance";
      }
    },
    {
      name: "conflicting-policy",
      mutate(run) {
        run.review_routing_records[1].payload.policy_version = "conflicting-policy";
      }
    },
    {
      name: "changed-surface-mismatch",
      mutate(run) {
        run.review_routing_records[1].payload.changed_surface_classes = ["runtime"];
      }
    },
    {
      name: "semantic-review-mismatch",
      mutate(run) {
        run.review_routing_records[1].payload.required_semantic_reviews = ["architecture-review"];
      }
    },
    {
      name: "policy-derived-review-mismatch",
      mutate(run) {
        run.review_routing_records[0].payload.required_semantic_reviews = ["architecture-review"];
        run.review_routing_records[1].payload.required_semantic_reviews = ["architecture-review"];
      }
    },
    {
      name: "route-class-mismatch",
      mutate(run) {
        run.review_routing_records[1].payload.route_class = "critical_independent";
      }
    },
    {
      name: "binding-profile-mismatch",
      mutate(run) {
        run.review_routing_records[1].payload.binding_profile_id = "accepted-critical-independent";
      }
    },
    {
      name: "context-transport-mismatch",
      mutate(run) {
        run.review_routing_records[0].payload.context_mode = "fresh_packet";
        run.review_routing_records[1].payload.context_mode = "fresh_packet";
      }
    },
    {
      name: "missing-usage-ref",
      mutate(run) {
        delete run.review_routing_records[0].payload.usage_ref;
        delete run.review_routing_records[1].payload.usage_ref;
      }
    },
    {
      name: "dangling-usage-ref",
      mutate(run) {
        run.review_routing_records[0].payload.usage_ref = "payload-does-not-exist";
        run.review_routing_records[1].payload.usage_ref = "payload-does-not-exist";
      }
    },
    {
      name: "deterministic-evidence-incomplete",
      mutate(run) {
        run.review_routing_records[0].payload.deterministic_evidence_state = "incomplete";
        run.review_routing_records[1].payload.deterministic_evidence_state = "incomplete";
      }
    },
    {
      name: "parallel-policy-invalid",
      mutate(run) {
        run.review_routing_records[0].payload.parallel_policy = "parallel";
        run.review_routing_records[1].payload.parallel_policy = "parallel";
      }
    },
    {
      name: "budget-class-invalid",
      mutate(run) {
        run.review_routing_records[0].payload.budget_class = "economy";
        run.review_routing_records[1].payload.budget_class = "economy";
      }
    },
    {
      name: "escalation-policy-mismatch",
      mutate(run) {
        run.review_routing_records[0].payload.escalation_triggers = [];
        run.review_routing_records[1].payload.escalation_triggers = [];
      }
    },
    {
      name: "duplicate-replay",
      mutate(run) {
        run.review_routing_records.push({
          ...structuredClone(run.review_routing_records[1]),
          record_id: `duplicate-${run.run_id}`
        });
      }
    },
    {
      name: "stale-latest-invocation",
      mutate(run) {
        run.review_routing_records.push({
          record_kind: "review_invocation",
          record_id: `latest-failed-${run.run_id}`,
          created_at: "2026-07-27T00:00:03.000Z",
          status: "failed",
          summary: "Latest route attempt failed.",
          payload: { ...run.review_routing_records[0].payload, route_decision_id: `failed-${run.run_id}` }
        });
      }
    }
  ];
  try {
    scenarios.forEach((scenario, index) => {
      const runId = `run-join-${index + 1}`;
      seedRun(repo, true, runId);
      const staging = new stagingModule.RunStagingDatabase(repo, repo, runId);
      staging.mutateRun(runId, (run) => {
        const next = structuredClone(run);
        scenario.mutate(next);
        return next;
      });
      stagingModule.writeCompatibilityRunArtifacts(repo, staging.loadRun(runId));
      const result = runCli(["run", "prepare-packet", "--run", runId, "--kind", "auto"], { cwd: repo });
      assertFailure(result, `${scenario.name} must fail closed`);
      assert.match(`${result.stdout}\n${result.stderr}`, /missing_route_context_evidence/, `${scenario.name}: ${result.stderr}`);
      const issue = readRun(repo, runId).run_issues.at(-1);
      assert.ok(issue, `${scenario.name} did not persist a RunIssue: ${result.stderr}`);
      assert.equal(issue.issue_type, "missing_route_context_evidence");
    });
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 treats policy capability and waiver records as non-authorizing", () => {
  const waiverRepo = createFixtureRepo();
  try {
    seedRun(waiverRepo.repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: waiverRepo.repo }), "prepare waiver packet");
    const packet = readRun(waiverRepo.repo).stage_packets.at(-1);
    const staging = new stagingModule.RunStagingDatabase(waiverRepo.repo, waiverRepo.repo, "run-0001");
    staging.mutateRun("run-0001", (run) => ({
      ...run,
      stage_states: (run.stage_states ?? []).map((state) => state.current ? { ...state, run_revision: run.run_revision } : state),
      stage_packets: (run.stage_packets ?? []).map((candidate) => candidate.current ? { ...candidate, run_revision: run.run_revision } : candidate),
      waiver_records: [{
        waiver_id: "waiver-self-approval",
        phase_id: "23.8.7",
        run_id: run.run_id,
        stage_packet_id: packet.stage_packet_id,
        control_id: "self_approval",
        failed_check: "self_approval",
        granted_by: "owner",
        approver: "owner",
        reason: "Recorded exception cannot bypass lifecycle authority.",
        scope: "fixture-only",
        evidence_refs: ["waiver:evidence"],
        current: true,
        created_at: "2026-07-27T00:00:04.000Z"
      }]
    }));
    stagingModule.writeCompatibilityRunArtifacts(waiverRepo.repo, staging.loadRun("run-0001"));
    const fixturePath = path.join(waiverRepo.repo, "waiver-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      anomaly_codes: ["self_approval"],
      waiver_refs: ["waiver-self-approval"]
    }), null, 2)}\n`);
    const unboundWaiver = runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: waiverRepo.repo });
    assertFailure(unboundWaiver, "waiver must bind to an actual failed validation check");
    assert.match(unboundWaiver.stderr, /WAIVER_INVALID: waiver-self-approval is not bound to an actual failed validation check/);
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      anomaly_codes: ["self_approval"],
      waiver_refs: ["waiver-self-approval"],
      validation_results: [
        { check_id: "deterministic-check", status: "pass", summary: "passed", evidence_refs: ["fixture:evidence"] },
        { check_id: "self_approval", status: "fail", summary: "self approval attempted", evidence_refs: ["waiver:evidence"] }
      ]
    }), null, 2)}\n`);
    const result = runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: waiverRepo.repo });
    assertFailure(result, "valid waiver cannot authorize self approval");
    const issue = readRun(waiverRepo.repo).run_issues.at(-1);
    assert.ok(issue, `waiver non-bypass did not persist a RunIssue: ${result.stderr}`);
    assert.equal(issue.issue_type, "failed_verification");
  } finally {
    removeDirectory(waiverRepo.parent);
  }

  const malformedPolicyRepo = createFixtureRepo();
  try {
    seedRun(malformedPolicyRepo.repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: malformedPolicyRepo.repo }), "prepare malformed-policy packet");
    const stored = readRun(malformedPolicyRepo.repo);
    stored.execution_policies[0].provider_selection_allowed = true;
    const database = sqliteModule.openSqliteDatabase(path.join(malformedPolicyRepo.repo, ".harness", "runs", "run-0001", "staging.sqlite"));
    try {
      database.prepare("UPDATE runs SET run_json = ? WHERE run_id = ?").run(JSON.stringify(stored), "run-0001");
    } finally {
      database.close();
    }
    writeText(path.join(malformedPolicyRepo.repo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(stored, null, 2)}\n`);
    const result = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: malformedPolicyRepo.repo });
    assertFailure(result, "malformed execution policy fails closed");
    assert.match(result.stderr, /execution_policies must preserve the exact hookless fixture-ingestion permission contract/);

    stored.execution_policies[0].provider_selection_allowed = false;
    stored.execution_policies[0].network_policy = "allowed";
    const permissionDatabase = sqliteModule.openSqliteDatabase(path.join(malformedPolicyRepo.repo, ".harness", "runs", "run-0001", "staging.sqlite"));
    try {
      permissionDatabase.prepare("UPDATE runs SET run_json = ? WHERE run_id = ?").run(JSON.stringify(stored), "run-0001");
    } finally {
      permissionDatabase.close();
    }
    writeText(path.join(malformedPolicyRepo.repo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(stored, null, 2)}\n`);
    const permission = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: malformedPolicyRepo.repo });
    assertFailure(permission, "semantic execution-policy permission tampering fails closed");
    assert.match(permission.stderr, /execution_policies must preserve the exact hookless fixture-ingestion permission contract/);

    stored.execution_policies[0].network_policy = "forbidden";
    stored.runner_profiles[0].can_launch = true;
    stored.runner_profiles[0].write_capability = "source";
    const capabilityDatabase = sqliteModule.openSqliteDatabase(path.join(malformedPolicyRepo.repo, ".harness", "runs", "run-0001", "staging.sqlite"));
    try {
      capabilityDatabase.prepare("UPDATE runs SET run_json = ? WHERE run_id = ?").run(JSON.stringify(stored), "run-0001");
    } finally {
      capabilityDatabase.close();
    }
    writeText(path.join(malformedPolicyRepo.repo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(stored, null, 2)}\n`);
    const capability = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: malformedPolicyRepo.repo });
    assertFailure(capability, "runner capability cannot grant launch or write permission");
    assert.match(capability.stderr, /runner_profiles must preserve the exact hookless supplied-fixture contract/);
  } finally {
    removeDirectory(malformedPolicyRepo.parent);
  }
});

test("Phase 23.8.7 rejects a result bound to a different existing runner profile than its packet", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(
      runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }),
      "prepare profile-binding packet"
    );
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "profile-binding-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "record profile-binding result"
    );
    const accepted = readRun(repo);
    const forbiddenInvocation = structuredClone(accepted);
    forbiddenInvocation.stage_results[0].actual_invocation_facts.provider = "forbidden";
    forbiddenInvocation.stage_results[0].runner_metadata.provider = "forbidden";
    assert.throws(
      () => runtime.validateRuntimeRun(forbiddenInvocation),
      /stage_results must be valid supplied-fixture records/
    );
    const invalidWaiver = structuredClone(accepted);
    invalidWaiver.waiver_records = [{
      waiver_id: "waiver-unbound-readback",
      phase_id: "23.8.7",
      run_id: invalidWaiver.run_id,
      stage_packet_id: invalidWaiver.stage_packets[0].stage_packet_id,
      control_id: "unbound-check",
      failed_check: "unbound-check",
      granted_by: "owner",
      approver: "owner",
      reason: "Tamper fixture.",
      scope: "fixture-only",
      evidence_refs: [],
      current: true,
      created_at: "2026-07-27T00:00:05.000Z"
    }];
    invalidWaiver.stage_results[0].waiver_refs = ["waiver-unbound-readback"];
    assert.throws(
      () => runtime.validateRuntimeRun(invalidWaiver),
      /stage_results has invalid packet, route, profile, policy, revision, or bounded-log semantics/
    );
    const stored = structuredClone(accepted);
    stored.runner_profiles.push({
      ...stored.runner_profiles[0],
      runner_profile_id: "runner-profile-other",
      runner_id: "runner-profile-other"
    });
    stored.stage_results[0].runner_profile_id = "runner-profile-other";
    stored.stage_results[0].runner_id = "runner-profile-other";
    assert.throws(
      () => runtime.validateRuntimeRun(stored),
      /runner_profiles must preserve the exact hookless supplied-fixture contract|stage_results has invalid packet, route, profile, policy, revision, or bounded-log semantics/
    );
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 rejects stale current packet and stage-state revisions after an intervening run mutation", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(
      runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }),
      "prepare packet before intervening mutation"
    );
    const beforeMutation = readRun(repo);
    const packet = beforeMutation.stage_packets.find((candidate) => candidate.current);
    const staging = new stagingModule.RunStagingDatabase(repo, repo, "run-0001");
    const mutated = staging.mutateRun("run-0001", (run) => ({
      ...run,
      updated_at: "2026-07-27T00:00:05.000Z"
    }), {
      expectedRunPresence: "present",
      expectedRunInstanceId: beforeMutation.run_instance_id,
      expectedRunRevision: beforeMutation.run_revision
    });
    stagingModule.writeCompatibilityRunArtifacts(repo, mutated);
    const fixturePath = path.join(repo, "stale-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
    const stale = runCli([
      "run", "record-stage-result", "--run", "run-0001",
      "--packet", packet.stage_packet_id, "--file", fixturePath
    ], { cwd: repo });
    assertFailure(stale, "intervening mutation makes current packet and state revisions stale");
    assert.match(stale.stderr, /stage_states has invalid or stale revision semantics|stage_packets has invalid identity, revision, or bounded-log semantics|STAGE_PACKET_STALE_REVISION/);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 semantic readback rejects forged aliases, transitions, and hookless literals", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(
      runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }),
      "prepare semantic-readback packet"
    );
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "semantic-readback-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "record semantic-readback result"
    );
    const base = readRun(repo);
    const packetTampering = [
      ["route_decision_ref", "forged-route"],
      ["usage_facts_ref", "forged-usage"],
      ["execution_policy_ref", "forged-policy"],
      ["context_core_ref", "forged-core"],
      ["delta_overlay_ref", "forged-delta"],
      ["context_manifest_ref", "forged-manifest"],
      ["context_transport_ref", "forged-transport"]
    ];
    for (const [field, value] of packetTampering) {
      const forged = structuredClone(base);
      forged.stage_packets[0][field] = value;
      assert.throws(() => runtime.validateRuntimeRun(forged), /stage_packets has invalid identity, revision, or bounded-log semantics/);
    }
    const resultTampering = [
      ["route_decision_ref", "forged-route"],
      ["route_decision_id", "forged-route-id"],
      ["usage_facts_ref", "forged-usage"],
      ["usage_ref", "forged-usage-ref"],
      ["commands_run", ["forged-command"]],
      ["declared_blockers", ["forged-blocker"]],
      ["payload_refs", []],
      ["progress_log_ref", "forged-progress"]
    ];
    for (const [field, value] of resultTampering) {
      const forged = structuredClone(base);
      forged.stage_results[0][field] = value;
      assert.throws(() => runtime.validateRuntimeRun(forged), /stage_results has invalid packet, route, profile, policy, revision, or bounded-log semantics/);
    }
    const forgedTransition = structuredClone(base);
    forgedTransition.stage_states.find((state) => state.current).current_stage = "CLOSEOUT_PACKET";
    forgedTransition.stage_states.find((state) => state.current).next_allowed_action = "CLOSEOUT_PACKET";
    forgedTransition.stage_states.find((state) => state.current).allowed_next_stages = ["CLOSEOUT_PACKET"];
    assert.throws(() => runtime.validateRuntimeRun(forgedTransition), /current StageState does not match its recorded result transition/);
    const forgedReturnProcedure = structuredClone(base);
    forgedReturnProcedure.stage_packets[0].return_procedure_id = "architecture-review";
    assert.throws(() => runtime.validateRuntimeRun(forgedReturnProcedure), /stage_packets has invalid identity, revision, or bounded-log semantics/);
    const invalidStatus = structuredClone(base);
    invalidStatus.stage_states.find((state) => state.current).status = "unknown";
    assert.throws(() => runtime.validateRuntimeRun(invalidStatus), /stage_states has an invalid status/);
    const noCurrentState = structuredClone(base);
    noCurrentState.stage_states.forEach((state) => { state.current = false; });
    assert.throws(() => runtime.validateRuntimeRun(noCurrentState), /stage_states must have at most one current operator state, or be fully consumed/);
    for (const field of [
      "allowed_next_stages", "missing_inputs", "missing_evidence", "blockers", "validation_refs", "bounded_progress_log"
    ]) {
      const invalidTypedArray = structuredClone(base);
      invalidTypedArray.stage_states.find((state) => state.current)[field] = [42];
      assert.throws(() => runtime.validateRuntimeRun(invalidTypedArray), /stage_states has non-string typed-array entries/);
    }
    const invalidPacketArray = structuredClone(base);
    invalidPacketArray.stage_packets[0].payload_refs = [42];
    assert.throws(() => runtime.validateRuntimeRun(invalidPacketArray), /stage_packets has non-string typed-array entries/);
    const invalidResultArray = structuredClone(base);
    invalidResultArray.stage_results[0].files_changed = [42];
    assert.throws(() => runtime.validateRuntimeRun(invalidResultArray), /stage_results has non-string typed-array entries/);
    const invalidWaiverArray = structuredClone(base);
    invalidWaiverArray.waiver_records = [{
      waiver_id: "waiver-invalid-array",
      phase_id: "23.8.7",
      run_id: invalidWaiverArray.run_id,
      stage_packet_id: invalidWaiverArray.stage_packets[0].stage_packet_id,
      control_id: "deterministic-check",
      failed_check: "deterministic-check",
      granted_by: "owner",
      approver: "owner",
      reason: "Tamper fixture.",
      scope: "fixture-only",
      evidence_refs: [42],
      current: true,
      created_at: "2026-07-27T00:00:05.000Z"
    }];
    assert.throws(() => runtime.validateRuntimeRun(invalidWaiverArray), /waiver_records has invalid typed-array or expiry semantics/);
    const invalidWaiverExpiry = structuredClone(invalidWaiverArray);
    invalidWaiverExpiry.waiver_records[0].evidence_refs = ["waiver:evidence"];
    invalidWaiverExpiry.waiver_records[0].expires_at = "not-a-date";
    assert.throws(() => runtime.validateRuntimeRun(invalidWaiverExpiry), /waiver_records has invalid typed-array or expiry semantics/);

    const forgedPolicy = structuredClone(base);
    forgedPolicy.execution_policies[0].allowed_paths = ["src/**"];
    forgedPolicy.execution_policies[0].max_result_bytes = 1;
    assert.throws(() => runtime.validateRuntimeRun(forgedPolicy), /exact hookless fixture-ingestion permission contract/);
    const forgedProfile = structuredClone(base);
    forgedProfile.runner_profiles[0].structured_output_support = false;
    forgedProfile.runner_profiles[0].accepts_result_fixture = false;
    assert.throws(() => runtime.validateRuntimeRun(forgedProfile), /exact hookless supplied-fixture contract/);
    const invalidOutcome = structuredClone(base);
    invalidOutcome.stage_results[0].outcome = "ACCEPT";
    assert.throws(() => runtime.validateRuntimeRun(invalidOutcome), /stage_results must be valid supplied-fixture records/);
    const invalidCheckStatus = structuredClone(base);
    invalidCheckStatus.stage_results[0].validation_results[0].status = "unknown";
    assert.throws(() => runtime.validateRuntimeRun(invalidCheckStatus), /stage_results must be valid supplied-fixture records/);
    const emptyChecks = structuredClone(base);
    emptyChecks.stage_results[0].validation_results = [];
    assert.throws(() => runtime.validateRuntimeRun(emptyChecks), /stage_results must be valid supplied-fixture records/);
    const forgedBudget = structuredClone(base);
    forgedBudget.stage_packets[0].budget.max_result_bytes = 1;
    forgedBudget.stage_packets[0].budget.max_log_entries = 41;
    assert.throws(
      () => runtime.validateRuntimeRun(forgedBudget),
      /stage_packets has invalid runner-profile or execution-policy capability binding/
    );
    const nonCurrentTransitionResult = structuredClone(base);
    nonCurrentTransitionResult.stage_results[0].current = false;
    assert.throws(
      () => runtime.validateRuntimeRun(nonCurrentTransitionResult),
      /stage_results must have exactly one current result per procedure/
    );
    const duplicateCurrentTransitionResult = structuredClone(base);
    duplicateCurrentTransitionResult.stage_results.push({
      ...structuredClone(duplicateCurrentTransitionResult.stage_results[0]),
      stage_result_id: "stage-result-duplicate-current",
      result_id: "stage-result-duplicate-current"
    });
    assert.throws(
      () => runtime.validateRuntimeRun(duplicateCurrentTransitionResult),
      /stage_results must have exactly one current result per procedure/
    );
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 binds blocked operator state to its exact issue and repair transition", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare blocked-state packet");
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "blocked-state-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      blockers: ["Explicit blocker."]
    }), null, 2)}\n`);
    assertFailure(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "blocked result persists issue and repair"
    );
    const base = readRun(repo);
    assert.doesNotThrow(() => runtime.validateRuntimeRun(base));
    const blocked = base.stage_states.find((state) => state.current);
    assert.equal(blocked.status, "blocked");
    const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
    assertSuccess(status, "blocked operator status remains readable");
    assert.match(status.stdout, /human_action_required: true/);

    const falseHuman = structuredClone(base);
    falseHuman.stage_states.find((state) => state.current).human_action_required = false;
    assert.throws(() => runtime.validateRuntimeRun(falseHuman), /stage_states has invalid human-action or current-status semantics/);
    const currentSuperseded = structuredClone(base);
    currentSuperseded.stage_states.find((state) => state.current).status = "superseded";
    assert.throws(() => runtime.validateRuntimeRun(currentSuperseded), /stage_states has invalid human-action or current-status semantics/);
    const forgedAction = structuredClone(base);
    forgedAction.stage_states.find((state) => state.current).current_stage = "CLOSEOUT_PACKET";
    forgedAction.stage_states.find((state) => state.current).next_allowed_action = "CLOSEOUT_PACKET";
    forgedAction.stage_states.find((state) => state.current).allowed_next_stages = ["CLOSEOUT_PACKET"];
    assert.throws(() => runtime.validateRuntimeRun(forgedAction), /blocked StageState does not exactly match its RunIssue and RepairPacket transition/);
    const forgedBlocker = structuredClone(base);
    forgedBlocker.stage_states.find((state) => state.current).blockers = ["Forged blocker."];
    assert.throws(() => runtime.validateRuntimeRun(forgedBlocker), /blocked StageState does not exactly match its RunIssue and RepairPacket transition/);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 preserves an architecture-review return path through fix-pass", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare architecture return-path seed");
    const packet = seedCurrentPacketProcedure(repo, "architecture-review", "review");
    const fixturePath = path.join(repo, "architecture-fix-required.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      outcome: "FIX_REQUIRED",
      blockers: ["Architecture correction required."]
    }), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "architecture review failure routes to fix pass"
    );
    const fixPacketResult = runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo });
    assertSuccess(fixPacketResult, "prepare architecture fix-pass packet");
    const fixPacket = readRun(repo).stage_packets.find((candidate) => candidate.current);
    assert.equal(fixPacket.procedure_id, "fix-pass-review");
    assert.equal(fixPacket.return_procedure_id, "architecture-review");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(fixPacket), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", fixPacket.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "passing fix-pass returns to architecture review"
    );
    const operator = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
    assertSuccess(operator, "architecture return path projects through operator status");
    assert.match(operator.stdout, /current_stage: ARCHITECTURE_REVIEW_PACKET/);
    assert.match(operator.stdout, /next_procedure_id: architecture-review/);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 routes plan-review AMEND_REQUIRED to plan amendment without a fix-pass override", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare plan-review seed");
    const packet = seedCurrentPacketProcedure(repo, "plan-review", "review");
    const fixturePath = path.join(repo, "plan-amend-required.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      outcome: "AMEND_REQUIRED",
      blockers: ["Plan amendment required."]
    }), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "plan-review amendment result"
    );
    const recorded = readRun(repo);
    assert.equal(recorded.run_issues.length, 0);
    assert.equal(recorded.stage_states.find((state) => state.current).next_allowed_action, "PLAN_AMEND_PACKET");
    const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
    assertSuccess(status, "plan amendment operator status");
    assert.match(status.stdout, /current_stage: PLAN_AMEND_PACKET/);
    assert.match(status.stdout, /next_procedure_id: plan-amend/);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 consumes the passing plan-review StageState when human approval is recorded", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare plan approval seed");
    const packet = seedCurrentPacketProcedure(repo, "plan-review", "review");
    const fixturePath = path.join(repo, "plan-review-pass.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "passing plan review"
    );
    const awaitingApproval = readRun(repo);
    assert.equal(awaitingApproval.stage_states.find((state) => state.current).next_allowed_action, "PLAN_APPROVAL_REQUIRED");
    const approved = runtime.consumePlanApprovalStage(awaitingApproval, "human-plan-approval-1");
    assert.equal(approved.stage_states.some((state) => state.current), false);
    assert.equal(approved.stage_states.at(-1).status, "superseded");
    assert.equal(approved.stage_states.at(-1).superseded_by, "human-plan-approval-1");
    assert.doesNotThrow(() => runtime.validateRuntimeRun(approved));
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 rejects coherent procedure, kind, and stage rewriting without packet-ID rederivation", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare packet identity seed");
    const forged = readRun(repo);
    const packet = forged.stage_packets.find((candidate) => candidate.current);
    packet.packet_kind = "review";
    packet.procedure_id = "architecture-review";
    packet.return_procedure_id = "architecture-review";
    packet.stage_id = "architecture-review";
    assert.throws(
      () => runtime.validateRuntimeRun(forged),
      /stage_packets has invalid identity, revision, or bounded-log semantics/
    );
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 rejects coherent packet tampering against retained Phase F authority", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare authority packet");
    const base = readRun(repo);
    const tampering = [
      (packet) => { packet.route_decision_id = "forged-route"; packet.route_decision_ref = "forged-route"; },
      (packet) => { packet.routing_policy_version = "forged-policy"; packet.route_policy_ref = "forged-policy"; },
      (packet) => {
        packet.binding_version = "forged-binding";
        packet.binding_profile_id = "forged-profile";
        packet.provider_binding_ref = "forged-binding:forged-profile";
        packet.profile_floor = "forged-profile";
      },
      (packet) => {
        packet.context_core_id = "forged-core";
        packet.context_core_ref = "forged-core";
        packet.context_manifest_id = "forged-manifest";
        packet.context_manifest_ref = "forged-manifest";
        packet.delta_overlay_id = "forged-delta";
        packet.delta_overlay_ref = "forged-delta";
      },
      (packet) => {
        packet.context_mode = "forged-mode";
        packet.context_transport_mode = "forged-mode";
        packet.context_transport_ref = "forged-mode";
      },
      (packet) => { packet.usage_ref = "forged-usage"; packet.usage_facts_ref = "forged-usage"; },
      (packet) => { packet.reasoning_default = "medium"; packet.default_reasoning_effort = "medium"; },
      (packet) => { packet.reasoning_ceiling = "medium"; packet.reasoning_effort_ceiling = "medium"; },
      (packet) => {
        packet.independence_mode = "same_role";
        packet.independence_requirement = "separate_review_required";
      },
      (packet) => { packet.changed_surfaces = ["forged"]; packet.changed_surface_classes = ["forged"]; },
      (packet) => { packet.risk_classes = ["forged"]; },
      (packet) => { packet.required_semantic_reviews = ["forged-review"]; },
      (packet) => { packet.budget_class = "forged-budget"; },
      (packet) => { packet.escalation_triggers = ["forged-trigger"]; }
    ];
    for (const mutate of tampering) {
      const forged = structuredClone(base);
      mutate(forged.stage_packets[0]);
      assert.throws(
        () => runtime.validateRuntimeRun(forged),
        /stage_packets (?:has invalid identity, revision, or bounded-log semantics|does not exactly match its authoritative Phase F invocation and replay records)/
      );
    }
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 rejects an unlabeled PASS result that declares blockers", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare blocker-as-accept packet");
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "blocker-as-accept-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      blockers: ["Human approval is still missing."],
      anomaly_codes: []
    }), null, 2)}\n`);
    const result = runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo });
    assertFailure(result, "unlabeled PASS with blockers must stop");
    assert.equal(readRun(repo).run_issues.at(-1).issue_type, "invalid_stage_result");
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 does not treat self-declared anomaly labels as lifecycle authority", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare mixed-anomaly packet");
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "mixed-anomaly-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      anomaly_codes: ["hooks_absent", "scope_creep"]
    }), null, 2)}\n`);
    const result = runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo });
    assertSuccess(result, "self-declared anomaly labels remain non-authoritative observations");
    assert.equal(readRun(repo).run_issues.length, 0);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 detects tampering in the exact persisted stage-result payload identity", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare payload-tamper packet");
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "payload-tamper-result.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "record payload-tamper result"
    );
    const result = readRun(repo).stage_results[0];
    const database = sqliteModule.openSqliteDatabase(path.join(repo, ".harness", "runs", "run-0001", "staging.sqlite"));
    try {
      database.prepare("UPDATE payload_index SET source_run_id = ? WHERE payload_id = ?").run("other-run", result.payload_id);
    } finally {
      database.close();
    }
    const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
    assertFailure(status, "operator readback must reject a tampered stage-result payload identity");
    assert.match(status.stderr, /Stage result payload identity does not exactly match its result record/);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 rejects coherent content-address and stored-size payload rewrites", () => {
  for (const scenario of ["stored-size", "coherent-content"]) {
    const { parent, repo } = createFixtureRepo();
    try {
      seedRun(repo);
      assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), `prepare ${scenario} packet`);
      const packet = readRun(repo).stage_packets.at(-1);
      const fixturePath = path.join(repo, `${scenario}-result.json`);
      writeText(fixturePath, `${JSON.stringify(validResultFixture(packet), null, 2)}\n`);
      assertSuccess(
        runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
        `record ${scenario} result`
      );
      const result = readRun(repo).stage_results[0];
      const database = sqliteModule.openSqliteDatabase(path.join(repo, ".harness", "runs", "run-0001", "staging.sqlite"));
      try {
        if (scenario === "stored-size") {
          database.prepare("UPDATE payload_index SET stored_size_bytes = stored_size_bytes + 1 WHERE payload_id = ?").run(result.payload_id);
        } else {
          const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
          fixture.summary = "Coherently rewritten payload content.";
          const raw = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`, "utf8");
          const contentHash = createHash("sha256").update(raw).digest("hex");
          database.prepare(
            "UPDATE payload_index SET raw_size_bytes = ?, stored_size_bytes = ?, content_hash = ? WHERE payload_id = ?"
          ).run(raw.byteLength, raw.byteLength, contentHash, result.payload_id);
          database.prepare("DELETE FROM payload_chunks WHERE payload_id = ?").run(result.payload_id);
          database.prepare("INSERT INTO payload_chunks (payload_id, chunk_order, chunk_bytes) VALUES (?, 0, ?)").run(result.payload_id, raw);
        }
      } finally {
        database.close();
      }
      const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
      assertFailure(status, `${scenario} payload rewrite must fail closed`);
      assert.match(status.stderr, /Stage result payload content does not match its immutable index/);
    } finally {
      removeDirectory(parent);
    }
  }
});

test("Phase 23.8.7 binds an optional supplied stage-result ID through payload readback", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    seedRun(repo);
    assertSuccess(runCli(["run", "prepare-packet", "--run", "run-0001", "--kind", "auto"], { cwd: repo }), "prepare explicit-result-ID packet");
    const packet = readRun(repo).stage_packets.at(-1);
    const fixturePath = path.join(repo, "explicit-result-id.json");
    writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
      stage_result_id: "stage-result-explicit"
    }), null, 2)}\n`);
    assertSuccess(
      runCli(["run", "record-stage-result", "--run", "run-0001", "--packet", packet.stage_packet_id, "--file", fixturePath], { cwd: repo }),
      "record explicit result ID"
    );
    const storedRun = readRun(repo);
    const result = storedRun.stage_results[0];
    const forgedFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    forgedFixture.stage_result_id = "stage-result-forged";
    const raw = Buffer.from(`${JSON.stringify(forgedFixture, null, 2)}\n`, "utf8");
    const contentHash = createHash("sha256").update(raw).digest("hex");
    const newPayloadId = `payload-${createHash("sha256")
      .update(`${result.stage_result_id}:stage_result_fixture:${contentHash}`)
      .digest("hex")
      .slice(0, 24)}`;
    const database = sqliteModule.openSqliteDatabase(path.join(repo, ".harness", "runs", "run-0001", "staging.sqlite"));
    try {
      const oldIndex = database.prepare("SELECT * FROM payload_index WHERE payload_id = ?").get(result.payload_id);
      database.prepare([
        "INSERT INTO payload_index",
        "(payload_id, parent_record_id, source_run_id, source_phase_id, source_step_id, kind, media_type, summary,",
        "searchable_text, bounded_excerpt, redaction_status, retention_class, compression_status, chunk_count,",
        "raw_size_bytes, stored_size_bytes, content_hash, created_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")).run(
        newPayloadId,
        oldIndex.parent_record_id,
        oldIndex.source_run_id,
        oldIndex.source_phase_id,
        oldIndex.source_step_id,
        oldIndex.kind,
        oldIndex.media_type,
        oldIndex.summary,
        oldIndex.searchable_text,
        oldIndex.bounded_excerpt,
        oldIndex.redaction_status,
        oldIndex.retention_class,
        "identity",
        1,
        raw.byteLength,
        raw.byteLength,
        contentHash,
        oldIndex.created_at
      );
      database.prepare("INSERT INTO payload_chunks (payload_id, chunk_order, chunk_bytes) VALUES (?, 0, ?)").run(newPayloadId, raw);
      database.prepare(
        "INSERT INTO payload_links (payload_id, parent_record_id, link_role, created_at) VALUES (?, ?, ?, ?)"
      ).run(newPayloadId, result.stage_result_id, "stage_result_fixture", oldIndex.created_at);
      storedRun.stage_results[0].payload_id = newPayloadId;
      storedRun.stage_results[0].payload_refs = [newPayloadId];
      database.prepare("UPDATE runs SET run_json = ? WHERE run_id = ?").run(JSON.stringify(storedRun), "run-0001");
    } finally {
      database.close();
    }
    writeText(path.join(repo, ".harness", "runs", "run-0001", "run.json"), `${JSON.stringify(storedRun, null, 2)}\n`);
    const status = runCli(["run", "status", "--operator", "--run", "run-0001"], { cwd: repo });
    assertFailure(status, "payload-supplied result ID must match the durable result ID");
    assert.match(status.stderr, /Stage result payload semantics do not exactly match its result record/);
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 anomaly fixture inventory covers all required typed stops", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-7/anomaly-cases.json"), "utf8"));
  assert.deepEqual(
    fixture.cases.map((entry) => entry.code).sort(),
    [
      "amend_without_fresh_review",
      "blocker_note_treated_as_accept",
      "delivery_import_as_accepted_review",
      "draft_pr_as_closeout_ready",
      "evidence_masquerades_as_review",
      "failed_verification",
      "fake_closeout_evidence",
      "hooks_absent",
      "hooks_disabled",
      "missing_implementation_review",
      "missing_merge_facts_as_closeout_ready",
      "review_hang",
      "scope_creep",
      "self_approval",
      "skipped_architecture_review",
      "skipped_db_storage_review",
      "source_change_before_approval",
      "superseded_delivery_facts_as_current",
      "verification_evidence_as_accepted_review"
    ]
  );
  assert.ok(fixture.cases.every((entry) =>
    (typeof entry.issue_type === "string" && entry.issue_type.length > 0) || entry.blocking === false
  ));
});

test("Phase 23.8.7 derives lifecycle stops from durable checks instead of supplied anomaly labels", () => {
  const { parent, repo } = createFixtureRepo();
  try {
    const fixture = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-7/anomaly-cases.json"), "utf8"));
    fixture.cases.forEach((anomaly, index) => {
      const runId = `run-${String(index + 1).padStart(4, "0")}`;
      seedRun(repo, true, runId);
      assertSuccess(
        runCli(["run", "prepare-packet", "--run", runId, "--kind", "auto"], { cwd: repo }),
        `prepare packet for ${anomaly.code}`
      );
      const packet = readRun(repo, runId).stage_packets.at(-1);
      const fixturePath = path.join(repo, `.result-${index}.json`);
      writeText(fixturePath, `${JSON.stringify(validResultFixture(packet, {
        anomaly_codes: [anomaly.code],
        ...(anomaly.blocking === false ? {} : {
          validation_results: [{
            check_id: anomaly.code,
            status: "fail",
            summary: `durable ${anomaly.code} check failed`,
            evidence_refs: [`durable:${anomaly.code}`]
          }]
        })
      }), null, 2)}\n`);
      const result = runCli([
        "run", "record-stage-result", "--run", runId,
        "--packet", packet.stage_packet_id, "--file", fixturePath
      ], { cwd: repo });
      if (anomaly.blocking === false) {
        assertSuccess(result, `hook state ${anomaly.code} must not affect lifecycle`);
        assert.equal(readRun(repo, runId).run_issues.length, 0);
        return;
      }
      assertFailure(result, `anomaly ${anomaly.code} must stop progression`);
      const recorded = readRun(repo, runId);
      assert.equal(recorded.run_issues.at(-1).issue_type, "failed_verification");
      assert.equal(recorded.run_issues.at(-1).repair_required, true);
      assert.equal(recorded.repair_packets.at(-1).issue_ids[0], recorded.run_issues.at(-1).issue_id);
      assert.equal(recorded.repair_packets.at(-1).next_action, "PLAN_AMEND_PACKET");
    });
  } finally {
    removeDirectory(parent);
  }
});

test("Phase 23.8.7 stays hookless and does not introduce a DB migration", () => {
  const source = fs.readFileSync(path.join(productRoot, "src/core/stage-operator.ts"), "utf8");
  assert.doesNotMatch(source, /child_process|spawn\(|execFile/i);
  assert.match(source, /runner_launch_allowed: false/);
  assert.match(source, /provider_selection_allowed: false/);
  const migrationEntries = fs.readdirSync(path.join(productRoot, "migrations"));
  assert.equal(migrationEntries.some((entry) => /23[_-]?8[_-]?7/i.test(entry)), false);
});
