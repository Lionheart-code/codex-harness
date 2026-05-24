# Phase 28 - Domain Ingestion and Schema Evolution Safety

## Purpose

Define safe ingestion and schema-evolution primitives for future domain packs.

## Core idea

Future domain runtimes may ingest broad raw data, but raw data must not become
accepted memory or repo source automatically.

## Lifecycle

```text
raw ingestion
-> classification
-> chunk/compress when needed
-> structured extraction
-> quarantine/discard/memory candidate
-> review/acceptance
-> durable accepted facts
```

## Schema evolution

Schema changes require:

- proposal;
- impact analysis;
- migration plan;
- tests/validation;
- approval;
- rollback strategy.

## Non-goals

- Do not implement a production Ozon/CRM/marketing system.
- Do not allow agents to mutate domain schema automatically after each new data
  point.
