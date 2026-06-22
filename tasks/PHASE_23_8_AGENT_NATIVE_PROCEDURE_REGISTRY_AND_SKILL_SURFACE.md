# Phase 23.8 - Agent-native Procedure Registry and Skill Surface

## Purpose

Materialize and validate the existing Phase 23.6 self-hosting procedure surface
so agents and operator surfaces can discover and use procedures consistently.

This phase includes the bounded source-of-truth and procedure-surface alignment
from the pre-registry patch, then materializes the checked-in registry and the
minimal operator/runtime consumption needed by the approved plan.

This phase extends `skills/self-hosting/**`; it does not replace it.

## Core rules

`skills/self-hosting/**` remains canonical repository source unless a separate
reviewed boundary change proves otherwise.

`.agents/skills/**`, `$HOME/.agents/skills/**`, or other host-specific
locations are generated/export/discovery targets only.

External OpenAI/Codex docs, GitHub prior-art repos, and user research
documents are advisory inputs only. Repo tasks, docs, tests, and verified
runtime behavior remain the project authority.

Phase 23.8 records procedure metadata, source trace, and registry-backed
operator lookup behavior. It does not execute roles, route models, or integrate
future access layers.

## Required work

- Preserve the completed bounded source-of-truth and procedure-surface patch as
  an explicit prerequisite for the registry implementation.
- Run Step R: a bounded prompt/review prior-art audit with exact source URLs,
  unavailable-source handling, and compact source trace.
- Record Step R output with:
  `source_url_or_doc`, `source_type`, `pattern_observed`,
  `accepted/adapted/rejected/deferred`, `target_file`, and `reason`.
- Build or validate a machine-readable index/registry of Phase 23.6 procedures
  after the bounded patch is reviewed.
- Preserve procedure IDs.
- Expose the registry-backed metadata needed for current operator lookup:
  required inputs, outputs, allowed outcome states, blockers, evidence
  requirements, source trace, and packet dependencies. Document
  actor/permission/risk metadata as the broader registry target for a later
  reviewed schema expansion before runner or execution surfaces consume it.
- Tighten the canonical `draft-plan`, `plan-review`, and `plan-amend`
  procedure surfaces only where needed so the approved workflow semantics are
  durable in repo-owned contracts rather than chat-local prompts.
- Make `plan-review` preserve a durable operator-readable decision record in
  addition to a human-readable review report.
- Make `plan-amend` yield one effective amended plan rather than leaving
  implementation to merge amendment history manually.
- Add validation that generated/discovery targets are not treated as canonical
  source.
- Add review-surface discovery, bounded fix-pass, source trace, skill risk
  vetting, and closeout freshness requirements to the authoritative surfaces
  that govern them.
- Keep CLI as the current baseline access surface.
- Record App Server only as a future candidate to evaluate against CLI for
  speed, reliability, auth, approvals, event visibility, operational
  simplicity, and cost/access fit.
- Keep provider/host adapters deferred to Phase 25.

## Step R — bounded prompt/review prior-art audit

Required advisory sources:

- OpenAI Harness Engineering:
  `https://openai.com/index/harness-engineering/`
- OpenAI Unlocking the Codex Harness / App Server:
  `https://openai.com/index/unlocking-the-codex-harness/`
- Codex Skills:
  `https://developers.openai.com/codex/skills`
- Codex AGENTS.md:
  `https://developers.openai.com/codex/guides/agents-md`
- Codex CLI:
  `https://developers.openai.com/codex/cli`
- Codex Subagents:
  `https://developers.openai.com/codex/subagents`
- Codex Hooks:
  `https://developers.openai.com/codex/hooks`
- `openai/codex` AGENTS.md:
  `https://github.com/openai/codex/blob/main/AGENTS.md`
- `openai/codex` code-review skill:
  `https://github.com/openai/codex/blob/main/.codex/skills/code-review/SKILL.md`
- `google-gemini/gemini-cli` skills best practices:
  `https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills-best-practices.md`
- `google-gemini/gemini-cli` review-and-fix command:
  `https://github.com/google-gemini/gemini-cli/blob/main/.gemini/commands/review-and-fix.toml`
- Anthropic Claude Code Action review-pr command:
  `https://github.com/anthropics/claude-code-action/blob/main/.claude/commands/review-pr.md`
- Aider architect prompts:
  `https://github.com/Aider-AI/aider/blob/main/aider/coders/architect_prompts.py`
