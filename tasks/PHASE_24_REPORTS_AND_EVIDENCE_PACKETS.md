# Phase 24 — Reports and LLM-ready Evidence Packets

## Status

Superseded as a single implementation task by:

- `tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md`
- `tasks/PHASE_24B_EXPANDED_REPORTS_AND_PACKETS.md`

This file remains the source catalog for useful Phase 24 report, packet,
redaction, provenance, and manifest constraints. Implementers must not treat
the broad catalog below as permission to implement all reports in Phase 24A.

Phase 24A starts only after Phase 23.9 operator/procedure/proof foundations are
complete, reviewed, and accepted. Phase 24B starts only after Phase 24A shows
concrete value.

## Review status

Reviewed and updated after the Phase 23.5 / Phase 23.6 split and the Gate 2
operator-first roadmap import.

The main correction is that Phase 24 must build reports and packets on top of
accepted Project Memory DB records, Phase 23.6 workflow contracts, and the
Phase 23.7-23.9 operator/procedure/proof foundations, not directly on older
Phase 23 JSONL/projection assumptions.

Phase 24 reports and packets consume operator/procedure/proof state. They do
not decide lifecycle status independently.

Split rule:

- Phase 24A implements one deterministic run evidence/closeout report and one
  bounded implementation-review or handoff packet.
- Phase 24B may add the broader report/packet catalog only after measured use,
  with one acceptance fixture per new surface.
- Neither phase may introduce MCP, full Agent Access Layer, domain packs,
  external writes, hidden summarization, or lifecycle authority.

## Read before editing

- `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `tasks/PHASE_23_7_MINIMUM_SELF_HOSTING_OPERATOR_INTERPRETER.md`
- `tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`
- `tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/PROJECT_MEMORY_AND_DEBT.md`
- `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/HARNESS_EVALS_AND_REGRESSION.md`
- `docs/CONTEXT_BUDGET_POLICY.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- existing report/review modules
- Project Memory DB APIs introduced by Phase 23.5
- self-hosting procedure contracts introduced by Phase 23.6
- `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md` introduced by Phase 23.6
- `docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md`
- `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`
- `docs/SELF_HOSTING_REVIEW_TIER_POLICY.md`
- `schemas/**`
- `tests/acceptance/**`

If a listed file does not exist, use the closest actual file and document the difference.

## Goal

Turn accepted project memory into deterministic, bounded, redacted reports and LLM-ready evidence packets.

This phase makes Project Memory useful for review, closeout, handoff, risk analysis, plan review, and proposal drafting without making model output itself a source of truth.

## Why this phase exists

Phase 23.5 makes memory authority durable and DB-first.

Phase 23.6 defines the self-hosting plan-review workflow.

Phase 23.7-23.9 add operator status, procedure registry, and minimal proof
records that reports and packets should consume when present.

Phase 24 packages accepted Project Memory records into inspectable outputs.

The harness must be able to answer:

- what happened;
- what was verified;
- what failed;
- what was reviewed;
- what decisions were made;
- what delivery facts exist;
- what remains risky;
- what evidence supports each material claim;
- what context a planner/reviewer/implementer should receive.

## Scope

### 1. Deterministic reports

Implement deterministic reports for:

- run closeout report;
- acceptance evidence report;
- remote CI/check evidence report;
- review packet report;
- handoff packet report;
- governance decision report;
- unresolved-risk report;
- reviewer disagreement report;
- repeated failure report;
- self-improvement proposal draft;
- portable handoff/export bundle summary.

Reports must be generated from accepted Project Memory DB records and approved payload references, not chat history, hidden model memory, old raw JSONL scans, or direct raw SQLite access.

### 2. Evidence packets

Add packet generation for bounded LLM/agent context.

Packet requirements:

- deterministic evidence selection;
- explicit provenance;
- Project Memory record ids;
- payload references/chunk references where needed;
- initiative outputs when present in accepted records, including proposed tasks, risks, open questions, command-safety notes, and handoff context;
- operator status, next allowed action, blockers, review tier, and proof-record
  references when present in accepted records;
