# Agent rules for codex-harness

This repository builds `codex-harness`: a reusable Codex-first programming harness.

## Permanent rules

- Current implementation target is defined by `TASK.md`.
- Implement one task/phase at a time.
- Do not implement later phases unless `TASK.md` explicitly points to them.
- Keep the CLI simple, installable, and testable.
- Prefer TypeScript/Node.js with minimal dependencies.
- Do not introduce a database, dashboard, auto-merge, default swarm, or parallel writers in MVP.
- Do not use `repo-task-proof-loop` as a runtime dependency.
- Do not create a giant `AGENTS.md`.
- Do not overwrite user files without backup or explicit confirmation.
- Acceptance criteria in the current task are mandatory.

## Implementation discipline

- Surface ambiguity before choosing an implementation path.
- Prefer the smallest implementation that satisfies the active task acceptance criteria.
- Make surgical changes only; do not refactor unrelated code.
- Do not add speculative flexibility, future features, or abstractions.
- Verify with the required acceptance commands before reporting completion.

## Instruction priority

If instructions conflict, follow this order:

1. `TASK.md`
2. `docs/MASTER_ARCHITECTURE.md`
3. `docs/IMPLEMENTATION_ROADMAP.md`
4. `docs/OPERATIONS_PLAN.md`
5. this `AGENTS.md`

## Product principle

`Codex CLI + short AGENTS.md + focused skills + one-task-one-worktree + file task-state + deterministic verifier + final review-pass + sidecar hooks`.

## Current task

Read `TASK.md`.
