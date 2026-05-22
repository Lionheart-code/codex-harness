---
name: codex-harness-delivery-facts-review
description: Use this skill when codex-harness closeout depends on reviewing PR, CI, review, or merge evidence without treating hooks or human memory as the authority source.
---

# Delivery-facts Review

## procedure_id
`delivery-facts-review`

## title
Delivery-facts Review

## purpose
Confirm PR, CI, review, and merge evidence is present or explicitly missing
before closeout.

## when_to_use
- A run is approaching closeout.
- The workflow needs to confirm delivery facts before harvest readiness.
- Remote events may have happened outside the local execution process.

## required_inputs
- Active run or task closeout context
- Imported or recorded delivery facts
- Current verification and review status
- Relevant closeout rules

## preconditions
- Delivery facts exist or their absence is known explicitly.
- Closeout review is in scope.

## forbidden_scope
- Do not fabricate remote state.
- Do not treat hooks as the primary delivery-facts authority.
- Do not close out work based only on human memory.

## checklist
- Check whether PR, CI, review, and merge facts are present or explicitly
  missing.
- Check provenance and status for each fact.
- Confirm the workflow distinguishes local verification from remote delivery
  state.
- Return explicit blockers when closeout evidence is incomplete.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- Delivery facts are missing with no explicit missing-state note.
- Provenance is unclear for critical remote facts.
- Closeout depends on remote evidence that has not been reviewed.

## evidence_to_record
- Delivery-facts status by type
- Missing or ambiguous provenance notes
- Closeout blockers related to remote state

## phase_23_5_dependencies
- Delivery facts remain provider-neutral records imported into the lifecycle
  flow.
- Closeout and harvest still depend on explicit lifecycle gates.

## phase_24_packet_dependencies
- Later `closeout-review packet` manifests should cite
  `delivery-facts-review`.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex Hooks documentation where reminder hooks are relevant

### external_advisory_sources
- Prior closeout audits

### community_pattern_sources
- Delivery-facts review patterns

### adopted
- Provider-neutral delivery-facts review
- Explicit provenance checks
- Closeout blockers stay visible

### adapted
- Use codex-harness delivery-facts terminology without implementing Phase 24
  packet generation.

### rejected
- Closeout based on human memory
- Hooks as the primary delivery-facts authority

## authority_level
`binding`
