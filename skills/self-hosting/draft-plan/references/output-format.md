# Output Format: Draft Plan

Return Markdown with these sections in this order:

1. `## Objective`
2. `## Included`
3. `## Excluded`
4. `## Source Inputs And Surfaces`
5. `## Implementation Surfaces`
6. `## Assumptions`
7. `## Risks And Open Questions`
8. `## Reviewer Policy Checks`
9. `## Ordered Implementation Steps`
10. `## Validation Matrix`
11. `## Stop Conditions And Handoff`

Inside `## Source Inputs And Surfaces`, include:

- task, roadmap, procedure, and policy inputs used;
- source files or modules likely to change;
- runtime state or run-local artifacts that must be inspected;
- tests or fixtures likely to change.

Inside `## Implementation Surfaces`, include:

- CLI or command surfaces;
- runtime/core surfaces;
- registry/schema/procedure surfaces;
- evidence/artifact/storage surfaces;
- operator-status or lifecycle surfaces;
- tests and docs surfaces.

Inside `## Ordered Implementation Steps`:

- make one recommended execution path explicit;
- surface alternatives only where more than one rational path remains;
- surface operator choice points only where a human decision is actually
  needed;
- name the source surfaces and validation signal for each meaningful step;
- say so explicitly when no real operator choice remains.

Inside `## Validation Matrix`, map each acceptance behavior or material risk to
a command, focused test, inspection, or review evidence item.

Inside `## Stop Conditions And Handoff`, include:

- blockers that require stopping before implementation;
- permission or authority conflicts;
- storage or evidence gaps;
- scope drift triggers;
- the exact condition that makes the plan ready for plan-review and later
  implementation.

`## Reviewer Policy Checks` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

If blocked, replace sections 7 and 8 with `## Blockers`.
