# Phase 15 — Playground evals

## Goal

Create external playground and evaluate harness.

## Scope

- create `codex-harness-playground`;
- add sample Python project;
- add sample TS project;
- define task set;
- collect metrics.

## Task set

- 5 bugfix;
- 5 feature;
- 5 refactor;
- 3 docs;
- 2 deployment/smoke;
- optional scout-agent comparisons.

## Metrics

- pass rate;
- time to ready;
- manual interventions;
- failed checks;
- review usefulness;
- unsafe command blocks;
- abandoned worktrees;
- cost/limit pressure by agent role.

## Acceptance commands

```bash
test -d ../codex-harness-playground || true
```

## Acceptance behavior

- deterministic local smoke evaluation can pass without live LLM/API calls;
- full Codex-backed or multi-agent run is a manual release evaluation, not required local acceptance gate;
- findings update roadmap.
