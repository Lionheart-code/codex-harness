---
name: codex-harness-feature-decomposition
description: Use this skill when a request is too broad for one implementation pass and must be decomposed into reviewable codex-harness task-contract proposals without starting implementation.
---

# Feature Decomposition

## procedure_id
`feature-decomposition`

## title
Feature Decomposition

## purpose
Break a broad request into ordered, reviewable task-contract proposals that fit
the codex-harness phase workflow.

## when_to_use
- The request spans multiple modules, workflow slices, or future phases.
- The work cannot be implemented safely in one scoped pass.
- Planning depends on choosing task boundaries first.

## required_inputs
- The broad request or initiative being evaluated
- Current `TASK.md`
- Relevant roadmap and boundary docs
- Known constraints, non-goals, and open questions

## preconditions
- The request is broader than one approved implementation pass.
- Repo authority docs have been reviewed.

## forbidden_scope
- Do not approve scope automatically.
- Do not edit files or start implementation.
- Do not rewrite `TASK.md`.
- Do not assign later phases as current work.

## checklist
- Confirm goals, non-goals, constraints, and unresolved assumptions.
- Identify the smallest reviewable task contracts that satisfy the request.
- Order proposed tasks by dependency, risk, and value.
- Recommend the first active task only after documenting why it comes first.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The request is already a single active task.
- Required roadmap or boundary docs are unavailable.
- The request is too ambiguous to define task proposals responsibly.

## evidence_to_record
- Proposed task contracts
- Dependency and risk ordering
- Recommendation for the first active task
- Open questions and explicit non-goals

## phase_23_5_dependencies
- Preserve Phase 23.5 lifecycle boundaries; this procedure does not override
  delivery-facts, closeout, or harvest rules.
- Keep hooks as guardrails only and not as task-selection authority.

## phase_24_packet_dependencies
- Later `planner packet` manifests should cite `feature-decomposition` when the
  request was too broad for one implementation pass.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/AGENT_ORCHESTRATION.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`

### official_codex_sources
- Codex Skills documentation
- Codex best practices
- Codex AGENTS.md documentation

### external_advisory_sources
- `agents-best-practices`
- Prior architecture audits
- Reviewed Deep Research only if explicitly supplied

### community_pattern_sources
- Agent Skills specification
- Meta-harness pattern references

### adopted
- Plan-first decomposition
- Explicit goals and non-goals
- Ordered task-contract proposals

### adapted
- Convert broad requests into codex-harness phase/task proposals with human
  approval gates.

### rejected
- Autonomous roadmap ownership
- Direct implementation from a broad request

## authority_level
`binding`
