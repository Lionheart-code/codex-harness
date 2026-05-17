# Phase 14 — Codex exec review

## Goal

Add optional automated review using `codex exec`.

## Scope

- `ch review --exec`;
- review prompt;
- review schema;
- `review.json`.

## Required behavior

- input: spec, acceptance, diff, verifier, agent/scout outputs if present;
- output: PASS or FIX_REQUIRED;
- blockers must be explicit;
- schema validation required;
- local schema validation must be testable without calling Codex;
- live `codex exec` smoke testing is optional/manual and must not be required for deterministic acceptance.

## Non-goals

No automatic coding loop.
No API dependency is required for acceptance.

## Acceptance commands

```bash
npm run build
node bin/ch review --help
```

## Acceptance behavior

- review can run manually or with exec;
- invalid JSON fails review;
- blockers prevent READY_FOR_HUMAN.
