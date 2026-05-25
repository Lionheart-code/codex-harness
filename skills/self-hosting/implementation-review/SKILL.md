---
name: codex-harness-implementation-review
description: Use this skill when a codex-harness diff must be reviewed against the active task and approved plan before it can be considered ready for verification or closeout.
---

# Implementation Review

## procedure_id
`implementation-review`

## title
Implementation Review

## purpose
Review an implementation diff against the approved task and plan rather than
style alone.

## when_to_use
- Implementation work is complete enough for a review pass.
- A verifier or reviewer needs to compare the diff against the approved plan.
- The workflow is deciding whether a fix pass is required.

## required_inputs
- Active task contract
- Approved plan
- Current diff and changed files
- Current verification and evidence status

## preconditions
- There is an implementation diff to review.
- The reviewer is not also performing the implementation in the same pass.

## forbidden_scope
- Do not implement fixes.
- Do not treat style alone as the primary review outcome.
- Do not broaden scope while reviewing.

## checklist
- Compare the diff against the task and approved plan.
- Check for missing acceptance coverage and later-phase creep.
- Check `anti_slop`, `design_invariant`, `scope_legality`, `evidence_gap`,
  `docs_consistency`, and `future_phase_leakage` explicitly.
- Confirm `review_tier_controls` are named when the task is `high` or
  `extra-high`.
- Check whether evidence and validation are adequate for the claimed result.
- Reject confident claims that are not backed by deterministic evidence.
- Return findings clearly enough for a scoped fix pass.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- There is no stable approved plan to compare against.
- The diff is incomplete or mixed with unrelated work.
- Review cannot determine whether claimed behavior is covered by evidence.
- Review finds unresolved policy issues in anti-slop, design invariants, scope
  legality, evidence discipline, docs consistency, future-phase leakage, or
  review-tier control use.

## evidence_to_record
- Findings
- Policy findings covering `anti_slop`, `design_invariant`,
  `scope_legality`, `evidence_gap`, `docs_consistency`,
  `future_phase_leakage`, and `review_tier_controls` when applicable
- Scope compliance result
- Missing test or validation notes
- Fix-pass recommendation

## phase_23_5_dependencies
- Review must preserve delivery-facts, verification, closeout, and harvest
  boundaries.
- Review must not reinterpret hooks as lifecycle authority.

## phase_24_packet_dependencies
- Later `implementation-review packet` manifests should cite
  `implementation-review`.

## source_adaptation_notes
### internal_sources
- `TASK.md`
- Approved plan artifact
- `docs/PHASE_ACCEPTANCE.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`

### official_codex_sources
- Codex best practices

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Review-output patterns from community skills

### adopted
- Findings-first review
- Diff-versus-plan comparison
- Missing-test and boundary checks

### adapted
- Review codex-harness changes against repo phase boundaries and evidence rules.

### rejected
- Style-only review
- Scope expansion during review

## authority_level
`binding`
