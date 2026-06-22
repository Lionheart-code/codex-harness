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

This phase also owns the future productized materialization path for moving
from a recorded next-task decision into a new active task cycle. That path must
activate the next task, start the new run, and create the new branch/worktree
through formal product commands or equivalent documented runtime surfaces.

## Problem

Self-hosting procedures can produce valid files or evidence artifacts, while
operator routing reads runtime run-state. If later runtime commands load stale
whole-run snapshots and persist the entire run object, valid slices such as
`review_results`, `approvals`, `steps`, or unrelated evidence can regress.

That is a run-state mutation model failure, not a workflow logic failure.

## Scope

Required behavior:

- Add `run record-procedure --procedure <id> --file <path>` or equivalent.
- Add `run approve-plan --run <id> ...` or equivalent.
- Validate procedure IDs through `skills/self-hosting/procedure-registry.json`.
- Ingest `plan-review`, `plan-amend`, `implementation-review`,
  `verification-review`, and plan approval.
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
  surface for start-of-new-cycle materialization:
  activate next task, start the new run, and create the branch/worktree.
- Enforce that the new branch/worktree belongs to the new active task and not
  to the old closing or harvested run.
- Post-merge delivery evidence is explicit: implementation must either require
  merge evidence before harvest or provide a typed append-only post-harvest
  delivery update path that records the merge fact without reopening,
  re-harvesting, or mutating unrelated run state.
- Compatibility `run.json` is regenerated from staging DB and never becomes
  manual repair authority.
- Operator `next_allowed_action` values that require durable state must map to
  product commands or documented ingestion paths.

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

- Prepares Phase 23.8.7 and Phase 23.9 by making procedure/stage inputs
  durable and monotonic.
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
npm run test:acceptance
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
- Merge results and merge commits can be recorded through a product command or
  documented ingestion path, including the chosen pre-harvest or post-harvest
  semantics.
- A recorded next-task decision can be materialized only by the formal
  new-cycle command path or documented runtime surface.
- Materialization preserves one task = one branch = one worktree and does not
  attribute the new branch/worktree to the old closing or harvested run.
- No packet automation, runner execution, proof generation, report generation,
  or access API is introduced.