- Aider base prompts:
  `https://github.com/Aider-AI/aider/blob/main/aider/coders/base_prompts.py`
- Cline system prompt architecture:
  `https://github.com/cline/cline/blob/main/apps/vscode/src/core/prompts/system-prompt/README.md`
- Continue test coverage agent:
  `https://github.com/continuedev/continue/blob/main/.continue/agents/test-coverage.md`
- OpenHands AGENTS.md:
  `https://github.com/OpenHands/OpenHands/blob/main/AGENTS.md`
- SWE-agent 0.7 prompt/config:
  `https://github.com/SWE-agent/SWE-agent/blob/main/config/sweagent_0_7/07.yaml`
- User research docs:
  `AI Agentic Software Engineering Research.docx`
- User research docs:
  `AI Agent Frameworks and Workflows.docx`

If a URL is unavailable or moved, record that explicitly and do not infer the
pattern from memory. Do not block the bounded patch if the official
OpenAI/Codex sources and a representative subset of prompt/review repos were
inspected.

Accepted/adapted patterns:

- specialized read-only review skills;
- compact/progressive-disclosure `SKILL.md` structure;
- bounded/consolidated fix-pass;
- skill risk vetting;
- App Server versus CLI trade-off as a future access-layer question;
- local-first/domain-pack storage separation;
- evidence provenance.

Rejected/deferred patterns:

- Responses API fallback as default path;
- API-key execution as default path;
- autonomous merge or approval;
- parallel write-capable agents;
- wholesale third-party skill imports;
- full autonomous execution loops before later phases.

## Registry metadata target

Document the minimum required metadata target over existing Phase 23.6
procedures:

```text
procedure_id
canonical_skill_path
authority_level
actor_mode
permission_mode
risk_class
side_effect_class
allowed_stages
required_inputs
required_outputs
required_evidence
blocking_conditions
forbidden_actions
requires_human_approval
review_tier_applicability
required_controls
non_authoritative_surfaces
output_format_path
source_notes_path
```

## Non-goals

- Do not build a broad plugin framework.
- Do not import community skill packs.
- Do not move canonical source out of `skills/self-hosting/**`.
- Do not implement role execution.
- Do not implement provider/model review routing.
- Do not implement App Server integration.
- Do not implement MCP adapter work.
- Do not implement external model API execution.
- Do not implement domain packs.
- Do not introduce a new procedure taxonomy or new procedure IDs.
- Do not make API-key billing the default path.
- Do not introduce hidden paid token-metered execution.
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
node --test tests/acceptance/phase23-6-self-hosting-skills-plan-review-bootstrap.test.mjs tests/acceptance/self-hosting-review-policy-hardening.test.mjs tests/acceptance/phase23-7-operator-status.test.mjs tests/acceptance/phase23-8-bounded-source-of-truth-procedure-surface-patch.test.mjs tests/acceptance/phase23-8-agent-native-procedure-registry-and-skill-surface.test.mjs
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --operator --dry-run
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
- source-of-truth docs are aligned before registry implementation as the
  completed bounded pre-registry prerequisite, and the final phase state also
  materializes the checked-in registry.
- Step R source trace is recorded, and unavailable or moved sources are marked
  explicitly when encountered;
- current product self-hosting entrypoint is documented consistently as
  `TASK.md -> node bin/ch run start --task TASK.md -> node bin/ch run status --operator -> manual procedure execution`;
- installed target workflow remains distinct from the product self-hosting
  entrypoint;
- existing Phase 23.6 procedure IDs are preserved;
- registry metadata target is documented over existing Phase 23.6 procedures;
- generated/export/discovery targets are clearly non-authoritative;
- review-surface discovery is required;
- bounded fix-pass protocol is required;
- source trace and skill risk vetting are required;
- phase closeout requires Source-of-Truth Refresh / Documentation Garbage
  Collection;
- App Server appears only as an advisory future candidate;
- CLI remains the current baseline access surface;
- no parallel procedure taxonomy is introduced;
- no role execution, provider/model routing, App Server integration, MCP
  adapter work, external API execution, domain-pack implementation, or
  autonomous loop is introduced in Phase 23.8.
- No transactional ingestion commands, packet automation, proof generation,
  reports, access APIs, MCP, runners, hooks, provider adapters, or domain-pack
  behavior are implemented in Phase 23.8.
