# Codex Harness — Implementation Roadmap

## Phase 0 — plan audit and document fix

Task:
`tasks/PHASE_00_PLAN_AUDIT_AND_DOC_FIX.md`

Goal:
Audit the master plan and apply document-only fixes before implementation starts.

## Rule

Only one phase may be implemented per Codex implementation run.

The whole roadmap is context for `/plan`, not permission to implement everything.

## Phase 1 — CLI skeleton

Task:
`tasks/PHASE_01_CLI_SKELETON.md`

Goal:
Create working TypeScript CLI foundation.

## Phase 2 — real installer

Task:
`tasks/PHASE_02_INSTALLER.md`

Goal:
Install repo-local harness layer safely and idempotently.

## Phase 3 — task state

Task:
`tasks/PHASE_03_TASK_STATE.md`

Goal:
Create and manage `.harness/tasks/<task-id>` state.

## Phase 4 — worktree

Task:
`tasks/PHASE_04_WORKTREE.md`

Goal:
Create one branch/worktree per task.

## Phase 5 — prompt builder

Task:
`tasks/PHASE_05_PROMPT_BUILDER.md`

Goal:
Generate task-aware prompts for Codex.

## Phase 6 — agent roles and capability matrix

Task:
`tasks/PHASE_06_AGENT_ROLES_MATRIX.md`

Goal:
Define which agent roles exist, what each role may do, how the harness will decide what to delegate, and how per-agent boundary profiles work.

## Phase 7 — read-only scout prompts

Task:
`tasks/PHASE_07_READ_ONLY_SCOUT_PROMPTS.md`

Goal:
Generate read-only scout prompts that can be run manually in Codex, Gemini CLI, or another trusted agent.

No automatic external-agent execution yet.

## Phase 8 — agent run ledger

Task:
`tasks/PHASE_08_AGENT_RUN_LEDGER.md`

Goal:
Record agent runs, prompts, outputs, statuses, and logs in `.harness/tasks/<task-id>/agents/<run-id>/`.

No automatic external-agent execution yet.

## Phase 9 — project memory and debt ledger

Task:
`tasks/PHASE_09_PROJECT_MEMORY_AND_DEBT.md`

Goal:
Track done/not-done status, decisions, debt, follow-ups, and compact project memory so large projects do not become a pile of disconnected agent outputs.

## Phase 10 — manual CLI agent adapter

Task:
`tasks/PHASE_10_MANUAL_CLI_AGENT_ADAPTER.md`

Goal:
Add an allowlisted manual/CLI adapter contract for local external agents in read-only mode.

API is not required.

## Phase 11 — capture/check

Task:
`tasks/PHASE_11_CAPTURE_CHECK.md`

Goal:
Capture diffs and run deterministic checks.

## Phase 12 — report

Task:
`tasks/PHASE_12_REPORT.md`

Goal:
Generate final human handoff report.

## Phase 13 — hooks

Task:
`tasks/PHASE_13_HOOKS.md`

Goal:
Install minimal sidecar Codex hooks.

## Phase 14 — codex exec review

Task:
`tasks/PHASE_14_CODEX_EXEC_REVIEW.md`

Goal:
Add optional automated review using `codex exec`.

## Phase 15 — playground evals

Task:
`tasks/PHASE_15_PLAYGROUND_EVALS.md`

Goal:
Create external playground and run deterministic plus optional LLM-backed evaluation.

## Phase 16 — parallel worktree agents

Task:
`tasks/PHASE_16_PARALLEL_WORKTREE_AGENTS.md`

Goal:
Allow multiple write-capable agents only when work can be safely split into separate worktrees with explicit integration.

## Phase 17 — harness governance and maintainer review

Task:
`tasks/PHASE_17_HARNESS_GOVERNANCE.md`

Goal:
Add a controlled maintainer-review loop for improving the harness itself using metrics, debt, task outcomes, agent failures, and optional external research.

## Phase 18 — install/upgrade and project registry

Task:
`tasks/PHASE_18_INSTALL_UPGRADE_REGISTRY.md`

Goal:
Clarify and implement safe update flow between the product repository and installed harness layers in target projects, including dry-run upgrades and optional project registry.

## Phase 19 — artifact schemas and migrations

Task:
`tasks/PHASE_19_ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`

Goal:
Add schema and migration discipline for machine-readable harness artifacts.

## Phase 20 — security, evals, context, and operator hardening

Task:
`tasks/PHASE_20_SECURITY_EVALS_CONTEXT_HARDENING.md`

Goal:
Add security/permission model, regression eval policy, context budget policy, and human operator manual.

## Phase 21 — platform compatibility and command runner hardening

Task:
`tasks/PHASE_21_PLATFORM_COMPATIBILITY.md`

Goal:
Harden command execution and acceptance testing so the harness works reliably on Windows, macOS, and Linux.

## Phase 22 — release and supply-chain security

Task:
`tasks/PHASE_22_RELEASE_SUPPLY_CHAIN_SECURITY.md`

Goal:
Define and implement package dry-run verification, CI/PR release gates, provenance/trusted-publishing preparation, dependency policy, and safe upgrade release notes without publishing.

## Stop rule

After every phase:

1. Run acceptance.
2. Review diff.
3. Commit.
4. Update `TASK.md` to point to the next phase.
5. Start a new `/plan` run.
