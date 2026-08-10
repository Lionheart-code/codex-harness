# Source Notes: DB Storage Review

Source map authority: `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`

## internal_sources

- `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`
- `docs/SECURITY_AND_PERMISSION_MODEL.md`
- `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`

## official_codex_sources

- Codex Hooks documentation where hook behavior intersects evidence handling

## external_advisory_sources

- `agents-best-practices`

## community_pattern_sources

- Storage review patterns from community packs, pattern-only

## adopted

- Storage authority checks
- Harvest and idempotency review
- Audit versus authority distinction

## adapted

- Review proposals against codex-harness DB-first lifecycle rules.

## rejected

- JSONL as primary new authority
- Hooks as accepted-memory writers

## phase_23_9_adaptation

- DB/storage review is a separately recorded lens inside the shared fresh
  planning bundle and owns identity/cardinality/transaction/harvest contracts.
