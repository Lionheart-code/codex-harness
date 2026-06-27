# Phase 23.8.6A - Self-Hosting Replay and Re-ingestion Continuity

## Status

Planned. Starts only after Phase 23.8.6 Transactional Procedure Result
Ingestion and Slice-Isolated Run Mutations is complete, reviewed, accepted,
and merged. Before materializing this task context, local `main` must be
fast-forwarded to fresh `origin/main`, and the new task must preserve one task
= one branch = one worktree.

## Purpose

Restore honest self-hosting continuity after exact immutable run identity is
hardened.

The product must be able to replay and re-ingest exact already-recorded
durable artifacts across the active self-hosting operator chain so a
replacement exact-identity run can recover real progress without manual
`run.json` repair, per-run patches, duplicate evidence, or stage-skipping
hacks.

## Problem

Phase 23.8.6 intentionally made mutating runtime paths fail closed when a run
lacks exact immutable identity. That is correct for closeout, harvest, and
accepted/project authority.

But once that hardening exists, legacy self-hosting runs without
`run_instance_id` remain readable for status while becoming non-mutable. If
the already-recorded procedure artifacts cannot be replayed generically across
the active operator chain, the harness loses honest continuity:

- the old run cannot close out or harvest;
- a replacement run cannot recover the already-finished chain cleanly;
- agents are pushed toward manual repair or fake restart behavior.

This phase closes that continuity gap without broadening into runner
orchestration, packet automation, or docs/model-routing policy packaging.

## Scope

Required behavior:

- Generalize exact-artifact replay and idempotent re-ingestion across the full
  default active self-hosting operator chain for this repair pass.
- Apply that replay/re-ingestion behavior to:
  - `task-intake`
  - `task-prompt-writer`
  - `draft-plan`
  - `plan-review`
  - `plan-amend`
  - `architecture-review`
  - `db-storage-review`
  - `implementation-review`
  - `fix-pass-review`
  - `verification-review`
  - `delivery-facts-review`
  - `phase-closeout-review`
  - the adjacent `approve-plan` authority surface
- Keep `feature-decomposition`, `docs-consistency-review`, and
  `harness-audit` out of default scope for this phase unless a later reviewed
  task intentionally widens replay/re-ingestion to cover all registry
  procedures.
- If the exact same already-recorded durable artifact becomes newly parseable
  later, replaying or re-ingesting that same artifact must be able to backfill
  the missing derived procedure state, approval state, or review result
  without duplicating evidence.
- Replay/re-ingestion must not require per-run repair logic or bespoke
  one-off code paths for individual historical runs.
- Replay/re-ingestion must preserve slice-isolated mutation rules from Phase
  23.8.6: a command that repairs one derived state slice must not remove or
  rewrite unrelated run state.
- Operator progression must remain monotonic under exact-artifact replay when
  procedure outcomes are recorded in valid order.
- A replacement exact-identity run must be able to recover honest active-chain
  progress from already-recorded artifacts without forcing re-execution of
  unrelated completed work.
- Legacy runs that still lack exact immutable identity may remain readable, but
  they must not be silently repaired into mutable authority through
  compatibility `run.json` edits.
- Procedure IDs and source surfaces must still validate against the checked-in
  self-hosting registry/contracts rather than chat-local assumptions.

## Non-goals

- No runner execution.
- No stage-packet automation.
- No report or proof generation.
- No model-routing runtime.
- No provider/model selection logic.
- No docs/policy packaging.
- No child-session orchestration.
- No domain data ingestion path.
- No manual `run.json` repair escape hatch.

## Future-phase impact check

- Prepares honest self-hosting continuity before Phase 23.8.7 packet/result
  lifecycle work depends on reconstructed operator progression.
- Makes the later Phase 23.8.6B docs/policy pass able to describe real replay
  and review-launch discipline without relying on per-run folklore.
- Must not pre-implement packet automation, runner execution, proof records,
  report generation, access APIs, provider routing, or experimentation loops.
- Requires architecture review if replay/re-ingestion turns into a generic
  workflow engine, runner launcher, background repair loop, or provider-aware
  orchestration layer.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
git diff --check
```

## Acceptance behavior

- The exact same already-recorded durable artifact can be replayed after parser
  or derivation improvements and will backfill newly derivable state without
  duplicate evidence.
- Replay/re-ingestion works across the full active self-hosting operator chain
  listed above, not only for isolated late-stage procedures.
- `approve-plan` follows the same exact-artifact replay/idempotent semantics as
  the adjacent procedure surfaces.
- Replacement exact-identity runs can recover honest active-chain progress from
  already-recorded artifacts without manual `run.json` edits or per-run repair
  code.
- Legacy identity-less runs still fail closed for mutation/harvest authority
  rather than being silently upgraded through compatibility projections.
- No runner execution, packet automation, docs/model-routing packaging, or
  provider-specific lifecycle logic is introduced.
