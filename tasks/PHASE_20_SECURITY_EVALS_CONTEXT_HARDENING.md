# Phase 20 — Security, evals, context, and operator hardening

## Goal

Add the final hardening layer for permissions, regression evals, context budgets, and human operation.

This phase must make the existing Phase 1-19 posture explicit and testable.
It must stay inspect/report only. It must not introduce new runtime enforcement,
new external capabilities, or later-phase platform/release work.

## Scope

- tighten and align the Phase 20 product behavior for:
  - security/permission posture;
  - deterministic local regression evals;
  - prompt context budget inspection;
  - human operator guidance;
- add the following helper commands:
  - `ch security doctor`;
  - bare `ch eval`;
  - `ch context inspect`;
- keep `ch eval playground ...` behavior unchanged from Phase 15;
- add deterministic acceptance coverage for the new inspect/report surfaces.

## Command behavior

### `ch security doctor`

Command surface:

```bash
node bin/ch security --help
node bin/ch security doctor
```

Behavior:

- inspect/report only;
- must not write files;
- must not change permission state;
- must not enable any new external capability;
- must not enforce new runtime permissions beyond existing implemented behavior.

Product repo behavior:

- command succeeds in the real `codex-harness` product repository;
- reports current cwd and repository context;
- reports that the repository is the product repo;
- reports that no installed harness layer is present in the product repo;
- reports installed-layer security audit as unavailable in product-repo context;
- leaves the product repo free of `.harness/`, `.codex/`, and `.agents/`.

Installed target repo behavior:

- command succeeds in an installed target repository when the installed layer
  and config are readable;
- reports current cwd, target root, and installed-layer presence;
- reports the current protected-path posture:
  - default protected paths when no override exists;
  - configured `[checks].protected_paths` override when present;
- reports discovered adapter profile ids under `[agents.*]` when present;
- reports current implemented adapter-profile properties from the installed
  config, including:
  - transport;
  - working directory policy;
  - permission mode;
  - allowed roles;
  - output contract;
  - timeout;
  - human-confirmation requirement;
- reports current implementation posture that external CLI agents remain
  read-only by default;
- reports current implementation posture that no external capability is enabled
  by default.

Failure modes:

- fail closed when installed-repo inspection requires an installed layer and it
  is missing;
- fail closed on malformed adapter config;
- fail closed on unclear permission state;
- fail closed on unknown `security` subcommands or arguments.

### `ch eval`

Command surface:

```bash
node bin/ch eval
node bin/ch eval --help
node bin/ch eval playground init
node bin/ch eval playground smoke
node bin/ch eval playground clean
```

Behavior:

- bare `ch eval` runs deterministic local regression checks only;
- bare `ch eval` is product-repo only;
- bare `ch eval` must not require internet, API access, or external agents;
- bare `ch eval` must report each deterministic local regression step and the
  overall pass/fail result;
- bare `ch eval` may run existing local deterministic commands such as build
  and acceptance tests, but must not invent a new eval platform or broad
  command runner in this phase;
- `ch eval playground ...` remains the existing Phase 15 playground surface and
  must not change behavior in this phase.

Failure modes:

- fail closed when bare `ch eval` runs outside the product repository root;
- fail closed on unknown `eval` arguments;
- return non-zero when any deterministic regression step fails.

### `ch context inspect`

Command surface:

```bash
node bin/ch context --help
node bin/ch context inspect plan
node bin/ch context inspect work
node bin/ch context inspect review
node bin/ch context inspect scout --role <repo-map|tests|docs|security|architecture>
```

Behavior:

- inspect/report only;
- read-only only;
- must not generate prompt files;
- must not update `AGENTS.md`;
- must not create scout outputs;
- must reuse existing prompt/artifact selection logic and preconditions instead
  of creating a second context-selection system;
- must report the exact current prompt context inputs for the requested mode,
  including task/worktree identity, referenced artifact paths, and relevant
  context-policy notes;
- must preserve the rule that raw logs are referenced by path and are not
  prompt context by default.

Mode behavior:

- `context inspect plan`
  - reports the current plan-prompt artifact set and task/worktree context;
