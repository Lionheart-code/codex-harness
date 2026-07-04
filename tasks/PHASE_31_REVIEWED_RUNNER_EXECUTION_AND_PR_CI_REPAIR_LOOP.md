# Phase 31 - Reviewed Runner Execution and PR/CI Repair Loop

## Status

Planned. Starts only after Phase 30 Bounded Agent Experimentation Loop is
complete, reviewed, and accepted.

## Purpose

Execute approved stage packets through reviewed runner surfaces under explicit
`RunnerProfile` and `ExecutionPolicy` boundaries, ingest runner/CI/review
results, and prepare bounded fix-pass packets for failing CI/review outcomes.

## Why this phase exists

By this point the harness should already have:

- durable procedure/state ingestion;
- stage packets and result ingestion;
- proof/review policy;
- reports/packets;
- read-only access and optional adapter parity;
- bounded experimentation and evaluator-backed keep/revert rules.

This phase turns those foundations into a reviewed operational runner-execution
surface without allowing self-approval, hidden provider logic, or unrestricted
repair loops. It is the reviewed external runner-adapter boundary only:
`codex-harness` remains the supervisor/orchestrator shell while reviewed
external runners remain workers.

## Scope

Required behavior:

- Execute approved `StagePacket` instances through reviewed runner surfaces or
  equivalent formal runtime commands.
- Keep reviewed runner execution packet-bound and adapter-like rather than
  turning the harness into a general coding agent.
- Enforce `ExecutionPolicy` boundaries for sandbox mode, write scope,
  approval policy, network policy, command allowlist, timeout policy, and
  path constraints.
- Record structured runner invocation results and map them back to
  `StageResult`, delivery facts, or equivalent typed evidence.
- Key runner execution records by, or explicitly resolve them through, exact
  run identity rather than display `run_id` alone.
- Ingest CI and review outcomes as typed facts/evidence rather than free-form
  chat state.
- Prepare bounded fix-pass packets when CI or review fails.
- Keep provider/host adapters behind shared runner/access boundaries instead
  of embedding provider-specific logic into core lifecycle behavior.
- Reuse the supervised child-process pattern from Phase 23.8.6B1 only through
  reviewed generic runner boundaries; the B1 `codex_cli` review-launch adapter
  must not imply general runner permission.
- Preserve human review and approval boundaries for high-risk writes, merges,
  and lifecycle transitions.
- Treat `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` as the reviewed policy
  baseline that this phase may enforce through runtime contracts without
  reintroducing ad hoc launch folklore into core behavior.

## Non-goals

- No self-approval.
- No auto-merge.
- No unrestricted write access.
- No bypass of sandbox or approval policy.
- No provider-specific core logic.
- No MCP-native architecture.
- No domain workflow execution in core.
- No background autonomous repair loop without reviewed approval boundaries.
- No replacement for Codex or other worker surfaces.
- No unrestricted autonomous repair system.

## Future-phase impact check

- Prepares later operational refinement work such as richer CI/review repair
  flows without making them autonomous by default.
- Must not bypass the proof/report/access/evaluator foundations from earlier
  phases.
- Preserves the domain/core boundary by keeping runner execution generic,
  approval-gated, and evidence-backed.
- Requires architecture review if runner execution starts approving its own
  actions, merging automatically, or encoding provider-specific or
  domain-specific workflow logic into core.

## Acceptance commands

```bash
npm run build
npm test
git diff --check
```

## Acceptance behavior

- Approved packets can be executed only through reviewed runner surfaces with
  explicit `RunnerProfile` and `ExecutionPolicy` boundaries.
- Failing CI/review outcomes can produce bounded fix-pass packets.
- Runner execution writes typed evidence/results that preserve lifecycle and
  approval boundaries and exact-instance-safe identity plus artifact/payload
  references.
- If full-pack proof is required, use `npm test` as the canonical command.
  Treat `npm run test:acceptance` only as a compatibility alias to the same
  proof path, not as independent proof and not as a separately required
  command.
- No self-approval, auto-merge, unrestricted provider logic, coding-agent
  replacement behavior, or domain-core execution behavior is introduced.
