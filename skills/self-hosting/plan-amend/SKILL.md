---
name: codex-harness-plan-amend
description: Use this skill when plan-review findings must be turned into a revised codex-harness plan with explicit accepted and unresolved review items before implementation.
---

# Plan Amend

## procedure_id
`plan-amend`

## title
Plan Amend

## purpose
Revise a draft plan in response to explicit review findings while keeping the
change history visible and yielding one effective amended plan for execution.

## when_to_use
- `plan-review` returned findings that require revision.
- The plan must be updated without hiding accepted or unresolved review items.
- Human approval depends on a stable amended plan.

## required_inputs
- Draft plan
- Plan-review findings
- Active task contract
- Current validation and boundary requirements

## preconditions
- Review findings exist and are specific enough to act on.
- Implementation has not started.

## forbidden_scope
- Do not silently rewrite the plan.
- Do not implement fixes.
- Do not suppress unresolved review findings.

## checklist
- Map every review finding to accepted, rejected, or unresolved disposition.
- Update only the plan sections affected by those findings.
- Make the latest amendment supersede earlier plan versions for execution while
  preserving older artifacts as audit trail.
- Preserve explicit scope, non-goals, and validation steps.
- Record residual risks that still require human judgment.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- Review findings are too vague to amend safely.
- The review identifies contradictions that require new task intake or
  decomposition first.
- The task contract changed during amendment.

## evidence_to_record
- Amended plan
- Finding disposition log
- Supersession note identifying the effective amended plan
- Residual risks or unresolved items

## phase_23_5_dependencies
- Amended plans must still preserve verification, delivery-facts, closeout, and
  harvest boundaries.
- Amendment must not redefine lifecycle authority.

## phase_24_packet_dependencies
- Later `plan-review packet` manifests should cite `plan-amend`.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `docs/PHASE_ACCEPTANCE.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`

### official_codex_sources
- Codex best practices

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Agent Skills specification

### adopted
- Amendment traceability
- Stable revised plan output
- Explicit finding disposition

### adapted
- Tie every amendment back to the codex-harness task and plan-review output.

### rejected
- Silent plan rewrites
- Scope growth hidden inside amendments

## authority_level
`binding`