- `context inspect work`
  - reports the current work-prompt artifact set, task/worktree context, and
    check-command references;
- `context inspect review`
  - reports the current review-prompt artifact set and task/worktree context;
- `context inspect scout --role <role>`
  - reports the current scout-prompt artifact set for the requested supported
    scout role.

Failure modes:

- fail closed when installed layer is missing;
- fail closed on unsupported context mode;
- fail closed on unsupported scout role;
- fail closed when active task state is missing;
- fail closed when multiple active tasks exist;
- fail closed when worktree metadata is missing;
- fail closed on unknown `context` subcommands or arguments.

## Implementation rules

- keep this phase inspect/report only;
- `security doctor` audits and reports only;
- `context inspect` is read-only only and reuses existing prompt/artifact
  selection logic;
- bare `ch eval` runs deterministic local regression checks only;
- `eval playground` remains unchanged;
- preserve all Phase 1-19 behavior unless this task explicitly changes the
  command/help surface;
- keep product-source and runtime/generated-state boundaries intact;
- do not create `.harness/`, `.codex/`, or `.agents/` in the product repo;
- do not implement Phase 21 platform compatibility hardening;
- do not implement Phase 22 release or supply-chain hardening.

## Non-goals

- no dashboard;
- no API requirement;
- no auto-merge;
- no autonomous self-modification;
- no external agent enabled by default;
- no generalized command runner;
- no new runtime permission-enforcement layer;
- no write-capable external-agent flow;
- no platform-wide shell/Windows hardening beyond the minimum needed for this
  phase's local deterministic checks;
- no release packaging, provenance, dependency-policy, or supply-chain work.

## Acceptance coverage

Acceptance must prove all of the following:

- top-level help includes the new `security`, `context`, and bare `eval`
  surfaces;
- `security --help`, `context --help`, and `eval --help` succeed;
- `security doctor` succeeds in:
  - the product repo;
  - an installed target repo with readable installed config;
- `security doctor` fails closed for:
  - missing installed layer where installed-layer inspection is required;
  - malformed adapter config;
  - unclear permission state;
- `context inspect` succeeds for:
  - `plan`;
  - `work`;
  - `review`;
  - `scout --role tests`;
- `context inspect` fails closed for:
  - unsupported context mode;
  - unsupported scout role;
  - missing active task;
  - multiple active tasks;
  - missing worktree metadata;
  - missing installed layer;
- bare `ch eval` succeeds as a deterministic offline product-repo regression
  run;
- `eval playground` acceptance behavior remains unchanged from Phase 15;
- read-only inspection commands do not mutate git-tracked repo state in product
  or installed-repo test cases;
- the product repo still has no `.harness/`, `.codex/`, or `.agents/`.

## Acceptance commands

```bash
npm run build
node bin/ch --help
node --test tests/acceptance/phase1-cli.test.mjs tests/acceptance/phase15-playground-evals.test.mjs tests/acceptance/phase20-security-evals-context-hardening.test.mjs
```

## Acceptance behavior

- `ch security doctor` is available, read-only, and audit/report only;
- `ch security doctor` reports the current product-repo and installed-repo
  posture without changing permission state;
- `ch context inspect` is available, read-only, and reports current prompt
  context inputs using the existing prompt/artifact selection logic;
- bare `ch eval` runs deterministic local regression checks without internet or
  API dependency;
- `ch eval playground ...` remains the existing Phase 15 surface and behavior;
- explicit failure modes are implemented for:
  - missing installed layer;
  - malformed adapter config;
  - unclear permission state;
  - unsupported context mode;
  - unsupported scout role;
  - missing active task;
  - multiple active tasks;
  - missing worktree metadata;
  - outside-product-repo bare `ch eval`;
- prompt context has a budget policy and the inspect surface reflects that raw
  logs are referenced by path rather than pasted wholesale;
- operator manual explains safe workflow for the implemented Phase 20 posture;
- no read-only inspection command mutates repo state;
- no new external capability is enabled by default;
- the product repo remains free of generated `.harness/`, `.codex/`, and
  `.agents/` paths.
