# Phase 21 — Platform compatibility and command runner hardening

## Goal

Harden command execution and acceptance testing so `codex-harness` works reliably on Windows, macOS, and Linux.

## Scope

- implement or refine a shared structured command runner;
- add additive platform compatibility hardening without breaking existing installed repos;
- keep existing legacy `[checks].commands` string-array configs readable;
- prefer new structured `[[checks.commands]]` entries for fresh config, docs, and tests;
- reduce Bash-only acceptance dependency;
- add cross-platform Node-based acceptance runner and scripts;
- add `node bin/ch doctor platform`;
- add `node bin/ch doctor commands`;
- normalize path handling where needed for Windows, macOS, and Linux behavior;
- ensure deterministic checks use structured execution;
- ensure agent adapters use structured execution and remain `shell:false` by default.

## Compatibility policy

- existing legacy `[checks].commands` string-array configs remain readable;
- new structured `[[checks.commands]]` format is preferred;
- Phase 21 is additive hardening, not a hard config break.

## Structured command format

Each structured check command entry must define:

- `command`
- `args`
- `cwd` derived from the task worktree, not user-configurable in this phase
- `timeout_seconds`
- `shell` defaults to `false`
- `shell = true` is explicit opt-in only

## Legacy command policy

- legacy strings are tokenized into `command + args` and run with `shell = false`;
- legacy strings fail closed if they contain shell-only syntax:
  - `|`
  - `&&`
  - `||`
  - `;`
  - redirection
  - backticks
  - command substitution
- operators must use structured `shell = true` for advanced shell behavior.

## Phase 21 command surfaces

- `node bin/ch doctor platform`
- `node bin/ch doctor commands`

## Runtime hardening

- use a shared command runner for `command + args + cwd + timeout + shell`;
- deterministic checks use structured execution;
- agent adapters inherit structured execution and remain `shell:false` by default;
- no arbitrary shell-string execution by default.

## Acceptance runner

- add Node-based `scripts/run-acceptance.mjs`;
- discover `tests/acceptance/*.test.mjs` in stable sorted order;
- `npm test` and `npm run test:acceptance` use this runner.
- bare `node bin/ch eval` must not maintain an independent hardcoded list of acceptance test files after Phase 21;
- it must delegate to the new Node-based acceptance runner, or to `npm test` / `npm run test:acceptance` that uses that runner;
- recursion must be prevented with the existing `CODEX_HARNESS_EVAL_RUNNING` guard or equivalent;
- `eval playground ...` must remain unchanged.

## Non-goals

- no Bash-only test requirement;
- no PowerShell-only test requirement;
- no WSL requirement;
- no Phase 22 release/supply-chain work;
- no signing/publishing/provenance;
- no schema migration unless absolutely required;
- no permission expansion;
- no new external capability.

## Acceptance checks

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch doctor platform
node bin/ch doctor commands
```

## Acceptance behavior

- command runner uses `command + args + cwd + timeout + shell`;
- core tests can run on Windows, macOS, and Linux;
- shell mode is opt-in and documented;
- deterministic checks use structured execution rather than arbitrary shell-string execution by default;
- agent adapters inherit the same execution safety model and remain `shell:false` by default;
- existing legacy `[checks].commands` string-array configs remain readable;
- fresh config, docs, and tests prefer structured `[[checks.commands]]`;
- `npm test` and `npm run test:acceptance` run through the Node-based acceptance runner.

## Closeout

Status: PASS and closed for implementation.

Review outcomes:

- Gemini review: PASS, READY_FOR_CLOSEOUT=YES, no scope drift, non-blocking notes only.
- GPT review: PASS, REQUIRED_FIX_BEFORE_CLOSEOUT=None, READY_FOR_CLOSEOUT=YES.

Acceptance checks passed:

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch doctor platform
node bin/ch doctor commands
```

No required fixes before closeout.

Non-blocking follow-up notes (deferred by design):

- Windows `shell:true` quoting remains a future hardening item.
- `scripts/run-acceptance.mjs` sorting can be improved from lexical to numeric/logical ordering.
- TOML-ish parsing remains intentionally simple and may be tracked as future debt.
- `getNpmCommand` duplication can be consolidated later.
- Stale "Phase 20" wording in bare eval regression error text can be cleaned later.
