# Product Repository vs Installed Project Layer

## Purpose

`codex-harness` has two related but different contexts:

1. the harness product repository;
2. target project repositories where the harness is installed.

These must not be confused.

## Repository types

### 1. Product repository

```text
codex-harness/
```

This repository contains:

- CLI source code;
- installer;
- templates;
- schemas;
- docs;
- skills/hook templates;
- adapters;
- migrations;
- tests;
- release notes.

Its purpose is to build and improve the harness itself.

### 2. Target project repository

```text
some-app/
```

This repository receives an installed harness layer:

```text
AGENTS.md
.harness/
```

Its purpose is to build the application/product using the harness.

Local operator/runtime state may also exist under:

```text
.codex/
.agents/
```

Those paths are local Codex/operator state by default, not product source-of-truth, unless a future reviewed task deliberately promotes some repo-level file there into versioned product behavior.

### 3. Playground repository

```text
codex-harness-playground/
```

This is a test target used for install/e2e/eval scenarios.

### 4. Workspace registry

Later, the harness may track installed projects in:

```text
~/.codex-harness/registry.json
```

This registry must not replace separate git repositories.

## Self-hosting

`codex-harness` should eventually use its own harness workflow to develop itself.

This is called self-hosting or dogfooding.

Self-hosting does not mean merging the product repository and target projects into one mega-repo.

Phase 22.5 adds a minimal self-hosted runtime path through:

```bash
node bin/ch run start --task TASK.md
node bin/ch run status
node bin/ch run verify
node bin/ch run closeout
node bin/ch run remote-status
```

This path uses the current source CLI/runtime. It must not install a persistent second harness inside the `codex-harness` product repository.

## Runtime State Boundary

Phase 22.5 separates three classes of state:

```text
Product source is committed.
Runtime state is local/private and ignored.
Portable exports are explicit, redacted, versioned, and importable later.
```

Runtime run state may be written under `.harness/runs/` when `ch run` is used without `--dry-run`. Phase 23 evidence state may also be written under `.harness/evidence/` and `.harness/artifacts/sha256/`. That state is private local state, not product source. The product repository must not commit `.harness/`, `.codex/`, `.agents/`, generated package tarballs, logs, caches, runtime databases, or temporary runtime output.

Phase 23.5 keeps the deterministic runtime path contract but changes memory authority:

```text
.harness/memory/project.sqlite             # accepted Project Memory authority
.harness/runs/<run-id>/staging.sqlite      # active run/worktree write target
.harness/runs/**                           # compatibility/runtime JSON and receipts
.harness/evidence/events.jsonl             # audit/export/replay/debug stream
.harness/evidence/projection.sqlite        # rebuildable audit/query projection
.harness/artifacts/sha256/<prefix>/<hash>  # compatibility/content-addressed artifacts
```

The memory backend is shared by harness self-hosting and ordinary project work, but every run and accepted record is still scoped by target project id, target root, namespace, run id, and task/phase where available. Hooks installed under `.codex/` are local guardrails only. They do not replace the typed lifecycle/storage boundary and must not be treated as the durable authority.

Future portable exports must be deliberate sanitized artifacts. Raw `.harness/` sync is not a supported product/source boundary.

## Governance split

### Product governance

In `codex-harness/`, governance asks:

- is the harness architecture still sound?
- which commands are flaky?
- which adapters are unsafe?
- which prompts are stale?
- which phases are too expensive?
- which releases caused regressions?

### Project governance

In a target project, governance asks:

- what did we build?
- what remains unfinished?
- what project debt exists?
- which project decisions are active?
- which agent runs informed this project?
- which tasks are blocked?

The mechanism is similar, but the subject is different.

## Versioning

The product repository has a harness version:

```text
codex-harness version: 0.1.0
```

Installed projects store installation metadata. The minimum required metadata must be present from the first real installer phase:

```json
{
  "harness_version": "0.1.0",
  "templates_version": "0.1.0",
  "installed_at": "...",
  "source": "codex-harness"
}
```

## Upgrade model

Target projects are upgraded through explicit commands:

```bash
ch upgrade --dry-run
ch upgrade
```

Rules:

- never overwrite local modifications silently;
- show diff before applying;
- backup changed files;
- record migration result;
- allow rollback where possible.

## Template drift

Installed files may diverge from canonical templates.

The harness must distinguish:

```text
canonical template
installed copy
local user modification
generated runtime artifact
```

Upgrade logic must avoid treating local project-specific changes as bugs.

## Cross-project view

The future registry may support:

```bash
ch projects
ch doctor --all
ch governance status --all
```

But each project remains an independent git repository with its own `.harness/` state.

## Non-goals

- no mega-repository containing all projects;
- no hidden global project state as source of truth;
- no automatic upgrade without dry-run/review;
- no shared `.harness/` folder across unrelated projects;
- no mixing product debt and project debt.

## Rule

The product repository improves the harness.

The installed project layer improves a project.

They may use the same concepts, but their state must remain separate.
