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
Complete and closed.
Delivered:
- `node bin/ch run status --operator [--run <run-id>] [--dry-run]`
- thin projection/status/routing layer over Phase 23.6 procedures
- no new parallel workflow and no out-of-scope provider/domain/proof
  implementation
Lifecycle notes:
- PR #6 merged to `main`
- post-merge local verification passed:
  `npm run build`,
  `node --test tests/acceptance/phase23-7-operator-status.test.mjs`,
  `node --test tests/acceptance/phase23-6-self-hosting-skills-plan-review-bootstrap.test.mjs tests/acceptance/self-hosting-review-policy-hardening.test.mjs`,
  `git diff --check`,
  clean `git status`

## Phase 23.8 — Agent-native Procedure Registry and Skill Surface

Task:
`tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`

Goal:
Materialize and validate the existing Phase 23.6 procedure surface so agents can
discover procedure metadata without treating generated discovery targets as
canonical source.

Status:
Complete, reviewed, and accepted. Its authority-rebase outputs remain the
baseline for the current 23.8.5-23.9 chain, but `TASK.md` is the active
worktree operator pointer and stale older "23.8.5 active" wording must not
override it.
`skills/self-hosting/**` remains canonical.
The bounded source-of-truth and procedure-surface patch is the accepted
pre-registry baseline. The current phase materializes the checked-in registry
and minimal operator/runtime metadata consumption while retaining advisory
prompt/review prior-art, source trace, and skill-risk constraints.
This phase does not implement role execution, provider/model routing, App
Server integration, MCP, external API execution, or domain-pack runtime.

Closeout addendum:
- Phase 23.8 remains registry/skill-surface only.
- The standalone `docs/SELF_HOSTING_RUN_STATE_AUTOMATION_FOLLOWUP.md` note must
  not remain as an independent planning or authority surface in the final
  Phase 23.8 closeout diff. Its substance belongs in this roadmap and canonical
  future task contracts.
- Phase 23.8 must not implement transactional run-state ingestion, packet
  automation, proof generation, reports, access APIs, MCP, runners, hooks,
  provider adapters, or domain-pack behavior.

## Roadmap continuity invariant

The Phase 23.8.5-26 rebase preserves the downstream path through Phases 27-31.

- Phase 27 remains the domain pack architecture path for domain expansion.
- Phase 28 remains the safety boundary for domain ingestion and schema
  evolution.
- Phase 29 remains the prior-art discovery gate before domain/runtime
  expansion.
- Phase 30 remains bounded experimentation and eval-driven harness improvement
  only after evaluator/proof/report foundations exist.
- Phase 31 remains the late reviewed runner-execution and PR/CI repair path
  after evaluator/experimentation boundaries are explicit.
- Phases 23.8.5-26 prepare stable operator/procedure/proof/report/access
  foundations for those later phases; they must not replace, bypass, or make
  those phases unnecessary through hidden core behavior.
- If any proposed change in 23.8.5-26 makes Phases 27-31 harder, less safe,
  less local-first, more core-coupled, or more autonomous than intended, stop
  and run architecture review before implementation.

Global constraints for the rebase:
- lightweight, fast, operator-first control plane remains the primary product
  direction: models propose, while the harness validates, authorizes, executes,
  records, verifies, and exposes recovery paths through typed state and product
  commands;
- no process-product expansion, generic orchestration platform, dashboard,
  marketplace, background runner, autonomous agent loop, MCP-native
  architecture, or domain-specific core;
- operator owns routing and state interpretation; it does not execute agents;
- runner execution may happen only when a later phase explicitly adds it, and
  runner/model selection must stay provider-neutral through explicit
  `RunnerProfile` plus `ExecutionPolicy` contracts rather than Codex-only prompt
  assumptions;
- hooks remain sidecar guardrails only; no hook work in Phase 23.8.5, 23.8.6,
  23.8.7, or 23.9;
- staging DB is the active mutable authority for active runs, while `run.json`
  is a compatibility projection;
- proof and reports never become lifecycle authority.

Task-cycle materialization invariant:
- one task = one branch = one worktree;
- a closing or harvested run may determine and record the next task decision;
- a closing or harvested run must not create, claim, or mutate the next task
  branch/worktree;
- the next task branch/worktree belongs to the new active task, not the old
  closing or harvested run;
- start-of-new-cycle materialization belongs to the new task context; Phase
  23.8.6 now provides an explicit command path for recording the next-task
  decision and materializing that new task branch/worktree, but activated
  source authority exists only after `TASK.md` is written there, the
  activation/materialization change is committed as the first commit in that
  branch/worktree, clean git is re-established, and the new run starts after
  those gates succeed;
- DB/staging state stores the next-task decision, git stores the activated
  source state, and a new run starts only when those agree and git is clean;
- if the activation commit cannot be created, or clean git cannot be
  re-established after it, materialization must fail closed and must not start
  a new run;
- branch/worktree ownership remains explicit and task-scoped in the current
  manual flow and must not be treated as implicit in `run start`;
- git branch creation and git worktree creation remain distinct primitives, but
  steady-state harness materialization must own them as one logical task
  materialization step;
- a later productized materialization surface must wrap that same sequence in
  one formal command path or equivalent documented runtime surface.

## Phase 23.8.5 — Automation Roadmap and Task Authority Rebase

Task:
`tasks/PHASE_23_8_5_AUTOMATION_ROADMAP_AND_TASK_AUTHORITY_REBASE.md`

Goal:
Perform a docs/task-contract authority rebase before runtime automation work.

Status:
Historical/accepted authority-rebase phase. Phase 23.8 is complete, reviewed,
and accepted, and the 23.8.5 outputs remain live roadmap/task-authority
surfaces. A previous adjacent wiring pass used Phase 23.8.6A as the active
worktree operator context; older "23.8.5 active" wording is historical
delivery context rather than the current operator pointer.
Docs/task-contract and registry contract-enforcement only: no runtime
automation code, ingestion commands, packet automation, proof generation,
reports, access APIs, MCP, runners, hooks, provider adapters, or domain-pack
behavior. TypeScript changes are limited to registry validator/model parity.

Required scope:
- treat the original 23.8.5 `TASK.md` activation as historical delivered
  context only; once `TASK.md` points to a later task, that older activation
  sentence is no longer the live operator authority;
- add mandatory derived self-hosting procedure wrappers at
  `prompts/self-hosting/<procedure-id>.md`, with exact one-to-one parity with
  `skills/self-hosting/procedure-registry.json`;
- add required `prompt_wrapper_path` registry metadata and update the registry
  schema, TypeScript validator/model, and acceptance tests so wrapper drift
  fails closed; keep `schema_version` unchanged because this is an atomic
  product-source registry update, not a runtime migration;
- update this roadmap with the Phase 23.8.5 -> 23.8.6 -> 23.8.6A -> 23.8.6B ->
  23.8.6B1 -> 23.8.6B2 -> 23.8.6C -> 23.8.6C1 -> 23.8.6C1A ->
  23.8.6C2 -> 23.8.6C2A -> 23.8.6D -> 23.8.6E -> 23.8.7 -> 23.9 -> 24A -> 24B ->
  25A -> 25B -> 26 sequence and
  a direct block before Phase 23.9;
