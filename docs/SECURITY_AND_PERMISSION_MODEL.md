# Security and Permission Model

## Purpose

`codex-harness` coordinates coding agents that may read files, run commands, use tools, and eventually call other agents.

The default posture must be safe-by-default.

Phase 20 adds inspect-only security reporting. It does not add a new runtime
permission-enforcement layer.

## Core security principles

- read-only by default for external agents;
- write only inside task worktrees;
- no secrets access by default;
- no silent permission escalation;
- no unreviewed auto-merge;
- no unbounded shell execution;
- no hidden global state as source of truth;
- no automatic external network/API requirement for deterministic acceptance.

## Protected paths

Default protected paths:

```text
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
.harness/config.toml
AGENTS.md
```

Protected paths may be read or modified only when explicitly allowed by task scope and permission profile.

## Permission modes

```text
read_only
  can inspect and write harness artifacts only

write_worktree
  can edit files only inside task worktree

review_only
  can inspect artifacts and produce review output

governance_review
  can inspect metrics/debt/reports and propose improvements
```

## Shell policy

External agent shell execution requires:

- allowlisted command shape;
- explicit cwd;
- timeout;
- log capture;
- permission mode;
- output path;
- human confirmation unless pre-approved.

## MCP / external tools

MCP, browser, network, and external services are disabled unless explicitly configured.

Each external capability must have:

- purpose;
- allowed roles;
- allowed commands/endpoints;
- secrets policy;
- logging policy;
- disable switch.

## Agent profile requirements

Every agent profile must define:

- executable or manual transport;
- cwd policy;
- permission mode;
- allowed roles;
- allowed commands;
- forbidden commands;
- output contract;
- timeout;
- confirmation requirement.

## Failure policy

If permission state is unclear:

```text
fail closed
```

If an agent attempts out-of-scope writes:

```text
block or mark run as failed
```

If protected files change:

```text
check fails until human accepts or reverts
```

## Phase 20 command posture

- `node bin/ch security doctor` audits and reports the current implemented
  security posture only.
- In the product repo, it reports product-repo posture and that installed-layer
  security audit is unavailable there.
- In installed target repos, it reports the current protected-path posture and
  discovered adapter-profile details from the installed config.
- It fails closed on malformed adapter config or unclear permission state.
- It does not change permission state and does not enable new external
  capability.

## Human authority

Human approval is required for:

- merge;
- protected path modification;
- write-mode external agent;
- upgrade/migration application;
- permission profile changes;
- enabling new external CLI agents.
