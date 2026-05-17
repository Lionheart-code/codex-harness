# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 4 adds one branch and one worktree per task.

## Phase 4 commands

Run the local CLI through `node bin/ch`:

```bash
node bin/ch --help
node bin/ch doctor
node bin/ch install
node bin/ch install --dry-run
node bin/ch status
node bin/ch init "test task"
node bin/ch init "test task" --dry-run
node bin/ch worktree
```

## Local setup

```bash
npm install
npm run build
```

## Phase 4 worktree behavior

- `install` creates `.harness/config.toml`, `.harness/tasks/`, `.harness/templates/`, and `.harness/install.json`.
- `install --dry-run` previews the same actions without writing files.
- `install` creates or updates a managed block in `AGENTS.md` and backs up the file before patching existing content.
- Re-running `install` is idempotent when the managed files already match the Phase 2 content.
- `init` creates `.harness/tasks/<task-id>/spec.md`, `acceptance.md`, and `state.json`.
- `init --dry-run` previews the task id and planned file paths without writing files.
- `status` lists the tasks recorded under `.harness/tasks/`.
- `worktree` creates one branch and one git worktree for the current task.
- `worktree` writes `.harness/tasks/<task-id>/branch.txt` and `worktree.txt`, then updates `state.json`.
- Worktree root is configured in `.harness/config.toml` under `[worktree]`.

## Phase 4 limitations

- No `.codex/` or `.agents/` files are created in this phase.
- Setup commands are not executed in this phase.
- Hooks, adapters, checks, reports, and review flows are not implemented in this phase.
