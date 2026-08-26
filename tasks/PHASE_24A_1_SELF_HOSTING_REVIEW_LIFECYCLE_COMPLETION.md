# Phase 24A.1 - Self-Hosting Review Lifecycle and Context-Reuse Completion

## Status

Planned. Starts only after Phase 24A is fully implemented, independently
reviewed, accepted, delivered/closed out, and harvested through the normal
Harness lifecycle.

## Purpose

Complete the reusable, narrow self-hosting review lifecycle partially
introduced by Phase 23.8.6F and proven in bounded form by Phase 23.9. This
phase owns review-lifecycle completion and review cost/quality behavior. It
does not own executable-specification/BDD discipline, which belongs to 24A.2,
and does not create the general external-runner system reserved for Phase 31.

## Scope

Reuse and reconcile the existing `ContextCore`, `ContextManifest`, and
`ReviewDeltaOverlay`; do not create competing context types. Stable unchanged
authority belongs in the core. Candidate-specific plan/fix/diff/findings,
finding dispositions, and verification facts belong in the existing delta layer
where appropriate. Candidate changes alone must not falsely claim that all
context is new, but material task/base/tier/review-set/authority/architecture/
storage/security changes must invalidate reuse. Logical Harness reuse,
provider-reported prompt cache, and actual provider thread/session continuation
are distinct recorded facts and are never inferred from one another.

Complete generic self-hosting cohort semantics over the specialized
`plan-review`, `architecture-review`, and `db-storage-review` perspectives.
The deterministic required-review set is authoritative. Compatible read-only,
independent perspectives may share one bounded invocation/context load, while
retaining separate procedure identity, rubric, typed verdict, canonical
artifact, and evidence trail. The owner gate requires the complete derived set.

### Typed routing authority

Steady-state review tier, risk, and required-review selection must not use
free-text keyword or regular-expression matching as lifecycle authority. Use
typed facts and the existing provider-neutral review-policy vocabulary. This
phase owns reusable production derivation from procedure/perspective, review
tier, planned and changed surface classes, risk classes, deterministic evidence
state, prior review/fix-pass failures, independence, context reuse, delta size,
reopen signals, and owner-approved budget. Consolidate runtime, operator, and
stage behavior on one deterministic routing/review-selection policy rather than
adding independent helpers.

### Planned versus changed surfaces

Define exact typed planned surfaces before implementation and combine them with
actual changed surfaces afterward through the existing policy. Task-owned
minimum surface/risk/review floors are unioned with exact plan facts and known
source-change facts; plan or model output may add risk but cannot silently
weaken the task floor or select its own reviewers through prose.

### Complete cohort and verdict semantics

The production state machine must distinguish incomplete, complete all-PASS,
complete with `AMEND_REQUIRED`, complete with `BLOCKED`, and invalid/mismatched
cohorts. `AMEND_REQUIRED` permits normal plan amendment followed by fresh
derivation and a new exact cohort; `BLOCKED` produces a typed human-decision
state; malformed or mismatched evidence fails closed. For each lens, the
canonical procedure document and structured result must agree on `PASS`,
`AMEND_REQUIRED`, or `BLOCKED`; planning results never use implementation-review
compatibility semantics.

### Exact identity and safe carry-forward

Every cohort and carry-forward decision binds task artifact/content, effective
plan artifact/content, immutable base, reviewed source, run instance, exact
required set, cohort, and procedure artifacts. Provide an explicit invalidation
matrix covering task change, plan semantic change, immutable-base change,
required-review-set change, architecture change, authority/lifecycle change,
storage/schema change, security change, a new blocker, reviewer disagreement,
and contradictory evidence. Carry-forward is allowed only when typed,
attributable proof establishes that none of the perspective-relevant identities
or surfaces changed; uncertainty reruns the lens.

After an amendment/fix, carry an earlier perspective forward only on explicit,
typed, attributable deterministic proof that the authority and surfaces relevant
to that perspective are unchanged. Uncertainty reruns the perspective.

Make route/profile capability and reasoning effort independent policy axes. The
first full review uses the minimum safe policy floor. A bounded repeat may move
at most one approved adjacent route or reasoning step cheaper only with a
reusable unchanged core, bounded delta, no new architecture/authority/lifecycle/
storage/security risk, unchanged required set, no blocker/disagreement, and no
task/base change. Cost or budget never lowers the safe floor. Material reopen
signals—including changed authority/base/set, new risk/blocker/disagreement,
contradictory or malformed evidence, missing required evidence, or material
candidate expansion—re-escalate to the appropriate full review.

