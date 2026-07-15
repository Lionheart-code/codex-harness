# Human Operator Manual

## Purpose

This document explains how a human operator should use `codex-harness` safely.

## Current build process for the harness itself

1. Read `TASK.md` and the task it references.
2. Inspect the current repo state before implementation.
3. Before starting a newly inserted phase, update its task file, `TASK.md`,
   roadmap/operations ordering, and every required live authority surface as
   one coherent activation change. Commit that activation and verify clean git.
4. Dry-run the current product self-hosting entrypoint:
   `node bin/ch run start --task TASK.md --dry-run`.
5. Use `node bin/ch run status --operator --dry-run` to confirm the current
   operator-visible stage, required evidence, and next procedure.
6. Continue with manual procedure execution through the documented
   self-hosting procedures; prompts are helpers, not the authority source.
   Phase 23.8.6 and 23.8.6A provide command-backed replay and re-ingestion for
   the current active-chain procedure surfaces:
   `node bin/ch run record-procedure --run <run-id> --procedure task-intake|task-prompt-writer|draft-plan|plan-review|plan-amend|architecture-review|db-storage-review|implementation-review|fix-pass-review|verification-review|delivery-facts-review|phase-closeout-review --file <path>`
   and
  `node bin/ch run approve-plan --run <run-id> --plan <path> --approver <name>`. For
   C2A, after implementation review and before verification, obtain one
   independent read-only combined review with separately labeled
   architecture/authority and persisted-storage/no-storage-change verdicts;
   record that same artifact under both `architecture-review` and
   `db-storage-review`. A failed verdict routes to `fix-pass-review`, followed
   by a fresh combined review before verification can continue.
   For next-cycle continuity in the same phase, use
   `node bin/ch run record-next-task --run <run-id> --task <path> --base-commit <sha> --file <path> [--base-ref <ref>]`
   and then
   `node bin/ch run materialize-next-task --run <run-id> --decision-id <id> --task <path> --branch <name> --worktree <path> (--create|--enter-existing)`.
   That command path prepares, rather than starts, the new task
   branch/worktree. The next task is never active source authority until the
   new task worktree has a first-commit-backed `TASK.md`, task contract,
   roadmap/operations activation, clean git, and deterministic dependency/build
   plus tracked-procedure readiness verification. Harness materialization also
   requires exactly one installed TaskState to own that worktree or branch, so
   it can persist the immutable recorded base before the successor is started.
   A manual transcript alone still does not satisfy runtime evidence for any of
   those procedures; the operator must record it through the product command.
   Procedures outside the active replay scope, such as
   `feature-decomposition`, `docs-consistency-review`, and `harness-audit`,
   remain manual transcript artifacts unless a later reviewed task expands
   durable ingestion. The operator must not patch
   `.harness/runs/**/run.json` to simulate ingestion.
7. Run the active task acceptance commands.
   For the current self-hosting flow, `node bin/ch run verify --run <run-id>`
   can take 14 minutes or more as the suite grows. Wait for real exit and do
   not start a second verification run while the first is still active.
8. Review the diff against task scope and non-goals.
9. Commit only after review, verification, and closeout prerequisites are
   satisfied.

A closing or harvested run may record which task should come next. It does not
own the new task branch/worktree and it must not edit `TASK.md` for that next
task. The next cycle becomes authoritative only when `TASK.md` is written in
that task's own branch/worktree, the activation/materialization change is
committed there as the first commit, clean git is confirmed, deterministic
dependency/build and tracked-procedure readiness verification passes, and only
then the new run is treated as active task context. Broader self-hosting
bootstrap/orchestrator behavior and later authority-freshness revalidation
remain owned by downstream tasks.
Preserve one task = one branch = one worktree. `run start` by itself still does
not create the new task branch/worktree; that ownership stays on the explicit
`materialize-next-task` step.

The installed target workflow remains separate:

```text
init / worktree / prompt / context inspect / review / check / report
```

The current CLI baseline is the local product command plus the external Codex
CLI when a separate agent pass is needed:

```bash
node bin/ch --help
codex --help
```

