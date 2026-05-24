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

## Phase 22.5 — core runtime normalization

Task:
`tasks/PHASE_22_5_CORE_RUNTIME_NORMALIZATION.md`

Goal:
Normalize current CLI, phase, check, review, and report behavior into a shared
runtime model before Memory/Evidence Core work begins.

Status:
Planned. Blocked until Phase 22 release/package/CI baseline is closed and verified.

This is an architectural normalization step only. Do not implement it during
Phase 22.

## Phase 23 — memory/evidence core

Task:
`tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md`

Goal:
Build durable local Memory/Evidence Core on top of the normalized runtime model
introduced by Phase 22.5.

Status:
Implemented in the Phase 23 Memory/Evidence Core slice after Phase 22.5.

Phase 23 must preserve Phase 22.5 verification-reuse design as evidence-backed
exact-match replay using `VerifiedSnapshot` / `ChangeSetFingerprint`, with
SQLite as indexed projection, JSONL as append-only trace, and large raw
artifacts referenced from ArtifactStore by hash or id.

Phase 23 remains the historical/bootstrap memory/evidence slice. Phase 23.5
reconciles the authority model before later reports or self-hosting workflow
layers are trusted.

Implemented scope:

- `.harness/evidence/events.jsonl` is the local append-only source-of-trace;
- `.harness/evidence/projection.sqlite` is a rebuildable projection behind a typed adapter and runtime `node:sqlite` probe;
- `.harness/artifacts/sha256/<prefix>/<hash>` stores large raw artifacts by content hash;
- `ch memory` exposes minimal init/status/rebuild/runs/show/export dry-run commands without raw SQL;
- runtime commands record evidence while preserving Phase 22.5 run vocabulary;
- local verification reuse is exact input-set evidence reuse and never replaces remote CI.

## Phase 23.5 — DB-first Memory, Lifecycle Core, and Hooks Reconciliation

Task:
`tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`

Goal:
Make project memory and self-hosting lifecycle safe enough for later reports,
packets, plan-review workflow, and agent access.

Status:
Implemented after Phase 23 as the DB-first memory/lifecycle correction slice.

Implemented scope:

- `.harness/memory/project.sqlite` is the accepted Project Memory authority;
- `.harness/runs/<run-id>/staging.sqlite` is the active run/worktree write target;
- `.harness/evidence/events.jsonl` and `projection.sqlite` remain audit and compatibility layers, not primary operational memory authority;
- large decision-useful payloads are chunked into SQLite payload tables with retention/redaction metadata;
- delivery facts can be imported into staging memory and used for closeout;
- `run_mode` is distinct from `lifecycle_status`;
- closed runs are not deletable until harvest, explicit discard, or manual override;
- hooks remain guardrails and write only local/runtime-side state, not accepted Project Memory authority.

## Phase 23.6 — Self-hosting Skills and Plan-Review Workflow Bootstrap

Task:
`tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`

Goal:
Make codex-harness development less manual by adding repo-owned self-hosting
procedures, large-work decomposition, a lightweight self-hosting agent
operating policy, and a basic plan-review workflow.

Status:
Closed by owner decision. Do not reopen unless repository evidence proves a
blocking defect that invalidates the closure.

## Phase 23.7 — Minimum Self-Hosting Operator Interpreter

Task:
`tasks/PHASE_23_7_MINIMUM_SELF_HOSTING_OPERATOR_INTERPRETER.md`

Goal:
Make the Phase 23.6 self-hosting workflow machine-visible by reporting current
stage, next procedure, missing evidence, blockers, review tier, and next allowed
action.

Status:
Next active implementation phase. Thin projection/status/routing layer over
Phase 23.6 procedures. Must not create a new workflow, implement packets,
provider routing, domain packs, proof framework, or DB schema migration unless
projection proves insufficient.

## Phase 23.8 — Agent-native Procedure Registry and Skill Surface

Task:
`tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`

Goal:
Materialize and validate the existing Phase 23.6 procedure surface so agents can
discover procedure metadata without treating generated discovery targets as
canonical source.

Status:
Planned. Blocked until Phase 23.7 is complete and reviewed.
`skills/self-hosting/**` remains canonical.

## Phase 23.9 — Minimal Proof-Carrying Work and Review Policy

Task:
`tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md`

