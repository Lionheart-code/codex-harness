# Phase 24A.3 - Acceptance Contract Rationalization and Historical Compatibility Partitioning

## Status

Planned.

Starts only after Phase 24A, Phase 24A.1, and Phase 24A.2 are complete through
their required lifecycle.

Phase 24B starts only after Phase 24A.3 is complete.

## Purpose

Perform one bounded repository-wide rationalization of the `codex-harness`
acceptance contract after Phase 24A.1 and Phase 24A.2 have established the
reusable review/context lifecycle and executable-specification/engineering
architecture discipline.

The goal is not simply to reduce test count or make `npm test` faster. The goal
is to ensure that acceptance verification protects:

- current durable architectural and lifecycle invariants;
- intentionally supported historical compatibility;

rather than accumulated temporary phase-state assumptions.

Phase 24A.3 must make the acceptance contract clearer, more maintainable, and
less accidentally coupled while preserving fail-closed lifecycle correctness
and supported historical readability.

## Why this phase follows Phase 24A.2

- Phase 24A.1 may change reusable review lifecycle, context reuse, identity,
  recovery, routing/review selection, and associated acceptance behavior.
- Phase 24A.2 establishes the requirement/scenario/invariant/trace discipline
  needed to determine what an acceptance test actually proves.
- Rationalizing acceptance before those contracts are stable would risk doing
  the same audit twice or retaining assertions against superseded behavior.
- Phase 24B should expand reports/packets only after the canonical verification
  and historical compatibility contract is explicit.

## Required acceptance inventory

Inventory the materially relevant acceptance suite and classify tests or
material assertions according to what they actually protect. Use these
semantic classes, or an existing equivalent repository-owned typed
classification if one already exists.

### A. Durable current invariant

The test protects behavior that remains part of current `codex-harness`
authority.

### B. Supported historical compatibility

The test protects an older schema, artifact, record, lifecycle form, or
historical behavior that current `codex-harness` intentionally promises to
continue reading, replaying, interpreting, or handling compatibly.

### C. Obsolete completed-phase/current-state assertion

The test encodes temporary historical implementation state, phase activation,
literal phase state, transitional behavior, or another assertion that is no
longer current authority and is not required for supported compatibility.

### D. Expensive nested/meta verification

The test performs materially expensive nested acceptance, evaluation, or
lifecycle work whose unique verification value must be identified explicitly.

Classification must be evidence-based. Do not classify by age, filename,
phase number, or whether a test currently passes or fails.

## Durable current invariants

Preserve tests protecting durable behavior including, where applicable:

- source/runtime authority boundaries;
- exact task identity;
- exact run/run-instance identity;
- exact source/base/tree identity;
- task/plan identity;
- approval binding;
- review/cohort identity and completeness;
- implementation-baseline authority;
- superseding task/plan/baseline epochs, including deterministic invalidation
  of stale downstream lifecycle eligibility while predecessor evidence remains
  historical provenance;
- fail-closed lifecycle behavior;
- required lifecycle ordering;
- review independence;
- ownership and concurrency;
- stale/freshness semantics;
- timeout/watchdog semantics;
- terminal-process authority;
- terminal-only evidence;
- pre-terminal output rejection;
- replay, retry, and idempotency;
- exact artifact/procedure binding;
- Project Memory versus active Run/Staging authority;
- storage ownership and transaction boundaries;
- schema compatibility;
- recovery behavior;
- delivery/provenance relationships;
- closeout and harvest;
- accepted-memory promotion;
- supported historical artifact/schema readability;
- ambiguity fail-closed behavior;
- other currently authoritative architectural contracts.

Do not weaken a durable invariant merely because the current test expressing it
is old, verbose, slow, or phase-specific.

## Historical compatibility

Historical compatibility must be explicit. A historical test must not pretend
that a completed phase remains the current active phase merely because that was
true when the test was first written.

Where historical behavior remains intentionally supported:

- preserve a representative historical fixture or equivalent deterministic
  compatibility assertion;
- identify the exact historical compatibility contract being protected;
- state the expected current interpretation of that historical record;
- keep frozen historical fixtures stable where practical;
- do not mutate old fixtures to contain fields that did not exist when those
  historical records were produced;
