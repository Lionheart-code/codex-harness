# Self-hosting Procedures

## Phase 23.9 automatic review surfaces

The exact automatic procedure set is `architecture-review`,
`db-storage-review`, `fix-pass-review`, `implementation-review`, and
`plan-review`. Architecture/DB are planning-bundle-only; plan review may be
bundled or standalone as allowed by lifecycle authority; implementation and
fix-pass are standalone fresh read-only launches. Fix-pass reviews an already
completed bounded fix and cannot execute repairs or start a loop.

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

## Phase F review policy sources

The registry is reconciled at load time with three separate source concepts:

- `procedure-execution-policy.json` covers all registered procedures and keeps
  deterministic completion subject to the same typed identity, evidence,
  independence, and approval rules;
- `review-route-policy.json` owns provider-neutral per-invocation route inputs,
  adjacent downgrade/reopen rules, budgets, and accepted policy identity;
- `codex-reference-binding.json` isolates current Codex CLI model/reasoning and
  capability facts from lifecycle authority.

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

Phase 23.8.6F enforces these sources only through the already existing
`plan-review` and `implementation-review` launch surfaces. It does not add an
automatic binding for any other procedure, a generic runner, or self-approval.
Independent review uses a fresh packet or packet plus read-only retrieval;
transcript, hidden reasoning, cache state, and forked sessions are not review
authority. Phase 31 remains the first general runtime binding/execution owner.

Every automatically launched reviewer receives a parent-owned attempt marker.
Nested `run launch-review` is refused as `REVIEW_RECURSION_FORBIDDEN` before a
second claim, process, or artifact wait. The environment is only a guardrail;
exact active claim ownership in Harness state remains authoritative.

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
