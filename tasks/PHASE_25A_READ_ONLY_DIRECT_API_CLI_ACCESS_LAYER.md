# Phase 25A - Read-only Direct API/CLI Access Layer

## Status

Planned split from `tasks/PHASE_25_AGENT_ACCESS_LAYER.md`.
Starts only after Phase 24A Minimal Evidence Report and Review Packet is
complete, reviewed, and accepted.

## Purpose

Expose read-only governed access to runtime, memory, reports, packets, proof,
and procedure outcomes through shared core services.

Direct API and CLI are primary. MCP remains out of scope for this slice.

## Scope

Required behavior:

- query runs;
- query evidence;
- query procedure outcomes;
- query packets/results;
- query proof;
- fetch minimal reports/packets from Phase 24A;
- enforce redaction and query limits in shared service;
- Direct API/CLI first;
- all access surfaces call shared core services;
- no raw SQL exposed;
- provider/model-specific behavior remains outside shared core logic;
- model opinion cannot override missing evidence, failing tests,
  source/runtime boundary violations, or approval requirements.

## Non-goals

- No MCP.
- No hosted API server.
- No external writes.
- No autonomous action loop.
- No provider execution.
- No raw SQL interface.
- No connector marketplace.
- No domain packs.
- No publishing/sending/updating external systems.
- No bypass of human approval.

## Future-phase impact check

- Prepares Phase 25B, Phase 26, and later domain-pack work by exposing
  governed read-only access to stable core state.
- Must not pre-implement MCP adapters, write-capable external connectors,
  provider runners, domain packs, prior-art discovery, or experimentation.
- Preserves the domain/core boundary by exposing generic core records only, not
  domain-specific operations.
- Requires architecture review if access becomes hosted product architecture,
  raw SQL interface, mutation API without approval, connector marketplace, or
  autonomous action surface.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch access --help
node bin/ch query --help
git diff --check
```

Exact command names may change, but equivalent behavior must exist.

## Acceptance behavior

- Shared read-only access service exists.
- CLI queries call the shared service.
- Redaction and query limits are enforced in shared service, not only CLI
  formatting.
- Query outputs are bounded and provenance-aware.
- Raw SQL is not exposed.
- Mutation requests are denied or explicitly out of scope.
- No MCP, hosted API server, external write connector, provider execution,
  marketplace, domain pack, or autonomous action loop is introduced.
