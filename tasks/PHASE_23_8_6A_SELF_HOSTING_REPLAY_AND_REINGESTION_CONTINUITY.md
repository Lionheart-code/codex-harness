# Phase 23.8.6A - Self-Hosting Replay and Re-ingestion Continuity

## Status

Planned implementation phase. Starts only after Phase 23.8.6 Transactional
Procedure Result Ingestion and Slice-Isolated Run Mutations is complete,
reviewed, accepted, and merged. `TASK.md` currently points here as the active
worktree operator context for adjacent docs/task-contract wiring and authority
correction, but that pointer does not waive the Phase 23.8.6 runtime
dependency and does not authorize implementation of Phase 23.8.6B or later
behavior. Before materializing this task context for implementation, local
`main` must be fast-forwarded to fresh `origin/main`, and the new task must
preserve one task = one branch = one worktree.

## Purpose

Restore honest self-hosting continuity after exact immutable run identity is
hardened.

The product must be able to replay and re-ingest exact already-recorded
durable artifacts across the active self-hosting operator chain so a
replacement exact-identity run can recover real progress without manual
`run.json` repair, per-run patches, duplicate evidence, or stage-skipping
hacks.

That continuity must be strong enough for the recovered replacement run to
proceed honestly through the remaining reviewed operator chain, closeout, and
harvest when the required evidence and delivery facts already exist.

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

An additional continuity gap is now confirmed in accepted/project memory:
display `run_id` values are reused per target root/worktree, but the accepted
project-memory layer still contains display-`run_id` keyed surfaces that can
collapse or overwrite distinct exact run instances during harvest/replay. A
replacement or later run that reuses `run-0001` must append under exact
identity, not destroy or replace previously accepted authority for another
`run_instance_id`.

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
- Accepted/project memory must preserve multiple exact run instances that share
  the same display `run_id` across different worktrees or replacement runs.
  Reuse of `run-0001` must not overwrite prior accepted runs, prior harvest
  records, or previously promoted evidence that belongs to a different
  `run_instance_id`.
- Any accepted-memory row, harvest row, replay path, or derived-state backfill
  that is still keyed effectively by display `run_id` must be corrected so the
  exact run instance remains the authoritative identity and display `run_id`
  remains only a non-unique human-facing label.
- Operator progression must remain monotonic under exact-artifact replay when
  procedure outcomes are recorded in valid order.
- A replacement exact-identity run must be able to recover honest active-chain
  progress from already-recorded artifacts without forcing re-execution of
  unrelated completed work.
- The phase is not complete if replay/re-ingestion only restores intermediate
  operator stages but still leaves the recovered exact-identity run unable to
  reach honest closeout and harvest under the existing Phase 23.5 lifecycle
  rules when the required evidence is already present.
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

- Prepares honest self-hosting continuity before Phase 23.8.6B, Phase 23.8.6B2,
  Phase 23.8.6C, Phase 23.8.6D, Phase 23.8.6E, Phase 23.8.7, and Phase 23.9
  depend on reconstructed operator progression or continuity assumptions.
- Makes the later Phase 23.8.6B docs/policy pass able to describe real replay
  and review-launch discipline without relying on per-run folklore, while the
  later 23.8.6B2/6C/6D/6E task contracts can consume continuity facts without
  pre-implementing them here.
- Must not pre-implement packet automation, runner execution, proof records,
  report generation, access APIs, provider routing, or experimentation loops.
- Requires architecture review if replay/re-ingestion turns into a generic
  workflow engine, runner launcher, background repair loop, or provider-aware
  orchestration layer.

## Acceptance commands

```bash
npm run build
npm test
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
- Harvest/replay/accepted-memory behavior is exact-identity safe when multiple
  distinct runs share the same display `run_id`; earlier accepted runs remain
  queryable and their promoted evidence is not replaced or deleted by a later
  run with the same display label.
- Replacement exact-identity runs can recover honest active-chain progress from
  already-recorded artifacts without manual `run.json` edits or per-run repair
  code.
- When recorded evidence is already sufficient, the recovered run can continue
  through delivery-facts review, closeout review, closeout, and harvest
  without manual state reconstruction, fake restart behavior, or accepted
  memory clobbering.
- If a full-pack acceptance proof is required during implementation, `npm test`
  is the canonical command. `npm run test:acceptance` remains only a
  compatibility alias to the same acceptance runner and must not be treated as
  separate proof or launched concurrently with `npm test` in the same
  workspace/runtime context.
- Legacy identity-less runs still fail closed for mutation/harvest authority
  rather than being silently upgraded through compatibility projections.
- No runner execution, packet automation, docs/model-routing packaging, or
  provider-specific lifecycle logic is introduced.
