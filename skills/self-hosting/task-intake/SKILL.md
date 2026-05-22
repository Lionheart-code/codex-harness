---
name: codex-harness-task-intake
description: Use this skill when an active codex-harness task must be normalized into a stable implementation contract before planning or review.
---

# Task Intake

## procedure_id
`task-intake`

## title
Task Intake

## purpose
Normalize an active task into a stable implementation contract before planning
begins.

## when_to_use
- A task has been selected and needs scope, acceptance, and boundary extraction.
- Reviewers or planners need a normalized task summary before proceeding.
- The task has enough detail to plan, but not yet enough structure for a safe
  implementation pass.

## required_inputs
- Current `TASK.md`
- Active task file
- Relevant acceptance and boundary docs
- Known repo constraints or non-goals

## preconditions
- Exactly one active task is being prepared.
- The active task file is present and readable.

## forbidden_scope
- Do not approve the plan.
- Do not implement changes.
- Do not rewrite the task contract.

## checklist
- Extract binding scope, non-goals, required reading, and acceptance commands.
- Identify missing assumptions or contradictions that matter to planning.
- Record the exact validation and review expectations.
- Flag later-phase creep immediately.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The active task file is missing or unreadable.
- Scope and acceptance are too ambiguous to plan safely.
- Repo-owned docs contradict the task in a way that changes implementation
  direction.

## evidence_to_record
- Normalized task contract
- Explicit scope and non-goals
- Validation expectations
- Blocking contradictions or open questions

## phase_23_5_dependencies
- Intake should preserve existing lifecycle, delivery-facts, and harvest
  boundaries rather than redefining them.
- Intake output must remain compatible with later verification and closeout
  review.

## phase_24_packet_dependencies
- Later `planner packet` manifests should cite `task-intake`.

## source_adaptation_notes
### internal_sources
- `TASK.md`
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `docs/PHASE_ACCEPTANCE.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`

### official_codex_sources
- Codex AGENTS.md documentation
- Codex best practices

### external_advisory_sources
- `agents-best-practices`
- Prior prompt or plan audits

### community_pattern_sources
- Agent Skills specification

### adopted
- Contract extraction before planning
- Explicit scope and non-goals
- Acceptance-aware task normalization

### adapted
- Convert the codex-harness task file and supporting docs into a stable planner
  handoff.

### rejected
- Vague task summaries
- Planning from chat memory alone

## authority_level
`binding`
