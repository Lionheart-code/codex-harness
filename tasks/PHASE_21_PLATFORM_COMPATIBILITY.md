# Phase 21 — Platform compatibility and command runner hardening

## Goal

Harden command execution and acceptance testing so `codex-harness` works reliably on Windows, macOS, and Linux.

## Scope

- implement or refine structured command runner;
- reduce Bash-only acceptance dependency;
- add cross-platform acceptance scripts;
- add platform doctor command;
- normalize path handling;
- document Windows/macOS/Linux behavior;
- ensure agent adapters use structured command execution.

## Non-goals

- no Bash-only test requirement;
- no PowerShell-only test requirement;
- no WSL requirement;
- no arbitrary shell-string execution by default.

## Acceptance commands

```bash
npm run build
node bin/ch doctor platform
node bin/ch doctor commands
```

## Acceptance behavior

- command runner uses command + args + cwd + timeout;
- core tests can run on Windows, macOS, and Linux;
- shell mode is opt-in and documented;
- agent adapters inherit the same execution safety model.
