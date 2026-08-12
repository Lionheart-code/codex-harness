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

Record structured evidence for initial/full and bounded-repeat reviews,
combined perspectives, reuse, route/profile/reasoning selection and reasons,
provider-reported input/cache/write/output tokens where available, core/delta
bytes, latency, review/fix-pass counts, and convergence. Do not fabricate
provider facts.

## Acceptance criteria

Deterministic fixtures prove planned surfaces affect required-review derivation;
missing required review blocks approval; combined invocation records distinct
canonical verdicts; exact plan/source/cohort binding; explicit safe carry-forward
and changed-surface rejection; unchanged-core reuse; invalidation on material
authority/architecture/storage change; one-step downgrade and re-escalation;
independent route/reasoning axes; accepted-binding selection; budget floor;
and separation of provider cache, Harness reuse, and session continuation.
They also retain timeout, stale, ownership, and terminal-output protections.

## Non-goals

No engineering-map/BDD methodology, model-profile promotion without reviewed
evaluation, Phase 30 experimentation, Phase 31 generic runner execution,
general multi-agent architecture, second context substrate, automatic owner
approval, or unrestricted parallel writes.
