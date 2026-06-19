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

Inside `## Ordered Implementation Steps`:

- make one recommended execution path explicit;
- surface alternatives only where more than one rational path remains;
- surface operator choice points only where a human decision is actually
  needed;
- say so explicitly when no real operator choice remains.

`## Reviewer Policy Checks` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

If blocked, replace sections 7 and 8 with `## Blockers`.