- separate end-of-old-cycle decision from start-of-new-cycle materialization:
  closeout/harvest may record the next task, while the new cycle creates or
  enters the task branch/worktree, activates the task there, and starts the
  run in that task context;
- keep the historical delivered Phase 23.8.5 self-hosting run context distinct
  from the prohibited next-cycle run: that pass could execute inside its own
  then-active task run, but it must not materialize or start the next task
  cycle;
- preserve one task = one branch = one worktree and make clear that a harvested
  run never owns the next task branch/worktree;
- amend `docs/OPERATIONS_PLAN.md` with operator-first operations where manual
  `run.json` repair is forbidden and every operator action maps to a product
  command or documented ingestion path;
- amend `docs/MASTER_ARCHITECTURE.md` to state lightweight control layer as a
  hard invariant;
- amend operator routing/stage docs to account for future procedure-ingestion
  and packet-preparation stages without adding runtime behavior;
- document the interim pre-23.8.6 manual replay rule: procedure-shaped
  transcripts can prepare the next prompt, but they are not runtime evidence,
  do not advance operator stage state, and must not be backfilled through
  manual `run.json` edits;
- amend agent boundary/security docs to split `RunnerProfile` from
  `ExecutionPolicy`;
- create or extend task contracts for Phases 23.8.6, 23.8.6A, 23.8.6B,
  23.8.6B1, 23.8.6B2, 23.8.6C, 23.8.6C1, 23.8.6C1A, 23.8.6C2, 23.8.6C2A, 23.8.6D,
  23.8.6E, and 23.8.7 as the near-term self-hosting chain becomes repo-owned
  authority;
- amend Phase 23.8.7 so `StagePacket` contracts require a verifiable stopping
  condition, required validation commands/artifacts, and a bounded
  progress/result log contract without adding runner execution;
- split or amend Phase 24 into 24A/24B while preserving useful
  evidence/report/redaction/provenance constraints;
- split or amend Phase 25 into 25A/25B while preserving Direct API/CLI first,
  MCP optional, redaction, query limits, no raw SQL, approval-gated mutations,
  and no autonomous agent;
- amend Phase 26 while preserving that it extends `feature-decomposition`,
  emits reviewable task graph proposals, and does not execute or approve its
  own scope;
- amend Phase 30 so bounded experimentation explicitly includes procedure
  trigger evals, findings/traces/CI-failure promotion into approved eval
  candidates/regression fixtures, and bounded drift/entropy cleanup proposals
  tied to evidence;
- create `tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md`;
- preserve downstream constraints for Phases 27-31.
- distinguish checked-in procedure wrappers from generated product prompts
  created by `node bin/ch prompt ...`.

Future-phase impact check:
- prepares 23.8.6, 23.8.6A, 23.8.6B, 23.8.6B1, 23.8.6B2, 23.8.6C,
  23.8.6C1, 23.8.6C1A, 23.8.6C2, 23.8.6C2A, 23.8.6D, 23.8.6E, 23.8.7, 23.9,
  24A/24B, 25A/25B, 26, and downstream Phases 27-31 by making dependencies
  explicit;
- must not pre-implement transactional ingestion, packet automation, proof
  generation, report builders, access APIs, planner logic, domain packs,
  prior-art discovery, or experimentation;
- preserves the domain/core boundary by keeping roadmap changes
  domain-neutral and self-hosting-focused;
- requires architecture review if the rebase broadens core into generic
  orchestration, domain workflow execution, background automation, or
  MCP-native architecture.

## Phase 23.8.6 — Transactional Procedure Result Ingestion and Slice-Isolated Run Mutations

Task:
`tasks/PHASE_23_8_6_TRANSACTIONAL_PROCEDURE_RESULT_INGESTION.md`

Goal:
Make run-state mutation reliable before stage packet automation and proof.

Status:
Planned. Blocked until Phase 23.8.5 is complete and reviewed.

Required scope:
- add formal procedure-result ingestion commands or equivalent documented
  product surfaces for plan-review, plan-amend, implementation-review,
  verification-review, and reviewed-plan approval;
- make `plan-review` ingestion one atomic product result tied to the reviewed
  plan artifact, including typed outcome, reviewed-plan identity, and an
  embedded immutable decision record or exact immutable decision-record
  reference validated in the same transaction; keep `plan-amend` responsible
  for the later effective amended-plan identity;
- validate procedure IDs through `skills/self-hosting/procedure-registry.json`;
- ensure each mutation updates only its own state slice;
- ensure `run verify` appends verification state without removing review,
  approval, steps, or unrelated evidence;
- ensure `remote-status`, `closeout`, and `mark-discardable` preserve unrelated
  state slices;
- require immutable run-instance identity across allocation, harvest,
  accepted/project readback, idempotent retry, and compatibility `run.json`
  regeneration, while leaving exact ID format to implementation;
- fail closed when legacy or ambiguous records lack exact immutable
  run-instance identity; those records cannot authorize mutation or
  progression until a typed migration/blocker path resolves them;
- distinguish same-instance harvest retry from different-instance collision on
  the same display `run_id`, and require collision-safe typed blocker behavior
  with no current-staging mutation;
- add typed delivery-fact ingestion for `merge` results and merge commits, and
  define whether merge evidence is required before harvest or may be appended
  after harvest without reopening or manually repairing the run;
- add a formal product command sequence or equivalent documented runtime
  surface for start-of-new-cycle materialization that preserves the new task
  context: create or enter the task branch/worktree, write the decided next
  `TASK.md` pointer there, commit the activation/materialization change as the
  first commit in that task branch/worktree, verify clean git, and only then
  start the new run in that task worktree;
- require a recorded next-task decision before harvest when a successor is
  selected, while allowing harvest without one when no successor is selected;
- keep a recorded next-task decision as recorded decision state only until an
  explicit status or equivalent typed distinction marks the committed source
  activation as complete;
- ensure a harvested/closing run may record the next task decision but cannot
  create, claim, or mutate the new task branch/worktree;
- forbid accepted/project readback from acting as implicit repair authority
  without exact immutable run-instance identity match;
- regenerate compatibility `run.json` from staging DB rather than treating it
  as manual live authority;
- ensure operator `next_allowed_action` values that require durable state map
  to real product commands or documented ingestion paths.

Future-phase impact check:
- prepares 23.8.6A, 23.8.6B, 23.8.6B1, 23.8.6B2, 23.8.6C, 23.8.6D, 23.8.6E,
  23.8.7, and 23.9 by making procedure/stage inputs durable and monotonic;
- must not pre-implement packet automation, runner execution, proof records,
  reports, access APIs, domain packs, or experimentation;
- preserves the domain/core boundary by only hardening generic run/procedure
  state, not domain-specific procedures or schemas;
- requires architecture review if slice ingestion becomes a general workflow
  engine, background runner, raw DB API, external connector surface, or domain
  data ingestion path.

## Phase 23.8.6A — Self-Hosting Replay and Re-ingestion Continuity

Task:
`tasks/PHASE_23_8_6A_SELF_HOSTING_REPLAY_AND_REINGESTION_CONTINUITY.md`

Goal:
Restore honest self-hosting continuity after exact immutable run identity is
hardened, so exact already-recorded artifacts can be replayed and re-ingested
across the full active operator chain without manual repair.

