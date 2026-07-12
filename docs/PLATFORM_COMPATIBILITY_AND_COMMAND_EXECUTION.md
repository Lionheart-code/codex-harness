# Platform Compatibility and Command Execution

## Purpose

`codex-harness` must work on Windows, macOS, and Linux.

The human operator may use PowerShell, cmd.exe, Git Bash, WSL, zsh, bash, or a terminal embedded in an agent app. The harness must not depend on one shell style for core behavior.

## Core rule

The product implementation must be cross-platform by default.

Documentation examples may show Bash-style commands for readability, but real harness acceptance and regression tests must be implemented as Node-based cross-platform scripts when they become product tests.

## Supported platforms

Primary targets:

```text
Windows 10/11
macOS
Linux
```

Supported shells for human use:

```text
PowerShell
cmd.exe
Git Bash
WSL bash
bash/zsh on macOS/Linux
```

The CLI must avoid requiring a specific shell for normal operation.

## Command runner policy

The harness must execute commands through a structured command runner.

A command run must define:

```json
{
  "command": "git",
  "args": ["status", "--short"],
  "cwd": "explicit/path",
  "env": {},
  "timeout_seconds": 120,
  "shell": false,
  "capture_stdout": true,
  "capture_stderr": true,
  "log_path": ".harness/tasks/<task-id>/logs/command.log"
}
```

## Shell string policy

Avoid arbitrary shell strings for core commands.

Prefer:

```text
command + args array
explicit cwd
explicit timeout
captured stdout/stderr
exit code
```

Use shell mode only when explicitly required and documented.

For Phase 21 specifically:

- legacy `[checks].commands = ["..."]` entries remain readable;
- legacy entries are tokenized into `command + args` and run with `shell = false`;
- legacy entries fail closed on shell-only syntax such as pipes, chaining, redirection, backticks, or command substitution;
- preferred structured `[[checks.commands]]` entries default to `shell = false`;
- `shell = true` is explicit structured opt-in only.

## Windows-specific rules

- Do not assume `test`, `grep`, `mktemp`, `rm`, `cp`, or shell grouping exists.
- Do not assume POSIX path separators.
- Use Node path utilities for filesystem paths.
- Treat environment variable casing carefully.
- `.cmd` and `.bat` execution needs explicit handling.
- Prefer invoking Node scripts, git, npm, and other executables directly with argument arrays.

## Acceptance command policy

Task files may contain shell examples, but durable full-pack proof must run
through the shared Node-based runner with one canonical command:

```bash
npm test
npm run test:acceptance
node scripts/run-acceptance.mjs
```

`npm test` is the canonical full-pack proof command. `npm run
test:acceptance` remains a compatibility alias to the same runner, and `node
scripts/run-acceptance.mjs` is the underlying shared runner path.

The runner must:

- discover `tests/acceptance/*.test.mjs` in stable sorted order;
- execute them through Node's built-in test runner;
- serve as the shared path for `npm test`, `npm run test:acceptance`, and bare `node bin/ch eval` acceptance delegation.

## Agent adapter execution

External CLI agents must be invoked through the same command runner policy.

The core command contract remains provider-neutral. Codex CLI/Desktop, Claude,
Gemini, local models, App Server, and future workers are adapter candidates;
none is a mandatory lifecycle dependency. Phase 31 is the first general
runtime binding/execution boundary and must fail closed when no approved
binding satisfies route, reasoning, context, independence, permission, and
budget constraints.

Every agent command requires:

- adapter profile;
- explicit working directory;
- permission mode;
- command allowlist;
- timeout;
- log path;
- output path;
- stdout/stderr capture.

## Path policy

Use normalized paths internally.

Path outputs shown to humans may use the platform-native format, but stored state should remain consistent and unambiguous.

## Non-goals

- no requirement to support every shell feature;
- no dependency on WSL;
- no Bash-only test suite;
- no PowerShell-only test suite;
- no arbitrary shell execution for agent adapters by default.

## Future commands

```bash
ch doctor platform
ch doctor commands
ch accept phase-01
```
