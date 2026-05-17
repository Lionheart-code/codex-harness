# Phase 8 — Agent run ledger

## Goal

Record every manual or automated agent run as a durable artifact.

## Scope

- create `.harness/tasks/<task-id>/agents/<run-id>/`;
- store role, prompt path, output path, status, timestamps, and optional command metadata;
- add `ch agent record`;
- add `ch agent list`.

## Non-goals

- no automatic external-agent execution;
- no API integration;
- no write-mode external agents;
- no parallel workers.

## Acceptance commands

```bash
npm run build
tmp="$(mktemp -d)"
(
  cd "$tmp" &&
  git init &&
  git config user.email "test@example.com" &&
  git config user.name "Test User" &&
  printf "# test\n" > README.md &&
  git add README.md &&
  git commit -m "init" &&
  node "$OLDPWD/bin/ch" install &&
  node "$OLDPWD/bin/ch" init "test task" &&
  node "$OLDPWD/bin/ch" agent record --role scout-tests --output sample.md &&
  node "$OLDPWD/bin/ch" agent list
)
```

## Acceptance behavior

- agent run is recorded under task folder;
- status is readable without chat history;
- no external command is executed.
