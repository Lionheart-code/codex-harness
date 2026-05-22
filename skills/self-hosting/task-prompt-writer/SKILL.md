---
name: codex-harness-task-prompt-writer
description: Use this skill when approved codex-harness task and workflow inputs must be turned into invocation-ready guidance without making prompts the source of truth.
---

# Task Prompt Writer

## procedure_id
`task-prompt-writer`

## title
Task Prompt Writer

## purpose
Produce or review invocation-ready implementation guidance derived from
repo-owned procedures and task contracts.

## when_to_use
- A planner or operator needs a reusable invocation wrapper for an approved
  task.
- Existing prompts need review against the current procedure contract.
- A task needs stable instructions without drifting into chat-only prompts.

## required_inputs
- Current task contract
- Relevant procedure contract
- Required reading and validation commands
- Current repo boundary and non-goals

## preconditions
- The task has already been selected.
- Inputs come from repo-owned contracts rather than ad hoc chat content.

## forbidden_scope
- Do not treat the generated prompt as source-of-truth.
- Do not start implementation.
- Do not invent new scope or acceptance requirements.

## checklist
- Point to task files and procedure artifacts by path.
- Include required checks, non-goals, and repo boundaries.
- Distinguish between binding contract and derived invocation guidance.
- Keep later-phase work out of scope.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The task contract or procedure contract is missing.
- The task is not yet specific enough to write a bounded invocation wrapper.
- Required validation or scope boundaries are unknown.

## evidence_to_record
- Prompt wrapper or prompt review summary
- Referenced task and procedure inputs
- Missing inputs or contradictions

## phase_23_5_dependencies
- Prompt guidance must not bypass lifecycle, delivery-facts, verification, or
  harvest rules.
- Prompt guidance should preserve local-state boundaries.

## phase_24_packet_dependencies
- Later `planner packet` manifests should cite `task-prompt-writer`.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `prompts/00-slash-plan-master.md`
- `prompts/99-review-current-task.md`

### official_codex_sources
- Codex AGENTS.md documentation
- Codex Skills documentation
- Codex best practices

### external_advisory_sources
- `agents-best-practices`
- Prior prompt audits

### community_pattern_sources
- Agent Skills specification

### adopted
- Prompts should reference source artifacts
- Prompts should carry boundaries and checks
- Prompts should stay lightweight and derived

### adapted
- Keep repo-owned procedures authoritative while allowing invocation helpers to
  point to them.

### rejected
- Chat-only mega prompts
- Prompt text as hidden source-of-truth

## authority_level
`binding`
