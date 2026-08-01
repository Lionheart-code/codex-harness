# Self-hosting Procedure Wrapper: `draft-plan`

This wrapper is a derived, non-authoritative invocation helper.

Canonical authority:

- `skills/self-hosting/draft-plan/SKILL.md`
- `skills/self-hosting/draft-plan/references/output-format.md`
- `skills/self-hosting/draft-plan/references/source-notes.md`

Before acting, read `TASK.md`, the active task file named by `TASK.md`, and the
canonical files above. Use the required inputs, preconditions, forbidden scope,
checklist, blocker conditions, and evidence contract from the canonical
procedure files.

Run only the `draft-plan` procedure. Return the exact output format from
`references/output-format.md`, or the procedure's blocker format if the required
inputs are missing.
Resolve the format/version from the checked-in registry and canonical reference;
this wrapper supplies no independent format authority.

Do not broaden scope, implement files, repair `.harness/runs/**/run.json`, start
a run, launch a runner, create or claim a worktree, or treat this wrapper as
runtime authority.