Status:
Planned implementation phase. Blocked until Phase 23.8.6 is complete,
reviewed, accepted, and merged. Earlier task-contract wiring used this phase as
the active worktree operator context, but that historical pointer did not
waive the Phase 23.8.6 runtime dependency or authorize later-phase runtime
implementation.

Required scope:
- generalize exact-artifact replay and idempotent re-ingestion across the full
  active self-hosting operator chain;
- cover `task-intake`, `task-prompt-writer`, `draft-plan`, `plan-review`,
  `plan-amend`, `architecture-review`, `db-storage-review`,
  `implementation-review`, `fix-pass-review`, `verification-review`,
  `delivery-facts-review`, `phase-closeout-review`, and the adjacent
  `approve-plan` surface;
- keep `feature-decomposition`, `docs-consistency-review`, and
  `harness-audit` out of default scope unless a later reviewed task widens the
  replay/re-ingestion target beyond the active chain above;
- allow replay of the exact same already-recorded durable artifact to backfill
  newly parseable derived state without duplicate evidence;
- forbid per-run repair logic, manual `run.json` repair, or stage-skipping
  hacks;
- preserve slice-isolated mutation boundaries from Phase 23.8.6;
- make replacement exact-identity runs able to recover honest active-chain
  progress from already-recorded artifacts without rerunning unrelated
  completed work.

Future-phase impact check:
- prepares 23.8.6B, 23.8.6B1, 23.8.6B2, 23.8.6C, 23.8.6D, 23.8.6E, 23.8.7,
  and 23.9 by restoring honest continuity on top of exact-identity run
  authority;
- must not pre-implement packet automation, runner execution, docs/model
  routing policy packaging, provider selection, or experimentation;
- preserves the domain/core boundary by staying inside runtime continuity
  repair for generic self-hosting procedure state;
- requires architecture review if replay/re-ingestion turns into a generic
  workflow engine, runner launcher, or background repair loop.

## Phase 23.8.6B — Self-Hosting Model Routing Policy Packaging

Task:
`tasks/PHASE_23_8_6B_SELF_HOSTING_MODEL_ROUTING_POLICY_PACKAGING.md`

Goal:
Package checked-in self-hosting model-routing, bounded-helper, and separate
review-launch policy into narrow authoritative docs and future-task surfaces,
without adding runtime code.

Status:
Planned. Blocked until Phase 23.8.6 and Phase 23.8.6A are complete, reviewed,
accepted, and merged.

Required scope:
- create or update `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` as the canonical
  self-hosting model-routing policy document;
- probe local Codex CLI help/capabilities and treat local help output as the
  immediate source of truth for separate review launch shape;
- encode the Codex CLI separate review launch discipline into repo-owned
  policy;
- package no-silent-degradation, bounded-helper/subagent limits, and explicit
  wait discipline for child runs;
- keep 23.8.7 advisory only and Phase 31 as the first home for general
  reviewed runner execution and packet-bound child/runner execution
  enforcement beyond the narrow supervised review-launch surface planned in
  Phase 23.8.6B1;
- make only narrow consistency updates in the authoritative docs and future
  task contracts that need to reference that policy;
- add no runtime code, runner execution, or provider-specific lifecycle logic.

Future-phase impact check:
- prepares 23.8.6B1, 23.8.6B2, 23.8.6C, 23.8.6E, 23.8.7, 24A/24B, 30, and 31
  by turning the current review-launch and routing discipline into checked-in
  authority;
- must not pre-implement runtime replay/re-ingestion repair, packet
  automation, runner execution, provider routing, or proof/report logic;
- preserves the domain/core boundary by remaining a narrow docs/task-policy
  pass;
- requires architecture review if this pass starts adding runtime execution
  logic or provider-specific lifecycle behavior.

## Phase 23.8.6B1 — Supervised Review Launch and Blocked Disposition

Task:
`tasks/PHASE_23_8_6B1_SUPERVISED_REVIEW_LAUNCH_AND_BLOCKED_DISPOSITION.md`

Goal:
Turn the checked-in manual review-launch discipline into a supervised runtime
surface for `plan-review` and `implementation-review`, with honest blocked
disposition and exact-identity-safe launch evidence.

Status:
Accepted historical phase. Phase 23.8.6B is already complete, reviewed,
accepted, merged, harvested, and pulled into fresh `main`, and Phase 23.8.6B1
is complete enough that the current task pointer may advance to the next
near-term phase.

Required scope:
- add a narrow `run launch-review` runtime surface for `plan-review` and
  `implementation-review`;
- resolve display `run_id` to exact run identity before durable evidence
  mutation and fail closed when exact identity is ambiguous or unavailable;
- keep launch supervision, artifact validation, provenance classification,
  blocked disposition, and operator-status projection inside a generic
  supervisor layer;
- keep Codex-specific launch construction, local CLI probing, and flag/output
  handling inside a narrow `codex_cli` adapter;
- classify the launch surface as bounded `process_execution` with read-only
  sandboxing, no source-file writes, mandatory timeout/stale limits, and no
  automatic relaunch loop;
- record structured launch-attempt evidence and immutable artifact references
  without turning this phase into the storage-normalization owner;
- return a structured launch observation with bounded output, failure
  classification, artifact/blocker refs, and next valid action for every
  success, dry-run, failure, or blocked path;
- accept review artifacts only from a valid expected artifact file or unchanged
  validated captured output persisted as the artifact;
- keep review request files, blocker notes, and other run-local notes out of
  accepted review-artifact status.

Future-phase impact check:
- prepares 23.8.6B2, 23.8.6C, 23.8.6D, 23.8.6E, 23.8.7, 23.9, 30, and 31 to
  consume exact-identity review-launch evidence without duplicating review
  launch supervision;
- must not pre-implement verification-command rationalization, storage
  normalization, packet execution, proof generation, experimentation, or
  reviewed general runner execution;
- preserves the domain/core boundary by keeping B1 limited to supervised review
  launch and blocked disposition.

## Phase 23.8.6B2 — Verification Command Rationalization and Serialization

Task:
`tasks/PHASE_23_8_6B2_VERIFICATION_COMMAND_RATIONALIZATION_AND_SERIALIZATION.md`

Goal:
Rationalize full-pack verification authority so live/future task contracts use
one canonical proof command and stop treating duplicate npm aliases as
independent proof.

Status:
Active implementation phase. Phase 23.8.6B1 is already complete enough for the
current task pointer and roadmap authority to advance, so B2 is now the active
verification-guidance/docs implementation target.

Required scope:
- designate `npm test` as the canonical full-pack verification command;
- treat `npm run test:acceptance` as a compatibility alias to the same
  acceptance runner;
- record that the current acceptance runner already serializes a single
  invocation with `--test-concurrency=1`;
- update only live/current or immediate planned/future authority surfaces that
  still imply both aliases are required as separate proof;
- update any live/current roadmap or operator-facing wording that still leaves
  the completed prior phase marked active or leaves this phase marked blocked;
- forbid concurrent launch of the full-pack aliases in the same
  workspace/runtime context;
- keep verification-command rationalization separate from review-launch
  supervision, review-artifact validity, and blocked disposition;
- allow B2 to consume B1 blocked disposition or review-launch status only as
  upstream evidence;
- keep durable verification-result association exact-identity safe rather than
  relying on display `run_id` alone;
- keep this phase to verification-policy authority only.

