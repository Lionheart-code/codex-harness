# Artifact Schemas and Migrations

## Purpose

`codex-harness` relies on durable machine-readable artifacts. Those artifacts must be versioned, validated, and migratable.

Without schema discipline, installed projects will drift and upgrades will become unsafe.

## Core rule

Every machine-readable harness artifact must have:

- schema version;
- producer command;
- creation/update timestamp;
- migration policy;
- validation command or validator;
- backward compatibility rule.

## Artifacts requiring schemas

```text
.harness/install.json
.harness/config.toml
.harness/tasks/<task-id>/state.json
.harness/tasks/<task-id>/verifier.json
.harness/tasks/<task-id>/review.json
.harness/tasks/<task-id>/agents/<run-id>/status.json
.harness/memory/debt/debt.jsonl
.harness/memory/decisions/<decision-id>.json
.harness/governance/proposals/<hep-id>.json
agent adapter profiles
```

## Schema location

Product repository:

```text
schemas/
  install.schema.json
  task-state.schema.json
  verifier.schema.json
  review.schema.json
  agent-run.schema.json
  debt.schema.json
  decision.schema.json
  adapter-profile.schema.json
  governance-proposal.schema.json
```

Installed project:

```text
.harness/schemas/
```

Installed schemas are a copy of the product schemas used when the layer was installed.

## Migration policy

Migrations must be explicit:

```text
migrations/
  0001-initial.ts
  0002-add-agent-run-ledger.ts
```

Rules:

- never mutate artifacts silently;
- run `ch upgrade --dry-run` before migration;
- backup before migration;
- record migration result;
- support rollback where practical;
- fail closed on unknown schema versions.

## Compatibility policy

A command must not assume latest schema.

It must either:

- support the installed schema version;
- migrate the artifact;
- fail with clear upgrade instructions.


## Acceptance principle

Until `tasks/PHASE_19_ARTIFACT_SCHEMAS_AND_MIGRATIONS.md` is the current task, schema and migration implementation is deferred by design.

Earlier phases may create the machine-readable artifacts listed in their task files, but they must not create `schemas/`, `migrations/`, or `.harness/schemas/` unless their task file is explicitly promoted and updated for that phase.

When Phase 19 is current, it must create or validate schemas for existing core artifacts and define explicit migration behavior.

After Phase 19, any phase that creates a new machine-readable artifact must either:

- create or update its schema, or
- explicitly state why schema work is deferred.
