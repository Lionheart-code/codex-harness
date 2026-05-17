# Codex Harness — Start Here

This package is the complete master-plan package for building `codex-harness`.

## What this package contains

- Full architecture.
- Full implementation roadmap.
- Detailed task files for all phases.
- Operations plan.
- Acceptance criteria.
- Risk review checklist.
- `/plan` prompt for Codex.
- Current-task review prompt.

## How to use with Codex `/plan`

1. Create a new repository:

```bash
mkdir codex-harness
cd codex-harness
git init
```

2. Copy all files from this package into the repository.

3. Commit the copied master-plan package as the baseline:

```bash
git add .
git commit -m "Add codex-harness master plan"
```

4. Open Codex in this repository.

5. Enable `/plan`.

6. Paste:

```text
prompts/00-slash-plan-master.md
```

7. Codex must review the whole system for holes and then produce an implementation plan for the current task only.

8. Current task is defined in:

```text
TASK.md
```

9. If the `/plan` output is scoped to the current task, confirm implementation.

10. If it includes later phases, reject it and say:

```text
Reduce scope to TASK.md only. Keep later phases as roadmap, not implementation.
```

11. After implementation, run the acceptance commands from the current task file.

12. Review with:

```text
prompts/99-review-current-task.md
```

## Current task

Current task is initially:

```text
tasks/PHASE_00_PLAN_AUDIT_AND_DOC_FIX.md
```

Do not implement Phase 1 until Phase 0 passes acceptance and is committed.

After Phase 0 is committed, update `TASK.md` to:

```text
tasks/PHASE_01_CLI_SKELETON.md
```
