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
node bin/ch install --dry-run
node bin/ch init "test task" --dry-run
```

## Playground evals

Use:

```text
codex-harness-playground/
```

With sample projects:

```text
python-app/
ts-app/
mixed-project/
```

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
