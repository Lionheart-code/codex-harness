# Phase 23.8.6E - Authority Surface Freshness and Downstream Task Revalidation

## Status

Planned. Starts only after Phase 23.8.6C2 Bootstrap Authority Correctness and
Phase 23.8.6D Procedure Artifact Payload Storage and Worktree Retention are
complete, reviewed, accepted, and merged.

## Purpose

Revalidate future/live authority surfaces after the near-term 23.8.6 chain has
changed verification policy, bootstrap assumptions, and storage/harvest facts.

This is post-implementation freshness reconciliation against actual C2/D
facts. C1A already owns the routing/context/model-policy architecture; E checks
that allocation for continued accuracy, removes stale live wording, and may
record mechanically checkable residual drift as Phase 30 candidates. It does
not repeat the research or become first owner of the architecture.

## Problem

Repo authority can drift after implementation, review, fix-pass, closeout,
roadmap wiring, storage discoveries, verification discoveries, bootstrap
discoveries, or external architectural updates. The current `TASK.md` versus
roadmap mismatch proves that stale authority surfaces can accumulate even when
historical task history remains useful.

## Scope

This is a bounded docs/task-contract revalidation phase only. It checks
future/live authority surfaces for freshness and updates only the surfaces that
are still supposed to guide current or future work.

## Required behavior

- Check at least these authority surfaces:
  - `TASK.md` active pointer;
  - roadmap active/current wording;
  - task status fields;
  - future/live task assumptions;
  - procedure docs;
  - review-tier and model-policy docs;
  - model/profile registry defaults versus manual invocation guidance;
  - context-budget, compaction, and handoff guidance;
  - operator/manual docs;
  - packet/report docs;
  - verification guidance;
  - storage/harvest assumptions;
  - bootstrap/operator assumptions;
  - downstream dependency notes.
- Include a lightweight mechanical authority-drift check. If a repo-owned
  docs/task validation command exists in the implementation context, use it;
  otherwise produce a bounded scripted/search checklist that checks at least:
  - stale present-tense `TASK.md currently points...` claims;
  - stale present-tense phase status claims such as planned/blocked wording for
    already accepted or merged phases;
  - accepted/merged near-term phases that still leave the previous phase marked
    active/current or the immediate next phase marked blocked in live
    authority;
  - near-term phase ordering that skips an inserted active phase such as
    direct `23.8.6B -> 23.8.6B2` wording;
  - duplicate or conflicting "active/current task" authority claims;
  - broad wording that makes Phase 23.8.6B1 look like general Phase 31 runner
    execution;
  - future/live surfaces that treat display `run_id` alone as durable or
    accepted-memory identity; and
  - future/live surfaces that treat request files, blocker notes, or diagnosis
    notes as accepted review artifacts or accepted memory.
  - future/live surfaces that treat dirty local diffs, draft PR text, or
    run-local audit markdown as permission to advance `TASK.md`, current phase
    status, or downstream task readiness; and
  - future/live surfaces that collapse historical supporting-fix or
    adjacent-slice artifacts into current active-task authority.
- Reconcile checked-in reviewer/model profile authority with live manual and
  operator guidance. Record intentional deviations as explicit operator
  choices rather than silent lower-cost defaults.
- Reconcile context-budget, compaction, and handoff guidance so active task,
  effective plan, approval state, source authority, and validation obligations
  cannot be dropped or replaced by conversational summaries.
- Distinguish future/live authority surfaces from historical/accepted task
  history.
- Update only future/live authority surfaces that are stale against current
  code, current roadmap authority, or explicitly planned future task contracts.
- Leave historical/accepted task history broadly intact unless repo policy
  already allows a narrow annotation.
- Produce a bounded freshness/revalidation report rather than a broad roadmap
  rewrite.
- Record repeated authority-drift patterns as Phase 30 eval or cleanup
  candidates when they are recurring and mechanically checkable; do not turn
  this phase into an experimentation loop.

## Non-goals

- No runtime implementation.
- No broad roadmap rewrite.
- No cleanup of all old tasks for style.
- No model/subagent runtime policy implementation.
- No replacement for Phase 30 bounded experimentation.
- No replacement for Phase 31 reviewed runner execution.
- No domain-pack work.
- No automatic rewriting of every future task.

## Acceptance commands

```bash
git diff --check
```

## Acceptance behavior

- The revalidation pass checks every required authority surface category listed
  above.
- The mechanical authority-drift check or checklist records the exact patterns
  checked, the matching files, and whether each match is stale future/live
  authority, acceptable historical context, or unrelated text.
- The implementation clearly distinguishes stale future/live authority surfaces
  from historical/accepted task history.
- Only future/live files that are actually stale are updated.
- Historical/accepted tasks are not broadly rewritten just to make old text
  cleaner.
- A bounded freshness report records:
  - which authority surfaces were checked;
  - which downstream task assumptions were confirmed;
  - which downstream task assumptions were stale;
  - which future/live files were updated;
  - which files were intentionally not updated and why;
  - remaining debt or risks.
- If a lightweight repo-owned docs/task validation command exists in the
  implementation context, it must also pass.
- Keep verification bounded to the revalidation surfaces unless a reviewed
  task-specific blocker requires more.
- If a full-pack proof is needed, use `npm test` as the canonical command and
  treat `npm run test:acceptance` as a compatibility alias only.

## Source/runtime boundary

This phase is docs/task/procedure/policy authority only. It must not implement
runtime features, SQL storage logic, bootstrap commands, runner behavior,
provider/model routing, packet execution, or domain-pack behavior.

## Relationship to previous and next phases

- Follows Phase 23.8.6C2 and Phase 23.8.6D so the revalidation can incorporate
  real bootstrap-authority, verification, and storage discoveries rather than
  planning guesses.
- Prepares Phase 23.8.7, Phase 23.9, Phase 24A/24B, and later live/planned
  authority surfaces to inherit current facts instead of stale assumptions.
- Preserves Phase 30 as the future home for bounded experimentation and Phase
  31 as the future home for reviewed runner execution.

## Final report expectations

The implementation report for this phase must include:

- the checked authority surfaces;
- the confirmed downstream assumptions;
- the stale downstream assumptions;
- the future/live files updated;
- the files intentionally left untouched and why;
- verification results;
- remaining debt or risk.
- any recurring mechanically checkable drift patterns proposed as Phase 30 eval
  or cleanup candidates.