Goal:
Add a minimal proof/evidence/assumption/review mapping over existing
review/evidence/closeout flow.

Status:
Planned. Blocked until Phase 23.8 is complete and reviewed. This phase must not
become a separate lifecycle authority. Operator/proof schemas remain provisional
sketches unless tightened during implementation.

## Phase 24 — reports and LLM-ready evidence packets

Task:
`tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`

Goal:
Turn accepted project memory into deterministic reports and bounded evidence
packets.

Status:
Planned amended phase. Delayed until Phase 23.7-23.9
operator/procedure/proof foundations are complete and reviewed. Phase 24 must
consume operator/procedure/proof state and must not decide lifecycle status.

## Phase 25 — agent access layer

Task:
`tasks/PHASE_25_AGENT_ACCESS_LAYER.md`

Goal:
Expose governed access to runtime, memory, reports, and packets through shared
core services, with CLI/Direct API first and MCP optional.

Status:
Planned amended phase. Blocked until amended Phase 24 is complete and reviewed.
Must preserve Direct API/CLI first, optional MCP only, read-only defaults,
redaction, query limits, no raw SQL by default, approval-gated mutations, no
autonomous agent, and no external write connector.

## Phase 26 — Big Task Decomposer and Architect Planner

Task:
`tasks/PHASE_26_BIG_TASK_DECOMPOSER_AND_ARCHITECT_PLANNER.md`

Goal:
Extend the existing `feature-decomposition` procedure into a stronger
architect/planner layer for large tasks.

Status:
Planned. Blocked until Phase 25 is complete and reviewed. Produces reviewable
task graph proposals and first-task recommendations. Does not execute generated
tasks and does not approve its own scope.

## Phase 27 — domain pack / skills architecture

Task:
`tasks/PHASE_27_DOMAIN_PACK_SKILLS_ARCHITECTURE.md`

Goal:
Introduce local, validated domain packs without putting domain logic into core.

Status:
Planned re-slotted phase. Blocked until Phase 26 is complete and reviewed.
Preserves the existing domain-pack ABI/safety design: local/static/non-executing
pack loading, manifest and compatibility policy, fail-closed validation,
domain-neutral core, no operational Ozon/CRM/marketing logic in core, and no
domain runtime data committed to the core repo by default.

## Phase 28 — Domain Ingestion and Schema Evolution Safety

Task:
`tasks/PHASE_28_DOMAIN_INGESTION_AND_SCHEMA_EVOLUTION_SAFETY.md`

Goal:
Define safe ingestion and schema-evolution primitives for future domain packs.

Status:
Planned. Blocked until Phase 27 is complete and reviewed. No production
Ozon/CRM/marketing system and no automatic schema mutation from new data points.

## Phase 29 — Prior-Art Discovery Gate

Task:
`tasks/PHASE_29_PRIOR_ART_DISCOVERY_GATE.md`

Goal:
Turn the Gate 0 research protocol into a reusable, operator-aware discovery
module.

Status:
Planned. Blocked until Phase 28 is complete and reviewed. Focused research
checkpoints remain available earlier where task risk requires them.

## Phase 30 — Bounded Agent Experimentation Loop

Task:
`tasks/PHASE_30_BOUNDED_AGENT_EXPERIMENTATION_LOOP.md`

Goal:
Add a bounded experimentation primitive after operator/procedure/proof/evaluator
fixtures exist.

Status:
Planned experimental. Blocked until Phase 29 is complete and reviewed. Not
uncontrolled self-improvement, not autonomous product development, and not a
replacement for architecture review.

## Pilot — Research Ops pack

Task:
`tasks/PILOT_RESEARCH_OPS_PACK.md`

Goal:
Validate a read-mostly, provenance-oriented non-code domain pack.

Status:
Planned. Blocked until Phase 27 domain-pack architecture is complete and
reviewed.

## Experimental — Marketing Ops pack

Task:
`tasks/EXPERIMENTAL_MARKETING_OPS_PACK.md`

Goal:
Stress-test domain packs against higher-risk marketing workflows while staying
draft/report/recommend-only.

Status:
Planned experimental. Blocked until the Research Ops pilot is complete and
reviewed.

## Stop rule

After every phase:

1. Run acceptance.
2. Review diff.
3. Commit.
4. Update `TASK.md` to point to the next phase.
5. Start a new `/plan` run.