- distinguish old-read compatibility from new-production semantics;
- fail closed on ambiguity or unsupported forms where current authority
  requires it.

Historical compatibility is not permission to preserve obsolete current-state
assumptions.

## Test removal and rewrite rule

Remove or materially replace a test or assertion only when evidence
establishes all three conditions:

1. it protects no current authoritative invariant;
2. it protects no supported historical compatibility contract;
3. it exists only to encode obsolete temporary or completed-phase state.

Before removal also verify that:

- no downstream lifecycle/evidence/report consumer depends on the behavior;
- removal does not weaken another test indirectly;
- removal does not convert a fail-closed path into silent acceptance.

Do not delete a test merely because it fails, is old, is slow, mentions an old
phase, or would make the suite green if removed.

## Phase-specific literal gates

Audit literal phase-specific behavior carefully. Distinguish:

1. genuinely phase-specific mechanisms that must remain phase-limited;
2. reusable lifecycle guarantees accidentally constrained by historical
   literal phase IDs;
3. obsolete transitional assertions.

Do not globally remove phase checks.

For example:

- a historically phase-specific proof producer may legitimately remain
  phase-specific;
- reusable review/delivery/provenance behavior must not remain artificially
  restricted to one historical phase if current authority defines it as
  reusable;
- historical fixtures may retain literal old phase identities when those
  identities are part of the compatibility record.

Replace literal phase gating with capability/contract ownership only where
current source authority actually defines the behavior as reusable.

## Canonical acceptance contract

Rationalize canonical acceptance-runner composition where justified.
Distinguish clearly between:

- current/high-signal product acceptance verification;
- historical compatibility/regression verification;
- genuinely expensive nested/meta verification.

Preserve one canonical repository verification contract. Do not create
competing test authorities.

Determine and document:

- the canonical verification command;
- what that command guarantees;
- the constituent suites it owns;
- specialized compatibility/meta/evaluation verification that remains adjacent
  to rather than duplicated inside it;
- deterministic failure reporting;
- baseline/current comparison semantics where required;
- ownership of long-running or nested verification.

If multiple package commands are aliases for the same full canonical suite, do
not preserve duplicate execution merely for naming symmetry. Any package-script
change belongs to Phase 24A.3 implementation and must be justified by the
completed inventory.

## Expensive nested/meta verification

Identify materially expensive acceptance cases that internally launch:

- another large acceptance suite;
- nested evaluation work;
- long lifecycle simulations;
- repeated subprocess trees;
- duplicated review/evidence validation.

For each such case determine:

- the unique invariant it proves;
- whether a smaller deterministic fixture can prove the same invariant;
- whether it belongs in canonical product acceptance;
- whether it belongs in a specialized compatibility/evaluation suite;
- whether it must remain intact because it has unique high-value coverage.

Do not remove expensive coverage solely because it is expensive. Do not retain
duplicated expensive work where a smaller authoritative proof provides the same
guarantee.

## Watchdog and timeout boundary

Preserve bounded acceptance-runner watchdog semantics. Acceptance-runner
timeout/watchdog policy is distinct from:

- semantic-review procedure timeout;
- stale-monitoring policy;
- provider/session infrastructure timeout.

Do not conflate or weaken those mechanisms during suite rationalization.

## Phase 24A.2 trace discipline

Consume the engineering/trace discipline established by Phase 24A.2. Where
practical, retained acceptance coverage should be attributable to a supported:

- task requirement;
- observable behavior/scenario;
- architecture invariant/decision;
- compatibility contract;
- lifecycle rule.

Do not create a second requirements database, a second accepted-memory
authority, a duplicate engineering-map authority, or a parallel test source of
truth. Phase 24A.3 consumes Phase 24A.2 vocabulary; it does not redesign it.

## Required future architecture regression matrix

The rationalized contract must retain explicit deterministic coverage for the
Phase 24A.1/24A.2 architecture rather than treating those obligations as prose.

### Delivery and lifecycle epochs

- ancestry-preserving delivery passes;
- unsupported merge strategy is blocked before owner merge;
- unrelated same-tree, tree mismatch, reviewed-head/remote-provenance mismatch,
  and schema/runtime merge-fact drift fail closed;
