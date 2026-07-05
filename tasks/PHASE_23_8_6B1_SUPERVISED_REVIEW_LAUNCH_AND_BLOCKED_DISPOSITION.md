# Phase 23.8.6B1 - Supervised Review Launch and Blocked Disposition

## Status

Active implementation phase. Phase 23.8.6B Self-Hosting Model Routing
Policy Packaging is already complete, reviewed, accepted, merged, harvested,
and pulled into fresh `main`, so B1 is now the active implementation target.

The current B1 pass implements the runtime/code behavior defined by this task
contract.

Before continuing implementation:

- local `main` must be fast-forwarded to fresh `origin/main`;
- one task = one branch = one worktree must be preserved.

## Purpose

Make review launch repo-owned and deterministic for `plan-review` and
`implementation-review`.

This phase turns the checked-in Codex CLI review-launch discipline into a
narrow supervised runtime surface that can classify launch failures honestly,
block when no valid review artifact exists, and preserve exact-identity
evidence boundaries for later storage and proof phases.

## Problem

Review procedures exist, but review launch is still fragile and prompt-driven.
A child reviewer can fail, hang, hit usage limits, write no artifact, produce
stale output, or produce invalid output.

The harness currently lacks a deterministic runtime surface that:

- launches review in a supervised way;
- validates review artifacts before lifecycle progression;
- records exact-identity launch evidence and blocked disposition; and
- fails closed when only a display `run_id` is available or durable evidence
  cannot be recorded safely.

## Scope

This phase owns only supervised review launch and blocked disposition.

## Required behavior

- Add a narrow runtime surface:

  ```bash
  node bin/ch run launch-review \
    --run <run-id> \
    --procedure <plan-review|implementation-review> \
    --request <path> \
    --output <path> \
    [--timeout-seconds <n>] \
    [--stale-after-seconds <n>] \
    [--dry-run]
  ```

- As an early runtime repair in this phase, make phase-id parsing and operator
  roadmap resolution recognize split phase ids such as `23.8.6B1`
  distinctly from `23.8.6B`, so aligned `TASK.md` plus roadmap authority does
  not produce a false `STALE_TASK_ROADMAP_CONFLICT`.
- Return a structured launch observation for every invocation, including
  denied, dry-run, timeout, failed, blocked, invalid-artifact, and successful
  paths. The observation must include at minimum:

  ```text
  status
  attempt_id when created
  procedure_id
  run_id
  run_instance_id when resolved
  failure_classification when applicable
  artifact_ref when available
  blocked_reason when applicable
  next_valid_action
  summary
  ```

- Do not return large raw stdout/stderr blobs as the primary observation. Store
  or tail bulky child output and return structured refs, hashes, or bounded
  tails.
- Record in repo-owned runtime/docs behavior that the public CLI may accept a
  display `run_id`, but implementation must resolve it to the active exact run
  identity before any durable evidence mutation:

  ```text
  run_instance_id
  project_run_id when available
  ```

- Fail closed before launch if the display `run_id` is ambiguous or no active
  exact run identity can be resolved.
- Extend the checked-in self-hosting procedure registry with
  `review_launch_profile` only for:
  - `plan-review`
  - `implementation-review`
- Require every `review_launch_profile` to include at minimum:

  ```text
  adapter_id
  model
  reasoning_effort
  sandbox_mode
  output_mode
  timeout_seconds
  stale_after_seconds
  ```

- Implement exactly one adapter in this phase:

  ```text
  codex_cli
  ```

- Do not add Claude, OpenAI API, plugin, MCP, manual, or broad provider
  adapters in this phase.
- Classify `run launch-review` as `process_execution` risk with side effects
  limited to an allowlisted child Codex CLI process plus run-local
  launch-evidence/artifact writes. The permission contract for this phase is:
  - sandbox mode must be read-only;
  - source-file writes are denied;
  - external communication and network policy are inherited from the local
    Codex CLI profile, not broadened by the harness;
  - timeout and stale-output limits are mandatory;
  - retries are explicit operator actions, not automatic relaunch loops; and
  - audit/evidence records are written only after exact run identity is
    resolved.
- Split implementation into two narrow layers:
  - generic supervisor layer for exact run identity resolution, timeout,
    stale-output detection, terminal exit handling, stdout/stderr capture,
    artifact presence check, artifact validation, provenance classification,
    failure classification, structured launch-attempt evidence, artifact
    reference recording, blocked disposition, and operator-status projection;
  - `codex_cli` adapter layer for local CLI probing, supported-flag checks,
    command construction, `codex exec` invocation, read-only sandbox handling,
    model/reasoning handling, output-artifact handling, JSON/final-message
    capture rules when locally supported, stdout/stderr interpretation, and
    PATH-stub deterministic tests.
- Keep Codex-specific launch details out of the generic supervisor layer.
- Keep exact-identity persistence details out of the `codex_cli` adapter layer.
- Accept review evidence only in this order:
  1. valid artifact file exists at the expected output path;
  2. captured final review text from a supported child JSON/final-message
     stream validates unchanged as the complete review artifact;
  3. raw stdout validates unchanged as the complete review artifact.
