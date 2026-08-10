# Self-Hosting Review Tier Policy

## Phase 23.9 high and extra-high planning

The candidate review is the complete three-lens bundle. Closure is an impact
review of changed decisions/traces, every intersecting contract surface, and
unchanged-plan compatibility—not unrestricted rediscovery. A second reviewer
is escalation-only for conflict, uncertainty, or explicit second-opinion
policy.

## Purpose

Keep lightweight work lightweight while escalating lifecycle, authority,
storage, memory, provider, and domain-ingestion work.

The policy is used by Phase 23.7 operator status, Phase 23.9 proof/review
records, and later provider/review orchestration.

These controls apply to self-hosting `draft-plan`, `plan-review`, and
`implementation-review` flows generally, not only to Phase 23.7.

Canonical control labels:

- `anti_slop`
- `design_invariant`
- `scope_legality`
- `evidence_gap`
- `docs_consistency`
- `future_phase_leakage`
- `review_tier_controls`

## Tiers

### `standard`

Use for low-risk changes:

- small docs corrections;
- small task wording changes that do not alter scope/order/authority;
- non-authoritative examples;
- formatting or typo fixes;
- local explanatory additions that do not change behavior.

Required controls:

- basic evidence;
- single review;
- no external research unless the claim depends on current external facts.
- keep the implementation at the smallest correct size.

### `high`

Use for changes affecting workflow structure or significant project behavior:

- procedure changes;
- task-file scope changes;
- roadmap order changes;
- report/evidence packet design;
- skill discovery/export behavior;
- role/procedure contracts;
- domain-pack architecture as architecture only;
- docs that become authoritative guidance.

Required controls:

- explicit source-of-truth check;
- focused research when external tool behavior or prior art matters;
- acceptance criteria;
- review findings recorded;
- no domain operation leakage into core.
- `anti_slop` checks:
  - no unnecessary abstraction;
  - no one-use generic helper/framework;
  - no duplicate logic hidden by renaming.
- `design_invariant` checks:
  - preserve authority boundaries and canonical sources;
  - avoid hidden generated state becoming source-of-truth;
  - preserve deterministic workflow and repo-level invariants.
- `scope_legality` checks:
  - keep required changes only;
  - capture adjacent work as follow-up instead of silent implementation.
- `evidence_gap` checks:
  - reject claims that outrun available tests or deterministic evidence.
- `docs_consistency` checks:
  - reconcile task/docs/prompt/skill wording when one surface changes
    authoritative behavior.
- `future_phase_leakage` checks:
  - reject future-phase systems or scope that are not required by the active
    self-hosting task.
- `review_tier_controls` discipline:
  - name the tier-required controls explicitly in the review output.

### `extra-high`

Use for authority, lifecycle, storage, and external-agent boundary work:

- operator/stage routing;
- accepted memory / harvest authority;
- schema migrations or schema evolution;
- deletion/retention/quarantine/discard rules;
- provider/host adapters;
- sandbox/approval/hook behavior;
- independent model review routing;
- domain ingestion and runtime data classification;
- bounded experimentation that can keep/revert source changes.

`extra-high` is a control and review strictness tier. It does not automatically
imply `xhigh`, `max`, or `ultra` model reasoning. Reasoning stays a separate
route/profile decision constrained by the task, evidence, independence, and
recorded escalation triggers.

Required controls:

- anti-rubber-stamp review;
- repo source-of-truth audit;
- external verification when claims depend on external systems;
- explicit stop conditions;
- human approval boundary for irreversible or authority-changing changes;
- deterministic fixtures where possible.
- `anti_slop` checks:
  - no framework-like broadening beyond the approved task;
  - no helper layers introduced without repeated need;
  - no confident docs/report claims without evidence.
- `design_invariant` checks:
  - preserve lifecycle/storage/product-source boundaries;
  - preserve projection/status-first behavior when the task requires it;
  - avoid stable-identity mistakes where durable IDs are required.
- `scope_legality` checks:
  - keep the diff within the approved task and reviewed plan;
  - block opportunistic expansion disguised as cleanup.
- `evidence_gap` checks:
  - classify missing proofs as blockers, not polish items;
  - reject reviewer approval based on prose alone.
- `docs_consistency` checks:
  - update authoritative task/docs/prompt/skill surfaces together when the
    approved contract changes.
- `future_phase_leakage` checks:
  - block future-phase implementation leakage;
  - block future-phase subsystem work disguised as harmless groundwork.
- `review_tier_controls` discipline:
  - list the required controls used;
  - record what must remain postponed to avoid overbuilding the current phase.

Default `xhigh`, `max`, or `ultra` reasoning is prohibited. Each use requires a
separately recorded escalation reason tied to conflicting evidence, a critical
authority/lifecycle finding, or repeated failed fix-pass evidence.

## Routing responsibility

Phase 23.7 may expose a suggested review tier for the current stage. It must
not implement full provider/model routing. Review tier contributes a
provider-neutral `profile_floor`; changed surfaces, risk, deterministic
evidence, prior failures, independence, and context reconstruction cost may
raise that floor. Budget may choose only among bindings that already satisfy
the floor and must never weaken review independence. Phase 31 owns general
runtime binding and execution. CLI remains the current baseline access
surface; App Server is optional and never a mandatory core dependency.

## Implementation requirement

Every proposed or routed phase should identify:

```text
phase:
review_tier:
why_this_tier:
what controls are required:
what must be postponed if the tier would overbuild the immediate phase:
```