Future-phase impact check:
- prepares 23.8.6C, 23.8.6C1, 23.8.6C1A, 23.8.6C2, 23.8.6C2A, 23.8.6D, 23.8.6E,
  23.8.7, and 23.9 to reference one canonical full-pack proof path;
- must not change package scripts, CI, acceptance-runner behavior, or runtime
  locking;
- preserves the domain/core boundary by remaining a narrow docs/task-policy
  pass.

## Phase 23.8.6C — Minimum Self-Hosting Orchestrator Entrypoint

Task:
`tasks/PHASE_23_8_6C_SELF_HOSTING_OPERATOR_BOOTSTRAP_ENTRYPOINT.md`

Goal:
Add the first lightweight practical self-hosting orchestrator loop for an
already selected task context.

Status:
Complete, reviewed, accepted, and merged.

Required scope:
- read operator status and select exactly one next procedure or typed blocker;
- report bootstrap evidence for active task, branch, worktree, base-commit
  fact, and exact run identity state;
- treat uncommitted task activation or `TASK.md`/base-commit/worktree/git-state
  misalignment as a typed blocker rather than a valid startup context;
- prepare one bounded worker handoff, prompt, or packet for the selected next
  step;
- allow bootstrap/status output to surface B1 review-launch blocked
  disposition and next valid action when already recorded, without
  implementing another review launcher;
- if a result is returned through approved manual or reviewed procedure
  surfaces, ingest that result into typed lifecycle evidence;
- run deterministic checks and independent reviewer/evaluator-agent steps when
  required by review tier;
- record every lifecycle problem as typed `RunIssue` evidence;
- generate a `RepairPacket` before continuing when unresolved issues exist;
- continue only until a hard blocker, configured owner gate, or budget stop;
- preserve one task = one branch = one worktree;
- keep review request files, diagnosis notes, and run-local markdown out of
  accepted-memory authority unless a later storage phase explicitly promotes
  them;
- keep this phase narrow and reviewed rather than turning it into a broad
  workflow engine or replacement coding agent.

Future-phase impact check:
- prepares 23.8.6C1, 23.8.6C1A, 23.8.6C2, 23.8.6C2A, 23.8.6D, 23.8.6E, 23.8.7, and
  23.9 to rely on a repo-owned minimum orchestrator loop instead of manual
  startup reconstruction alone;
- must not expand into external runner launch from harness runtime, runtime
  execution enforcement, full runner execution, a replacement for Codex, a
  generic workflow engine, auto-commit, auto-merge, provider-specific
  lifecycle logic, or domain-pack runtime;
- preserves the domain/core boundary by keeping the harness in the
  supervisor/orchestrator role and external agents in the worker role.

## Phase 23.8.6C1 — Post-Bootstrap Audit and Task-Contract Rebase

Task:
`tasks/PHASE_23_8_6C1_POST_BOOTSTRAP_AUDIT_AND_TASK_CONTRACT_REBASE.md`

Goal:
Convert the reviewed post-23.8.6C audit into a coherent next-task contract and
rebase the affected near-term authority surfaces before runtime work resumes.

Status:
Complete, reviewed, accepted, and merged. Its task contracts are the evidence
base for Phase 23.8.6C1A.

Required scope:
- revalidate the merged Phase 23.8.6C implementation before retaining audit
  findings;
- create one narrow Phase 23.8.6C2 Bootstrap Authority Correctness task;
- rebase D, E, and 23.8.7 dependencies and ownership without implementing
  those phases;
- publish the exact near-term sequence through 23.9 in roadmap and operations
  authority;
- add focused contract tests for task completeness, sequence, dependency, and
  lightweight-harness boundaries;
- keep this phase to task contracts, authoritative docs, and focused tests.

Future-phase impact check:
- prepares one implementation-ready C2 task and removes ambiguity from D/E/7
  ownership;
- must not change runtime, storage, schema, procedure, prompt, skill, package,
  CI, or runner behavior;
- preserves one operator oracle and rejects MOW or a broad orchestration layer.

## Phase 23.8.6C1A — Routing, Context, and Model-Policy Authority Rebase

Task:
`tasks/PHASE_23_8_6C1A_ROUTING_CONTEXT_AND_MODEL_POLICY_AUTHORITY_REBASE.md`

Goal:
Convert completed routing, context, and model-policy research into current
repo-owned policy and decision-complete future task contracts before C2 or
later runtime work proceeds.

Status:
Complete, reviewed, accepted, and merged. Its authority-rebase outputs enable
the active C2 implementation phase.

Required scope:
- publish deterministic provider-neutral route classes, precedence, reasoning
  controls, context transports, independence, and budget-safe escalation;
- keep concrete models provisional bindings rather than lifecycle authority;
- rebase C2, D, E, 23.8.7, 23.9, 24A, 24B, 30, and 31 ownership without
  implementing those phases;
- refresh only `plan-review` to the locally supported `gpt-5.6-sol` High
  binding and `implementation-review` to the locally supported
  `gpt-5.6-terra` High binding, without fallback;
- add focused tests for ordering, ownership, authority boundaries, and exact
  current review bindings.

Future-phase impact check:
- makes C2 the next runtime task while preserving its bootstrap-authority
  scope;
- assigns context storage, route intent, proof provenance, deterministic
  context manifests, evaluation, and runtime execution to D, 23.8.7, 23.9,
  24A/24B, 30, and 31 respectively;
- must not add runtime routing, provider execution, schemas, migrations,
  packet generation, App Server dependency, or automatic agents;
- preserves Phase 31 as the first general runtime provider-binding and
  packet-bound runner-execution boundary.

## Phase 23.8.6C2 — Bootstrap Authority Correctness

Task:
`tasks/PHASE_23_8_6C2_BOOTSTRAP_AUTHORITY_CORRECTNESS.md`

Goal:
Make the existing bootstrap fail closed when task, checkout, base-commit, or
persisted current-bootstrap authority cannot be proven.

Status:
Complete, reviewed, accepted, and merged. The bounded follow-up C2A owns the
remaining commit-backed materialization and environment-readiness correction.

Required scope:
- reject missing, unreadable, escaping, or non-file active task references
  before durable run creation;
- block when multiple installed tasks exist but no exact worktree/branch match
  owns the checkout, while preserving exact-match historical accumulation;
- distinguish current source snapshot/HEAD from task-owned base commit or
  configured-upstream merge-base authority and never guess a default branch;
- validate base ancestry and emit a typed blocker when base authority is
  missing, moved, unrelated, or unresolvable;
- deep-validate persisted current-bootstrap facts, handoff, `RunIssue`,
  `RepairPacket`, and issue/packet links on authoritative readback;
- preserve dry-run non-mutation and exactly-one-next-action behavior;
- prefer enriching existing `run start --task` and `run status --operator`
  surfaces over adding another command.
- preserve explicit task/worktree/source/base authority needed by later route
  and context contracts without selecting models, building generalized
  context packets, or implementing routing.

Future-phase impact check:
- prepares C2A to make next-task activation commit-backed and environment-ready
  on truthful bootstrap authority, then prepares D to store durable procedure
  payloads and 23.8.7 to extend validated current issue/repair records;
- must not add generalized stage packets/results, durable procedure payload
  storage, authority freshness work, runner execution, provider routing,
  auto-commit, or auto-merge;
