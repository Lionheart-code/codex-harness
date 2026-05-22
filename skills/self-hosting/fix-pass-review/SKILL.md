---
name: codex-harness-fix-pass-review
description: Use this skill when follow-up changes claim to address implementation-review findings and must be checked for completeness without widening the task scope.
---

# Fix-pass Review

## procedure_id
`fix-pass-review`

## title
Fix-pass Review

## purpose
Verify that a follow-up fix addresses review findings without widening scope.

## when_to_use
- Review findings required a fix pass.
- Follow-up changes exist and need a narrow re-review.
- The workflow needs to decide whether the original findings are resolved.

## required_inputs
- Original implementation-review findings
- Approved plan
- Fix-pass diff
- Current verification status

## preconditions
- Review findings are explicit enough to evaluate.
- A fix-pass diff exists.

## forbidden_scope
- Do not turn the fix pass into a new implementation pass.
- Do not add unrelated refactors or features.
- Do not reopen already accepted scope without a new task or plan.

## checklist
- Check each original finding for resolved, partially resolved, or unresolved
  status.
- Check that no new scope was added.
- Check whether verification evidence needs to be rerun or expanded.
- Return remaining blockers clearly.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- Original findings are missing or too vague.
- The fix-pass diff includes unrelated changes.
- Verification status is missing for a finding that depends on it.

## evidence_to_record
- Finding-by-finding disposition
- New scope check
- Remaining blockers or residual risks

## phase_23_5_dependencies
- Fix-pass review must not bypass verification, delivery-facts, closeout, or
  harvest boundaries.
- Fix-pass review must preserve local-state and authority boundaries.

## phase_24_packet_dependencies
- Later `implementation-review packet` manifests should cite `fix-pass-review`.

## source_adaptation_notes
### internal_sources
- Original review findings
- Approved plan
- `TASK.md`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex best practices

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Review-fix workflow patterns

### adopted
- Finding-driven fix verification
- Explicit residual risk handling
- No-new-scope enforcement

### adapted
- Keep fix passes tightly scoped to codex-harness task and review findings.

### rejected
- Opportunistic refactors
- Adjacent implementation during fix pass

## authority_level
`binding`
