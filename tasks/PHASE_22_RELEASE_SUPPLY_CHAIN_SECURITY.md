# Phase 22 — Release and supply-chain security

## Goal

Prepare `codex-harness` for a safe npm package release path without publishing
the package yet.

This phase must make release readiness machine-checkable. A future
implementation must not be allowed to satisfy Phase 22 by writing only a
checklist.

## Current packaging facts

- `package.json` exposes `bin.ch = bin/ch`.
- `bin/ch` loads `../dist/cli/index.js`.
- `.gitignore` excludes `dist/`.
- The npm package must therefore include built runtime output even though that
  output is not tracked in git.

## Scope

Implement Phase 22 as three bounded substeps:

- Phase 22.0 — package dry-run hardening.
- Phase 22.1 — GitHub Actions CI / PR gates.
- Phase 22.2 — future trusted publishing and provenance preparation.

Preserve all Phase 1-21 behavior. Keep the harness local-first,
solo-maintainable, and no-SaaS-by-default.

## Phase 22.0 — Package dry-run hardening

The implementation must:

- add or verify an explicit package contents policy;
- add a `package.json` `files` allowlist or an equivalent explicit packaging
  policy;
- add a package contents assertion script;
- add `npm run release:dry-run`;
- make `release:dry-run` run the deterministic package checks without
  publishing;
- inspect `npm pack --dry-run --json` output;
- add a packed-install smoke test for the generated tarball;
- fail if required runtime files are missing;
- fail if forbidden development, runtime, local, or secret-like files are
  present;
- avoid public publishing.

The packed npm package must include:

- `package.json`;
- `README.md`;
- `bin/ch`;
- `dist/cli/index.js`;
- all `dist/**` runtime files required by the CLI;
- `schemas/**` and `migrations/**` when required by install, upgrade, schema
  validation, or runtime behavior.

The packed npm package must exclude:

- `.git/**`;
- `node_modules/**`;
- `.harness/**`;
- `.codex/**`;
- `.agents/**`;
- `TASK.md`;
- `tests/**` unless explicitly justified by the implementation plan;
- `src/**` unless explicitly justified by the implementation plan;
- logs;
- `.env`;
- local artifacts;
- generated tarballs;
- secrets or machine-local configuration.

Acceptance must prove that `npm run release:dry-run` fails closed when:

- `bin/ch` is missing from the packed package;
- `dist/cli/index.js` is missing from the packed package;
- any required runtime file is missing;
- any forbidden path is present.

The packed-install smoke test must:

- build the project;
- create an npm tarball;
- install that tarball into a temporary test project;
- run the installed CLI from that temporary installation:
  - `ch --help`;
  - `ch doctor platform`;
  - `ch doctor commands`.

The packed-install smoke test must fail if:

- `bin/ch` is missing;
- `dist/cli/index.js` is missing;
- the installed CLI cannot start;
- required runtime files are absent from the package.

## Phase 22.1 — GitHub Actions CI / PR gates

The implementation must add `.github/workflows/ci.yml`.

The CI workflow must:

- run on `pull_request`;
- run on `push` to `main`;
- run `npm ci`;
- run `npm run build`;
- run `npm test`;
- run `npm run test:acceptance`;
- run `npm run release:dry-run`;
- avoid publishing;
- avoid npm tokens and long-lived secrets;
- use least privilege, preferably:

```yaml
permissions:
  contents: read
```

The CI workflow must avoid unsafe interpolation of untrusted pull request data
into shell commands.

Third-party GitHub Actions should be pinned to full-length commit SHAs where
practical. If a version tag is used instead, the tradeoff must be explicitly
documented.

Documentation must state how this CI should later become a required branch
protection check. PR/CI gating must remain separate from release publishing.

The acceptance runner used by `npm test` and `npm run test:acceptance` must be
suitable as a CI and release gate.

The future implementation must ensure:

- test discovery fails closed if no acceptance tests are found;
- the full acceptance suite has a bounded execution model through a
  suite-level timeout or equivalent deterministic guard;
- failures and hangs produce clear diagnostics where practical;
- `npm test` and `npm run test:acceptance` exit deterministically;
- CI fails if acceptance checks do not complete successfully.

## Phase 22.2 — Future trusted publishing and provenance preparation

The implementation must document, but not activate, a future npm publishing
path.

Documentation must cover:

- npm trusted publishing through OIDC;
- GitHub-hosted runner requirement;
- Node/npm version requirements for trusted publishing and provenance;
- `package.json` public repository metadata requirements;
- `id-token: write` only for a future publish/provenance job;
- `contents: read` for a future release job;
- no long-lived npm token policy;
- provenance behavior;
- rollback and deprecation checklist;
- manual approval requirement before any real public publish.

No automatic public publishing workflow may be activated in Phase 22.

## Required implementation surfaces

The future implementation may change only the files needed to satisfy this
phase, expected to include:

- `package.json`;
- package verification script(s);
- `scripts/run-acceptance.mjs`;
- `.github/workflows/ci.yml`;
- release documentation;
- acceptance tests for package contents, packed-install smoke behavior, release
  dry-run behavior, and acceptance-runner gate behavior.

Do not add release infrastructure unrelated to the Phase 22 contract.

## Non-goals

- no npm publish;
- no real release workflow that publishes to npm;
- no npm token;
- no Memory Store;
- no MCP;
- no Direct API;
- no domain packs;
- no dashboard;
- no enterprise release platform;
- no auto-versioning;
- no semantic-release;
- no Release Please;
- no Phase 23 or later architecture.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
npm run release:dry-run
npm pack --dry-run --json
```

## Acceptance behavior

- the packed package includes `bin/ch` and `dist/cli/index.js`;
- the packed package includes all runtime files required by the CLI;
- the packed package excludes forbidden development, runtime, local, and
  secret-like files;
- the generated npm tarball is installable into a temporary test project;
- the installed packaged CLI starts and succeeds for `ch --help`,
  `ch doctor platform`, and `ch doctor commands`;
- `release:dry-run` fails on missing required files;
- `release:dry-run` fails on forbidden files;
- test discovery fails closed when no acceptance tests are found;
- the acceptance suite has bounded execution with deterministic exit behavior;
- GitHub Actions CI runs build, test, acceptance, and package dry-run checks;
- CI does not publish;
- CI fails when acceptance checks fail or do not complete;
- no npm token is introduced;
- no public npm publish occurs;
- trusted publishing and provenance are documented but not activated as an
  automatic release.

## Architecture continuity

- keep product repository release artifacts separate from installed target
  project runtime state;
- do not create product-repo `.harness/`, `.codex/`, or `.agents/` state;
- keep package verification deterministic and local;
- do not require external services for local acceptance;
- keep release publishing as a future, explicit, human-approved action.
