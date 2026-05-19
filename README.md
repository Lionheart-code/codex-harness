# codex-harness

`codex-harness` is a Codex-first programming harness. Phase 18 adds safe install/upgrade lifecycle management and an optional project registry on top of the Phase 17 governance loop, the Phase 16 parallel worktree scaffold, the Phase 15 eval playground, Phase 14 review, and earlier harness flow.

## Phase 18 commands

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
node bin/ch review
node bin/ch review --exec
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
node bin/ch doctor --help
node bin/ch doctor --all
node bin/ch eval playground init
node bin/ch eval playground smoke
node bin/ch eval playground clean
node bin/ch governance --help
node bin/ch governance review
node bin/ch governance proposal --title "tighten review gate"
node bin/ch governance metrics
node bin/ch governance status
node bin/ch parallel --help
node bin/ch parallel plan --worker alpha --worker beta --claim alpha:README.md --claim beta:src
node bin/ch parallel status
node bin/ch parallel close
node bin/ch install
node bin/ch install --dry-run
node bin/ch upgrade --help
node bin/ch upgrade --dry-run
node bin/ch upgrade
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

## Phase 18 install and upgrade behavior

- `install` creates the installed harness layer, writes `.harness/install.json`, seeds managed baselines under `.harness/templates/managed/`, and may update the optional `~/.codex-harness/registry.json`.
- `upgrade --dry-run` previews install-owned changes without writing files.
- `upgrade` updates only install-owned static content, creates backups before rewriting managed files, refreshes install metadata, and fails closed when managed files contain local modifications.
- `doctor --all` reads the optional project registry and reports the status of registered repositories without turning the registry into the source of truth.
- Runtime/generated project state under `.harness/tasks/`, `.harness/memory/`, `.harness/governance/`, and `.codex/` is never overwritten during upgrade once present.
- Rollback is file-based: inspect the reported `.codex-harness.bak*` backups before restoring any managed file manually.

## Phase 17 governance behavior

- `governance review`, `governance proposal`, `governance metrics`, and `governance status` operate only in installed target repositories, not in the real `codex-harness` product repository.
- Governance artifacts live under `.harness/governance/` with subdirectories for `reviews/`, `proposals/`, and `metrics/`, plus `changelog.md`.
- `governance review` writes a dated review artifact for `daily`, `weekly`, or `release` mode and records evidence without changing product code.
- `governance proposal --title ...` writes a human-readable Harness Enhancement Proposal with required evidence, expected benefit, risk, rollback, acceptance criteria, and evaluation-plan sections.
- `governance proposal --research <path>` records validated local research-summary file references only. It does not fetch the network.
- `governance metrics` writes deterministic local summary data to `.harness/governance/metrics/harness-metrics.json`.
- `governance status` is read-only and summarizes governance, memory, debt, decisions, and agent-output counts.
- Phase 17 does not add automatic self-modification, auto-merge, silent prompt changes, permission changes, dashboard behavior, or schema/migration infrastructure.

## Phase 16 parallel scaffold behavior

- `parallel plan` is an opt-in manual scaffold for splitting work across isolated worker worktrees.
- Phase 16 does not execute write-capable worker agents automatically and does not extend `agent run` beyond Phase 10 read-only behavior.
- The current single active task remains the explicit integrator task.
- `parallel plan` requires:
  - exactly one active task
  - an existing integrator worktree
  - a clean source checkout
  - a clean integrator worktree
  - at least 2 workers
  - explicit non-overlapping worker claims
- Worker claims are literal repo-relative file or directory prefixes only. They must stay inside the repo and must not target harness-managed paths.
- `parallel plan` writes:
  - `.harness/tasks/<task-id>/parallel/plan.json`
  - `.harness/tasks/<task-id>/parallel/integrator-prompt.md`
  - one worker prompt per worker under the same `parallel/` directory
- Each worker gets one isolated git worktree on a task-scoped parallel branch and dedicated external worktree path.
- `parallel status` reports the current scaffold state and fails when recorded worker integrity is broken.
- `parallel close` is the final gate. It requires:
  - all worker worktrees still exist and are clean
  - final `diff.patch`, `verifier.json`, `review.json`, and `result.md`
  - verifier result `pass`
  - review result `PASS`
  - `result.md` containing `READY FOR HUMAN REVIEW`
  - final tracked integrator changes staying inside the declared claim union
- `parallel close` records closure only. It does not merge branches, delete worktrees, or run external write agents.

## Phase 15 eval playground behavior

- `eval playground init` creates or refreshes a managed disposable playground root.
- The default playground root is the literal sibling `../codex-harness-playground`.
- `eval playground init --root <path>` is allowed for local testing, but the command refuses the product repo, paths inside the product repo, the product-repo parent, and other unsafe targets.
- The managed playground writes:
  - `.codex-harness-playground.json`
  - `eval-corpus.json`
  - `python-app/`
  - `ts-app/`
- `eval-corpus.json` materializes the 20-task Phase 15 corpus and marks exactly 4 local deterministic smoke scenarios.
- `eval playground smoke` runs the 4 deterministic local E2E scenarios without live LLM/API calls and writes `smoke-results.json`.
- `smoke-results.json` records deterministic metrics for each executed scenario, including pass/fail, timing, failed checks, unsafe command blocks, and null manual-only metrics.
- The docs scenario uses a separate managed target under the playground root so earlier smoke artifacts remain available until asserted.
- The safety/lifecycle scenario proves:
  - non-empty unmanaged init refusal
  - hook-based unsafe-command blocking
  - managed clean on a separate managed target
  - unmanaged clean refusal on a separate unmanaged target
- `eval playground clean` removes only a managed playground root and refuses unmanaged, product-repo, parent, and filesystem-root targets.

