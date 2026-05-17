# Phase 1 — TypeScript CLI skeleton

## Goal

Create the initial TypeScript CLI skeleton for `codex-harness`.

This phase proves that the repository has a working CLI foundation.

## Files to create

- `package.json`
- `package-lock.json`
- `.gitignore`
- `tsconfig.json`
- `bin/ch`
- `src/cli/index.ts`
- `src/cli/doctor.ts`
- `src/cli/install.ts`
- `src/cli/init.ts`
- `src/core/paths.ts`
- `src/core/git.ts`
- `src/core/logger.ts`
- `README.md`

## Commands required

- `ch --help`
- `ch doctor`
- `ch install --dry-run`
- `ch init "task title" --dry-run`

Note: in Phase 1, `ch` means the local CLI entrypoint invoked as `node bin/ch`. A package `bin` mapping for `ch` must exist, but global installation is not required in this phase.

## Non-goals

Do not implement:

- real install without `--dry-run`;
- worktrees;
- hooks;
- `codex exec`;
- review runner;
- check runner;
- report generator;
- database;
- dashboard;
- subagents;
- proof-loop compatibility;
- playground repository.

## Acceptance commands

```bash
npm install
npm run build
node bin/ch --help
node bin/ch doctor
before="$(git status --short)"
node bin/ch install --dry-run
node bin/ch init "test task" --dry-run
after="$(git status --short)"
test "$before" = "$after"
```

## Acceptance behavior

- dry-run commands do not modify files;
- `package.json` contains a `bin` mapping for `ch` and a `build` script;
- `.gitignore` excludes `node_modules/` and build output;
- Phase 1 does not create `.harness/`, `.codex/`, `.agents/`, worktrees, task folders, reports, review files, or check logs;
- `doctor` reports whether current directory is inside a git repository;
- `init --dry-run` prints generated task id and target paths;
- code is simple and has minimal dependencies.
