# Phase 3 — Task state

## Goal

Implement real task folders and state management.

## Scope

- `ch init`;
- `ch status`;
- task id generation;
- `.harness/tasks/<task-id>/spec.md`;
- `.harness/tasks/<task-id>/acceptance.md`;
- `.harness/tasks/<task-id>/state.json`.

## Required behavior

- task id is filesystem-safe;
- state contains status, branch, worktree path placeholder, timestamps;
- task type can be bugfix/feature/refactor/architecture/docs/deployment;
- optional task type is recorded in state when provided, but Phase 3 uses one simple task template.

## Non-goals

No worktree creation yet.
No differentiated task templates yet.

## Acceptance commands

```bash
npm run build
tmp="$(mktemp -d)"
( cd "$tmp" && git init && node "$OLDPWD/bin/ch" install && node "$OLDPWD/bin/ch" init "test task" && node "$OLDPWD/bin/ch" status && find .harness/tasks -name state.json | grep . )
```

## Acceptance behavior

- `ch init "test task"` creates task folder;
- `ch status` lists tasks;
- state is valid JSON;
- no chat memory is required to understand a task.
