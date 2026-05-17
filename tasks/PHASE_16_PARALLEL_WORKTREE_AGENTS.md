# Phase 16 — Parallel worktree agents

## Goal

Allow multiple write-capable agents only when work can be safely split.

## Scope

- one worker = one worktree;
- explicit file claims;
- integrator task;
- final verifier required;
- human merge gate required.

## Non-goals

- no shared worktree editing;
- no uncontrolled agent-to-agent chat;
- no auto-merge;
- no write-mode default.

## Acceptance commands

```bash
npm run build
node bin/ch parallel --help
```

## Acceptance behavior

- parallel mode is opt-in;
- each worker has isolated worktree;
- integration requires explicit verifier/human gate.
