# Self-Hosting Operator Routing Policy

## Purpose

Define who decides the next self-hosting procedure and how that decision is made.

## Routing owner

The routing owner is **Phase 23.7 Minimum Self-Hosting Operator Interpreter**.

It is not an autonomous architect, not a provider adapter, not a report
generator, and not a new workflow engine. It is a deterministic interpreter
over the Phase 23.6 self-hosting procedure workflow.

## Primary rule

Phase 23.7 must route by interpreting Phase 23.6 procedure contracts. It must
not create a parallel procedure taxonomy.

Canonical procedural source:

```text
skills/self-hosting/**
docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md
docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md
docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md
docs/SELF_HOSTING_SKILL_DISCOVERY.md
```

## Router inputs

The operator interpreter may inspect:

- `TASK.md`;
- current phase task file;
- current roadmap status;
- current run status/lifecycle records;
- existing evidence/delivery facts/review receipts/closeout receipts;
- Phase 23.6 procedure contracts;
- Phase 23.6 source map;
- current task contract and artifacts;
- test/verification results when present.

## Router outputs

The operator interpreter must be able to output:

```text
current_stage:
next_procedure_id:
required_inputs:
missing_inputs:
required_evidence:
missing_evidence:
stop_reason:
next_allowed_action:
forbidden_actions:
review_tier:
notes:
```

## Routing layers

### 1. Workflow routing

Decides current workflow stage and next allowed stage.

Example:

```text
current_stage: PLAN_REVIEW_REQUIRED
next_procedure_id: plan-review
stop_reason: missing_plan_review
next_allowed_action: run plan-review procedure
```

### 2. Procedure routing

Maps stage to existing Phase 23.6 procedure id.

Procedure ids must come from Phase 23.6 unless a reviewed contract amendment
explicitly approves a new procedure.

### 3. Review-tier routing

Classifies the current step as `standard`, `high`, or `extra-high` using
existing Phase 23.6 review intensity concepts and
`docs/SELF_HOSTING_REVIEW_TIER_POLICY.md`.

For `high` and `extra-high` work, the operator may surface the globally defined
`review_tier_controls` and related policy notes through `notes`. Phase 23.7
reports those controls; it does not define them. This is guidance only and is
not a new policy engine, workflow stage, or provider-routing layer.

### 4. Provider/model routing

Provider/model routing is **not owned by Phase 23.7** beyond recording needed
metadata or escalation hints. Full provider/host adapter and independent model
review routing belong to the later provider/host adapter phase.

### 5. Registry/access boundary

Phase 23.8 may materialize procedure metadata and source trace, but it must
not execute roles or choose models. CLI remains the current baseline access
surface. App Server may be recorded as a future candidate only. Phase 25 owns
access/profile/role-execution boundaries.

## Forbidden actions for Phase 23.7

Phase 23.7 must not:

- create a new self-hosting workflow;
- rename Phase 23.6 procedures without explicit reviewed approval;
- implement provider/model routing;
- implement role execution;
- implement App Server integration;
- implement reports/evidence packets;
- implement domain packs;
- implement full proof-carrying framework;
- start implementation without plan approval evidence;
- close a run without required review/verification/delivery-facts evidence;
- create schema migrations unless unavoidable and justified by repo
  architecture. The first implementation must be projection/status-first and
  should avoid schema mutation unless tests prove existing file/runtime/evidence
  state is insufficient.

## Required implementation checks

Phase 23.7 must verify:

- whether it correctly reuses Phase 23.6 procedure ids;
- whether the route table duplicates or conflicts with Phase 23.6;
- whether current repo runtime already provides equivalent behavior;
- whether the operator can be implemented first as projection/status logic
  before DB schema changes;
- whether the routing policy reduces manual dispatcher work for the owner;
- whether registry metadata remains guidance-only until the Phase 25 access
  boundary is implemented.
