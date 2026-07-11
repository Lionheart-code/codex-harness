# Phase 23.8.6C1A - Routing, Context, and Model-Policy Authority Rebase

## Status

Active. Starts only after Phase 23.8.6C1 Post-Bootstrap Audit and Task-Contract
Rebase is complete, reviewed, accepted, and merged.

## Purpose

Convert the completed routing, context, and model-policy research into current
repo-owned policy and decision-complete future task contracts before Phase
23.8.6C2 or later runtime implementation proceeds.

## Scope

This is a source-only authority and task-contract rebase. It owns the
provider-neutral routing vocabulary, deterministic route precedence, reasoning
policy, context-transport and independent-review boundaries, downstream phase
allocation, and one bounded refresh of the two current supervised review
bindings.

## Required behavior

- Publish deterministic, policy-first routing: run no-model checks first,
  derive a provider-neutral profile floor from typed facts, choose the cheapest
  approved binding satisfying that floor, escalate only through typed triggers,
  and block rather than silently downgrade.
- Adopt these provider-neutral route classes:
  `deterministic_no_model`, `mechanical_low_cost`, `routine_balanced`,
  `complex_judgment`, `critical_escalation`, `parallel_audit_leaf`, and
  `parallel_audit_arbiter`.
- Publish route precedence as `procedure_id`, `review_tier`,
  `changed_surface_classes`, `risk_classes`, `deterministic_evidence_state`,
  prior review/fix-pass failures, independence requirement, context
  reconstruction cost, and finally budget among safe profiles.
- Represent `profile_floor`, `reasoning_default`, `reasoning_ceiling`,
  `escalation_triggers`, `downgrade_forbidden_conditions`, and
  `verbosity_default` separately. A procedure name alone must not select one
  fixed reasoning level.
- Adopt `fresh_packet`, `resume_same_role`, `packet_plus_retrieval`, and
  `fork_non_authoritative` context transports. Independent review uses a fresh
  packet or packet plus read-only retrieval, never builder transcript authority.
- Keep transcript, hidden reasoning, prompt caching, and raw unbounded logs out
  of authority. Treat caching as an execution optimization only.
- Keep core contracts provider-neutral and capability-based. Concrete models
  are provisional bindings behind adapter/profile boundaries.
- Apply one bounded current cost-control bridge after a read-only local
  capability probe: `plan-review` uses `gpt-5.6-sol` with `high` reasoning and
  `implementation-review` uses `gpt-5.6-terra` with `high` reasoning. Do not
  add automatic fallback.
- Treat `extra-high` as a control/review strictness tier, not a reasoning level.
  It must not automatically imply `xhigh`, `max`, or `ultra`.
- For the C1A chain, use Sol High only for architecture/authority judgment,
  Terra High for implementation review, Terra Medium for docs-consistency or
  mechanical semantic review and `harness-audit`, and deterministic-first
  verification, delivery-facts, and closeout. Any semantic follow-up after a
  deterministic-first gate uses Terra Medium unless conflicting evidence, a
  critical authority/lifecycle finding, or a repeated failed fix-pass requires
  recorded Sol High escalation.
- Prohibit `xhigh`, `max`, and `ultra` as defaults. Each requires a separately
  recorded escalation reason.
- Publish the exact sequence:
  `23.8.6C -> 23.8.6C1 -> 23.8.6C1A -> 23.8.6C2 -> 23.8.6D -> 23.8.6E -> 23.8.7 -> 23.9`.
- Rebase C2, D, E, 23.8.7, 23.9, 24A, 24B, 30, and 31 ownership without
  implementing those phases.
- Add focused deterministic contract tests for task presence, ordering,
  ownership, safety floors, context authority, execution boundaries, and the
  two current review bindings.

## Phase ownership

- Phase 23.8.6C2 remains narrow bootstrap task/worktree/source/base authority
  correctness and does not select models, build generalized context packets,
  or implement routing.
- Phase 23.8.6D owns future-compatible immutable procedure payload identity,
  hash, classification, bounded references, exact-run/source/base provenance,
  and authoritative readback, but not context bundles or routing.
- Phase 23.8.6E owns post-C2/D freshness reconciliation against implementation
  facts and does not repeat or first define this architecture.
- Phase 23.8.7 owns deterministic provider-neutral route intent and context
  policy inputs. Packet preparation does not launch a runner.
