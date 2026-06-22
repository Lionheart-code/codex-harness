# Output Format: Plan Amend

Return Markdown with these sections in this order:

1. `## Review Finding Disposition`
2. `## Effective Plan Status`
3. `## Effective Scope`
4. `## Effective Steps`
5. `## Effective Validation`
6. `## Residual Risks`

Each review finding must be marked `accepted`, `rejected`, or `unresolved`.

The output is the effective amended plan for execution. If multiple amendments
exist for the same run, the latest amended plan supersedes earlier draft/amend
plan artifacts while preserving them as audit trail.
