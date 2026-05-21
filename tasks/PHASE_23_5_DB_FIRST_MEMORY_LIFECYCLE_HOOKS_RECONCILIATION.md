# Phase 23.5 — DB-first Memory, Lifecycle Core, and Hooks Reconciliation

## Status

Planned. Starts only after Phase 23 Memory/Evidence Core is complete, reviewed, and accepted.

## Review status

Intermediate corrective phase introduced after Phase 23 architecture review.

This phase does not rewrite Phase 23 history. It defines and implements the target memory/lifecycle authority model required before Phase 24 reports/packets and Phase 23.6 self-hosting workflow can be trusted.


## Historical Phase 23 compatibility

Phase 23 remains a historical/bootstrap Memory/Evidence Core phase.

This phase does not retroactively reinterpret Phase 23 closeout rules, Phase 23 evidence, or historical Phase 23 run state. If a legacy Phase 23 run is blocked because the old harness cannot import an external review/merge fact, document that as legacy debt; do not fake evidence and do not apply Phase 23.5 harvest/lifecycle requirements backward in time.

Phase 23.5 defines the target model for new behavior after this phase is implemented.

## Read before editing

- `TASK.md`
- `tasks/PHASE_13_HOOKS.md`
- `tasks/PHASE_22_5_CORE_RUNTIME_NORMALIZATION.md`, if present
- `tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/PROJECT_MEMORY_AND_DEBT.md`
- `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- existing memory/evidence/runtime/paths modules
- existing hooks modules, hook templates, and `.codex/**` configuration
- `schemas/**`
- `tests/acceptance/**`

If a listed file does not exist, use the closest actual file and document the difference.

## Goal

Make project memory and self-hosting lifecycle safe enough for later reports, packets, plan-review workflow, and agent access.

This phase introduces or aligns:

- DB-first Project Memory authority;
- Project Memory DB location and access policy;
- Run/Staging DB location and write policy;
- SQLite-backed PayloadStore;
- DB maintenance and size/retention policy;
- transactional, idempotent, single-writer harvest/promotion;
- delivery facts import;
- run mode/status model needed for bootstrap work;
- worktree deletion guard;
- reconciliation of existing hooks with the new lifecycle/storage model.

## Why this phase exists

Phase 23 introduced a Memory/Evidence Core with a bootstrap model similar to:

```text
JSONL ledger = source of trace/truth
SQLite projection = indexed query/report layer
external ArtifactStore = normal large payload storage
```

That is acceptable as Phase 23 history, but it is not the target model for the next phases.

Target model after this phase:

```text
SQLite Project Memory DB = primary accepted project memory authority
Run/Staging DB = temporary run/worktree write target
JSONL = audit/export/replay/debug format
external files/artifacts = exceptional or compatibility layer, not normal decision-useful memory
```

Without this correction, Phase 24 would build reports and packets on top of the old bootstrap assumptions, and self-hosting runs would keep losing or scattering durable knowledge.

## Scope

### 0. Repo reality audit and compatibility note

Before implementation, inspect the actual Phase 23 memory/evidence implementation and existing hooks.

Required result:

- identify current JSONL/projection/artifact paths;
- identify current memory service APIs;
- identify current hook events, templates, and write paths;
- document the compatibility path from Phase 23 behavior to the Phase 23.5 target model;
- do not break existing Phase 23 evidence unless a migration/compatibility path is provided.

### 1. DB-first storage authority

Define and implement the target storage authority:

- SQLite is the primary operational store for accepted Project Memory.
- JSONL is permitted only as audit stream, export/import format, or replay/debug format for new behavior.
- JSONL must not be the primary working memory source for new lifecycle/reporting behavior.
- External artifacts must not be the normal storage layer for decision-useful memory.
- Needed data is stored in SQLite.
- Large needed data is chunked/compressed and stored in SQLite.
- Sensitive data is redacted/summarized before accepted durable storage when required by policy.
- Unneeded data is explicitly discarded.
- Exceptional/problematic data goes through explicit quarantine/manual decision.

### 2. Location policy

Define canonical locations before implementing storage.

Required rules:

- Project Memory DB must be resolved from the canonical project root or registered project identity.
- Project Memory DB must not live only inside a disposable task worktree.
- Run/Staging DB belongs to the active run/worktree lifecycle and is disposable only after harvest, discard, or manual override.
- All path resolution must be deterministic and test-covered.
- Generated runtime state must remain out of package/release output unless explicitly exported.

Suggested default paths, adjustable to repo conventions:

```text
<canonical-project-root>/.harness/memory/project.sqlite
<run-or-worktree-root>/.harness/runs/<run-id>/staging.sqlite
<canonical-project-root>/.harness/memory/exports/**
```

If the repository already uses different paths, keep the repo convention but preserve the same roles and deletion guarantees.


### 2.1 Product source vs local Codex/runtime boundary

Before implementation, preserve the current repository boundary for local/generated state.

Required rules:

- `.harness/**` is runtime state/evidence, not product source unless explicitly exported.
- `.codex/**` is local Codex App/config/install state unless a future reviewed task deliberately introduces repo-level Codex config as product source.
- `.agents/**` is local/installed/generated state in this repo unless a future reviewed task deliberately changes the product/source boundary.
- Acceptance and doctor-style checks must explain local `.codex/**` / `.agents/**` boundary issues precisely instead of silently treating local app files as product source.
- Generated runtime or installed-skill targets must not become hidden source-of-truth.

### 3. Project Memory DB

Introduce a durable Project Memory DB for accepted/harvested memory.

It stores, at minimum:

- runs and phase runs;
- steps and command/check outcomes;
- verification facts;
- review facts;
- findings;
- decisions;
- lessons;
- next actions;
- PR facts;
- remote CI/check facts;
- merge facts;
- closeout and harvest records;
- payload metadata;
- payload chunks;
- redaction records;
- retention records.

Project Memory DB writes must go through typed services. Do not expose raw SQL as the public user/agent API.

### 4. Run/Staging DB

Introduce or align a Run/Staging DB for the active run/worktree.

Rules:

- active execution writes to Run/Staging DB;
- active execution may read Project Memory DB only through typed APIs;
- active execution must not directly write accepted records into Project Memory DB;
- accepted promotion into Project Memory DB happens only through harvest/closeout;
- staging records keep source run, source task, timestamp, producer, schema version, sensitivity, and retention metadata.

### 5. SQLite PayloadStore

Implement a SQLite-backed PayloadStore.

Required structures or equivalent:

- `payload_index`;
- `payload_chunks`;
- `payload_redactions`;
- `payload_retention`;
- `payload_links`.

Each payload must support:

- parent record id;
- source run/phase/step;
- kind/media type;
- summary;
- searchable text where safe;
- optional bounded excerpt;
- redaction status;
- retention class;
- compression status;
- chunk order;
- raw size;
- stored size;
- content hash;
- created timestamp.

No normal large-content path may bypass this policy by silently writing durable memory into loose external files.

### 6. DB maintenance, limits, and integrity policy

Define and implement/document operational policy for:

- WAL mode or chosen journal mode;
- checkpoints;
- `VACUUM` or incremental vacuum strategy;
- `ANALYZE`/`PRAGMA optimize` equivalent where appropriate;
- maximum single payload size before warning/manual decision;
- chunk size;
- maximum run staging DB size before warning/block;
- maximum project DB size before maintenance warning;
- retention classes;
- integrity checks;
- backup/export path.

Do not hardcode arbitrary limits without documenting the rationale.

### 7. Typed service boundary

Provide typed service methods for all normal reads/writes.

Required boundary:

- project memory reads through Project Memory APIs;
- run writes through Run/Staging APIs;
- harvest writes through Harvest service;
- no public raw SQL command for users or agents;
- debug/admin internals, if any, must be clearly non-public and guarded.

### 8. Delivery facts import

Add provider-neutral recording/import for delivery facts that may happen outside local runtime:

- PR created/updated;
- remote CI/check result;
- review result;
- merge result;
- merge commit;
- closeout approval or rejection.

Delivery facts must include enough provenance to support Phase 24 reports:

- provider/source;
- URL or run id where applicable;
- commit SHA where applicable;
- conclusion/status;
- timestamp;
- bounded/redacted failed-step excerpt or payload reference when failed.

Closeout must not remain permanently blocked only because PR/CI/review/merge facts happened outside the local process.

### 9. Harvest and promotion

Implement controlled harvest from Run/Staging DB to Project Memory DB.

Harvest must be:

- transactional;
- idempotent;
- deterministic where practical;
- single-writer guarded;
- resumable or fail-clearly on interruption;
- auditable;
- safe to retry after partial failure.

Harvest records must capture:

- what was accepted;
- what was discarded;
- what was quarantined;
- what was redacted;
- what remains unresolved;
- source run id;
- source task id/path;
- source snapshot;
- promotion timestamp;
- promotion result.

### 10. Run mode and lifecycle status

Do not mix run kind with lifecycle status.

Required distinction:

```text
run_mode: normal | bootstrap
lifecycle_status: active | blocked | closed | harvested | discarded
```

Equivalent names are acceptable if the model preserves the same semantics.

Important rules:

- `closed != harvested`;
- a closed run is not automatically safe to delete;
- bootstrap mode is a marker for self-hosting/dogfooding work, not an excuse to bypass harvest or safety checks;
- discard requires explicit reason and audit record.

### 11. Worktree deletion guard

Worktree deletion is allowed only when one of these is true:

- harvest completed successfully;
- run was explicitly discarded/discardable with reason;
- explicit manual override was recorded with reason.

The guard must prevent accidental loss of useful run memory.

### 12. Hooks reconciliation

Hooks were introduced earlier and must not be ignored.

This phase does not create a full new hooks/watchers architecture from scratch. It reconciles existing hooks with the new storage/lifecycle authority model.

Required work:

Current compatibility note:

- Phase 13 introduced the existing minimal hook contract. The current repo behavior must be inspected as installed-target `.codex/hooks.json` plus the existing `UserPromptSubmit`, `PreToolUse`, and `Stop` scripts/tests, or the closest actual equivalent.
- Reconciliation must preserve this contract or deliberately migrate it in a focused, test-covered step.
- If official Codex Hooks config shape differs from the existing Phase 13 templates/tests, update the templates/tests explicitly rather than leaving a stale hidden mismatch.
- Do not build a new broad Hooks/Watchers architecture in Phase 23.5; keep the work to reconciliation with lifecycle/storage authority.

- inspect existing hook implementation and docs;
- verify the current official Codex Hooks config shape before changing hook templates or docs;
- identify supported hook events and current write paths;
- update old Phase 13 hook templates/tests if stale;
- remove or adapt assumptions tied to old artifact/storage behavior;
- ensure hooks do not write directly to accepted Project Memory DB;
- hooks may write only to Run/Staging DB or approved runtime event streams;
- hooks must not silently edit workspace state;
- hooks must not be the primary authority boundary;
- core lifecycle/storage/harvest rules are authoritative;
- destructive or remote actions remain reviewable;
- hook tests must prove hooks do not break plan/run/closeout/harvest flows;
- test hooks as guardrails only;
- do not build a new Hooks/Watchers architecture in this phase.

### 13. Product source vs local Codex configuration boundary

Define and document the boundary between product source files and local Codex/operator configuration.

Required rules:

- local `.codex/**` files must not silently change acceptance behavior;
- generated `.agents/**` files must not become hidden source-of-truth;
- if repo-level `.codex/hooks.json` or equivalent is introduced later, that must be an explicit reviewed decision, not an accidental side effect of hook reconciliation;
- doctor/acceptance guidance must explain what to do with local Codex App/CLI files that are present but not product source;
- repo-owned product behavior must live in versioned source/docs/tasks, not only in local Codex configuration.

### 14. Minimal docs and roadmap updates

Update only documents that would otherwise contradict the implemented authority model.

Required minimum:

- roadmap/order mentions Phase 23.5 before Phase 23.6 and Phase 24;
- memory/storage authority note reflects DB-first Project Memory;
- closeout/worktree lifecycle note reflects harvest/discard/manual override deletion rule;
- hooks note reflects that hooks are guardrails, not authority boundary.

Do not perform broad documentation rewrites.

## Non-goals

- no Phase 24 reports/packets implementation;
- no Phase 23.6 self-hosting skills implementation;
- no full agent access layer;
- no provider integration;
- no full Codex plan-mode integration;
- no MCP adapter;
- no vector database;
- no pack runtime;
- no pack manifest;
- no marketplace/plugin system;
- no domain pack API;
- no SaaS/cloud sync;
- no raw SQL as public user/agent API;
- no auto-commit;
- no auto-merge.

## CLI surface

Exact names can change, but equivalent behavior should exist:

```bash
node bin/ch memory project --help
node bin/ch memory run --help
node bin/ch memory harvest --help
node bin/ch memory delivery-facts --help
node bin/ch run status --run <run-id>
node bin/ch run mark-discardable --run <run-id> --reason <reason>
node bin/ch worktree delete --run <run-id>
node bin/ch hooks --help
```

If the repository uses different command grouping, implement equivalent discoverable behavior and document the mapping.

## Acceptance commands

Use repository-equivalent commands if names differ:

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory harvest --help
node bin/ch memory delivery-facts --help
node bin/ch hooks --help
```

## Acceptance behavior

- Project Memory DB exists and is not disposable worktree state.
- Run/Staging DB exists for active run writes.
- Canonical path resolution is deterministic and test-covered.
- Active runs write to Run/Staging DB, not directly to accepted Project Memory DB.
- Active runs can read Project Memory DB only through typed APIs.
- Harvest promotes accepted records from Run/Staging DB into Project Memory DB.
- Harvest is transactional, idempotent, and single-writer guarded.
- JSONL is audit/export/replay/debug only for new target behavior.
- SQLite is the primary operational Project Memory authority.
- Decision-useful payloads are stored in SQLite.
- Large needed payloads are chunked/compressed into SQLite.
- Sensitive payload policy is represented through redaction/summarization/retention metadata.
- DB maintenance and size/retention policy is documented and testable where practical.
- Unneeded payloads can be explicitly discarded.
- Exceptional payloads can be explicitly quarantined/manual-decided.
- Delivery facts for PR/CI/review/merge can be imported/recorded.
- Closeout can use imported delivery facts.
- Run mode is distinct from lifecycle status.
- `closed` is distinct from `harvested`.
- Worktree deletion is blocked unless harvest, discard, or manual override is recorded.
- Existing hooks are reconciled with the new lifecycle/storage model.
- Hooks do not directly write accepted Project Memory DB records.
- Hooks are not treated as the primary security/authority boundary.
- Phase 24 is not implemented in this phase.
- Phase 23.6 skills are not implemented in this phase.

## Review focus

Reviewers must check especially for:

- old JSONL/source-of-truth assumptions leaking into new behavior;
- external artifacts remaining normal durable memory storage;
- Project Memory DB accidentally living only inside disposable worktree;
- harvest not being idempotent;
- concurrent harvest/promotion corruption risk;
- accepted memory being written directly from a run/worktree;
- closed runs being treated as safe to delete before harvest;
- delivery facts being impossible to import;
- hooks bypassing core lifecycle/storage rules;
- Phase 24/23.6 scope creep.

## Suggested implementation order

1. Inspect current Phase 23 storage/runtime implementation and existing hooks.
2. Define compatibility note from Phase 23 model to Phase 23.5 target authority.
3. Define Project Memory DB and Run/Staging DB locations.
4. Add/align schemas for Project DB, Run DB, payload store, delivery facts, run mode/status, harvest records, and retention/redaction records.
5. Define DB maintenance and limit policy.
6. Implement typed Project DB read APIs and Run/Staging write APIs.
7. Implement PayloadStore inside SQLite.
8. Implement delivery facts import/recording.
9. Implement harvest/promotion with transaction, idempotency, and single-writer guard.
10. Implement worktree deletion guard.
11. Reconcile existing hooks with the new storage/lifecycle model.
12. Add product-source vs local Codex configuration boundary documentation/doctor guidance.
13. Add targeted tests.
14. Update minimal docs and roadmap dependencies.

## Required return from implementation agent

When this task is implemented, the agent must return:

- files changed;
- scope summary;
- explicit confirmation that non-goals were not implemented;
- verification commands and results;
- Project DB and Run/Staging DB paths chosen;
- DB maintenance/limit policy summary;
- how existing hooks were reconciled;
- how product-source vs local Codex configuration boundaries were handled;
- how old Phase 23 storage assumptions were handled;
- review/fix-pass status if applicable;
- remaining debt or open questions;
- final git status.

## Completion criteria

Phase 23.5 is complete when codex-harness has a DB-first Project Memory authority, isolated run/staging writes, controlled harvest into Project Memory DB, delivery facts import, safe worktree deletion rules, DB maintenance policy, a documented product-source vs local Codex configuration boundary, and reconciled hooks that support but do not replace core lifecycle authority.
