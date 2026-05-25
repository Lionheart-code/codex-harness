# Output Format: Draft Plan

Return Markdown with these sections in this order:

1. `## Objective`
2. `## Included`
3. `## Excluded`
4. `## Assumptions`
5. `## Risks`
6. `## Reviewer Policy Checks`
7. `## Ordered Implementation Steps`
8. `## Validation`

`## Reviewer Policy Checks` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

If blocked, replace sections 7 and 8 with `## Blockers`.
