---
name: codex-harness-docs-consistency-review
description: Use this skill when codex-harness docs, tasks, and roadmap entries must be checked for contradictions against an active implementation or workflow change.
---

# Docs Consistency Review

## procedure_id
`docs-consistency-review`

## title
Docs Consistency Review

## purpose
Check that docs, roadmap, tasks, and contracts do not contradict an
implementation or workflow change.

## when_to_use
- The active task changes docs or procedure contracts.
- Review needs to confirm that repo-owned docs agree on scope and boundaries.
- The work is `high` or likely to affect future phases.

## required_inputs
- Active task contract
- Changed docs or procedure artifacts
- Roadmap and boundary docs
- Relevant acceptance rules

## preconditions
- The affected docs are identified.
- The reviewer is focused on contradictions that affect the active task or
  future boundaries.

## forbidden_scope
- Do not perform broad documentation rewrites.
- Do not rewrite future phases to fit the current implementation.
- Do not treat prompt text as the authoritative contract.

## checklist
- Check task, roadmap, operator, and boundary docs for contradictions.
- Check whether procedure docs match the current accepted repo boundary.
- Check whether stale wording implies the wrong lifecycle or source-of-truth
  model.
- Return only contradictions that affect implementation or later interpretation.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The changed docs are too incomplete to compare.
- Repo-owned docs disagree materially about the same boundary.
- A contradiction requires a separate task or broader review.

## evidence_to_record
- Contradictions found
- Minimal doc correction recommendation
- Residual ambiguity notes

## phase_23_5_dependencies
- Preserve Phase 23.5 authority, lifecycle, and local-state boundary wording.
- Preserve the distinction between hooks as guardrails and core services as
  authority.

## phase_24_packet_dependencies
- Later `docs-consistency packet` manifests should cite
  `docs-consistency-review`.

## source_adaptation_notes
### internal_sources
- `docs/IMPLEMENTATION_ROADMAP.md`
- Task files
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex AGENTS.md documentation

### external_advisory_sources
- Prior documentation audits

### community_pattern_sources
- Documentation review patterns

### adopted
- Cross-document consistency review
- Minimal contradiction correction
- Boundary-aware documentation review

### adapted
- Limit the review to contradictions that affect codex-harness implementation
  and future phase interpretation.

### rejected
- Broad documentation rewrites
- Speculative roadmap edits

## authority_level
`binding`
