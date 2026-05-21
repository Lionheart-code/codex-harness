# Phase 23.6 — Self-hosting Skills and Plan-Review Workflow Bootstrap

## Status

Planned. Starts only after Phase 23.5 DB-first Memory, Lifecycle Core, and Hooks Reconciliation is complete, reviewed, and accepted.

## Review status

Intermediate workflow phase introduced after the Phase 23.5 split.

This phase adds lightweight self-hosting skills/procedures and a repeatable plan-review workflow after the storage/lifecycle foundation is in place.

Important correction in this revision:

```text
Self-hosting procedures/prompts must have a source map.
They must not be invented ad hoc in chat.
Every procedure must document what it adopted, adapted, and rejected from internal sources, official Codex docs, and advisory/pattern sources.
```

## Read before editing

- `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`
- `tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md`
- `tasks/PHASE_26_DOMAIN_PACK_SKILLS_ARCHITECTURE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`, if present
- `docs/AGENT_ORCHESTRATION.md`
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`
- `docs/HUMAN_OPERATOR_MANUAL.md`
- `docs/PRODUCT_VS_PROJECT_LAYER.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- existing prompt/template/procedure paths
- existing hooks docs/templates
- existing `.agents/**`, `.codex/**`, or local Codex configuration paths, if any

If a listed file does not exist, use the closest actual file and document the difference.

## Goal

Make codex-harness development less manual by adding repo-owned self-hosting procedures and a basic plan-review workflow.

This phase teaches the project how to run its own work more consistently:

```text
task
→ task intake
→ prompt/task preparation
→ draft plan
→ independent plan review
→ plan amend if needed
→ human approval
→ run/implementation
→ implementation review
→ fix-pass if needed
→ verification review
→ delivery facts review
→ closeout/harvest
```

This is not full product pack architecture and not a provider-level agent access layer.

Phase 23 remains historical/bootstrap evidence. Phase 23.6 must not retroactively reinterpret old Phase 23 closeout state or require the historical Phase 23 run to satisfy future Phase 23.5/23.6 lifecycle rules.

## Why this phase exists

Phase 23.5 creates the storage and lifecycle foundation. Phase 23.6 uses that foundation to define repeatable working procedures for developing the harness itself.

Without this phase, future work continues to depend on long ad hoc chat prompts and manual memory transfer. With this phase, the project has explicit self-hosting procedures for planning, reviewing, implementing, verifying, delivering, and closing phases.

## Scope

### 0. Procedure and prompt source inventory

Before creating or changing any self-hosting procedure, create or update:

```text
docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md
```

The source map must explain where each procedure/prompt comes from and how it is adapted for codex-harness.

Required source classes:

```text
A. Internal authoritative sources
B. Official OpenAI Codex sources
C. External advisory sources
D. Community pattern sources
```

Required source map fields:

```text
procedure_id
purpose
primary internal sources
official Codex sources
external/advisory sources
community pattern sources
what was adopted
what was adapted
what was rejected
canonical source path
Codex discovery/install path
authority level
forbidden scope
related Phase 23.5 rules
related Phase 24 packet types
```

Rules:

- Internal repo task/docs/source files are binding for codex-harness behavior.
- Official OpenAI Codex docs are binding for Codex behavior.
- DenisSergeevitch/agents-best-practices may be used as advisory/audit input only.
- ECC, Anthropic skills, meta-harness, and other community packs are pattern sources only unless separately reviewed and accepted.
- Do not bulk-install community packs in this phase.
- Do not copy provider-specific behavior as Codex-native fact.

### 1. Source-of-truth location for self-hosting procedures

Define a versioned repo-owned source path for lightweight self-hosting skills/procedures.

Default canonical source path:

```text
skills/self-hosting/**
```

Important Codex discovery rule:

```text
Codex discovers repo/user skills from Codex-recognized skill locations such as .agents/skills/** and $HOME/.agents/skills/**.
Codex must not be assumed to auto-discover arbitrary skills/self-hosting/** without an explicit sync/install path.
```

