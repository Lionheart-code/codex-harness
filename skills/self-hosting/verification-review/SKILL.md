---
name: codex-harness-verification-review
description: Use this skill when codex-harness build, test, acceptance, and release-dry-run evidence must be checked deterministically before closeout or delivery review.
---

# Verification Review

## procedure_id
`verification-review`

## title
Verification Review

## purpose
Check local build, test, acceptance, and release-dry-run evidence
deterministically.

## when_to_use
- Implementation review is complete enough to validate command evidence.
- The workflow needs to determine whether local verification is complete.
- Closeout depends on trustworthy local verification status.

## required_inputs
- Active task acceptance commands
- Latest runtime verification result or verified snapshot command results
- Current CI or release boundary docs
- Current diff or implementation summary

## preconditions
- Verification commands are known.
- Command results or failures are available for review.
- If local evidence comes from `node bin/ch run verify --run <run-id>`, expect
  the full self-hosting pack to commonly take 10-16 minutes as the acceptance
  suite grows. The command prints this expectation when it starts. Wait for
  real exit and do not relaunch a duplicate verification while the first
  process is still alive.

## forbidden_scope
- Do not fabricate command success.
- Do not treat local success as remote CI.
- Do not replace command evidence with review prose.

## checklist
- Use active task acceptance commands as the authoritative local command list.
- Read results from the latest runtime verification record or verified snapshot.
- Check that required commands were run.
- Check exit status and any explicit failure output.
- Treat a still-running `run verify` process as incomplete evidence, not as a
  failure or a license to start a second copy.
- Use the recorded per-command `duration_ms` values and the command's reported
  `verification_duration_ms` to compare like-for-like runs. Do not present the
  10-16 minute full-pack observation as a timeout, SLA, or a duration guarantee
  for a focused command or a reused evidence result.
- Record explicit evidence gaps instead of inferring success.
- Distinguish local verification from remote CI state.
- Check package and release boundary commands only when the task or boundary
  requires them.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- Required commands are missing.
- Evidence is incomplete or ambiguous.
- The task requires a command that was not run or captured.

## evidence_to_record
- Verification command list
- Pass/fail status per command
- Missing command or evidence notes
- Evidence gaps
- Local versus remote status note

## phase_23_5_dependencies
- Preserve local verification reuse rules and the local versus remote CI
  distinction.
- Keep closeout and harvest gated by explicit evidence rather than assumption.

## phase_24_packet_dependencies
- Later `implementation-review packet` manifests should cite
  `verification-review`.

## source_adaptation_notes
### internal_sources
- Active task acceptance commands
- Latest runtime verification result / verified snapshot
- `package.json`
- `.github/workflows/ci.yml`
- `docs/PHASE_ACCEPTANCE.md`

### official_codex_sources
- Codex best practices

### external_advisory_sources
- Prior acceptance or regression audits

### community_pattern_sources
- Deterministic verification patterns

### adopted
- Exact command-based verification
- Local versus remote distinction
- Evidence-first validation

### adapted
- Treat task acceptance commands as the primary local verification source.
- Include `npm run release:dry-run` only when the repo CI and package boundary
  require it.

### rejected
- "Tests probably passed" claims
- Inferring remote CI from local command success
- Using unrelated top-level run command results in place of the latest
  verification record

## authority_level
`binding`
