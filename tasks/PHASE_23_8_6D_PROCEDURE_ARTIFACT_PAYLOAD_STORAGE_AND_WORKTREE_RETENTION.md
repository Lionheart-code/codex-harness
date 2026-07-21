# Phase 23.8.6D - Procedure Artifact Payload Storage and Worktree Retention

## Status

Complete, reviewed, accepted, and merged. Its durable procedure-payload,
successor-recovery, and worktree-retention authority now precedes Phase
23.8.6E freshness revalidation.

## Purpose

Make recorded procedure artifact bodies durably recoverable from SQLite-backed
storage and accepted/project-memory harvest, without depending on disposable
run-local markdown files.

## Problem

Structured procedure records can survive while raw procedure markdown bodies
remain file-only artifacts under run-local `manual/*.md` or `evidence/*.md`
paths. That leaves a durability gap: once the local worktree or compatibility
markdown files disappear, the project DB cannot reconstruct or audit the actual
recorded procedure body.

The storage gap is not only file-vs-payload durability. Generic project
records queried only by display `run_id` can mix old and new run instances
that reuse the same display identity, which is not safe for durable review,
verification, closeout, harvest, or proof readback.

## Scope

This phase owns raw procedure artifact payload storage, canonical procedure
identity, exact plan/evidence binding, exact-identity harvest preservation, and
the worktree/base-commit provenance needed to audit those artifacts later.

It also owns the narrow successor-Codex-task handoff boundary required before
D implementation begins. The later D `task-intake` and `draft-plan` must
determine the smallest compliant implementation and review surface for that
boundary, including product-owned fail-closed recovery when a harvested
predecessor lacks a recorded next-task decision or an already-activated
successor lacks its uniquely owning `TaskState` because materialization was
skipped.

## Required behavior

- Store raw recorded procedure artifact bodies in SQLite payload tables as
  authoritative structured payloads, not as file-only side effects.
- Preserve exact run identity, procedure identity, and artifact provenance
  alongside those payloads.
- Store the canonical procedure ID and reject payload ingestion or readback
  when a supplied procedure identity cannot be resolved through the checked-in
  registry contract.
- Preserve a stable recorded timestamp and content hash for each authoritative
  procedure body so later readback can distinguish exact content from a newer
  file at the same compatibility path.
- Bind plan approvals and review/evidence results to the exact immutable plan
  or evidence artifact identity they reviewed. Path, display `run_id`, or
  procedure name alone is insufficient authority.
- Key or explicitly resolve durable project records through exact run identity
  such as `run_instance_id` and `project_run_id`, never by display `run_id`
  alone.
- Preserve enough worktree retention metadata to audit where the recorded
  artifact came from even after the original worktree is pruned or unavailable.
- Preserve exact-identity payloads into the project DB during harvest or
  equivalent promotion.
- If a staged mutation, authoritative readback, or later promoted review
  artifact cannot prove exact run identity, it must fail closed instead of
  mutating or resolving by display `run_id` alone.
- Keep run-local markdown files available only as non-authoritative transition
  artifacts when compatibility requires them.
- Make project-DB readback able to reconstruct or audit recorded procedure
  artifact bodies without relying on run-local file presence.
- Deep-validate storage-owned payload, procedure identity, exact-plan binding,
  and exact-evidence binding records on ingestion and authoritative readback.
  Do not accept shallow object/container casts as durable storage authority.
- Cover exact-instance keyed or exact-instance resolvable storage for:

  ```text
  procedure artifacts
  review artifacts
  plan artifacts
  verification results
  delivery facts
  closeout receipts
  harvest records
  payload index entries
  artifact references
  ```

- Distinguish clearly between:

  ```text
  artifact body
  artifact reference
  payload chunk/ref
  structured lifecycle record
  manual request file
  diagnosis/reconciliation note
  accepted durable project memory
  ```

- Define which artifact types are promoted as structured project records and
  which remain file-backed run-local evidence.
- If manual-only procedures such as `docs-consistency-review` or
  `harness-audit` are later promoted into durable surfaces, their artifact
  bodies must follow the same payload-storage and exact-identity rules rather
  than bypassing durable storage as ad hoc markdown.
- Do not treat every `*-request.md`, launch blocker, diagnosis snapshot, or
  reconciliation note as a promoted project record by default.
- Keep storage and harvest behavior append-only and exact-identity safe.
- After Git branch/worktree preparation and the activation-authority commit,
  create the successor Codex Desktop task through the native task/worktree API.
  Verify the created task's cwd, branch, and `HEAD` binding, then expose its
  successor-task identity or link so the user can open it without creating,
  selecting, or searching for a repository or worktree. Stop the predecessor
  before any successor work. If creation or binding cannot be proven, fail
  closed with typed `HANDOFF_CREATION_FAILED`: do not bootstrap, start a
  successor Harness run, or execute shell work in the successor.
