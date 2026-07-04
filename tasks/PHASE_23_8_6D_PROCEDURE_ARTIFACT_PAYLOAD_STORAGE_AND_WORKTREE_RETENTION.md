# Phase 23.8.6D - Procedure Artifact Payload Storage and Worktree Retention

## Status

Planned. Starts only after Phase 23.8.6C Minimum Self-Hosting Orchestrator
Entrypoint is complete, reviewed, accepted, and merged.

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

This phase owns raw procedure artifact payload storage, exact-identity harvest
preservation, and the worktree/base-commit provenance needed to audit those
artifacts later.

## Required behavior

- Store raw recorded procedure artifact bodies in SQLite payload tables as
  authoritative structured payloads, not as file-only side effects.
- Preserve exact run identity, procedure identity, and artifact provenance
  alongside those payloads.
- Key or explicitly resolve durable project records through exact run identity
  such as `run_instance_id` and `project_run_id`, never by display `run_id`
  alone.
- Preserve enough worktree retention metadata to audit where the recorded
  artifact came from even after the original worktree is pruned or unavailable.
- Preserve exact-identity payloads into the project DB during harvest or
  equivalent promotion.
- Keep run-local markdown files available only as non-authoritative transition
  artifacts when compatibility requires them.
- Make project-DB readback able to reconstruct or audit recorded procedure
  artifact bodies without relying on run-local file presence.
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
- Do not treat every `*-request.md`, launch blocker, diagnosis snapshot, or
  reconciliation note as a promoted project record by default.
- Keep storage and harvest behavior append-only and exact-identity safe.

## Non-goals

- No packet automation.
- No runner execution.
- No provider/model routing.
- No domain-pack behavior.
- No broad report-generation layer.
- No raw SQL surface for agents.
- No replacement of runtime/closeout/harvest authority with loose file scans.

## Acceptance commands

```bash
npm run build
npm test
git diff --check
```

## Acceptance behavior

- Raw recorded procedure artifact bodies are durably stored in SQLite-backed
  payload tables with exact-identity provenance.
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

- Follows Phase 23.8.6C so bootstrap/runtime entrypoints have a stable identity
  surface before artifact durability is widened.
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
