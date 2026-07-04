# Phase 23.8.6B2 - Verification Command Rationalization and Serialization

## Status

Planned. Starts only after Phase 23.8.6B1 Supervised Review Launch and Blocked
Disposition is complete, reviewed, accepted, and merged.

## Purpose

Rationalize full-pack verification authority so future/live task contracts stop
treating duplicate npm aliases as separate proof.

## Problem

Repo authority currently exposes both `npm test` and
`npm run test:acceptance`, while both package scripts map to the same
acceptance runner entrypoint. That creates two avoidable failure modes:

- task contracts can require both aliases as if they were distinct proof;
- operators can launch the aliases concurrently in the same workspace/runtime
  context and create duplicate or conflicting full-pack evidence.

The remaining gap is not missing intra-run serialization. Current repo code
already serializes a single acceptance-runner invocation with
`--test-concurrency=1`.

## Scope

This is a narrow verification-policy and authority-surface phase.

## Required behavior

- Designate one canonical full-pack verification command for required proof:
  `npm test`.
- Treat `npm run test:acceptance` as a compatibility alias to the same
  full-pack runner, not as independent proof.
- Record in repo-owned authority that the current runner already serializes a
  single invocation with `--test-concurrency=1`.
- Update only live/current or immediate planned/future authority surfaces that
  still imply both aliases are required as separate proof.
- State that full-pack aliases must not be launched concurrently in the same
  workspace/runtime context.
- Keep verification-command rationalization separate from the supervised review
  launch, artifact validation, and blocked-disposition handling that belong in
  Phase 23.8.6B1.
- If this phase associates verification results with durable run history, key
  or resolve those records through exact run identity rather than display
  `run_id` alone.
- Keep the wording tied to current repo facts rather than generic test-policy
  language.
- Produce a narrow verification-guidance correction, not a broad test-policy
  rewrite.

## Non-goals

- No package-script changes.
- No CI changes.
- No acceptance-runner code changes.
- No locking redesign.
- No new test harness.
- No runtime feature implementation.
- No domain-pack behavior.

## Acceptance commands

```bash
git diff --check
```

## Acceptance behavior

- Repo-owned live/future authority surfaces identify `npm test` as the
  canonical full-pack verification command.
- Repo-owned live/future authority surfaces describe
  `npm run test:acceptance` as a compatibility alias only.
- No edited authority surface implies the runner lacks internal serialization.
- No edited authority surface requires both aliases as separate proof.
- No edited authority surface permits concurrent launch of full-pack aliases in
  the same workspace/runtime context.
- Historical/accepted task history is not broadly rewritten just to clean old
  wording.
- If a lightweight repo-owned docs/task validation command exists in the
  implementation context, it must also pass.
- If a full-pack proof is needed to confirm the wording against current code,
  run `npm test` once only.
- Do not run `npm test` and `npm run test:acceptance` as separate proof.
- Never launch the two full-pack aliases in parallel.

## Source/runtime boundary

This phase is docs/task/verification-guidance authority only. It must not
change runtime code, package scripts, CI, or acceptance-runner behavior.

## Relationship to previous and next phases

- Follows Phase 23.8.6B1 so the verification-policy wording can align with the
  checked-in self-hosting review/launch policy and consume B1 blocked
  disposition only as upstream evidence.
- Prepares Phase 23.8.6C, Phase 23.8.6D, Phase 23.8.6E, Phase 23.8.7, and
  Phase 23.9 to reference one canonical full-pack proof path.
- Does not replace Phase 30 bounded experimentation or Phase 31 reviewed
  runner execution.

## Final report expectations

The implementation report for this phase must state:

- which live/future authority surfaces were updated;
- which historical/accepted surfaces were intentionally left untouched;
- the confirmed `npm test` vs `npm run test:acceptance` repo finding;
- whether any lightweight docs/task validation command exists;
- verification results;
- remaining debt or downstream surfaces intentionally deferred.
