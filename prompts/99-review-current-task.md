# Review prompt — current task

Review the current git diff against the task referenced by `TASK.md`.

Read:

- `TASK.md`
- the current task file;
- `docs/PHASE_ACCEPTANCE.md`.

Do not suggest later-phase functionality.

Check:

1. Does the diff satisfy the current task acceptance criteria?
2. Are all required files present?
3. Are non-goals respected?
4. Is the implementation simple and maintainable?
5. Are there blockers before commit?
6. Did the implementation accidentally include future phases?

Return exactly:

```text
PASS
```

or:

```text
FIX_REQUIRED

Blockers:
- ...
```