Route deterministically from existing applicable procedure/perspective, tier,
planned and changed surfaces, risks, pass kind/index, prior findings,
independence, context reuse, delta size, reopen conditions, and owner-approved
budget class. Do not use an LLM router or promote model/profile candidates.
Select only accepted bindings that satisfy the already-derived safe capability,
reasoning, independence, and context constraints; cost chooses only among safe
options.

### Context reuse and reasoning/profile routing

Keep `ContextCore`, `ContextManifest`, and `ReviewDeltaOverlay` as the one
substrate. Stable core versus delta is determined from exact authority identity,
not heuristics. Provider cache, Harness reuse, and provider session continuation
remain separate recorded facts. Use a strong initial review, permit at most one
bounded adjacent cheaper repeat only under the proved conditions above, and
immediately re-escalate when any condition stops holding. No LLM router or
budget-driven unsafe downgrade is allowed.

### Cross-profile and cross-invocation context economy

When independence, profile selection, provider choice, reasoning level, or
another policy constraint requires review perspectives to use separate
invocations, every invocation must derive from one bounded authoritative shared
core plus only the minimum perspective-specific delta required for that lens.
Harness must not reconstruct and send the complete review context independently
to every lens by default. This rule applies across provider-neutral profiles,
models, providers, and independent invocations without creating a second core,
manifest, overlay, or context-reuse mechanism.

Context selection for each lens is deterministic from typed authority,
including applicable procedure/perspective, required semantic review, planned
and changed surfaces, risk classes, independence, candidate identity, prior
accepted findings, exact `ContextCore` and delta identities, delta size,
budget, and available approved route/profile bindings. A perspective that is
not in the required semantic-review set is not launched merely to exploit
shared context. Reuse must preserve reviewer independence: it cannot introduce
reviewer-state contamination, unauthorized session/thread dependence, or
carry-forward of perspective-specific state without exact authorization.

Provider caching is an optional economic optimization and observable telemetry,
never lifecycle authority or a correctness dependency. Cache absence or a
profile/model/provider switch must not force full-context reconstruction or
silently destroy Harness-level context economy. Record, where observable,
shared-core and perspective-delta bytes/tokens, reconstructed-context
bytes/tokens, cache reads/writes/hits, selected model/profile, reasoning effort,
total input/output tokens, latency, and repeated-review convergence. Never
fabricate unavailable provider facts.

### Stable core, least-context projection, and bounded retrieval

The stable core contains only authority that remains invariant across a bounded
candidate/fix sequence: exact task and task-pointer identity, approved effective
plan, immutable base, procedure contracts, stable architecture/lifecycle
invariants and non-goals, acceptance/authority references, and exact run
identity where required. Candidate commit/tree/source snapshot, diff and changed
files, candidate-derived surfaces/risk, findings/dispositions, verification,
missing evidence, lens context, and retry invalidation belong in the existing
overlay/delta. A candidate-only fix must not rebuild an unchanged stable core.

Harness must distinguish identity reuse, exact materialized-content reuse,
provider prompt-cache reuse, provider/session continuation, and reconstructed
retrieval. A reuse ID alone never proves content reuse. Materialize an exact
bounded authoritative projection once and reuse it by content identity when
unchanged. Planning bundles and standalone reviews must converge on this same
provider-neutral `ContextCore`/`ContextManifest`/`ReviewDeltaOverlay` substrate.

Each worker/lens receives the minimum deterministic role-specific projection
needed for its obligation, not the whole repository by default. Broad
read-only-repository capability permits bounded retrieval; it does not authorize
unlimited consumption. Additional retrieval is attributable as exact
`need -> source/payload -> reason/obligation -> bounded retrieval -> accounting`
and is constrained by retrieval-count and retrieved-byte/token budgets. Budget
exhaustion produces a typed routing/budget condition; budget never lowers the
safe quality floor.

