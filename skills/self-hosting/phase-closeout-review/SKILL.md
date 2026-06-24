---
name: codex-harness-phase-closeout-review
description: Use this skill when a codex-harness run or phase needs a final closeout and harvest readiness review under the Phase 23.5 lifecycle rules.
---

# Phase Closeout Review

## procedure_id
`phase-closeout-review`

## title
Phase Closeout Review

## purpose
Verify that a run or phase is ready for closeout and harvest under Phase 23.5
rules.

## when_to_use
- Verification and delivery-facts review are complete enough for closeout
  assessment.
- The workflow needs to determine whether worktree cleanup or harvest can
  proceed.
- A reviewer needs to confirm lifecycle readiness without mutating state.

## required_inputs
- Active run or task closeout context
- Verification status
- Delivery-facts review status
- Relevant lifecycle and harvest rules

## preconditions
- The run or task has enough evidence to evaluate closeout readiness.
- The reviewer is not using closeout review to perform lifecycle mutation.

## forbidden_scope
- Do not treat `closed` as equivalent to `harvested`.
- Do not approve worktree deletion before harvest, discard, or manual override.
- Do not bypass missing evidence with manual assumptions.

## checklist
- Check closeout readiness.
- Check harvest prerequisites separately.
- Check deletion safety rules separately from closeout readiness.
- Run Source-of-Truth Refresh / Documentation Garbage Collection checks for the
  affected task/docs/prompt/skill/output-format surfaces.
- Return explicit blockers and unresolved risks.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- Verification or delivery-facts evidence is missing.
- Lifecycle state is ambiguous.
- The work claims deletion or cleanup readiness without the required lifecycle
  state.
- Authoritative source-of-truth surfaces are stale or unresolved.

## evidence_to_record
- Closeout readiness result
- Harvest readiness result
- Deletion-safety result
- Docs freshness result
- Closeout outcome (`CLOSEOUT_ACCEPTED`,
  `CLOSEOUT_ACCEPTED_WITH_DOC_FOLLOWUP`, or
  `CLOSEOUT_BLOCKED_READINESS`, or
  `CLOSEOUT_BLOCKED_SOURCE_OF_TRUTH_STALE`)
- Remaining blockers or unresolved risks

## phase_23_5_dependencies
- `closed` remains distinct from `harvested`.
- Harvest, discard, and manual override remain explicit lifecycle decisions.
- Worktree deletion remains blocked until the lifecycle rules allow it.

## phase_24_packet_dependencies
- Later `closeout-review packet` manifests should cite
  `phase-closeout-review`.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex best practices

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Closeout-checklist patterns

### adopted
- Explicit readiness checklist
- Harvest remains distinct from closeout
- Unresolved blockers stay visible

### adapted
- Use codex-harness lifecycle terminology and deletion rules directly.

### rejected
- Treating `closed` as `harvested`
- Deletion approval by assumption

## authority_level
`binding`
