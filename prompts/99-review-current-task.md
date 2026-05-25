# Review prompt — current task

Review the current git diff against the task referenced by `TASK.md`.

Read:

- `TASK.md`
- the current task file;
- `docs/PHASE_ACCEPTANCE.md`.

Do not suggest later-phase functionality.

Check:

1. Does the diff satisfy the current task acceptance criteria?
2. Are all required files present?
3. Are non-goals respected?
4. Anti-slop/code-quality policy:
   - did the diff add unnecessary abstraction, wrappers, or framework-like
     structure?
   - is any new helper used only once without a clear reason?
   - did docs or reports become more confident than the evidence justifies?
5. Design/taste/invariant policy:
   - are authority boundaries preserved?
   - are generated/local artifacts still non-canonical?
   - are stable-identity and projection/status-first rules preserved where
     relevant?
6. Scope legality:
   - are all changes required by the current task and approved plan?
   - did implementation silently include adjacent work or future-phase scope?
7. Evidence policy:
   - are required tests/fixtures/evidence present?
   - are missing checks stated explicitly instead of hand-waved?
8. Docs-consistency policy:
   - did the diff leave task/docs/prompt/skill surfaces inconsistent about
     authoritative behavior?
9. Review-tier control discipline:
   - if the task is `high` or `extra-high`, does the review name the required
     tier controls explicitly?
10. Are there blockers before commit?
11. Did the implementation accidentally include future phases?

Return exactly:

```text
PASS
```

or:

```text
FIX_REQUIRED

Blockers:
- ...

Policy findings:
- anti_slop: ...
- design_invariant: ...
- scope_legality: ...
- evidence_gap: ...
- docs_consistency: ...
- future_phase_leakage: ...
- review_tier_controls: ...
```
