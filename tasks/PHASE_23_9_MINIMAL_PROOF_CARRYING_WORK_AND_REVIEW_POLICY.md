# Phase 23.9 - Minimal Proof-Carrying Work and Review Policy

## Purpose

Add a minimal proof-carrying layer over the existing review/evidence/closeout
flow.

Agent work should not be considered ready merely because it produced a confident
report. It must carry evidence: what changed, what was checked, what remains
unknown, what assumptions were made, and what review outcome applies.

## Scope

Implement the minimum useful proof record and review policy integration.

## Required concepts

- proof record;
- task verifiability map;
- assumption ledger;
- operating envelope summary;
- evidence gaps;
- review verdict mapping;
- model/provider metadata fields where available;
- deterministic evidence outranks model opinion.

## Use existing repo foundations

Extend existing evidence, delivery facts, review, and closeout concepts. Do not
create a disconnected audit database or parallel report system.

## Defer

- broad adversarial review automation;
- full anti-slop analyzer;
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
- The format supports Phase 24 packets later.

## Schema status

Any operator/proof schemas supplied by the import package are provisional
planning sketches. Phase 23.9 implementation must either tighten them into
production-ready contracts with required enums/references, or keep them
explicitly marked as sketches and avoid treating them as durable schema
authority.
