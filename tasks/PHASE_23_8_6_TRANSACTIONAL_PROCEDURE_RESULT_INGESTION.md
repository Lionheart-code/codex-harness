# Phase 23.8.6 - Transactional Procedure Result Ingestion and Slice-Isolated Run Mutations

## Status

Planned. Starts only after Phase 23.8.5 Automation Roadmap and Task Authority
Rebase is complete, reviewed, and accepted.

## Purpose

Make run-state mutation reliable before stage packet automation, proof,
reports, or access surfaces depend on it.

The product must provide formal procedure-aware ingestion paths and
slice-isolated mutations so a command that records one kind of result cannot
remove unrelated run-state.

It must also make authoritative procedure progression and run identity exact:
`plan-review` cannot be reconstructed from loosely paired artifacts, and a
display `run_id` cannot stand in for immutable run-instance identity across
allocation, harvest, retries, or compatibility projections.

This phase also owns the future productized materialization path for moving
from a recorded next-task decision into a new active task cycle. That path must
preserve the new task context: create or enter the new branch/worktree,
activate the next task there, and start the new run in that task worktree,
through formal product commands or equivalent documented runtime surfaces.

## Problem

Self-hosting procedures can produce valid files or evidence artifacts, while
operator routing reads runtime run-state. If later runtime commands load stale
whole-run snapshots and persist the entire run object, valid slices such as
`review_results`, `approvals`, `steps`, or unrelated evidence can regress.

That is a run-state mutation model failure, not a workflow logic failure.

The same failure class appears in two forms that this phase must close:

- `plan-review` progression can require multiple coupled artifacts, but those
  artifacts are not yet owned as one transactional product result.
- run identity is currently easy to treat as worktree-local display state even
  when harvest and accepted/project memory operate at wider project scope.

## Scope

Required behavior:

- Add `run record-procedure --procedure <id> --file <path>` or equivalent.
- Add `run approve-plan --run <id> ...` or equivalent.
- Validate procedure IDs through `skills/self-hosting/procedure-registry.json`.
- Ingest `plan-review`, `plan-amend`, `implementation-review`,
  `verification-review`, and plan approval.
- `plan-review` ingestion must be one transactional all-or-nothing product
  result tied to the reviewed plan artifact. That atomic unit must include the
  typed review outcome, reviewed-plan identity, and either an embedded
  immutable decision record or an exact immutable decision-record reference
  validated within the same transaction, plus a shared procedure-result
  identity.
- `plan-amend` separately establishes the later effective amended-plan
  identity. `plan-review` ingestion must not blur the reviewed plan artifact
  with the post-amend effective plan.
- Each mutation updates only its own state slice.
- `run verify` appends verification state but cannot remove review, approval,
  steps, or unrelated evidence.
- `remote-status`, `closeout`, and `mark-discardable` preserve unrelated
  slices.
- Delivery-fact ingestion covers PR, remote CI/check, review, `merge` result,
  merge commit, and closeout approval facts without manual `run.json` repair.
- End-of-old-cycle ingestion may record the decided next task as a closeout or
  harvest fact, but it must not create, claim, or mutate the next task
  branch/worktree.
- Add a formal product command sequence or equivalent documented runtime
  surface for start-of-new-cycle materialization that preserves the new task
  context:
  create or enter the branch/worktree, activate next task there, and start the
  new run in that task worktree.
- That productized materialization path must own branch/worktree creation
  directly instead of assuming an undocumented pre-created branch context.
- Even if the implementation uses separate git primitives underneath, the
  product surface must treat branch attachment and worktree creation as one
  logical materialization step for the new task.
- Enforce that the new branch/worktree belongs to the new active task and not
  to the old closing or harvested run.
- Post-merge delivery evidence is explicit: implementation must either require
  merge evidence before harvest or provide a typed append-only post-harvest
  delivery update path that records the merge fact without reopening,
  re-harvesting, or mutating unrelated run state.
- Immutable run-instance identity is required across allocation, harvest,
  accepted/project readback, idempotent retry, and compatibility `run.json`
  regeneration. The exact identifier format is an implementation choice, but
  those observable identity invariants are mandatory.
