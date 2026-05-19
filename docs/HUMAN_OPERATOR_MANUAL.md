# Human Operator Manual

## Purpose

This document explains how a human operator should use `codex-harness` safely.

## Current build process for the harness itself

1. Create `codex-harness` repository.
2. Copy master-plan package.
3. Commit baseline.
4. Run `/plan` for Phase 0.
5. If clean, commit Phase 0.
6. Update `TASK.md` to Phase 1.
7. Run `/plan` for Phase 1.
8. Implement only current task.
9. Run acceptance.
10. Review diff.
11. Commit.
12. Move to next phase.

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
