---
name: codex-harness-plan-review
description: Use this skill when a draft codex-harness plan needs an independent pre-implementation review against the task contract, repo boundaries, and review intensity tier.
---

# Plan Review

## procedure_id
`plan-review`

## title
Plan Review

## purpose
Independently review a draft plan before implementation begins.

This lens owns task/scope compliance, decision completeness, consolidated
contract consistency, exact inventory, operator choices, validation, stop
conditions, and assignment to specialized lenses. It does not duplicate
detailed architecture dependency analysis or storage transaction/replay review.

## when_to_use
- A draft plan exists and implementation has not started.
- The plan needs a reviewer pass against task scope, acceptance, and repo
  boundaries.
- The work may require `standard`, `high`, or `extra-high` review intensity.

## required_inputs
- Draft plan
- Active task contract
- Relevant boundary and acceptance docs
- Review intensity tier

## preconditions
- The plan is stable enough to review.
- The reviewer is not using the review to start implementing.

## forbidden_scope
- Do not implement fixes.
- Do not silently rewrite the plan.
- Do not treat review as optional.

## checklist
- Classify every finding as `PLAN_BLOCKER`, `IMPLEMENTATION_DISCRETION`,
  `IMPLEMENTATION_REVIEW_CHECK`, or `DEFERRED_DEBT`.
- Derive the review surface from the active task, relevant plan artifacts,
  changed file domains, affected procedures, required evidence, forbidden
  scope, and authority boundaries.
- Compare the plan against the task and non-goals.
- Treat the task as the boundary contract and the draft plan as a proposed
  concretization inside that boundary.
- Confirm the plan identifies source inputs, implementation surfaces, open
  engineering questions, validation matrix entries, stop conditions, and
  handoff criteria.
- Check for later-phase creep and authority-boundary violations.
- Check `anti_slop`, `design_invariant`, `scope_legality`, `evidence_gap`,
  `docs_consistency`, and `future_phase_leakage` explicitly.
- Confirm `review_tier_controls` are named when the work is `high` or
  `extra-high`.
- Check source trace when the plan changes authoritative docs, prompts, skills,
  or workflow contracts.
- Check skill risk classification when the plan expects procedure/skill changes.
- Confirm validation commands and evidence expectations are adequate.
- Distinguish deterministic defaults from real operator choices.
- Preserve two layers of output:
  - a human-readable review report for auditability;
  - a durable decision record for operator/runtime progression.
- Use only the canonical `outcome_state` tokens defined by the checked-in
  output format and runtime/registry contract.
- Return findings clearly enough for `plan-amend` to act on them.
- Bind the exact same candidate plan SHA, source HEAD, task artifact, immutable
  base, cohort, and checked-in output-contract identity as the architecture and
  DB/storage lens outputs.

## manual_invocation_guidance
- Run this review in a separate reviewer session from the planner or builder.
- Use a different reviewer model/profile from the planning or implementation
  pass being reviewed.
- This is advisory manual CLI guidance only; it does not create
  provider/model routing or runtime approval authority.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The plan is missing key implementation or validation details.
- The plan omits source inputs, implementation surfaces, open engineering
  questions, validation matrix entries, stop conditions, or handoff criteria
  needed for a safe implementation pass.
- The review intensity tier is unknown for a high-risk task.
- The review surface cannot be derived safely.
- Source trace is unclear for an authoritative behavior change.
- Skill risk classification is unclear for planned procedure/skill changes.
- The plan omits required `anti_slop`, `design_invariant`,
  `scope_legality`, `evidence_gap`, `docs_consistency`,
  `future_phase_leakage`, or `review_tier_controls` checks for the task.
- Repo-owned docs contradict the plan materially.

## evidence_to_record
- Review findings
- Review surface
- Review tier used
- Durable decision record with outcome state and next allowed action
- Policy control check covering `anti_slop`, `design_invariant`,
  `scope_legality`, `evidence_gap`, `docs_consistency`,
  `future_phase_leakage`, and `review_tier_controls`
- Source trace note
- Skill risk check when applicable
- Blockers and residual risks
- Pass or amend recommendation

## phase_23_5_dependencies
- Review should preserve Phase 23.5 lifecycle, delivery-facts, verification,
  and harvest boundaries.
- Review must not treat hooks as the authority layer.

## phase_24_packet_dependencies
- Later `plan-review packet` manifests should cite `plan-review`.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex best practices
- Codex AGENTS.md documentation

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Agent Skills specification

### adopted
- Separate reviewer pass
- Findings-first review
- Tier-based review intensity

### adapted
- Review the plan against codex-harness phase boundaries and product-source
  rules.

### rejected
- Reviewer as executor
- Optional review before implementation

## authority_level
`binding`
