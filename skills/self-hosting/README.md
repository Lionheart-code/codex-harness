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

## Manual model guidance

Current self-hosting procedure runs may record advisory manual model/reasoning
guidance without turning it into runtime routing.

- `task-intake` and `task-prompt-writer` may use lower-cost synthesis profiles
  such as `gpt-5.4-mini` when the procedure stays narrow and well-specified.
- `feature-decomposition` and `draft-plan` may use stronger planning profiles
  such as `gpt-5.4` with `extra high` reasoning.
- implementation or builder passes may use a stronger builder profile matched
  to task complexity, but they should remain separate from the reviewer
  profile used to judge the same work; `gpt-5.4` with `high` reasoning is the
  default manual implementation profile, with escalation to `extra high` only
  for harder cross-cutting work.
- Review-family procedures such as `plan-review`, `implementation-review`,
  `fix-pass-review`, `verification-review`, `delivery-facts-review`,
  `phase-closeout-review`, `architecture-review`, `db-storage-review`,
  `docs-consistency-review`, and `harness-audit` should use a separate reviewer
  session and a different reviewer model/profile from the planning or builder
  pass they are checking; `gpt-5.5` with `high` reasoning is the default
  reviewer profile, while `extra high` is escalation-only for ambiguous or
  disputed review situations.

This guidance is operator advisory only. It must not be implemented as current
provider/model routing, runtime profile selection, or self-approval logic.

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
