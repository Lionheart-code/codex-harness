# Phase 26 - Big Task Decomposer and Architect Planner

## Purpose

Extend existing Phase 23.6 `feature-decomposition` into a stronger
architect/planner layer for large tasks.

## Key rule

This is not a new decomposer from scratch. It must build on the existing
`feature-decomposition` procedure if present.

## Goal

Turn a broad goal into a reviewable architecture/task packet:

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

## Non-goals

- Do not execute generated tasks automatically.
- Do not create domain-specific Ozon/CRM/marketing workflows.
- Do not bypass review/approval.

## Acceptance criteria

- Produces reviewable task-contract proposals.
- Does not approve its own scope.
- Integrates with operator lifecycle after approval.
- Uses research checkpoints when architecture depends on external current
  knowledge.
