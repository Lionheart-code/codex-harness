# Phase 23.8.5 - Automation Roadmap and Task Authority Rebase

## Status

Historical/accepted authority-rebase phase. Its outputs remain live roadmap
and task-authority surfaces, but the then-current Phase 23.8.6A pointer was
only adjacent wiring context rather than permanent current-state authority.
This file may receive only narrow authority-correction or forward-dependency
notes; it is not the active task pointer.

## Purpose

Convert the lightweight operator-first automation rebase into canonical
roadmap, task, and operating-policy contracts before any new runtime automation
is implemented.

This is an authority rebase, not an implementation phase. It clarifies what the
next phases are allowed to build and what they must not pre-implement.
It may update schema, registry, validator, and acceptance-test surfaces only as
needed to enforce repo-owned self-hosting procedure wrapper parity. Those
changes are contract enforcement, not runtime automation.

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

- Historical delivered step: update `TASK.md` to activate this task file for
  the original preparation pass. Once `TASK.md` points to a later task, that
  prior activation text is no longer the current operator authority.
- Add mandatory derived self-hosting procedure wrappers at
  `prompts/self-hosting/<procedure-id>.md`, with exactly one wrapper per
  `procedure_id` from `skills/self-hosting/procedure-registry.json` and no extra
  wrapper files except `prompts/self-hosting/README.md`.
- Add required `prompt_wrapper_path` metadata to the self-hosting procedure
  registry, schema, TypeScript registry model/validator, and acceptance tests.
  Keep `schema_version` unchanged because this registry is a checked-in
  product-source artifact updated atomically in this task.
- Update acceptance coverage so wrapper drift fails closed, including a negative
  validator test for mismatched `prompt_wrapper_path`.
- Update `docs/IMPLEMENTATION_ROADMAP.md` with the Phase 23.8.5 -> 23.8.6 ->
  23.8.6A -> 23.8.6B -> 23.8.6B1 -> 23.8.6B2 -> 23.8.6C -> 23.8.6D ->
  23.8.6E -> 23.8.7 -> 23.9 -> 24A -> 24B -> 25A -> 25B -> 26 sequence.
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
- Amend Phase 23.8.6 so its contract explicitly covers:
  atomic `plan-review` ingestion tied to the reviewed plan artifact;
  immutable run-instance identity across allocation, harvest, authoritative
  readback, retry, and compatibility projection paths;
  fail-closed handling for legacy or ambiguous records that lack exact
  run-instance identity; and
  typed harvest collision behavior that distinguishes same-instance retry from
  different-instance collision on the same display `run_id`.
- Add a roadmap continuity invariant that preserves Phases 27-31 as the
  downstream domain-pack, ingestion/schema-safety, prior-art discovery,
  bounded experimentation/improvement, and late reviewed runner-execution
  path.
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
- Amend operator/procedure docs to record advisory manual model/reasoning
  guidance for separate planning, review, and implementation passes. That
  guidance may distinguish lighter synthesis passes from stronger
  planning/review passes and may recommend keeping reviewer profiles separate
  from builder profiles, but it must not introduce provider/model routing,
  runtime selection logic, or self-approval.
- Amend `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md` to split `RunnerProfile` from
  `ExecutionPolicy`.
- Amend `docs/SECURITY_AND_PERMISSION_MODEL.md` to define `ExecutionPolicy` as
  the permission contract for future packet execution.
- Create `tasks/PHASE_23_8_6_TRANSACTIONAL_PROCEDURE_RESULT_INGESTION.md`.
- Create `tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`.
- Amend Phase 23.8.7 so `StagePacket` contracts require a verifiable stopping
  condition, required validation commands/artifacts, and a bounded
  progress/result log contract without adding runner execution.
- Split or amend Phase 24 into `24A` and `24B` without deleting useful
  evidence/report/redaction/provenance constraints.
- Split or amend Phase 25 into `25A` and `25B` while preserving Direct API/CLI
  first, MCP optional, redaction, query limits, no raw SQL,
  approval-gated mutations, and no autonomous agent.
- Amend Phase 26 while preserving that it extends `feature-decomposition`,
  emits reviewable task graph proposals, and does not execute or approve its
  own scope.
- Amend Phase 30 so bounded experimentation explicitly includes procedure
  trigger evals, findings/traces/CI-failure promotion into approved eval
  candidates/regression fixtures, and bounded drift/entropy cleanup proposals
  tied to evidence.
- Create `tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md`.

## Non-goals

- No runtime automation code or runtime behavior changes outside registry
  contract validation. Minimal schema, registry, TypeScript validator/model, and
  acceptance-test changes are allowed only to enforce the wrapper contract
  introduced by this task.
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
- No new-cycle run is started during this pass. Historical delivered Phase
  23.8.5 self-hosting run context may exist for this task, but that pass must
  not start the next task's run or claim its branch/worktree.
- No branch/worktree materialization is performed during this pass.

## Future-phase impact check

- Prepares Phase 23.8.6, Phase 23.8.6A, Phase 23.8.6B, Phase 23.8.6B2, Phase
  23.8.6C, Phase 23.8.6D, Phase 23.8.6E, Phase 23.8.7, Phase 23.9, Phase
  24A/24B, Phase 25A/25B, Phase 26, and downstream Phases 27-31 by making
  dependencies explicit.
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
node --test tests/acceptance/phase23-6-self-hosting-skills-plan-review-bootstrap.test.mjs tests/acceptance/self-hosting-review-policy-hardening.test.mjs tests/acceptance/phase23-7-operator-status.test.mjs tests/acceptance/phase23-8-bounded-source-of-truth-procedure-surface-patch.test.mjs tests/acceptance/phase23-8-agent-native-procedure-registry-and-skill-surface.test.mjs
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
- No runtime implementation is introduced beyond the narrow
  registry/schema/validator/test contract-enforcement exception already
  allowed by this task.
- No MCP/API/runner implementation is introduced.
- No hook authority is introduced.
- No broad process-product expansion is introduced.
- Old-cycle closeout/harvest and new-cycle activation/materialization are
  explicitly separate.
- The one task = one branch = one worktree invariant is preserved, and no
  harvested/closing run claims the next task branch/worktree.
- Self-hosting procedure wrappers are mandatory derived helpers:
  every registry `procedure_id` has exactly
  `prompts/self-hosting/<procedure-id>.md`, no extra wrapper files exist except
  `prompts/self-hosting/README.md`, every wrapper file is checked in as
  repo-owned source, and wrappers do not replace canonical `skills/self-hosting/**`
  authority.
- The registry requires `prompt_wrapper_path`; validator code fails closed when
  the path does not equal `prompts/self-hosting/<procedure-id>.md`.
- Checked-in procedure wrappers are distinguished from generated product prompts
  created by `node bin/ch prompt ...`.
- Manual procedure model guidance, if added, remains advisory operator guidance
  only. It must not become provider/model routing, runtime role execution, or
  authority to start implementation or approve review outcomes.
- Phase 23.8.7 packet contracts explicitly require verifiable stopping
  conditions, validation artifacts/commands, and bounded progress/result logs
  without adding runner execution.
- Phase 23.8.6 contract explicitly covers:
  atomic `plan-review` ingestion bound to the reviewed plan artifact rather
  than a loose equivalent-evidence substitute;
  immutable run-instance identity across allocation, harvest, retry,
  authoritative readback, and compatibility projection;
  typed fail-closed handling for identity-less legacy records; and
  typed harvest collision behavior that blocks different-instance collisions
  without mutating current staging state.
- Phase 30 and the new late runner-execution phase remain explicit checked-in
  future task contracts rather than chat-only intent.