Use a separate Codex CLI session, or an equivalent independent agent session,
for reviewer-only passes such as `plan-review` and `implementation-review`.
Follow `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` for the checked-in
review-launch discipline, required probe commands, blocker categories, and
exact artifact paths. For example:

```bash
RUN_ID=<run-id>
codex exec -C "$PWD" -s read-only -m gpt-5.6-sol \
  -c 'model_reasoning_effort="high"' \
  -o ".harness/runs/$RUN_ID/manual/plan-review.md" \
  - < ".harness/runs/$RUN_ID/manual/plan-review-request.md"
```

The prompt pasted into that session should use the checked-in
`prompts/self-hosting/<procedure-id>.md` wrapper. That wrapper is derived from the
active `skills/self-hosting/<procedure>/` contract and its output format, not
from a chat-local rewrite. The reviewer pass may inspect files and report
findings; it must not implement, mutate runtime state, or claim a durable
decision unless a current product command or documented ingestion path records
that decision.

Routine manual review is a transitional operating surface, not the long-term
target model. The intended steady-state direction is deterministic checks
first, then independent read-only reviewer-agent results, typed issue tracking,
and repair-first packets, with owner stop only for configured high-risk
decisions.

Manual model/reasoning guidance for the current self-hosting replay flow is
advisory operator guidance only:

- task, planning, and implementation routes use provider-neutral capability,
  risk, reasoning-floor, context, and independence policy; concrete models are
  provisional bindings rather than lifecycle authority;
- review passes such as `plan-review`, `implementation-review`,
  `fix-pass-review`, and `verification-review` should run in a separate
  reviewer session and should use a different reviewer model/profile than the
  planning or builder pass they are checking; current bindings are
  `plan-review` on `gpt-5.6-sol` with `high` reasoning and
  `implementation-review` on `gpt-5.6-terra` with `high` reasoning;
- docs-consistency and mechanical semantic review use Terra Medium, while
  verification, delivery-facts, and closeout run deterministic-first;
- `xhigh`, `max`, and `ultra` are not defaults and require a separately
  recorded escalation reason. Phase 31 retains generalized routing ownership.

Independent review receives a fresh packet or packet plus read-only retrieval,
not the builder transcript. Cache state and hidden reasoning are not authority.
Budget cannot weaken the route floor or independence requirement.

This guidance does not create provider/model routing, runtime selection logic,
or approval authority. It only helps the operator pick an appropriate manual
CLI profile until later reviewed phases introduce formal execution surfaces.

## When not to press implement

Do not press implement if the plan:

- includes later phases;
- creates forbidden implementation files during Phase 0;
- changes permissions without explanation;
- enables external agents by default;
- uses API/internet as deterministic acceptance;
- creates dashboard/database/swarm early.

## Review checklist

Before commit:

```bash
git status --short --untracked-files=all
git diff --name-only
```

Check:

- scope matches current task;
- acceptance commands passed;
- non-goals respected;
- no forbidden runtime/generated files created;
- top-level `schemas/` and `migrations/` are treated as intentional product-source directories during Phase 19;
- no hidden upgrade/migration occurred.

## Phase 20 operator checks

Before trusting the current security or context posture:

```bash
node bin/ch security doctor
node bin/ch context inspect review
node bin/ch eval
```

Check:

- `security doctor` only reports current posture and does not change
  permission state;
- `context inspect` reports artifact paths and task/worktree context without
  generating prompt files;
- bare `eval` runs deterministic local regression checks only;
- `eval playground ...` remains the separate disposable playground workflow.

## Phase 22.5 runtime checks

Before creating local runtime state in the harness product repository:

```bash
node bin/ch run --help
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --dry-run
node bin/ch run verify --dry-run
node bin/ch run closeout --dry-run
node bin/ch run remote-status --dry-run
```

Check:

- dry-run output says no files were written;
- no `.harness/`, `.codex/`, or `.agents/` directory appears in the product repository;
- closeout is `BLOCKED` when required verification, review, or remote gate status is missing;
- provider-specific remote details remain optional metadata, not required runtime fields.

When using non-dry-run runtime commands, treat `.harness/runs/` as local private state. Do not commit it.

## Phase 23.5 memory/lifecycle checks

Phase 23.5 keeps all generated memory/evidence state local and private, but the authority model changes:

