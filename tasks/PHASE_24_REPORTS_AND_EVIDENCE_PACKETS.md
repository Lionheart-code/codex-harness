# Phase 24 — Reports and LLM-ready Evidence Packets

## Status

Planned. Blocked until Phase 23 Memory/Evidence Core is complete and reviewed.

## Review status

Reviewed v2. The main correction is to make reports and packets explicitly claim-to-evidence artifacts. Deterministic reports must work without an LLM call.

## Read before editing

- Phase 22.5 runtime receipts
- Phase 23 Memory/Evidence contracts and projection APIs
- `docs/PHASE_ACCEPTANCE.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/HARNESS_EVALS_AND_REGRESSION.md`
- `docs/CONTEXT_BUDGET_POLICY.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- existing report/review modules
- `tests/acceptance/**`


## Goal

Turn stored evidence into deterministic, bounded, redacted reports and LLM-ready evidence packets.

This phase makes Memory useful for review, closeout, handoff, risk analysis, and proposal drafting without making the model output itself a source of truth.

## Why this phase exists

Phase 23 stores evidence. Phase 24 packages that evidence into inspectable outputs.

The harness must be able to answer: what happened, what was verified, what failed, what was reviewed, what remains risky, and what evidence supports each claim.

## Scope

### Reports

Implement deterministic reports for:

- run closeout report;
- acceptance evidence report;
- remote CI/check evidence report;
- review packet;
- handoff packet;
- governance decision report;
- unresolved-risk report;
- reviewer disagreement report;
- repeated failure report;
- self-improvement proposal draft;
- portable handoff/export bundle summary.

### Evidence packets

Add packet generation for bounded LLM/agent context.

Packet requirements:

- deterministic evidence selection;
- explicit provenance;
- remote check provenance, including provider, run id or URL, commit SHA, job/step conclusions, and failed-step log references or bounded/redacted excerpts when failed;
- redaction before export;
- token/size budget awareness;
- reproducible output where practical;
- claim-to-evidence traceability;
- no hidden model-side summarization required;
- no domain-specific prompt logic in core.

### Proposal drafts

Add proposal draft output from evidence, but do not promote proposals automatically.

Possible lifecycle:

```text
Evidence
→ deterministic report
→ optional advisor analysis later
→ proposal draft
→ human approval
→ task/doc promotion
→ normal phase workflow
```

In this phase, proposal draft generation must remain non-mutating unless explicitly writing to a draft/output path.

### Packet manifest

Every packet should include or reference a small manifest:

```text
packet_id
packet_type
source_run_id
schema_version
created_at
evidence_record_ids
artifact_refs
redaction_status
token_or_size_budget
truncation_policy
claims_without_direct_evidence, if any
```

### Remote log handling

Do not embed unbounded raw CI logs into packets. Store or reference bounded, redacted, relevant failed-step excerpts and keep larger logs as artifact references where practical.

### Claim-to-evidence rule

Material claims in review, closeout, handoff, risk, and proposal packets must be either:

- linked to evidence;
- explicitly marked as inference;
- explicitly marked as missing/unknown.

Do not allow polished prose to hide missing evidence.

## Non-goals

- no hidden summarization;
- no model-only truth;
- no automatic proposal promotion;
- no auto-edit;
- no auto-commit;
- no auto-merge;
- no autonomous advisor;
- no external LLM requirement for deterministic reports;
- no MCP;
- no domain prompt logic in core;
- no publishing or external writes;
- no web dashboard.

## CLI surface

Exact names can change, but equivalent behavior should exist:

```bash
node bin/ch memory report closeout --run <run-id>
node bin/ch memory report acceptance --run <run-id>
node bin/ch memory report remote-ci --run <run-id>
node bin/ch memory report risk --run <run-id>
node bin/ch memory report repeated-failures
node bin/ch memory packet review --run <run-id>
node bin/ch memory packet handoff --run <run-id>
node bin/ch memory proposal draft --run <run-id> --dry-run
```

## Expected behavior

- reports are generated from stored evidence, not from chat memory;
- every material claim in a packet links back to evidence or is marked as inference;
- sensitive records are redacted before export;
- packet size is bounded and visible;
- deterministic reports do not require LLM/API calls;
- proposal drafts remain drafts until human promotion;
- domain-specific formatting can be added later through packs, not core.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- existing report/review modules;
- Phase 23 Memory/Evidence projection APIs;
- packet/report builders in core modules;
- `schemas/**` for report, packet, and packet manifest contracts;
- `tests/acceptance/**` for deterministic report and packet coverage.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory report --help
node bin/ch memory packet --help
```

## Acceptance behavior

- closeout report can be generated from a stored test run;
- acceptance evidence report includes verification commands and outcomes;
- remote CI/check report includes provider, run id or URL, commit SHA, job/step conclusions, and failed-step logs when failed;
- review packet includes relevant findings, decisions, reviews, and artifacts;
- unresolved-risk and repeated-failure reports are deterministic;
- packet output includes provenance and redaction status;
- closeout and handoff packets include required remote CI/check status when available;
- packet generation respects token/size budget;
- no LLM call is required for deterministic report generation;
- proposal drafts are not promoted to tasks/docs automatically;
- no MCP, Direct API agent layer, domain packs, SaaS, dashboard, or external writes are introduced.

## Review focus

Reviewers must check especially for:

- report text making claims without evidence;
- hidden summarization changing facts;
- redaction happening after export instead of before;
- packet generation relying on private raw logs by default;
- remote CI failure logs being omitted from closeout/handoff evidence;
- proposal drafts being treated as approved tasks;
- domain-specific report logic entering core;
- accidental Agent Access Layer work.

## Suggested implementation order

1. Define report/packet output contracts.
2. Add report builders over Memory/Evidence projection.
3. Add provenance mapping and claim/evidence markers, including remote CI/check provenance.
4. Add redaction-before-export path.
5. Add token/size budgeting.
6. Add proposal draft output as non-promoting artifact.
7. Add acceptance fixtures and deterministic output tests.
8. Update docs and review protocol.

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

Phase 24 is complete when evidence can be converted into deterministic reports and bounded review/handoff packets with provenance, redaction, and reproducibility, without hidden model summarization or autonomous promotion.
