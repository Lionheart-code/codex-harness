# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 13 adds minimal Codex sidecar hooks on top of the Phase 12 report flow.

## Phase 13 commands

Run the local CLI through `node bin/ch`:

```bash
node bin/ch --help
node bin/ch agent record --role scout-tests --output sample.md
node bin/ch agent list
node bin/ch agent --help
node bin/ch agent prompt codex --role tests
node bin/ch agent run codex --role tests
node bin/ch capture
node bin/ch check
node bin/ch report
node bin/ch hooks --help
node bin/ch hooks install
node bin/ch memory status
node bin/ch debt add --title "test debt" --type technical --severity low --reason "test"
node bin/ch debt list
node bin/ch debt resolve --id DEBT-0001
node bin/ch decisions add --title "test decision" --reason "test"
node bin/ch decisions list
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

## Phase 13 hook behavior

- `hooks install` writes minimal Codex sidecar hook files under `.codex/`.
- Installed hook files are:
  - `.codex/hooks.json`
  - `.codex/hooks/user-prompt-submit.cjs`
  - `.codex/hooks/pre-tool-use.cjs`
  - `.codex/hooks/stop.cjs`
- `hooks install` also writes canonical hook templates under `.harness/templates/hooks/`.
- `UserPromptSubmit` documents and enforces missing task-context behavior by requiring exactly one task with a recorded worktree before coding work.
- `PreToolUse` documents and enforces a narrow dangerous-command guard for destructive shell/git patterns.
- `PreToolUse` blocks edit/write paths outside the current task worktree only where the hook payload exposes a path that can be checked.
- `Stop` prints a short reminder to run `node bin/ch check` and `node bin/ch report`.
- The hook layer is intentionally best-effort. It is a small sidecar guardrail, not a full policy engine or execution boundary.

## Phase 12 report behavior

- `agent record --role <role> --output <path>` creates an agent run directory under `.harness/tasks/<task-id>/agents/<run-id>/`.
- The ledger writes `status.json` with task id, run id, role, status, timestamps, prompt path, output path, and optional notes/profile metadata.
- Recording metadata does not execute any agent and does not create the output file itself.
- Recorded outputs remain raw and untrusted until reviewed.
- Agent output status parsing supports `raw`, `accepted`, `stale`, and `rejected`, while Phase 9 still records new runs as `raw` only.
- `agent prompt <agent> --role <role>` requires an adapter profile in `.harness/config.toml`, creates a run-local `prompt.md` and `command.json`, and prints the bounded command preview without executing the external agent.
- `agent run <agent> --role <role>` executes only configured `cli` adapters with `permission_mode = "read_only"`, captures stdout to `output.md`, captures stderr plus run summary to `log.txt`, and records command metadata in `status.json`.
- `capture` reads the active task worktree, captures `git status --porcelain --untracked-files=all`, writes `diff.patch`, and seeds `.harness/tasks/<task-id>/verifier.json` with durable capture state.
- `check` refreshes capture artifacts, runs `[checks].commands` from `.harness/config.toml`, writes `.harness/tasks/<task-id>/logs/check.log`, and records deterministic pass/fail results in `verifier.json`.
- `check` treats protected-path changes as failure. If `[checks].protected_paths` is unset, the defaults are `AGENTS.md` and `.harness/config.toml`.
- `diff.patch` contains tracked-file git diff output only. Untracked files are represented in `verifier.json.git_status_lines`.
- `report` writes `.harness/tasks/<task-id>/result.md` as a deterministic, artifact-based handoff report.
- `report` summarizes task metadata, changed files, checks, risks, follow-ups, debt created/resolved, next human action, and merge recommendation.
- `report` references `diff.patch`, `verifier.json`, and `logs/check.log` when present.
- `report` may summarize agent runs and related decisions/debt for the current task, but does not treat raw agent output as accepted truth.
- `report` does not claim PASS unless `verifier.json.result` is exactly `pass`.
- Phase 10 adapter roles are the read-only scout roles only: `repo-map`, `tests`, `docs`, `security`, and `architecture`.
- Adapter profiles live under `[agents.<agent_id>]` in `.harness/config.toml`.
- Supported Phase 10 adapter fields are `transport`, `command`, `args`, `working_directory_policy`, optional `explicit_path`, `permission_mode`, `allowed_roles`, `output_contract`, `timeout_seconds`, and `requires_human_confirmation`.
- Supported argument placeholders in `args` are `{prompt_path}`, `{output_path}`, `{log_path}`, and `{cwd}` only.
- No adapter is enabled by default; the harness fails closed when the named profile is missing or malformed.
- `[checks].commands` remains a string-array of shell commands run in the recorded task worktree.
- `[checks].protected_paths` is an optional string-array override for protected-path detection during `check`.

- `install` creates `.harness/config.toml`, `.harness/tasks/`, `.harness/templates/`, `.harness/memory/`, and `.harness/install.json`.
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
- `memory status` reports current memory paths plus debt, decision, and agent-output counts.
- `debt add` appends a debt item to `.harness/memory/debt/debt.jsonl`, refreshes `.harness/memory/debt/debt.md`, and updates `.harness/memory/project-index.md`.
- `debt list` shows project debt across the installed target repo with unresolved items first.
- `debt resolve --id <DEBT-...>` marks an existing debt item as `resolved` and refreshes derived memory files.
- `decisions add` writes one JSON decision record under `.harness/memory/decisions/` and refreshes `.harness/memory/project-index.md`.
- `decisions list` shows the recorded decision log across the installed target repo.

## Phase 12 config example

```toml
[agents.codex]
transport = "manual_prompt"
command = "codex"
args = ["exec", "{prompt_path}"]
working_directory_policy = "repo_root"
permission_mode = "read_only"
allowed_roles = ["tests"]
output_contract = "markdown"
timeout_seconds = 600
requires_human_confirmation = true

[checks]
commands = ["git status --short"]
protected_paths = ["AGENTS.md", ".harness/config.toml"]
```

## Phase 13 limitations

- `.codex/` hook files are created only in installed target repositories, not in the product repo.
- No `.agents/` files are created in this phase.
- No write-capable external agent mode is implemented in this phase.
- No LLM review, schemas, migrations, API adapters, secrets injection, or uncontrolled runtime state in the product repo are implemented in this phase.
