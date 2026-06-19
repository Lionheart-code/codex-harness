# Output Format: Plan Review

Return Markdown with these sections in this order:

1. `## Review Tier`
2. `## Findings`
3. `## Scope And Boundary Check`
4. `## Policy Control Check`
5. `## Validation Check`
6. `## Durable Decision Record`
7. `## Recommendation`

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