- Detect the recovery case truthfully: a predecessor may be harvested without
  a recorded next-task decision, while a successor branch/worktree may already
  contain activation commits but have no uniquely matching installed
  `TaskState` because materialization was skipped. Later D `task-intake` and
  `draft-plan` must specify the smallest product-owned, fail-closed recovery
  that re-establishes a valid successor context from the recorded immutable
  decision base before materialization and activation proof. It must preserve
  immutable decision-base and activation authority; it must not manually edit
  `TaskState` or databases, substitute the current `HEAD` for the base,
  silently claim an already-advanced worktree, or run the successor before its
  owner match is proven.

## Non-goals

- No packet automation.
- No runner execution.
- No provider/model routing.
- No context bundle, `ContextCore`, or `ContextManifest` construction.
- No route telemetry, provider execution, or hidden transcript/reasoning
  storage as authority.
- No domain-pack behavior.
- No broad report-generation layer.
- No raw SQL surface for agents.
- No replacement of runtime/closeout/harvest authority with loose file scans.
- No reimplementation of Phase 23.8.6C2 current-bootstrap task, base-commit,
  `RunIssue`, `RepairPacket`, fact, or handoff parsing.
- No reimplementation of C2A commit-backed task activation, deterministic
  worktree bootstrap, or ignored-private-state boundary.
- No generic UI automation framework, provider routing, runner execution,
  payload implementation beyond this phase's stated storage scope, or
  background control.

## Future-compatible payload contract

Storage primitives must preserve immutable payload identity, exact run
identity, stable content hash, recorded timestamp, MIME/type or equivalent
classification, bounded payload/chunk references, authoritative readback, and
worktree/source/base provenance. Reference semantics must remain generic enough
for later `ContextManifest`, packet, and proof phases without implementing
those phases here.

## Acceptance commands

```bash
npm run build
npm test
git diff --check
```

## Acceptance behavior

- Raw recorded procedure artifact bodies are durably stored in SQLite-backed
  payload tables with exact-identity provenance.
- Canonical procedure identity, recorded timestamp, content hash, and exact
  reviewed plan/evidence bindings survive authoritative readback.
- Mutating or authoritative readback paths fail closed when exact run identity
  cannot be proven, instead of accepting display-`run_id` fallback behavior.
- Project-harvest promotion preserves those payloads into project DB authority.
- Compatibility markdown files may exist, but they are explicitly documented as
  non-authoritative transition artifacts.
- Project DB must be able to reconstruct or audit recorded procedure artifact
  bodies from SQLite payload storage after run-local evidence markdown files
  are absent, unavailable, or treated as non-authoritative compatibility
  artifacts.
- Worktree/task/branch/base-commit provenance is retained strongly enough to
  audit origin after the original local files are gone.
- The implementation does not require manual `manual/*.md` or `evidence/*.md`
  files to remain present for authoritative readback.
- Add or update deterministic storage/harvest tests that prove payload bodies
  survive authoritative readback without run-local markdown files.
- If a full-pack proof is required, use `npm test` as the canonical command and
  treat `npm run test:acceptance` as a compatibility alias only.
- Record the exact audit/reconstruction proof used to show project-DB recovery
  after local file absence.

## Source/runtime boundary

This phase may change the storage, payload, harvest, and authoritative readback
layers needed for SQLite-backed procedure artifact durability. It must not add
runner execution, packet automation, provider/model routing, or domain-pack
behavior.

## Relationship to previous and next phases

- Follows Phase 23.8.6C2 and C2A so bootstrap/runtime entrypoints have
  truthful task, checkout, source-snapshot, base, committed activation, and
  runnable-worktree authority before artifact durability is widened.
- Takes supervised review-launch evidence from Phase 23.8.6B1 once that phase
  exists, but B1 itself must fail closed instead of inventing an interim
  global storage layer.
- Prepares Phase 23.8.6E to revalidate storage/harvest assumptions against real
  implementation facts.
- Prepares Phase 23.8.7, Phase 23.9, and later report/proof phases to consume
  durable procedure bodies instead of disposable worktree files.

## Final report expectations

The implementation report for this phase must state:

- which SQLite payload tables or storage surfaces became authoritative for raw
  procedure bodies;
- which compatibility markdown files remain and why they are non-authoritative;
- how exact-identity harvest preserved payloads into project DB;
- what audit/reconstruction proof was used after local file absence;
- verification results;
- any remaining retention debt or migration risk.
