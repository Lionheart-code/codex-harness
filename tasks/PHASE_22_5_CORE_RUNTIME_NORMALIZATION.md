# Phase 22.5 — Core Runtime Normalization and self-hosted development path

## Status

Planned. Blocked until Phase 22 release/package/CI baseline is closed and verified.

## Review status

Reviewed v2. This task is ready to become the next active phase after Phase 22 closeout. The main correction is to keep Phase 22.5 as one phase with staged implementation rather than splitting it into several new phase numbers.

## Read before editing

- `TASK.md`
- `docs/POST_PHASE_22_HARNESS_ARCHITECTURE_AND_ROADMAP.md`, if present
- `docs/MASTER_ARCHITECTURE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OPERATIONS_PLAN.md`
- `docs/PHASE_ACCEPTANCE.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/HARNESS_EVALS_AND_REGRESSION.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `src/core/**`
- `src/cli/**`
- `schemas/**`
- `tests/acceptance/**`
- `package.json`
- `.github/workflows/ci.yml`


This phase is the first post-Phase-22 implementation phase. It must normalize the current CLI, phase, check, review, report, and closeout behavior into a shared runtime model before Memory/Evidence, reports, agent access, or domain packs are implemented.

## Goal

Create the minimal domain-neutral runtime backbone for `codex-harness` so that future work can be represented as structured runs, steps, evidence, findings, decisions, reviews, verification results, and closeout receipts.

The goal is not to rewrite the CLI. The goal is to extract a common lifecycle from existing commands and phase discipline so later phases do not attach Memory/Evidence to unrelated command outputs.

## Why this phase exists

Phase 22 makes the project safer to package, install, and verify. It does not create a runtime model.

Without Phase 22.5, Phase 23 Memory/Evidence would likely become a pasted-on store over logs, reports, and ad hoc CLI output. This phase creates the common vocabulary that later Memory, reports, packets, agent access, and packs will use.

## Scope

### Stage A — Runtime contracts

Introduce or formalize minimal runtime primitives:

- `Run`
- `PhaseRun`
- `Step`
- `ArtifactRef`
- `EvidenceRef`
- `Finding`
- `Decision`
- `Approval`
- `CommandResult`
- `VerificationResult`
- `ReviewResult`
- `CloseoutReceipt`
- `RepositoryRef`
- `ChangeSet`
- `CIRunRef`
- `RemoteCheckResult`
- `RemoteGateStatus`
- `RequiredGate`

These contracts should be small, serializable, versionable, and domain-neutral. Remote CI concepts must remain provider-neutral: GitHub Actions is one provider, not a core-only assumption.

Optional Stage A/B candidates, only if the implementation clearly needs them:

- `PolicyDecision`
- `ToolCall`
- `AdapterInvocation`

Do not force these optional primitives into the first implementation if they would add unused abstraction.

### Stage B — Lifecycle service

Add a shared lifecycle service or equivalent core module that can:

- start a run;
- record a phase run;
- record a step;
- record a command result;
- record verification result;
- record review result;
- record finding;
- record approval or decision;
- create a closeout receipt;
- expose stable read/status output for the current run.

The service must prevent CLI commands from duplicating lifecycle logic independently.

### Stage C — Product/runtime/export boundary

Document and encode the boundary between:

- committed product source;
- local/private runtime state;
- future portable sanitized exports.

Expected posture:

```text
Product source is committed.
Runtime state is local/private and ignored.
Portable exports are explicit, redacted, versioned, and importable later.
Only approved sanitized artifacts may be promoted into the product repo.
```

The phase may prepare directory conventions and safety checks, but it must not implement the full Memory Store or portable bundle format.

### Stage D — Remote CI gate skeleton

Add the minimum provider-neutral representation for remote verification gates. The phase may add explicit user-invoked helpers or receipts equivalent to:

```bash
node bin/ch run remote-status --provider github-actions --run <run-id> --dry-run
node bin/ch run wait-ci --provider github-actions --run <run-id> --dry-run
```

Exact command names may change. The required behavior is not autonomous watching. The required behavior is that a run/closeout can represent whether required remote checks are passing, failed, skipped, missing, or unknown.

Closeout must not be `READY` when a required remote gate is missing, failed, or unknown. A skipped/neutral state may be accepted only when explicitly marked as non-required and explained in the receipt.

No GitHub-only field may be required in the core contract. Provider-specific details must live in optional metadata, for example `provider: "github_actions"`, run URL, job id, check name, commit SHA, and step conclusions.

The remote gate skeleton must be user-invoked or run-scoped. It must not introduce a background watcher, daemon, autonomous polling loop, or model-token-consuming monitor. A later phase may improve automation, but Phase 22.5 must keep this as an explicit command/service boundary.

### Stage E — Minimal self-hosting skeleton

Add the smallest useful self-hosted run path. Exact command names may change, but the behavior should be equivalent to:

```bash
node bin/ch run start --task TASK.md
node bin/ch run status
node bin/ch run verify
node bin/ch run closeout
```

The target is not full automation. The target is that `codex-harness` can begin to represent its own development lifecycle as a runtime run. This is self-hosting through the current source CLI/runtime, not a second persistent installed harness inside the repository.

## Expected behavior

- Key phase operations can be represented as runtime steps.
- Checks, reviews, and reports can produce findings or evidence references.
- Closeout creates a structured receipt.
- Runtime data remains domain-neutral.
- CLI commands reuse the shared lifecycle service rather than reimplementing phase flow.
- Product source, runtime state, and future exports are clearly separated.
- Self-hosted development can start from `TASK.md` or an active phase task file.
- Required remote CI/check status can be represented in a closeout receipt.
- Closeout refuses READY when required remote checks are missing, failed, or unknown.

## Non-goals

- no database;
- no durable Memory/Evidence Store;
- no SQLite projection;
- no MCP;
- no Direct API layer beyond internal code structure required by this phase;
- no domain packs;
- no autonomous agent;
- no self-editing/self-merge/self-release;
- no persistent second harness installed inside the `codex-harness` source repository;
- no background CI watcher or daemon;
- no web UI;
- no connector framework;
- no full CLI rewrite;
- no vector DB;
- no SaaS dependency.

## Product/runtime state policy

If local runtime directories are introduced, they must be private-by-default and excluded from package output and public source control.

Potential future layout, if needed:

```text
.harness/runs/
.harness/artifacts/
.harness/packets/
.harness/tmp/
.harness/proposals/drafts/
```

This phase may create only the pieces needed for the minimal runtime skeleton. It must not create a raw Memory database or imply that raw `.harness` sync is supported.

Self-hosting boundary:

```text
The codex-harness source repo may be operated as a target project by the current CLI/runtime.
The repo must not contain a persistent second installed harness.
Installed-copy harness instances are allowed only in temporary package/smoke tests.
Runtime state remains local, private, ignored, and excluded from npm package output.
```

## Stage boundaries

Implement this phase in internal stages, but keep one Phase 22.5 closeout:

1. **Stage A — contracts only.** Runtime types/schemas and tests. No command surface required beyond what tests need.
2. **Stage B — lifecycle service.** Shared service for run/step/verification/review/finding/decision/receipt recording.
3. **Stage C — boundary enforcement.** Product repo vs local runtime state vs future export policy encoded in docs/tests and package cleanliness checks.
4. **Stage D — remote gate skeleton.** Provider-neutral remote gate status in receipts; GitHub metadata only as optional provider metadata.
5. **Stage E — minimal self-hosting skeleton.** Small `ch run` surface proving the harness can represent its own work.

Do not merge stages by hiding large changes in one diff. Each stage should be reviewable and should preserve build/test/acceptance health.

## Implementation guardrails

- Prefer small serializable contracts over framework-style abstractions.
- Do not introduce a database, event ledger, SQLite projection, MCP server, domain pack loader, external connector, daemon, or background watcher.
- Do not install a persistent second copy of `codex-harness` inside its own repository.
- Runtime state, if created, must remain ignored/private and excluded from npm package output.
- GitHub Actions may be represented as provider metadata, but core contracts must remain provider-neutral.
- Closeout receipts must not claim `READY` when a required remote gate is missing, failed, or unknown.

## Suggested file areas

Likely implementation areas, subject to actual repo inspection:

- `src/core/runtime*` or `src/core/runtime/**`
- `src/core/phase*` / existing task or report modules if they already own lifecycle logic
- `src/cli/run*` or equivalent new run command module
- `schemas/**` for serialized runtime contracts, if the project uses JSON schemas for public/internal artifacts
- `tests/acceptance/phase22-5-core-runtime-normalization.test.mjs`
- docs listed in the read-before-editing section

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch run --help
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --dry-run
node bin/ch run verify --dry-run
node bin/ch run closeout --dry-run
node bin/ch run remote-status --dry-run
```

If exact command names differ, the implementation must provide equivalent local deterministic commands and document the difference.

## Acceptance behavior

- runtime primitive contracts exist and are covered by tests;
- runtime contracts are domain-neutral and do not contain GitHub-only concepts as required fields;
- lifecycle service can record a run, steps, verification result, review result, finding, decision, and closeout receipt;
- closeout receipt includes enough data to identify task, phase, verification status, review status, findings, decisions, repository/change metadata, and required remote gate status;
- CLI run commands use the shared lifecycle service;
- runtime state does not pollute the product repository;
- package allowlist still excludes runtime state;
- no Memory/Evidence Store, MCP, domain pack, autonomous agent, background watcher, or database functionality is introduced.

## Review focus

Reviewers must check especially for:

- accidental Phase 23 work;
- over-abstracted primitives that are not used;
- GitHub-specific fields leaking into core runtime contracts;
- local runtime state being committed or packed;
- CLI commands duplicating lifecycle logic;
- claims that hooks/watchers or runtime state provide sandboxing;
- self-hosting behavior that mutates project state without explicit human control;
- closeout receipts that ignore failed/missing required remote CI;
- a second persistent harness being installed into the source repository.

## Suggested implementation order

1. Inspect current `src/core`, `src/cli`, `schemas`, and acceptance tests.
2. Add runtime contract types and schemas.
3. Add lifecycle service with deterministic local behavior.
4. Add minimal `ch run` command surface.
5. Add remote gate representation and closeout gating.
6. Add closeout receipt generation.
7. Add tests for contract shape, lifecycle behavior, remote gate handling, and repository cleanliness.
8. Update docs to explain runtime normalization, self-hosting boundary, and non-goals.

## Required return from implementation agent

When this task is implemented, the agent must return:

- files changed;
- scope summary;
- explicit confirmation that non-goals were not implemented;
- verification commands and results;
- review/fix-pass status if applicable;
- remaining debt or open questions;
- final git status.

## Completion criteria

Phase 22.5 is complete only when the project can represent its own work as a structured run and can represent required remote CI/check gate status in closeout, without adding Memory/Evidence storage, MCP, domain packs, background watchers, or autonomous self-improvement.
