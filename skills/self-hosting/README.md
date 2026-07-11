# Self-hosting Procedures

This directory is the canonical product-source location for Phase 23.6
self-hosting procedures.

## Source-of-truth rule

```text
Canonical source:
  skills/self-hosting/**

Optional Codex discovery or sync target:
  .agents/skills/**

Optional user-level install target:
  $HOME/.agents/skills/**
```

Rules:

- `skills/self-hosting/**` is the authority source in this repo.
- `skills/self-hosting/procedure-registry.json` is the checked-in derived
  registry over that canonical source. It must point back to the canonical
  files and must not replace them.
- `.agents/**` remains local or generated state in this repo unless a future
  reviewed task changes that boundary explicitly.
- Generated or local discovery targets must not become hidden source-of-truth.
- Prompt wrappers are mandatory derived invocation helpers and not authority.
  Each procedure must have exactly one wrapper at
  `prompts/self-hosting/<procedure-id>.md`.
- Checked-in self-hosting procedure wrappers are separate from generated product
  prompts created by `node bin/ch prompt ...`.
- These procedure files are repo-owned operating artifacts and are intentionally
  outside the current packaged runtime allowlist.

## Current review bindings and future routing

Current self-hosting procedure runs may record advisory manual model/reasoning
guidance without turning it into runtime routing.

- task, planning, and builder routes are provider-neutral policy classes;
  concrete model names remain provisional bindings and must not become
  lifecycle authority;
- implementation or builder passes use a profile matched to typed risk and
  complexity while remaining separate from the reviewer profile;
- Review-family procedures such as `plan-review`, `implementation-review`,
  `fix-pass-review`, `verification-review`, `delivery-facts-review`,
  `phase-closeout-review`, `architecture-review`, `db-storage-review`,
  `docs-consistency-review`, and `harness-audit` should use a separate reviewer
  session and a different reviewer model/profile from the planning or builder
  pass they are checking; the current supervised `plan-review` binding is
  `gpt-5.6-sol` with `high` reasoning and `implementation-review` is
  `gpt-5.6-terra` with `high` reasoning;
- docs-consistency/mechanical semantic review uses Terra Medium;
- `xhigh`, `max`, and `ultra` are escalation-only with separately recorded
  reasons; Phase 31 retains generalized routing ownership.

This guidance is operator advisory only. It must not be implemented as current
provider/model routing, runtime profile selection, or self-approval logic.
Independent review uses a fresh packet or packet plus read-only retrieval;
transcript, hidden reasoning, cache state, and forked sessions are not review
authority. Phase 31 remains the first general runtime binding/execution owner.

## Required procedures

- `feature-decomposition`
- `task-intake`
- `task-prompt-writer`
- `draft-plan`
- `plan-review`
- `plan-amend`
- `architecture-review`
- `db-storage-review`
- `implementation-review`
- `fix-pass-review`
- `verification-review`
- `delivery-facts-review`
- `phase-closeout-review`
- `docs-consistency-review`
- `harness-audit`
