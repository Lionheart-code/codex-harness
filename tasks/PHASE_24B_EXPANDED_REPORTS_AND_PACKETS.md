# Phase 24B - Expanded Reports and Packets

## Status

Planned split from `tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`.
Starts only after Phase 24A, Phase 24A.1, Phase 24A.2, and Phase 24A.3 are
complete, independently reviewed, accepted, and demonstrably useful.

## Purpose

Expand report and packet coverage only after the minimal Phase 24A substrate
has shown concrete value.

## Scope

Possible additions moved from the original Phase 24 broad catalog:

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
- fix-pass and review-disagreement packets;
- routing-decision and cost/quality regression reports;
- parallel-audit synthesis packet and portable handoff summary.

All additions reuse the Phase 24A shared context core. Distinct semantic
reviews retain separate rubrics, verdicts, evidence trails, and independence;
24B must not merge them into one mega-verdict.

Consume the canonical required-review cohort and context/reuse/route/reasoning/
usage facts from 24A.1 and the requirement/scenario/invariant/decision traces
from 24A.2, after 24A.3 has rationalized their acceptance and historical
compatibility coverage. Reports may render these facts but remain projections, not
lifecycle authority. Do not recreate review routing/cohort enforcement,
context-reuse logic, downgrade/re-escalation, engineering-map authority,
specification/BDD logic, or architecture-decision lifecycle.

Required preserved constraints:

- every report/packet must be deterministic where practical;
- every material claim must be linked to evidence, marked as inference, or
  marked missing/unknown;
- redaction before export;
- bounded raw logs only; no unbounded CI logs;
- packet manifests include packet ID, packet type, source run/phase, schema
  version, created_at, source records, redaction status, size budget,
  truncation policy, missing evidence, procedure IDs, and review tier where
  applicable;
- proposal drafts remain drafts until human promotion.

## Gate

- Add only if Phase 24A artifacts are used and show concrete value.
- Each new report/packet needs its own acceptance fixture.
- New report/packet surfaces must not broaden core into domain-specific
  reporting.

## Non-goals

- No access services.
- No MCP adapters.
- No domain packs.
- No schema ingestion.
- No prior-art gates.
- No experimentation loops.
- No report marketplace.
- No hidden advisor.
- No auto-promotion path.
- No domain-specific core catalog.
- No unbounded packet generation.

## Future-phase impact check

- Prepares Phase 25A, Phase 26, and later Phases 27-31 by improving evidence
  packaging without turning reports into authority.
- Must not pre-implement access services, MCP adapters, domain packs, schema
  ingestion, prior-art gates, or experimentation loops.
- Preserves the domain/core boundary by keeping expanded reports generic unless
  Phase 27 domain-pack architecture explicitly owns domain formatting.
- Requires architecture review if expansion creates a report marketplace,
  hidden advisor, auto-promotion path, domain-specific core catalog, or
  unbounded packet generation.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory report --help
node bin/ch memory packet --help
git diff --check
```

## Acceptance behavior

- Each added report/packet has a deterministic acceptance fixture.
- Material claims are evidence-linked, inference-marked, or missing/unknown.
- Redaction happens before export.
- Packet manifests include provenance, missing evidence, truncation, procedure
  IDs, and review tier where applicable.
- Proposal drafts remain drafts and are not promoted automatically.
- No access layer, MCP adapter, domain pack, schema-ingestion, prior-art, or
  experimentation behavior is introduced.
