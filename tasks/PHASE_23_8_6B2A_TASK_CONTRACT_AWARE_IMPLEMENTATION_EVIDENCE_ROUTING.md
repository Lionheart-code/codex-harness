# Phase 23.8.6B2A - Task-Contract-Aware Implementation Evidence Routing

## Status

Owner-approved narrow fix task created from the Phase `23.8.6B2`
ORCHESTRATOR_GAP. This task exists to unblock honest routing from
`IMPLEMENTATION_READY` to `IMPLEMENTATION_REVIEW_REQUIRED` for docs/task/policy
implementation without broadening B2 verification-command semantics.

## Purpose

Make implementation-evidence routing aware of the approved task contract so
docs/task/policy-only phases can advance honestly when their live diff stays
inside allowed authority surfaces.

## Problem

Phase `23.8.6B2` proved that a valid docs/task/policy-only implementation can
remain stuck at `IMPLEMENTATION_READY` with `missing_builder_handoff` because
current implementation-evidence routing recognizes only code-like paths during
the live-change probe.

## Scope

This is a narrow runtime/operator routing fix plus targeted regression tests.

## Required behavior

- For docs/task/policy-only phases, allowed authority-surface changes may count
  as implementation evidence when they stay within approved task-contract/plan
  scope.
- Forbidden paths for that phase must block advancement instead of counting as
  implementation evidence.
- Code/runtime phases must preserve existing implementation-evidence behavior.
- The current B2 run/diff must be able to route honestly to
  `IMPLEMENTATION_REVIEW_REQUIRED` after this fix.
- Add positive and negative regression tests for the docs/task/policy-only
  routing behavior.

## Non-goals

- No B2 verification-command semantics changes.
- No package-script changes.
- No CI changes.
- No acceptance-runner changes.
- No npm command behavior changes.
- No broad lifecycle redesign.
- No generic docs churn counting as implementation evidence.

## Acceptance commands

```bash
npm run build
node --test tests/acceptance/phase23-8-6-procedure-ingestion.test.mjs
git diff --check
```

## Acceptance behavior

- Docs/task/policy-only phases with allowed docs/task/skill/`TASK.md` changes
  advance from `IMPLEMENTATION_READY` to `IMPLEMENTATION_REVIEW_REQUIRED`.
- Docs/task/policy-only phases with forbidden `src/`, CI, package-script, or
  runner changes do not advance.
- Existing code/runtime phase implementation-evidence routing still behaves as
  before.
- The current B2 run/diff can route honestly to implementation review after the
  runtime fix is present.

## Source/runtime boundary

This task may change only runtime/operator implementation-evidence routing,
targeted tests, and the minimal docs/task authority surfaces needed to keep the
fix aligned. It must not change B2 proof semantics, package scripts, CI,
acceptance-runner behavior, or npm command behavior.

## Final report expectations

The implementation report for this task must state:

- files changed;
- before/after operator status behavior;
- tests run;
- whether `run-0001` can now advance to implementation review; and
- remaining risks.
