# Release and Supply-Chain Security

## Purpose

`codex-harness` is intended to become an installable developer tool.

Release security matters because operators will eventually install an npm
package and run its CLI in real repositories. Package contents, provenance,
dependency policy, rollback, and upgrade safety must be explicit and
machine-checkable.

## Core rule

The harness must be safe to install and upgrade, and the npm artifact must
contain exactly the runtime files needed by the CLI.

Phase 22 prepares this path without publishing a public package.

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

## Current package shape

Current package facts that Phase 22 must account for:

- `package.json` exposes `bin.ch = bin/ch`;
- `bin/ch` loads `../dist/cli/index.js`;
- `.gitignore` excludes `dist/`;
- `dist/**` must therefore be built and included in the packed npm artifact
  even though it is not tracked in git.

## Phase 22 release hardening contract

Phase 22 is split into three bounded substeps.

### Phase 22.0 — Package dry-run hardening

The implementation must add a deterministic package dry-run check.

The package contents policy must be explicit, preferably through
`package.json` `files`, or through an equivalent allowlist policy with a
machine-checking script.

The current implementation target should use a `package.json` `files`
allowlist and a separate machine-checking script so that the package surface is
explicit and the packed tarball is verified from npm's own file list.

The packed npm package must include:

- `package.json`;
- `README.md`;
- `bin/ch`;
- `dist/cli/index.js`;
- all `dist/**` runtime files required by the CLI;
- `schemas/**` when required by install, upgrade, schema validation, or runtime
  behavior.

Top-level `migrations/**` remains a product-source directory in the current
Phase 22 implementation because the installed CLI does not read it at runtime.
It must stay out of the npm package unless a later phase introduces a real
runtime dependency on those files.

The packed npm package must exclude:

- `.git/**`;
- `node_modules/**`;
- `.harness/**`;
- `.codex/**`;
- `.agents/**`;
- `TASK.md`;
- `tests/**` unless explicitly justified;
- `src/**` unless explicitly justified;
- logs;
- `.env`;
- local artifacts;
- generated tarballs;
- secrets or machine-local configuration.

The dry-run check must inspect `npm pack --dry-run --json` output and fail
closed when required files are absent or forbidden files are present.

The local release command for this phase is:

```bash
npm run release:dry-run
```

It must not publish anything.

Phase 22 must also prove that the tarball is actually installable.

The packed-install smoke check must:

- build the project;
- create the npm tarball;
- install that tarball into a temporary test project;
- verify that the packaged `bin/ch` exists and starts with
  `#!/usr/bin/env node`;
- verify that the packaged `bin/ch` is executable on non-Windows platforms, or
  at minimum is runnable through `node` from the installed tarball;
- run the installed CLI successfully with:
  - `ch --help`;
  - `ch doctor platform`;
  - `ch doctor commands`.

This smoke check must fail if `bin/ch`, `dist/cli/index.js`, or other required
runtime files are absent, or if the installed packaged CLI cannot start.

### Phase 22.1 — GitHub Actions CI / PR gates

Phase 22 must add a CI workflow under:

```text
.github/workflows/ci.yml
```

The workflow must run on `pull_request` and `push` to `main`.

The committed CI workflow should use a single verify job with a
`timeout-minutes: 45` guard unless a shorter bound is proven sufficient by the
implemented suite.

The workflow must run:

```bash
npm ci
npm run build
npm test
npm run test:acceptance
npm run release:dry-run
```

The CI workflow must not publish, must not use npm tokens, and must not require
long-lived secrets.

Default workflow permissions should be least privilege:

```yaml
permissions:
  contents: read
```

Publish/provenance permissions such as `id-token: write` must not be granted to
the CI gate. If a future publish job is introduced, elevated permissions must be
isolated to that job only.

Workflow scripts must avoid unsafe interpolation of untrusted pull request data
into shell commands.

Third-party actions should be pinned to full-length commit SHAs where
practical. If a version tag is used instead, the reason must be documented.

The current Phase 22 target should pin `actions/checkout` and
`actions/setup-node` to full-length SHAs in the committed workflow so the CI
gate does not depend on moving tags.

The docs must explain that this CI check should later become a required branch
protection check.

The acceptance runner itself must be reliable enough to serve as a CI and
release gate.

Phase 22 must tighten the runner so that:

- discovery fails closed when no acceptance tests are found;
- the full suite has bounded execution via a suite-level timeout or equivalent
  deterministic guard;
- failures and hangs produce clear diagnostics where practical;
- `npm test` and `npm run test:acceptance` exit deterministically;
- CI fails if acceptance checks do not complete successfully.

The runner hardening should stay minimal: keep the existing Node test-runner
wrapper, add a fail-closed empty-suite check, and add a suite-level timeout
instead of replacing the test framework.

### Phase 22.2 — Future trusted publishing and provenance preparation

Phase 22 must document future publishing, not activate it.

The future publishing plan must cover:

- npm trusted publishing through OIDC;
- GitHub-hosted runner requirement;
- Node/npm version requirements for trusted publishing and provenance;
- public `package.json` repository metadata requirements;
- `contents: read` for the release job;
- `id-token: write` only for the future publish/provenance job;
- no long-lived npm automation token policy;
- no cache in a future publish/provenance job when following npm trusted
  publishing guidance;
- provenance behavior;
- rollback and deprecation checklist;
- manual approval before any real public publish.

No automatic public publishing workflow is allowed in Phase 22.

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

Release preparation should keep these versions coherent, but Phase 22 does not
add auto-versioning.

## Dependency policy

- minimize runtime dependencies;
- keep development dependencies locked in `package-lock.json`;
- use `npm ci` in CI;
- audit dependencies before release;
- avoid large frameworks without clear need;
- avoid postinstall scripts unless absolutely required;
- do not add SaaS, API, MCP, Memory Store, dashboard, or domain-pack
  dependencies as part of release hardening.

## Upgrade safety

A release must not silently modify installed project layers.

Upgrade must continue to use:

```bash
ch upgrade --dry-run
ch upgrade
```

and must:

- show planned changes;
- backup local modifications;
- record upgrade results;
- fail clearly on incompatible versions;
- document rollback where possible.

## Release checklist

Before any future release:

- run `npm run build`;
- run `npm test`;
- run `npm run test:acceptance`;
- run `npm run release:dry-run`;
- inspect `npm pack --dry-run --json`;
- install the generated tarball into a temporary test project;
- run `ch --help`, `ch doctor platform`, and `ch doctor commands` from that
  installed tarball;
- verify package contents include required runtime files;
- verify package contents exclude forbidden local/runtime/development files;
- verify acceptance discovery does not silently pass on an empty suite;
- verify acceptance execution is bounded and fails clearly on hangs;
- confirm no npm token is present;
- confirm no public publish is triggered by CI;
- confirm provenance/trusted publishing notes are current;
- confirm rollback and deprecation notes are current;
- require manual approval for any real publish.

## Non-goals

- no npm publish in Phase 22;
- no real npm release workflow in Phase 22;
- no npm token;
- no auto-versioning;
- no semantic-release;
- no Release Please;
- no Memory Store;
- no MCP;
- no Direct API;
- no domain packs;
- no dashboard;
- no enterprise release platform;
- no post-22 architecture.
