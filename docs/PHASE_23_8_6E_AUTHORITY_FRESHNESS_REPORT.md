# Phase 23.8.6E Authority Freshness Report

## Scope and method

This bounded pass checked the active future/live authority surfaces listed in
the E contract. It used repository searches for active-pointer claims, phase
status wording, near-term ordering, review-profile fields, durable-evidence
guidance, handoff boundaries, and runtime launch behavior. Historical accepted
task contracts were read as context and were not rewritten.

## Checked authority surfaces

| Surface category | Checked files or product source | Result |
|---|---|---|
| Active task and roadmap | `TASK.md`, `docs/IMPLEMENTATION_ROADMAP.md` | Both select Phase 23.8.6E; the roadmap orders E before the newly inserted 23.8.6F and then 23.8.7. |
| Task status and downstream contracts | E, 23.8.6F, 23.8.7, 23.9, and 24A/24B task contracts | E is active; downstream work remains planned and blocked by documented predecessors. |
| Procedure and review-profile authority | procedure registry, registry schema, parser | Plan review remains Sol High and implementation review remains Terra High; profiles now state `terminal_completion_only`. |
| Manual/operator/model policy | model policy, operator stage map, operator manual | Manual guidance is aligned with registry authority and the exclusive review-launch ownership state is documented. |
| Context and handoff authority | context budget, operations plan, stage map | Active-task, durable-artifact, compaction, and phase-neutral native successor rules remain explicit. |
| Verification, storage, and harvest | task acceptance, runtime, delivery-facts, harvest product source | Verification remains task-driven; delivery import and harvest reject an active review-launch claim. |
| Packet/report and downstream boundaries | roadmap and future task contracts | Cost-aware context reuse remains deferred to 23.8.6F; packet automation and general reviewed runner execution remain deferred to 23.8.7 and Phase 31. |

## Mechanical authority-drift checklist

The following exact bounded searches were run from the prepared E worktree
before edits. Each match was classified as current authority, downstream
contract, historical context, or non-authoritative incidental prose; no match
was treated as permission to advance merely because it mentioned a phase.

```bash
rg -n -i 'Implement only:|Current Task|23\\.8\\.6E|23\\.8\\.7|23\\.9|24A|24B' \
  TASK.md docs tasks
rg -n -i 'active task|active phase|planned|blocked|predecessor|deferred' \
  docs tasks
rg -n 'plan-review|implementation-review|timeout_seconds|stale_after_seconds|termination_policy' \
  skills/self-hosting src/core schemas
rg -n -i 'run_instance_id|delivery facts|harvest|procedure artifact|terminal child|review launch' \
  docs src/core skills/self-hosting tasks
rg -n -i 'thread/start|app-server|native readback|created-task link|HANDOFF_CREATION_FAILED' \
  docs tasks skills/self-hosting
```

The matching live authority files were `TASK.md`,
`docs/IMPLEMENTATION_ROADMAP.md`, `docs/OPERATIONS_PLAN.md`,
`docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md`,
`docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`,
`skills/self-hosting/procedure-registry.json`,
`src/core/runtime.ts`, `src/core/self-hosting-procedures.ts`,
`src/core/delivery-facts.ts`, `src/core/harvest.ts`, and the E plus listed
downstream task contracts. The E contract and `TASK.md` were classified as
current selection authority; 23.8.6F, 23.8.7, 23.9, and 24A/24B were classified as
downstream contracts only; accepted earlier task artifacts were historical
context and were not edited.

| Matching file set | Classification | Disposition |
|---|---|---|
| `TASK.md`, `docs/IMPLEMENTATION_ROADMAP.md` | Current task-selection and near-term ordering authority | Confirmed E active, followed by planned 23.8.6F and then 23.8.7; no stale pointer edit needed. |
| `tasks/PHASE_23_8_6E_*.md` | Active contract | Expanded only through the approved narrow liveness correction already present in the contract. |
| `tasks/PHASE_23_8_6F_*.md`, `tasks/PHASE_23_8_7_*.md`, `tasks/PHASE_23_9_*.md`, `tasks/PHASE_24A_*.md`, `tasks/PHASE_24B_*.md` | Downstream contracts | Confirmed as future/deferred; not activated. |
| `docs/OPERATIONS_PLAN.md`, `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md`, `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md` | Live procedure/operator authority | Updated for native handoff proof, terminal-only liveness, exclusive owner stage, and measured timing. |
| `skills/self-hosting/procedure-registry.json`, its schema, and `src/core/self-hosting-procedures.ts` | Live registered-profile authority | Updated to make the explicit profile policy and omitted-field default agree. |
| `src/core/runtime.ts`, `src/core/delivery-facts.ts`, `src/core/harvest.ts` | Product implementation authority | Updated only for claim ownership, monitoring-only staleness, and guarded lifecycle writes. |
| `tasks/PHASE_23_8_6A_*.md`, `tasks/PHASE_23_8_6B*.md`, `tasks/PHASE_23_8_6C*.md`, `tasks/PHASE_23_8_6D_*.md` | Historical accepted task contracts | Left unchanged; these are context, not current task-selection authority. |
| `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md`, `docs/HUMAN_OPERATOR_MANUAL.md`, source-map prose | Incidental/manual-policy matches | Checked for contradiction only; no active-pointer or lifecycle permission is derived from them. |

