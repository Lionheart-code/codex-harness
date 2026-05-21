# Project Memory, Status, and Debt Ledger

## Purpose

Large agent-assisted projects become confusing if every agent writes isolated notes without a governed memory structure.

`codex-harness` must preserve enough context for future agents and humans to answer:

- what was done;
- what was not done;
- what was attempted;
- what failed;
- what decisions were made;
- what technical debt was introduced;
- what must be revisited;
- which agent produced which artifact;
- which artifacts are trusted, superseded, or stale.

## Core principle

Raw logs are not project memory.

Project memory must be layered:

```text
raw logs
  immutable evidence

agent run ledger
  who did what, when, with which role/profile

task state
  current lifecycle status

task report
  human-readable result

decision log
  why important choices were made

debt ledger
  known unfinished work, shortcuts, risks, follow-ups

project index
  compact map of current project structure and active concerns

memory compaction
  periodic summaries that keep context usable
```

## Memory layers

### 1. Raw artifacts

Stored under:

```text
.harness/tasks/<task-id>/logs/
.harness/tasks/<task-id>/agents/<run-id>/
```

Use for audit and debugging.

Do not feed all raw logs into every future prompt.

### 2. Task state

Stored under:

```text
.harness/tasks/<task-id>/state.json
```

Must answer:

- task id;
- status;
- current phase;
- branch;
- worktree;
- checks status;
- review status;
- linked debt items;
- linked decisions;
- linked agent runs.

### 3. Task report

Stored under:

```text
.harness/tasks/<task-id>/result.md
```

Must include:

- done;
- not done;
- changed files;
- tests/checks;
- risks;
- follow-ups;
- debt created/resolved;
- next human action.

### 4. Decision log

Stored under:

```text
.harness/memory/decisions/
```

Each decision record should include:

```text
decision id
date
context
decision
alternatives considered
reason
affected files/modules
related task ids
superseded_by
status: active | superseded | rejected
```

This is similar in spirit to ADRs, but harness-local and task-linked.

### 5. Debt ledger

Stored under:

```text
.harness/memory/debt/debt.jsonl
.harness/memory/debt/debt.md
```

Each debt item should include:

```json
{
  "debt_id": "DEBT-0001",
  "title": "Temporary simple task template",
  "type": "technical | architectural | test | documentation | security | process",
  "severity": "low | medium | high",
  "created_by_task": "TASK-ID",
  "created_by_agent_run": "RUN-ID",
  "reason": "why this debt exists",
  "location": ["file or module"],
  "impact": "what can go wrong",
  "paydown_condition": "when/how to fix",
  "status": "open | in_progress | resolved | accepted | obsolete",
  "owner": "human | harness | unknown"
}
```

Debt must be explicit. Hidden debt is a harness failure.

### 6. Project index

Stored under:

```text
.harness/memory/project-index.md
```

It should summarize:

- main modules;
- important commands;
- active architecture decisions;
- active debt;
- recent completed tasks;
- open tasks;
- known risky areas.

This file is the compact context entrypoint for future agents.

### 7. Memory/Evidence Core

Phase 23 adds a durable evidence backend under local/private runtime paths:

```text
.harness/evidence/events.jsonl
.harness/evidence/projection.sqlite
.harness/artifacts/sha256/<prefix>/<hash>
```

The JSONL ledger is the append-only source-of-trace. SQLite is only a rebuildable projection/query cache behind typed repository interfaces. Raw SQL is not a public CLI/API. Large stdout/stderr, diffs, logs, review reports, and raw outputs belong in the ArtifactStore and are referenced by hash/id.

Evidence records are scoped by:

```text
target_project_id
target_root
namespace
run_id
phase_id/task_id where applicable
evidence_type
```

This lets one local backend serve harness self-hosting, ordinary project work, and future pack/domain workflows without becoming a global dump. Memory is evidence storage and retrieval. It is not an autonomous agent brain, semantic memory, or automatic summarizer.

Reusable evidence must match its exact declared input set and producer command set. For local verification, `VerifiedSnapshot` / `ChangeSetFingerprint` includes root, project id, namespace, commits, git status with untracked files, tracked diff fingerprint, untracked content hashes, command-set hash, command results, artifact refs, timestamp, and change classification. Docs/task-only changes may be classified separately, but local reuse never satisfies remote CI.

### 8. Memory compaction

Stored under:

```text
.harness/memory/summaries/
```

Compaction converts many raw artifacts into small summaries.

Rules:

- never delete raw logs automatically;
- mark old summaries as stale if underlying tasks changed;
- keep minority/contradictory findings if they may matter;
- do not treat stale summaries as truth.

## Done / not done tracking

Every task report must explicitly contain:

```md
## Done

## Not done

## Checks

## Risks

## Follow-ups

## Debt created

## Debt resolved

## Next action
```

If `Not done` is not empty, the harness must create or link follow-up/debt items.

## Debt policy

A task may be marked ready only if:

- all high-severity debt introduced by the task is resolved or explicitly accepted by human;
- unresolved medium/low debt is recorded in the debt ledger;
- debt has a paydown condition;
- debt is visible in final report.

## Agent output trust policy

Agent outputs can be:

```text
raw
reviewed
accepted
superseded
stale
rejected
```

Only `accepted` outputs may become project memory.

Raw scout findings can inform a builder, but must not silently become architectural truth.

## Commands planned for future phases

```bash
ch memory status
ch memory index
ch memory compact
ch debt list
ch debt add
ch debt resolve
ch decisions list
ch decisions add
```

## Non-goals for early MVP

- no vector database;
- no automatic hidden memory;
- no deletion of raw logs;
- no autonomous debt resolution;
- no dashboard required.

## Why this matters

The harness must prevent large projects from becoming a pile of disconnected agent outputs.

The final goal is not “more logs”. The final goal is governed continuity.