- preserves the lightweight single-loop operator model.

## Phase 23.8.6C2A — Commit-Backed Task Materialization and Environment Bootstrap

Task:
`tasks/PHASE_23_8_6C2A_COMMIT_BACKED_TASK_MATERIALIZATION_AND_ENVIRONMENT_BOOTSTRAP.md`

Goal:
Turn an already validated next-task decision into a clean, commit-backed task
branch/worktree that is deterministically ready for the checked-in Harness
commands and procedure surfaces.

Status:
Complete, reviewed, accepted, and merged. Its commit-backed materialization
and deterministic worktree-bootstrap authority now precede the active D work.

Required scope:
- make `run materialize-next-task` prepare the new task context without
  starting a run before its activation commit;
- accept and verify a clean Codex Desktop-managed existing worktree as well as
  a Harness-created one, without recreating the Desktop worktree;
- require a post-base, committed, clean task activation before `run start`
  creates durable lifecycle state;
- add a deterministic repo-owned dependency/build and tracked-procedure
  bootstrap/verify path, while allowing a successful Codex Desktop local
  environment setup to satisfy the same checks;
- never copy ignored private state, credentials, `.env*`, `.codex/**`,
  `.harness/**`, `node_modules`, or generated output; use Codex Desktop's
  explicit `.worktreeinclude` opt-in only when an operator has chosen it;
- retain C2's exact decision/base authority and current historical readability.

Future-phase impact check:
- prepares D to store durable procedure payloads only after task materialization
  and runnable-worktree provenance are commit-backed;
- prepares E and 23.8.7 without implementing freshness, packet, routing,
  provider, runner, payload, migration, auto-commit, or auto-merge behavior;
- preserves the lightweight single-loop operator model and explicit human
  activation responsibility.

## Phase 23.8.6D — Procedure Artifact Payload Storage and Worktree Retention

Task:
`tasks/PHASE_23_8_6D_PROCEDURE_ARTIFACT_PAYLOAD_STORAGE_AND_WORKTREE_RETENTION.md`

Goal:
Store raw procedure artifact bodies durably in SQLite-backed payload storage
and preserve enough worktree provenance for later audit after local markdown
files disappear.

Status:
Complete, reviewed, accepted, and merged. Its durable procedure-payload,
successor-recovery, and worktree-retention authority now precedes the active E
freshness revalidation.

Required scope:
- store raw recorded procedure artifact bodies in SQLite payload tables as
  authoritative payloads rather than file-only side effects;
- preserve exact run identity, procedure identity, and worktree/task/branch/
  base-commit provenance alongside those payloads;
- preserve canonical registry procedure identity, recorded timestamp, content
  hash, and exact reviewed plan/evidence binding alongside payloads;
- preserve immutable payload identity, MIME/type or equivalent classification,
  bounded payload/chunk references, authoritative readback, and generic
  reference semantics usable later by `ContextManifest` and proof phases;
- require exact-instance keyed or exact-instance resolvable storage for
  procedure artifacts, review artifacts, plan artifacts, verification results,
  delivery facts, closeout receipts, harvest records, payload index entries,
  and artifact references;
- address the known storage finding that generic project tables queried only by
  display `run_id` can mix old and new run instances;
- preserve those payloads into project DB harvest or equivalent promoted
  authority;
- keep run-local markdown files as non-authoritative transition artifacts only
  if compatibility still requires them;
- require project-DB audit or reconstruction of recorded procedure bodies
  without relying on run-local markdown file presence;
- deep-validate storage-owned payload, procedure-identity, plan-binding, and
  evidence-binding records on ingestion and authoritative readback;
- distinguish artifact body, artifact reference, payload chunk/ref, structured
  lifecycle record, manual request file, diagnosis/reconciliation note, and
  accepted durable project memory;
- define which artifact types become promoted structured project records and
  which remain file-backed run-local evidence;
- do not treat every `*-request.md`, launch blocker, diagnosis snapshot, or
  reconciliation note as a promoted project record by default.

Future-phase impact check:
- prepares 23.8.6E, 23.8.7, 23.9, and later report/proof phases to consume
  durable procedure bodies instead of disposable worktree files;
- must not add packet automation, runner execution, provider/model routing, or
  domain-pack behavior, context-bundle construction, route telemetry, or
  hidden transcript/reasoning authority;
- preserves the domain/core boundary by staying inside storage/harvest
  durability.

## Phase 23.8.6E — Authority Surface Freshness and Downstream Task Revalidation

Task:
`tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md`

Goal:
Revalidate future/live authority surfaces after the near-term 23.8.6 chain has
changed verification policy, bootstrap assumptions, and storage/harvest facts.

Status:
Complete. Independently reviewed, accepted, merged, closed out, and harvested.

Required scope:
- check `TASK.md` active pointer, roadmap active/current wording, task status
  fields, future/live task assumptions, verification guidance, bootstrap
  assumptions, storage/harvest assumptions, and downstream dependency notes;
- reconcile stale present-tense phase claims, checked-in model/profile policy
  versus manual guidance, and context-budget/compaction/handoff authority;
- revalidate the native Codex Desktop successor-task procedure against the
  actual persistent app-server `thread/start` plus exact-cwd/Git readback
  boundary, while preserving phase-neutral immutable-base, activation,
  unique-owner, idempotency, predecessor-stop, and typed fail-closed rules;
- include a lightweight mechanical authority-drift check, implemented as a
  repo-owned command if one exists or as a bounded scripted/search checklist
  otherwise, that covers stale current-pointer claims, skipped phase ordering,
  duplicate active-task claims, broad B1-vs-Phase-31 runner wording, and
  display-`run_id` authority misuse;
- distinguish stale future/live authority surfaces from historical/accepted
  task history;
- update only the future/live surfaces that are stale against current code,
  current roadmap authority, or explicitly planned future task contracts;
- produce a bounded freshness report that records checked surfaces, confirmed
  assumptions, stale assumptions, updated future/live files, intentionally
  untouched files, and remaining debt/risks.
- reconcile the C1A routing/context allocations against actual C2/D facts
  rather than repeating the research or becoming first owner of that
  architecture;
- correct only the supervised `codex_cli` file-output review-launch liveness
  defect: stdout/stderr silence is monitoring-only, never a `SIGTERM` basis;
  hard timeout and explicit human cancellation remain the only termination
  authority, one live reviewer remains exclusive until terminal exit, and a
  delayed valid artifact is accepted by focused regression coverage.

Future-phase impact check:
- prepares 23.8.7, 23.9, 24A/24B, and later live/planned authority surfaces to
  inherit current facts rather than stale assumptions;
- preserves Phase 30 as the future home for bounded experimentation and Phase
  31 as the future home for reviewed runner execution;
- must not become general runtime implementation, a Desktop client or generic
  UI automation framework, background control, or a broad roadmap rewrite;
  the listed review-launch liveness correction is the sole runtime exception.

## Phase 23.8.6F — Cost-Aware Review Context Reuse and Codex Reference Routing

Task:
`tasks/PHASE_23_8_6F_COST_AWARE_CONTEXT_REUSE_AND_CODEX_REFERENCE_ROUTING.md`

