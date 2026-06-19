# Phase 25B - Optional MCP Adapter Parity

## Status

Planned split from `tasks/PHASE_25_AGENT_ACCESS_LAYER.md`.
Starts only after Phase 25A Read-only Direct API/CLI Access Layer is complete,
reviewed, accepted, and stable.

## Purpose

Add optional MCP/adapter parity over the shared access service without making
MCP the core architecture.

Direct API and CLI remain primary.

## Allowed only if

- Phase 25A shared service is stable.
- Read-only parity tests exist.
- Redaction and query limits are enforced in core.
- MCP remains adapter surface, not architecture.
- MCP adapter, if implemented, has parity tests and cannot bypass
  redaction/policy.
- Mutating operations remain denied or approval-gated.

## Preserved constraints

- Direct API/CLI remain primary.
- MCP optional only.
- Adapters are clients of core, not core itself.
- No duplicate query/business logic in adapters.
- No provider/model-specific logic in shared core services.
- No external write connector by default.

## Non-goals

- No MCP-native core.
- No raw SQL.
- No marketplace.
- No write-capable external connector by default.
- No autonomous agent.
- No background polling or autonomous tool loops.
- No domain packs.

## Future-phase impact check

- Prepares later optional runner/provider integrations without making MCP core
  architecture.
- Must not pre-implement domain packs, schema ingestion, external write
  connectors, background automation, prior-art gates, or experimentation loops.
- Preserves the domain/core boundary by keeping MCP an adapter over shared
  services.
- Requires architecture review if MCP bypasses core services, exposes writes by
  default, duplicates business logic, or becomes required for local-first
  operation.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch access --help
node bin/ch query --help
node bin/ch access mcp --help
git diff --check
```

If MCP is deferred again, the task must replace MCP command acceptance with an
explicit deferral record and parity-risk rationale.

## Acceptance behavior

- Optional MCP adapter, if implemented, uses the same shared access service as
  Direct API/CLI.
- MCP parity tests cover supported read-only operations.
- MCP cannot bypass redaction, query limits, approval gates, or core services.
- Raw SQL is not exposed.
- No external write connector is introduced.
- No domain packs, marketplace, hosted API, autonomous agent, or background
  polling is introduced.

