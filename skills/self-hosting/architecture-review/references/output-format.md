# Output Format: Architecture Review

Return Markdown with these sections in this order:

1. `## Review Surface`
2. `## Review Tier`
3. `## Core Boundary Findings`
4. `## Future-phase Creep Check`
5. `## Source Trace`
6. `## Keep Or Defer Decision`
7. `## Risks`

If the work must be split, say so in `## Keep Or Defer Decision`.

Every finding uses the closed Phase 23.9 finding classification and identifies
its decision/trace intersections. The artifact carries the shared bundle
identity and registry-resolved `phase-23.9.planning-lens-result.v1` contract.
`## Keep Or Defer Decision` ends with a bare `PASS`, `AMEND_REQUIRED`, or
`BLOCKED` line.
