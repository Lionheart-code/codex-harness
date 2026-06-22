# Phase 23.8.5 - Automation Roadmap and Task Authority Rebase

## Status

Active docs/task-contract phase. Starts after Phase 23.8 Agent-native
Procedure Registry and Skill Surface is complete, reviewed, and accepted.

## Purpose

Convert the lightweight operator-first automation rebase into canonical
roadmap, task, and operating-policy contracts before any new runtime automation
is implemented.

This is an authority rebase, not an implementation phase. It clarifies what the
next phases are allowed to build and what they must not pre-implement.

It also separates the end-of-old-cycle decision from the start-of-new-cycle
materialization. A closing or harvested run may determine and record the next
task, but it must not create, claim, or mutate the next task branch/worktree.

## Read before editing

- `TASK.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OPERATIONS_PLAN.md`
- `docs/MASTER_ARCHITECTURE.md`
- `docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md`
- `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`
- `tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md`
- `tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`
- `tasks/PHASE_25_AGENT_ACCESS_LAYER.md`
- `tasks/PHASE_26_BIG_TASK_DECOMPOSER_AND_ARCHITECT_PLANNER.md`
- `tasks/PHASE_27_DOMAIN_PACK_SKILLS_ARCHITECTURE.md`
- `tasks/PHASE_28_DOMAIN_INGESTION_AND_SCHEMA_EVOLUTION_SAFETY.md`
- `tasks/PHASE_29_PRIOR_ART_DISCOVERY_GATE.md`
- `tasks/PHASE_30_BOUNDED_AGENT_EXPERIMENTATION_LOOP.md`

## Scope

Required changes:

- Update `TASK.md` to activate this task file for the current preparation pass.
- Update `docs/IMPLEMENTATION_ROADMAP.md` with the Phase 23.8.5 -> 23.8.6 ->
  23.8.7 -> 23.9 -> 24A -> 24B -> 25A -> 25B -> 26 sequence.
- Amend roadmap/operator contracts to make this invariant explicit:
  one task = one branch = one worktree; a closing or harvested run may decide
  the next task, but the new branch/worktree belongs to the new active task and
  must be created only during the new-cycle materialization step.
- Split operator lifecycle language into:
  end-of-old-cycle decision, which determines and records the next task; and
  start-of-new-cycle materialization, which in the current manual harness flow
  creates or enters the new task branch/worktree, activates the next task
  there, and starts the new run in that task worktree.
- Make explicit that branch/worktree creation is still a manual operator-owned
  step in the current replay flow and is not yet implicit in `run start`.
- State that Phase 23.8.6 owns the future productized materialization surface
  for activating the next task, starting the new run, and creating the
  branch/worktree through formal product commands or equivalent documented
  runtime surfaces.
- Add a roadmap continuity invariant that preserves Phases 27-30 as the
  downstream domain-pack, ingestion/schema-safety, prior-art discovery, and
  bounded experimentation path.
- Amend `docs/OPERATIONS_PLAN.md` with operator-first operations: no manual
  `run.json` repair, every operator action maps to a product command or
  documented ingestion path.
- Amend `docs/MASTER_ARCHITECTURE.md` to state lightweight control layer as a
  hard invariant.
- Amend the roadmap/operations contracts to state that codex-harness remains a
  lightweight, provider-neutral control plane: models/runners propose or execute
  only through explicit stage, runner profile, permission, evidence, and
  recovery contracts owned by the harness.
- Amend `docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md` so operator
  `next_allowed_action` must map to a product command or documented ingestion
  path where durable state is required.
- Amend `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md` to mention future
  procedure-ingestion and packet-preparation stages without adding runtime
  behavior.
- Amend the operator contracts to document the interim pre-23.8.6 manual replay
  rule: procedure-shaped transcripts may prepare the next prompt, but they are
  not durable runtime evidence, do not advance operator stage state, and must
  not be backfilled by editing `run.json`.
- Make the current CLI split explicit: `node bin/ch` is the product CLI surface,
  while separate Codex CLI or equivalent review-only sessions may be used for
  independent procedure passes such as `plan-review` without becoming runtime
  authority.
- Amend `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md` to split `RunnerProfile` from
  `ExecutionPolicy`.
- Amend `docs/SECURITY_AND_PERMISSION_MODEL.md` to define `ExecutionPolicy` as
  the permission contract for future packet execution.
- Create `tasks/PHASE_23_8_6_TRANSACTIONAL_PROCEDURE_RESULT_INGESTION.md`.
- Create `tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`.
- Split or amend Phase 24 into `24A` and `24B` without deleting useful
  evidence/report/redaction/provenance constraints.
- Split or amend Phase 25 into `25A` and `25B` while preserving Direct API/CLI
  first, MCP optional, redaction, query limits, no raw SQL,
  approval-gated mutations, and no autonomous agent.
- Amend Phase 26 while preserving that it extends `feature-decomposition`,
  emits reviewable task graph proposals, and does not execute or approve its
  own scope.

## Non-goals

- No runtime code changes.
- No procedure ingestion commands.
- No packet automation.
- No proof generation.
- No report builders.
- No access APIs.
- No MCP.
- No runner execution.
- No hooks work.
- No provider adapters.
- No domain-pack behavior.
- No process-product expansion or generic orchestration platform.
- No new run is started during this pass.
- No branch/worktree materialization is performed during this pass.

## Future-phase impact check

- Prepares Phase 23.8.6, Phase 23.8.7, Phase 23.9, Phase 24A/24B, Phase
  25A/25B, and Phase 26 by making dependencies explicit.
- Must not pre-implement transactional ingestion, packet automation, proof
  generation, report builders, access APIs, planner logic, domain packs,
  prior-art discovery, or experimentation.
- Preserves the domain/core boundary by keeping roadmap changes
  domain-neutral and self-hosting-focused.
- Requires architecture review if the rebase broadens core into generic
  orchestration, domain workflow execution, background automation, or
  MCP-native architecture.

## Acceptance commands

```bash
npm run build
git diff --check
```

## Acceptance behavior

- Docs and task files agree on phase order.
- Docs and task files preserve the lightweight provider-neutral control-plane
  invariant.
- Every new/split phase has a task file or clearly states which existing task
  it amends/replaces.
- The standalone run-state follow-up note is not a standalone authority
  surface.
- Roadmap blocks direct Phase 23.9 until run-state ingestion and packet
  foundations are completed, explicitly deferred, or waived by reviewed
  decision.
- No runtime implementation is introduced.
- No MCP/API/runner implementation is introduced.
- No hook authority is introduced.
- No broad process-product expansion is introduced.
- Old-cycle closeout/harvest and new-cycle activation/materialization are
  explicitly separate.
- The one task = one branch = one worktree invariant is preserved, and no
  harvested/closing run claims the next task branch/worktree.