- Phase 23.9 owns route, context, invocation, usage, deterministic-evidence,
  and model-judgment provenance without choosing routes or lifecycle outcomes.
- Phase 24A owns the first deterministic shared `ContextCore`/`ContextManifest`
  and one bounded implementation-review packet.
- Phase 24B adds distinct review overlays and reports only after 24A proves
  concrete use.
- Phase 30 owns offline route/context evaluation, economic and quality metrics,
  bias controls, and hard rejection gates.
- Phase 31 remains the first general runtime provider-binding, packet-bound
  execution, context enforcement, budget enforcement, telemetry, and typed
  escalation boundary.

## Non-goals

- No runtime router, provider selection, runner execution, or packet generation.
- No provider execution framework, App Server dependency, or automatic agents.
- No schema, migration, database, CLI, source-runtime, package, or CI change.
- No route-policy schema fields, telemetry implementation, or usage ingestion.
- No rewriting historical accepted tasks.
- No default parallel writers; one writer owns one worktree.
- No implementation of Phase 23.8.6C2 or later.

## Acceptance commands

```bash
npm run build
node --test tests/acceptance/phase23-8-6c1a-routing-context-authority-rebase.test.mjs
node --test tests/acceptance/phase23-8-agent-native-procedure-registry-and-skill-surface.test.mjs
node --test tests/acceptance/phase23-7-operator-status.test.mjs
npm test
node bin/ch run status --operator --run <live-run-id>
git diff --check
git status --short
```

## Acceptance behavior

- `TASK.md` identifies only this task while the phase is active.
- Roadmap, operations, policies, task contracts, and focused tests agree on the
  exact sequence and ownership boundaries.
- Budget cannot weaken a route/profile floor or independence requirement.
- Provider/model names are absent from semantic lifecycle authority.
- Transcript, cache, hidden reasoning, and unbounded raw logs are not authority.
- Phase 31 remains the first general runtime provider-binding and execution
  boundary.
- Only the two current supervised launch profiles use the approved bounded
  bindings: Sol High for `plan-review` and Terra High for
  `implementation-review`.
- No runtime, schema, migration, generated state, or database file changes.
- A deterministic base-to-head changed-file allowlist proves that every commit
  stays inside the approved authority/test surfaces plus the narrow phase-ID
  parser exception.

## Source/runtime boundary

This phase may change only `TASK.md`, current/future task contracts,
authoritative docs and policies, the self-hosting procedure registry and
operator-facing README, and focused acceptance tests. It must not change
`src/`, `schemas/`, `migrations/`, `bin/`, package scripts, CI, `.harness/`, or
runtime/project databases.

Owner-approved compatibility exception: the smallest existing phase-ID parser
and focused operator regression test may change only to recognize compound
phase suffixes such as `23.8.6C1A`. This exception must not alter lifecycle,
storage, routing, provider, packet, or execution behavior.

## Review requirements

- Treat this phase as `extra-high`.
- Run deterministic verification before independent review.
- Require separate read-only `implementation-review`, `architecture-review`,
  `docs-consistency-review`, `verification-review`, `delivery-facts-review`,
  and `harness-audit` passes.
- Use Sol High for architecture/authority judgment, Terra High for
  implementation review, and Terra Medium for docs-consistency, mechanical
  semantic review, and harness audit. Verification, delivery-facts, and
  closeout are deterministic-first; semantic follow-up defaults to Terra
  Medium unless a recorded Sol High escalation trigger applies.
- Run `phase-closeout-review` last.
- Use `db-storage-review` only if scope unexpectedly reaches storage, schema, or
  runtime, which otherwise blocks the phase.
- The implementation session must not approve its own rebase.

## Relationship to previous and next phases

- Follows the merged Phase 23.8.6C1 authority rebase.
- Precedes Phase 23.8.6C2 and changes only its dependency and boundary wording.
- Preserves the current runtime and storage implementations unchanged.
- Makes downstream contracts decision-complete without implementing them.

## Final report expectations

The final report must list every research finding as retained, modified,
rejected, or deferred; state the exact phase sequence and current binding
decision; identify files changed and intentionally untouched; report all
deterministic and independent review results; confirm no runtime/generated
state was committed; and state branch, commits, PR/CI, closeout, and harvest
status.

It must also state the effective Sol High, Terra High, Terra Medium, and
deterministic-first review mapping and list every separately recorded escalation
reason, or explicitly state that no extreme-reasoning escalation occurred.
