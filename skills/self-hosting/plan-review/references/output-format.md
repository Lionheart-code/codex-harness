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

Every finding must include exactly one classification:
`PLAN_BLOCKER`, `IMPLEMENTATION_DISCRETION`,
`IMPLEMENTATION_REVIEW_CHECK`, or `DEFERRED_DEBT`, plus its primary lens,
secondary affected lenses, decision IDs, and trace IDs.

The artifact must carry the registry-resolved
`phase-23.9.planning-lens-result.v1` identity fields. Schema validation occurs
before bundle ingestion.

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

Allowed `outcome_state` values:

- `ready_for_implementation`
- `needs_contract_surface_update`
- `decision_required`
- `blocked`

Required mapping:

- Use `ready_for_implementation` only when `verdict: PASS` and
  `required_amendments: none`.
- Use `needs_contract_surface_update` when the plan needs `plan-amend` before
  approval.
- Use `decision_required` when the reviewer cannot safely choose the route and
  an owner/operator decision is required.
- Use `blocked` when the review cannot safely proceed.

Do not invent aliases or human-readable variants for `outcome_state`. The
durable decision record must use the canonical runtime/registry tokens above.
