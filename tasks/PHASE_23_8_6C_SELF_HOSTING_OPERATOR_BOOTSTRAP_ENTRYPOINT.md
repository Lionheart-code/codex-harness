# Phase 23.8.6C - Minimum Self-Hosting Orchestrator Entrypoint

## Status

Planned. Starts only after Phase 23.8.6B2 Verification Command
Rationalization and Serialization is complete, reviewed, accepted, and
merged.

## Purpose

Add the first lightweight practical self-hosting orchestrator loop for an
already selected task context.

## Problem

Self-hosting startup still relies on operators manually reconstructing task,
branch, worktree, base-commit, and run-identity facts before the next
procedure can begin, and the current lifecycle has no reviewed minimal loop
for routing one bounded worker step, recording issues, and forcing repair
before drift compounds.

## Scope

This phase owns only the minimum reviewed orchestrator entrypoint needed to
report trustworthy startup facts, select the next step, prepare one bounded
worker handoff, prompt, or packet, ingest any returned result as typed
lifecycle evidence, and force issue/repair discipline without launching
external runners or implementing runtime runner execution enforcement.

## Required behavior

- Add a narrow product command or equivalent documented runtime surface that
  bootstraps self-hosting from the current task context.
- Require bootstrap evidence for:
  - active task file;
  - current branch;
  - current worktree root;
  - base commit or reviewed merge-base fact;
  - exact run identity allocation or bootstrap status.
- If active task authority depends on an uncommitted `TASK.md` activation, or
  if `TASK.md`, base commit, worktree, and git state are misaligned, return a
  typed blocker instead of trusting or continuing the new task run.
- Resolve the active task from current `TASK.md`, exact run context, or
  explicit task/worktree inputs rather than assuming the repository contains
  exactly one task-state record. Historical task accumulation must not make the
  active self-hosting bootstrap, capture, check, or adjacent task/worktree
  helper surfaces unusable.
- Read operator status and select exactly one next procedure or next allowed
  action.
- Prepare exactly one bounded worker handoff, prompt, or packet for an
  external worker surface outside harness runtime runner execution.
- If that bounded handoff returns a result through approved manual or reviewed
  procedure surfaces, ingest the result as typed lifecycle evidence rather
  than chat-only state.
- If Phase 23.8.6B1 review-launch evidence already exists, surface the blocked
  disposition and exact next valid action without implementing another review
  launcher.
- Run deterministic checks and an independent reviewer/evaluator-agent step
  when required by the review tier.
- Record every lifecycle problem as typed `RunIssue` evidence.
- Generate a `RepairPacket` before continuing when unresolved issues exist.
- If the active task or approved plan cannot complete honestly without
  supporting runtime/operator work outside current scope, stop and record a
  typed `RunIssue` that distinguishes:
  - bounded fix-pass inside current scope;
  - plan/task amendment within current scope; or
  - separate supporting-fix or new-task requirement.
- Emit the matching `RepairPacket`, amendment recommendation, or new-task
  recommendation instead of silently broadening the active diff or treating
  chat-only notes as authority.
- Continue only until a hard blocker, configured owner gate, or budget stop.
- Provide a non-mutating preview or dry-run path before any durable state
  mutation.
- Consume the task already active in the worktree. This phase must not choose a
  different task, silently rewrite `TASK.md`, or backfill authority by chat.
- Do not treat review request files, diagnosis notes, or other run-local
  markdown artifacts as accepted memory.
- Surface review procedures that remain outside Phase 23.8.6B1 supervised
  launch, such as `fix-pass-review`, `verification-review`,
  `delivery-facts-review`, `phase-closeout-review`,
  `docs-consistency-review`, and `harness-audit`, as manual or blocked next
  actions until a reviewed product surface exists for them.
- Preserve one task = one branch = one worktree.

## Non-goals

- No full runner execution system.
- No replacement for Codex or for other external worker surfaces.
- No generic workflow engine.
- No unrestricted review-session automation.
- No launch of external runners from harness runtime.
- No runtime runner execution enforcement. That belongs in Phase 31.
- No provider/model routing logic baked into the lifecycle core.
- No domain-pack behavior.
- No auto-commit or auto-merge.
- No replacement for the reviewed runtime execution work planned in Phase 31.

## Acceptance commands

```bash
npm run build
npm test
node bin/ch run start --task TASK.md --dry-run
node bin/ch run status --operator --dry-run
git diff --check
```

## Acceptance behavior

- Bootstrap output proves the active task, branch, worktree, base-commit fact,
  and run-identity fact without requiring manual `run.json` repair.
- Bootstrap proves committed task authority rather than only a working-tree
  pointer, and fails closed when activation is uncommitted or git remains
  dirty after task activation.
- Bootstrap and adjacent task/worktree-aware helper behavior remain usable when
  historical task-state records exist; the active task is resolved from live
  authority rather than a singleton-task assumption.
- Bootstrap output includes operator status and the immediate next procedure or
  typed blocker.
- The implementation can prepare one bounded worker handoff, prompt, or packet
  without turning the harness into the worker or launching external runners
  from harness runtime.
- If a result is returned through the approved narrow surface, the
  implementation can ingest it as typed lifecycle evidence.
- Unresolved lifecycle problems become typed `RunIssue` evidence and yield a
  `RepairPacket` before further progression.
- The loop stops on hard blocker, configured owner gate, or budget stop rather
  than expanding into broad autonomy.
- A dry-run/bootstrap-preview path exists and does not mutate durable state.
- Add or update only the task-local deterministic tests needed to prove the
  minimum orchestrator entrypoint behavior.
- If a full-pack proof is required, use `npm test` as the canonical command and
  treat `npm run test:acceptance` as a compatibility alias only.
- The implementation does not add full runner execution, provider-specific
  lifecycle logic, generic packet automation, or domain-pack behavior.

## Source/runtime boundary

This phase may add only the narrow CLI/operator/runtime surfaces needed for the
minimum orchestrator entrypoint. It must not change package scripts, CI,
domain-pack behavior, provider/model routing policy, the later normalized
packet layer, launch external runners, or implement the reviewed runner
adapter and runtime execution enforcement planned in Phase 31.

## Relationship to previous and next phases

- Consumes the exact-identity and slice-isolated foundations from Phase 23.8.6,
  the replay/re-ingestion continuity from Phase 23.8.6A, the supervised
  review-launch status from Phase 23.8.6B1, and the verification policy from
  Phase 23.8.6B2.
- Precedes Phase 23.8.6D so minimum-loop procedure/state evidence can later
  rely on durable SQL-backed artifact storage.
- Precedes Phase 23.8.7, which should formalize packet/result/policy contracts
  only after this minimum loop is proven.
- Leaves Phase 30 bounded experimentation and Phase 31 reviewed runner
  execution and runtime execution enforcement untouched.

## Final report expectations

The implementation report for this phase must state:

- which bootstrap facts are emitted;
- which command or commands own bootstrap, one-step orchestration, and dry-run
  behavior;
- whether the loop selected one next procedure, prepared one bounded worker
  handoff, prompt, or packet, ingested any returned result as typed lifecycle
  evidence, and stopped correctly on issue/repair or blocker conditions;
- verification results;
- any remaining assumptions deferred to later phases.
