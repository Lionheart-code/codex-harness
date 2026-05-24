# Self-Hosting Review Tier Policy

## Purpose

Keep lightweight work lightweight while escalating lifecycle, authority,
storage, memory, provider, and domain-ingestion work.

The policy is used by Phase 23.7 operator status, Phase 23.9 proof/review
records, and later provider/review orchestration.

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

Required controls:

- anti-rubber-stamp review;
- repo source-of-truth audit;
- external verification when claims depend on external systems;
- explicit stop conditions;
- human approval boundary for irreversible or authority-changing changes;
- deterministic fixtures where possible.

## Routing responsibility

Phase 23.7 may expose a suggested review tier for the current stage. It must
not implement full provider/model routing. Later provider/host adapter work
owns model selection and second-review orchestration.

## Implementation requirement

Every proposed or routed phase should identify:

```text
phase:
review_tier:
why_this_tier:
what controls are required:
what must be postponed if the tier would overbuild the immediate phase:
```
