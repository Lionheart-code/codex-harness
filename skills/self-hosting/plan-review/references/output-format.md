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
9. `## Durable Decision Record`
10. `## Recommendation`

`## Policy Control Check` must include these labels in order:

- `anti_slop:`
- `design_invariant:`
- `scope_legality:`
- `evidence_gap:`
- `docs_consistency:`
- `future_phase_leakage:`
- `review_tier_controls:`

`## Recommendation` must end with either `PASS` or `AMEND_REQUIRED`.

`## Durable Decision Record` must be compact and operator-readable. It must
include these labels in order:

- `verdict:`
- `outcome_state:`
- `blocking_findings:`
- `required_amendments:`
- `accepted_defaults:`
- `real_operator_choices:`
- `next_allowed_action:`
- `validation_required:`
- `source_trace:`
- `future_phase_deferrals:`