## Phase 14 review and hook behavior

- `review` validates an existing `.harness/tasks/<task-id>/review.json` and fails closed on invalid JSON or invalid review shape.
- `review --exec` builds a task-aware review prompt, runs `codex exec`, validates the JSON result, and writes `review.json`.
- `review.json` records `PASS` or `FIX_REQUIRED` plus explicit blockers, summary, mode, and timestamp.
- Local deterministic acceptance does not require a live Codex installation; `--exec` is optional and may be smoke-tested manually or through a stubbed executable in acceptance tests.
- `report` now references `review.json` when present and changes the merge recommendation to `DO NOT MERGE` when review blockers exist.

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

## Phase 12 and 14 report behavior

- `agent record --role <role> --output <path>` creates an agent run directory under `.harness/tasks/<task-id>/agents/<run-id>/`.
- The ledger writes `status.json` with task id, run id, role, status, timestamps, prompt path, output path, and optional notes/profile metadata.
- Recording metadata does not execute any agent and does not create the output file itself.
- Recorded outputs remain raw and untrusted until reviewed.
- Agent output status parsing supports `raw`, `accepted`, `stale`, and `rejected`, while Phase 9 still records new runs as `raw` only.
- `agent prompt <agent> --role <role>` requires an adapter profile in `.harness/config.toml`, creates a run-local `prompt.md` and `command.json`, and prints the bounded command preview without executing the external agent.
- `agent run <agent> --role <role>` executes only configured `cli` adapters with `permission_mode = "read_only"`, captures stdout to `output.md`, captures stderr plus run summary to `log.txt`, and records command metadata in `status.json`.
- `parallel plan`, `parallel status`, and `parallel close` add a manual Phase 16 scaffold for isolated worker worktrees plus an integrator close gate.
- Phase 16 does not add automatic write-capable worker execution.
- `governance review`, `governance proposal`, `governance metrics`, and `governance status` add a deterministic Phase 17 maintainer-governance loop for installed harness layers only.
- Phase 17 governance produces review/proposal/metrics artifacts only. It does not edit the product repository or silently apply harness changes.
- `capture` reads the active task worktree, captures `git status --porcelain --untracked-files=all`, writes `diff.patch`, and seeds `.harness/tasks/<task-id>/verifier.json` with durable capture state.
- `check` refreshes capture artifacts, runs `[checks].commands` from `.harness/config.toml`, writes `.harness/tasks/<task-id>/logs/check.log`, and records deterministic pass/fail results in `verifier.json`.
- `check` treats protected-path changes as failure. If `[checks].protected_paths` is unset, the defaults are `AGENTS.md` and `.harness/config.toml`.
- `diff.patch` contains tracked-file git diff output only. Untracked files are represented in `verifier.json.git_status_lines`.
- `review` reads or writes `.harness/tasks/<task-id>/review.json` as the Phase 14 review artifact.
- `review` validates review JSON locally without calling Codex.
- `review --exec` requires `spec.md`, `acceptance.md`, `diff.patch`, and `verifier.json`, and includes scout/agent outputs if present.
- `report` writes `.harness/tasks/<task-id>/result.md` as a deterministic, artifact-based handoff report.
- `report` summarizes task metadata, changed files, checks, risks, follow-ups, debt created/resolved, next human action, and merge recommendation.
- `report` references `diff.patch`, `verifier.json`, `review.json`, and `logs/check.log` when present.
- `report` may summarize agent runs and related decisions/debt for the current task, but does not treat raw agent output as accepted truth.
- `report` does not claim PASS unless `verifier.json.result` is exactly `pass`.
- `report` does not recommend `READY FOR HUMAN REVIEW` when a valid review artifact contains blockers.
- Phase 10 adapter roles are the read-only scout roles only: `repo-map`, `tests`, `docs`, `security`, and `architecture`.
- Adapter profiles live under `[agents.<agent_id>]` in `.harness/config.toml`.
- Supported Phase 10 adapter fields are `transport`, `command`, `args`, `working_directory_policy`, optional `explicit_path`, `permission_mode`, `allowed_roles`, `output_contract`, `timeout_seconds`, and `requires_human_confirmation`.
- Supported argument placeholders in `args` are `{prompt_path}`, `{output_path}`, `{log_path}`, and `{cwd}` only.
- No adapter is enabled by default; the harness fails closed when the named profile is missing or malformed.
- `[checks].commands` remains a string-array of shell commands run in the recorded task worktree.
- `[checks].protected_paths` is an optional string-array override for protected-path detection during `check`.

- `install` creates `.harness/config.toml`, `.harness/tasks/`, `.harness/templates/`, `.harness/memory/`, and `.harness/install.json`.
- `install --dry-run` previews the same actions without writing files.
- `install` also seeds `.harness/templates/managed/agents-block.md` and `.harness/templates/managed/config.toml` for future upgrade drift detection.
- `install` creates or updates a managed block in `AGENTS.md` and backs up the file before patching existing content.
- Re-running `install` is idempotent when the managed files already match the Phase 2 content.
- `upgrade --dry-run` previews Phase 18 install-owned changes without writing files.
- `upgrade` updates install-owned static files only, records additive `last_upgrade` metadata in `.harness/install.json`, and creates `.codex-harness.bak*` backups before rewriting managed files.
- `doctor --all` summarizes the optional `~/.codex-harness/registry.json` without replacing repo-local `.harness/` state.
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

## Phase 14 config example

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

## Phase 14 limitations

- `.codex/` hook files are created only in installed target repositories, not in the product repo.
- No `.agents/` files are created in this phase.
- No write-capable external agent mode is implemented in this phase.
- No automatic coding loop, schemas, migrations, API adapters, secrets injection, or uncontrolled runtime state in the product repo are implemented in this phase.
