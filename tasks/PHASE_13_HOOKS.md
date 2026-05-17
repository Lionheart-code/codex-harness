# Phase 13 — Hooks

## Goal

Install minimal Codex sidecar hooks.

## Scope

- `UserPromptSubmit`;
- `PreToolUse`;
- `Stop`;
- hook install templates;
- hook documentation.

## Required behavior

- warn/stop coding prompt without active task;
- block dangerous shell/git commands;
- block edit outside task worktree where detectable;
- remind about check/report on stop.

## Non-goals

Hooks are not the state machine or full policy engine.

## Acceptance commands

```bash
npm run build
node bin/ch hooks --help
```

## Acceptance behavior

- dangerous-command guard is documented;
- missing task-context behavior is documented;
- stop reminder behavior is documented.
