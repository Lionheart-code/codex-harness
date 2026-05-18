# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 8 adds an agent run ledger for manual or agent-assisted work.

## Phase 8 commands

Run the local CLI through `node bin/ch`:

```bash
node bin/ch --help
node bin/ch agent record --role scout-tests --output sample.md
node bin/ch agent list
node bin/ch doctor
node bin/ch install
node bin/ch install --dry-run
node bin/ch status
node bin/ch init "test task"
node bin/ch init "test task" --dry-run
node bin/ch worktree
node bin/ch prompt plan
node bin/ch prompt work
node bin/ch prompt review
node bin/ch prompt scout --role tests
```

## Local setup

```bash
npm install
npm run build
```

## Phase 8 ledger behavior

- `agent record --role <role> --output <path>` creates an agent run directory under `.harness/tasks/<task-id>/agents/<run-id>/`.
- The ledger writes `status.json` with task id, run id, role, status, timestamps, prompt path, output path, and optional notes/profile metadata.
- Recording metadata does not execute any agent and does not create the output file itself.
- Recorded outputs remain raw and untrusted until reviewed.

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
- `prompt plan`, `prompt work`, and `prompt review` generate prompt files under `.harness/tasks/<task-id>/`.
- Generated prompt files are `prompt-plan.md`, `prompt-work.md`, and `prompt-review.md`.
- Prompts reference `spec.md`, `acceptance.md`, `state.json`, `branch.txt`, `worktree.txt`, and `AGENTS.md` by path instead of dumping large context.
- Prompt generation includes the concise implementation-discipline block.
- If the target repo `AGENTS.md` is missing the short implementation-discipline section, prompt generation appends it and creates a backup before patching an existing file.
- `prompt scout --role <role>` generates read-only scout prompts under `.harness/tasks/<task-id>/prompts/`.
- Supported scout roles are `repo-map`, `tests`, `docs`, `security`, and `architecture`.
- Scout findings must be written manually to `.harness/tasks/<task-id>/scouts/<role>.md`.
- Scout prompts are manual and read-only only; the harness does not execute external agents.
- Scout prompts include output path instructions and explicit no-edit/no-write rules.
- `agent list` reads the current task ledger entries and prints readable run summaries without requiring chat history.

## Phase 8 limitations

- No `.codex/` or `.agents/` files are created in this phase.
- No automatic Codex execution or `codex exec` is implemented in this phase.
- No external-agent execution, project memory/debt ledger, schema validation, review runners, reports, hooks, or adapters are implemented in this phase.
