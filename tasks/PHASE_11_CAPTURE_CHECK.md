# Phase 11 — Capture and check

## Goal

Capture diffs and run deterministic verification.

## Scope

- `ch capture`;
- `ch check`;
- `diff.patch`;
- `verifier.json`;
- `logs/check.log`.

## Required behavior

- capture git status and diff from worktree;
- run configured commands;
- store pass/fail, command, exit code, duration;
- protected files are read from `.harness/config.toml`; if unset, default protected paths are `AGENTS.md` and `.harness/config.toml`;
- protected-file changes are reported as check failure, but are not reverted automatically.

## Non-goals

No LLM review yet.

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
  node "$OLDPWD/bin/ch" capture &&
  node "$OLDPWD/bin/ch" check &&
  find .harness/tasks -name verifier.json | grep .
)
```

## Acceptance behavior

- failed checks make `verifier.json` fail;
- passing checks are recorded;
- diff can be reviewed later.