- If fallback path 2 or 3 is used, persist the exact captured child output
  unchanged as the expected artifact, record provenance and content hash, and
  validate the persisted artifact again.
- Never rewrite, summarize, repair, or fabricate the review artifact.
- Never treat review request files or blocker notes as review artifacts.
- Add or expose validators:

  ```text
  validatePlanReviewArtifact(markdown)
  validateImplementationReviewArtifact(markdown)
  ```

- Treat canonical `implementation-review` verdicts as:

  ```text
  PASS
  FIX_REQUIRED
  ```

- If backward-compatible aliases are needed for `implementation-review`, scope
  them only to `implementation-review` ingestion and prove with tests that
  other review procedure contracts remain strict.
- Record every launch attempt as structured runtime/evidence state with at
  least:

  ```text
  attempt_id
  adapter_id
  procedure_id
  run_id
  run_instance_id
  project_run_id when available
  request_path
  request_artifact_hash when available
  expected_output_path
  resolved_model
  resolved_reasoning_effort
  sandbox_mode
  output_mode
  timeout_seconds
  stale_after_seconds
  launch_command
  working_directory
  pid when available
  start_time
  last_output_time
  terminal_exit_code
  terminal_signal
  stdout_capture_or_tail
  stderr_capture_or_tail
  stdout_payload_ref when persisted
  stderr_payload_ref when persisted
  artifact_present
  artifact_valid
  artifact_hash
  artifact_ref
  payload_index_ref when available
  provenance_source
  failure_classification
  blocked_reason
  next_valid_action
  ```

- Keep launch-attempt evidence as runtime/evidence state rather than Git
  source.
- Preserve this storage contract:

  ```text
  launch-attempt evidence:
    structured runtime/evidence record, keyed by exact run identity.

  review artifact body:
    file-backed or payload-backed immutable artifact, referenced by hash/artifact id.

  review verdict:
    structured review result only after validator accepts the artifact.

  blocked disposition:
    structured status/stop reason/next action, not a fabricated review artifact.

  accepted project memory:
    only through existing closeout/harvest lifecycle.
  ```

- If current storage surfaces cannot represent a required launch-evidence field
  without weakening exact identity, either:
  - use the nearest existing structured evidence/artifact-reference mechanism
    without weakening exact identity; or
  - stop and report the storage gap as a dependency for Phase 23.8.6D instead
    of inventing an ad hoc storage layer.
- Use deterministic failure classifications:

  ```text
  REVIEW_COMPLETED_ARTIFACT_PRESENT
  REVIEW_COMPLETED_ARTIFACT_MISSING
  REVIEW_PROCESS_TIMEOUT
  REVIEW_PROCESS_STALE_NO_OUTPUT
  REVIEW_OUTPUT_PATH_INVALID
  REVIEW_SANDBOX_WRITE_BLOCKED
  REVIEW_COMMAND_FAILED
  REVIEW_MODEL_OR_AUTH_FAILURE
  REVIEW_UNKNOWN_RUNTIME_FAILURE
  REVIEW_ARTIFACT_INVALID
  REVIEW_ARTIFACT_VERDICT_UNRECOGNIZED
  REVIEW_ARTIFACT_CONTRACT_MISMATCH
  REVIEW_RUN_ID_AMBIGUOUS
  REVIEW_RUN_INSTANCE_NOT_FOUND
  REVIEW_PERSISTENCE_GAP
  ```

- Classify usage-limit, quota, auth, or model-access failures as
  `REVIEW_MODEL_OR_AUTH_FAILURE` when child output clearly indicates that
  class.
- When supervised review launch fails and no valid review artifact exists:
  - record structured launch-attempt evidence with exact run identity;
  - project operator status as `BLOCKED` or the closest canonical
    review-launch blocked state;
  - keep closeout forbidden;
  - keep harvest forbidden;
  - expose the exact next valid action; and
  - do not use `RUN_QUARANTINED` unless payload quarantine is actually
    present.
- Require missing or invalid review artifacts to block progression before
  verification review.
- Require valid `implementation-review` `FIX_REQUIRED` to route to fix-pass.
- Allow valid `implementation-review` `PASS` to advance only through the
  existing lifecycle rules.
- Validate before spawning a child process:
  - the procedure is review-launchable in this phase;
  - `adapter_id` is `codex_cli`;
  - the display `run_id` resolves to exactly one active exact run identity;
  - `run_instance_id` is available before durable evidence mutation;
  - the request path exists and stays inside the worktree;
  - the output path stays inside an allowed run-local area and is not a source
    file;
  - sandbox mode is read-only;
  - the launch risk class is `process_execution` and side effects remain limited
    to the allowlisted child process plus run-local evidence/artifact writes;
  - the launch profile exists;
  - timeout and stale values are positive and bounded; and
  - the evidence persistence target can preserve exact identity and artifact
    refs.
- Require `--dry-run` to resolve the launch profile, resolve exact run
  identity, validate paths, and construct the launch plan without spawning the
  child process, writing the expected review artifact, or mutating lifecycle.
