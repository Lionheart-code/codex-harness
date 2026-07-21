# Phase 23.9 - Minimal Proof-Carrying Work over Procedure/Stage Records

## Purpose

Add a minimal proof-carrying layer over the existing review/evidence/closeout
flow, built on stable procedure/stage records.

Agent work should not be considered ready merely because it produced a confident
report. It must carry evidence: what changed, what was checked, what remains
unknown, what assumptions were made, and what review outcome applies.

## Status

Planned. Blocked until Phase 23.8.6 Transactional Procedure Result Ingestion,
Phase 23.8.6A Self-Hosting Replay and Re-ingestion Continuity, Phase 23.8.6B
Self-Hosting Model Routing Policy Packaging, Phase 23.8.6B1 Supervised Review
Launch and Blocked Disposition, Phase 23.8.6B2 Verification Command
Rationalization and Serialization, Phase 23.8.6C Minimum Self-Hosting
Orchestrator Entrypoint, Phase 23.8.6C1A Routing, Context, and Model-Policy
Authority Rebase, Phase 23.8.6C2 Bootstrap Authority Correctness, Phase
23.8.6C2A Commit-Backed Task Materialization and Environment Bootstrap, Phase
23.8.6D Procedure Artifact Payload Storage and Worktree Retention, Phase
23.8.6E Authority Surface Freshness and Downstream Task Revalidation, Phase
23.8.6F Cost-Aware Review Context Reuse and Codex Reference Routing, and Phase
23.8.7 Hookless Stage-Level Operator Packet Automation are complete and
reviewed, unless a later reviewed decision explicitly defers or waives that
dependency.

## Scope

Implement the minimum useful proof record and review policy integration.

Proof is audit/provenance material. It is not lifecycle authority and must not
replace operator state, validation gates, review verdicts, or required human
approval.

## Required concepts

- proof record;
- task verifiability map;
- assumption ledger;
- operating envelope summary;
- evidence gaps;
- review verdict mapping;
- model/provider metadata fields where available;
- task materialization base, committed activation, and current source snapshot
  provenance, without treating a transient worktree environment as durable
  proof authority.
- deterministic evidence outranks model opinion.
- procedure outcome references;
- stage state references;
- stage packet and stage result references when present;
- waiver references.
- deterministic-check and route-decision references;
- routing-policy and provider-binding versions;
- profile class and actual provider/model/reasoning facts when available;
- context core, manifest, and delta-overlay identity/hash plus transport mode;
- required/satisfied independence facts;
- escalation, promotion-decision, and usage evidence references;
- separate deterministic-evidence and model-judgment references;
- expected and observed required semantic reviews.

## Required narrowing

- Proof consumes procedure outcomes, stage state, packets, stage results,
  deterministic checks, review verdicts, and waiver refs.
- Proof records provenance and gaps.
- Proof may reference Phase 23.8.6B1 review-launch evidence, but it must keep
  review-launch proof, review artifact validity, review verdict, verification
  proof, blocked disposition, artifact body, artifact ref, payload ref, exact
  run identity, and accepted memory distinct.
- When one branch or PR carries an active task plus an approved supporting fix
  or adjacent slice, proof must distinguish active-task evidence from
  supporting-slice delivery history rather than collapsing them into one proof
  claim.
- Proof must preserve commit/delivery slice classification and mark
  current-versus-superseded review or delivery artifacts when multiple exact
  records exist for the same run.
- Proof does not decide lifecycle.
- Proof does not implement run-state ingestion.
- Proof does not override deterministic failures.
- Proof does not choose routes or providers. Model judgment cannot override a
  deterministic failure.
- Proof keeps deterministic evidence, model judgment, accepted policy
  decision, and owner promotion approval as distinct facts. It references but
  never creates or promotes routing policy.
- Missing invocation, model, context, or usage facts are explicit and never
  fabricated.
- Deterministic failure requires an explicit waiver record.
- Waivers are referenced by proof; proof does not create waivers.
- Proof records must be keyed by or explicitly resolvable through exact run
  identity rather than display `run_id` alone.
- Proof must not depend on scraping ambiguous markdown histories from run-local
  files as authoritative evidence.

## Use existing repo foundations

Extend existing evidence, delivery facts, review, and closeout concepts. Do not
create a disconnected audit database or parallel report system.

## Defer

- broad adversarial review automation;
- full anti-slop analyzer;
- run-state ingestion or procedure-result ingestion;
- stage packet automation;
- report generation or proposal drafts;
- access APIs or MCP;
- provider/host adapter execution;
- bounded experimentation loop;
- domain-specific proof records.

These may be added later once the minimal proof record is useful.

## Acceptance criteria

- Proof record can be produced from a completed or reviewed run.
- It states what was verified automatically, what was reviewed, and what remains
  assumption.
- Missing evidence is explicit.
- Review verdicts cannot accept work with failing deterministic checks unless
  explicitly waived by human approval.
- Waivers are referenced, not created by proof.
- The format supports Phase 24A packets later.
- Proof is not a new lifecycle authority.
- Proof identity does not collapse distinct exact run instances that reuse the
  same display `run_id`.
- Proof can distinguish active-task evidence from supporting-slice or
  combined-delivery history without promoting run-local markdown to authority.

## Future-phase impact check

- Prepares Phase 24A reports/packets and Phase 25A read-only access by making
  verification/review provenance queryable.
- Must not pre-implement report generation, proposal drafts, access APIs, MCP,
  domain packs, prior-art discovery, or experimentation.
- Preserves the domain/core boundary by keeping proof generic and
  task/run/procedure based.
- Requires architecture review if proof becomes lifecycle authority, accepts
  model opinion over deterministic checks, adds domain-specific proof fields,
  or creates waivers itself.

## Schema status

Any operator/proof schemas supplied by the import package are provisional
planning sketches. Phase 23.9 implementation must either tighten them into
production-ready contracts with required enums/references, or keep them
explicitly marked as sketches and avoid treating them as durable schema
authority.
