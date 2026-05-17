# Phase 19 — Artifact schemas and migrations

## Goal

Add schema and migration discipline for machine-readable harness artifacts.

## Scope

- create `schemas/` for core artifacts;
- define migration folder and naming convention;
- add schema validation command;
- add migration dry-run policy;
- document fail-closed behavior for unknown schema versions.

## Artifacts in scope

- install metadata;
- task state;
- verifier output;
- review output;
- agent run status;
- debt ledger;
- decision record;
- adapter profile;
- governance proposal.

## Non-goals

- no database;
- no vector store;
- no automatic migration without dry-run;
- no hidden global state.

## Acceptance commands

```bash
npm run build
node bin/ch schema --help
```

## Acceptance behavior

- schemas exist for core machine-readable artifacts;
- migrations are explicit and versioned;
- unknown schema versions fail clearly;
- upgrade/migration has dry-run behavior.
