# Phase 2 — Real installer

## Goal

Implement safe `ch install` for target repositories.

## Scope

- create target `.harness/config.toml`;
- create `.harness/tasks/`;
- create `.harness/templates/`;
- create `.harness/install.json`;
- create or safely patch `AGENTS.md`.

## Required behavior

- idempotent install;
- backup on conflicts;
- dry-run still available;
- no overwrite without confirmation;
- clear install summary.
- `.harness/install.json` records at least `harness_version`, `templates_version`, `installed_at`, and `source`.

## Non-goals

Do not implement worktrees, task lifecycle, hooks behavior, checks, review, playground, `.codex/` installation, or `.agents/skills/` installation.

## Acceptance commands

```bash
npm run build
tmp="$(mktemp -d)"
( cd "$tmp" && git init && node "$OLDPWD/bin/ch" install && test -f .harness/config.toml && test -d .harness/tasks && test -d .harness/templates && test -f .harness/install.json )
( cd "$tmp" && node "$OLDPWD/bin/ch" install )
```

## Acceptance behavior

- install into empty git repo works;
- `.harness/install.json` contains install/version metadata needed for future upgrades;
- running install twice is safe;
- conflicts create backup or require confirmation;
- `ch doctor` reports installed layer.
