# Phase 23.8.6C2 - Bootstrap Authority Correctness

## Status

Complete, reviewed, accepted, and merged. Phase 23.8.6C2A owns the remaining
commit-backed task-materialization and environment-bootstrap correction before
Phase 23.8.6D may begin.

## Purpose

Make the existing Phase 23.8.6C bootstrap fail closed when task, checkout,
base-commit, or persisted current-bootstrap authority cannot be proven.

## Problem

Phase 23.8.6C established the minimum self-hosting bootstrap and operator
handoff, but four bounded correctness gaps remain:

- `TASK.md` can reference a missing task file while task resolution falls back
  to the pointer document instead of rejecting the missing authority;
- when several installed task records exist and none matches the current
  branch or worktree, selection can return no task and no ambiguity blocker;
- the emitted `base_commit` fact can be the current source snapshot/HEAD rather
  than the task base commit or a configured-upstream merge-base; and
- persisted bootstrap facts, handoff, `RunIssue`, and `RepairPacket` values are
  checked as containers but not validated deeply on readback.

## Scope

This phase owns correctness hardening for the existing `run start --task` and
`run status --operator` bootstrap path. It may tighten current bootstrap types,
git fact probing, parsing, issue routing, and focused tests. It may add the
backward-compatible optional `TaskState.base_commit_sha` JSON field solely for
task materialization authority. It must not create a broader orchestrator
command or the normalized stage packet/result layer.

## Required behavior

- Reject a `TASK.md` reference when the referenced task file is absent, not a
  regular file, outside the target root, or unreadable.
- Fail before creating durable run state when the active task reference itself
  cannot be resolved safely.
- When multiple installed task records exist, require exactly one record to
  match the current worktree or branch. If no record matches, emit a typed
  blocking `RunIssue` and matching `RepairPacket` rather than proceeding with
  no selected task authority.
- Preserve the existing single-task compatibility path, but keep its recorded
  worktree and branch mismatch checks fail-closed.
- Keep worktree match higher priority than branch match and fail closed on
  duplicate worktree or branch matches.
- Treat `TaskState.base_commit_sha`, when non-empty, as the immutable commit
  from which the recorded task branch/worktree was materially created.
- Persist the already validated `NextTaskDecisionRecord.base_commit_sha` into
  the uniquely owning installed `TaskState` on the reviewed materialization
  path. A legacy task-worktree creation path may record the exact source `HEAD`
  from which that new worktree was created.
- Never silently replace a recorded non-empty `base_commit_sha` during normal
  task or run operations. Historical task states without the optional field
  remain readable.
- Separate current source snapshot/HEAD from base-commit authority.
- Resolve the bootstrap base fact in this order:
  1. an exact matching installed task materialization record with a valid
     immutable `base_commit_sha`, when available;
  2. the merge-base between `HEAD` and the branch's configured upstream;
  3. otherwise a typed blocking missing-base-authority issue.
- Never guess `main`, `origin/main`, or another default branch when no
  configured or task-owned base authority exists.
- Validate that the resolved base commit exists and is an ancestor of `HEAD`.
  A missing, malformed, moved, unrelated, or unresolvable base must block
  bootstrap.
- Emit distinct, truthful facts for the current source snapshot and the
  resolved base commit or merge-base, including a source that identifies
  `task_state` or `git_merge_base` authority.
- Deep-validate persisted current-bootstrap records on every authoritative
  readback:
  - bootstrap facts have supported labels/sources, unique IDs and labels, and
    non-empty values;
  - worker handoff has a supported kind, bounded non-empty prompt, and valid
    procedure/action fields for that kind;
  - each `RunIssue` uses the current Phase 23.8.6C issue/status/route/source
    contract, valid IDs, non-empty summaries, and blocking semantics;
  - each `RepairPacket` uses the current Phase 23.8.6C route contract, valid
    IDs, non-empty action/prompt fields, and references only known issue IDs.
- Reject malformed or cross-linked current-bootstrap records instead of
  shallow-casting them into trusted run state.
- Keep `RunIssue` and `RepairPacket` current-phase-specific. Do not normalize
  them into generalized stage packet/result contracts in this phase.
- Preserve dry-run non-mutation and exactly-one-next-action behavior.
- Preserve historical task/run accumulation when one exact live authority
  match exists.

## Non-goals

