# Phase 30 - Bounded Agent Experimentation Loop

## Purpose

Add a bounded experimentation and eval-driven harness-improvement primitive
after minimum lifecycle fixtures, operator/procedure records, proof, and
evaluator fixtures exist.

## Status

Planned. Blocked until Phase 29 Prior-Art Discovery Gate is complete and
reviewed.

Roadmap continuity:

Earlier phases may preserve hooks, adapters, runner comparisons, reviewer
improvements, and packet optimization as deferred candidates. They must not run
experimentation loops before evaluator/proof/report foundations exist or
become the first place where base lifecycle-failure fixtures are introduced.
Phase 23.8.6F owns only the bounded routing-eval bootstrap and owner-approved
promotion lifecycle for the existing self-hosting Codex review path. Phase 30
consumes and generalizes that evidence; it does not recreate F's basic routing
telemetry or current-path promotion records.

## Scope

Required behavior:

- Keep experimentation human/architect-owned and approval-gated.
- Add procedure-trigger evals that check:
  - expected self-hosting procedure selection for representative scenarios;
  - wrong-procedure negative cases;
  - missing-input blocker behavior;
  - output-format conformance for reviewed procedures.
- Allow recurring review findings, traces, CI failures, and repeated fix-pass
  patterns to become eval candidates only after explicit review.
- Approved eval candidates become regression fixtures rather than chat-only
  reminders.
- Harness change proposals created from experimentation must cite the
  motivating findings, traces, or eval IDs.
- Improve procedures, reviewers, routes, and packets only after the minimum
  self-hosting loop and baseline lifecycle-failure fixtures already exist.
- Allow bounded drift/entropy cleanup candidates such as stale docs,
  wrapper/skill/registry drift, source-map drift, duplicate authority, and
  abandoned experimental notes to be surfaced as reviewed improvement
  proposals.
- Allow recurring mechanically checkable authority-drift patterns nominated by
  Phase 23.8.6E freshness reports to become eval or cleanup candidates only
  after explicit review.
- Keep experiment records, evaluator references, keep/revert decisions, and
  review outcomes durable and auditable.
- Consume Phase 23.8.6F eval cases, shadow/replay/canary results,
  promotion/rejection decisions, policy versions, rejected candidates, and
  rollback records as inputs to generalized experimentation.
- When experimentation consumes supervised review-launch evidence from
  Phase 23.8.6B1, keep that telemetry keyed by or explicitly resolvable
  through exact run identity rather than display `run_id` alone.
- Do not make Phase 30 the first place where basic lifecycle-failure fixtures
  appear.

## Core pattern

- human/architect-owned experiment program;
- immutable evaluator;
- agent-owned sandbox;
- experiment record;
- keep/revert decision;
- synthesis and review.

## Offline route and context evaluation contract

Each local/offline experiment records `experiment_id`, fixture IDs, baseline
route, candidate routes, context-packet variant, immutable evaluator, expected
critical findings and lifecycle outcome, quality/economic gates, bias
controls, and keep/reject decision.

Phase 30 adds immutable-evaluator governance and cross-provider, packet,
decomposer, procedure, and broader harness experiments. It does not mutate an
accepted Phase F policy silently or treat an F canary result as generalized
promotion authority.

Metrics include critical-blocker recall, false acceptance, false positives,
illegal lifecycle progression, scope leakage, output-contract validity, review
disagreement, fix-pass count, convergence, input/cached/cache-write/output
tokens, credits, latency, tool calls, retrieval count, and context
reconstruction ratio.

Evaluate engineering quality against the stable 24A.1/24A.2 production
contract: functional correctness, missed requirements/scenarios, invariant and
DB/storage/lifecycle blocker recall, retry/recovery correctness, regressions,
unauthorized behavior, unnecessary scope, false acceptance/positives,
disagreement, fix-pass convergence, lifecycle cost, and context reconstruction.
Where applicable compare strong initial against bounded repeat review, combined
against equivalent separate reviews, reused against reconstructed context, and
higher reasoning against an approved adjacent lower step. Production tests are
not promotion evidence; reject cheaper candidates that miss critical blockers,
permit illegal progression, violate independence, or materially increase false
acceptance.

Fixtures cover clean and amendment-required plans, clean and `FIX_REQUIRED`
implementations, a subtle authority/lifecycle blocker, and a subtle storage/DB
blocker. Hard-reject any candidate that misses a confirmed critical blocker,
allows illegal lifecycle progression or independence violation, emits invalid
structured output, reduces cost without preserving quality, or uses the same
evaluator/candidate without bias controls.

## Use cases

- improve reviewer procedures;
- validate procedure-trigger selection and blocker semantics;
- promote recurring findings/traces/CI failures into regression evals;
- compare provider/model profiles;
- test decomposer variants;
- validate guardrails/hooks;
- optimize task packet formats;
- surface bounded drift/entropy cleanup opportunities;
- turn approved recurring authority-drift patterns into regression checks or
  cleanup proposals;
- evaluate whether routes or cheaper-review candidates outperform the baseline
  assumptions recorded in `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md`.

## Non-goals

- Not uncontrolled self-improvement.
- Not autonomous product development.
- Not a replacement for architecture review.
- Not before evaluator fixtures exist.
- Not automatic acceptance of eval candidates.
- Not automatic cleanup or deletion of docs/artifacts.
- Not self-approval of harness changes.
- Not the first phase that creates base lifecycle failure fixtures.
- Not conversion of kept experiment output into accepted project truth without
  review and harvest.

## Future-phase impact check

- Prepares the later reviewed runner-execution phase by making keep/revert,
  evaluator, and evidence-linkage rules explicit before operational repair
  loops are introduced.
- Must not pre-implement autonomous runner execution, auto-merge, or
  domain-specific runtime workflows.
- Preserves the domain/core boundary by keeping experiments bounded,
  evidence-linked, and approval-gated.

## Acceptance behavior

- Experiments run under an immutable evaluator per experiment record.
- Procedure-trigger evals include negative cases and blocker semantics rather
  than only happy paths.
- Eval candidates from findings/traces/CI failures require explicit review
  before becoming regression fixtures.
- Authority-drift candidates from Phase 23.8.6E require explicit review before
  becoming regression checks, eval fixtures, or cleanup proposals.
- Accepted harness changes cite the motivating evidence and eval IDs.
- Drift/entropy issues may become reviewed cleanup proposals, but nothing is
  deleted or rewritten automatically.
