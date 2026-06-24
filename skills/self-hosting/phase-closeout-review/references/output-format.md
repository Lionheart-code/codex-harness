# Output Format: Phase Closeout Review

Return Markdown with these sections in this order:

1. `## Closeout Readiness`
2. `## Harvest Readiness`
3. `## Deletion Safety`
4. `## Docs Freshness`
5. `## Remaining Blockers`
6. `## Recommendation`

Each readiness section must end with `ready`, `blocked`, or `not_applicable`.

`## Recommendation` must end with one of:

- `CLOSEOUT_ACCEPTED`
- `CLOSEOUT_ACCEPTED_WITH_DOC_FOLLOWUP`
- `CLOSEOUT_BLOCKED_READINESS`
- `CLOSEOUT_BLOCKED_SOURCE_OF_TRUTH_STALE`