- No new broad orchestrator or workflow command.
- No `StagePacket`, `StageResult`, generalized `RunIssue`, generalized
  `RepairPacket`, or waiver machinery; those belong to Phase 23.8.7.
- No durable procedure artifact payload storage, project-memory migration, or
  exact plan/evidence payload binding; those belong to Phase 23.8.6D.
- No authority-document freshness sweep; that belongs to Phase 23.8.6E.
- No external runner launch, provider/model selection, auto-commit,
  auto-merge, PR repair, or CI repair; those belong to Phase 31.
- No generalized context core/manifest, route intent, model selection, or
  routing policy implementation. Preserve only explicit task, worktree,
  source, base, and current-bootstrap authority facts needed by later phases.
- No database schema or migration change. The only authorized persisted
  representation change is the optional backward-compatible
  `TaskState.base_commit_sha` JSON field described above; it is not Phase
  23.8.6D procedure-payload storage.
- No hidden default-branch assumption.

## Likely implementation surfaces

- `src/core/runtime.ts`
- `src/core/lifecycle-types.ts`
- `src/core/tasks.ts` for the optional `base_commit_sha` parser/type and the
  reviewed materialization writer only
- `src/core/git.ts` only if a reusable merge-base/ancestor probe is needed
- `src/cli/run.ts` only if output must distinguish source snapshot from base
  authority
- `tests/acceptance/phase23-8-6c-bootstrap-entrypoint.test.mjs`
- focused adjacent runtime parsing tests only when required

## Acceptance commands

```bash
npm run build
node --test tests/acceptance/phase23-8-6c-bootstrap-entrypoint.test.mjs
npm test
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --operator --dry-run
git diff --check
```

## Acceptance behavior

- Missing or unreadable referenced task authority fails before durable run
  creation in both preview and real start paths.
- Multiple historical installed task records remain usable when one exact
  branch/worktree match exists.
- Multiple installed task records with no live checkout match produce a typed
  blocking issue and repair packet.
- Duplicate branch/worktree matches remain fail-closed.
- A task materialization base commit is preferred when present and valid.
- The reviewed materialization path persists its validated decision base into
  the uniquely owning task state and never silently overwrites a non-empty
  recorded value; legacy task states without the optional field remain valid.
- Otherwise a configured-upstream merge-base is emitted as the base fact and
  remains distinct from the current source snapshot/HEAD.
- Missing, moved, unrelated, or unresolvable base authority blocks bootstrap;
  no default branch is guessed.
- Malformed bootstrap facts, handoff, issues, repair packets, or issue/packet
  links fail closed on readback.
- Existing canonical Phase 23.8.6C bootstrap records still load and progress.
- Dry-run writes no run, artifact, evidence, or database state.
- Operator status still exposes one next procedure/action or one typed
  blocker, never competing actions.
- No generalized stage packet/result, durable payload storage, external
  runner, provider routing, or Phase 31 behavior is introduced.

## Review requirements

- Treat this runtime-authority fix as `extra-high` review tier.
- Require implementation review and architecture review.
- Require db-storage review because `TaskState.base_commit_sha` changes the
  persisted task-state representation. This review does not widen into Phase
  23.8.6D storage work.
- Require verification review, delivery-facts review, harness audit, and final
  phase-closeout review through the operator contract.
- Run phase-closeout review last.

## Relationship to previous and next phases

- Follows the Phase 23.8.6C minimum bootstrap, C1 audit/task-contract rebase,
  and C1A routing/context/model-policy authority rebase.
- Precedes Phase 23.8.6C2A, which makes the recorded materialization path
  commit-backed and environment-ready without widening storage authority.
- Precedes Phase 23.8.6D so durable procedure storage is built on truthful
  task, checkout, source-snapshot, base, and materialization authority.
- Precedes Phase 23.8.6E authority freshness and Phase 23.8.7 normalized stage
  packet/result contracts.
- Preserves Phase 30 experimentation and Phase 31 reviewed runner execution as
  later, separate work.

## Final report expectations

The implementation report must state:

- how task references and installed-task authority fail closed;
- how source snapshot and base authority are resolved and distinguished;
- which current-bootstrap records are deep-validated;
- deterministic and independent review results;
- whether any storage representation changed and why;
- confirmation that no generalized packet or runner behavior was added.