| Pattern | Classification |
|---|---|
| Present-tense `TASK.md` pointer claims | Current live pointer and roadmap agree on E. |
| Planned/blocked wording for accepted near-term phases | Historical status is retained as historical context; no live phase was left incorrectly active. |
| Immediate ordering such as `23.8.6B -> 23.8.6B2` | No live skipped-order authority found; the live order is D, E, F, then 23.8.7. |
| Duplicate/conflicting active-task claims | `TASK.md` and roadmap agree; incidental prose is not task-selection authority. |
| B1 wording that broadens into Phase 31 execution | Historical B1 material remains historical; live roadmap preserves Phase 31 as the general runner boundary. |
| Display `run_id` as durable identity | Live storage/harvest guidance retains exact `run_instance_id` authority. |
| Request, blocker, or diagnosis notes as accepted review/memory | Operator guidance continues to require recorded procedure artifacts and terminal launch evidence. |
| Dirty diff, draft PR, or run-local markdown as permission to advance | No live authority grants advancement from those artifacts alone. |
| Historical supporting-fix artifacts as current authority | Historical artifacts remain untouched; the active task and exact reviewed plan remain the implementation authority. |

## Reconciled stale authority

The stale launch rule treated silence on stdout/stderr as permission to kill a
file-output reviewer. The corrected authority is deliberately narrow:

- a claim is persisted before spawn, so only one original launcher owns a
  review attempt;
- `stale_after_seconds` records `progress_unknown` and never calls `SIGTERM`;
- `timeout_seconds` remains the only automatic termination deadline;
- only terminal child exit plus the original owner claim may ingest a result;
- a missing original owner remains fail-closed and requires explicit human
  recovery, discard, and a fresh run; and
- procedure recording, approval, verification, remote-status, closeout,
  next-task transitions, delivery import, and harvest check that claim inside
  their authoritative staging write transaction before mutation; and
- delivery, verification, closeout, next-task transitions, and harvest cannot
  advance while a claim remains.

Focused acceptance coverage proves a silent reviewer that writes a valid
artifact after the stale interval is accepted without a stale-triggered signal,
and separately proves that only the agreed hard deadline sends `SIGTERM`.

## Updated files in this bounded pass

- `src/cli/run.ts`, `src/core/runtime.ts`, `src/core/run-staging-db.ts`,
  `src/core/self-hosting-procedures.ts`,
  `src/core/delivery-facts.ts`, and
  `src/core/harvest.ts`: terminal-only review termination, exclusive launch
  ownership, compatibility-state seeding, transactional lifecycle guards, and
  truthful verification timing output.
- `schemas/runtime-run.schema.json` and
  `schemas/self-hosting-procedure-registry.schema.json`: durable claim and
  optional/defaulted policy representation.
- `skills/self-hosting/procedure-registry.json` and
  `skills/self-hosting/verification-review/SKILL.md`: explicit policy on the
  two registered review launch profiles and measured verification timing.
- `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md`,
  `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`, `docs/HUMAN_OPERATOR_MANUAL.md`,
  and `docs/OPERATIONS_PLAN.md`: live operator, timing, and native successor
  procedure authority.
- `tests/acceptance/phase23-8-6b1-review-launch.test.mjs`: silent-output,
  hard-deadline, profile-compatibility, and ownership coverage.
- `tests/acceptance/phase23-8-6c1-task-contract-rebase.test.mjs`,
  `tests/acceptance/phase23-8-6c1a-routing-context-authority-rebase.test.mjs`,
  `tests/acceptance/phase23-8-6c2a-task-materialization-environment-bootstrap.test.mjs`,
  and `tests/acceptance/phase23-8-agent-native-procedure-registry-and-skill-surface.test.mjs`:
  active-phase expectations plus progression-derived roadmap and immediate
  predecessor invariants, compatibility-race coverage, and timing-output proof.
- `tests/helpers/phase-authority.mjs`: shared parsing for published progression
  and independently extracted roadmap sections.
- `docs/PHASE_23_8_6E_AUTHORITY_FRESHNESS_REPORT.md`: this bounded report and
  its exact search/match/disposition record.

## Verification result

`npm run build`, the focused authority/liveness acceptance groups, and
`git diff --check` passed. The final post-correction canonical `npm test` passed
all 285 tests in 553,778 ms (about 9m14s), including the 279,073 ms nested Phase
20 deterministic evaluation. Earlier observed full packs reached about 17m30s,
so live timing guidance now states 9-18 minutes as an observation range rather
than a timeout or duration guarantee.

## Native Desktop successor handoff observation

The observed handoff used the product-owned persistent native app-server
`thread/start` boundary with the prepared worktree `cwd`. Native readback
returned task/thread metadata and the created-task link, then the captured
cwd, branch, and `HEAD` were checked against the prepared authority. The
predecessor stopped before any successor turn/start, bootstrap, Harness run,
or shell action. The live procedure remains phase-neutral and idempotent only
for one uniquely matching empty successor task; dirty, ambiguous, conflicting,
unrelated, or already-owned contexts must return
`HANDOFF_CREATION_FAILED` without successor execution.

## Intentionally untouched and residual risk

- Accepted historical task contracts were not cosmetically rewritten.
- No Desktop client, UI automation, provider router, background controller,
  packet executor, or Phase 23.8.7 behavior was added.
- The native Desktop create/readback path is documented as a product boundary;
  implementing a client remains out of scope.
- Repeated mechanically checkable authority drift remains a Phase 30
  eval/cleanup candidate, not a reason to expand this phase.
