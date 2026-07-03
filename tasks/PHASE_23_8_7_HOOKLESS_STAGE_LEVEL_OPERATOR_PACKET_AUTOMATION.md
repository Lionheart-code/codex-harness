# Phase 23.8.7 - Hookless Stage-Level Operator Packet Automation v0

## Status

Planned. Starts only after Phase 23.8.6 Transactional Procedure Result
Ingestion and Slice-Isolated Run Mutations, Phase 23.8.6A Self-Hosting Replay
and Re-ingestion Continuity, Phase 23.8.6B Self-Hosting Model Routing Policy
Packaging, Phase 23.8.6B2 Verification Command Rationalization and
Serialization, Phase 23.8.6C Minimum Self-Hosting Orchestrator Entrypoint,
Phase 23.8.6D Procedure Artifact Payload Storage and Worktree Retention, and
Phase 23.8.6E Authority Surface Freshness and Downstream Task Revalidation
are complete, reviewed, and accepted.

## Purpose

Add stage-level packet preparation and result fixture ingestion on top of
stable run-state after the minimum self-hosting orchestrator loop exists.

The operator becomes able to prepare the next packet and interpret structured
stage results, but it still does not launch agents or execute runners.

## Scope

Required behavior:

- Add `StageState`, `StagePacket`, `StageResult`, `RunnerProfile`,
  `ExecutionPolicy`, `RunIssue`, `RepairPacket`, and `WaiverRecord`
  contracts.
- Add packet preparation command such as
  `run prepare-packet --kind auto|plan|implementation|review|fix-pass|closeout`
  or equivalent.
- Add result fixture ingestion such as
  `run record-stage-result --packet <packet-id> --file <path>` or equivalent.
- Each `StagePacket` must include a verifiable stopping condition, required
  validation commands/artifacts, and a bounded progress/result log contract.
- Operator emits `human_action_required` separately from
  `next_allowed_action`.
- Failed review routes to `FIX_PASS_PACKET`.
- Passing review routes to `CLOSEOUT_PACKET` or closeout-ready state.
- Missing deterministic checks block with typed `stop_reason`.
- Packet preparation and result ingestion use the stable run-state foundation
  from Phase 23.8.6.
- Any advisory packet routing/model fields must inherit the checked-in policy
  boundary from `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` without launching
  reviewers or runners.
- Keep the minimum lifecycle-failure fixtures explicit: self-approval
  attempt, skipped architecture-review, skipped db-storage-review,
  `AMEND_REQUIRED` without valid amended-plan review, missing
  implementation-review artifact, blocker note treated as `ACCEPT`, source
  edits before valid lifecycle approval, reviewer launch hang, failed
  verification, scope creep, and fake closeout.

## Core interfaces

`StageState`: `task_id`, `run_id`, `current_stage`,
`allowed_next_stages`, `missing_inputs`, `missing_evidence`, `blockers`,
`stop_reason`, `human_action_required`, `next_allowed_action`.

`StagePacket`: `packet_id`, `packet_kind`, `task_id`, `run_id`, `stage_id`,
`procedure_id`, `effective_plan_ref`, `evidence_refs`, `input_refs`,
`output_contract`, `required_result_schema`, `stopping_condition`,
`validation_refs`, `progress_log_contract`, `execution_policy_ref`.

`RunnerProfile`: `runner_id`, `runner_kind`, `supported_roles`,
`supported_packet_kinds`, `structured_output_support`, `write_capability`,
`session_support`, `status`.

`ExecutionPolicy`: `role`, `write_scope`, `sandbox_mode`, `approval_policy`,
`network_policy`, `command_policy`, `timeout_policy`, `allowed_paths`,
`forbidden_paths`.

`StageResult`: `result_id`, `packet_id`, `runner_id`, `runner_metadata`,
`files_changed`, `commands_run`, `outputs`, `declared_blockers`,
`evidence_refs`, `validation_results`, `progress_log_ref`,
`result_schema_valid`.

`RunIssue`: `issue_id`, `stage_id`, `severity`, `issue_kind`,
`evidence_refs`, `blocking`, `repair_required`.

`RepairPacket`: `packet_id`, `source_issue_ids`, `target_stage`,
`required_repairs`, `validation_refs`, `stopping_condition`.

`WaiverRecord`: `waiver_id`, `failed_check`, `reason`, `approver`, `scope`,
`evidence_refs`.

## Non-goals

- No Codex execution from operator.
- No automatic agent invocation.
- No external runner adapter.
- No background watcher.
- No auto-commit.
- No auto-merge.
- No self-approval.
- No MCP/API access layer.
- No proof generation.
- No report catalog.
- No domain packs.
- No planner execution.
- No first implementation of the minimum self-hosting loop that belongs in
  Phase 23.8.6C.

## Future-phase impact check

- Prepares Phase 23.9 proof, Phase 24A packets/reports, and Phase 25A
  read-only access by creating stable stage/packet/result records.
- Must not pre-implement proof generation, report catalog, API layer, MCP
  adapter, domain packs, or planner execution.
- Preserves the domain/core boundary by keeping packets procedure/stage-oriented
  and domain-neutral.
- Requires architecture review if packet automation starts invoking runners,
  selecting models/providers, writing source files, making approval decisions,
  or encoding domain workflows in core.

## Acceptance commands

```bash
npm run build
npm test
git diff --check
```

## Acceptance behavior

- Operator can prepare plan, implementation, review, fix-pass, and closeout
  packet fixtures from run/procedure state.
- Prepared packet fixtures include a verifiable stopping condition, required
  validation commands/artifacts, and a bounded progress/result log contract.
- Operator reports `human_action_required` separately from
  `next_allowed_action`.
- Failed review fixture routes to fix-pass packet state.
- Passing review fixture routes to closeout-ready or closeout packet state.
- Missing deterministic checks block progression with typed `stop_reason`.
- Review failures and lifecycle anomalies become typed `RunIssue` records and
  route to `RepairPacket` state rather than prose-only notes.
- Hooks absent or disabled do not affect lifecycle.
- If a full-pack acceptance proof is required during implementation, `npm test`
  is the canonical command. `npm run test:acceptance` remains only a
  compatibility alias to the same acceptance runner and must not be treated as
  separate proof or launched concurrently with `npm test` in the same
  workspace/runtime context.
- No agent or runner is invoked.
