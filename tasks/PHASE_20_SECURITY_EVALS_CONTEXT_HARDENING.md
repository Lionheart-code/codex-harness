# Phase 20 — Security, evals, context, and operator hardening

## Goal

Add the final hardening layer for permissions, regression evals, context budgets, and human operation.

## Scope

- implement/document security permission model;
- implement/document regression eval suite;
- implement/document context budget policy;
- create/maintain human operator manual;
- add helper commands where appropriate:
  - `ch security doctor`;
  - `ch eval`;
  - `ch context inspect`.

## Non-goals

- no dashboard;
- no API requirement;
- no auto-merge;
- no autonomous self-modification;
- no external agent enabled by default.

## Acceptance commands

```bash
npm run build
node bin/ch --help
```

## Acceptance behavior

- permissions are explicit;
- deterministic evals do not require internet/API;
- prompt context has a budget policy;
- operator manual explains safe workflow;
- no new external capability is enabled by default.
