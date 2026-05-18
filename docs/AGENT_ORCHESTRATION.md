# Agent Orchestration

## Purpose

Phase 6 defines the harness contract for agent roles, delegation, trust, and model-cost categories.

This phase does not run agents.

## Core rules

- Codex-first does not mean Codex-only.
- External agents are disabled by default.
- External agents are read-only by default.
- No agent output is trusted without verification.
- Write-capable agents require explicit task worktree boundaries.
- API is optional, not required.

## Supported roles

### controller

Owns task state, routing, boundaries, safety, and final workflow decisions.

### architect

Owns high-level planning, decomposition, and architecture trade-offs.

### scout

Performs read-only discovery, summarization, and risk listing.

### builder

Implements scoped code changes inside an explicit task worktree.

### verifier

Reviews diffs, acceptance coverage, and deterministic check results.

### integrator

Combines outputs from multiple workstreams when that mode exists in a later phase.

## Current defaults

- Codex is the default primary planner and builder.
- Codex may also act as architect or verifier when the task requires it.
- External CLI agents are future read-only scouts only.
- No automatic delegation is implemented in this phase.

## Internal-now vs external-later

Internal-now roles:

- controller
- architect
- builder
- verifier

External-later roles:

- scout
- integrator

The distinction is about current product support, not about theoretical capability. Phase 6 documents the contract only.

## Delegation policy

Use expensive models for:

- architecture decisions
- ambiguous planning
- high-risk review
- final validation

Use cheaper agents for:

- repository scouting
- documentation summary
- repeated narrow inspection
- risk listing

Delegation remains manual and explicit in Phase 6.

## Trust and verification

- No agent output is trusted without verification.
- Read-only findings must be reviewed before they influence implementation.
- Deterministic checks remain the source of truth for factual verification.
- Human review remains the merge gate for write-capable work.
