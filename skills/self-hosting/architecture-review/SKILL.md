---
name: codex-harness-architecture-review
description: Use this skill when a codex-harness task or plan may cross core boundaries, affect future phases, or require a high-intensity architecture check before implementation.
---

# Architecture Review

## procedure_id
`architecture-review`

## title
Architecture Review

## purpose
Check whether a task or plan crosses core boundaries or drags future phases
forward.

## when_to_use
- The work affects architecture, boundaries, lifecycle, or core workflow shape.
- The task is tagged `high` or `extra-high`.
- The plan may pull Phase 24, Phase 25, or Phase 26 work into the current pass.

## required_inputs
- Draft or approved plan
- Active task contract
- Roadmap and boundary docs
- Review intensity tier

## preconditions
- The work has a stable enough plan to evaluate.
- The relevant boundary docs have been read.

## forbidden_scope
- Do not implement architectural changes during review.
- Do not treat later phases as permission to build them now.
- Do not recommend provider-specific core logic in Phase 23.6.

## checklist
- Check for future-phase creep.
- Verify product-source versus runtime-state boundaries.
- Confirm the proposal keeps core domain-neutral and solo-maintainable.
- Flag any hidden runtime, adapter, packet, or pack implementation.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The task or plan does not define the affected subsystem clearly enough.
- Repo docs conflict on the relevant boundary.
- The proposal depends on a later-phase capability.

## evidence_to_record
- Boundary findings
- Future-phase creep findings
- Recommended keep, defer, or split decision

## phase_23_5_dependencies
- Preserve Project Memory DB authority, hook guardrail role, delivery-facts
  flow, and closeout/harvest separation.
- Do not reopen the Phase 23.5 authority decision inside Phase 23.6.

## phase_24_packet_dependencies
- Later `plan-review packet` manifests should cite `architecture-review` for
  `high` and `extra-high` work.

## source_adaptation_notes
### internal_sources
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`

### official_codex_sources
- Codex AGENTS.md documentation
- Codex Skills documentation

### external_advisory_sources
- `agents-best-practices`
- Prior architecture audits

### community_pattern_sources
- Meta-harness pattern references
- Agent Skills specification

### adopted
- Boundary review before implementation
- Explicit deferral of later-phase capabilities
- Risk-tiered architecture review

### adapted
- Evaluate architecture against codex-harness phase and product-boundary rules.

### rejected
- Generic architecture commentary with no repo facts
- Future runtime architecture in Phase 23.6

## authority_level
`binding`
