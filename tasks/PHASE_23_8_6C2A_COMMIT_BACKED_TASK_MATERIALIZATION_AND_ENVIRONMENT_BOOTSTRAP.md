# Phase 23.8.6C2A - Commit-Backed Task Materialization and Environment Bootstrap

## Status

Active implementation phase. Phase 23.8.6C2 Bootstrap Authority Correctness is
complete, reviewed, accepted, and merged.

## Purpose

Make a recorded next-task decision become an active task only through a
commit-backed branch/worktree activation that is reproducibly ready to run the
checked-in Harness commands and procedures.

## Problem

The current reviewed `run materialize-next-task` path writes `TASK.md`, then
starts a new run before the required activation commit and clean-git check. It
therefore creates provisional lifecycle state that the operator manual says
must not be authoritative. It also uses raw Git worktree creation only: a
new checkout can lack installed dependencies or build output even when a Codex
Desktop local environment would normally prepare them.

Tracked procedure files arrive with Git, but dependency folders, generated
build output, local environment configuration, and ignored files do not. The
product must distinguish safe reproducible setup from copying private local
state.

## Scope

This phase owns the bounded transition from an already validated
`NextTaskDecisionRecord` to a clean, commit-backed, runnable task context. It
may repair `run materialize-next-task`, `run start --task`, the existing
worktree CLI surface or an equivalent narrow bootstrap surface, task activation
documentation, and focused deterministic tests.

## Required behavior

- Preserve the existing exact next-task decision and base-commit validation
  from Phase 23.8.6C2.
- Make `run materialize-next-task` prepare a branch/worktree only. It may
  create the worktree or enter an existing one, write the next `TASK.md`, and
  persist the already authorized task base where the installed-target path
  owns that state, but it must not start a runtime run.
- Treat an entered existing worktree as a first-class path for a Codex Desktop
  managed worktree. Verify the requested branch, registered worktree, exact
  decision base, task pointer, and clean Git state; do not recreate a worktree
  that Codex Desktop already created.
- Keep a newly created task worktree at the immutable recorded decision base
  until its activation commit. A different, moved, dirty, unresolved, or
  unrelated checkout must fail closed.
- Add a deterministic, repo-owned worktree bootstrap-and-verify path under the
  existing worktree command or an equivalently narrow command. It must install
  dependencies from the committed lockfile and run the declared build/setup
  steps needed by this repository before it reports ready.
- The bootstrap path must verify that the checked-in Harness entrypoint,
  `AGENTS.md`, procedure registry, skill surfaces, and prompt wrappers are
  present and readable. Those tracked procedure files are provided by Git; the
  bootstrap must verify them, not copy substitutes.
- Codex Desktop local-environment setup remains an allowed preferred creator
  path. Its successful setup may satisfy the same deterministic readiness
  checks, but Harness must not rely on a Desktop-only UI choice to claim that a
  worktree is ready.
- Do not copy, serialize, or infer ignored private state. In particular, do
  not copy `.env*`, credentials, `.codex/**`, `.harness/**`, `node_modules`,
  or generated output from another checkout. Inherited process environment is
  allowed. If an operator needs ignored local files in a Codex-managed
  worktree, the operator must opt in through Codex Desktop's documented
  `.worktreeinclude` mechanism; this phase must not create such an opt-in for
  the operator.
- Require the complete task activation authority change—at least `TASK.md`,
  task contract, roadmap/operations ordering, and any live policy surface
  affected by the inserted task—to be the first commit in the new task branch
  or worktree. Require clean Git after that commit.
- Make `run start --task` fail closed before durable run creation unless that
  committed activation can be proven. The check must prove the active task
  pointer and task contract are committed after the materialization base; a
  current `HEAD` snapshot, uncommitted diff, or source snapshot is not an
  activation substitute.
- Preserve dry-run non-mutation, current historical task/run readability, and
  exactly-one operator action or typed blocker.
