# Phase 4 — Worktree

## Goal

Implement one branch/worktree per task.

## Scope

- `ch worktree`;
- branch creation;
- worktree creation;
- write `branch.txt`;
- write `worktree.txt`;
- update `state.json`.

## Required behavior

- one task = one branch = one worktree;
- refuses unsafe dirty source checkout; no dirty-state override is implemented in this phase;
- if the source repository has no valid `HEAD`, fail clearly and instruct the user to create an initial commit first;
- worktree root configurable;
- setup commands are optional.

## Non-goals

No parallel workers.

## Acceptance commands

```bash
npm run build
tmp="$(mktemp -d)"
(
  cd "$tmp" &&
  git init &&
  git config user.email "test@example.com" &&
  git config user.name "Test User" &&
  printf "# test
" > README.md &&
  git add README.md &&
  git commit -m "init" &&
  node "$OLDPWD/bin/ch" install &&
  node "$OLDPWD/bin/ch" init "test task" &&
  node "$OLDPWD/bin/ch" worktree &&
  node "$OLDPWD/bin/ch" status
)
```

## Acceptance behavior

- creates isolated worktree;
- records path and branch;
- second run is idempotent or clearly reports existing worktree.
