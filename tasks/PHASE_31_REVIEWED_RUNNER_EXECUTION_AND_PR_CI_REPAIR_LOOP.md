# Phase 31 - Reviewed Runner Execution and PR/CI Repair Loop

## Status

Planned. Starts only after Phase 30 Bounded Agent Experimentation Loop is
complete, reviewed, and accepted.

## Purpose

Execute approved stage packets through reviewed runner surfaces under explicit
`RunnerProfile` and `ExecutionPolicy` boundaries, ingest runner/CI/review
results, and prepare and execute approved bounded fix-pass packets for failing
CI/review outcomes.

## Why this phase exists

By this point the harness should already have:

- durable procedure/state ingestion;
- stage packets and result ingestion;
- proof/review policy;
- reports/packets;
- read-only access and optional adapter parity;
- bounded experimentation and evaluator-backed keep/revert rules.
- the approved narrow Phase 23.8.6F self-hosting route policy, Codex binding,
  context, telemetry, escalation, and promotion contracts.

This phase turns those foundations into a reviewed operational runner-execution
surface without allowing self-approval, hidden provider logic, or unrestricted
repair loops. It is the reviewed external runner-adapter boundary only:
`codex-harness` remains the supervisor/orchestrator shell while reviewed
external runners remain workers.

Consume rather than recreate the Phase 24A.1 self-hosting review/context/routing
contract and Phase 24A.2 requirement/scenario/invariant/decision trace contract.
Approved external execution packets carry or reference exact task, effective
plan, engineering-map, applicable trace IDs, verification obligations, required
review set, and evidence/proof identities. Phase 31 remains the first general
external-runner execution boundary.

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
- If CI still invokes equivalent compatibility aliases for one proof path,
  this phase may rationalize reviewed PR/CI execution to one canonical
  required invocation plus compatibility classification. Equivalent aliases
  must not remain separate required proof in reviewed runner/CI execution.
- Prepare and execute approved bounded fix-pass packets when CI or review
  fails.
- Consume the exact Phase 23.9 `implementation-review` and
  `fix-pass-review` launch evidence. Do not recreate, replace, or generalize
  Phase 23.9's narrow automatic standalone read-only `fix-pass-review`
  launcher; Phase 31 owns the write-capable repair packet boundary, not that
  review-only capability.
- Keep provider/host adapters behind shared runner/access boundaries instead
  of embedding provider-specific logic into core lifecycle behavior.
- Reuse the supervised child-process pattern from Phase 23.8.6B1 only through
  reviewed generic runner boundaries; the B1 `codex_cli` review-launch adapter
  must not imply general runner permission.
- Preserve human review and approval boundaries for high-risk writes, merges,
  and lifecycle transitions.
- Treat `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` as the reviewed policy
  baseline, including its implemented Phase 23.8.6F reconciliation, that this
  phase may generalize through runtime contracts without reintroducing ad hoc
  launch folklore into core behavior.
- Consume approved Phase F route-policy, provider-binding, context, telemetry,
  escalation, promotion, and rollback records; do not recreate ad hoc
  provider/model selection.

Phase 31 is the first general external-runner runtime owner of `RouteDecision`,
`ProviderBindingRegistry`, `RunnerProfile`, `ExecutionPolicy`, context-transport
enforcement, budget enforcement, usage telemetry, and typed escalation. Phase
F remains the narrow owner for routing the already existing self-hosting Codex
review-launch path, and Phase 23.9 remains the narrow owner for automatically
launching the existing independent read-only `implementation-review` and
`fix-pass-review` procedures. Phase 31 consumes their evidence and does not
recreate their launcher.

Runtime order is deterministic checks, provider-neutral route intent/profile
floor, cheapest approved safe binding, independence/context enforcement,
budget enforcement without unsafe downgrade, one packet-bound worker,
recording actual model/reasoning/context/usage facts, typed escalation, and a
blocking result when no safe approved profile exists.

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
- No LLM-based default router, silent downgrade, unbounded subagent fan-out,
  write-capable parallel leaves sharing a worktree, or provider-specific
  lifecycle logic in core.

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
- Approved bounded fix-pass packets can execute only through the Phase 31
  write-capable runner boundary, while completed fixes are reviewed through
  the retained Phase 23.9 read-only review-launch evidence path.
- Runner execution writes typed evidence/results that preserve lifecycle and
  approval boundaries and exact-instance-safe identity plus artifact/payload
  references.
- If full-pack proof is required, use `npm test` as the canonical command.
  Treat `npm run test:acceptance` only as a compatibility alias to the same
  proof path, not as independent proof, not as a separately required command,
  and not as a duplicate reviewed CI obligation once a canonical invocation is
  available.
- No self-approval, auto-merge, unrestricted provider logic, coding-agent
  replacement behavior, or domain-core execution behavior is introduced.
