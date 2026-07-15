# Self-hosting Procedure Wrapper: `verification-review`

This wrapper is a derived, non-authoritative invocation helper.

Canonical authority:

- `skills/self-hosting/verification-review/SKILL.md`
- `skills/self-hosting/verification-review/references/output-format.md`
- `skills/self-hosting/verification-review/references/source-notes.md`

Before acting, read `TASK.md`, the active task file named by `TASK.md`, and the
canonical files above. Use the required inputs, preconditions, forbidden scope,
checklist, blocker conditions, and evidence contract from the canonical
procedure files.

Run only the `verification-review` procedure. Return the exact output format
from `references/output-format.md`, or the procedure's blocker format if the
required inputs are missing.

If the local verification evidence is being produced by
`node bin/ch run verify --run <run-id>`, expect the full self-hosting pack to
commonly take 10-16 minutes as the suite grows. Wait for the live process to
exit and do not start a duplicate verification run while it is still active.
Use the per-command `duration_ms` values and final
`verification_duration_ms` only to compare like-for-like command sets; the
normal observation window is not a timeout or success claim.

Do not broaden scope, implement files, repair `.harness/runs/**/run.json`, start
a run, launch a runner, create or claim a worktree, or treat this wrapper as
runtime authority.
