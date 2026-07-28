# Phase 23.9 - Minimal Proof-Carrying Work over Procedure/Stage Records

## Purpose

Add a minimal proof-carrying layer over the existing review/evidence/closeout
flow, built on stable procedure/stage records.

Agent work should not be considered ready merely because it produced a confident
report. It must carry evidence: what changed, what was checked, what remains
unknown, what assumptions were made, and what review outcome applies.

## Status

Active. Phase 23.9 starts with the narrow successor-handoff correction below;
its product implementation remains subject to the normal independent plan
review and human approval gate. The proof-record work remains blocked until
Phase 23.8.6 Transactional Procedure Result Ingestion,
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

### Successor-handoff correction

Repeated native Codex Desktop successor activations exposed a product gap:
normal `run materialize-next-task --enter-existing` requires exactly one
matching installed `TaskState` before it can prepare a clean Desktop-created
worktree, but it provides no normal pre-activation path to establish that owner.
The existing `--recover-existing-activation` path can repair this only after a
committed activation chain already exists, which is too late for the normal
commit-backed activation sequence.

Phase 23.9 must close that gap before proof-record implementation. For a
verified Desktop-created existing worktree with zero matching owners, normal
`--enter-existing` materialization must transactionally create exactly one
canonical installed `TaskState` owner and then prepare `TASK.md`. Creation must
require the registered worktree, named branch, clean status, exact recorded
base, unmoved recorded base ref where present, and the recorded task contract.
It must remain fail-closed for a nonzero conflicting or ambiguous owner set,
wrong branch/worktree/base, dirty checkout, moved base ref, or missing task
contract. If preparation fails after creating the owner, it must remove only
that newly created owner and restore the prior `TASK.md` content.

This correction does not create Desktop worktrees, attach branches, start a
run, bypass an approval gate, or make proof records lifecycle authority.
`--recover-existing-activation` remains an idempotent recovery path for an
already committed activation chain, but must no longer be required merely
because a valid new native successor has zero matching owners.

### Product self-install guard and reconciliation

The `codex-harness` product repository is not an installed target. Phase 23.9
must add one shared, canonical-path product-repository detector for `install`,
`upgrade`, and `doctor`. It must recognize the real product source root rather
than trusting the caller's nested cwd, symlink spelling, or worktree path.

`install` and `upgrade`, including `--dry-run`, must fail closed before they
plan or mutate when that detector identifies the product repository. They must
not patch `AGENTS.md`, create any `.codex-harness.bak` path, seed or update an
installed-target `.harness` layer, or add/update the product root in the global
registry. `doctor` must report the existing product self-install conflict with
an explicit status/remediation, not misclassify the source repository as an
ordinary uninstalled target.

The correction must provide a separate, explicit reconcile/migration path for
pre-existing self-install contamination. That path must inventory and validate
the product/runtime boundary before any mutation; preserve self-hosting run
evidence, Project Memory, and canonical `TaskState`; and use a typed,
recoverable reconciliation record rather than deleting `.harness` manually.
It must not silently register the product root, overwrite product source, or
erase runtime evidence.

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
- Normal `materialize-next-task --enter-existing` accepts a verified
  zero-owner native Desktop successor and leaves exactly one installed owner
  bound to its exact branch, worktree, and recorded immutable base before
  writing the Phase 23.9 `TASK.md` pointer.
- The normal zero-owner path rejects duplicate, partial, or conflicting owners;
  wrong branch/worktree/base; dirty worktrees; moved recorded base refs; and a
  missing recorded task contract without leaving a new owner or changed
  `TASK.md` behind.
- The existing recovery path remains idempotent for a clean committed
  activation chain and is not used as the normal zero-owner handoff path.
- The self-hosting transition records a known successor decision before harvest
  when a successor is selected. Runs with no selected successor remain allowed
  to harvest; the enforcement level must be explicit and mechanically covered.
- Product-repository `install` and `upgrade` calls, dry-run and non-dry alike,
  fail before planning or mutation and leave product source, `AGENTS.md`,
  `.codex-harness.bak` paths, installed-target state, the global registry, and
  the self-hosting runtime boundary unchanged.
- Product-repository detection is canonical-path based and covers direct,
  nested-cwd, symlink, and worktree invocation forms; `doctor` reports the
  explicit product self-install conflict and safe remediation.
- A deliberate reconcile/migration path preserves self-hosting evidence,
  Project Memory, and canonical `TaskState`, records its recovery outcome, and
  never relies on manual `.harness` deletion.

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
