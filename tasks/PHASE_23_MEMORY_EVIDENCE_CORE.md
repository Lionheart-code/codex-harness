# Phase 23 — Memory/Evidence Core

## Status

Planned. Blocked until Phase 22.5 Core Runtime Normalization is complete and reviewed.

## Review status

Reviewed v2. The main correction is that Phase 23 must build on Phase 22.5 runtime receipts and must not re-invent lifecycle state. It should persist runtime evidence, not create a second workflow model.

## Read before editing

- `TASK.md`
- `docs/POST_PHASE_22_HARNESS_ARCHITECTURE_AND_ROADMAP.md`, if present
- `docs/PROJECT_MEMORY_AND_DEBT.md`
- `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- Phase 22.5 runtime contracts and schemas
- existing memory/debt/decision modules
- `schemas/**`
- `tests/acceptance/**`


## Goal

Add a durable local evidence backend for `codex-harness` runs.

Memory in this phase is not an agent brain. It is a local, auditable, rebuildable evidence layer that records what happened during runs, phases, steps, checks, reviews, decisions, approvals, artifacts, and closeouts.

## Why this phase exists

After Phase 22.5, the harness should have a shared runtime model. Phase 23 makes that model durable and queryable.

The system should no longer rely only on chat history, terminal output, or human notes to understand what happened in a phase. It should be able to reconstruct a run timeline from local evidence.

## Scope

### Storage model

Implement a two-layer local storage model:

```text
Append-only JSONL ledger = durable source of trace/truth
SQLite projection = indexed query/report layer
```

The JSONL ledger is the required source of truth. SQLite is a rebuildable projection.

### Evidence records

Capture versioned records for:

- runs;
- phase runs;
- steps;
- command results;
- verification results;
- review results;
- findings;
- decisions;
- approvals;
- closeout receipts;
- artifact references;
- repository/change metadata;
- remote check results and CI run references;
- redaction/retention metadata.

### Artifact references

Add artifact references by path/hash/metadata rather than storing large raw blobs directly in the event stream. Remote CI logs and command logs should be represented by bounded summaries, hashes, and artifact references rather than unbounded raw log copies by default.

### Schema/versioning

Add explicit schema versions for ledger events and projection records. Unknown versions must fail clearly or be skipped according to documented compatibility policy.

### Projection rebuild

Add deterministic rebuild from JSONL ledger to SQLite projection.

### Redaction and retention metadata

Track redaction status and retention flags. Do not export sensitive data by default.

### Import/export skeleton

Define the initial structure for versioned, redacted portable bundles, but do not overbuild the final cross-machine sync model in this phase.

## Hard constraints

- local-first;
- no SaaS by default;
- no raw SQL exposed by default;
- no automatic memory promotion;
- no vector DB by default;
- no always-on agent;
- no daemon mode;
- no raw database synchronization as default;
- no assumption that Memory is globally shared between machines/clones;
- no MCP in this phase;
- no Direct API agent-facing layer in this phase;
- no domain pack logic in core.

## Non-goals

- no agent brain;
- no advisor;
- no automatic project changes;
- no self-editing;
- no auto-commit;
- no auto-merge;
- no web dashboard;
- no connector marketplace;
- no remote ingestion endpoint;
- no hidden cloud dependency;
- no vector search as a required feature.

## Implementation guardrails

- JSONL is the durable source of truth; SQLite is a projection and must be rebuildable.
- If the SQLite projection fails, the ledger must remain inspectable and recoverable.
- Do not expose raw SQL as an agent-facing or user-facing default interface.
- Do not silently migrate existing memory/debt/decision files into durable Memory without an explicit compatibility decision.
- Existing Phase 9 project memory/debt commands and files must keep their current behavior unless an explicit compatibility note and tests cover the change.
- Do not store raw prompts, full stdout/stderr, diffs, secrets, or private traces by default without classification/redaction policy.
- Import/export must be explicit and redacted; raw `.harness` or raw SQLite sync is not supported by default.

## Minimum event envelope

The exact shape can change, but every ledger event should have at least:

```text
event_id
schema_version
created_at
run_id
phase_run_id optional
step_id optional
event_type
source
payload
sensitivity/redaction metadata
repository/change metadata where applicable
```

Large artifacts should be stored by reference, not embedded directly in the ledger.

## CLI surface

Exact names can change, but the phase should provide equivalent commands:

```bash
node bin/ch memory init
node bin/ch memory status
node bin/ch memory rebuild
node bin/ch memory runs --last 20
node bin/ch memory show <run-id>
node bin/ch memory export --dry-run
```

Commands must be local, deterministic, and safe by default.

## Expected behavior

- runtime events are written to append-only JSONL;
- SQLite projection can be rebuilt from ledger;
- run timeline can be queried from projection;
- artifact references are stable and inspectable;
- redaction status is tracked;
- retention flags are explicit;
- import/export is treated as explicit and redacted, not raw `.harness` folder sync;
- existing memory/debt/decision features remain distinct from durable evidence memory unless migrated explicitly.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- Phase 22.5 runtime service outputs and contracts;
- existing memory/debt/decision modules, preserving Phase 9 behavior;
- CLI memory command modules or their current equivalent;
- `schemas/**` for versioned ledger, projection, and event contracts;
- `tests/acceptance/**` for Phase 23 memory/evidence coverage.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory --help
node bin/ch memory init --dry-run
node bin/ch memory status
node bin/ch memory rebuild --dry-run
```

## Acceptance behavior

- JSONL ledger writer exists and is covered by tests;
- SQLite projection is rebuildable from JSONL;
- rebuild is deterministic for the same ledger input;
- malformed or unsupported schema versions fail clearly;
- run timeline can be reconstructed from stored evidence;
- required remote check status can be stored and replayed as evidence;
- package output excludes raw runtime memory state;
- export path refuses unredacted sensitive records by default;
- no raw SQL is exposed to agents or external callers;
- no vector DB, SaaS, daemon, MCP, Direct API, or domain packs are introduced.

## Review focus

Reviewers must check especially for:

- Memory becoming an autonomous agent or hidden decision-maker;
- raw logs/prompts/traces being stored without classification;
- raw SQLite sync being implied as a supported workflow;
- product repository pollution from `.harness` runtime files;
- schema debt from large unversioned event blobs;
- SQLite projection becoming the source of truth instead of rebuildable cache;
- hidden model-side summarization;
- accidental Phase 24/25/26 implementation;
- remote CI evidence being stored as provider-only core data instead of provider-neutral records.

## Suggested implementation order

1. Define event envelope and schema versioning.
2. Add append-only JSONL writer/reader.
3. Add artifact reference model and remote check evidence records.
4. Add SQLite projection and rebuild command.
5. Add redaction/retention metadata.
6. Add memory status and run timeline commands.
7. Add package/repo cleanliness tests.
8. Update docs to distinguish evidence memory from agent memory.

## Required return from implementation agent

When this task is implemented, the agent must return:

- files changed;
- scope summary;
- explicit confirmation that non-goals were not implemented;
- verification commands and results;
- review/fix-pass status if applicable;
- remaining debt or open questions;
- final git status.

## Completion criteria

Phase 23 is complete when a run can be durably recorded, replayed, and projected into a queryable local timeline without introducing agent autonomy, SaaS, raw SQL exposure, vector DB, or MCP.
