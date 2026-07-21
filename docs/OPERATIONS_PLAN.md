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
task context. Phase 23.8.6 now provides the current narrow command path for
that:
record the next-task decision, materialize the new task branch/worktree, write
`TASK.md` there, commit the activation/materialization change as the first
commit in that task branch/worktree, verify clean git, and only then start the
new run. Activation is not complete until that first commit exists and git is
clean. A dirty `TASK.md` activation is not trustworthy new-task authority. If
the current narrow runtime path opens the run earlier, that remains a Phase
23.8.6 implementation gap rather than valid steady-state lifecycle behavior.
`run start` by itself still does not create the task branch/worktree. Later
bootstrap/orchestrator work may wrap that same sequence in one formal command
path. The invariant is one task = one branch = one worktree.

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
and the rule that Phase 31 is the first runtime home for general reviewed
runner execution and packet-bound child/runner execution enforcement beyond
the narrow supervised review-launch surface planned in Phase 23.8.6B1.

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
23.8.6 -> 23.8.6A -> 23.8.6B -> 23.8.6B1 -> 23.8.6B2 -> 23.8.6C ->
23.8.6C1 -> 23.8.6C1A -> 23.8.6C2 -> 23.8.6C2A -> 23.8.6D -> 23.8.6E -> 23.8.6F -> 23.8.7 -> 23.9
```

Phase 23.8.6C1 is the completed post-bootstrap task-contract rebase. Phase
23.8.6C1A publishes provider-neutral routing, reasoning, context-transport,
independence, and downstream ownership authority without implementing runtime
routing. Phase 23.8.6C2 then performs narrow correctness hardening for the
existing `run start --task TASK.md` and `run status --operator` surfaces. C2A
completed commit-backed task materialization, prepared rather than started the
successor run, and verified deterministic worktree readiness after either
Harness or Codex Desktop creates the checkout; it never copies ignored private
state. Its implementation required one independent combined
architecture/authority and persisted-storage/no-storage-change review; a failed
labeled verdict routes to a fix pass and then a fresh combined review. Phase
23.8.6D completed durable-procedure payload storage, successor recovery, and
worktree retention. Phase 23.8.6E is now the active authority-freshness phase;
it will revalidate the generic native Desktop successor-task create/readback
boundary against the actual persistent app-server `thread/start` path without
implementing successor execution. Normalized provider-neutral stage
packet/result and route-intent contracts follow in 23.8.7. Phase 31 remains the
first general runtime provider-binding and runner-execution boundary.

For a newly inserted phase, materialization is not complete when only
`TASK.md` changes. Update the task contract, `TASK.md`, roadmap/operations
order, and every required live authority/policy surface coherently; commit that
complete activation as the first commit in the task branch/worktree; verify
clean git; then create the successor Codex Desktop task through the native
task/worktree API. Verify its cwd, branch, and `HEAD` binding, expose its
identity or link so the user can open it without creating, selecting, or
searching for a repository or worktree, and stop the predecessor before any
successor work. If creation or binding cannot be proven, fail closed with typed
`HANDOFF_CREATION_FAILED`; the predecessor must not bootstrap, start a
successor run, or execute successor shell work. Only after that proof may the
successor run `node bin/ch worktree bootstrap` to perform deterministic
dependency/build and tracked-procedure readiness checks before starting the
authoritative Harness run. A Codex Desktop local environment may run the same
setup during worktree creation, but its UI selection is not proof by itself.
Materialization never opens a successor run. It also fails closed unless exactly one installed TaskState owns the
new worktree or branch, so every Harness-materialized successor receives the
recorded immutable base before it can reach `run start`. That successor start
repeats the deterministic bootstrap before durable run creation; `--verify`
accepts only a generated readiness marker matching the committed `HEAD`, source
tree, lockfile, and CLI build output; those authority and readiness paths may
not be symbolic links. It rechecks installed dependencies
against the lockfile. Stale or nonmatching dependency/build directories cannot
claim readiness.

The same handoff boundary must detect a harvested predecessor that lacks a
recorded next-task decision and an already-activated successor that lacks its
uniquely owning `TaskState` because materialization was skipped. The completed D
implementation provides the smallest product-owned, fail-closed recovery: it
re-establishes a valid successor context from the recorded immutable decision
base before materialization and activation proof. It preserves the decision
base and activation authority; manual `TaskState` or database edits, using
current `HEAD` as a substitute base, silently claiming an advanced worktree, or
starting the successor before owner-match proof are forbidden. Active E
revalidates this general recovery together with the native Desktop task
creation/readback and predecessor-stop authority against the actual supported
surface; it does not add successor execution.

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
3. Let that materialization step write `TASK.md` for the next task in the task
   worktree; it must not start a successor run.
4. Commit the complete activation authority—`TASK.md`, active task contract,
   roadmap/operations ordering, and affected live policy surfaces—as the first
   commit in that new task branch/worktree.
5. Verify clean git, then create the successor through the native Codex Desktop
   task/worktree API; verify its cwd, branch, and `HEAD`, expose its
   identity/link, and stop the predecessor before successor work. If proof
   fails, return `HANDOFF_CREATION_FAILED` and do not bootstrap, run start, or
   execute successor shell work.
6. Only after successful handoff proof, run `node bin/ch worktree bootstrap`
   in that task worktree to install from the committed lockfile, build, and
   verify tracked Harness/procedure surfaces.
7. Only then run `node bin/ch run start --task TASK.md` in the successor
   worktree.
8. Run `/plan` again.
9. Implement the active task only.


## Product vs target project

This repository is the `codex-harness` product repository.

Do not create application projects inside this repository.

Target projects should be separate git repositories where `codex-harness` is installed later through `ch install`.

For testing installation, use a separate `codex-harness-playground` repository.
