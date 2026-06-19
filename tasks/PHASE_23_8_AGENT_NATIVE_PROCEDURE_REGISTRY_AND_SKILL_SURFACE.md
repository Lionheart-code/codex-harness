# Phase 23.8 - Agent-native Procedure Registry and Skill Surface

## Purpose

Materialize and validate the existing Phase 23.6 self-hosting procedure surface
so agents can discover and use procedures consistently.

This phase extends `skills/self-hosting/**`; it does not replace it.

## Core rule

`skills/self-hosting/**` remains canonical repository source unless a separate
reviewed boundary change proves otherwise.

`.agents/skills/**`, `$HOME/.agents/skills/**`, or other host-specific
locations are generated/export/discovery targets only.

## Required work

- Build or validate a machine-readable index/registry of Phase 23.6 procedures.
- Preserve procedure IDs.
- Expose required inputs, outputs, allowed states, blockers, evidence
  requirements, and packet dependencies.
- Tighten the canonical `draft-plan`, `plan-review`, and `plan-amend`
  procedure surfaces only where needed so the approved workflow semantics are
  durable in repo-owned contracts rather than chat-local prompts.
- Make `plan-review` preserve a durable operator-readable decision record in
  addition to a human-readable review report.
- Make `plan-amend` yield one effective amended plan rather than leaving
  implementation to merge amendment history manually.
- Add validation that generated/discovery targets are not treated as canonical
  source.
- Add focused research checkpoint for Codex skills/AGENTS/hooks/gstack-style
  host packaging.
- Keep provider/host adapters deferred to Phase 25.

## Non-goals

- Do not build a broad plugin framework.
- Do not import community skill packs.
- Do not move canonical source out of `skills/self-hosting/**`.
- Do not implement provider/model review routing.
- Do not implement domain packs.
- Do not implement transactional procedure-result ingestion or slice-isolated
  run mutations.
- Do not implement stage packet automation, proof generation, reports, access
  APIs, MCP, runners, hooks, provider adapters, or domain-pack behavior.

## Closeout addendum

Before Phase 23.8 closeout, the standalone
`docs/SELF_HOSTING_RUN_STATE_AUTOMATION_FOLLOWUP.md` note must not remain as an
independent planning or authority surface. Its substance must be folded into
canonical roadmap/task contracts, and the standalone file must be removed or
left uncommitted before closeout.

Phase 23.8 may update future task contracts and roadmap preconditions to
represent that run-state ingestion hardening is required before Phase 23.9.
It must not implement that hardening in this phase.

Required future contract coverage:

- `tasks/PHASE_23_8_5_AUTOMATION_ROADMAP_AND_TASK_AUTHORITY_REBASE.md`;
- `tasks/PHASE_23_8_6_TRANSACTIONAL_PROCEDURE_RESULT_INGESTION.md`;
- `tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`;
- an amended `tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md`
  that consumes stable procedure/run-state records or explicitly documents a
  reviewed defer/waiver.

## Acceptance criteria

- Existing Phase 23.6 procedure IDs are discoverable through a registry/index.
- Registry/index points back to canonical source paths.
- Generated/export targets are clearly non-authoritative.
- Operator can use registry metadata without parsing prose heuristically where
  practical.
- No parallel procedure taxonomy is introduced.

## Acceptance commands

```bash
npm run build
node --test tests/acceptance/phase23-6-self-hosting-skills-plan-review-bootstrap.test.mjs tests/acceptance/self-hosting-review-policy-hardening.test.mjs tests/acceptance/phase23-7-operator-status.test.mjs tests/acceptance/phase23-8-agent-native-procedure-registry-and-skill-surface.test.mjs
git diff --check
```

## Acceptance behavior

- `skills/self-hosting/procedure-registry.json` exists as a checked-in,
  canonical registry artifact and validates against a product-source schema
  under `schemas/`.
- The registry preserves existing Phase 23.6 procedure IDs, points back to the
  canonical `skills/self-hosting/**` files, and marks `.agents/**` or
  host-installed discovery targets as non-authoritative.
- `node bin/ch run status --operator` can consume registry-backed procedure
  metadata where practical instead of relying only on prose or directory scans.
- Pre-implementation operator progression is outcome-aware enough to avoid
  treating bare `plan-review` evidence as equivalent to an approved or amended
  plan.
- Canonical `draft-plan`, `plan-review`, and `plan-amend` surfaces preserve:
  - deterministic decisions versus real operator choices;
  - `plan-review` as the mandatory task-boundary barrier before implementation;
  - a durable review decision record for operator/runtime use;
  - one effective amended plan rather than manual amendment-chain stitching.
- Hooks remain guardrails and docs/defer-only in this phase; they do not become
  task, review, lifecycle, or memory authority.
- The focused research checkpoint records what was adopted, what remains
  advisory, and what is deferred to later phases.
- No standalone run-state follow-up planning file remains in the final Phase
  23.8 diff.
- Future run-state ingestion work is represented only through canonical roadmap
  and task contracts.
- No transactional ingestion commands, packet automation, proof generation,
  reports, access APIs, MCP, runners, hooks, provider adapters, or domain-pack
  behavior are implemented in Phase 23.8.