- remote check provenance, including provider, run id or URL, commit SHA, job/step conclusions, and bounded/redacted failed-step excerpts when failed;
- redaction before export;
- token/size budget awareness;
- reproducible output where practical;
- claim-to-evidence traceability;
- explicit missing/unknown markers;
- no hidden model-side summarization required;
- no domain-specific prompt logic in core.

### 3. Packet types for self-hosting workflow

Support packets needed by the Phase 23.6 workflow:

- planner packet;
- plan-review packet;
- implementation-review packet;
- closeout-review packet;
- architecture-review packet;
- DB/storage-review packet;
- docs-consistency packet.

These packets are generic self-hosting workflow packets, not full domain packs.

Each self-hosting packet must reference the Phase 23.6 procedure contract/rubric used to select and interpret evidence. At minimum, support this linkage:

```text
planner packet:
  feature-decomposition when the request is too broad for one implementation pass
  task-intake
  task-prompt-writer
  draft-plan

plan-review packet:
  plan-review
  plan-amend
  architecture-review when the task is high/extra-high

implementation-review packet:
  implementation-review
  fix-pass-review
  verification-review

closeout-review packet:
  delivery-facts-review
  phase-closeout-review

DB/storage-review packet:
  db-storage-review

docs-consistency packet:
  docs-consistency-review
```

Packet manifests must identify the relevant `procedure_id`, review intensity tier where applicable, and the source-map entry or equivalent provenance for the procedure.

### 4. Proposal drafts

Add proposal draft output from evidence, but do not promote proposals automatically.

Allowed lifecycle:

```text
Project Memory evidence
→ deterministic report
→ optional advisor/LLM analysis later
→ proposal draft
→ human approval
→ task/doc promotion through normal workflow
```

In this phase, proposal draft generation must remain non-mutating unless explicitly writing to a draft/output path.

Agent initiative outputs may inform reports, packets, and proposal drafts, but they remain reviewable material only until explicitly promoted through the normal task/doc workflow.

### 5. Packet manifest

Every packet must include or reference a manifest:

```text
packet_id
packet_type
source_run_id optional
source_phase optional
schema_version
created_at
project_memory_record_ids
payload_refs_or_chunk_refs
redaction_status
token_or_size_budget
truncation_policy
claims_without_direct_evidence
missing_required_evidence
created_by_command_or_procedure
procedure_ids
procedure_source_map_refs
review_intensity_tier optional
```

### 6. Remote log handling

Do not embed unbounded raw CI logs into packets.

Use bounded, redacted, relevant failed-step excerpts and link to stored Project Memory payload/chunk references where available.

### 7. Claim-to-evidence rule

Material claims in review, closeout, handoff, risk, and proposal packets must be one of:

- linked to evidence;
- explicitly marked as inference;
- explicitly marked as missing/unknown.

Polished prose must not hide missing evidence.

### 8. Report/packet stability

Where practical, reports and packets must be deterministic under stable inputs.

Required behavior:

- stable ordering;
- visible truncation policy;
- visible missing-evidence markers;
- schema version;
- no reliance on hidden chat state;
- no LLM call for deterministic report generation.

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
- no full agent access layer;
- no lifecycle authority independent of runtime/closeout/harvest rules;
- no full domain pack runtime;
- no pack manifest/loader/marketplace;
- no domain prompt logic in core;
- no publishing or external writes;
- no web dashboard;
- no rework of Phase 23.5 storage authority;
- no rework of Phase 23.6 procedure source-of-truth.

## CLI surface

Exact names can change, but equivalent behavior should exist:

```bash
node bin/ch memory report closeout --run <run-id>
node bin/ch memory report acceptance --run <run-id>
node bin/ch memory report remote-ci --run <run-id>
node bin/ch memory report risk --run <run-id>
node bin/ch memory report repeated-failures
node bin/ch memory packet planner --task <task-id-or-path>
node bin/ch memory packet plan-review --task <task-id-or-path>
node bin/ch memory packet implementation-review --run <run-id>
node bin/ch memory packet closeout-review --run <run-id>
node bin/ch memory packet handoff --run <run-id>
node bin/ch memory proposal draft --run <run-id> --dry-run
```

