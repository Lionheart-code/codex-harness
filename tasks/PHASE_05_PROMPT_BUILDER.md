# Phase 5 — Prompt builder

## Goal

Generate task-aware prompts for Codex.

## Scope

- `ch prompt plan`;
- `ch prompt work`;
- `ch prompt review`;
- prompt templates.

## Required prompt context

- task id;
- spec path;
- acceptance path;
- worktree path;
- allowed scope;
- verification commands;
- expected output.

## Non-goals

No automatic Codex execution.
No `codex exec`, schema validation, review runner, or automated review result is implemented in this phase.

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
  node "$OLDPWD/bin/ch" prompt plan &&
  node "$OLDPWD/bin/ch" prompt work &&
  node "$OLDPWD/bin/ch" prompt review &&
  find .harness/tasks -type f | grep prompt
)
```

## Acceptance behavior

- prompts are saved under task folder;
- prompts are concise;
- prompts reference task files instead of dumping huge context.
