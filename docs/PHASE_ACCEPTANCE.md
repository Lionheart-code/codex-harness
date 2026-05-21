# Phase Acceptance Rules

## Global acceptance rules

Every phase promoted to the current `TASK.md` must have:

- explicit scope;
- explicit non-goals;
- concrete files to create/change;
- concrete commands to run;
- clear fail conditions;
- scoped diff.

A phase is not ready to become the current `TASK.md` unless its task file contains both:

- `## Acceptance commands` with runnable shell commands;
- `## Acceptance behavior` with observable expected results.

Roadmap-level phases may remain less detailed, but before a phase is implemented, its task file must be tightened without adding new product scope.

## Current phase acceptance

The current phase acceptance lives in the task file referenced by `TASK.md`.

## Fail if

- implementation includes later-phase features;
- build/test commands fail;
- acceptance commands are missing;
- undocumented heavy dependency is introduced;
- dry-run writes files;
- user files can be overwritten without backup/confirmation.

## Phase 23 evidence acceptance additions

Phase 23 acceptance must also fail if:

- generated runtime state is written outside ignored `.harness/**` paths;
- `.harness/evidence/events.jsonl` is not append-only or cannot rebuild the projection;
- `.harness/evidence/projection.sqlite` is treated as source of truth or raw SQL is exposed through public CLI/API;
- `.harness/artifacts/sha256/<prefix>/<hash>` artifact refs cannot be integrity checked;
- evidence queries mix different `target_project_id`, `target_root`, `namespace`, or `run_id` scopes;
- local verification evidence is reused after tracked changes, changed/removed untracked files, changed command sets, different roots, different base commits, failed previous verification, unsupported schemas, or missing/corrupt artifacts;
- local verification reuse is treated as satisfying remote CI;
- non-dry-run `ch run closeout` is run during implementation verification.

During implementation verification, `node bin/ch run closeout --dry-run` may report `BLOCKED` before review or remote CI. That expected pre-review block is not an implementation failure.
