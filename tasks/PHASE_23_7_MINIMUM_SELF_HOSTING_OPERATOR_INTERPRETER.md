# Phase 23.7 - Minimum Self-Hosting Operator Interpreter

## Purpose

Make the Phase 23.6 self-hosting procedure workflow machine-visible and
operator-guided.

This phase does not create a new workflow. It interprets the already accepted
Phase 23.6 procedures and reports current stage, next procedure, missing
evidence, blockers, review tier, and next allowed action.

## Scope

Implementation task, but minimal.

Allowed:

- add an operator/status surface or equivalent CLI behavior;
- derive current self-hosting stage from existing task/run/evidence/review/closeout
  state where possible;
- map current stage to existing Phase 23.6 procedure ids;
- report blockers/stop reasons/missing evidence;
- expose suggested review tier;
- add fixtures/tests for routing/status behavior.

Forbidden:

- do not create a parallel self-hosting workflow;
- do not rename Phase 23.6 procedure ids unless explicitly approved;
- do not implement Phase 24 packets;
- do not implement provider/model routing;
- do not implement domain packs;
- do not implement full proof-carrying framework;
- do not implement bounded experimentation;
- do not mutate runtime DB schema unless unavoidable and justified.

## Binding inputs

Phase 23.7 must reuse:

- `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`;
- `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md`;
- `docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md`;
- `docs/SELF_HOSTING_SKILL_DISCOVERY.md`;
- `skills/self-hosting/**`;
- `docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md`;
- `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`;
- `docs/SELF_HOSTING_REVIEW_TIER_POLICY.md`.

## Required behavior

The operator interpreter must be able to output:

```text
current_stage:
next_procedure_id:
required_inputs:
missing_inputs:
required_evidence:
missing_evidence:
stop_reason:
next_allowed_action:
forbidden_actions:
review_tier:
```

Exact command names may follow repo conventions. Equivalent behavior is
required.

## Projection/status-first implementation rule

The first implementation should derive operator status from existing
task/run/evidence/review/closeout state where possible. Do not add a DB schema
migration merely to store operator stage labels unless implementation proves
projection is insufficient and tests justify the schema change.

Phase 23.7 must implement status/routing/blocker behavior before any richer
automation. It is not an autonomous agent and not a workflow engine.

## Required routing examples

- No active task -> `NO_ACTIVE_TASK`.
- No active run/context -> `NO_ACTIVE_RUN`.
- `TASK.md` / roadmap mismatch -> `STALE_TASK_ROADMAP_CONFLICT`.
- Missing task input -> `TASK_INTAKE_REQUIRED` -> `task-intake`.
- Broad feature request -> `FEATURE_DECOMPOSITION_REQUIRED` ->
  `feature-decomposition`.
- Missing plan -> `PLAN_DRAFT_REQUIRED` -> `draft-plan`.
- Draft plan present but unreviewed -> `PLAN_REVIEW_REQUIRED` -> `plan-review`.
- Plan review requires amendment -> `PLAN_AMEND_REQUIRED` -> `plan-amend`.
- Reviewed plan without owner approval -> `PLAN_APPROVAL_REQUIRED`.
- Approved plan without implementation evidence -> `IMPLEMENTATION_READY`.
- Implementation evidence present without review ->
  `IMPLEMENTATION_REVIEW_REQUIRED` -> `implementation-review`.
- Review findings unresolved -> `FIX_PASS_REQUIRED` -> `fix-pass-review`.
- Missing verification -> `VERIFICATION_REVIEW_REQUIRED` ->
  `verification-review`.
- Missing delivery facts -> `DELIVERY_FACTS_REVIEW_REQUIRED` ->
  `delivery-facts-review`.
- Missing closeout review -> `CLOSEOUT_REVIEW_REQUIRED` ->
  `phase-closeout-review`.
- All closeout evidence accepted -> `CLOSEOUT_READY`.
- Closeout complete with harvest candidates -> `HARVEST_READY`.
- Run already harvested -> `RUN_HARVESTED`.
- Run discarded -> `RUN_DISCARDED`.
- Run quarantined -> `RUN_QUARANTINED`.

## Acceptance fixtures

Add deterministic fixtures/tests for:

- no active task/run;
- stale `TASK.md` / roadmap conflict;
- broad feature requiring decomposition;
- missing plan;
- missing plan review;
- plan amendment required;
- missing owner approval;
- missing implementation evidence;
- missing implementation review;
- unresolved findings requiring fix-pass;
- missing verification;
- missing delivery facts;
- closeout blocked;
- closeout ready;
- harvested run;
- discarded run;
- quarantined run.

## Acceptance criteria

- The operator interpreter reuses Phase 23.6 procedure ids.
- The operator interpreter does not create a second workflow.
- The operator reports current stage and next allowed action.
- The operator reports missing inputs/evidence and stop reason.
- The operator blocks implementation without reviewed/approved plan evidence.
- The operator blocks closeout without review/verification/delivery facts
  evidence.
- The operator exposes review tier without implementing full provider/model
  routing.
- Tests/fixtures cover normal and blocked routing paths.
