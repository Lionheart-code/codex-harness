# Codex-first Programming Harness — Master Architecture

## 1. Goal

Build `codex-harness`: a reusable local control layer for software development with Codex.

The harness should make Codex-driven development disciplined, repeatable, auditable, and portable across repositories.

Target lifecycle:

```text
task idea
→ scoped task
→ isolated worktree
→ Codex implementation
→ deterministic checks
→ review
→ final handoff
→ human merge
```

## 2. What this is not

This is not:

- a general multi-agent platform;
- a dashboard-first product;
- a database-first orchestration engine;
- a proof-loop skill;
- an auto-merge bot;
- a replacement for project tests;
- a giant prompt.

## 3. Responsibility model

```text
Harness owns:
- task state;
- phase boundaries;
- prompt generation;
- worktree discipline;
- check execution;
- report generation;
- install/upgrade of repo-local harness layer.

Codex owns:
- reading task context;
- editing code;
- explaining changes;
- optional review pass.

Hooks own:
- small guardrails;
- prompt sanitation;
- context reminders;
- dangerous tool blocking.

Skills own:
- narrow, reusable procedures.

Project tests own:
- factual verification.

Human owns:
- final merge decision.
```

## 4. Repository model

Use separate repositories:

```text
codex-harness/                 # tool repository
codex-harness-playground/      # external target repo for e2e/evals
real-project-a/                # target repo with installed harness layer
real-project-b/                # target repo with installed harness layer
```

Do not put all projects inside one mega-repository.

Later optional global registry:

```text
~/.codex-harness/registry.json
```

## 5. Language decision

Use TypeScript/Node.js for MVP.

Reasons:

- portable CLI;
- easy npm installation;
- good JSON/TOML/template handling;
- easy shell/git/codex integration;
- target projects can be Python, JS, Go, Rust, Java, PHP, or anything else.

Hooks can be shell scripts.

## 6. Installed target-project layout

Future installed layer:

```text
target-project/
  AGENTS.md

  .codex/
    config.toml
    hooks.json
    hooks/
      user_prompt_context.sh
      pre_tool_guard.sh
      stop_handoff.sh

  .agents/
    skills/
      plan/
      verify/
      review/
      refactor-discipline/
      security-review/
      docs-update/
      python-testing/
      js-ts-testing/

  .harness/
    config.toml
    tasks/
    templates/
```

## 7. Task lifecycle

```text
CREATED
SPEC_READY
WORKTREE_READY
PLANNED
IN_PROGRESS
CAPTURED
CHECKED
REVIEWED
FIX_REQUIRED
READY_FOR_HUMAN
MERGED
CLOSED
FAILED
```

## 8. Hooks role

Hooks are useful but not central.

Use only as sidecar:

- `UserPromptSubmit`: inject active task context or stop coding work without task.
- `PreToolUse`: block dangerous shell/edit actions and editing outside task worktree.
- `Stop`: remind to run checks/report/review.

Hooks must not be:

- the state machine;
- a transaction manager;
- the full security boundary;
- the worktree manager.

## 9. Skills role

Skills are narrow capabilities, not orchestration.

Initial future skills:

- `plan`
- `verify`
- `review`
- `refactor-discipline`
- `security-review`
- `docs-update`
- `python-testing`
- `js-ts-testing`

## 10. Scaling path

MVP:
- one Codex write-worker;
- manual/interactive Codex;
- file task-state;
- deterministic verifier.

v0.2:
- `codex exec` for review/report;
- schema-bound review output.

v0.3:
- read-only scouts;
- optional registry.

v1.0:
- API/Pro model profiles;
- queue/dashboard only if real throughput requires it.


## 11. Future agent orchestration architecture

The harness must remain Codex-first, but not Codex-only.

API is optional. The first multi-agent path is CLI/manual and file-based.

### Agent roles

```text
controller
  owns task state, routing, phase boundaries, safety, and final workflow

architect
  handles high-level planning and architecture decisions

scout
  read-only agent that inspects code/tests/docs and writes findings

builder
  write-capable agent that implements changes inside a task worktree

verifier
  reviews diff, acceptance, and check results

integrator
  combines outputs from parallel worktree workers when that mode exists
```

### Supported transports

