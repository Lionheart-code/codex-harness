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

## Acceptance criteria

- Existing Phase 23.6 procedure IDs are discoverable through a registry/index.
- Registry/index points back to canonical source paths.
- Generated/export targets are clearly non-authoritative.
- Operator can use registry metadata without parsing prose heuristically where
  practical.
- No parallel procedure taxonomy is introduced.
