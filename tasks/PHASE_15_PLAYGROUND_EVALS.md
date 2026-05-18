# Phase 15 — Playground evals

## Goal

Create a minimal disposable external E2E evaluation workspace that proves
`codex-harness` can be installed and exercised against separate target
repositories.

This phase is about validating the existing harness product from the outside.
It is not about creating a new product surface, permanent managed project, or
general eval platform.

## Intent

- `codex-harness` remains the product repository;
- `../codex-harness-playground` is only a local sibling evaluation workspace;
- the playground is disposable and may be removed after evaluation;
- the playground exists only to prove that the harness can be installed and
  exercised in separate target repositories;
- the playground is not a new product repo;
- the playground is not a permanent managed project;
- the playground is not a broad product subsystem;
- the playground is not an upgrade, registry, or release mechanism.

## Scope

- define the minimal lifecycle for a managed disposable playground workspace;
- create `../codex-harness-playground` as the default local/manual sibling
  evaluation workspace;
- create one minimal Python sample target repository;
- create one minimal TypeScript sample target repository;
- define a 20-task eval corpus as metadata;
- run 4 selected deterministic local E2E scenarios for acceptance;
- collect deterministic smoke metrics and artifacts;
- keep full manual release evaluation separate from local deterministic
  acceptance.

## Implementation stages

Phase 15 is one roadmap phase. It must be implemented in the ordered internal
stages below, without splitting the roadmap or broadening the architecture.

### Stage 1 — Playground lifecycle model

- define managed playground marker;
- define root resolution rules;
- define safe init behavior;
- define safe clean/remove behavior;
- refuse unmanaged/non-empty targets;
- keep automated tests on temp roots;
- keep the literal sibling `../codex-harness-playground` for local/manual
  acceptance.

### Stage 2 — Sample target repos

- create `python-app` as an independent sample git repo;
- create `ts-app` as an independent sample git repo;
- keep both projects minimal and deterministic;
- do not create one monorepo playground with app subfolders as the only git
  root.

### Stage 3 — Eval corpus metadata

- define 20 eval tasks as metadata:
  - 5 bugfix
  - 5 feature
  - 5 refactor
  - 3 docs
  - 2 deployment/smoke
- the full 20-task corpus is for manual release evaluation;
- local deterministic acceptance must execute 4 selected E2E scenarios only.

### Stage 4 — Local deterministic E2E smoke scenarios

Local deterministic acceptance must include 4 high-signal E2E scenarios, not
weak existence checks.

#### Scenario 1 — python-app bugfix E2E

- initialize sample git repo;
- install harness layer;
- create task;
- create worktree;
- make one deterministic safe bugfix change;
- configure deterministic checks;
- capture artifacts;
- run checks;
- generate report;
- record metrics.

#### Scenario 2 — ts-app feature E2E

- initialize sample git repo;
- install harness layer;
- create task;
- create worktree;
- make one deterministic safe feature change;
- configure deterministic checks;
- capture artifacts;
- run checks;
- generate report;
- record metrics.

#### Scenario 3 — docs/refactor E2E

- run against one sample repo;
- create a deterministic docs or refactor task;
- exercise install/init/worktree/capture/check/report;
- prove the harness handles a non-bugfix/non-feature task type.

#### Scenario 4 — safety/lifecycle E2E

- prove playground init is idempotent;
- prove non-empty unmanaged target is refused;
- install/invoke hook behavior where existing phase capabilities allow it;
- record at least one unsafe-command block;
- prove clean/remove deletes only a managed playground with the marker file;
- prove clean/remove refuses unknown or unmanaged directories;
- prove product repo does not get `.harness/`, `.codex/`, `.agents/`,
  `schemas/`, or `migrations/`.

### Stage 5 — Metrics and artifacts

- `smoke-results.json` must include deterministic records for all 4 local E2E
  scenarios;
- include at least:
  - `task_id`
  - `project`
  - `category`
  - `mode`
  - `pass`
  - `time_to_ready_ms`
  - `manual_interventions`
  - `failed_checks`
  - `unsafe_command_blocks`
  - `abandoned_worktree`
  - `review_usefulness` as `null` for local deterministic smoke
  - `cost_limit_pressure_by_agent_role` as `null` for local deterministic smoke
- manual release metrics should remain template/guide only.

### Stage 6 — Acceptance and cleanup

- local deterministic smoke must pass without live LLM/API calls;
- `smoke-results.json` must contain deterministic metrics for the 4 executed
  E2E scenarios;
- full 20-task corpus exists as metadata;
- product repo generated-path check must pass;
- cleanup behavior must be safe and documented;
- cleanup must refuse unmanaged targets;
- if implementation creates the literal sibling playground during local
  acceptance, it must also provide a safe way to remove it.

## Non-goals

- no broad playground product;
- no public eval framework;
- no install/upgrade lifecycle;
- no `ch upgrade`;
- no project registry;
- no project fleet management;
- no release packaging;
- no npm publishing or provenance work;
- no dashboard;
- no database;
- no schemas or migrations;
- no Phase 16 or later work.

Install/upgrade belongs to Phase 18.

Release/supply-chain hardening belongs to Phase 22.

## Eval corpus

- 5 bugfix;
- 5 feature;
- 5 refactor;
- 3 docs;
- 2 deployment/smoke.

The full 20-task corpus is manual release evaluation metadata, not the local
deterministic acceptance gate.

## Metrics

- pass rate;
- time to ready;
- manual interventions;
- failed checks;
- review usefulness;
- unsafe command blocks;
- abandoned worktrees;
- cost/limit pressure by agent role.

For local deterministic smoke:

- `review usefulness` must be recorded as `null`;
- `cost/limit pressure by agent role` must be recorded as `null`;
- manual release metrics remain template/guide only.

## Acceptance commands

```bash
npm run build
npm test
```

Phase 15 implementation must add the runnable commands needed to initialize,
exercise, and safely clean a managed disposable playground workspace, but this
task file does not define those command names yet.

## Acceptance behavior

- local deterministic acceptance is an external E2E smoke pass over a minimal
  disposable sibling workspace, not a weak directory-existence check;
- automated acceptance must execute 4 selected deterministic E2E scenarios from
  the stage list above;
- deterministic local smoke must pass without live LLM/API calls;
- `smoke-results.json` must contain deterministic metrics for all 4 executed
  local E2E scenarios;
- the full 20-task corpus must exist as metadata for manual release evaluation;
- the sibling `../codex-harness-playground` remains the literal local/manual
  acceptance workspace, while automated tests may use temp roots;
- full Codex-backed or multi-agent evaluation is manual release evaluation
  only, not a local acceptance gate;
- cleanup/remove behavior must be safe, must refuse unmanaged targets, and must
  be part of the accepted phase behavior;
- the product repo must remain free of generated `.harness/`, `.codex/`,
  `.agents/`, `schemas/`, and `migrations/` paths;
- findings may update roadmap wording later, but this phase does not implement
  Phase 16 or later architecture.
