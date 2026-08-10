# Output Format: DB Storage Review

Return Markdown with these sections in this order:

1. `## Review Tier`
2. `## Authority Model Check`
3. `## Lifecycle And Delivery-facts Check`
4. `## Harvest And Deletion Check`
5. `## Recommendation`

If the work violates Phase 23.5 authority rules, say so in `## Recommendation`.

Every finding uses the closed Phase 23.9 finding classification and identifies
its decision/trace intersections. The artifact carries the shared bundle
identity and registry-resolved `phase-23.9.planning-lens-result.v1` contract.
`## Recommendation` ends with a bare `PASS`, `AMEND_REQUIRED`, or `BLOCKED`
line.
