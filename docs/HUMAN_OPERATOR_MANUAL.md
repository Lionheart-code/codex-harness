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
6. Run the active task acceptance commands.
7. Review the diff against task scope and non-goals.
8. Commit only after review, verification, and closeout prerequisites are
   satisfied.

The installed target workflow remains separate:

```text
init / worktree / prompt / context inspect / review / check / report
```

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
skills/self-hosting/**
```

Check:

- `skills/self-hosting/**` is the canonical source-of-truth;
- `.agents/skills/**` and `$HOME/.agents/skills/**` are discovery or install
  targets only;
- the source map, workflow, policy, and discovery docs agree with the active
  task and current repo boundary;
- prompts remain optional helpers and not the authority source;
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

Only after commit:

1. edit `TASK.md`;
2. point to next phase task file;
3. commit task pointer change if desired;
4. start fresh `/plan`.

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