Therefore, if `skills/self-hosting/**` is the canonical source, Phase 23.6 must document how those procedures are exposed to Codex when needed, for example through a generated/sync target or user-level install target:

```text
skills/self-hosting/**          # canonical repo source
.agents/skills/**              # optional generated/repo discovery target if boundary is approved
$HOME/.agents/skills/**        # optional user-level install target
```

Acceptable alternative if the repository already safely versions Codex-compatible repo skills:

```text
.agents/skills/**
```

However, if `.agents/skills/**` is generated/local/ignored by repo convention, it must not become source-of-truth. In the current repo boundary, `.agents/**` is treated as ignored/local installed state unless a separate reviewed boundary change says otherwise.

If the source path is not `.agents/skills/**`, define an explicit install/sync/documentation path so Codex can discover the procedures when needed.

Generated/local install targets must not become hidden source-of-truth.

Required distinction:

```text
Canonical source:
  skills/self-hosting/**

Optional Codex discovery/sync target:
  .agents/skills/**

User-level optional install target:
  $HOME/.agents/skills/**
```

### 2. Procedure contract

Every self-hosting procedure must follow a stable contract.

Required fields:

```text
procedure_id
title
purpose
when_to_use
required_inputs
preconditions
forbidden_scope
checklist/rubric
expected_output_format
blocker_conditions
evidence_to_record
phase_23_5_dependencies
phase_24_packet_dependencies
source_adaptation_notes
authority_level
```

`source_adaptation_notes` must include:

```text
internal_sources
official_codex_sources
external_advisory_sources
community_pattern_sources
adopted
adapted
rejected
```

If using Codex-compatible skill directories, each procedure must have a `SKILL.md` or equivalent repo-standard file.

Recommended structure:

```text
skills/self-hosting/<procedure-id>/SKILL.md
skills/self-hosting/<procedure-id>/references/source-notes.md
skills/self-hosting/<procedure-id>/references/output-format.md
```

Optional manual prompt wrappers:

```text
prompts/self-hosting/<procedure-id>.md
```

Prompt wrappers are derived invocation templates, not source-of-truth.

### 3. Required self-hosting procedures

Add lightweight procedure files for at least:

- `task-intake`;
- `task-prompt-writer`;
- `draft-plan`;
- `plan-review`;
- `plan-amend`;
- `architecture-review`;
- `db-storage-review`;
- `implementation-review`;
- `fix-pass-review`;
- `verification-review`;
- `delivery-facts-review`;
- `phase-closeout-review`;
- `docs-consistency-review`;
- `harness-audit`.

Each procedure must include:

- name/description metadata where applicable;
- when to use it;
- required inputs;
- forbidden scope;
- checklist/rubric;
- expected output format;
- failure/blocker conditions;
- interaction with Phase 23.5 memory/lifecycle/harvest rules;
- source adaptation notes from `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`.

### 4. Plan-review workflow bootstrap

Define a repeatable plan-review workflow for implementation tasks.

Minimum workflow:

1. Task selected.
2. `task-intake` normalizes task contract.
3. `task-prompt-writer` creates or checks the implementation prompt/task prompt.
4. `draft-plan` produces a plan without implementation.
5. Separate `plan-review` checks the plan.
6. If review fails, `plan-amend` amends the plan.
7. Human approves the final plan.
8. Implementation starts only after approval.
9. `implementation-review` checks diff and evidence.
10. `fix-pass-review` verifies fixes only address findings.
11. `verification-review` checks local verification evidence.
12. `delivery-facts-review` checks PR/CI/review/merge evidence import.
13. `phase-closeout-review` checks closeout/harvest readiness.
14. Closeout/harvest uses Phase 23.5 lifecycle.

The workflow must be explicit enough that an operator can run it without inventing a new prompt structure in chat.

### 5. Review intensity tiers

Define review intensity tiers for self-hosting work.

Required tiers:

