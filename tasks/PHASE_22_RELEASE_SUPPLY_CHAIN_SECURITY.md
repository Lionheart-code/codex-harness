# Phase 22 — Release and supply-chain security

## Goal

Prepare `codex-harness` for safe package release and upgrade lifecycle.

## Scope

- define release checklist;
- define package contents policy;
- define dependency minimization policy;
- define npm provenance/trusted publishing plan;
- define changelog/version policy;
- define rollback/deprecation policy;
- add release dry-run checks.

## Non-goals

- no public publish required;
- no release automation in early MVP;
- no long-lived publishing token requirement;
- no dashboard.

## Acceptance commands

```bash
npm run build
npm pack --dry-run
```

## Acceptance behavior

- package contents are reviewable before release;
- release checklist exists;
- provenance/trusted publishing plan is documented;
- dependency and lockfile policy are documented;
- no secrets or harness runtime state are included in package output.
