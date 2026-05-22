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
- `.agents/**` remains local or generated state in this repo unless a future
  reviewed task changes that boundary explicitly.
- Generated or local discovery targets must not become hidden source-of-truth.
- Prompt wrappers, if added later, are derived invocation helpers and not authority.
- These procedure files are repo-owned operating artifacts and are intentionally
  outside the current packaged runtime allowlist.

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