```text
manual prompt
  user copies prompt into Codex/Gemini/other agent and saves output

CLI command
  harness runs an allowlisted local CLI command

API
  optional later transport for teams/automation, not required for MVP
```

### Initial external-agent rule

External agents are read-only by default.

They may only produce artifacts under:

```text
.harness/tasks/<task-id>/scouts/
.harness/tasks/<task-id>/agents/
```

They must not edit project files until write-mode adapters and worktree isolation are explicitly implemented.

### Agent run ledger

Every agent run must be recorded as an artifact:

```text
.harness/tasks/<task-id>/agents/<run-id>/
  role.md
  prompt.md
  command.json
  output.md
  log.txt
  status.json
```

This lets later agents and humans understand what was already done.

### Model/cost policy

Use expensive agents for:

- architecture;
- hard planning;
- high-risk review;
- final decision.

Use cheaper/local/CLI agents for:

- repo scouting;
- test discovery;
- documentation summary;
- risk listing;
- repeated narrow checks.

Deterministic tools remain the source of truth for tests, lint, typecheck, build, and smoke checks.


## 12. Agent boundary principle

The harness must support different agents through explicit adapter profiles, not through one universal prompt.

Every agent profile must define:

- transport;
- working directory policy;
- permission mode;
- allowed roles;
- allowed commands;
- output contract;
- timeout;
- logging;
- human confirmation policy.

The detailed boundary model lives in:

```text
docs/AGENT_BOUNDARIES_AND_ADAPTERS.md
```

This is required because Codex, Gemini CLI, Cline/Roo-like agents, Aider-like agents, and custom agents do not necessarily interpret tasks, workspaces, and tool permissions the same way.


## 13. Project memory and debt principle

Every agent action must leave durable evidence, but raw logs are not enough.

The harness must maintain governed project memory:

- task state;
- agent run ledger;
- task reports;
- decision log;
- debt ledger;
- project index;
- memory summaries.

The detailed memory and debt model lives in:

```text
docs/PROJECT_MEMORY_AND_DEBT.md
```

The harness must distinguish:

```text
done
not done
blocked
debt introduced
debt resolved
decision active
decision superseded
agent output raw
agent output accepted
agent output stale
```

This prevents large projects from becoming a pile of disconnected agent notes.


## 14. Harness governance principle

The harness must support improving the harness itself through a controlled governance loop.

The governance loop may audit metrics, debt, agent failures, prompts, phase friction, and external best practices.

It must produce proposals, not silent self-modification.

The detailed model lives in:

```text
docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md
```

Governance is release engineering:

```text
evidence
→ proposal
→ acceptance criteria
→ implementation task
→ evaluation
→ promotion or rollback
```


## 15. Product vs project layer principle

`codex-harness` is the product repository.

Target repositories receive an installed harness layer.

The same concepts exist in both places, but their state must remain separate:

```text
codex-harness/
  product source, templates, releases, governance for the harness

target-project/
  installed .harness layer, task state, project memory, project debt

codex-harness-playground/
  external test target for install/eval scenarios
```

The detailed model lives in:

```text
docs/PRODUCT_VS_PROJECT_LAYER.md
```

The harness may self-host, but self-hosting must not turn all projects into one mega-repository.


## 16. Hardening principles

The harness must be schema-governed, permission-aware, regression-tested, and context-budgeted.

Detailed hardening documents:

```text
docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md
docs/SECURITY_AND_PERMISSION_MODEL.md
docs/HARNESS_EVALS_AND_REGRESSION.md
docs/CONTEXT_BUDGET_POLICY.md
docs/HUMAN_OPERATOR_MANUAL.md
```

These documents do not expand Phase 1. They constrain future phases so the harness remains safe, upgradeable, and usable across large projects and multiple agents.


## 17. Cross-platform and release hardening

The harness must work across Windows, macOS, and Linux.

Core execution must not depend on Bash-only shell behavior.

Detailed documents:

```text
docs/PLATFORM_COMPATIBILITY_AND_COMMAND_EXECUTION.md
docs/RELEASE_AND_SUPPLY_CHAIN_SECURITY.md
```

Future product tests should use cross-platform Node-based acceptance scripts where possible.

Release hardening is required before public distribution, but it must not expand Phase 1.
