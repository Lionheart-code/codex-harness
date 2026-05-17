# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 2 adds the first real installer for the target `.harness/` layer.

## Phase 2 commands

Run the local CLI through `node bin/ch`:

```bash
node bin/ch --help
node bin/ch doctor
node bin/ch install
node bin/ch install --dry-run
node bin/ch init "test task" --dry-run
```

## Local setup

```bash
npm install
npm run build
```

## Phase 2 installer behavior

- `install` creates `.harness/config.toml`, `.harness/tasks/`, `.harness/templates/`, and `.harness/install.json`.
- `install --dry-run` previews the same actions without writing files.
- `install` creates or updates a managed block in `AGENTS.md` and backs up the file before patching existing content.
- Re-running `install` is idempotent when the managed files already match the Phase 2 content.

## Phase 2 limitations

- `init` is dry-run only.
- No `.codex/` or `.agents/` files are created in this phase.
- Worktrees, task lifecycle, hooks, adapters, checks, reports, and review flows are not implemented in this phase.