Goal:
Add the narrow, provider-neutral deterministic-first procedure contract,
self-hosting review-context reuse, route-decision, Codex reference-binding,
routing-eval/promotion, and usage-telemetry substrate before stage-packet
automation. Automatic Codex launch remains limited to the existing
`plan-review` and `implementation-review` surfaces.

Status:
Complete. Phase 23.8.6E is independently reviewed, accepted, merged, closed
out, and harvested. Phase 23.8.6F is independently reviewed, accepted, merged,
closed out, and harvested.

Implemented source surfaces include the 15-procedure deterministic/semantic
policy, deterministic context core/manifest/delta identities, per-invocation
route and isolated Codex binding, honest JSONL observations, immutable replay
packets and evaluation/decision/application records, exact harvest transfer
proof, Desktop-only successor entry/cleanup, and pre-claim reviewer
anti-recursion. Acceptance and lifecycle review remain required before this
phase can be declared complete.

Future-phase impact check:
- 23.8.7 reuses route/policy/binding, context/delta, transport, and usage refs
  in stage packets/results;
- 23.9 adds proof provenance, 24A adds deterministic report/export views, and
  Phase 30 generalizes experimentation without duplicating F records;
- 23.8.6F does not add a second adapter, generic runner, or Desktop client;
- Phase 31 remains the first general reviewed runner-execution boundary.

## Phase 23.8.7 — Hookless Stage-Level Operator Packet Automation v0

Task:
`tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`

Goal:
Formalize stage-level packet/result/execution-policy contracts on top of stable
run-state after Phase 23.8.6C proves the minimum loop and C2/C2A harden its
bootstrap and materialization authority.

Status:
Complete, independently reviewed, accepted, merged, closed out, and harvested.

Required scope:
- define `StageState`, `StagePacket`, `StageResult`, `RunnerProfile`,
  `ExecutionPolicy`, and `WaiverRecord` contracts;
- extend and normalize the existing Phase 23.8.6C `RunIssue` and
  `RepairPacket` records rather than defining competing types;
- add packet preparation such as
  `run prepare-packet --kind auto|plan|implementation|review|fix-pass|closeout`
  or equivalent;
- add result fixture ingestion such as
  `run record-stage-result --packet <packet-id> --file <path>` or equivalent;
- require every `StagePacket` to include a verifiable stopping condition,
  required validation commands/artifacts, and a bounded progress/result log
  contract;
- report `human_action_required` separately from `next_allowed_action`;
- route failed review fixtures to `FIX_PASS_PACKET`;
- route passing review fixtures to `CLOSEOUT_PACKET` or closeout-ready state;
- block missing deterministic checks with typed `stop_reason`;
- derive required reviews from tier/changed-surface policy as typed packet
  inputs and represent manual-procedure promotion as an explicit typed
  evidence transition;
- keep B1 launch-attempt evidence compatible with exact-instance packet/result
  design rather than ambiguous display-`run_id` readback;
- formalize the minimum-loop failure fixtures observed during Phase 23.8.6B,
  including self-approval attempt, skipped architecture/db review, missing
  review artifacts, blocker-note-as-accept, source edits before valid
  lifecycle approval, reviewer hang, failed verification, scope creep, and
  fake closeout.
- consume the approved Phase 23.8.6F route decision, routing-policy and
  provider-binding versions, context core/delta/manifest, transport, usage,
  and escalation refs in `StagePacket`/`StageResult`;
- generalize those refs to stage packets/results without creating a second
  router, context substrate, or telemetry model;
- block packet preparation on missing required route/context evidence and keep
  provider/model selection and runner launch out of this phase;

Non-goals:
- no Codex execution from operator;
- no automatic agent invocation;
- no external runner adapter;
- no background watcher;
- no auto-commit, auto-merge, or self-approval;
- no MCP/API access layer.

Future-phase impact check:
- prepares 23.9 proof, 24A reports/packets, and 25A read-only access by
  creating stable stage/packet/result records;
- must not pre-implement proof generation, report catalog, API layer, MCP
  adapter, domain packs, or planner execution;
- preserves the domain/core boundary by keeping packets procedure/stage-oriented
  and domain-neutral after the minimum loop already exists in 23.8.6C;
- requires architecture review if packet automation starts invoking runners,
  selecting models/providers, writing source files, making approval decisions,
  or encoding domain workflows in core.

Acceptance behavior highlights:
- prepared packet fixtures include a verifiable stopping condition, required
  validation commands/artifacts, and a bounded progress/result log contract;
- no agent or runner is invoked.

## Phase 23.9 — Minimal Proof-Carrying Work over Procedure/Stage Records

Task:
`tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md`

Goal:
Add a minimal proof/evidence/assumption/review mapping over stable
procedure/stage records.

Status:
Active. First correct the normal zero-TaskState native-successor materialization
gap under the Phase 23.9 task contract. The proof-record work remains blocked
until Phase 23.8.6, Phase 23.8.6A, Phase 23.8.6B, Phase
23.8.6B1, Phase 23.8.6B2, Phase 23.8.6C, Phase 23.8.6C1A, Phase 23.8.6C2,
Phase 23.8.6C2A, Phase 23.8.6D, Phase 23.8.6E, Phase 23.8.6F, and Phase
23.8.7 are complete and reviewed, unless a later
reviewed decision explicitly defers or waives that dependency.
This phase must not become a separate lifecycle authority. Operator/proof
schemas remain provisional sketches unless tightened during implementation.

Must preserve:
- product-versus-installed-target separation: canonical-path product
  self-install detection must fail closed for `install` and `upgrade` before
  planning or mutation, preserve source/AGENTS/backup/registry/runtime state,
  and make `doctor` report the explicit conflict;
- a typed reconcile/migration path for pre-existing product self-install state
  that preserves self-hosting evidence and canonical `TaskState` rather than
  deleting `.harness` manually;
- proof record;
- task verifiability map;
- assumption ledger;
- operating envelope summary;
- evidence gaps;
- review verdict mapping;
- model/provider metadata fields where available;
- deterministic evidence outranks model opinion;
- B1 review-launch evidence remains distinct from review-artifact validity,
  review verdict, verification proof, blocked disposition, artifact refs,
  payload refs, exact run identity, and accepted memory;
- proof can be produced from a completed or reviewed run;
- proof states what was verified, reviewed, assumed, and missing;
- proof format supports Phase 24A packets later.
- proof records deterministic-check, route decision, routing-policy and
  provider-binding versions, actual invocation, context core/manifest/delta,
  transport, independence, escalation, promotion, usage, model judgment, and
  expected/observed review provenance when available;
- deterministic evidence, model judgment, policy decision, and owner promotion
  approval remain distinct, and proof never becomes routing authority;
- missing invocation/usage facts remain explicit, and model judgment never
  overrides deterministic failure.
- the existing standalone
  `run launch-review --procedure fix-pass-review` automatic capability after a
  bounded fix-pass diff exists: one fresh independent read-only invocation,
  no session resume, exact reviewed source HEAD and diff, and exactly one
  current predecessor `implementation-review` attempt and artifact;
- `fix-pass-review` reviews the completed fix only and cannot execute fixes,
  write to the task worktree, prepare or run repair packets, launch a builder,
  create a lifecycle stage, or start an automatic review/fix loop.

Must not:
- install or upgrade the product repository as an installed target;
- implement run-state ingestion;
- use display `run_id` alone as proof identity;
- depend on scraping ambiguous run-local markdown histories as authoritative
  proof;
