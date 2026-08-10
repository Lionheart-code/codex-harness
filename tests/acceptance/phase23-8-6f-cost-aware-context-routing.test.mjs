import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { productRoot } from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const context = require(path.join(productRoot, "dist/core/self-hosting-review-context.js"));
const policy = require(path.join(productRoot, "dist/core/self-hosting-review-policy.js"));
const evaluation = require(path.join(productRoot, "dist/core/review-routing-evaluation.js"));
const cleanup = require(path.join(productRoot, "dist/core/prepared-successor-cleanup.js"));
const runtime = require(path.join(productRoot, "dist/core/runtime.js"));

function source(pathName, hash = `sha256:${"1".repeat(64)}`) {
  return { path: pathName, content_hash: hash, byte_count: 100, required: true, retrieval_mode: "read_only_reference" };
}

function coreInput(overrides = {}) {
  return {
    task_id: "23.8.6F",
    task_pointer_ref: "TASK.md",
    task_contract_ref: "tasks/F.md",
    approved_plan_ref: "evidence/approved-plan.md#sha256:plan",
    procedure_contract_refs: ["skills/self-hosting/plan-review/SKILL.md"],
    review_tier: "extra-high",
    changed_surface_classes: ["runtime", "policy"],
    risk_classes: ["authority"],
    run_id: "run-0002",
    run_instance_id: "run-instance",
    branch: "codex/f",
    worktree_ref: ".",
    source_snapshot: "head",
    immutable_base: "base",
    architectural_invariants: ["provider neutral"],
    non_goals: ["no runner"],
    acceptance_refs: ["tasks/F.md"],
    verification_refs: ["npm test"],
    source_provenance: [source("TASK.md"), source("tasks/F.md"), source("evidence/approved-plan.md")],
    size_budget_bytes: 65536,
    ...overrides
  };
}

test("Phase F context identities are deterministic and deltas do not rewrite the core", () => {
  const first = context.buildContextCore(coreInput());
  const reordered = context.buildContextCore(coreInput({
    changed_surface_classes: ["policy", "runtime"],
    source_provenance: [source("evidence/approved-plan.md"), source("TASK.md"), source("tasks/F.md")]
  }));
  assert.equal(first.context_core_id, reordered.context_core_id);
  const changed = context.buildContextCore(coreInput({ approved_plan_ref: "evidence/approved-plan-v2.md#sha256:changed" }));
  assert.notEqual(first.context_core_id, changed.context_core_id);
  const manifest = context.buildContextManifest(first);
  const delta = context.buildReviewDeltaOverlay({
    context_core_id: first.context_core_id,
    reviewed_candidate_id: "sha256:candidate",
    changed_files: ["src/core/runtime.ts"],
    diff_refs: ["artifact:diff"],
    payload_refs: [],
    findings: [{ finding_id: "F1", disposition: "claimed_fixed" }],
    verification_refs: ["test:focused"],
    changed_authority_surfaces: ["review claim"],
    changed_architecture_surfaces: [],
    missing_evidence: [],
    escalation_reasons: [],
    size_budget_bytes: 32768
  });
  const request = context.assembleReviewRequest({ operator_request: "Review the delta.", context_core: first, context_manifest: manifest, delta_overlay: delta, procedure_contract_ref: "skills/self-hosting/plan-review/SKILL.md", route_decision_id: "route-1" });
  assert.ok(request.startsWith("## Mandatory Direct Reviewer Contract"));
  assert.match(request, /Do not run `run launch-review`/);
  assert.equal(delta.context_core_id, first.context_core_id);
  assert.throws(() => context.buildContextCore(coreInput({ worktree_ref: "/incidental/worktree" })), /ABSOLUTE_PATH_FORBIDDEN/);
});

test("Phase F shadow replay canary promotion rejection rollback records stay evidence-bound", () => {
  const replay = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/historical-replay-source.json"), "utf8"));
  assert.equal(replay.legacy_pre_f_audit.reason, "legacy_pre_f_replay_packet_missing");
  assert.notEqual(replay.source.run_instance_id, replay.evaluation_host.run_instance_id);
  assert.equal(replay.source.packet.payload_ids.length, 4);
  const valid = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/routing-evaluation-valid.json"), "utf8"));
  assert.equal(evaluation.validateRoutingEvaluationBundle(valid).evaluation_mode, "replay");
  const canary = structuredClone(valid);
  canary.evaluation_mode = "canary";
  canary.source_lifecycle_status = "active";
  canary.canary_authorization_id = "routing-decision-canary";
  canary.canary_invocation_count = 1;
  canary.canary_closed = true;
  assert.equal(evaluation.validateRoutingEvaluationBundle(canary).canary_closed, true);
  const invalidCanary = structuredClone(canary);
  invalidCanary.canary_invocation_count = 4;
  assert.throws(() => evaluation.validateRoutingEvaluationBundle(invalidCanary), /1-3 invocations/);
  const rejected = structuredClone(valid);
  rejected.cases[0].legal_lifecycle = false;
  assert.equal(evaluation.evaluatePromotionGates(rejected).accepted, false);
});

