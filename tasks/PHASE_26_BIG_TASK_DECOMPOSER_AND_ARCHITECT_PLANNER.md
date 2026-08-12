# Phase 26 - Big Task Decomposer and Architect Planner

## Purpose

Extend existing Phase 23.6 `feature-decomposition` into a stronger
architect/planner layer for large tasks and reviewed findings.

This phase emits reviewable task graph proposals only. It does not execute
generated tasks and does not approve its own scope.

It consumes the established Phase 24A.2 vocabulary. Proposals must be
compatible with canonical task requirements, authorized observable behavior
scenarios where applicable, architecture invariants/drivers where applicable,
and traceable verification expectations. It must not invent a competing
specification/BDD/architecture vocabulary; proposals remain proposals until
owner approval/import.

## Key rule

This is not a new decomposer from scratch. It must build on the existing
`feature-decomposition` procedure if present.

## Goal

Turn a broad goal or reviewed finding into a reviewable architecture/task graph
proposal:

- normalized brief;
- goals and non-goals;
- assumptions;
- research checkpoint summary;
- architecture hypothesis;
- task contracts;
- dependency graph;
- risks;
- first recommended task;
- approval questions.
- human approval/import boundary.

## Non-goals

- Do not execute generated tasks automatically.
- Do not approve generated scope.
- Do not create domain-specific Ozon/CRM/marketing workflows.
- Do not bypass review/approval.
- Do not implement domain pack runtime.
- Do not implement domain ingestion/schema evolution.
- Do not implement the prior-art discovery gate.
- Do not implement bounded experimentation.
- Do not create an autonomous planner loop.

## Acceptance criteria

- Produces reviewable task-contract proposals.
- Does not approve its own scope.
- Integrates with operator lifecycle after approval.
- Uses research checkpoints when architecture depends on external current
  knowledge.
- Generated proposals remain reviewable material until promoted by human
  approval.

## Future-phase impact check

- Prepares Phase 27 domain pack architecture and Phase 29 prior-art discovery
  by producing reviewable proposals, not executing them.
- Must not pre-implement domain pack runtime, domain ingestion/schema
  evolution, prior-art discovery gate, bounded experimentation loop, or
  autonomous task execution.
- Preserves the domain/core boundary by keeping generated tasks as proposals
  until human approval and later domain-pack contracts.
- Requires architecture review if the planner creates executable scope without
  approval, writes domain logic into core, bypasses task contracts, or starts
  using findings as automatic implementation authority.
