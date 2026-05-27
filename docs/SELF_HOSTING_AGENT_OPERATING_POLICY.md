# Self-hosting Agent Operating Policy

## Purpose

This policy defines how `codex-harness` should be used to develop itself after
Phase 23.6. It is a contract and review aid only. It does not introduce runtime
supervision, autonomous orchestration, or new authority mechanisms.

Phase 23.6 does not introduce runtime supervision, autonomous orchestration, or
new authority mechanisms.

## Core rules

- Task files remain the binding implementation contract.
- Plan mode is a planning and review gate, not runtime truth.
- Approved plans must remain reviewable artifacts.
- Implementation must not intentionally broaden scope beyond the approved plan.
- Review must compare implementation against both the task contract and the
  approved plan.
- Closeout must use Phase 23.5 delivery-facts, lifecycle, and harvest rules.
- Prompts are invocation helpers. Procedures and policy docs are the repo-owned
  operating contracts.
- Generated or local discovery targets must not become hidden source-of-truth.
- External official or prior-art sources remain advisory unless adopted into
  repo docs/tests. Procedure and policy changes must carry explicit source
  trace.

## Role separation

- `planner` or `architect`: decomposes broad work, drafts plans, and surfaces
  assumptions and risks without implementing
- `reviewer` or `verifier`: stays read-only and evaluates plans, diffs, and
  evidence
- `implementer`: edits only inside approved task scope
- `maintainer` or `operator`: owns approvals, commits, pushes, pull requests,
  and any later workflow step that remains human-gated

No role may silently switch from review to implementation authority.

## Protected deterministic workflows

These workflows are harness-owned and must not be casually bypassed:

- build and test execution
- deterministic verification
- delivery-facts import and interpretation
- closeout and harvest
- worktree lifecycle and deletion rules

Agents must not interrupt, rewrite, or "repair" protected deterministic
workflows without an explicit task reason and approval path.

## Command and process behavior

- Agents must not inspect, kill, or restart unrelated processes as a recovery
  strategy.
- An agent may terminate only a process it started in the current command
  context, and only under an explicit timeout or stop policy.
- If a protected command appears stuck, the agent should report the command,
  cwd, branch or worktree, elapsed time, last useful output, suspected reason,
  and recommended next action.
- Process termination is not a substitute for verification or test repair.

## Initiative capture

Agent initiative must be captured as reviewable material only, such as:

- follow-up recommendations
- proposed tasks
- risks
- open questions
- command-safety notes
- documentation debt

Initiative capture is not permission for adjacent implementation.

## Hooks and authority boundaries

- Hooks remain guardrails and reminders only.
- Hooks must not become lifecycle, process, or memory authority.
- Hooks must not write accepted Project Memory DB records directly.
- Phase 23.5 storage and lifecycle services remain the operational authority.

## Phase ownership boundaries

- Phase 24 owns packet and report materialization.
- Phase 25 owns provider-specific access layers, adapters, and shared access
  services.
- Phase 27 owns domain-pack architecture and must keep domain logic out of
  core.
- Phase 28 owns domain ingestion and schema-evolution safety for future domain
  packs.

Phase 23.6 must not implement packet generation, access layers, domain packs,
MCP or A2A, daemons, process managers, local message buses, auto-commit, or
auto-merge.
