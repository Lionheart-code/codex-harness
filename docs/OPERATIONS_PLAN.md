# Operations Plan

## Current operator-first contract

The current self-hosting direction is a lightweight operator-first control
layer, not a generic orchestration platform.

Task files remain the implementation contract. Roadmap and procedure docs
define allowed progression. Runtime state must be updated through product
commands or documented ingestion paths, not manual `run.json` repair.

Operator actions must be traceable:

```text
operator stage
-> next allowed action
-> product command or documented ingestion path
-> durable run/procedure evidence
-> deterministic validation/review gate
```

Task-cycle boundaries are explicit. End-of-old-cycle closeout/harvest may
determine and record the next task, but it must not create or claim the next
task branch/worktree. Start-of-new-cycle materialization belongs to the new
task context. In the current manual harness flow, create or enter the task
branch/worktree first, activate `TASK.md` there, and then start the new run.
That branch/worktree creation step is explicit operator-owned work today; it is
not implicit in `run start`. Later productized materialization must wrap that
same sequence in one formal command path. The invariant is one task = one
branch = one worktree.

Until the Phase 23.8.6 transactional ingestion task is implemented, any
operator action that requires durable procedure/run-state must either use an
existing product command or be documented as a future precondition. Do not
silently repair `.harness/runs/**/run.json` by hand.

The product direction is a lightweight, provider-neutral harness control plane:
different models or runners may handle different stages only through explicit
runner/profile and permission contracts, while codex-harness owns validation,
approval, evidence, rollback/recovery visibility, and delivery facts.

Near-term progression:

```text
23.8 registry/skill-surface closeout
-> 23.8.5 roadmap/task authority rebase
-> 23.8.6 transactional procedure result ingestion
-> 23.8.7 hookless stage-level packet automation
-> 23.9 minimal proof over stable procedure/stage records
```

Hard boundaries:

- no hook authority;
- no runner execution from the operator;
- no MCP-native architecture;
- no dashboard/marketplace/background runner;
- no domain-specific core behavior;
- no proof/report lifecycle authority.

The historical bootstrap notes below remain useful for early repository setup,
but current phase work follows the active `TASK.md` and the operator-first
contracts above.

## Initial setup

```bash
mkdir codex-harness
cd codex-harness
git init
```

Copy all files from the master-plan package into this repository.

Commit the copied master-plan package before starting Phase 0:

```bash
git add .
git commit -m "Add codex-harness master plan"
```

## Planning mode

In Codex, run `/plan` and paste:

```text
prompts/00-slash-plan-master.md
```

Expected output:

- system review for holes/risks;
- implementation plan for current task only;
- no code yet.

## If the plan is correct

Confirm implementation only if the plan implements the current `TASK.md` and nothing later.

## If the plan is too broad

Do not confirm.

Reply:

```text
Reduce scope to TASK.md only. Keep later phases as roadmap, not implementation.
```

## After implementation

Run acceptance commands from the current task file.

Then inspect:

```bash
git diff
```

## Review

Run fresh review with:

```text
prompts/99-review-current-task.md
```

## Commit rule

Commit only after:

- acceptance passes;
- review returns `PASS`;
- diff is scoped to current task.

## Move to next phase

After commit:

1. Record the next task decision if closeout/harvest has not already done so.
2. Create or enter the branch/worktree owned by that task.
3. In that branch/worktree, activate `TASK.md` for the next task.
4. Start the new run for the active task in that task worktree.
5. Run `/plan` again.
6. Implement the active task only.


## Product vs target project

This repository is the `codex-harness` product repository.

Do not create application projects inside this repository.

Target projects should be separate git repositories where `codex-harness` is installed later through `ch install`.

For testing installation, use a separate `codex-harness-playground` repository.
