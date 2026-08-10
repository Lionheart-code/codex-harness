# Self-hosting Procedure Wrapper: `plan-review`

This wrapper is a derived, non-authoritative invocation helper.

Canonical authority:

- `skills/self-hosting/plan-review/SKILL.md`
- `skills/self-hosting/plan-review/references/output-format.md`
- `skills/self-hosting/plan-review/references/source-notes.md`

Before acting, read `TASK.md`, the active task file named by `TASK.md`, and the
canonical files above. Use the required inputs, preconditions, forbidden scope,
checklist, blocker conditions, and evidence contract from the canonical
procedure files.

Run only the `plan-review` procedure. Return the exact output format from
`references/output-format.md`, or the procedure's blocker format if the required
inputs are missing.
When invoked in a planning bundle, keep this lens a separate canonical artifact
bound to the shared identity. Resolve its exact schema/version from the registry.

Use only the canonical `outcome_state` tokens listed in the output format. Do
not invent aliases or more human-readable replacements.

Do not broaden scope, implement files, repair `.harness/runs/**/run.json`, start
a run, launch a runner, create or claim a worktree, or treat this wrapper as
runtime authority.
