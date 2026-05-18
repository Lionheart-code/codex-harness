# Agent Boundaries and Adapter Profiles

## Purpose

Different coding agents interpret instructions, filesystem scope, tools, and safety boundaries differently.

`codex-harness` must not assume that one prompt or one rule file works equally well for Codex, Gemini CLI, Cline/Roo, Aider, Claude-like tools, or custom local agents.

The harness must normalize agent usage through explicit profiles.

Phase 6 defines these profiles as documentation only. It does not enable external-agent execution, automatic delegation, or API integration.

## Core rule

One harness can coordinate many agents only if every agent run has:

- a role;
- an adapter profile;
- a working directory;
- a permission mode;
- an output contract;
- a log path;
- a timeout;
- an allowlist or explicit manual execution mode;
- a verification step.

External agents are disabled by default.
External agents are read-only by default.
No agent output is trusted without verification.
Write-capable agents require explicit task worktree boundaries.
API is optional, not required.
Codex-first does not mean Codex-only.

## Agent profile

Each agent profile must define:

```json
{
  "agent_id": "codex",
  "display_name": "Codex",
  "transport": "manual_prompt | cli | api",
  "default_mode": "read_only | write_worktree | review_only",
  "working_directory_policy": "repo_root | task_worktree | explicit_path",
  "instruction_files": ["AGENTS.md"],
  "prompt_style": "codex | gemini | cline | aider | custom",
  "allowed_roles": ["architect", "scout", "builder", "verifier"],
  "allowed_commands": [],
  "forbidden_commands": [],
  "output_contract": "markdown | json | patch | report",
  "timeout_seconds": 600,
  "requires_human_confirmation": true
}
```

These fields define a future contract. They do not grant runtime execution in Phase 6.

## Permission modes

### `read_only`

Agent may inspect files and write only harness artifacts:

```text
.harness/tasks/<task-id>/scouts/
.harness/tasks/<task-id>/agents/
```

It must not edit project source files.

### `write_worktree`

Agent may edit project files only inside the task worktree.

It must not edit the source checkout or another task worktree.

### `review_only`

Agent may inspect task artifacts and produce review output.

It must not edit project files.

## Role boundaries

### controller

The harness/controller owns task state, routing, phase boundaries, safety, and final workflow.

### architect

Plans architecture and decomposition. May be expensive. Should not make uncontrolled code edits.

### scout

Read-only. Finds files, tests, risks, docs, architecture notes. Writes findings to `scouts/*.md`.

### builder

Writes code only inside a task worktree. Must keep diff scoped.

### verifier

Reviews diff, acceptance, checks, and artifacts. Must return PASS or FIX_REQUIRED.

### integrator

Combines outputs from parallel worktree workers. Requires final verifier and human merge gate.

Phase 16 adds a manual scaffold for this role, but does not implement external write-capable agent execution.

## Per-agent instruction differences

### Codex

Use for primary planning, building, and review.

Codex should be given:

- `AGENTS.md`;
- task spec;
- acceptance criteria;
- worktree path;
- explicit non-goals;
- check commands.

### Gemini CLI

Use first as a read-only scout or summarizer.

Gemini should be given:

- exact project folder;
- read-only instruction;
- output file path;
- no-edit rule;
- concise role prompt.

Gemini must not be assumed to follow Codex-specific conventions unless encoded in its prompt/profile.

### Cline/Roo-like agents

Use only with explicit workspace and approval settings.

They need:

- a project folder boundary;
- no auto-approval unless intentionally enabled;
- explicit task scope;
- output/report destination.

### Aider-like agents

Use only when git/diff workflow is appropriate.

They need:

- explicit file scope;
- clear instruction not to touch unrelated files;
- test command expectations.

### Custom agents

Must start as read-only until their command behavior, file access, and output reliability are proven.

## External CLI agent safety

External CLI agents must be disabled by default.

To enable an external CLI agent:

1. Add an adapter profile.
2. Add the executable path.
3. Add allowed roles.
4. Add allowed command shape.
5. Set default mode to `read_only`.
6. Run `ch doctor agents`.
7. Run a scout-only smoke test.

Those steps are future-facing. Phase 6 does not implement them.

## Delegation policy

Delegate to cheaper/read-only agents when the task is:

- repository discovery;
- test discovery;
- documentation summary;
- risk listing;
- large-context summarization;
- repeated narrow inspection.

Use stronger/expensive agents when the task is:

- architecture decision;
- ambiguous trade-off;
- high-risk review;
- final plan validation.

In Phase 6, delegation policy is descriptive only. The harness does not execute agents automatically.

## Verification

No agent output is trusted by default.

All agent outputs must be:

- stored;
- referenced by path;
- reviewed by the next step;
- checked by deterministic commands where possible;
- included in final report if used.

## Working directory policy

### `repo_root`

Use when an agent needs broad read visibility across the repository without write access.

### `task_worktree`

Use when a write-capable agent must remain isolated to the current task worktree.

### `explicit_path`

Use when an agent should be restricted to a narrower path such as a docs folder, output folder, or selected artifact subtree.
