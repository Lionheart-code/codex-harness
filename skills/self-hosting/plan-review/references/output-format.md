# Output Format: Plan Review

Return Markdown with these sections in this order:

1. `## Review Surface`
2. `## Review Tier`
3. `## Findings`
4. `## Scope And Boundary Check`
5. `## Policy Control Check`
6. `## Source Trace`
7. `## Skill Risk Check`
8. `## Validation Check`
9. `## Recommendation`

`## Policy Control Check` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

`## Recommendation` must end with either `PASS` or `AMEND_REQUIRED`.
