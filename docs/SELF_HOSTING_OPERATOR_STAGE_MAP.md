# Self-Hosting Operator Stage Map

## Purpose

Provide a declarative stage-to-procedure map for the Phase 23.7 operator
interpreter.

This map is a projection over Phase 23.6. It is not a replacement for Phase
23.6 procedure contracts. Phase 23.7 must use this map as a guardrail and
reconcile it against the current repository during implementation.

## Stage map

`next_procedure_id` may contain only `none` or a Phase 23.6 procedure id.
Non-procedure transitions belong in `next_allowed_action`.

| Stage | Next procedure id | Next allowed action | Required input/evidence | Common blocker/stop reason | Forbidden action |
|---|---|---|---|---|---|
| `NO_ACTIVE_TASK` | `none` | create or reconcile active task pointer | `TASK.md` or active phase task missing/unclear | `missing_active_task` | planning, implementation, closeout |
| `NO_ACTIVE_RUN` | `none` | run open/start equivalent | active task exists but no active run/context record | `missing_active_run` | implementation review, closeout |
| `STALE_TASK_ROADMAP_CONFLICT` | `none` | reconcile `TASK.md` and roadmap before import/implementation | `TASK.md` conflicts with roadmap/current phase status | `stale_task_roadmap_conflict` | implementation, closeout, import until resolved |
| `TASK_INTAKE_REQUIRED` | `task-intake` | run task-intake procedure | owner request or raw task input | `missing_task_input` | draft plan, implementation, closeout |
| `FEATURE_DECOMPOSITION_REQUIRED` | `feature-decomposition` | run feature-decomposition procedure | broad task/feature request | `task_too_broad_for_direct_plan` | implementation |
| `TASK_PROMPT_REQUIRED` | `task-prompt-writer` | run task-prompt-writer procedure | normalized task contract or intake result | `missing_task_contract` | implementation |
| `PLAN_DRAFT_REQUIRED` | `draft-plan` | run draft-plan procedure | task contract, repo context, constraints | `missing_plan` | implementation |
| `PLAN_REVIEW_REQUIRED` | `plan-review` | run plan-review procedure | draft plan, task contract, review tier | `missing_plan_review` | implementation |
| `PLAN_AMEND_REQUIRED` | `plan-amend` | run plan-amend procedure | plan review findings | `plan_review_requires_amendment` | implementation |
| `PLAN_APPROVAL_REQUIRED` | `none` | obtain human approval boundary | reviewed/amended plan | `missing_plan_approval` | implementation |
| `IMPLEMENTATION_READY` | `none` | builder handoff / implementation prompt | approved plan, task contract, allowed scope | `missing_builder_handoff` | closeout |
| `IMPLEMENTATION_REVIEW_REQUIRED` | `implementation-review` | run implementation-review procedure | implementation report, diff/changed files, test output | `missing_implementation_evidence` | closeout |
| `FIX_PASS_REQUIRED` | `fix-pass-review` | run fix-pass-review procedure | review findings, fix-pass report/diff/tests | `unresolved_review_findings` | closeout |
| `VERIFICATION_REVIEW_REQUIRED` | `verification-review` | run verification-review procedure | test/build/verification evidence | `missing_verification_evidence` | closeout |
| `DELIVERY_FACTS_REVIEW_REQUIRED` | `delivery-facts-review` | run delivery-facts-review procedure | delivery facts record/import | `missing_delivery_facts` | closeout |
| `CLOSEOUT_REVIEW_REQUIRED` | `phase-closeout-review` | run phase-closeout-review procedure | accepted implementation review, verification, delivery facts | `missing_closeout_review` | harvest |
| `CLOSEOUT_READY` | `none` | perform closeout lifecycle command under Phase 23.5 rules | accepted closeout review | `closeout_ready` | new implementation in same run |
| `HARVEST_READY` | `none` | perform harvest lifecycle command under Phase 23.5 rules | closeout receipt and harvest candidates | `harvest_ready` | direct accepted-memory writes without harvest |
| `RUN_HARVESTED` | `none` | start new run/task if needed | harvested run/closeout record | `run_already_harvested` | new work in same run |
| `RUN_DISCARDED` | `none` | require explicit recovery/reopen decision | discarded run/staging state | `run_discarded` | resume without explicit recovery/reopen decision |
| `RUN_QUARANTINED` | `none` | manual/review decision before transition | quarantined run/evidence/state | `run_quarantined` | implementation, harvest, accepted-memory writes |
| `BLOCKED` | `none` | resolve blocker-specific condition | blocker-specific evidence | blocker-specific stop reason | any transition not resolving blocker |

## Minimal acceptance behavior

Phase 23.7 should pass fixtures for:

- no active task;
- no active run;
- stale `TASK.md`/roadmap conflict;
- broad task requiring feature decomposition;
- task ready but missing draft plan;
- draft plan ready but missing plan review;
- reviewed plan requiring amendment;
- reviewed plan missing owner approval;
- implementation evidence missing;
- review findings requiring fix-pass;
- verification evidence missing;
- delivery facts missing;
- closeout blocked until review/verification/delivery facts are present;
- closeout ready;
- harvested run;
- discarded run;
- quarantined run.

## Projection-first rule

The first Phase 23.7 implementation should derive these stages from existing
task/run/evidence/review/closeout state where possible. Do not introduce a DB
migration merely to store a stage label unless repo inspection proves
projection is insufficient.

## Change control

If repo inspection shows a different canonical stage model, the Phase 23.7
implementation plan must recommend amendments rather than importing this map
blindly.
