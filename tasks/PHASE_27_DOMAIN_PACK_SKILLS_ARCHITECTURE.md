# Phase 27 - Domain Pack / Skills Architecture

## Status

Planned. Blocked until Phase 26 Big Task Decomposer and Architect Planner is
complete and reviewed.

## Review status

Reviewed v2. The main correction is to keep pack loading local, static, and non-executing by default. Packs define domain behavior; they must not become a plugin marketplace or remote-code mechanism.

Re-slotted from Phase 26 during the Gate 2 import after Phase 23.6. Existing
domain-pack ABI, compatibility, local/static/non-executing loading, safety, and
domain-neutral core boundaries remain the source of truth for this phase.

## Read before editing

- `docs/POST_PHASE_22_HARNESS_ARCHITECTURE_AND_ROADMAP.md`, if present
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- Phase 22.5 runtime contracts
- Phase 23/24 evidence/report contracts
- Phase 25 access service contracts
- Phase 26 big-task decomposition and architect planning contracts
- `schemas/**`
- `prompts/**` if used for current task templates
- `tests/acceptance/**`


## Goal

Introduce a pack/skills architecture that allows domain expansion without putting domain-specific logic into the core.

Software engineering remains the anchor domain and should become the reference pack. Research Ops is the first production non-code candidate. Marketing Ops remains experimental.

## Why this phase exists

The core harness should remain small, local-first, and domain-neutral. Domain expansion should happen through explicit packs that declare workflow templates, acceptance criteria, report schemas, prompts/instructions, evidence extractors, and policy defaults.

Without a pack boundary, research, marketing, sales, and operations logic would gradually pollute core runtime and make the project unmaintainable for one owner.

## Scope

### Pack contract

Define a versioned pack manifest and compatibility policy.

A pack may declare:

- pack id/version;
- supported harness version range;
- domain name and risk class;
- workflow templates;
- task templates;
- acceptance criteria;
- report templates;
- evidence extractors;
- domain artifact types;
- policy defaults;
- prompt/instruction files;
- optional adapter configuration;
- optional watcher declarations for later phases.

### Core responsibilities

Core owns:

- workflow engine;
- runtime state model;
- Memory/Evidence storage;
- packet compilation;
- governance primitives;
- adapter interfaces;
- pack loading/runtime contract;
- security and approval boundaries.

### Pack responsibilities

Packs own:

- domain entities;
- artifact types;
- evidence extractors;
- acceptance criteria;
- policy defaults;
- report schemas;
- adapter configuration;
- workflow templates;
- domain prompts/instructions.

Packs inherit core harness boundaries:

- core role boundaries and autonomy rules;
- approval and review gates;
- access-service and redaction boundaries;
- evidence and packet provenance requirements;
- security and policy enforcement owned by core.

### Reference pack

Extract or define the software-engineering reference pack without breaking existing workflows.

### Pack safety model

Pack loading must be safe by default:

- local files only;
- no remote code loading;
- no lifecycle hooks that execute arbitrary commands by default;
- no external connector activation without explicit policy;
- pack manifests are data contracts, not executable plugin code;
- pack compatibility failures are fail-closed.

### Pack ABI staging

Do not freeze a broad ABI too early. Stage the ABI:

1. manifest metadata and compatibility;
2. workflow/task/report templates;
3. evidence extractor declarations;
4. policy defaults;
5. optional adapter declarations only after access boundaries are stable.

## Non-goals

- no visual marketplace;
- no hosted pack registry;
- no dynamic remote code loading by default;
- no connector catalog;
- no external write connectors by default;
- no marketing/sales automation;
- no publishing/sending/updating external systems;
- no SaaS dashboard;
- no autonomous pack installation;
- no domain-specific logic in core.

## Expected behavior

- core can load and validate a local pack manifest;
- pack compatibility is explicit;
- software-engineering reference pack works without hardcoding domain behavior in core;
- invalid pack manifests fail clearly;
- domain acceptance/report/prompt logic lives in pack files;
- pack loading does not execute remote code;
- packs cannot bypass core policy/redaction/approval boundaries.
- packs inherit core role, access, evidence, and policy boundaries rather than redefining them locally.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- pack manifest schema under `schemas/**` or the established schema location;
- local pack validation core and CLI modules;
- software-engineering reference pack files under the Phase 27 pack layout;
- Research Ops and Marketing Ops fixtures only, without implementing those packs;
- `tests/acceptance/**` for pack validation and compatibility coverage.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch pack --help
node bin/ch pack validate <path-to-pack>
node bin/ch pack list --local
```

Exact command names may change, but equivalent local deterministic validation must exist.

## Acceptance behavior

- pack manifest schema exists;
- software-engineering reference pack validates;
- invalid pack manifest fails clearly;
- pack compatibility tests pass;
- core remains domain-neutral;
- package output does not include experimental/local pack runtime state by default;
- no marketplace, hosted registry, remote code loading, connector catalog, or external write integration is introduced.

## Review focus

Reviewers must check especially for:

- domain logic leaking into core;
- pack ABI being over-broad too early;
- remote code execution through packs;
- marketplace/registry creep;
- connector catalog creep;
- packs bypassing redaction/approval policy;
- packs redefining core role, approval, access, or evidence boundaries locally;
- Research/Marketing logic added directly to core.

## Suggested implementation order

1. Define pack manifest schema.
2. Add local pack validation command.
3. Define compatibility policy.
4. Extract/define software-engineering reference pack.
5. Add pack compatibility tests.
6. Add docs for core vs pack responsibilities.
7. Add fixtures for future Research Ops and Marketing Ops without implementing them.

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

Phase 27 is complete when domain behavior can be expressed through local validated packs while the core remains domain-neutral, policy-bound, and solo-maintainable.
