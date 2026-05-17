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
- no forbidden files created;
- no hidden upgrade/migration occurred.

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


## Windows/macOS/Linux note

Some documentation examples may use Bash syntax.

Product acceptance and regression tests should move toward cross-platform Node scripts so the harness works on Windows, macOS, and Linux without requiring WSL or Git Bash.
