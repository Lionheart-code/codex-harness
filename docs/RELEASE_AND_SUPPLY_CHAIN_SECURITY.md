# Release and Supply-Chain Security

## Purpose

`codex-harness` is intended to become an installable developer tool.

That means release security matters: package provenance, dependency minimization, trusted publishing, versioning, rollback, and upgrade safety must be part of the product plan.

## Core rule

The harness must be safe to install and upgrade.

## Release targets

Initial likely distribution:

```text
npm package
GitHub repository
manual local checkout
```

Future distribution may include:

```text
single binary
GitHub release artifacts
package manager integrations
```

## Versioning

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Version types:

```text
harness_version
templates_version
schema_version
migration_version
```

## npm release policy

When npm publishing is introduced:

- use npm trusted publishing where possible;
- avoid long-lived npm automation tokens;
- publish with provenance where supported;
- require CI-based release workflow;
- require clean git state;
- require changelog;
- require deterministic build;
- require package contents review.

## Dependency policy

- minimize runtime dependencies;
- prefer Node standard library for Phase 1;
- lock dependencies;
- audit dependencies before release;
- avoid installing large frameworks without clear need;
- avoid postinstall scripts unless absolutely required.

## Package contents policy

Before release, verify:

```bash
npm pack --dry-run
```

Review included files.

Do not publish:

- secrets;
- local logs;
- `.harness/tasks/`;
- playground artifacts;
- unreviewed generated files;
- test fixtures containing credentials.

## Upgrade safety

A release must not silently modify installed project layers.

Upgrade must use:

```bash
ch upgrade --dry-run
ch upgrade
```

and must:

- show planned changes;
- backup local modifications;
- record migration results;
- fail clearly on incompatible versions;
- document rollback where possible.

## Release checklist

Each release should include:

- version bump;
- changelog entry;
- tests passing;
- acceptance/eval summary;
- migration notes;
- known issues;
- rollback guidance.

## Non-goals

- no release automation in Phase 1;
- no publishing before basic lifecycle works;
- no trusted publishing setup required for local deterministic acceptance.
