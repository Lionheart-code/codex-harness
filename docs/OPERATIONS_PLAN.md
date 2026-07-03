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
task context. Phase 23.8.6 now provides an explicit command path for that:
record the next-task decision, then materialize the new task branch/worktree.
`run start` by itself still does not create the task branch/worktree. Later
productized materialization must wrap that
same sequence in one formal command path. The invariant is one task = one
branch = one worktree.

Git branch creation and git worktree creation are distinct low-level
operations, but harness materialization must treat them as one logical step for
the new task context. The operator should not have to reason about them as two
independent workflow transitions in the steady-state automated path.

Durable procedure/run-state must advance only through product commands or
documented ingestion paths. The active replay and re-ingestion chain now
includes `task-intake`, `task-prompt-writer`, `draft-plan`, `plan-review`,
`plan-amend`, `architecture-review`, `db-storage-review`,
`implementation-review`, `fix-pass-review`, `verification-review`,
`delivery-facts-review`, `phase-closeout-review`, and the adjacent
`approve-plan` authority surface. Do not silently repair
`.harness/runs/**/run.json` by hand.

A human may still manually replay procedure steps to prepare the next
implementation or review prompt, but the transcript alone is not runtime
evidence. The operator must record the artifact through the matching product
command before stage advancement is durable. Procedures outside the current
replay scope remain prompt-only preparation surfaces. The prompt should use the
checked-in `prompts/self-hosting/<procedure-id>.md` wrapper, whose authority
still comes from the canonical `skills/self-hosting/<procedure>/` contract and
output format. Independent review procedures should run in a separate Codex CLI
session or equivalent review-only agent session, with the same repo-owned
procedure contract as the prompt source. Generated product prompts from
`node bin/ch prompt ...` remain separate task-local artifacts and do not
replace checked-in self-hosting procedure wrappers.
Use `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` as the checked-in source for
review-launch discipline, local CLI probe requirements, bounded-helper policy,
and the rule that Phase 31 is the first runtime home for child/runner
execution enforcement.

The product direction is a lightweight, provider-neutral harness control plane:
different models or runners may handle different stages only through explicit
runner/profile and permission contracts, while codex-harness owns validation,
approval, evidence, rollback/recovery visibility, and delivery facts.
`codex-harness` remains the lightweight supervisor/orchestrator/evaluator
shell around external worker agents. Routine manual review is transitional; the
target operating model is deterministic checks, independent read-only
reviewer-agents, typed issue tracking, repair-first progression, and owner
stops only for configured high-risk decisions.

Near-term progression:

```text
23.8.6 -> 23.8.6A -> 23.8.6B -> 23.8.6B2 -> 23.8.6C -> 23.8.6D ->
23.8.6E -> 23.8.7 -> 23.9
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
   Use `node bin/ch run record-next-task --run <run-id> --task <path> --base-commit <sha> --file <path> [--base-ref <ref>]`.
2. Create or enter the branch/worktree owned by that task with
   `node bin/ch run materialize-next-task --run <run-id> --decision-id <id> --task <path> --branch <name> --worktree <path> (--create|--enter-existing)`.
3. Let that materialization step activate `TASK.md` for the next task in the task worktree.
4. Continue from the new run that materialization already opened in that task worktree.
5. Run `/plan` again.
6. Implement the active task only.


## Product vs target project

This repository is the `codex-harness` product repository.

Do not create application projects inside this repository.

Target projects should be separate git repositories where `codex-harness` is installed later through `ch install`.

For testing installation, use a separate `codex-harness-playground` repository.