- future rewritten delivery passes only after explicit later A1 authority with
  exact provenance, never tree equality alone;
- a superseding exact epoch preserves predecessor history while invalidating
  predecessor downstream eligibility;
- an unresolved predecessor blocker cannot silently disappear;
- explicit current epoch identity, not timestamp inference, governs evidence;
- source change alone does not make implementation review-ready; explicit
  builder/review-ready handoff is required.

### Finding, fix, carry-forward, and real context reuse

- finding discovery is distinct from fix authorization and future proposal is
  distinct from accepted authority;
- nonblocking future debt may coexist with PASS;
- exact unaffected lens evidence carries forward while changed intersecting
  authority invalidates only affected evidence;
- candidate-only change can change overlay while stable core stays identical;
- task/plan/base/procedure/invariant change invalidates stable core;
- each role/lens receives a bounded projection rather than the whole repo;
- retrieval is bounded, attributed, and accounted, and metadata bytes cannot
  hide actual semantic-context overrun;
- materialized reuse, identity reuse, provider cache, session continuation, and
  reconstructed retrieval remain distinct;
- planning bundle and standalone review share one context substrate;
- separate lenses reuse stable core without reviewer-state contamination and a
  combined review does not force irrelevant lens context;
- broad repo-read capability does not imply unlimited consumption;
- retrieval/reconstruction telemetry reconciles with provider usage when
  available.

### Anti-waste semantic output and typed routing

- mechanical wrapper/heading/envelope defects do not launch another model;
- allowlisted semantics-preserving normalization is deterministic, while unsafe
  normalization yields a typed blocker with zero automatic semantic retry;
- known recordability/writability and Git/tree/schema/identity facts are
  resolved mechanically with zero semantic calls;
- genuine semantic retry has typed reason, bounded count, exact invalidation,
  and minimum delta; repeated identical semantic invocation without reason is
  rejected;
- `safe_session_resume=false` cannot silently depend on ad-hoc semantic resume;
- path/name alone is not final risk-routing authority when typed impact exists;
  true lifecycle/authority/storage/security impact still escalates and
  ambiguity escalates explicitly.

### Audit obligation and successor readiness

- a mandatory audit obligation cannot be silently omitted;
- required-but-unexecutable or manual-only audit produces a typed blocker;
- one exact valid result carries forward without duplicate audit execution when
  no intersecting authority changed;
- changed intersecting authority invalidates only affected audit evidence;
- malformed or missing required structured audit output fails closed without
  automatic semantic retry;
- procedure skill, output contract, and execution policy drift is detected;
- harvested historical state does not suppress a still-required
  pre-successor-activation audit;
- successor activation is blocked until every mandatory audit obligation has
  an exact accepted disposition.

### Verification and invocation economy

- `npm test` and `npm run test:acceptance`, when they remain aliases for the
  same canonical runner, may reuse one exact execution result for one exact
  source/toolchain/environment obligation rather than executing twice;
- distinct environment or contract still requires fresh execution;
- build duplication between CI and release dry-run is rationalized only after
  exact obligation analysis and never by weakening coverage;
- telemetry distinguishes physical provider/model invocation count, logical
  lens judgment count, context materialization count, retrieval/reconstruction
  count, and semantic retry/resume count.

The historical 17 acceptance failures were corrected during Phase 24A and must
not be revived as current debt.

## Measurement

Produce measurable before/after evidence. At minimum record:

- total materially relevant acceptance inventory before and after;
- counts by classification;
- retained durable tests and the contract each protects;
- historical fixtures retained, frozen, or reworked and why;
- removed or materially rewritten assertions and exact justification;
- expensive/meta cases and their unique coverage;
- canonical runner composition before and after;
- execution duration before and after;
- major nested subprocess/evaluation execution before and after;
- known remaining failures and their classification;
- any duplicated execution intentionally retained and why.

Do not set arbitrary goals such as reducing tests by a percentage, reducing the
suite to a number, finishing under an arbitrary duration, removing all
old-phase tests, or forcing the canonical suite green by deletion. The goal is
correctness and contract clarity, not a cosmetic number.

