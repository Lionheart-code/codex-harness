# Phase 7 — Read-only scout prompts

## Goal

Allow cheap/manual multi-agent scouting without API and without write access.

## Scope

- add `ch prompt scout --role <role>`;
- support roles:
  - repo-map
  - tests
  - docs
  - security
  - architecture
- create scout prompt files under `.harness/tasks/<task-id>/prompts/`;
- create `.harness/tasks/<task-id>/scouts/`;
- define scout output contract.

## Scout contract

Scouts must:

- read only;
- not edit files;
- not run destructive commands;
- write findings to `.harness/tasks/<task-id>/scouts/<role>.md`;
- include relevant files, findings, risks, suggested focus, and confidence.

## Non-goals

- no API;
- no automatic CLI-agent execution;
- no write agents;
- no parallel worktree workers;
- no controller-agent.

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
  node "$OLDPWD/bin/ch" worktree &&
  node "$OLDPWD/bin/ch" prompt scout --role tests &&
  find .harness/tasks -type f | grep 'scout-tests.md'
)
```

## Acceptance behavior

- scout prompt is generated;
- scout output directory exists;
- prompt clearly says read-only;
- prompt includes task spec path, acceptance path, worktree path, and output path;
- no agent is automatically executed.
