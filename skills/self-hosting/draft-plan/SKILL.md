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
Produce a decision-complete, agent-legible implementation plan without editing
files or starting execution.

## when_to_use
- The active task has been normalized and is ready for planning.
- The work is non-trivial enough to require explicit sequencing and
  validation.
- A later independent plan review will evaluate the output.

## required_inputs
- Normalized task contract
- Prior procedure artifacts for the current run
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
- Identify the source files, runtime state, CLI surfaces, docs, tests, and
  procedure artifacts the implementation will inspect or change.
- Turn broad task requirements into concrete implementation surfaces and
  engineering questions.
- Define the smallest safe implementation steps.
- Distinguish deterministic decisions from true operator choices.
- Recommend one concrete execution path and avoid fake alternatives where repo
  context already determines the answer.
- Include a validation matrix that maps acceptance behavior to concrete
  commands, focused tests, or review evidence.
- Include stop conditions for blockers, storage gaps, authority conflicts,
  permission escalation, or scope drift.
- Include a handoff condition that states what must be true before
  implementation may begin.
- Explain how the plan avoids unnecessary abstraction or one-use generic
  helpers.
- Preserve design invariants and source-of-truth boundaries explicitly.
- Check task/docs/prompt/skill consistency when authoritative behavior
  changes.
- Keep required changes only, reject future-phase leakage, and capture
  adjacent work as follow-up.
- Record assumptions, risks, and validation commands.
- Keep later phases out of scope.

## manual_invocation_guidance
- Prefer a stronger planning profile than a lightweight synthesis pass when the
  task is non-trivial, phase-order sensitive, or review-tier `high` /
  `extra-high`.
- Keep this as advisory manual CLI guidance only; it does not create
  provider/model routing or runtime execution authority.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.
For `high` and `extra-high` work, produce one candidate identity for the
three-lens planning-review bundle. No amendment begins until all assigned lens
results are terminal.

## blocker_conditions
- Acceptance or boundary rules are too ambiguous to recommend a safe concrete
  path.
- Key implementation choices depend on missing repo facts.
- The task already requires decomposition instead of direct planning.
- Required source surfaces, validation signals, or stop conditions cannot be
  identified from repo-owned inputs.

## evidence_to_record
- Draft plan
- Implementation surfaces
- Open engineering questions
- Assumptions and risks
- Recommended defaults and any real operator-choice points that remain
- Reviewer policy checks for `anti_slop`, `design_invariant`,
  `scope_legality`, `evidence_gap`, `docs_consistency`,
  `future_phase_leakage`, and `review_tier_controls` when applicable
- Validation matrix
- Stop conditions and implementation handoff criteria
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