## Deterministic regression protection

Add deterministic regression protection so the repository cannot silently
drift back toward:

- current-phase assertions about completed historical phases;
- accidental loss of supported historical compatibility;
- removal of durable architectural/lifecycle invariants;
- ambiguous canonical-runner ownership;
- accidental duplicate full-suite execution where no distinct authority
  exists.

## Non-goals

Phase 24A.3 does not own:

- Phase 24A reports/packet implementation;
- Phase 24A.1 review lifecycle/context implementation;
- Phase 24A.2 specification/architecture implementation;
- Phase 24B expanded reports/packets;
- Phase 25 access implementation;
- Phase 26 architect/decomposer implementation;
- model/profile promotion;
- provider routing redesign;
- Phase 30 experimentation;
- Phase 31 external runner execution;
- domain-specific logic;
- storage/schema redesign merely for test cleanup;
- generic test-framework replacement;
- migration to Jest, Vitest, or another framework merely for style;
- mandatory Gherkin/Cucumber conversion;
- mass rewriting of historical tests;
- arbitrary test-count/runtime targets;
- weakening compatibility for speed;
- deleting failing tests merely to obtain green status;
- creating a second requirements/test authority;
- changing optional Phase 25B into a Phase 26 prerequisite.

## Acceptance criteria

Future Phase 24A.3 implementation must prove at least:

1. Materially affected acceptance coverage is explicitly classified by its
   real contract purpose.
2. Every removed or materially rewritten test has evidence showing that no
   current durable invariant or supported historical compatibility contract is
   lost.
3. Current source/runtime/lifecycle/storage/authority boundaries remain
   protected.
4. Required historical records remain covered by explicit compatibility
   fixtures.
5. Historical-read semantics and new-production semantics remain
   distinguishable.
6. Literal phase-specific checks remain only where current source authority
   requires phase-specific behavior.
7. Reusable guarantees are not accidentally constrained by obsolete phase
   literals.
8. One canonical verification contract is documented and deterministically
   testable.
9. Duplicate full-suite execution with no unique authority purpose is removed.
10. Expensive nested/meta checks remain only where unique coverage justifies
    them or are moved to the appropriate specialized verification surface.
11. Acceptance-runner watchdog semantics remain distinct from semantic-review
    timeout/stale semantics.
12. Before/after measurements are recorded.
13. No arbitrary test-count or runtime target is used as an acceptance goal.
14. No failing test is removed merely because it fails.
15. Supported historical compatibility is not weakened merely to simplify or
    accelerate the suite.
16. `git diff --check` passes.
17. Relevant build/acceptance verification is executed according to the
    rationalized canonical contract, with legitimate blockers represented
    honestly rather than waived.
18. Regression coverage proves stale predecessor implementation, review,
    verification, delivery, and closeout evidence cannot govern a superseding
    exact task/plan/baseline epoch.
19. Unresolved predecessor blockers remain blocking until exact authorized
    disposition, while later exact current-epoch evidence remains eligible.
20. Stable-core/delta separation, least-context projection, bounded retrieval,
    actual-consumption budgets, unified context substrate, and real reuse have
    deterministic positive and negative coverage.
21. Mechanical audit/review artifact defects cannot trigger automatic semantic
    retry, and genuine retries have typed bounded authority.
22. Typed impact rather than filename alone governs final risk routing.
23. Every mandatory audit obligation has exactly one executable registered
    procedure binding or a typed blocker and one exact accepted disposition
    before successor activation.
24. Audit carry-forward/invalidation is minimal and exact; malformed output and
    skill/output-contract/execution-policy drift fail closed.
25. Harvest cannot suppress pending pre-successor audit obligations.
26. Physical invocation, logical lens, context materialization, retrieval, and
    retry accounting remain distinct.

## Dependencies and downstream boundary

Phase 24A.3 starts only after Phase 24A, Phase 24A.1, and Phase 24A.2 are
complete through their required lifecycle.

Phase 24B starts only after Phase 24A.3 is complete.

This phase insertion does not alter downstream ownership after Phase 25A:

- Phase 25B remains optional after Phase 25A;
- Phase 26 remains gated by Phase 25A according to its existing task contract.
