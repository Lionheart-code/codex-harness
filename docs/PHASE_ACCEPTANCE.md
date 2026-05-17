# Phase Acceptance Rules

## Global acceptance rules

Every phase promoted to the current `TASK.md` must have:

- explicit scope;
- explicit non-goals;
- concrete files to create/change;
- concrete commands to run;
- clear fail conditions;
- scoped diff.

A phase is not ready to become the current `TASK.md` unless its task file contains both:

- `## Acceptance commands` with runnable shell commands;
- `## Acceptance behavior` with observable expected results.

Roadmap-level phases may remain less detailed, but before a phase is implemented, its task file must be tightened without adding new product scope.

## Current phase acceptance

The current phase acceptance lives in the task file referenced by `TASK.md`.

## Fail if

- implementation includes later-phase features;
- build/test commands fail;
- acceptance commands are missing;
- undocumented heavy dependency is introduced;
- dry-run writes files;
- user files can be overwritten without backup/confirmation.
