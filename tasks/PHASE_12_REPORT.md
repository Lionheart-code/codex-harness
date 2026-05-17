# Phase 12 — Report

## Goal

Generate final handoff report.

## Scope

- `ch report`;
- `result.md`.

## Report includes

- task summary;
- changed files;
- checks status;
- scout/agent run summaries if present;
- known risks;
- human next step;
- merge recommendation.

## Non-goals

No auto-merge.

## Acceptance commands

```bash
npm run build
node bin/ch report --help
```

## Acceptance behavior

- report can be read without chat history;
- report references diff/check outputs;
- no PASS claim without verifier result.
