# Phase 23.8.6C1 - Post-Bootstrap Audit and Task-Contract Rebase

## Status

Active. Starts only after Phase 23.8.6C Minimum Self-Hosting Orchestrator
Entrypoint is complete, reviewed, accepted, and merged.

## Purpose

Convert the post-23.8.6C project audit into a reviewed, mechanically coherent
sequence of task contracts before further runtime implementation begins.

## Problem

Phase 23.8.6C established the minimum operator bootstrap, but the reviewed
implementation exposed a narrow bootstrap-authority correctness gap and made
several downstream task boundaries more concrete. Continuing directly into an
older future task contract would leave the roadmap, task dependencies, and
existing runtime type ownership out of sync.

## Scope

This phase owns only the authority transition from the merged 23.8.6C result to
the next runtime task. It must materialize the narrow supporting task, rebase
the affected future task contracts, and make the documented progression
internally consistent. It must not implement runtime behavior.

## Required behavior

- Add a Phase 23.8.6C2 Bootstrap Authority Correctness task contract that owns:
  - fail-closed rejection of missing task references;
  - fail-closed rejection of ambiguous installed-task authority;
  - truthful base-commit or reviewed merge-base authority;
  - deep validation for persisted current-phase bootstrap facts, `RunIssue`,
    and `RepairPacket` records where the current runtime owns their readback.
- Keep Phase 23.8.6C2 narrow and current-phase specific. Do not turn it into
  generalized packet/result automation, an external runner, or a workflow
  engine.
- Amend Phase 23.8.6D so durable procedure storage follows the corrected
  bootstrap authority and explicitly owns canonical procedure identity,
  recorded timestamps or content hashes, exact plan/evidence binding, and
  storage-owned validation.
- Amend Phase 23.8.6E so authority freshness follows the corrected bootstrap
  and durable procedure storage, and explicitly reconciles stale present-tense
  claims, model policy, and context-budget authority.
- Amend Phase 23.8.7 so it extends and normalizes the existing Phase 23.8.6C
  `RunIssue` and `RepairPacket` types rather than duplicating them, and so
  tier-derived review requirements and manual-procedure promotion become typed
  stage-level contracts.
- Update the implementation roadmap and operations plan to publish the exact
  sequence:
  `23.8.6C -> 23.8.6C1 -> 23.8.6C2 -> 23.8.6D -> 23.8.6E -> 23.8.7 -> 23.9`.
- Add focused deterministic contract tests for the new task file, dependency
  order, and downstream ownership boundaries.
- Preserve the lightweight harness direction: one authoritative next task,
  one operator oracle, bounded typed evidence, and no new MOW or broad
  orchestrator layer.
- Preserve Phase 30 as the home for bounded eval-driven experimentation and
  Phase 31 as the home for reviewed runner execution and PR/CI repair.

## Non-goals

- No runtime or CLI implementation.
- No database, schema, migration, or persistence implementation.
- No external runner launch or provider-specific execution path.
- No generalized workflow, packet, or multi-agent orchestration layer.
- No implementation of Phase 23.8.6C2 or any later phase.
- No rewrite of historical task contracts outside the dependency and ownership
  wording required for the corrected near-term sequence.

## Acceptance commands

```bash
npm run build
npm test
node bin/ch run status --operator --run run-0001
git diff --check
```

## Acceptance behavior

- `TASK.md` identifies only this task while the phase is active.
- The Phase 23.8.6C2 task is complete enough to implement without inventing
  scope or broadening into later packet automation.
- The roadmap, operations plan, and affected future tasks agree on ordering,
  dependencies, ownership, and deferrals.
- Focused tests fail if the new task disappears, the near-term order regresses,
  or Phase 23.8.7 duplicates current-phase issue/repair ownership.
- No source/runtime files change.
- Independent review confirms that the audit conclusions are supported by the
  merged code and that the resulting movement remains lightweight.

## Source/runtime boundary

This is a task-contract and authoritative-document phase. It may change only
`TASK.md`, task files, authoritative roadmap/operations documents, and focused
contract tests. It must not change `src/`, CLI behavior, package scripts, CI,
schemas, migrations, or generated/runtime paths.

## Review requirements

- Treat this authority transition as `extra-high` review tier.
- Run deterministic verification before independent review.
- Require `implementation-review`, `architecture-review`,
  `verification-review`, `delivery-facts-review`, `harness-audit`, and
  `docs-consistency-review` when surfaced by the operator contract.
- Run `phase-closeout-review` last.
- Use a read-only independent reviewer with sufficient reasoning for roadmap
  and task-boundary validation; the reviewer must not edit the branch.

## Relationship to previous and next phases

- Follows the merged Phase 23.8.6C implementation and treats its code as the
  evidence base for this rebase.
- Creates and precedes Phase 23.8.6C2 Bootstrap Authority Correctness.
- Revalidates, but does not implement, Phases 23.8.6D, 23.8.6E, and 23.8.7.
- Leaves Phase 23.9 and later phases blocked behind the corrected near-term
  chain.

## Final report expectations

The final report must state:

- the audit conclusions retained, corrected, or rejected;
- the exact post-23.8.6C phase sequence;
- which task and authority files changed and why;
- deterministic verification and independent review results;
- confirmation that no runtime implementation or generated state was
  committed;
- PR and merge status.
