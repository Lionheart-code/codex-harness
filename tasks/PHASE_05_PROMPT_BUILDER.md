# Phase 5 — Prompt builder

## Goal

Generate task-aware prompts for Codex.

## Scope

- `ch prompt plan`;
- `ch prompt work`;
- `ch prompt review`;
- prompt templates.
- concise implementation-discipline policy in generated prompt templates;
- short `AGENTS.md` implementation-discipline section if missing.

## Required prompt context

- task id;
- spec path;
- acceptance path;
- worktree path;
- allowed scope;
- verification commands;
- expected output.
- implementation discipline.

## Non-goals

No automatic Codex execution.
No `codex exec`, schema validation, review runner, or automated review result is implemented in this phase.
Do not paste the full Karpathy Guidelines into generated prompts.
Do not create a giant AGENTS.md.

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
- generated prompts include the concise implementation-discipline block;
- AGENTS.md remains short and does not include the full Karpathy Guidelines.
