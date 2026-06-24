# Phase 30 - Bounded Agent Experimentation Loop

## Purpose

Add a bounded experimentation and eval-driven harness-improvement primitive
after operator/procedure/proof/evaluator fixtures exist.

## Status

Planned. Blocked until Phase 29 Prior-Art Discovery Gate is complete and
reviewed.

Roadmap continuity:

Earlier phases may preserve hooks, adapters, runner comparisons, reviewer
improvements, and packet optimization as deferred candidates. They must not run
experimentation loops before evaluator/proof/report foundations exist.

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
- Allow bounded drift/entropy cleanup candidates such as stale docs,
  wrapper/skill/registry drift, source-map drift, duplicate authority, and
  abandoned experimental notes to be surfaced as reviewed improvement
  proposals.
- Keep experiment records, evaluator references, keep/revert decisions, and
  review outcomes durable and auditable.

## Core pattern

- human/architect-owned experiment program;
- immutable evaluator;
- agent-owned sandbox;
- experiment record;
- keep/revert decision;
- synthesis and review.

## Use cases

- improve reviewer procedures;
- validate procedure-trigger selection and blocker semantics;
- promote recurring findings/traces/CI failures into regression evals;
- compare provider/model profiles;
- test decomposer variants;
- validate guardrails/hooks;
- optimize task packet formats;
- surface bounded drift/entropy cleanup opportunities.

## Non-goals

- Not uncontrolled self-improvement.
- Not autonomous product development.
- Not a replacement for architecture review.
- Not before evaluator fixtures exist.
- Not automatic acceptance of eval candidates.
- Not automatic cleanup or deletion of docs/artifacts.
- Not self-approval of harness changes.

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
- Accepted harness changes cite the motivating evidence and eval IDs.
- Drift/entropy issues may become reviewed cleanup proposals, but nothing is
  deleted or rewritten automatically.
