# Harness Evals and Regression

## Purpose

The harness needs regression tests for its own behavior, not only project tests.

A harness change is not good merely because an agent says it is good.

## Eval categories

```text
install idempotency
dry-run safety
forbidden file detection
dirty repo refusal
task state creation
worktree creation
prompt generation
scout prompt read-only contract
agent run ledger recording
debt creation/resolution
schema validation
upgrade dry-run
report completeness
hooks behavior
context budget compliance
```

## Deterministic evals

Must run locally without API or internet.

Examples:

```bash
npm run build
npm test
node bin/ch eval
node bin/ch install --dry-run
node bin/ch init "test task" --dry-run
```

Phase 20 adds bare `node bin/ch eval` as a deterministic local regression
runner for the product repository.

Rules:

- it must run locally without API or internet dependency;
- it must fail closed outside the product repository root;
- it must not replace or broaden the Phase 15 playground contract;
- `node bin/ch eval playground ...` remains the playground surface.

## Playground evals

Use:

```text
codex-harness-playground/
```

With sample projects:

```text
python-app/
ts-app/
```

Phase 15 command surface:

```bash
node bin/ch eval playground init
node bin/ch eval playground smoke
node bin/ch eval playground clean
```

Rules:

- The playground is a disposable managed external workspace, not a new product subsystem.
- The default local/manual root is the literal sibling `../codex-harness-playground`.
- Automated tests may use temporary roots through `--root <path>`.
- Local deterministic smoke must run without API or internet dependency.
- `smoke-results.json` must record deterministic results for exactly 4 executed local E2E scenarios.
- The full 20-task corpus remains metadata for manual release evaluation, not the local acceptance gate.
- Cleanup must delete only a managed playground with the marker file and must refuse unmanaged targets.

## Agent-backed evals

Agent-backed evals are optional release checks, not required local acceptance.

They may measure:

- pass rate;
- time to ready;
- manual interventions;
- cost/limit pressure;
- review usefulness;
- unsafe command attempts;
- debt created/resolved.

## Regression rule

A harness change should not be accepted unless:

- deterministic evals pass;
- relevant phase acceptance passes;
- no known safety regression is introduced;
- rollback path exists for migrations/upgrades.
