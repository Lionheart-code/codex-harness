# Phase 18 — Install/upgrade and project registry

## Goal

Implement safe lifecycle management between the `codex-harness` product repository and installed harness layers in target project repositories.

## Scope

- record install metadata in `.harness/install.json`;
- implement or refine:
  - `ch upgrade --dry-run`;
  - `ch upgrade`;
  - `ch doctor --all`;
  - optional `ch projects`;
- support template version comparison;
- detect local modifications to installed files;
- create backups before changes;
- record migration results;
- optionally maintain `~/.codex-harness/registry.json`.

## Non-goals

- no automatic upgrade without review;
- no global hidden source of truth;
- no mega-repository;
- no shared `.harness/` state across unrelated projects;
- no mixing product debt and project debt.

## Acceptance commands

```bash
npm run build
node bin/ch upgrade --help
node bin/ch doctor --help
```

## Acceptance behavior

- upgrade dry-run shows planned changes without writing;
- installed layer has version metadata;
- local project modifications are detected;
- backup/rollback behavior is documented;
- registry is optional and does not replace repo-local state.
