# Phase 17 — Harness governance and maintainer review

## Goal

Add a controlled maintainer-review loop for improving `codex-harness` itself.

This phase lets the harness inspect its own outcomes, debt, metrics, prompts, agent failures, and roadmap without uncontrolled self-modification.

## Scope

- add governance artifact structure:
  - `.harness/governance/reviews/`
  - `.harness/governance/proposals/`
  - `.harness/governance/metrics/`
  - `.harness/governance/changelog.md`
- add commands:
  - `ch governance review`
  - `ch governance proposal`
  - `ch governance metrics`
  - `ch governance status`
- define Harness Enhancement Proposal format;
- define daily/weekly/release review modes;
- connect governance to project memory and debt ledger;
- allow optional external research summaries as proposal inputs.

## Non-goals

- no automatic self-modification;
- no auto-merge;
- no silent prompt changes;
- no automatic permission changes;
- no external internet requirement for local acceptance;
- no dashboard required.

## Acceptance commands

```bash
npm run build
node bin/ch governance --help
```

## Acceptance behavior

- governance artifacts have clear location;
- maintainer review creates a report/proposal, not code changes;
- every proposal has evidence, expected benefit, risk, rollback, and acceptance criteria;
- local deterministic acceptance does not require internet or LLM/API calls.