```text
.harness/memory/project.sqlite
.harness/runs/<run-id>/staging.sqlite
.harness/runs/**
.harness/evidence/events.jsonl
.harness/evidence/projection.sqlite
.harness/artifacts/sha256/<prefix>/<hash>
```

Before relying on evidence storage:

```bash
node bin/ch memory --help
node bin/ch memory init --dry-run
node bin/ch memory status
node bin/ch memory project status
node bin/ch memory run status --run <run-id>
node bin/ch memory harvest --help
node bin/ch memory rebuild --dry-run
```

Check:

- dry-run commands say no files were written;
- SQLite adapter status is explicit, and unsupported runtimes fail with an actionable message;
- `.harness/memory/project.sqlite` is the accepted Project Memory authority;
- `.harness/runs/<run-id>/staging.sqlite` is the active run/worktree write target;
- `.harness/evidence/projection.sqlite` and `.harness/evidence/events.jsonl` are audit/replay/compatibility layers, not primary working-memory authority;
- `.harness/artifacts/sha256/` contains only local/private compatibility artifacts.

Local verification reuse is allowed only for exact input-set matches. If source, schema, test, package, CI, command-set, root, base commit, untracked file content, or artifact integrity changes, reuse is stale or missing. Docs/task-only changes may avoid rerunning a source suite only when the declared input set proves the source/schema/test/package/CI inputs did not change.

For self-hosting runs, `node bin/ch run verify` uses the active task file's
`## Acceptance commands` as the primary local command set. Treat
`package.json`, `.github/workflows/ci.yml`, and related package or release
boundary docs as context for extra required checks, not as a replacement for
the task command list.

Local reuse never satisfies remote CI. During implementation, use:

```bash
node bin/ch run closeout --dry-run
node bin/ch run remote-status --dry-run
```

If dry-run closeout is `BLOCKED` because review results, remote CI, or other closeout prerequisites are missing before review, that is expected and not an implementation failure. Do not run non-dry-run `ch run closeout` until review, final verification, commit/push/PR, and remote CI validation are complete.

After closeout, treat `closed` and `harvested` separately. A closed run is not yet safe to delete. Worktree deletion is allowed only after successful harvest, explicit discard with reason, or manual override with recorded reason:

```bash
node bin/ch run mark-discardable --run <run-id> --reason "..."
node bin/ch worktree delete --run <run-id>
node bin/ch worktree delete --run <run-id> --manual-override "..."
```

Local `.codex/**` and `.agents/**` files remain operator/runtime state unless a future reviewed task deliberately promotes a repo-level file there into product source.

## Phase 23.6 self-hosting procedure checks

Phase 23.6 adds repo-owned self-hosting procedures without adding new runtime
commands. Treat these files as product-source operating contracts:

```text
docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md
docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md
docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md
docs/SELF_HOSTING_SKILL_DISCOVERY.md
skills/self-hosting/procedure-registry.json
skills/self-hosting/**
prompts/self-hosting/**
```

Check:

- `skills/self-hosting/**` is the canonical source-of-truth;
- `skills/self-hosting/procedure-registry.json` points back to the canonical
  procedure files and does not replace them as authority;
- `.agents/skills/**` and `$HOME/.agents/skills/**` are discovery or install
  targets only;
- the source map, workflow, policy, and discovery docs agree with the active
  task and current repo boundary;
- `plan-review` preserves a durable decision record in addition to a readable
  review report;
- if review required amendment, there is one effective amended plan for
  approval and implementation instead of manual amendment-chain stitching;
- `prompts/self-hosting/<procedure-id>.md` wrappers exist for each procedure and
  remain derived helpers, not the authority source;
- generated product prompts from `node bin/ch prompt ...` are separate
  task-local artifacts and do not replace checked-in self-hosting wrappers;
- implementation does not introduce Phase 24 packet/runtime behavior, Phase 25
  access/runtime behavior, Phase 26 decomposer/planner execution, or Phase 27
  domain-pack runtime behavior.

## Install and upgrade safety

Before applying an installed-layer update in a target project:

```bash
node bin/ch upgrade --dry-run
node bin/ch doctor --all
```

