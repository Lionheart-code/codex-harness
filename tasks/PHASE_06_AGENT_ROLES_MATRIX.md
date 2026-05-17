# Phase 6 — Agent roles and capability matrix

## Goal

Define how the harness will reason about agents, roles, costs, strengths, limits, and delegation.

This phase does not run agents.

## Scope

- create documentation/config for agent roles;
- define role types: controller, architect, scout, builder, verifier, integrator;
- define agent capability matrix format;
- define cost policy categories;
- define per-agent adapter profile fields;
- define permission modes: read_only, write_worktree, review_only;
- define working directory policies: repo_root, task_worktree, explicit_path;
- document that Codex, Gemini CLI, Cline/Roo-like agents, Aider-like agents, and custom agents may need different prompt styles and boundaries;
- define default first agents:
  - Codex as primary builder/planner;
  - external CLI agents as future read-only scouts;
- define that API is optional, not required.

## Files to create/change

- `docs/AGENT_ORCHESTRATION.md`
- `docs/AGENT_CAPABILITY_MATRIX.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- optional template under `.harness/templates/agent-capabilities.example.json` only if installer templates already exist by this phase.

## Non-goals

- no external-agent execution;
- no API integration;
- no automatic delegation;
- no parallel agents;
- no write-mode external agents.

## Acceptance commands

```bash
npm run build
test -f docs/AGENT_ORCHESTRATION.md
test -f docs/AGENT_CAPABILITY_MATRIX.md
test -f docs/AGENT_BOUNDARIES_AND_ADAPTERS.md
```

## Acceptance behavior

- roles are clearly defined;
- cost policy is explicit;
- API is optional;
- external CLI agents are read-only by default;
- agent profiles are explicit;
- boundaries differ by agent type;
- no runtime execution is added.
