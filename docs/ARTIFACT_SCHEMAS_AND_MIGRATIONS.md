# Artifact Schemas and Migrations

## Purpose

`codex-harness` relies on durable machine-readable artifacts. Those artifacts must be versioned, validated, and migratable.

Without schema discipline, installed projects will drift and upgrades will become unsafe.

## Current contract

Phase 19 governs the machine-readable artifacts that already existed in earlier phases. Fresh writes for those governed artifacts now emit additive schema metadata while preserving the existing file names and paths.

The current schema version is `1`.

Governed artifacts are:

```text
.harness/install.json
.harness/tasks/<task-id>/state.json
.harness/tasks/<task-id>/verifier.json
.harness/tasks/<task-id>/review.json
.harness/tasks/<task-id>/agents/<run-id>/status.json
.harness/memory/debt/debt.jsonl
.harness/memory/decisions/<decision-id>.json
.harness/governance/proposals/<hep-id>.json
[agents.*] adapter profiles inside .harness/config.toml
```

Fresh governed writes include:

- `schema_version`;
- `producer_command`;
- existing artifact timestamps where the artifact already has a natural created/updated field.

Legacy unversioned artifacts remain readable and migratable, but they are never written anew.

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

## Product and installed locations

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

migrations/
  0001-legacy-unversioned-to-v1.json
```

Installed target repository:

```text
.harness/schemas/
```

Installed target repositories must not receive target-root `schemas/` or `migrations/` directories.

## Commands

```bash
node bin/ch schema --help
node bin/ch schema validate
node bin/ch schema migrate --dry-run
node bin/ch schema migrate
```

`schema validate` scans only governed artifacts that actually exist in the installed target repository, plus configured `[agents.*]` adapter profiles inside `.harness/config.toml`.

## Migration policy

Migrations are explicit and versioned under `migrations/`.

Rules:

- never mutate artifacts silently;
- use `node bin/ch upgrade --dry-run` for install-owned layer refreshes;
- use `node bin/ch schema migrate --dry-run` before runtime artifact rewrites;
- backup before migration;
- record migration result;
- support rollback where practical;
- fail closed on unknown schema versions.

`upgrade` remains limited to install-owned static content. Runtime artifact rewrites happen only under explicit `schema migrate`.

`schema migrate` must:

- create `.codex-harness.bak*` backups before rewriting governed files;
- skip absent optional runtime artifacts instead of creating them;
- keep governance proposal markdown as the primary human artifact while creating or refreshing the adjacent JSON sidecar when needed.

## Compatibility policy

A command must not assume latest schema.

It must either:

- support the installed schema version;
- migrate the artifact;
- fail with clear upgrade instructions.


## Forward rule

Phase 19 now defines the baseline schema and migration discipline for existing core artifacts.

Any later phase that creates a new machine-readable artifact must either:

- create or update its schema, or
- explicitly state why schema work is deferred.
