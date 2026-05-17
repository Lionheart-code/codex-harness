# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 3 adds real task-state creation and a minimal task listing command.

## Phase 3 commands

Run the local CLI through `node bin/ch`:

```bash
node bin/ch --help
node bin/ch doctor
node bin/ch install
node bin/ch install --dry-run
node bin/ch status
node bin/ch init "test task"
node bin/ch init "test task" --dry-run
```

## Local setup

```bash
npm install
npm run build
```

## Phase 3 task-state behavior

- `install` creates `.harness/config.toml`, `.harness/tasks/`, `.harness/templates/`, and `.harness/install.json`.
- `install --dry-run` previews the same actions without writing files.
- `install` creates or updates a managed block in `AGENTS.md` and backs up the file before patching existing content.
- Re-running `install` is idempotent when the managed files already match the Phase 2 content.
- `init` creates `.harness/tasks/<task-id>/spec.md`, `acceptance.md`, and `state.json`.
- `init --dry-run` previews the task id and planned file paths without writing files.
- `status` lists the tasks recorded under `.harness/tasks/`.

## Phase 3 limitations

- No `.codex/` or `.agents/` files are created in this phase.
- Worktrees, task lifecycle transitions, hooks, adapters, checks, reports, and review flows are not implemented in this phase.
