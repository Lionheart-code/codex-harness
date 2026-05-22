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
- Compare the plan against the task and non-goals.
- Check for later-phase creep and authority-boundary violations.
- Confirm validation commands and evidence expectations are adequate.
- Return findings clearly enough for `plan-amend` to act on them.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The plan is missing key implementation or validation details.
- The review intensity tier is unknown for a high-risk task.
- Repo-owned docs contradict the plan materially.

## evidence_to_record
- Review findings
- Review tier used
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