- `standard` — ordinary small implementation tasks;
- `high` — storage, lifecycle, security, release, hooks, or architecture tasks;
- `extra-high` — high-risk architecture shifts, DB authority changes, deletion/retention rules, release/security boundary changes, or tasks likely to affect future phases.

The task/procedure may recommend stronger reviewer models for `high` and `extra-high`, but must not hardcode provider-specific behavior into core runtime.

Suggested mapping:

```text
standard:
  task-intake
  draft-plan
  plan-review
  implementation-review
  verification-review
  phase-closeout-review

high:
  architecture-review
  db-storage-review
  delivery-facts-review
  docs-consistency-review

extra-high:
  architecture-review + db-storage-review + delivery-facts-review + harness-audit
```

### 6. Harness self-hosting policy

Document how the harness should be used to develop itself after Phase 23.6.

Required policy points:

- task files remain the contract;
- plan mode is a planning/review gate, not runtime truth;
- approved plan is recorded as evidence;
- implementation cannot intentionally broaden scope beyond approved plan;
- review must compare implementation against task and approved plan;
- closeout must use delivery facts and harvest rules from Phase 23.5;
- generated/local skill install targets must not become hidden source-of-truth;
- prompts are invocation wrappers, while procedures/skills are the repo-owned operating contracts.

### 7. Optional hook-assisted reminders

Existing hooks may be used for reminders/checks around plan/run boundaries, but hooks remain supporting guardrails only.

Allowed hook-related work:

- remind when implementation starts without approved plan reference;
- remind when closeout is attempted without delivery facts;
- remind when worktree deletion is attempted before harvest/discard/manual override.

Not allowed:

- hooks as primary authority boundary;
- hooks silently editing workspace;
- hooks bypassing core lifecycle state;
- hooks writing accepted Project Memory DB records directly.

### 8. CLI/discovery boundary

Default implementation may be procedures plus operator documentation.

Add CLI wrappers only if they fit existing repo patterns and do not expand into Phase 25 agent access.

If CLI wrappers are not added, the implementation must still prove:

- procedure files are present;
- procedure source-of-truth is documented;
- Codex discovery/install path is documented;
- operator flow is explicit.

### 9. Phase 24 packet linkage

Document how Phase 24 packets should reference Phase 23.6 procedures.

Required mapping:

```text
planner packet:
  task-intake
  task-prompt-writer
  draft-plan

plan-review packet:
  plan-review
  plan-amend
  architecture-review if high/extra-high

implementation-review packet:
  implementation-review
  fix-pass-review
  verification-review

closeout-review packet:
  delivery-facts-review
  phase-closeout-review

DB/storage-review packet:
  db-storage-review

docs-consistency packet:
  docs-consistency-review
```

Rule:

```text
A Phase 24 packet must identify the procedure contract/rubric used to select and interpret evidence.
```

## Non-goals

- no DB-first memory implementation; that belongs to Phase 23.5;
- no reports/packets implementation; that belongs to Phase 24;
- no full agent access layer; that belongs to Phase 25;
- no full domain pack runtime; that belongs to Phase 26;
- no pack manifest;
- no pack loader;
- no compatibility resolver;
- no marketplace/plugin system;
- no MCP adapter;
- no vector search;
- no autonomous agent daemon;
- no provider-specific Codex API integration;
- no auto-commit;
- no auto-merge;
- no bulk installation of ECC, Anthropic packs, or community skill packs.

## CLI / operator surface

Exact command names can change. Equivalent behavior may be implemented either as CLI wrappers or documented operator procedure.

Possible CLI surface if it fits existing repo conventions:

```bash
node bin/ch self-hosting --help
node bin/ch plan --help
node bin/ch plan review --help
node bin/ch plan approve --help
node bin/ch skills list --self-hosting
```

If CLI is premature, provide operator documentation and procedure files only. Do not leave the workflow implicit.

## Suggested file areas

Subject to repo inspection:

