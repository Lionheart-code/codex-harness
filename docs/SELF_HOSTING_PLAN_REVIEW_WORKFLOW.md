# Self-hosting Plan-Review Workflow

## Purpose

This workflow defines how `codex-harness` should plan, review, implement,
verify, and close its own changes after Phase 23.5 established the accepted
memory and lifecycle authority model.

Task files remain the contract. Procedure skills provide the reusable operating
rubrics. Checked-in `prompts/self-hosting/<procedure-id>.md` wrappers are
mandatory derived invocation helpers, not authority.

## Broad-request pre-flow

Use `feature-decomposition` before task selection when a request is too broad
for one implementation pass.

```text
large goal or major module request
-> clarify requirements
-> state goals and non-goals
-> record assumptions and open questions
-> draft product or feature spec
-> draft architecture and dependency plan
-> produce executable task-contract proposals
-> order tasks by dependency, risk, and value
-> recommend the first active task
-> return to the normal TASK.md-driven workflow
```

`feature-decomposition` produces reviewable task-contract proposals. It does
not approve scope and does not start implementation.

## Manual model guidance

For the current manual replay flow, procedure model/reasoning choice is
operator guidance only and must not be treated as runtime routing.

- `task-intake` and `task-prompt-writer` are bounded synthesis/normalization
  passes and may use lower-cost profiles such as `gpt-5.4-mini` when the
  procedure stays narrow and well-specified.
- `feature-decomposition` and `draft-plan` are harder planning passes and
  should use a stronger planning profile such as `gpt-5.4` with `extra high`
  reasoning.
- implementation or builder passes may use a stronger builder profile matched
  to task complexity, but they should remain separate from the reviewer
  profile used to judge the same work; `gpt-5.4` with `high` reasoning is the
  default manual implementation profile, with escalation to `extra high` only
  for harder cross-cutting work.
- `plan-review`, `implementation-review`, `fix-pass-review`,
  `verification-review`, `delivery-facts-review`, `phase-closeout-review`,
  `architecture-review`, `db-storage-review`, `docs-consistency-review`, and
  `harness-audit` are reviewer passes. They should use a separate reviewer
  session and a different reviewer model/profile from the planning or builder
  pass they are checking; `gpt-5.5` with `high` reasoning is the default
  reviewer profile, while `extra high` is escalation-only for ambiguous or
  disputed review situations.

These are manual invocation defaults only. They do not authorize model
selection by runtime state, do not create a provider/model policy engine, and
do not bypass human approval or review boundaries.

## Standard workflow

```text
1. Task selected
2. task-intake
3. task-prompt-writer
4. draft-plan
5. plan-review
6. plan-amend, if review findings require changes
7. human approval
8. implementation
9. implementation-review
10. fix-pass-review, if findings require fixes
11. verification-review
12. delivery-facts-review
13. phase-closeout-review
14. Source-of-Truth Refresh / Documentation Garbage Collection
15. closeout and harvest under Phase 23.5 lifecycle rules
```

Mandatory rules:

- Implementation must not start before human approval of the reviewed plan.
- Reviewers compare work against both the task contract and the approved plan.
- `plan-review` must preserve both a human-readable review report and a
  durable decision record for operator/runtime use.
- `plan-amend` must yield one effective amended plan for execution. If
  multiple amendments exist, the latest amended plan supersedes earlier draft
  or amend plan artifacts while preserving them as audit trail.
- `draft-plan`, `plan-review`, and `implementation-review` must explicitly
  check `anti_slop`, `design_invariant`, `scope_legality`, `evidence_gap`,
  `docs_consistency`, `future_phase_leakage`, and `review_tier_controls` when
  they apply.
- `draft-plan` must be agent-legible for the later implementation pass: it must
  identify source inputs and implementation surfaces, preserve open
  engineering questions, map validation signals to acceptance behavior, and
  state stop conditions and handoff criteria.
- If the active task contract, authoritative docs, prompt wrappers, and
  canonical skill contracts diverge, reconcile those surfaces before
  implementation or review continues when authoritative behavior changed.
- `delivery-facts-review` and `phase-closeout-review` do not replace Phase 23.5
  lifecycle authority. They prepare evidence for it.
- Hooks can remind or block within their documented limits, but they are not
  the authority boundary for plan approval, delivery facts, closeout, or
  harvest.

## Review surface discovery

Reviewers must derive the review surface from:

```text
active task
current diff
changed file domains
affected procedures
stage/routing/review policies
required evidence
forbidden scope
authority boundaries
```

If the review surface cannot be determined safely, do not guess. Return:

```text
BLOCKED_REVIEW_SURFACE_UNCLEAR
```

## Future-debt placement

