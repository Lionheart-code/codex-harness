# Context Budget Policy

## Purpose

Large projects and many agent outputs can overwhelm agent context.

The harness must control what enters a prompt.

## Core rule

Raw logs are not prompt context.

Prompt context should be selected, compact, and task-relevant.

## Context layers

```text
AGENTS.md
  short repo law

TASK.md
  current phase/task pointer

task spec / acceptance
  exact current task

project-index.md
  compact project map

scout summaries
  selected findings only

debt/decisions
  only active and relevant items

raw logs
  referenced by path, not pasted wholesale
```

## Budget rules

Recommended defaults:

```text
AGENTS.md: short, operational
task prompt: bounded to current task
scout summaries: concise, role-specific
project-index.md: compact entrypoint
raw logs: path references only
```

## Prompt builder obligations

The prompt builder must:

- include task identity;
- include paths to source artifacts;
- include only relevant summaries;
- avoid dumping all memory;
- warn when prompt context is too large;
- prefer references over raw content when safe.

## Compaction

Compaction must:

- preserve raw artifacts;
- mark stale summaries;
- record source artifacts used;
- keep unresolved contradictions visible;
- never silently convert raw findings into accepted project truth.

## Multi-agent context

Different agents may receive different context.

Examples:

```text
scout
  narrow read-only prompt, output path, no project history dump

builder
  spec, acceptance, selected scout summaries, worktree path, checks

verifier
  diff, acceptance, verifier output, result, relevant debt/decisions
```