- `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`;
- `.agents/skills/**`, `skills/self-hosting/**`, or repo-approved equivalent;
- `prompts/self-hosting/**` if manual invocation wrappers are used;
- prompt/procedure template paths;
- agent orchestration docs;
- governance docs;
- human operator manual;
- task/phase acceptance docs;
- optional CLI wrappers if existing CLI structure already supports them;
- tests or golden fixtures for procedure discovery/validation, if the repo has such patterns.

## Acceptance commands

Use repository-equivalent commands if names differ.

If CLI wrappers are implemented:

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch skills list --self-hosting
node bin/ch plan review --help
```

If implemented as procedures/docs only:

```bash
npm run build
npm test
npm run test:acceptance
```

plus a deterministic validation, script, fixture, or documented check proving required procedure files exist and are referenced from operator documentation.

## Acceptance behavior

- `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md` exists;
- self-hosting procedure source path is defined and versioned;
- official Codex skill discovery locations are stated accurately;
- Codex discovery/install/sync path is documented if source path is not `.agents/skills/**`;
- required self-hosting procedures exist;
- every procedure has source adaptation notes;
- every procedure states what was adopted, adapted, and rejected;
- procedures clearly distinguish Phase 23.6 lightweight skills from Phase 26 product pack architecture;
- prompts, if added, are wrappers derived from procedures and not source-of-truth;
- plan-review workflow is explicit;
- implementation starts only after approved plan in the documented workflow;
- procedure outputs have stable formats;
- procedures reference Phase 23.5 lifecycle/harvest/delivery facts rules;
- procedures map to Phase 24 packet types where relevant;
- review intensity tiers exist;
- generated/local install targets are not treated as hidden source-of-truth;
- hooks, if used, are reminders/guardrails only;
- no pack runtime is introduced;
- no agent access/provider integration is introduced;
- Phase 24 remains a separate later implementation phase.

## Review focus

Reviewers must check especially for:

- missing source map for procedure/prompt origins;
- procedure files becoming vague prose with no inputs/outputs/checklists;
- procedure files lacking source adaptation notes;
- Phase 26 pack architecture leaking into Phase 23.6;
- plan review being optional or undocumented;
- implementation flow starting before plan approval;
- hooks being treated as authority;
- `.agents/skills/**` becoming canonical source unintentionally if repo treats it as generated/local;
- missing Codex discovery/install path when source is outside `.agents/skills/**`;
- missing connection to Phase 23.5 harvest/closeout rules;
- missing linkage to Phase 24 planner/review/closeout packets.

## Suggested implementation order

1. Inspect existing prompt, procedure, skill, hook, and operator-doc conventions.
2. Create or update `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`.
3. Choose and document source-of-truth path for self-hosting procedures.
4. Add the procedure contract.
5. Add required procedure files.
6. Define stable output format for each procedure.
7. Add optional prompt wrappers derived from procedures if useful.
8. Define review intensity tiers.
9. Add plan-review workflow documentation.
10. Add Phase 24 packet linkage.
11. Add optional discovery/CLI wrappers only if they fit existing CLI structure.
12. Add tests/fixtures for procedure presence/discovery if the repo supports this.
13. Update minimal roadmap/operator docs.

## Required return from implementation agent

When this task is implemented, the agent must return:

- files changed;
- procedure source path chosen;
- Codex discovery/install path;
- source map path and summary;
- list of created self-hosting procedures;
- how each procedure traces to source material;
- how the plan-review workflow is invoked;
- review intensity tiers implemented/documented;
- Phase 24 packet linkage summary;
- explicit confirmation that Phase 26 pack runtime was not implemented;
- explicit confirmation that Phase 25 agent access was not implemented;
- verification commands and results;
- remaining debt or open questions;
- final git status.

## Completion criteria

Phase 23.6 is complete when codex-harness has repo-owned lightweight self-hosting procedures, an explicit plan-review workflow, review intensity tiers, a documented Codex discovery path, and a source map proving where each procedure/prompt came from and how it was adapted for codex-harness.
