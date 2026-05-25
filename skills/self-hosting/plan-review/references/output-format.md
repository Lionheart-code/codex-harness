# Output Format: Plan Review

Return Markdown with these sections in this order:

1. `## Review Tier`
2. `## Findings`
3. `## Scope And Boundary Check`
4. `## Policy Control Check`
5. `## Validation Check`
6. `## Recommendation`

`## Policy Control Check` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

`## Recommendation` must end with either `PASS` or `AMEND_REQUIRED`.
