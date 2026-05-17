# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 1 provides a minimal TypeScript CLI skeleton only.

## Phase 1 commands

Run the local CLI through `node bin/ch`:

```bash
node bin/ch --help
node bin/ch doctor
node bin/ch install --dry-run
node bin/ch init "test task" --dry-run
```

## Local setup

```bash
npm install
npm run build
```

## Phase 1 limitations

- `install` is dry-run only.
- `init` is dry-run only.
- No `.harness/`, `.codex/`, or `.agents/` files are created in this phase.
- Worktrees, hooks, checks, reports, and review flows are not implemented in this phase.