Check:

- dry-run shows only install-owned changes;
- local project-specific edits are either preserved or explicitly blocked;
- the optional registry output is informational only;
- planned backup paths are visible before apply.

After apply:

- inspect any reported `.codex-harness.bak*` files before deleting them;
- confirm `AGENTS.md` non-managed text still looks correct;
- confirm `.harness/install.json` recorded the latest upgrade result.

## Schema validation and migration safety

Before rewriting legacy governed artifacts in an installed target project:

```bash
node bin/ch schema validate
node bin/ch schema migrate --dry-run
```

Check:

- validation either passes cleanly or reports the exact malformed or unsupported artifact;
- unknown explicit schema versions fail closed instead of being guessed;
- dry-run shows only governed artifact rewrites and planned backup paths;
- installed target repos receive `.harness/schemas/` only; target-root `schemas/` and `migrations/` must not be created.

After apply:

- inspect any reported `.codex-harness.bak*` files before deleting them;
- rerun `node bin/ch schema validate`;
- confirm governance proposal markdown remains the human review artifact and any adjacent `.json` sidecar validates.

## Moving to next phase

Only after commit and closeout/harvest decision:

1. record the next task decision with
   `node bin/ch run record-next-task --run <run-id> --task <path> --base-commit <sha> --file <path> [--base-ref <ref>]`;
2. materialize the new task context with
   `node bin/ch run materialize-next-task --run <run-id> --decision-id <id> --task <path> --branch <name> --worktree <path> (--create|--enter-existing)`;
   for a Codex Desktop worktree, use `--enter-existing` after the Desktop task
   has created its worktree and branch rather than creating a second checkout;
3. confirm the new task worktree, active `TASK.md`, new task contract,
   roadmap/operations order, and required live authority surfaces are coherent;
4. commit the complete activation/materialization authority change as the
   first commit in that new task branch/worktree;
5. verify clean `git status` in that new task context;
6. run `node bin/ch worktree bootstrap` in that worktree. It installs from the
   committed lockfile, builds, and verifies tracked Harness/procedure surfaces.
   Its readiness marker binds that setup to the committed `HEAD`, source tree,
   lockfile, and generated CLI output; those authority and readiness paths may
   not be symbolic links. `--verify` also checks the installed
   dependency tree against the committed lockfile and fails closed when any of
   those facts no longer match. A successor `run start` repeats this
   deterministic bootstrap before it can create durable run state, so a missing
   lockfile, stale dependency/build output, or missing tracked procedure surface
   cannot be bypassed by skipping this operator step.
   A successful Codex Desktop local-environment setup may provide the same
   files, but it must be verified rather than assumed. Do not copy `.env*`,
   credentials, `.codex/**`, `.harness/**`, `node_modules`, or generated output
   from another checkout; use an operator-authored `.worktreeinclude` only when
   ignored files are genuinely required;
7. stop the predecessor task or Goal from writing and explicitly open a fresh
   successor Codex task in the prepared worktree; Harness does not create,
   close, or rebind Codex Desktop tasks or Goals;
8. only then run `node bin/ch run start --task TASK.md` in that task worktree;
9. start fresh `/plan`.

## Emergency rollback

If agent created wrong files:

```bash
git status --short --untracked-files=all
git restore <file>
rm -rf <wrong-untracked-path>
```

Do not continue from a polluted working tree.

If a managed upgrade applied the wrong installed-layer change in a target project:

1. inspect the reported `.codex-harness.bak*` files;
2. restore the affected managed file from its backup;
3. rerun `node bin/ch doctor` and `node bin/ch upgrade --dry-run`;
4. do not continue until the drift is understood.

If a schema migration applied the wrong governed-artifact change in a target project:

1. inspect the reported `.codex-harness.bak*` files;
2. restore the affected governed artifact from its backup;
3. rerun `node bin/ch schema validate` and `node bin/ch schema migrate --dry-run`;
4. do not continue until the schema mismatch is understood.


## Windows/macOS/Linux note

Some documentation examples may use Bash syntax.

Product acceptance and regression tests should move toward cross-platform Node scripts so the harness works on Windows, macOS, and Linux without requiring WSL or Git Bash.
