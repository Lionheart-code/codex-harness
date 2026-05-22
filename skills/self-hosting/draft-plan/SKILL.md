---
name: codex-harness-draft-plan
description: Use this skill when the active codex-harness task is ready for a plan and the goal is to produce a decision-complete implementation plan without editing files.
---

# Draft Plan

## procedure_id
`draft-plan`

## title
Draft Plan

## purpose
Produce a decision-complete implementation plan without editing files or
starting execution.

## when_to_use
- The active task has been normalized and is ready for planning.
- The work is non-trivial enough to require explicit sequencing and
  validation.
- A later independent plan review will evaluate the output.

## required_inputs
- Normalized task contract
- Relevant roadmap and boundary docs
- Validation commands and acceptance expectations
- Known risks, assumptions, and open questions

## preconditions
- The active task and acceptance rules are readable.
- Planning is still pre-implementation.

## forbidden_scope
- Do not edit files.
- Do not approve the plan.
- Do not implement any step while drafting the plan.

## checklist
- State the intended outcome and success criteria.
- Define the smallest safe implementation steps.
- Record assumptions, risks, and validation commands.
- Keep later phases out of scope.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- Acceptance or boundary rules are too ambiguous to plan safely.
- Key implementation choices depend on missing repo facts.
- The task already requires decomposition instead of direct planning.

## evidence_to_record
- Draft plan
- Assumptions and risks
- Validation commands
- Explicit out-of-scope items

## phase_23_5_dependencies
- The plan must preserve lifecycle, delivery-facts, verification, closeout,
  and harvest rules already defined by Phase 23.5.
- The plan must treat hooks as guardrails rather than authority.

## phase_24_packet_dependencies
- Later `planner packet` manifests should cite `draft-plan`.

## source_adaptation_notes
### internal_sources
- `TASK.md`
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex best practices
- Codex AGENTS.md documentation

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Agent Skills specification

### adopted
- Plan-first discipline
- Explicit assumptions and risks
- Validation before implementation

### adapted
- Draft plans for codex-harness must stay phase-scoped and repo-boundary aware.

### rejected
- Implementation during planning
- Hidden plan decisions

## authority_level
`binding`
