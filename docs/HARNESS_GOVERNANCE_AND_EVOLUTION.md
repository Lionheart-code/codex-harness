# Harness Governance and Evolution

## Purpose

`codex-harness` must not only run project tasks. It must also support improving the harness itself.

As the harness grows, it needs a governed maintenance loop that can answer:

- what is working;
- what is failing;
- which phases create friction;
- where agent runs waste tokens or time;
- which checks catch real bugs;
- which prompts are stale;
- which agent profiles are unsafe or ineffective;
- which debt items are blocking progress;
- which harness changes improved or regressed outcomes.

## Core principle

The harness may recommend its own improvements, but it must not silently self-modify.

Harness evolution is release engineering, not uncontrolled self-improvement.

## Maintainer role

The maintainer is a role, not necessarily a permanently running agent.

It may be performed by:

- Codex in `/plan` mode;
- a scheduled human-triggered review;
- a cheap scout agent that summarizes logs;
- a stronger architect/reviewer agent for final recommendations.

## Maintainer responsibilities

The maintainer reviews:

- task outcomes;
- failed checks;
- review blockers;
- repeated manual interventions;
- unresolved debt;
- stale decisions;
- agent run failures;
- timeout/failure patterns;
- prompt bloat;
- adapter safety issues;
- cost/limit pressure;
- project memory quality.

## Maintainer artifacts

Store under:

```text
.harness/governance/
  reviews/
    <date>-<mode>-harness-review.md
  proposals/
    HEP-0001-title.md
  metrics/
    harness-metrics.json
  changelog.md
```

HEP means Harness Enhancement Proposal.

Phase 17 keeps these artifacts in installed harness layers only.

The real `codex-harness` product repository stays free of generated `.harness/` state during local deterministic acceptance.

## Governance cycle

Recommended cadence:

```text
daily/lightweight
  check active tasks, blockers, debt, broken checks

weekly/normal
  review metrics, agent run failures, repeated friction

release/deep
  audit architecture, phases, prompts, adapter profiles, eval outcomes
```

Daily review should be cheap and mostly deterministic.

Deep review may use a stronger model.

## Harness Enhancement Proposal

Each proposed harness change should include:

```text
HEP id
title
problem
evidence
affected files/components
expected benefit
risk
rollback plan
acceptance criteria
evaluation plan
status: proposed | accepted | rejected | implemented | reverted
```

## Non-regression rule

A harness change should not be promoted unless:

- it has a clear acceptance test;
- it does not break existing workflows;
- it has rollback instructions;
- it is linked to evidence from tasks, metrics, or audits.

## Observability needed

The maintainer needs structured evidence:

- task pass/fail;
- check pass/fail;
- duration;
- manual interventions;
- agent role used;
- agent profile used;
- failure category;
- debt created/resolved;
- review blockers;
- phase where failure occurred.

Phase 23 stores this evidence locally as versioned events, projection rows, and artifact refs. Governance should consume scoped evidence records instead of scraping raw logs or trusting chat memory. Future governance additions may add review freshness and packet/report fingerprints, but core Memory/Evidence must remain domain-neutral and must not add automatic fix, merge, watcher, semantic-search, or summarization behavior by default.

## Phase 17 command surface

```bash
ch governance review
ch governance proposal
ch governance metrics
ch governance status
```

`ch governance changelog` is not implemented in Phase 17.

The changelog is a file artifact maintained under `.harness/governance/changelog.md`.

## Safety

The maintainer must not:

- auto-edit code without a task;
- auto-merge;
- silently change prompts;
- silently change agent permissions;
- enable external agents by default;
- treat raw logs as accepted truth;
- optimize only for speed/cost while hurting correctness.

## Relationship to project memory

Project memory records what happened in projects.

Governance uses that memory to improve the harness.

They are separate:

```text
project memory
  what happened in tasks/projects

harness governance
  what should change in the harness itself
```

## Relationship to external research

The maintainer may periodically review external sources, but external research must become a proposal before changing the harness.

No internet-sourced claim directly changes runtime behavior without review and acceptance.
