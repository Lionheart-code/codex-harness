---
name: codex-harness-harness-audit
description: Use this skill when codex-harness needs a holistic self-hosting audit of workflow, boundaries, and guardrails without treating external skills or community packs as authority.
---

# Harness Audit

## procedure_id
`harness-audit`

## title
Harness Audit

## purpose
Run a holistic self-hosting audit against the current repo, workflow, and
guardrails.

## when_to_use
- The work is `extra-high` risk.
- A broad architecture or workflow audit is needed.
- The repo needs an external-style review grounded in current task and repo
  contracts.

## required_inputs
- Active task contract
- Relevant current docs
- Relevant tests and evidence
- Review intensity tier

## preconditions
- The audit scope is bounded to the current repo and task context.
- Repo-owned contracts are available.

## forbidden_scope
- Do not treat external skill guidance as runtime authority.
- Do not implement fixes during the audit.
- Do not recommend future runtime systems as current-phase work.

## checklist
- Check model-versus-harness boundaries.
- Check source-of-truth and discovery boundaries.
- Check role, approval, verification, and closeout boundaries.
- Check source trace on any advisory pattern imported into repo-owned
  procedure/policy surfaces.
- Check skill risk classification for changed procedures or tooling surfaces.
- Check docs freshness and closeout/readiness boundaries.
- Check for future-phase creep and hidden runtime behavior.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The audit scope is too vague.
- Key repo contracts are missing.
- The audit would require future runtime features to answer.

## evidence_to_record
- Audit findings
- Boundary-risk summary
- Source trace note
- Skill risk note
- Recommended keep, defer, or split decisions

## phase_23_5_dependencies
- Preserve DB-first memory authority, hook guardrail role, delivery-facts
  boundaries, and closeout/harvest separation.
- Do not treat audit findings as permission to bypass lifecycle authority.

## phase_24_packet_dependencies
- Later extra-high review manifests may cite `harness-audit` as a supporting
  procedure.

## source_adaptation_notes
### internal_sources
- Current active task
- Current docs
- Current tests
- Current acceptance rules

### official_codex_sources
- Codex Skills documentation
- Codex best practices
- Codex Hooks documentation

### external_advisory_sources
- `agents-best-practices`
- Prior architecture or governance audits

### community_pattern_sources
- Meta-harness pattern references

### adopted
- Model proposes and harness validates
- Legible procedures and bounded autonomy
- Workflow and guardrail audits

### adapted
- Keep the audit local-first, repo-specific, and phase-boundary aware.

### rejected
- External skill guidance as runtime authority
- Future runtime design in Phase 23.6

## authority_level
`binding`