Budgets and telemetry cover actual observable semantic consumption, not only
small manifest/request metadata: inline/materialized bytes, retrieved bytes and
count, reconstructed bytes/tokens, provider input/cached/uncached/output tokens,
latency, physical invocation count, logical lens count, context
materializations, retries/resumes, route/profile/reasoning, and carry-forward or
reopen reason. Never fabricate provider facts.

### Semantic judgment and deterministic artifact plumbing

The required boundary is `bounded semantic decision payload -> deterministic
output-contract validation -> allowlisted semantics-preserving canonical
rendering/normalization -> durable procedure artifact -> evidence ingestion`.
Heading/order/envelope conformance, required structured fields, exact identity
bindings, serialization, hashes, duplicate wrappers, known recordability, and
mechanically provable stale/missing bindings are deterministic Harness work.

A mechanical artifact defect uses only an explicitly allowlisted
semantics-preserving normalization or fails closed with a typed conformance
blocker. It must not automatically call or resume a semantic model. A genuine
semantic retry requires an exact semantic invalidation reason, bounded count,
minimum delta, and preserved stable core; materially identical repeated input
without a typed semantic reason is preempted.

Resolve the current `plan-amend` transport contradiction explicitly. A policy
that declares `resume_same_role` cannot depend on ad-hoc `codex exec resume`
when the accepted binding says `safe_session_resume=false`. Use a supported
fresh bounded same-role invocation from exact reusable core plus amendment
delta, or emit a typed capability blocker. Mechanical cleanup never justifies
semantic resume.

Finding discovery is not mutation authority. Type and distinguish finding
discovered, current fix authorized, plan amendment required, future
proposal/debt, and owner ambiguity/decision. A future proposal is not accepted
authority; PASS may coexist with explicit nonblocking future debt; and safe
future findings should be batched rather than automatically creating one
implementation/review cycle per finding.

### Infrastructure failure recovery

Add one bounded human-authorized recovery path when a review process terminates
for infrastructure, provider, or quota reasons before any valid review artifact
exists and the ordinary automatic retry allowance is exhausted. Preserve every
old attempt permanently; permit no deletion, DB cleanup, partial-artifact reuse,
or adoption. Recovery requires an exact owner-authorized recovery epoch/attempt
identity, bounded retry count, and fresh output identity. Only terminal
no-valid-artifact infrastructure failures qualify. Semantic
`AMEND_REQUIRED`/`BLOCKED` and malformed output do not create free retries, and
no automatic retry loop may be infinite.

### Superseding lifecycle epochs

A superseding exact task, plan, approval, and implementation-baseline binding
starts a new deterministic lifecycle epoch with an explicit identity derived
from exact task/plan/approval/baseline/run authority. Downstream implementation,
review, verification, delivery, and closeout eligibility from the predecessor
epoch must not govern the current operator stage. Preserve every predecessor
record as immutable historical provenance; do not delete, rewrite, or manually
repair runtime state. Current eligibility derives only from evidence bound to
the new exact epoch, ambiguity fails closed, and timestamps remain audit
metadata rather than primary epoch authority.

Unresolved blockers require exact carry-forward or authorized disposition and
cannot vanish because an epoch changed. A deterministic epoch transition
invalidates stale downstream completion eligibility while retaining history.

Add an explicit implementation-progress/builder-handoff boundary that
distinguishes approved-not-started, implementation in progress/source changed,
builder-complete with exact bounded handoff/report evidence, and
implementation-review ready. The first source diff alone must not trigger
semantic implementation review. This is a lifecycle/handoff primitive over
existing self-hosting source/evidence, not the Phase 31 generic external runner.

### Delivery admission and reviewed-source relationship

Own the reusable provider-neutral delivery policy. Deterministic pre-merge
admission selects the minimum supported strategy before irreversible owner
action and fails closed on absent, unknown, or unsupported strategy. Exact task,
plan, base, run, review, candidate, delivery facts, delivered commit/tree, and
remote merge result bind one authoritative reviewed-source-to-delivery
relationship consumed by import, proof, evidence projection, and closeout.

Current ancestry-preserving delivery remains the compatibility baseline. Any
future rewritten/squash delivery requires explicit later authority and exact
provenance; tree equality alone never proves delivery. Mechanical Git/tree/
schema/identity checks use zero semantic calls and route typed blockers
deterministically.

### Lifecycle-enforced audit obligations

