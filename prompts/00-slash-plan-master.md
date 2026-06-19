# /plan prompt — Codex Harness Master Plan

You are in `/plan` mode.

Read:

- `AGENTS.md`
- `TASK.md`
- `README_START_HERE.md`
- `docs/MASTER_ARCHITECTURE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OPERATIONS_PLAN.md`
- `docs/RISK_REVIEW_CHECKLIST.md`
- `docs/PHASE_ACCEPTANCE.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/PROJECT_MEMORY_AND_DEBT.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/RELEASE_AND_SUPPLY_CHAIN_SECURITY.md`
- `docs/PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md`
- `docs/CONTEXT_BUDGET_POLICY.md`
- `docs/HARNESS_EVALS_AND_REGRESSION.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`
- all files in `tasks/`
- all files in `prompts/`
- the task file referenced by `TASK.md`


Your job in `/plan` mode:

1. Review the whole system for holes, contradictions, missing acceptance criteria, and scope risks.
2. Do not implement code yet.
3. Produce a concrete implementation plan for the current task only.
4. Check whether the master-plan package was committed as a baseline before Phase 0, so diff/review is meaningful.
4. Keep later phases as roadmap context only.
5. If the current task is too broad or unsafe, say so.
6. If documents conflict, identify the conflict and propose the smallest document fix.
7. Do not add new product features.
8. Do not propose database, dashboard, swarm, or auto-merge.
9. Explain how the plan avoids unnecessary abstraction, invariant violations,
   scope creep, docs/task/prompt/skill inconsistency, future-phase leakage,
   and evidence-free claims.
10. If the current task is `high` or `extra-high` tier, name the required
    review controls explicitly.
11. Recommend one execution path, surface only real operator choices, and do
    not invent fake alternatives when repo context already determines the
    answer.

Output format:

```text
SYSTEM_REVIEW:
- <holes/risks found, or "No blocking holes">

CURRENT_TASK:
- <task file>

IMPLEMENTATION_PLAN:
1. ...
2. ...
3. ...

FILES_TO_CREATE_OR_CHANGE:
- ...

REVIEWER_POLICY_CHECKS:
- anti_slop:
  - ...
- design_invariant:
  - ...
- scope_legality:
  - ...
- evidence_gap:
  - ...
- docs_consistency:
  - ...
- future_phase_leakage:
  - ...
- review_tier_controls:
  - ...

ACCEPTANCE_COMMANDS:
- ...

DO_NOT_IMPLEMENT:
- ...

READY_TO_IMPLEMENT:
YES | NO
```

If `READY_TO_IMPLEMENT: YES`, implementation may proceed only for the current task.