If review or audit work discovers real implementation debt outside the active
task, do not leave that finding only in run-local markdown, chat notes, or a
roadmap summary.

Final source-owned placement must be exactly one of:

- current blocker for the active task;
- explicit existing future task owner;
- new future task;
- historical or already resolved; or
- explicit owner decision/report-only outcome when no implementation work is
  being assigned.

The allocation must also say whether the finding is:

- a current blocker;
- near-term debt that is already distorting operator/review work and should be
  pulled forward into the earliest honest owner; or
- later debt that is real but must wait for its upstream task foundations.

If an existing future task owns the finding only by implication, amend that
task file before calling the allocation complete. The roadmap may summarize
phase ownership, but it is not the sole placement surface for executable
future implementation debt.

## Fix-pass and re-review protocol

After `FIX_REQUIRED`, `ACCEPT_WITH_FIXES`, or any blocking implementation
review, the next pass is a bounded fix-pass, not a new implementation pass.

Allowed:

- close explicit blockers;
- add tests or evidence required to prove blocker closure;
- perform minimal local refactor required by blocker closure.

Forbidden:

- broaden scope;
- re-plan the phase;
- introduce future-phase work;
- rewrite unrelated code;
- add new procedure IDs;
- add new workflow, schema, or access-layer machinery without explicit
  approval.

If a fix-pass cannot be bounded to the original findings, stop and escalate
instead of silently continuing.

## Closeout freshness requirement

`phase-closeout-review` must include Source-of-Truth Refresh / Documentation
Garbage Collection.

It must check:

- whether current behavior changed;
- whether task or roadmap boundaries changed;
- whether a phase acceptance/merge changed which phase is current, active, or
  blocked in live authority;
- whether entrypoint or command flow changed;
- whether procedure contracts changed;
- whether future-phase boundaries changed;
- whether README, AGENTS, Human Operator Manual, SELF_HOSTING docs, prompts,
  skills, and output formats still match current project truth;
- whether stale docs were updated, removed, or explicitly marked;
- whether `TASK.md`, roadmap active/current wording, and immediate downstream
  task status lines were advanced together when the accepted phase changed;
- whether advisory sources were recorded.

Required closeout outcomes:

- `CLOSEOUT_ACCEPTED`
- `CLOSEOUT_ACCEPTED_WITH_DOC_FOLLOWUP`
- `CLOSEOUT_BLOCKED_READINESS`
- `CLOSEOUT_BLOCKED_SOURCE_OF_TRUTH_STALE`

## Review intensity tiers

Use these tiers to decide which review procedures are required:

```text
standard:
  task-intake
  draft-plan
  plan-review
  implementation-review
  verification-review
  phase-closeout-review

high:
  architecture-review
  db-storage-review
  delivery-facts-review
  docs-consistency-review

extra-high:
  architecture-review
  db-storage-review
  delivery-facts-review
  harness-audit
```

Tier guidance:

- `standard`: ordinary small implementation tasks
- `high`: storage, lifecycle, security, release, hooks, or architecture tasks
- `extra-high`: authority-model changes, deletion or retention changes,
  release/security boundary changes, or work likely to affect later phases

Global reviewer posture:

- planning and review must prefer the smallest correct implementation over
  generic abstraction;
- reviewers must reject evidence-free confidence and future-phase leakage;
- authoritative docs/prompt/skill/task consistency is part of workflow
  readiness, not optional cleanup.
- high/extra-high review work must name the applicable tier controls in the
  review output.

## Procedure-to-packet linkage

Phase 24 packet generation remains out of scope in Phase 23.6, but later packet
manifests must identify the procedure contract used to select and interpret
evidence:

```text
planner packet:
  feature-decomposition
  task-intake
  task-prompt-writer
  draft-plan

plan-review packet:
  plan-review
  plan-amend
  architecture-review when high or extra-high

implementation-review packet:
  implementation-review
  fix-pass-review
  verification-review

closeout-review packet:
  delivery-facts-review
  phase-closeout-review

DB/storage-review packet:
  db-storage-review

docs-consistency packet:
  docs-consistency-review
```

## Operator notes

- `skills/self-hosting/**` is the canonical product-source location for these
  procedures.
- `skills/self-hosting/procedure-registry.json` is the checked-in derived
  registry for these procedures. It must point back to the canonical files and
  must not replace them as authority.
- `.agents/skills/**` and `$HOME/.agents/skills/**` are optional discovery or
  install targets only.
- Prompt wrappers under `prompts/self-hosting/<procedure-id>.md` are required
  derived invocation helpers for manual procedure replay and are not authority.
- Generated product prompts from `node bin/ch prompt ...` are task-local
  generated artifacts and do not replace checked-in self-hosting procedure
  wrappers.
