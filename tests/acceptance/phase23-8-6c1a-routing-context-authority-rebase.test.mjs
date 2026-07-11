import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(productRoot, relativePath), "utf8");

const files = {
  taskPointer: read("TASK.md"),
  c1a: read("tasks/PHASE_23_8_6C1A_ROUTING_CONTEXT_AND_MODEL_POLICY_AUTHORITY_REBASE.md"),
  roadmap: read("docs/IMPLEMENTATION_ROADMAP.md"),
  operations: read("docs/OPERATIONS_PLAN.md"),
  routing: read("docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md"),
  context: read("docs/CONTEXT_BUDGET_POLICY.md"),
  c2: read("tasks/PHASE_23_8_6C2_BOOTSTRAP_AUTHORITY_CORRECTNESS.md"),
  d: read("tasks/PHASE_23_8_6D_PROCEDURE_ARTIFACT_PAYLOAD_STORAGE_AND_WORKTREE_RETENTION.md"),
  e: read("tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md"),
  stage: read("tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md"),
  proof: read("tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md"),
  phase24a: read("tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md"),
  phase24b: read("tasks/PHASE_24B_EXPANDED_REPORTS_AND_PACKETS.md"),
  phase30: read("tasks/PHASE_30_BOUNDED_AGENT_EXPERIMENTATION_LOOP.md"),
  phase31: read("tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md")
};

test("phase 23.8.6C1A is the only active task and is ordered before C2", () => {
  assert.equal(
    files.taskPointer.trim(),
    "# Current Task\n\nImplement only: tasks/PHASE_23_8_6C1A_ROUTING_CONTEXT_AND_MODEL_POLICY_AUTHORITY_REBASE.md\n\nDo not implement Phase 23.8.6C2 or later."
  );
  assert.match(files.c1a, /^# Phase 23\.8\.6C1A - Routing, Context, and Model-Policy Authority Rebase/m);
  assert.match(files.c1a, /Treat this phase as `extra-high`/);
  assert.match(files.c1a, /No runtime router, provider selection, runner execution, or packet generation/);
  for (const authority of [files.roadmap, files.operations]) {
    assert.match(authority, /23\.8\.6C1\s*->\s*23\.8\.6C1A\s*->\s*23\.8\.6C2\s*->\s*23\.8\.6D\s*->\s*23\.8\.6E\s*->\s*23\.8\.7\s*->\s*23\.9/s);
  }
});

test("routing and context policy are deterministic, provider-neutral, and fail closed", () => {
  for (const routeClass of [
    "deterministic_no_model",
    "mechanical_low_cost",
    "routine_balanced",
    "complex_judgment",
    "critical_escalation",
    "parallel_audit_leaf",
    "parallel_audit_arbiter"
  ]) {
    assert.match(files.routing, new RegExp(`\\b${routeClass}\\b`));
  }
  assert.match(files.routing, /procedure_id[\s\S]*review_tier[\s\S]*changed_surface_classes[\s\S]*risk_classes[\s\S]*deterministic_evidence_state[\s\S]*prior review\/fix-pass failures[\s\S]*independence requirement[\s\S]*context reconstruction cost[\s\S]*budget among safe profiles/);
  assert.match(files.routing, /Budget never weakens a profile floor, safety invariant, or independence/);
  assert.match(files.routing, /The default router is not an LLM/);
  for (const transport of ["fresh_packet", "resume_same_role", "packet_plus_retrieval", "fork_non_authoritative"]) {
    assert.match(`${files.routing}\n${files.context}`, new RegExp(`\\b${transport}\\b`));
  }
  assert.match(files.context, /transcript, hidden reasoning, and cache state are never authority/i);
});

test("downstream ownership stays separated and provider-neutral", () => {
  assert.match(files.c2, /Starts only after Phase 23\.8\.6C1A/);
  assert.match(files.c2, /No generalized context core\/manifest, route intent, model selection, or\s+routing policy implementation/);
  assert.match(files.d, /immutable payload identity[\s\S]*stable content hash[\s\S]*bounded payload\/chunk references[\s\S]*worktree\/source\/base provenance/);
  assert.match(files.d, /No context bundle, `ContextCore`, or `ContextManifest` construction/);
  assert.match(files.e, /post-implementation\s+freshness reconciliation[\s\S]*does\s+not repeat the research/i);
  assert.match(files.stage, /provider-neutral `RouteIntent`/);
  assert.match(files.stage, /`StagePacket`\s+preparation does not launch a runner/);
  assert.match(files.proof, /separate deterministic-evidence and model-judgment references/);
  assert.match(files.proof, /Missing invocation, model, context, or usage facts are explicit and never\s+fabricated/);
  assert.match(files.phase24a, /deterministic shared `ContextCore`\/`ContextManifest`/);
  assert.match(files.phase24a, /mandatory\s+context is never removed for budget/);
  assert.match(files.phase24b, /Distinct semantic\s+reviews retain separate rubrics, verdicts, evidence trails, and independence/);
});

test("Phase 30 rejects unsafe candidates and Phase 31 remains first runtime binding boundary", () => {
  assert.match(files.phase30, /Hard-reject any candidate that misses a confirmed critical blocker/);
  assert.match(files.phase30, /illegal lifecycle progression or independence violation/);
  assert.match(files.phase30, /invalid\s+structured output/);
  assert.match(files.phase30, /reduces cost without preserving quality/);
  assert.match(files.phase31, /first general runtime owner of `RouteDecision`/);
  assert.match(files.phase31, /`ProviderBindingRegistry`/);
  assert.match(files.phase31, /No LLM-based default router, silent downgrade, unbounded subagent fan-out/);
  assert.match(files.phase31, /write-capable\s+parallel leaves sharing a worktree/);
});

test("current registry pins only the two approved Sol review bindings", () => {
  const registry = JSON.parse(read("skills/self-hosting/procedure-registry.json"));
  const profiles = registry.procedures
    .filter((procedure) => procedure.review_launch_profile)
    .map((procedure) => ({ id: procedure.procedure_id, ...procedure.review_launch_profile }));
  assert.deepEqual(profiles, [
    {
      id: "plan-review",
      adapter_id: "codex_cli",
      model: "gpt-5.6-sol",
      reasoning_effort: "high",
      sandbox_mode: "read-only",
      output_mode: "file",
      timeout_seconds: 1800,
      stale_after_seconds: 300
    },
    {
      id: "implementation-review",
      adapter_id: "codex_cli",
      model: "gpt-5.6-sol",
      reasoning_effort: "medium",
      sandbox_mode: "read-only",
      output_mode: "file",
      timeout_seconds: 1800,
      stale_after_seconds: 300
    }
  ]);
});
