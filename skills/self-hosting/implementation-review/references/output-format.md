# Output Format: Implementation Review

Return Markdown with these sections in this order:

1. `## Review Surface`
2. `## Findings`
3. `## Task And Plan Compliance`
4. `## Verification Coverage`
5. `## Policy Findings`
6. `## Source Trace`
7. `## Skill Risk Check`
8. `## Scope Creep Check`
9. `## Recommendation`

`## Policy Findings` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

`## Recommendation` must end with either `PASS` or `FIX_REQUIRED`.