- Cover the runtime with deterministic fake-child tests rather than live Codex
  CLI:
  - valid artifact produced;
  - process exits without artifact;
  - usage/auth/model failure with no artifact;
  - timeout;
  - stale output;
  - invalid output path;
  - invalid artifact verdict;
  - invalid artifact section contract;
  - stdout contains a complete valid review artifact while the output file is
    absent;
  - JSON/final-message stream contains a complete valid review artifact when
    local support exists;
  - blocker note does not validate as a review artifact;
  - review request does not validate as a review artifact;
  - `implementation-review` `PASS` routes correctly;
  - `implementation-review` `FIX_REQUIRED` routes to fix-pass, not
    verification;
  - `plan-review` parsing remains strict;
  - dry-run does not launch a child process;
  - display `run_id` reuse does not mix evidence across exact run instances;
  - launch-attempt evidence includes `run_instance_id` or fails closed;
  - artifact refs and payload refs stay tied to exact run identity when
    persisted; and
  - generic `run_id`-only project queries are not used as authoritative exact
    history.

## Non-goals

- No Phase 23.8.6B content fixes.
- No verification command rationalization.
- No procedure artifact payload storage rewrite.
- No DB migration.
- No generic project-memory migration.
- No Phase 23.8.6B2 implementation.
- No Phase 23.8.6C implementation.
- No Phase 23.8.6D implementation.
- No StagePacket execution.
- No runner execution.
- No broad adapter framework.
- No Claude, API, plugin, or MCP adapters.
- No autonomous loop.
- No auto-improvement loop.
- No closeout/harvest rewrite.
- No run-local markdown artifact factory.
- No Git tracking of run-local launch attempts.

## Acceptance commands

```bash
npm run build
npm test
git diff --check
```

## Acceptance behavior

- `plan-review` and `implementation-review` can launch only through the
  supervised review-launch surface with a `codex_cli` launch profile.
- A display `run_id` cannot authorize launch, evidence mutation, or lifecycle
  progression unless it resolves to exact run identity first.
- A valid review artifact is accepted only from the expected artifact file or
  from unchanged validated captured output persisted as the artifact.
- Missing, invalid, stale, or blocked launches never fabricate accepted review
  artifacts.
- Launch-attempt evidence records exact identity, provenance, failure
  classification, and the next valid action.
- Every CLI path returns a structured launch observation with bounded output and
  safe next actions rather than an untyped stdout dump.
- Permission enforcement blocks source writes, unsupported side effects,
  automatic relaunch loops, or launch attempts without read-only sandboxing.
- `implementation-review` `FIX_REQUIRED` routes to fix-pass and
  `implementation-review` `PASS` may advance only through the existing
  lifecycle.
- `--dry-run` validates launchability without child-process spawn, artifact
  writes, or lifecycle mutation.
- In an aligned B1 task/roadmap context, operator status must not collapse
  `23.8.6B1` into `23.8.6B` or emit `STALE_TASK_ROADMAP_CONFLICT` solely
  because of the split phase suffix.
- Deterministic fake-child tests prove the failure and provenance cases without
  relying on live Codex CLI access.

## Source/runtime boundary

This task contract is repo-owned implementation authority for the current B1
pass. Because `TASK.md` already points here, B1 is the active task authority
now, and the current diff may add the runtime/code surfaces required by this
task.

This phase may produce structured review-launch evidence and immutable artifact
references, but it must not absorb the broader storage-normalization work that
belongs in Phase 23.8.6D.

## Relationship to previous and next phases

- Follows Phase 23.8.6B so the checked-in manual review-launch discipline
  becomes a supervised runtime surface without reopening the B packaging pass.
- Precedes Phase 23.8.6B2, which rationalizes verification commands and may
  consume B1 blocked disposition or review-launch status only as upstream
  evidence.
- Precedes Phase 23.8.6C, which may display or consume B1 blocked disposition
  and next valid action but must not implement another review launcher.
- Leaves Phase 23.8.6D as the main future phase for procedure artifact payload
  storage, worktree retention, exact-instance indexing, and storage
  normalization.
- Prepares Phase 23.8.7, Phase 23.9, Phase 30, and Phase 31 to consume
  exact-identity review-launch evidence without treating B1 as the first packet
  engine, proof layer, experimentation loop, or general runner adapter.

## Final report expectations

The implementation report for this phase must state:

- which review procedures and launch profiles were implemented;
- how display `run_id` resolution reaches `run_instance_id` and
  `project_run_id` before durable evidence mutation;
- which artifact provenance path was used in each acceptance case;
- which failure classifications were exercised;
- how split phase-id/operator roadmap resolution stopped mapping
  `23.8.6B1` back to `23.8.6B`;
- the structured launch observation shape returned to operators;
- the enforced `process_execution` risk/permission boundary;
- how blocked disposition and next valid action were projected into operator
  state;
- verification results; and
- any remaining exact-identity storage gaps explicitly deferred to
  Phase 23.8.6D.
