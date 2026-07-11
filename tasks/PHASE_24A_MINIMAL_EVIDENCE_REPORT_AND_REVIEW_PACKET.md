# Phase 24A - Minimal Evidence Report and Review Packet

## Status

Planned split from `tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`.
Starts only after Phase 23.9 Minimal Proof-Carrying Work over
Procedure/Stage Records is complete, reviewed, and accepted.

## Purpose

Implement the smallest useful deterministic report/packet substrate before the
broader Phase 24 report catalog is attempted.

## Scope

Implement only:

- one deterministic run evidence or closeout report;
- one deterministic shared `ContextCore`/`ContextManifest`;
- one bounded implementation-review packet using a distinct `ReviewOverlay`.

The shared core contains task identity/contract refs, effective approved plan
refs, procedure-contract refs, review tier, surface/risk classes, exact
run/worktree/source/base identity, and architectural invariants. The review
overlay contains diff and changed-file manifests, implementation claims,
verification summary, prior `FIX_REQUIRED` findings, required lenses, missing
evidence, and bounded payload references.

The manifest records a stable ID and content hash, deterministic ordering,
size budget, truncation/redaction facts, and source provenance. Identical
authoritative inputs produce identical ordering/hash. Missing mandatory
context blocks generation, and mandatory context is never removed for budget.
Independent reviewers receive the packet plus read-only retrieval, not builder
transcript authority.

Required behavior preserved from the original Phase 24 task:

- reports/packets consume accepted Project Memory DB records and
  operator/procedure/proof state;
- reports/packets do not decide lifecycle;
- output is deterministic where practical;
- claims link to evidence or are marked inference/missing;
- redaction happens before export;
- packet size/truncation is visible;
- provenance includes Project Memory record IDs, payload/chunk refs where
  needed, procedure IDs, and source-map/procedure-contract refs;
- remote CI/check provenance is represented when available, including provider,
  run ID or URL, commit SHA, job/step conclusions, and bounded/redacted
  failed-step excerpts when failed;
- no hidden model-side summarization;
- no LLM call required for deterministic report generation;
- no domain-specific prompt logic in core.

## Non-goals

- No proposal drafts.
- No governance report catalog.
- No repeated-failure analytics.
- No reviewer-disagreement report.
- No portable export bundle.
- No broad packet taxonomy.
- No MCP.
- No full Agent Access Layer.
- No domain packs.
- No external writes.
- No lifecycle authority independent of runtime/closeout/harvest rules.

## Future-phase impact check

- Prepares Phase 24B, Phase 25A, and Phase 26 by proving the smallest useful
  report/packet substrate.
- Must not pre-implement broad packet catalog, proposal drafting, governance
  analytics, domain packs, MCP, or planner execution.
- Preserves the domain/core boundary by keeping outputs self-hosting/workflow
  generic and evidence-linked.
- Requires architecture review if report generation starts deciding lifecycle,
  promoting tasks, summarizing hidden model memory, or adding domain-specific
  report logic in core.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory report --help
node bin/ch memory packet --help
git diff --check
```

If command grouping differs, implement equivalent behavior and document the
mapping.

## Acceptance behavior

- Run evidence/closeout report can be generated from accepted records.
- One review/handoff packet includes relevant task, evidence, proof/procedure
  refs, missing evidence markers, and bounded context.
- Redaction and truncation are visible.
- Material claims are evidence-linked, inference-marked, or missing/unknown.
- No LLM/API call is required.
- No proposal drafts, governance catalog, broad packet taxonomy, MCP, Agent
  Access Layer, domain packs, dashboard, SaaS, or external writes are
  introduced.
