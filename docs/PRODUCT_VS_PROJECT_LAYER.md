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
.codex/
.agents/
```

Its purpose is to build the application/product using the harness.

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