- generate reports or proposal drafts;
- expose access APIs or MCP;
- create domain-specific proof records;
- let proof decide lifecycle or create waivers.

## Phase 24A — Minimal Evidence Report and Review Packet

Task:
`tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md`

Goal:
Implement the smallest useful deterministic report/packet substrate.

Status:
Planned split from `tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`. Blocked
until Phase 23.9 is complete and reviewed.

Scope:
- one deterministic run evidence/closeout report;
- one deterministic report/export view over the Phase 23.8.6F
  `ContextCore`/`ContextManifest` plus a bounded packet view over its
  `ReviewDeltaOverlay`;
- no competing context-core, manifest, or overlay type;
- stable manifest identity/hash, deterministic ordering, size budget,
  truncation/redaction facts, source provenance, and fail-closed mandatory
  context handling;
- accepted Project Memory DB records, operator/procedure/proof state, and
  Phase F/23.8.7 route/context/policy/binding/transport/usage records as inputs;
- deterministic output where practical;
- evidence-linked, inference-marked, or missing/unknown material claims;
- redaction before export;
- visible packet size/truncation;
- provenance with Project Memory record IDs, payload/chunk refs where needed,
  procedure IDs, and source-map/procedure-contract refs;
- remote CI/check provenance when available, including provider, run ID or URL,
  commit SHA, job/step conclusions, and bounded/redacted failed-step excerpts;
- no hidden model-side summarization;
- no LLM call required for deterministic report generation;
- no domain-specific prompt logic in core.

Non-goals:
- no proposal drafts;
- no governance report catalog;
- no repeated-failure analytics;
- no reviewer-disagreement report;
- no portable export bundle;
- no broad packet taxonomy;
- no MCP, full Agent Access Layer, domain packs, external writes, or lifecycle
  authority independent of runtime/closeout/harvest rules.

Future-phase impact check:
- prepares 24B, 25A, and 26 by proving the smallest useful report/packet
  substrate;
- must not pre-implement broad packet catalog, proposal drafting, governance
  analytics, domain packs, MCP, or planner execution;
- preserves the domain/core boundary by keeping outputs self-hosting/workflow
  generic and evidence-linked;
- requires architecture review if report generation starts deciding lifecycle,
  promoting tasks, summarizing hidden model memory, or adding domain-specific
  report logic in core.

## Phase 24B — Expanded Reports and Packets

Task:
`tasks/PHASE_24B_EXPANDED_REPORTS_AND_PACKETS.md`

Goal:
Expand reports and packets only after Phase 24A artifacts show concrete use.

Status:
Planned split from `tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`. Blocked
until Phase 24A is complete and reviewed.
CLI remains the current baseline access surface. App Server is a future
candidate only, but that access-layer evaluation remains owned by Phase 25A/25B
and must not be reintroduced here as Phase 24B implementation scope.

Possible additions moved from the existing Phase 24 broad catalog:
- proposal draft;
- governance decision report;
- acceptance evidence report;
- remote CI/check evidence report;
- review packet report;
- handoff packet report;
- unresolved-risk report;
- reviewer disagreement report;
- repeated failure report;
- portable handoff/export bundle summary;
- additional self-hosting packet types: planner, plan-review,
  implementation-review, closeout-review, architecture-review,
  DB/storage-review, docs-consistency.

Preserved constraints:
- deterministic where practical;
- every material claim linked to evidence, marked as inference, or marked
  missing/unknown;
- redaction before export;
- bounded raw logs only;
- manifests include packet ID, packet type, source run/phase, schema version,
  created_at, source records, redaction status, size budget, truncation policy,
  missing evidence, procedure IDs, and review tier where applicable;
- proposal drafts remain drafts until human promotion.

Future-phase impact check:
- prepares 25A, 26, and later 27-31 by improving evidence packaging without
  turning reports into authority;
- must not pre-implement access services, MCP adapters, domain packs, schema
  ingestion, prior-art gates, or experimentation loops;
- preserves the domain/core boundary by keeping expanded reports generic unless
  Phase 27 domain-pack architecture explicitly owns domain formatting;
- requires architecture review if expansion creates a report marketplace,
  hidden advisor, auto-promotion path, domain-specific core catalog, or
  unbounded packet generation.

## Phase 25A — Read-only Direct API/CLI Access Layer

Task:
`tasks/PHASE_25A_READ_ONLY_DIRECT_API_CLI_ACCESS_LAYER.md`

Goal:
Expose read-only governed access to runtime, memory, reports, and packets
through shared core services.

Status:
Planned split from `tasks/PHASE_25_AGENT_ACCESS_LAYER.md`. Blocked until Phase
24A is complete and reviewed.

Scope:
- query runs;
- query evidence;
- query procedure outcomes;
- query packets/results;
- query proof;
- fetch minimal reports/packets from Phase 24A;
- enforce redaction and query limits in shared service;
- Direct API/CLI first;
- all access surfaces call shared core services;
- no raw SQL exposed;
- provider/model-specific behavior remains outside shared core logic;
- model opinion cannot override missing evidence, failing tests,
  source/runtime boundary violations, or approval requirements.

Non-goals:
- no MCP;
- no hosted API server;
- no external writes;
- no autonomous action loop;
- no provider execution;
- no raw SQL interface;
- no connector marketplace;
- no domain packs;
- no publishing/sending/updating external systems;
- no bypass of human approval.

Future-phase impact check:
- prepares 25B, 26, and later domain-pack work by exposing governed read-only
  access to stable core state;
- must not pre-implement MCP adapters, write-capable external connectors,
  provider runners, domain packs, prior-art discovery, or experimentation;
- preserves the domain/core boundary by exposing generic core records only, not
  domain-specific operations;
- requires architecture review if access becomes hosted product architecture,
  raw SQL interface, mutation API without approval, connector marketplace, or
  autonomous action surface.

## Phase 25B — Optional MCP/adapter parity

Task:
`tasks/PHASE_25B_OPTIONAL_MCP_ADAPTER_PARITY.md`

Goal:
Add optional adapter/MCP parity after Phase 25A is stable.

Status:
Planned split from `tasks/PHASE_25_AGENT_ACCESS_LAYER.md`. Blocked until Phase
25A is complete and reviewed.

Allowed only if:
- Phase 25A shared service is stable;
- read-only parity tests exist;
- redaction and query limits are enforced in core;
- MCP remains adapter surface, not architecture;
- MCP adapter, if implemented, has parity tests and cannot bypass
  redaction/policy;
- mutating operations remain denied or approval-gated.

Preserved constraints:
- Direct API/CLI remain primary;
- MCP optional only;
- adapters are clients of core, not core itself;
- no duplicate query/business logic in adapters;
- no provider/model-specific logic in shared core services;
- no external write connector by default.

Non-goals:
- no MCP-native core;
- no raw SQL;
- no marketplace;
- no write-capable external connector by default;
- no autonomous agent;
- no background polling or autonomous tool loops;
- no domain packs.

Future-phase impact check:
- prepares later optional runner/provider integrations without making MCP core
  architecture;
- must not pre-implement domain packs, schema ingestion, external write
  connectors, background automation, prior-art gates, or experimentation loops;
- preserves the domain/core boundary by keeping MCP an adapter over shared
  services;
