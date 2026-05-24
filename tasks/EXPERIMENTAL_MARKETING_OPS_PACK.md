# Experimental — Marketing Ops Pack

## Status

Planned experimental stress test. Blocked until the Research Ops pilot proves that domain packs can work safely without polluting core.

## Review status

Reviewed v2. The main correction is to treat Marketing Ops as a risk stress test only. It must not become publishing, CRM, outbound, or ad-platform automation.

## Read before editing

- Phase 27 pack contract
- Research Ops pilot review results
- Phase 24 packet/report constraints
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`


This pack is not a production automation pack. It is a controlled experiment for a higher-risk business domain.

## Goal

Stress-test the domain pack architecture against Marketing Ops workflows while keeping all outputs read-mostly, draft/report/recommend-only, and approval-gated.

Marketing Ops is useful because it tests brand constraints, channel-specific outputs, performance reports, approval chains, and business-facing artifacts. It is risky because it easily drifts into publishing, CRM writes, outbound messaging, and brand safety failures.

## Scope

Experimental workflows:

- campaign brief review;
- audience/research packet;
- draft copy review;
- brand voice checklist;
- channel-specific risk checklist;
- performance report synthesis;
- approval-gated publishing plan;
- creative QA checklist;
- claim/compliance risk review.

Allowed outputs:

- draft copy;
- critique/report;
- recommendation;
- checklist;
- approval plan;
- risk report;
- handoff packet.

## Default policy

```text
read-mostly
draft/report/recommend only
no publish/send/update external systems by default
human approval required for promotion
brand and claim risk visible
external write connectors disabled by default
```

## Brand and claim safety rules

Marketing outputs must make risk visible. Regulated, factual, comparative, performance, pricing, or legal/compliance-sensitive claims must be either evidence-backed, marked as needing review, or removed from generated outputs. No output may imply that publishing approval has been granted.

## Non-goals

- no publishing;
- no sending messages;
- no CRM updates;
- no ad platform changes;
- no calendar automation;
- no outbound sequences;
- no external write connectors by default;
- no autonomous campaign launch;
- no brand policy mutation;
- no connector marketplace;
- no domain logic in core.

## Expected behavior

- pack manifest validates;
- workflows use pack templates and core services;
- outputs are clearly marked as drafts/reports/recommendations;
- brand voice/risk checks produce structured findings;
- any proposed external action is represented only as an approval-gated plan;
- no connector performs writes;
- no marketing-specific logic enters core runtime.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- Marketing Ops experimental pack files under the Phase 27 pack layout;
- pack-local schemas, templates, workflows, and read-only fixtures;
- acceptance tests for draft/report/recommend-only behavior;
- no core source changes except through generic pack interfaces already introduced by Phase 27.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch pack validate packs/marketing-ops-experimental
```

Exact path/command may change according to Phase 27 pack structure.

## Acceptance behavior

- Marketing Ops experimental pack validates;
- campaign brief review fixture produces a structured report;
- draft copy review fixture marks assumptions and risks;
- brand voice checklist produces findings without editing external systems;
- publishing plan remains a plan, not an action;
- no send/publish/update command is available by default;
- core code remains free of Marketing Ops domain entities except generic pack interfaces.

## Review focus

Reviewers must check especially for:

- accidental external write actions;
- publishing/sending/CRM scope creep;
- brand-safety claims without evidence;
- hidden model-side rewriting without provenance;
- channel-specific logic being hardcoded in core;
- approval gates being represented as optional text only;
- pack becoming a general marketing automation platform.

## Suggested implementation order

1. Create experimental Marketing Ops pack manifest.
2. Add campaign brief review template.
3. Add brand voice checklist template.
4. Add channel risk checklist template.
5. Add performance synthesis template.
6. Add approval-gated publishing plan template.
7. Add read-only fixtures and acceptance tests.
8. Document experimental status and forbidden external actions.

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

The experimental pack is complete only if it proves the pack system can model a risky business domain while staying read-mostly, approval-gated, and free of external writes by default.
