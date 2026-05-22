---
name: codex-harness-db-storage-review
description: Use this skill when codex-harness work touches memory, storage, lifecycle, delivery-facts, or harvest behavior and must be reviewed against the Phase 23.5 authority model.
---

# DB Storage Review

## procedure_id
`db-storage-review`

## title
DB Storage Review

## purpose
Review storage, lifecycle, and authority changes against the Phase 23.5 model.

## when_to_use
- The task touches Project Memory DB, Run/Staging DB, delivery facts, harvest,
  or lifecycle authority.
- The task is `high` or `extra-high`.
- A plan or diff might reopen the DB-first authority decision.

## required_inputs
- Draft plan or implementation diff
- Phase 23.5 task contract
- Relevant storage, schema, and security docs
- Review intensity tier

## preconditions
- The affected storage or lifecycle area is identified clearly enough to review.
- Phase 23.5 boundary docs have been read.

## forbidden_scope
- Do not redefine primary memory authority in Phase 23.6.
- Do not treat hooks as accepted memory writers.
- Do not reintroduce JSONL or loose artifacts as primary new operational memory.

## checklist
- Check accepted authority versus audit or compatibility layers.
- Check delivery-facts import and closeout implications.
- Check harvest, idempotency, and deletion-boundary implications.
- Check for hidden runtime-state or schema creep.

## expected_output_format
Return the exact section order documented in
`references/output-format.md`.

## blocker_conditions
- The proposal does not identify affected storage or lifecycle records clearly.
- Repo docs conflict on authority or closeout rules.
- The task depends on a later-phase reporting or access capability.

## evidence_to_record
- Storage authority findings
- Lifecycle and delivery-facts findings
- Keep, defer, or split recommendation

## phase_23_5_dependencies
- Project Memory DB remains accepted authority.
- Run/Staging DB remains the active write target.
- Delivery facts, closeout, and harvest remain explicit lifecycle gates.

## phase_24_packet_dependencies
- Later `DB/storage-review packet` manifests should cite `db-storage-review`.

## source_adaptation_notes
### internal_sources
- `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`

### official_codex_sources
- Codex Hooks documentation where hook behavior intersects evidence handling

### external_advisory_sources
- `agents-best-practices`

### community_pattern_sources
- Storage review patterns from community packs, pattern-only

### adopted
- Storage authority checks
- Harvest and idempotency review
- Audit versus authority distinction

### adapted
- Compare proposals directly against codex-harness Project Memory, staging, and
  delivery-facts rules.

### rejected
- JSONL as primary new authority
- Hooks as accepted Project Memory writers

## authority_level
`binding`