- requires architecture review if MCP bypasses core services, exposes writes
  by default, duplicates business logic, or becomes required for local-first
  operation.

## Phase 26 — Big Task Decomposer and Architect Planner

Task:
`tasks/PHASE_26_BIG_TASK_DECOMPOSER_AND_ARCHITECT_PLANNER.md`

Goal:
Extend the existing `feature-decomposition` procedure into a stronger
architect/planner layer that emits reviewable task graph proposals only.

Status:
Planned. Blocked until Phase 25A is complete and reviewed. Produces reviewable
task graph proposals and first-task recommendations. Does not execute generated
tasks and does not approve its own scope.

Must preserve:
- builds on existing `feature-decomposition`;
- accepts broad goals and reviewed findings as inputs;
- emits goals, non-goals, assumptions, research summary, risks, dependencies,
  proposed tasks, and first recommended task;
- human approval imports task graph;
- no domain-specific Ozon/CRM/marketing workflows;
- no bypass of review/approval.

Future-phase impact check:
- prepares Phase 27 domain pack architecture and Phase 29 prior-art discovery
  by producing reviewable proposals, not executing them;
- must not pre-implement domain pack runtime, domain ingestion/schema
  evolution, prior-art discovery gate, bounded experimentation loop, or
  autonomous task execution;
- preserves the domain/core boundary by keeping generated tasks as proposals
  until human approval and later domain-pack contracts;
- requires architecture review if planner creates executable scope without
  approval, writes domain logic into core, bypasses task contracts, or starts
  using findings as automatic implementation authority.

## Phase 27 — domain pack / skills architecture

Task:
`tasks/PHASE_27_DOMAIN_PACK_SKILLS_ARCHITECTURE.md`

Goal:
Introduce local, validated domain packs without putting domain logic into core.

Status:
Planned re-slotted phase. Blocked until Phase 23.8 is complete and reviewed.
Blocked until Phase 26 is complete and reviewed.
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
Planned. Blocked until Phase 23.8 is complete and reviewed.
Blocked until Phase 27 is complete and reviewed. No production
Ozon/CRM/marketing system and no automatic schema mutation from new data points.

## Phase 29 — Prior-Art Discovery Gate

Task:
`tasks/PHASE_29_PRIOR_ART_DISCOVERY_GATE.md`

Goal:
Turn the Gate 0 research protocol into a reusable, operator-aware discovery
module.

Status:
Planned. Blocked until Phase 23.8 is complete and reviewed.
Blocked until Phase 28 is complete and reviewed. Focused research
checkpoints remain available earlier where task risk requires them.

## Phase 30 — Bounded Agent Experimentation Loop

Task:
`tasks/PHASE_30_BOUNDED_AGENT_EXPERIMENTATION_LOOP.md`

Goal:
Add a bounded experimentation and eval-driven harness-improvement primitive
after minimum lifecycle fixtures, operator/procedure records, proof, and
evaluator fixtures exist.

Status:
Planned experimental. Blocked until Phase 23.8 is complete and reviewed.
Blocked until Phase 29 is complete and reviewed. Not
uncontrolled self-improvement, not autonomous product development, and not a
replacement for architecture review.

Required scope highlights:
- consume Phase 23.8.6F eval cases, shadow/replay/canary results,
  promotion/rejection decisions, policy versions, rejected candidates, and
  rollback records without recreating F's current-path telemetry or promotion
  lifecycle;
- procedure-trigger evals with negative cases, blocker semantics, and
  output-format conformance;
- refine procedures, reviewers, routes, and packets only after the minimum
  lifecycle loop and its baseline failure fixtures already exist;
- findings/traces/CI failures promoted into approved eval candidates and then
  regression fixtures;
- harness change proposals tied to evidence/eval IDs;
- bounded drift/entropy cleanup proposals for stale docs, wrapper drift,
  source-map drift, duplicate authority, and abandoned experiment notes;
- recurring mechanically checkable authority-drift patterns nominated by Phase
  23.8.6E freshness reports may become eval or cleanup candidates only after
  explicit review;
- immutable evaluator, durable experiment record, and explicit keep/revert
  decision;
- offline route/context fixtures with baseline/candidate routes, immutable
  evaluator, expected critical findings/lifecycle outcome, economic and quality
  metrics, bias controls, and hard rejection for missed blockers, illegal
  progression, independence violations, invalid output, or unsafe cost wins;
- must not make Phase 30 the first place where basic lifecycle failure
  fixtures are introduced.

## Phase 31 — Reviewed Runner Execution and PR/CI Repair Loop

Task:
`tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md`

Goal:
Execute approved stage packets through reviewed runner surfaces under explicit
`RunnerProfile` and `ExecutionPolicy` boundaries, ingest runner/CI/review
results, and prepare and execute approved bounded fix-pass packets for failing
CI/review outcomes.

Status:
Planned. Blocked until Phase 30 is complete and reviewed. No self-approval,
auto-merge, unrestricted write access, provider-specific core logic, or
domain-core execution behavior is allowed.
This phase is the reviewed external runner-adapter boundary only. It must not
become a coding agent, replacement Codex, or unrestricted autonomous repair
loop. It consumes and generalizes the approved Phase 23.8.6F narrow
self-hosting route-policy, binding, context, telemetry, escalation, promotion,
and rollback contracts. It remains the first general external-runner runtime
`RouteDecision`, provider-binding, context/budget enforcement, usage telemetry,
typed escalation, and packet-bound execution boundary. It must block rather
than silently downgrade and must not use an LLM as the default router or allow
unbounded/parallel write agents.
Phase 31 consumes the exact Phase 23.9 `implementation-review` and
`fix-pass-review` launch evidence. It must not recreate, replace, or generalize
Phase 23.9's narrow automatic standalone read-only `fix-pass-review` launcher.
Phase 31 owns approved write-capable packet execution, CI/review-result
ingestion, and bounded fix-pass packet preparation and execution.

## Pilot — Research Ops pack

Task:
`tasks/PILOT_RESEARCH_OPS_PACK.md`

Goal:
Validate a read-mostly, provenance-oriented non-code domain pack.

Status:
Planned. Blocked until Phase 23.8 is complete and reviewed.
Blocked until Phase 27 domain-pack architecture is complete and reviewed.

## Experimental — Marketing Ops pack

Task:
`tasks/EXPERIMENTAL_MARKETING_OPS_PACK.md`

Goal:
Stress-test domain packs against higher-risk marketing workflows while staying
draft/report/recommend-only.

Status:
Planned experimental. Blocked until Phase 23.8 is complete and reviewed.
Blocked until the Research Ops pilot is complete and reviewed.

## Stop rule

After every phase:

1. Run acceptance.
2. Review diff.
3. Commit.
4. Record the next task decision as part of old-cycle closeout/harvest when
   applicable.
   Use the Phase 23.8.6 runtime command path for this.
5. In the new cycle, materialize the new branch/worktree for that task.
6. Update the new task contract, `TASK.md`, roadmap/operations order, and every
   required live authority surface coherently before starting the run.
7. Commit the complete activation/materialization authority change as the
   first commit in that new task branch/worktree.
8. Verify clean git in that new task context.
9. Start the new run in that clean activated task worktree.
10. Start a new `/plan` run for the new active task.
