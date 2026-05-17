# Phase 9 — Project memory and debt ledger

## Goal

Create the governed project memory layer that tracks what was done, what was not done, decisions, debt, follow-ups, and accepted summaries.

This phase prevents large projects from becoming confusing after many agent runs.

## Scope

- create `.harness/memory/` structure;
- create decision log format;
- create debt ledger format;
- define task report done/not-done sections;
- add commands:
  - `ch memory status`
  - `ch debt list`
  - `ch debt add`
  - `ch debt resolve`
  - `ch decisions list`
  - `ch decisions add`
- define accepted/stale/rejected states for agent outputs;
- update report templates to include debt/follow-ups once report phase exists.

## Required memory structure

```text
.harness/memory/
  project-index.md
  decisions/
  debt/
    debt.jsonl
    debt.md
  summaries/
```

## Debt item fields

```json
{
  "debt_id": "DEBT-0001",
  "title": "...",
  "type": "technical | architectural | test | documentation | security | process",
  "severity": "low | medium | high",
  "created_by_task": "...",
  "created_by_agent_run": "...",
  "reason": "...",
  "location": [],
  "impact": "...",
  "paydown_condition": "...",
  "status": "open | in_progress | resolved | accepted | obsolete"
}
```

## Non-goals

- no vector database;
- no hidden automatic memory;
- no autonomous debt resolution;
- no dashboard;
- no deletion of raw logs;
- no LLM memory compaction yet.

## Acceptance commands

```bash
npm run build
tmp="$(mktemp -d)"
(
  cd "$tmp" &&
  git init &&
  git config user.email "test@example.com" &&
  git config user.name "Test User" &&
  printf "# test\n" > README.md &&
  git add README.md &&
  git commit -m "init" &&
  node "$OLDPWD/bin/ch" install &&
  node "$OLDPWD/bin/ch" init "test task" &&
  node "$OLDPWD/bin/ch" debt add --title "test debt" --type technical --severity low --reason "test" &&
  node "$OLDPWD/bin/ch" debt list &&
  node "$OLDPWD/bin/ch" decisions add --title "test decision" --reason "test" &&
  node "$OLDPWD/bin/ch" decisions list &&
  test -f .harness/memory/debt/debt.jsonl &&
  test -f .harness/memory/project-index.md
)
```

## Acceptance behavior

- memory folder exists;
- debt can be added/listed/resolved;
- decisions can be added/listed;
- unresolved debt is visible;
- no raw logs are deleted;
- no LLM/API call is required.
