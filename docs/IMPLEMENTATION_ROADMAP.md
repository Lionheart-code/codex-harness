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
Complete, reviewed, and accepted. Phase 23.8.5 is now the active
docs/task-contract authority rebase before runtime automation work.
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
- start-of-new-cycle materialization belongs to the new task context; in the
  current manual harness flow, that means creating or entering the new task
  branch/worktree first, activating the next task there, and then starting the
  new run;
- branch/worktree creation is explicit operator-owned work in the current
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
Active docs/task-contract phase. Phase 23.8 is complete, reviewed, and
accepted.
Docs/task-contract and registry contract-enforcement only: no runtime
automation code, ingestion commands, packet automation, proof generation,
reports, access APIs, MCP, runners, hooks, provider adapters, or domain-pack
behavior. TypeScript changes are limited to registry validator/model parity.

Required scope:
- activate this task by updating `TASK.md`, then keep this pass to
  docs/task-contract reconciliation plus the narrow registry/schema/validator/
  test contract-enforcement exception already allowed by the active task;
- add mandatory derived self-hosting procedure wrappers at
  `prompts/self-hosting/<procedure-id>.md`, with exact one-to-one parity with
  `skills/self-hosting/procedure-registry.json`;
- add required `prompt_wrapper_path` registry metadata and update the registry
  schema, TypeScript validator/model, and acceptance tests so wrapper drift
  fails closed; keep `schema_version` unchanged because this is an atomic
  product-source registry update, not a runtime migration;
- update this roadmap with the new sequence and a direct block before Phase
  23.9;
- separate end-of-old-cycle decision from start-of-new-cycle materialization:
  closeout/harvest may record the next task, while the new cycle creates or
  enters the task branch/worktree, activates the task there, and starts the
  run in that task context;
- keep the current Phase 23.8.5 self-hosting run distinct from the prohibited
  next-cycle run: this pass may execute inside its own active task run, but it
  must not materialize or start the next task cycle;
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
- create task contracts for Phases 23.8.6 and 23.8.7;
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
- prepares 23.8.6, 23.8.7, 23.9, 24A/24B, 25A/25B, 26, and downstream
  Phases 27-31 by making dependencies explicit;
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
- validate procedure IDs through `skills/self-hosting/procedure-registry.json`;
- ensure each mutation updates only its own state slice;
- ensure `run verify` appends verification state without removing review,
  approval, steps, or unrelated evidence;
- ensure `remote-status`, `closeout`, and `mark-discardable` preserve unrelated
  state slices;
- add typed delivery-fact ingestion for `merge` results and merge commits, and
  define whether merge evidence is required before harvest or may be appended
  after harvest without reopening or manually repairing the run;
- add a formal product command sequence or equivalent documented runtime
  surface for start-of-new-cycle materialization that preserves the new task
  context: create or enter the task branch/worktree, activate the decided next
  task there, and start the new run in that task worktree;
- ensure a harvested/closing run may record the next task decision but cannot
  create, claim, or mutate the new task branch/worktree;
- regenerate compatibility `run.json` from staging DB rather than treating it
  as manual live authority;
- ensure operator `next_allowed_action` values that require durable state map
  to real product commands or documented ingestion paths.

Future-phase impact check:
- prepares 23.8.7 and 23.9 by making procedure/stage inputs durable and
  monotonic;
- must not pre-implement packet automation, runner execution, proof records,
  reports, access APIs, domain packs, or experimentation;
- preserves the domain/core boundary by only hardening generic run/procedure
  state, not domain-specific procedures or schemas;
- requires architecture review if slice ingestion becomes a general workflow
  engine, background runner, raw DB API, external connector surface, or domain
  data ingestion path.

## Phase 23.8.7 — Hookless Stage-Level Operator Packet Automation v0

Task:
`tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`

Goal:
Prepare and ingest stage-level packet/result fixtures on top of stable
run-state. No agents are launched.

Status:
Planned. Blocked until Phase 23.8.6 is complete and reviewed.

Required scope:
- define `StageState`, `StagePacket`, `StageResult`, `RunnerProfile`,
  `ExecutionPolicy`, and `WaiverRecord` contracts;
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
- block missing deterministic checks with typed `stop_reason`.

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
  and domain-neutral;
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
Planned. Blocked until Phase 23.8.6 and Phase 23.8.7 are complete and reviewed,
unless a later reviewed decision explicitly defers or waives that dependency.
This phase must not become a separate lifecycle authority. Operator/proof
schemas remain provisional sketches unless tightened during implementation.

Must preserve:
- proof record;
- task verifiability map;
- assumption ledger;
- operating envelope summary;
- evidence gaps;
- review verdict mapping;
- model/provider metadata fields where available;
- deterministic evidence outranks model opinion;
- proof can be produced from a completed or reviewed run;
- proof states what was verified, reviewed, assumed, and missing;
- proof format supports Phase 24A packets later.

Must not:
- implement run-state ingestion;
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
- one bounded implementation-review or handoff packet;
- accepted Project Memory DB records and operator/procedure/proof state as
  inputs;
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
after operator/procedure/proof/evaluator fixtures exist.

Status:
Planned experimental. Blocked until Phase 23.8 is complete and reviewed.
Blocked until Phase 29 is complete and reviewed. Not
uncontrolled self-improvement, not autonomous product development, and not a
replacement for architecture review.

Required scope highlights:
- procedure-trigger evals with negative cases, blocker semantics, and
  output-format conformance;
- findings/traces/CI failures promoted into approved eval candidates and then
  regression fixtures;
- harness change proposals tied to evidence/eval IDs;
- bounded drift/entropy cleanup proposals for stale docs, wrapper drift,
  source-map drift, duplicate authority, and abandoned experiment notes;
- immutable evaluator, durable experiment record, and explicit keep/revert
  decision.

## Phase 31 — Reviewed Runner Execution and PR/CI Repair Loop

Task:
`tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md`

Goal:
Execute approved stage packets through reviewed runner surfaces under explicit
`RunnerProfile` and `ExecutionPolicy` boundaries, ingest runner/CI/review
results, and prepare bounded fix-pass packets for failing CI/review outcomes.

Status:
Planned. Blocked until Phase 30 is complete and reviewed. No self-approval,
auto-merge, unrestricted write access, provider-specific core logic, or
domain-core execution behavior is allowed.

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
5. In the new cycle, create or enter the new branch/worktree for that task,
   activate the next task in `TASK.md` there, and start the new run in that
   task worktree.
6. Start a new `/plan` run for the new active task.
