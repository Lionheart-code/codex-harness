# Human Operator Manual

## Purpose

This document explains how a human operator should use `codex-harness` safely.

## Current build process for the harness itself

1. Read `TASK.md` and the task it references.
2. Inspect the current repo state before implementation.
3. Dry-run the current product self-hosting entrypoint:
   `node bin/ch run start --task TASK.md --dry-run`.
4. Use `node bin/ch run status --operator --dry-run` to confirm the current
   operator-visible stage, required evidence, and next procedure.
5. Continue with manual procedure execution through the documented
   self-hosting procedures; prompts are helpers, not the authority source.
   Phase 23.8.6 adds limited product ingestion for durable pre-implementation
   procedure state:
   `node bin/ch run record-procedure --run <run-id> --procedure plan-review|plan-amend|implementation-review|verification-review --file <path>`
   and
   `node bin/ch run approve-plan --run <run-id> --plan <path> --approver <name>`.
   For next-cycle continuity in the same phase, use
   `node bin/ch run record-next-task --run <run-id> --task <path> --base-commit <sha> --file <path> [--base-ref <ref>]`
   and then
   `node bin/ch run materialize-next-task --run <run-id> --decision-id <id> --task <path> --branch <name> --worktree <path> (--create|--enter-existing)`.
   Earlier procedures such as `task-intake`, `task-prompt-writer`, and
   `draft-plan` remain manual transcript artifacts unless a later reviewed task
   expands durable ingestion. The operator must not patch
   `.harness/runs/**/run.json` to simulate ingestion.
6. Run the active task acceptance commands.
   For the current self-hosting flow, `node bin/ch run verify --run <run-id>`
   can take 14 minutes or more as the suite grows. Wait for real exit and do
   not start a second verification run while the first is still active.
7. Review the diff against task scope and non-goals.
8. Commit only after review, verification, and closeout prerequisites are
   satisfied.

A closing or harvested run may record which task should come next. It does not
own the new task branch/worktree. The next cycle starts only when `TASK.md` is
activated in that task's own branch/worktree and a new run is opened there.
Phase 23.8.6 now provides a formal product path for this:
record the next-task decision, materialize the new task branch/worktree, then
let `materialize-next-task` write the new `TASK.md` pointer there and start the
new run.
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
For example:

```bash
cd <task-worktree>
codex -C "$PWD" --sandbox read-only --ask-for-approval never
```

The prompt pasted into that session should use the checked-in
`prompts/self-hosting/<procedure-id>.md` wrapper. That wrapper is derived from the
active `skills/self-hosting/<procedure>/` contract and its output format, not
from a chat-local rewrite. The reviewer pass may inspect files and report
findings; it must not implement, mutate runtime state, or claim a durable
decision unless a current product command or documented ingestion path records
that decision.

Manual model/reasoning guidance for the current self-hosting replay flow is
advisory operator guidance only:

- bounded synthesis/normalization passes such as `task-intake` and
  `task-prompt-writer` may use a lower-cost profile such as `gpt-5.4-mini`
  when the procedure stays narrow and well-specified;
- hard planning passes such as `draft-plan` and broad decomposition should use
  a stronger planning profile such as `gpt-5.4` with `extra high` reasoning;
- implementation or builder passes may use a stronger builder profile matched
  to task complexity; `gpt-5.4` with `high` reasoning is the default manual
  implementation profile, while more difficult cross-cutting work may escalate
  to `extra high`;
- review passes such as `plan-review`, `implementation-review`,
  `fix-pass-review`, and `verification-review` should run in a separate
  reviewer session and should use a different reviewer model/profile than the
  planning or builder pass they are checking; `gpt-5.5` with `high` reasoning
  is the default reviewer profile;
- `gpt-5.5` with `extra high` reasoning is an escalation profile only for
  ambiguous architecture, disputed findings, repeated failed fix passes, or
  source-trace deadlocks. It is not the default daily review setting.

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
3. confirm the new task worktree and active `TASK.md` pointer are correct;
4. continue from the new run already opened in that task worktree;
5. commit the task pointer/materialization change if desired;
6. start fresh `/plan`.

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
