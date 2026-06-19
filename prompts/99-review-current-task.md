# Review prompt — current task

Review the current git diff against the task referenced by `TASK.md`.

Read:

- `TASK.md`
- the current task file;
- `docs/PHASE_ACCEPTANCE.md`;
- `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md`;
- any authoritative task/doc/prompt/skill/output-format files touched by the
  diff.

Do not suggest later-phase functionality.

Derive the review surface from:

- active task;
- current diff;
- changed file domains;
- affected procedures;
- stage/routing/review policies;
- required evidence;
- forbidden scope;
- authority boundaries.

If the review surface cannot be determined safely, return
`BLOCKED_REVIEW_SURFACE_UNCLEAR`.

If the diff changes authoritative behavior but source trace or provenance is
unclear, return `BLOCKED_SOURCE_TRACE_UNCLEAR`.

If the diff changes skill/procedure surfaces and risk classification is
unclear, return `BLOCKED_SKILL_RISK_UNCLEAR`.

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
   - if the diff is a fix pass, did it stay bounded to prior findings?
7. Evidence policy:
   - are required tests/fixtures/evidence present?
   - are missing checks stated explicitly instead of hand-waved?
8. Docs-consistency policy:
   - did the diff leave task/docs/prompt/skill surfaces inconsistent about
     authoritative behavior?
   - does the current product self-hosting entrypoint still match the docs?
9. Source-trace policy:
   - is the diff explicit about authoritative vs advisory vs derived sources?
   - are unavailable or moved advisory URLs recorded instead of guessed?
10. Skill-risk policy:
   - if procedure/skill surfaces changed, can scripts/network/tooling/broad
     access risk still be classified safely?
11. Docs-freshness policy:
   - does closeout still require Source-of-Truth Refresh / Documentation
     Garbage Collection?
12. Review-tier control discipline:
   - if the task is `high` or `extra-high`, does the review name the required
     tier controls explicitly?
13. Are there blockers before commit?
14. Did the implementation accidentally include future phases?

Return exactly one of:

```text
PASS

Review surface:
- ...

Policy findings:
- anti_slop: ...
- design_invariant: ...
- scope_legality: ...
- evidence_gap: ...
- docs_consistency: ...
- future_phase_leakage: ...
- review_tier_controls: ...
- source_trace: ...
- skill_risk: ...
- docs_freshness: ...
```

```text
FIX_REQUIRED

Review surface:
- ...

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
- source_trace: ...
- skill_risk: ...
- docs_freshness: ...
```

```text
BLOCKED_REVIEW_SURFACE_UNCLEAR

Blockers:
- ...

Needed:
- ...
```

```text
BLOCKED_SOURCE_TRACE_UNCLEAR

Blockers:
- ...

Needed:
- ...
```

```text
BLOCKED_SKILL_RISK_UNCLEAR

Blockers:
- ...

Needed:
- ...
```
