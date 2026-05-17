# Phase 0 — Plan audit and document fix

## Goal

Audit the master plan before implementation and apply only the smallest document fixes needed to make Phase 1 safe to implement.

## Scope

- read `AGENTS.md`;
- read `TASK.md`;
- read `README_START_HERE.md`;
- read all files in `docs/`;
- read all files in `tasks/`;
- read all files in `prompts/`;
- identify contradictions, missing steps, weak acceptance criteria, future-phase leakage, unsafe assumptions, scope creep, and economic inefficiency;
- update only plan/task/documentation files when fixes are required.

## Non-goals

Do not implement code.
Do not create the CLI.
Do not add runtime dependencies.
Do not introduce a database, dashboard, swarm, auto-merge, proof-loop dependency, or API-only workflow.
Do not expand the MVP.

## Allowed changes

Only documentation, prompt, or planning files may be changed:

- `AGENTS.md`
- `TASK.md`
- `README_START_HERE.md`
- `docs/*`
- `tasks/*`
- `prompts/*`

## Forbidden changes

Do not create or modify implementation/runtime files:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `bin/*`
- `src/*`
- `.codex/*`
- `.harness/*`
- `.agents/*`
- `schemas/*`
- `migrations/*`

## Audit checklist

Check:

1. Are all phases present and ordered correctly?
2. Does every current/near-current phase have scope, non-goals, acceptance commands, and acceptance behavior?
3. Does Phase 1 avoid Phase 2+ work?
4. Is the architecture simple enough for MVP?
5. Are hooks kept as sidecar, not core runtime?
6. Is `repo-task-proof-loop` excluded as a runtime dependency?
7. Is there any hidden dependency on API, database, dashboard, subagents, or auto-merge?
8. Are operator instructions clear enough?
9. Is the economics correct: one strong audit, then small phase implementations?
10. Are there contradictions between documents?

## Acceptance commands

```bash
test -f AGENTS.md
test -f TASK.md
grep -q 'tasks/PHASE_00_PLAN_AUDIT_AND_DOC_FIX.md' TASK.md
test -f README_START_HERE.md
test -f docs/MASTER_ARCHITECTURE.md
test -f docs/IMPLEMENTATION_ROADMAP.md
test -f docs/OPERATIONS_PLAN.md
test -f docs/RISK_REVIEW_CHECKLIST.md
test -f docs/PHASE_ACCEPTANCE.md
test -f docs/AGENT_BOUNDARIES_AND_ADAPTERS.md
test -f docs/PROJECT_MEMORY_AND_DEBT.md
test -f docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md
test -f docs/PRODUCT_VS_PROJECT_LAYER.md
test -f docs/HUMAN_OPERATOR_MANUAL.md
test -f docs/RELEASE_AND_SUPPLY_CHAIN_SECURITY.md
test -f docs/PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md
test -f docs/CONTEXT_BUDGET_POLICY.md
test -f docs/HARNESS_EVALS_AND_REGRESSION.md
test -f docs/SECURITY_AND_PERMISSION_MODEL.md
test -f docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md
test -f tasks/PHASE_00_PLAN_AUDIT_AND_DOC_FIX.md
test -f tasks/PHASE_01_CLI_SKELETON.md
test -f tasks/PHASE_02_INSTALLER.md
test -f tasks/PHASE_03_TASK_STATE.md
test -f tasks/PHASE_04_WORKTREE.md
test -f tasks/PHASE_05_PROMPT_BUILDER.md
test -f tasks/PHASE_06_AGENT_ROLES_MATRIX.md
test -f tasks/PHASE_07_READ_ONLY_SCOUT_PROMPTS.md
test -f tasks/PHASE_08_AGENT_RUN_LEDGER.md
test -f tasks/PHASE_09_PROJECT_MEMORY_AND_DEBT.md
test -f tasks/PHASE_10_MANUAL_CLI_AGENT_ADAPTER.md
test -f tasks/PHASE_11_CAPTURE_CHECK.md
test -f tasks/PHASE_12_REPORT.md
test -f tasks/PHASE_13_HOOKS.md
test -f tasks/PHASE_14_CODEX_EXEC_REVIEW.md
test -f tasks/PHASE_15_PLAYGROUND_EVALS.md
test -f tasks/PHASE_16_PARALLEL_WORKTREE_AGENTS.md
test -f tasks/PHASE_17_HARNESS_GOVERNANCE.md
test -f tasks/PHASE_18_INSTALL_UPGRADE_REGISTRY.md
test -f tasks/PHASE_19_ARTIFACT_SCHEMAS_AND_MIGRATIONS.md
test -f tasks/PHASE_20_SECURITY_EVALS_CONTEXT_HARDENING.md
test -f tasks/PHASE_21_PLATFORM_COMPATIBILITY.md
test -f tasks/PHASE_22_RELEASE_SUPPLY_CHAIN_SECURITY.md
test -f prompts/00-slash-plan-master.md
test -f prompts/99-review-current-task.md
git status --short --untracked-files=all
! git status --short --untracked-files=all | grep -E ' (package.json|package-lock.json|tsconfig.json|bin/|src/|\.codex/|\.harness/|\.agents/|schemas/|migrations/)'
```

## Acceptance behavior

- only documentation, prompt, or task-plan files are changed;
- `TASK.md` still points to `tasks/PHASE_00_PLAN_AUDIT_AND_DOC_FIX.md` during Phase 0;
- no source code, package manifest, installer, CLI, hooks, or generated runtime files are created;
- Phase 1 has explicit files, commands, non-goals, and dry-run acceptance;
- future phases remain roadmap context only;
- after commit, `TASK.md` may be advanced to `tasks/PHASE_01_CLI_SKELETON.md`.
