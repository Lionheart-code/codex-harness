# Phase 2.5 — Acceptance test runner

## Goal

Add a cross-platform acceptance test runner so Phase 1 and Phase 2 behavior can be verified with npm scripts instead of manual shell commands.

## Scope

- add Node-based acceptance tests;
- use Node's built-in test runner;
- add npm scripts:
  - npm test
  - npm run test:acceptance
- test Phase 1 CLI behavior;
- test Phase 2 installer behavior in a temporary git repository;
- verify dry-run commands do not change git status;
- verify install creates the required installed layer;
- verify reinstall is idempotent.

## Files to create/change

- package.json
- tests/acceptance/phase1-cli.test.mjs
- tests/acceptance/phase2-installer.test.mjs
- optional tests/helpers/*.mjs if needed
- TASK.md

## Non-goals

- no Phase 3 task lifecycle;
- no worktrees;
- no hooks;
- no agent adapters;
- no schemas or migrations;
- no .codex/ creation;
- no .agents/ creation.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
```
