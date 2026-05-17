# Phase 10 — Manual CLI agent adapter

## Goal

Add an allowlisted adapter contract for local CLI agents in read-only mode.

This phase makes external agents first-class but still safe and optional.

## Scope

- define adapter config;
- require working directory policy;
- require permission mode;
- require output path;
- require log path;
- require timeout;
- add `ch agent prompt <agent> --role <role>`;
- add optional `ch agent run <agent> --role <role>` only for read-only commands;
- require allowlisted commands;
- capture stdout/stderr/logs;
- write output into the current task agent ledger.

## Supported first mode

Read-only scout mode only.

Examples of possible future adapters:

- `codex`
- `gemini`
- `aider`
- `cline`
- `custom`

No adapter is enabled by default unless explicitly configured.

## Non-goals

- no write-mode external agents;
- no parallel workers;
- no auto-merge;
- no API requirement;
- no secrets injection;
- no uncontrolled shell execution.

## Acceptance commands

```bash
npm run build
node bin/ch agent --help
```

## Acceptance behavior

- adapter format is documented;
- commands are allowlisted;
- default mode is read-only;
- no agent may run without an adapter profile;
- command allowlist and working directory are enforced;
- missing CLI tools fail clearly;
- no external agent is required for deterministic acceptance.