test("Phase F documentation downstream and future phase boundaries remain narrow", () => {
  const docs = ["docs/AGENT_BOUNDARIES_AND_ADAPTERS.md", "docs/OPERATIONS_PLAN.md", "docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md", "docs/HUMAN_OPERATOR_MANUAL.md", "docs/IMPLEMENTATION_ROADMAP.md"]
    .map((entry) => fs.readFileSync(path.join(productRoot, entry), "utf8")).join("\n");
  assert.match(docs, /create_thread/);
  assert.match(docs, /cleanup-prepared-successor/);
  assert.doesNotMatch(docs, /\(--create\|--enter-existing\)/);
  assert.match(docs, /Phase 31 remains the first general external-runner/);
  for (const taskPath of [
    "tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md",
    "tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md",
    "tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md",
    "tasks/PHASE_30_BOUNDED_AGENT_EXPERIMENTATION_LOOP.md",
    "tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md"
  ]) {
    const task = fs.readFileSync(path.join(productRoot, taskPath), "utf8");
    assert.match(task, /23\.8\.6F|Phase F/, `${taskPath} must consume the Phase F boundary`);
  }
});

test("Phase F policy covers all 15 procedures and Phase 23.9 automatic reviews", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(productRoot, "skills/self-hosting/procedure-registry.json"), "utf8"));
  const execution = policy.readProcedureExecutionPolicy(productRoot);
  policy.reconcileProcedureExecutionPolicy(registry, execution);
  assert.equal(execution.procedures.length, 15);
  assert.deepEqual(execution.procedures.filter((entry) => entry.automatic_launch).map((entry) => entry.procedure_id).sort(), [
    "architecture-review",
    "db-storage-review",
    "fix-pass-review",
    "implementation-review",
    "plan-review"
  ]);
  assert.ok(execution.procedures.every((entry) => entry.required_output_contract.length && entry.required_evidence_contract.length));
});

test("Phase F routing is deterministic, adjacent-only, and reopens on critical risk", () => {
  const routePolicy = policy.readReviewRoutePolicy(productRoot);
  const execution = policy.readProcedureExecutionPolicy(productRoot);
  const contract = execution.procedures.find((entry) => entry.procedure_id === "implementation-review");
  const inputs = {
    procedure_id: "implementation-review", review_tier: "high", pass_kind: "fix_pass_review", pass_index: 1,
    changed_surface_classes: ["runtime"], risk_classes: [], deterministic_evidence_complete: true,
    prior_failure_count: 0, independence_required: true, context_reuse_state: "hit", owner_budget_class: "economy",
    open_blocker_count: 0, new_blocker_count: 0, delta_bytes: 1000, material_change_classes: []
  };
  const first = policy.decideReviewRoute(routePolicy, contract, inputs);
  const second = policy.decideReviewRoute(routePolicy, contract, { ...inputs, changed_surface_classes: ["runtime"] });
  assert.equal(first.route_decision_id, second.route_decision_id);
  assert.equal(first.route_class, "balanced_routine");
  const critical = policy.decideReviewRoute(routePolicy, contract, { ...inputs, risk_classes: ["authority"] });
  assert.equal(critical.route_class, "critical_independent");
  assert.equal(critical.downgrade_applied, false);
});

test("Phase F promotion gates reject critical misses and unavailable usage", () => {
  const valid = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/routing-evaluation-valid.json"), "utf8"));
  assert.equal(evaluation.evaluatePromotionGates(evaluation.validateRoutingEvaluationBundle(valid)).accepted, true);
  const missed = structuredClone(valid);
  missed.cases[0].actual_critical_findings = [];
  delete missed.cases[0].candidate_total_tokens;
  const result = evaluation.evaluatePromotionGates(missed);
  assert.equal(result.accepted, false);
  assert.ok(result.rejection_reasons.some((entry) => entry.endsWith("critical_blocker_miss")));
  assert.ok(result.rejection_reasons.some((entry) => entry.endsWith("usage_unavailable")));
});

test("Phase F JSONL usage records observed values and never fabricates unavailable zeroes", () => {
  const observed = runtime.parseCodexJsonlUsage(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/codex-jsonl-usage.jsonl"), "utf8"));
  assert.equal(typeof observed.input_tokens, "number");
  assert.equal(typeof observed.output_tokens, "number");
  const unavailable = runtime.parseCodexJsonlUsage(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/codex-jsonl-no-usage.jsonl"), "utf8"));
  assert.equal("input_tokens" in unavailable, false);
  assert.equal("output_tokens" in unavailable, false);
});

test("Phase F retains at least twelve routing eval cases and validates recoverable cleanup evidence", () => {
  const cases = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/routing-eval-cases.json"), "utf8"));
  assert.ok(cases.cases.length >= 12);
  const evidence = JSON.parse(fs.readFileSync(path.join(productRoot, "tests/fixtures/phase23-8-6f/prepared-successor-cleanup-evidence.json"), "utf8"));
  const validated = cleanup.validatePreparedSuccessorCleanupEvidence(evidence);
  const receipt = cleanup.buildPreparedSuccessorCleanupReceipt(productRoot, validated);
  assert.match(receipt.recovery_branch, /^codex\/recovery\//);
  assert.match(receipt.archived_task_state_path, /^\.harness\/archive\/prepared-successors\//);
});