- Legacy or ambiguous records that do not carry exact immutable run-instance
  identity must fail closed. They cannot authorize mutation or progression and
  must produce a typed migration/blocker result until resolved.
- Harvest must distinguish same-instance idempotent retry from
  different-instance collision on the same display `run_id`. A
  different-instance collision must return a typed blocker/conflict result and
  must not mutate current staging state.
- Accepted/project readback must not act as implicit repair authority without
  exact immutable run-instance identity match across the authoritative readback
  path.
- Compatibility `run.json` is regenerated from staging DB and never becomes
  manual repair authority.
- Operator `next_allowed_action` values that require durable state must map to
  product commands or documented ingestion paths.
- Preserve room for the later adjacent task contracts without pre-implementing
  them here:
  - Phase 23.8.6B2 owns verification-command rationalization and duplicate
    full-pack proof serialization policy;
  - Phase 23.8.6C owns the self-hosting operator bootstrap entrypoint;
  - Phase 23.8.6D owns SQL-backed procedure artifact payload storage and
    worktree-retention durability;
  - Phase 23.8.6E owns authority-surface freshness and downstream task
    revalidation.

## Non-goals

- No packet automation.
- No runner execution.
- No proof generation.
- No report generation.
- No access API.
- No MCP.
- No provider adapter.
- No domain pack.
- No generic workflow engine.
- No background runner.
- No automatic next-task implementation.
- No raw DB API exposed to agents.
- No domain data ingestion path.

## Future-phase impact check

- Prepares Phase 23.8.6A, Phase 23.8.6B, Phase 23.8.6B2, Phase 23.8.6C, Phase
  23.8.6D, Phase 23.8.6E, Phase 23.8.7, and Phase 23.9 by making
  procedure/stage inputs durable and monotonic.
- Must not pre-implement packet automation, runner execution, proof records,
  reports, access APIs, domain packs, or experimentation.
- Preserves the domain/core boundary by only hardening generic run/procedure
  state, not domain-specific procedures or schemas.
- Requires architecture review if slice ingestion becomes a general workflow
  engine, background runner, raw DB API, external connector surface, or domain
  data ingestion path.

## Acceptance commands

```bash
npm run build
npm test
git diff --check
```

## Acceptance behavior

- Re-running `run verify` preserves existing `review_results`, `approvals`,
  `steps`, and unrelated evidence.
- Procedure outcomes are recorded without editing `run.json`.
- Operator progression is monotonic when procedure outcomes are recorded in
  order.
- Staging DB and `run.json` do not diverge under normal use.
- A self-hosting run can progress from plan-review through verification-review
  without manual state reconstruction.
- `plan-review` ingestion is atomic: partial write, mismatched reviewed-plan
  identity, mismatched decision record/reference, or ambiguous retry fails
  closed instead of producing a partially authoritative result.
- A retry of the same `plan-review` ingestion follows explicit idempotent
  semantics rather than silently producing duplicate coupled artifacts.
- Merge results and merge commits can be recorded through a product command or
  documented ingestion path, including the chosen pre-harvest or post-harvest
  semantics.
- Two worktrees can create the same display `run_id` without confusing project
  memory authority because the immutable run-instance identities remain
  distinct and authoritative matching stays collision-safe.
- Harvest retry of the same immutable run instance is idempotent, while a
  different-instance collision on the same display `run_id` returns a typed
  blocker/conflict result and leaves current staging state unchanged.
- Accepted/project readback and compatibility `run.json` regeneration reject
  mismatched immutable run-instance identity rather than repairing or replacing
  a newer staging run.
- Identity-less or ambiguous legacy records fail closed with a typed
  migration/blocker result until an exact authoritative identity path exists.
- A recorded next-task decision can be materialized only by the formal
  new-cycle command path or documented runtime surface.
- Materialization preserves one task = one branch = one worktree and does not
  attribute the new branch/worktree to the old closing or harvested run.
- If a full-pack acceptance proof is required during implementation, `npm test`
  is the canonical command. `npm run test:acceptance` remains only a
  compatibility alias to the same acceptance runner and must not be treated as
  separate proof or launched concurrently with `npm test` in the same
  workspace/runtime context.
- No packet automation, runner execution, proof generation, report generation,
  or access API is introduced.
