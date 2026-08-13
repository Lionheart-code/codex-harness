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