Typed authority, risk, and changed-surface rules deterministically select the
minimum mandatory audit set. If a required audit is selected, operator state
must expose an executable repo-owned registered procedure/lens or fail closed
with a typed unavailable-binding blocker. A routing decision may not terminate
with `next_procedure_id: none` while a mandatory audit remains undisposed.

Define an explicit post-phase/pre-successor-activation audit-readiness boundary,
or an equivalent lifecycle primitive. Required audit obligations survive
closeout/harvest as obligations until exact accepted disposition and cannot be
suppressed by historical terminal state. Successor activation remains blocked
until all mandatory audit obligations have exact accepted dispositions.

Audit selection, procedure availability, execution, completion, carry-forward,
and invalidation are deterministic. One exact valid audit result may carry
forward only when no intersecting authority/surface/risk changed; changed
intersections invalidate only affected audit evidence. Do not launch
unnecessary or duplicate audits.

`harness-audit`, `architecture-review`, `docs-consistency-review`, and future
equivalents remain repo-owned registered procedures, never external ad-hoc
prompts. Each has one coherent machine-checkable output contract shared by its
skill, execution policy, ingestion, and lifecycle gate. Mechanical malformed-
artifact failures block without automatic semantic retry.

Record structured evidence for initial/full and bounded-repeat reviews,
combined perspectives, reuse, route/profile/reasoning selection and reasons,
provider-reported input/cache/write/output tokens where available, core/delta
bytes, latency, review/fix-pass counts, and convergence. Do not fabricate
provider facts.

## Acceptance criteria

Deterministic positive and negative fixtures prove: no keyword/regex routing
authority; typed planned surfaces derive the review set; historical Phase-F
compatibility; complete PASS, complete `AMEND_REQUIRED`, complete `BLOCKED`,
partial, and invalid cohorts; structured/document verdict mismatch rejection;
task, plan, immutable-base, source, and required-set drift rejection; safe
carry-forward success and invalidation; unchanged-core reuse; bounded downgrade
and re-escalation; independent route/reasoning axes; accepted-binding selection;
budget floor; exhausted ordinary retry; authorized infrastructure recovery; no
valid-artifact adoption from a failed process; and separation of provider cache,
Harness reuse, and session continuation. Retain timeout, stale, ownership, and
terminal-output protections.

Acceptance also proves that a superseding task/plan/baseline epoch leaves
predecessor implementation, review, verification, delivery, and closeout
evidence historically readable but unable to advance the current operator;
before new source implementation, the new epoch resolves to
`IMPLEMENTATION_READY`; unresolved predecessor blockers remain blocking until
exact disposition; explicit current-epoch evidence becomes current; and source
change alone does not establish review readiness.

Acceptance proves stable-core identity across candidate-only changes; core
invalidation on task/plan/base/procedure/invariant change; bounded role/lens
projection; attributable retrieval and actual-consumption budgets; planning and
standalone context convergence; material reuse distinct from identity/cache/
session reuse; typed impact routing rather than filename-only escalation;
deterministic artifact normalization/blocking with no mechanical semantic
retry; explicit plan-amend transport capability; and physical versus logical
invocation telemetry.

Acceptance also proves mandatory audit selection cannot disappear, a required
but unexecutable/manual-only audit produces a typed blocker, exact unaffected
audit evidence carries without duplicate execution, intersecting changes
invalidate only affected audit evidence, malformed structured audit output
fails closed, skill/output-contract/execution-policy drift is detected, harvest
does not suppress pending pre-successor audit authority, and successor
activation remains blocked until every mandatory audit has one accepted exact
disposition.

Likely implementation surfaces to inspect and consolidate are
`src/core/self-hosting-review-policy.ts`, `src/core/runtime.ts`,
`src/core/stage-operator.ts`, `src/core/plan-contract.ts`,
`src/core/review-cohort.ts`, existing review-context code, the existing route and
execution policies, lifecycle types/schemas only where genuinely required, and
focused acceptance tests. Reuse existing surfaces where present; missing named
files are inspection targets, not a mandate to create new modules.

## Non-goals

No engineering-map/BDD methodology, model-profile promotion without reviewed
evaluation, Phase 30 experimentation, Phase 31 generic runner execution,
general multi-agent architecture, second context substrate, automatic owner
approval, or unrestricted parallel writes.
