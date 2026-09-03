# Phase Acceptance Rules

## Phase 23.9

Acceptance requires exact baseline binding, proof-record derivation and
survival, three-lens identity/coverage reconciliation, zero-owner normal
materialization, product-root install/upgrade zero-write rejection, safe
self-install reconciliation, standalone fresh read-only implementation/fix
review launches, focused suites, full verification, delivery facts, closeout,
and harvest evidence.

## Global acceptance rules

Every phase promoted to the current `TASK.md` must have:

- explicit scope;
- explicit non-goals;
- concrete files to create/change;
- concrete commands to run;
- clear fail conditions;
- scoped diff.

A phase is not ready to become the current `TASK.md` unless its task file contains both:

- `## Acceptance commands` with runnable shell commands;
- `## Acceptance behavior` with observable expected results.

Roadmap-level phases may remain less detailed, but before a phase is implemented, its task file must be tightened without adding new product scope.

## Current phase acceptance

The current phase acceptance lives in the task file referenced by `TASK.md`.

## Fail if

- implementation includes later-phase features;
- build/test commands fail;
- acceptance commands are missing;
- undocumented heavy dependency is introduced;
- dry-run writes files;
- user files can be overwritten without backup/confirmation.

## Phase 23 evidence acceptance additions

Phase 23 acceptance must also fail if:

- generated runtime state is written outside ignored `.harness/**` paths;
- `.harness/evidence/events.jsonl` is not append-only or cannot rebuild the projection;
- `.harness/evidence/projection.sqlite` is treated as source of truth or raw SQL is exposed through public CLI/API;
- `.harness/artifacts/sha256/<prefix>/<hash>` artifact refs cannot be integrity checked;
- evidence queries mix different `target_project_id`, `target_root`, `namespace`, or `run_id` scopes;
- local verification evidence is reused after tracked changes, changed/removed untracked files, changed command sets, different roots, different base commits, failed previous verification, unsupported schemas, or missing/corrupt artifacts;
- local verification reuse is treated as satisfying remote CI;
- non-dry-run `ch run closeout` is run during implementation verification.

During implementation verification, `node bin/ch run closeout --dry-run` may report `BLOCKED` before review or remote CI. That expected pre-review block is not an implementation failure.

## Phase 23.5 DB-first memory/lifecycle acceptance additions

Phase 23.5 acceptance must also fail if:

- `.harness/memory/project.sqlite` is missing or resolved only inside a disposable task worktree;
- active run writes go directly into accepted Project Memory instead of the run/staging DB;
- JSONL or loose artifacts remain the primary operational memory authority for new behavior;
- large decision-useful payloads bypass SQLite payload storage without explicit compatibility reasoning;
- harvest is not idempotent or cannot safely retry after a partial failure;
- `closed` is treated as equivalent to `harvested`;
- worktree deletion is allowed before harvest, explicit discard, or recorded manual override;
- delivery facts cannot be imported into staging state and used during closeout;
- hooks write accepted Project Memory records directly or are treated as the primary authority boundary;
- local `.codex/**` or `.agents/**` state becomes hidden product source-of-truth.

## Phase 23.6 self-hosting workflow acceptance additions

Phase 23.6 acceptance must also fail if:

- `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md` is missing;
- any required self-hosting procedure is missing;
- `feature-decomposition` is missing;
- any required procedure is missing `SKILL.md`, `references/source-notes.md`,
  or `references/output-format.md`;
- any required procedure is missing Codex-compatible `SKILL.md` metadata;
- any required procedure is missing source adaptation notes or stable output
  format markers;
- review intensity tiers are undocumented;
- Phase 23.5 lifecycle, delivery-facts, or harvest linkage is missing;
- Phase 24 packet linkage is missing;
- `.agents/**` or other generated discovery targets become hidden
  source-of-truth;
- hooks are treated as lifecycle or memory authority;
- implementation introduces later-phase CLI or runtime surface, including
  Phase 24 reports/packets, Phase 25 access layer behavior, Phase 26
  decomposer/planner execution, or Phase 27 domain-pack runtime behavior.

## Phase 23.8 source-of-truth/procedure-surface acceptance additions

Phase 23.8 acceptance must also fail if:

- the active Phase 23.8 task file does not contain both `## Acceptance commands`
  and `## Acceptance behavior`;
- Step R exact advisory sources or unavailable-source handling are not
  documented;
- the current product self-hosting entrypoint remains materially contradicted
  across authoritative task/docs/prompt/skill surfaces;
- review-surface discovery is missing from the review workflow or review prompt
  surfaces that govern it;
- bounded fix-pass protocol is missing from the workflow or fix-pass procedure
  surfaces that govern it;
- source trace or skill risk vetting is missing from the authoritative surfaces
  that claim to govern them;
- phase closeout does not require Source-of-Truth Refresh / Documentation
  Garbage Collection;
- registry metadata target is not documented over existing Phase 23.6
  procedure IDs;
- generated or discovery targets become canonical source-of-truth;
- App Server is presented as current-phase work or guaranteed Phase 25
  baseline;
- CLI is no longer described as the current baseline access surface;
- API-key billing becomes the default path or hidden token-metered execution is
  introduced in the documented access boundary;
- the implementation introduces registry or role execution outside an active
  task's explicit boundary, App Server integration, MCP adapter work, external
  API execution, domain-pack implementation, or autonomous loop behavior.

Phase 23.8.6F is an explicit narrow exception: it may enforce deterministic
context/route policy and the isolated Codex binding only for the existing
`plan-review` and `implementation-review` launch surfaces. Acceptance fails if
that exception creates another automatic procedure binding, generic runner,
daemon, self-approval, or provider-specific lifecycle authority.

Phase 23.9 introduced and proved the further narrow exception: it may add a
sequential, profile-validated planning-review cohort for the existing `plan-review`,
`architecture-review`, and `db-storage-review` procedures and an eligible
amended `plan-review`. Each remains a separate procedure artifact and verdict;
implementation review is excluded. The exception fails if it creates a general
runner, lifecycle stage, review category, parallel reviewer, implicit-default
resume, unvalidated profile continuation, source mutation during review, or
provider-specific lifecycle authority.

Active Phase 24A explicitly reuses that same bounded mechanism for its
prerequisite planning gate, with its required planning perspectives derived
from typed task/plan surface and risk authority through the existing review
policy. It does not create general runner semantics. Phase 24A.1 owns reusable
completion and generalization of self-hosting review selection, cohort state,
context reuse, and recovery.

Phase 24A.2 owns exact requirement/scenario/invariant/delivery/context/impact/
artifact/audit trace coverage. Phase 24A.3 owns the later rationalized
acceptance matrix for exact lifecycle epochs, implementation readiness,
delivery provenance, real bounded context reuse, semantic anti-retry behavior,
typed routing, and lifecycle-enforced audit obligations. A mandatory audit with
no executable registered procedure is a typed blocker, and successor activation
must remain closed until every required pre-successor audit has one exact
accepted disposition.

Phase F acceptance also fails if a launched reviewer can recursively create a
second reviewer claim/process/wait, if `REVIEW_RECURSION_FORBIDDEN` is not
state-validated before mutation, or if prompt-only instructions are treated as
the product guardrail.
