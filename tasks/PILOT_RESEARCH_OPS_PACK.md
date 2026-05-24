# Pilot — Research Ops Pack

## Status

Planned. Blocked until Phase 27 Domain Pack / Skills Architecture is complete and reviewed.

## Review status

Reviewed v2. The main correction is to keep this as a provenance/citation pilot, not a general browsing or autonomous research agent.

## Read before editing

- Phase 27 pack contract
- Phase 24 packet/report constraints
- `docs/CONTEXT_BUDGET_POLICY.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- pack fixture conventions from the software-engineering reference pack


This is the first production non-code domain candidate. It should validate that the pack architecture can support evidence-heavy work outside software engineering without adding domain logic to core.

## Goal

Create a Research Ops pack for read-mostly, provenance-oriented workflows.

The pack should help collect sources, extract evidence, check contradictions, synthesize research, audit citations, and produce handoff packets while preserving traceability from claim to source.

## Why Research Ops first

Research Ops is the safest first non-code pack because it is:

- read-mostly;
- evidence-heavy;
- local-first friendly;
- citation/provenance oriented;
- lower risk than publishing, outbound sales, CRM updates, calendar automation, or marketing distribution workflows.

## Scope

Candidate workflows:

- source collection;
- source freshness report;
- evidence extraction;
- claim-to-source traceability review;
- contradiction check;
- synthesis report;
- citation/provenance audit;
- research handoff packet;
- research risk report.

Pack artifacts may include:

- research brief;
- source list;
- source card;
- evidence item;
- claim record;
- contradiction finding;
- synthesis report;
- handoff packet.

## Default policy

```text
read-mostly
no external writes by default
no autonomous publication
human approval for promoted outputs
claim-to-source traceability required
source freshness visible
redaction before export
```

## Evidence quality rules

Research outputs must distinguish:

- directly supported source facts;
- model or analyst inference;
- unsupported claims;
- stale or uncertain source material;
- contradictory evidence.

A cited-looking output without traceable source evidence should fail review.

## Non-goals

- no external publishing;
- no CRM/calendar/email actions;
- no browser automation requirement;
- no autonomous source purchasing or account login;
- no legal/financial/medical final advice automation;
- no hidden model-side summarization;
- no unsupported citation fabrication;
- no domain logic in core;
- no write connectors by default.

## Expected behavior

- pack manifest validates;
- workflows use core runtime, memory, reports, and packet services;
- each major claim can point to source/evidence;
- source freshness and uncertainty are visible;
- contradiction findings are explicit;
- synthesis report separates evidence, inference, and recommendation;
- outputs remain drafts/reports until human approval;
- no external write action is performed by default.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- Research Ops pack files under the Phase 27 pack layout;
- pack-local schemas, templates, workflows, and fixtures;
- acceptance tests for cited evidence packets and contradiction findings;
- no core source changes except through generic pack interfaces already introduced by Phase 27.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch pack validate packs/research-ops
```

Exact path/command may change according to Phase 27 pack structure.

## Acceptance behavior

- Research Ops pack validates against pack schema;
- sample research workflow produces a cited evidence packet;
- sample synthesis report includes claim-to-source traceability;
- contradiction check produces structured findings;
- output marks stale/uncertain sources;
- no external writes occur;
- core code remains free of Research Ops domain entities except generic pack interfaces.

## Review focus

Reviewers must check especially for:

- hallucinated citations;
- claims without source evidence;
- research pack logic leaking into core;
- hidden external writes;
- source freshness being ignored;
- sensitive source data exported without redaction;
- scope creep into legal/financial/medical final decisions;
- pack becoming a general research agent rather than bounded workflows.

## Suggested implementation order

1. Create Research Ops pack manifest.
2. Add research artifact schemas inside the pack.
3. Add source/evidence/claim templates.
4. Add deterministic citation/provenance report template.
5. Add contradiction-check workflow template.
6. Add handoff packet template.
7. Add fixtures and acceptance tests.
8. Document allowed and forbidden Research Ops behaviors.

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

The pilot is complete when a Research Ops workflow can produce a redacted, cited, reviewable evidence packet from sample inputs without external writes and without adding Research Ops logic into core.