If command grouping differs, implement equivalent behavior and document the mapping.

## Expected behavior

- reports are generated from accepted Project Memory DB records through Project Memory APIs;
- every material claim links back to evidence or is marked as inference/missing;
- sensitive records are redacted before export;
- packet size is bounded and visible;
- deterministic reports do not require LLM/API calls;
- proposal drafts remain drafts until human promotion;
- self-hosting workflow packets support Phase 23.6 procedures;
- self-hosting workflow packets may include initiative outputs such as proposed tasks, risks, open questions, command-safety notes, and handoff context when those exist in accepted evidence;
- domain-specific formatting can be added later through packs, not core.

## Suggested file areas

Subject to repo inspection:

- report/review modules;
- Project Memory DB read APIs;
- packet/report builders;
- payload reference/chunk access helpers;
- schemas for report, packet, and packet manifest contracts;
- self-hosting procedure integration points;
- `tests/acceptance/**` for deterministic report and packet coverage.

## Acceptance commands

Use repository-equivalent commands if names differ:

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory report --help
node bin/ch memory packet --help
```

## Acceptance behavior

- closeout report can be generated from accepted Project Memory records;
- acceptance evidence report includes verification commands and outcomes;
- remote CI/check report includes provider, run id or URL, commit SHA, job/step conclusions, and failed-step excerpts when failed;
- planner packet includes relevant task, prior decisions, unresolved risks, and applicable procedures;
- planner and plan-review packet material may include bounded initiative outputs such as proposed tasks, open questions, command-safety notes, and handoff context when present in accepted records;
- plan-review packet includes task contract, architectural constraints, prior decisions, and review rubric references;
- implementation-review packet includes diff/evidence context without unbounded raw logs;
- unresolved-risk and repeated-failure reports are deterministic;
- packet output includes provenance, redaction status, procedure ids, and source-map/procedure-contract references;
- closeout and handoff packets include required remote CI/check status when available;
- packet generation respects token/size budget;
- no LLM call is required for deterministic report generation;
- proposal drafts are not promoted to tasks/docs automatically;
- no MCP, full Agent Access Layer, domain packs, SaaS, dashboard, or external writes are introduced.

## Review focus

Reviewers must check especially for:

- reports reading old JSONL/projection paths instead of accepted Project Memory APIs;
- report text making claims without evidence;
- hidden summarization changing facts;
- redaction happening after export instead of before;
- packet generation lacking Phase 23.6 procedure id / source-map linkage;
- packet generation relying on private raw logs by default;
- remote CI failure logs being omitted from closeout/handoff evidence;
- proposal drafts being treated as approved tasks;
- initiative outputs being auto-promoted instead of remaining reviewable packet/report material;
- domain-specific report logic entering core;
- accidental Agent Access Layer work;
- accidental Phase 27 pack runtime work.

## Suggested implementation order

1. Inspect Phase 23.5 Project Memory APIs and Phase 23.6 procedure contracts.
2. Define report/packet output contracts.
3. Add report builders over accepted Project Memory DB records.
4. Add provenance mapping and claim/evidence markers, including remote CI/check provenance.
5. Add payload/chunk reference support.
6. Add redaction-before-export path.
7. Add token/size budgeting.
8. Add self-hosting workflow packet types.
9. Add procedure-id/source-map linkage for self-hosting workflow packets.
10. Add proposal draft output as non-promoting draft.
10. Add acceptance fixtures and deterministic output tests.
11. Update minimal docs and review protocol.

## Required return from implementation agent

When this task is implemented, the agent must return:

- files changed;
- scope summary;
- explicit confirmation that non-goals were not implemented;
- verification commands and results;
- packet/report types implemented;
- procedure-id/source-map linkage implemented for self-hosting packets;
- review/fix-pass status if applicable;
- remaining debt or open questions;
- final git status.

## Completion criteria

Phase 24 is complete when accepted Project Memory can be converted into deterministic reports and bounded review/handoff/planning packets with provenance, redaction, reproducibility, procedure-aware packet linkage, and claim-to-evidence traceability, without hidden model summarization or autonomous promotion.
