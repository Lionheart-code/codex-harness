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

Until the Phase 23.8.6 transactional ingestion task is implemented, any
operator action that requires durable procedure/run-state must either use an
existing product command or be documented as a future precondition. Do not
silently repair `.harness/runs/**/run.json` by hand.

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

1. Update `TASK.md` to point to the next phase.
2. Run `/plan` again.
3. Implement next phase only.


## Product vs target project

This repository is the `codex-harness` product repository.

Do not create application projects inside this repository.

Target projects should be separate git repositories where `codex-harness` is installed later through `ch install`.

For testing installation, use a separate `codex-harness-playground` repository.
