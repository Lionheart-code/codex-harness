# Phase 25 — Agent Access Layer

## Status

Planned. Blocked until Phase 24 Reports and LLM-ready Evidence Packets is complete and reviewed.

## Review status

Reviewed v2. The main correction is to keep Direct API as an internal/local service boundary, not a hosted API product. MCP remains optional and may be deferred if parity/redaction are not mature enough.

## Read before editing

- Phase 22.5 runtime services
- Phase 23 Memory/Evidence services
- Phase 24 report/packet builders
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/CONTEXT_BUDGET_POLICY.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- existing adapter modules
- `schemas/**`
- `tests/acceptance/**`


## Goal

Expose safe, governed access to runtime, memory, reports, and packets through shared core services.

Direct API and CLI are primary. MCP is optional adapter only.

## Why this phase exists

After Phase 23/24, the harness has runtime evidence and bounded packets. Phase 25 makes this accessible to agents and tools without allowing any access surface to bypass policy, redaction, approvals, or core services.

The purpose is not to make MCP the architecture. The purpose is to ensure every access surface calls the same core logic.

## Scope

### Core access service

Create a shared access/service layer for:

- run queries;
- evidence queries;
- report generation;
- packet generation;
- artifact metadata lookup;
- remote check status lookup;
- redaction-aware reads;
- approval-gated mutation requests.

### Primary surfaces

- Direct local API.
- CLI query commands.

### Optional surface

- MCP adapter for read-only and explicitly approved operations.

### Parity tests

Add golden parity tests for supported read-only operations across:

- core service;
- CLI;
- optional MCP adapter, if implemented in this phase.

## Hard constraints

- all access surfaces call the same core services;
- MCP cannot bypass Memory/Core services;
- MCP cannot implement separate analytics, policy, SQL, or business logic;
- no raw SQL exposed to agents by default;
- mutating operations require explicit approval;
- read-only defaults;
- query limits;
- redaction before output;
- adapters are clients of the core, not the core itself;
- no external writes by default;
- no autonomous action loop.

## Non-goals

- no MCP-native architecture;
- no raw SQL interface;
- no connector marketplace;
- no hosted API server by default;
- no SaaS dashboard;
- no write-capable external integrations by default;
- no autonomous agent;
- no domain packs;
- no publishing/sending/updating external systems;
- no bypass of human approval.

## Implementation guardrails

- Treat Direct API as a local/internal programmatic boundary unless a later phase explicitly approves hosted/server behavior.
- MCP is optional; if it weakens parity, redaction, or approval guarantees, defer it.
- Do not add write-capable external connectors in this phase.
- Do not introduce background polling or autonomous tool loops.
- Query limits must be enforced in the shared service, not only in CLI output formatting.
- Read-only operations should be implemented first; mutation requests should be explicit, approval-gated, and test-covered.

## Minimum parity set

At minimum, parity tests should cover:

- list runs;
- show one run;
- list evidence for a run;
- generate or fetch review packet;
- show remote check status;
- redaction behavior for sensitive records.

## CLI/API surface

Exact names may change, but equivalent behavior should exist:

```bash
node bin/ch access --help
node bin/ch query runs --last 10
node bin/ch query run <run-id>
node bin/ch query evidence --run <run-id>
node bin/ch query remote-checks --run <run-id>
node bin/ch query packet review --run <run-id>
node bin/ch access doctor
```

Optional MCP commands/configuration may be added only if they use the same access service.

## Expected behavior

- API and CLI produce equivalent results for supported read-only queries;
- optional MCP adapter, if present, matches API/CLI behavior for supported operations;
- redaction and query limits apply equally across surfaces;
- mutation requests are denied or require explicit approval;
- no adapter contains its own business logic or SQL query path;
- agent-facing output is bounded and provenance-aware.
- remote check status is exposed through the same redaction-aware access service, not through provider-specific adapter logic.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- core access/query service modules over runtime, memory, report, and packet services;
- CLI access/query command modules;
- adapter modules only if optional MCP is implemented in this phase;
- `schemas/**` for serialized access contracts if needed;
- `tests/acceptance/**` for API/CLI parity and redaction coverage.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch access --help
node bin/ch query --help
```

If MCP is implemented in this phase:

```bash
node bin/ch access mcp --help
```

## Acceptance behavior

- shared access service exists and is covered by tests;
- CLI queries call the shared service;
- API/CLI parity tests pass for read-only operations;
- MCP adapter, if present, has parity tests and cannot bypass redaction/policy;
- raw SQL is not exposed;
- mutating operations require explicit approval;
- no external write connector is introduced;
- no domain packs or marketplace are introduced.

## Review focus

Reviewers must check especially for:

- MCP becoming core architecture;
- duplicate query/business logic in adapters;
- raw SQL leakage;
- inconsistent redaction between API/CLI/MCP;
- unbounded queries;
- mutation paths without approvals;
- hidden background agent behavior;
- adapters polling CI or external services outside the approved access/service boundary;
- external connector creep.

## Suggested implementation order

1. Define core access service over runtime/memory/report services.
2. Add CLI query commands using that service.
3. Add redaction/query-limit enforcement in service layer.
4. Add mutation request/approval boundaries.
5. Add parity tests for API and CLI.
6. Add optional MCP adapter only if the core service is stable enough.
7. Add MCP parity tests if MCP is present.
8. Update docs to restate Direct API/CLI first and MCP optional adapter only.

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

Phase 25 is complete when agents and tools can safely query harness evidence through governed, redaction-aware, parity-tested access surfaces without MCP becoming core and without introducing autonomous writes or external connector sprawl.