- Cover both Harness-created and entered-existing worktree fixtures. The
  entered-existing fixture may model a Codex Desktop worktree with ordinary
  Git; tests must not require the Desktop app itself.

## Non-goals

- No database migration, SQLite payload storage, generalized procedure
  packets, or Phase 23.8.6D payload work.
- No new persisted task-state representation beyond the optional
  `TaskState.base_commit_sha` already authorized and delivered in C2.
- No automatic commit, auto-merge, branch deletion, runner execution,
  provider/model selection, routing, or background watcher.
- No secret discovery, secret copying, `.worktreeinclude` generation, or
  transfer of ignored local configuration between worktrees.
- No generalized stage packet/result contracts; those remain Phase 23.8.7.

## Likely implementation surfaces

- `src/core/runtime.ts`
- `src/cli/run.ts`
- `src/core/worktree.ts`
- `src/cli/worktree.ts`
- a narrow repository-owned bootstrap script only if required by the existing
  package/build contract
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/OPERATIONS_PLAN.md`
- `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`
- focused materialization, bootstrap, and task-authority acceptance tests

## Acceptance commands

```bash
npm run build
node --test tests/acceptance/phase23-8-6-procedure-ingestion.test.mjs
node --test tests/acceptance/phase23-8-6c2a-task-materialization-environment-bootstrap.test.mjs
npm test
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --operator --dry-run
git diff --check
```

## Acceptance behavior

- Materialization never starts a new run before the activation commit.
- A run start with only an uncommitted or pre-activation task pointer fails
  before durable run state is created and emits one current-phase typed issue
  with one matching repair packet.
- A clean, post-base, committed activation starts normally and preserves the
  recorded base authority.
- An existing Codex-style worktree can be entered and verified without raw
  worktree recreation, while a mismatched, dirty, moved, or unrelated one
  fails closed.
- The deterministic bootstrap reports ready only after dependency/build setup
  and tracked Harness/procedure verification succeed. It does not copy ignored
  private state or cached dependency/build directories from another checkout.
- Missing lockfile/setup prerequisites, failed setup, or missing tracked
  procedure surfaces fail closed with actionable output and no run creation.
- Dry-run creates no worktree, task-state, run, artifact, evidence, or
  database mutation.
- No storage payload feature, database migration, secret transfer, generalized
  packet, provider routing, or runner behavior is introduced.

## Review requirements

- Treat this task-transition and environment-boundary change as `extra-high`.
- Require the task-owned C1A role sequence through the operator contract:
  - pre-implementation `plan-review`: Sol High;
  - post-implementation `implementation-review`: Terra High;
  - post-implementation combined architecture/authority and db-storage
    conclusion: Sol High, with two separately labeled verdicts;
  - deterministic-first verification, delivery-facts, and closeout review;
  - Terra Medium for docs-consistency, `harness-audit`, or any semantic
    follow-up after a deterministic-first gate.
- Require one independent read-only combined architecture and db-storage
  review after implementation. It must return two separately labeled verdicts:
  architecture/authority and persisted-storage/no-storage-change. A single
  reviewer may supply both verdicts; the combined review must not hide either
  conclusion.
- Run phase-closeout review last.

## Relationship to previous and next phases

- Follows C2's truthful task/base authority and corrects only the remaining
  materialization-before-run and runnable-worktree gap.
- Precedes Phase 23.8.6D so durable procedure storage receives only
  commit-backed, environment-ready task provenance.
- Precedes Phase 23.8.6E and Phase 23.8.7 without implementing freshness or
  packet automation.

## Final report expectations

The implementation report must state:

- how the new run is prevented before a clean activation commit;
- how Harness-created and Codex-managed existing worktrees are handled;
- which deterministic setup and tracked-procedure checks prove readiness;
- why ignored local files and secrets were not copied;
- the architecture and db-storage/no-storage-change verdicts;
- verification results and confirmation that no runner, packet, or payload
  storage behavior was added.
