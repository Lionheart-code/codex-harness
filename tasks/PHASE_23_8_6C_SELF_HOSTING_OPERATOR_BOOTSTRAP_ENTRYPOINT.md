# Phase 23.8.6C - Self-Hosting Operator Bootstrap Entrypoint

## Status

Planned. Starts only after Phase 23.8.6B2 Verification Command
Rationalization and Serialization is complete, reviewed, accepted, and
merged.

## Purpose

Add a narrow command-backed bootstrap/control-plane entrypoint for starting
self-hosting work from an already selected task context.

## Problem

Self-hosting startup still relies on operators manually reconstructing task,
branch, worktree, base-commit, and run-identity facts before the next
procedure can begin. That leaves room for drift between current repo state,
task authority, and reported operator state.

## Scope

This phase owns only the minimal bootstrap/control-plane entrypoint needed to
report trustworthy startup facts and the immediate next procedure.

## Required behavior

- Add a narrow product command or equivalent documented runtime surface that
  bootstraps self-hosting from the current task context.
- Require bootstrap evidence for:
  - active task file;
  - current branch;
  - current worktree root;
  - base commit or reviewed merge-base fact;
  - exact run identity allocation or bootstrap status.
- Report operator status plus the next procedure or next allowed action as
  command output.
- Require task-intake and planning as the immediate next action after bootstrap
  unless a typed blocker stops progression.
- Provide a non-mutating preview or dry-run path before any durable state
  mutation.
- Consume the task already active in the worktree. This phase must not choose a
  different task, silently rewrite `TASK.md`, or backfill authority by chat.
- Preserve one task = one branch = one worktree.

## Non-goals

- No runner execution.
- No review-session automation.
- No provider/model routing.
- No packet execution.
- No domain-pack behavior.
- No broad new-cycle orchestration engine.
- No replacement for the reviewed runtime execution work planned in Phase 31.

## Acceptance commands

```bash
npm run build
npm test
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --operator --dry-run
git diff --check
```

## Acceptance behavior

- Bootstrap output proves the active task, branch, worktree, base-commit fact,
  and run-identity fact without requiring manual `run.json` repair.
- Bootstrap output includes operator status and the immediate next procedure or
  typed blocker.
- The immediate next action after successful bootstrap is task-intake/planning,
  not autonomous execution.
- A dry-run/bootstrap-preview path exists and does not mutate durable state.
- Add or update only the task-local deterministic tests needed to prove the
  bootstrap entrypoint behavior.
- If a full-pack proof is required, use `npm test` as the canonical command and
  treat `npm run test:acceptance` as a compatibility alias only.
- The implementation does not add runner execution, review automation,
  provider/model routing, or packet execution.

## Source/runtime boundary

This phase may add only the narrow CLI/operator/runtime surfaces needed for the
bootstrap entrypoint. It must not change package scripts, CI, domain-pack
behavior, provider/model routing, packet execution, or reviewed runner
execution.

## Relationship to previous and next phases

- Consumes the exact-identity and slice-isolated foundations from Phase 23.8.6,
  the replay/re-ingestion continuity from Phase 23.8.6A, and the verification
  policy from Phase 23.8.6B2.
- Precedes Phase 23.8.6D so bootstrap-created or bootstrap-reported procedure
  state can later rely on durable SQL-backed artifact storage.
- Leaves Phase 30 bounded experimentation and Phase 31 reviewed runner
  execution untouched.

## Final report expectations

The implementation report for this phase must state:

- which bootstrap facts are emitted;
- which command or commands own bootstrap and dry-run behavior;
- whether task-intake/planning is the next action or a typed blocker intervenes;
- verification results;
- any remaining assumptions deferred to later phases.
