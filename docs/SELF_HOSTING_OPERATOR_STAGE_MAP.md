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
| `COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED` | `architecture-review` | for C2A, run one independent read-only combined review and record the same labeled artifact under `architecture-review` and `db-storage-review` | architecture/authority and persisted-storage/no-storage-change verdicts | `missing_combined_architecture_db_review` or `combined_review_refresh_required` | implementation, source edits, verification, closeout |
| `VERIFICATION_REVIEW_REQUIRED` | `verification-review` | run verification-review procedure | test/build/verification evidence | `missing_verification_evidence` | closeout |
| `DELIVERY_FACTS_REVIEW_REQUIRED` | `delivery-facts-review` | run delivery-facts-review procedure | delivery facts record/import | `missing_delivery_facts` | closeout |
| `CLOSEOUT_REVIEW_REQUIRED` | `phase-closeout-review` | run phase-closeout-review procedure | accepted implementation review, verification, delivery facts | `missing_closeout_review` | harvest |
| `CLOSEOUT_READY` | `none` | perform closeout lifecycle command under Phase 23.5 rules | accepted closeout review | `closeout_ready` | new implementation in same run |
| `HARVEST_READY` | `none` | perform harvest lifecycle command under Phase 23.5 rules | closeout receipt and harvest candidates | `harvest_ready` | direct accepted-memory writes without harvest |
| `RUN_HARVESTED` | `none` | record next-task decision, or if one is already recorded, begin separate new-cycle materialization through commit-backed activation | identity-matched harvested run/closeout record | `run_already_harvested` | new work in same run, claiming next task branch/worktree from harvested run |
| `RUN_DISCARDED` | `none` | require explicit recovery/reopen decision | discarded run/staging state | `run_discarded` | resume without explicit recovery/reopen decision |
| `RUN_QUARANTINED` | `none` | manual/review decision before transition | quarantined run/evidence/state | `run_quarantined` | implementation, harvest, accepted-memory writes |
| `BLOCKED` | `none` | resolve blocker-specific condition | blocker-specific evidence | blocker-specific stop reason such as `harvest_identity_collision` | any transition not resolving blocker |

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

For the pre-implementation path, bare `plan-review` evidence is not enough on
its own. Before Phase 23.8.6 is implemented, projection should fail closed
unless the operator has the exact durable plan-review decision semantics
required by the active contract. Phase 23.8.6 must treat `plan-review` as one
atomic procedure result tied to the reviewed plan artifact, and
`PLAN_APPROVAL_REQUIRED` refers to the latest effective amended plan rather
than any stale draft-plan artifact.

## Future ingestion and packet stages

Phase 23.8.6 and Phase 23.8.7 may add richer command-backed transitions for
procedure-result ingestion and stage-packet preparation. Until those task
contracts are active and implemented, this stage map remains a projection and
must not imply manual `run.json` repair, runner invocation, background
automation, or hook authority.

If a manual replay produces a valid procedure-shaped transcript, the operator
should invoke the procedure through the checked-in
`prompts/self-hosting/<procedure-id>.md` wrapper. That transcript may be used to
prepare the next operator prompt, but it does not satisfy `required_evidence`
for this map until the matching product command or documented ingestion path
records it. For example, a manual `task-intake` transcript does not make
runtime status leave `TASK_INTAKE_REQUIRED` until
`run record-procedure --procedure task-intake --file ...` records it. The same
distinction applies to `task-prompt-writer`, `draft-plan`, `plan-review`,
`plan-amend`, and the other active-chain replay surfaces. Operators must name
that distinction explicitly when continuing a manual preparation pass.
When the manual pass is a separate review session, use the checked-in launch
discipline in `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` rather than ad hoc
CLI guesses. A blocker note, launch hang, or missing artifact does not satisfy
review-required evidence and must not be treated as an accepted review result.

Procedure ingestion may record that closeout/harvest selected the next task.
New-cycle materialization is separate. Phase 23.8.6 now provides the current
narrow
command path for it: `run record-next-task` followed by
`run materialize-next-task`. That sequence prepares, rather than starts, the
new task run. The sequence is not complete until the new task worktree writes
`TASK.md`, the complete activation authority is committed as the first commit
in that branch/worktree, clean git is confirmed, and deterministic dependency/build
plus tracked-procedure readiness checks pass. A Codex Desktop managed worktree
may be entered instead of recreated, but a Desktop UI setup selection does not
replace those readiness checks. A working-tree-only `TASK.md` change is not
enough to treat the new task as active. After clean git, create the successor
through the native Codex Desktop task/worktree API; verify its cwd, branch, and
`HEAD` binding, expose its identity/link for the user to open without
repository/worktree creation, selection, or search, and stop the predecessor
before any successor work. If creation or binding cannot be proven, fail closed
with typed `HANDOFF_CREATION_FAILED`: do not bootstrap, start a successor run,
or execute successor shell work from the predecessor. Only after that proof may
the successor run `node bin/ch worktree bootstrap` before
`node bin/ch run start --task TASK.md`. The harvested run still must not create,
claim, or mutate the next task branch/worktree as old-run-owned state.

If a harvested predecessor lacks a recorded next-task decision, or an
already-activated successor lacks its uniquely owning `TaskState` because
materialization was skipped, the handoff must stop fail-closed. The active D
task-intake and draft-plan must define the smallest product-owned recovery from
the recorded immutable decision base before materialization and activation
proof. Manual `TaskState`/database edits, substituting current `HEAD` for the
base, silently claiming an advanced worktree, and starting the successor before
owner-match proof are forbidden.

For a materialized successor, `run start` repeats the deterministic bootstrap
before durable run creation. Its readiness marker must match the committed
`HEAD`, source tree, lockfile, and CLI build output, and no authority or
readiness path may be a symbolic link. `--verify` rechecks installed
dependencies against the lockfile; a missing prerequisite, stale
generated output, or nonmatching dependency directory is a C2A bootstrap
blocker rather than a runnable state.

Once Phase 23.8.6 is active, `RUN_HARVESTED` must refer to identity-matched
harvest evidence for the same immutable run instance. If project memory matches
the display `run_id` but not the immutable run-instance identity, the operator
must route to `BLOCKED` with a dedicated harvest-identity-collision stop reason
instead of treating the current run as already harvested.

Expected future command-backed actions include:

```text
record procedure result
record reviewed-plan approval
record next-task decision
materialize next task branch/worktree
prepare stage packet
record stage result fixture
```

Those actions must preserve the existing stage boundaries: procedure ingestion
does not execute the next phase, packet preparation does not launch a runner,
and proof/report/access layers do not decide lifecycle.

## Change control

If repo inspection shows a different canonical stage model, the Phase 23.7
implementation plan must recommend amendments rather than importing this map
blindly.
