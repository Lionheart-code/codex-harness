# Phase 23.8.6F - Cost-Aware Review Context Reuse and Codex Reference Routing

## Status

Planned. Starts only after Phase 23.8.6E Authority Surface Freshness and
Downstream Task Revalidation is complete, independently reviewed, accepted,
closed out, and harvested.

This phase is inserted immediately after Phase 23.8.6E and before Phase 23.8.7.
The near-term order becomes:

```text
23.8.6E -> 23.8.6F -> 23.8.7 -> 23.9 -> 24A
```

## Purpose

Make the existing self-hosting review loop materially cheaper and less
repetitive before broader stage-packet automation is implemented.

The phase must preserve `codex-harness` as a portable, provider-neutral control
plane while using the current Codex CLI path as the only implemented reference
adapter. It must not implement additional desktop/client adapters.

The phase addresses the currently observed defects:

- every review launch can reconstruct and resend substantially unchanged
  context;
- amended-plan and fix-pass review can repeat a broad audit instead of checking
  the prior findings plus the actual delta;
- current model/reasoning bindings are too coarse and can use expensive profiles
  where deterministic checks or a balanced profile are sufficient;
- provider/model bindings are not cleanly isolated from provider-neutral route
  policy;
- context reuse, request size, invocation usage, and route outcomes are not
  recorded well enough to evaluate cost versus review quality;
- task-local prompts can ask agents to read broad project surfaces when bounded
  progressive disclosure would be sufficient;
- same-role continuation and fresh independent review are not represented as
  distinct context-transport decisions.

The result must be the first usable cost-aware self-hosting review vertical
slice, not a generic multi-agent runtime.

## Binding architectural decision

Implement one reference path first and preserve extension seams:

```text
portable route/context/review contracts
        +
current Codex CLI reference binding
        +
future adapter capability boundary
```

`codex_cli` is the only adapter implemented in this phase. No second provider,
Desktop client, ACP bridge, MCP execution adapter, or generic runner is
required.

Core lifecycle and packet authority must use provider-neutral route classes and
context contracts. Concrete model names, CLI flags, process details, stdout,
stderr, output files, PIDs, signals, and provider usage fields remain adapter
binding or invocation facts, not lifecycle truth.

## Scope

### 1. Minimal reusable review context

Add the minimum deterministic context records needed by the existing
self-hosting review path:

`ContextCore`:

- `context_core_id`;
- stable content hash;
- task identity and active task-contract reference;
- effective approved-plan reference;
- procedure-contract references;
- review tier;
- changed-surface and risk-class inputs known before review;
- exact run, run-instance, branch, worktree, source snapshot, and immutable base
  identity;
- binding architectural invariants and non-goals;
- required acceptance/verification references;
- deterministic ordering and source provenance;
- size budget and visible truncation/redaction facts.

`ReviewDeltaOverlay`:

- `delta_overlay_id`;
- parent `context_core_id`;
- reviewed candidate identity;
- changed-file and bounded diff/payload references;
- prior review result and finding references;
- finding-by-finding disposition (`open`, `claimed_fixed`, `closed`,
  `superseded`, or equivalent typed values);
- new verification/test evidence;
- changed authority or architecture surfaces;
- missing evidence and escalation reason;
- deterministic ordering, hash, size, and truncation facts.

Identical authoritative inputs must produce the same `ContextCore` ordering and
hash. A context core is rebuilt only when one of its authoritative inputs
changes. A new amendment, implementation delta, or fix-pass must normally
produce a new overlay against the unchanged core rather than duplicating the
full core payload.

Missing mandatory context blocks packet generation. Budget limits must never
silently remove the active task contract, effective approved plan, exact run
identity, required review lenses, prior unresolved blockers, or acceptance
requirements.

### 2. Context transport modes

Represent context transport independently from provider/model selection.
Support at least:

- `fresh_packet` - a bounded fresh context for an independent reviewer;
- `resume_same_role` - continuation of the same planner/builder role when the
  adapter supports safe continuation;
- `packet_plus_retrieval` - bounded packet plus explicit read-only retrieval
  references;
- `fresh_independent_delta` - fresh independent reviewer receiving the stable
  core plus prior findings and the new delta, without builder transcript
  authority.

The current Codex CLI reference binding may support only a subset. Unsupported
capabilities must be reported honestly and fall back to `fresh_packet` or
`packet_plus_retrieval`; the runtime must not pretend that session continuity or
cache reuse occurred.

Independent plan/implementation review remains independent. Context reuse must
not turn a builder or planner continuation into the authoritative independent
reviewer.

### 3. Delta-oriented repeat review

For amended plans and implementation fix-passes, generate a repeat-review
request that prioritizes:

1. every prior blocker/finding and its stated disposition;
2. the exact changed candidate/diff since the reviewed version;
3. new or changed test/verification evidence;
4. regressions in surfaces touched by the delta;
5. any change to task, plan, architecture, authority, storage, or lifecycle
   boundaries that justifies reopening a broader surface.

The reviewer must not be instructed to re-audit unchanged project areas without
one of those explicit reopening triggers.

A full fresh review remains required when the task contract, approved plan,
immutable base, review tier, required review lenses, or material architectural
boundary changes.

### 4. Provider-neutral deterministic route intent

Add or tighten a deterministic route decision for the existing self-hosting
review procedures. The route decision must be based on authoritative inputs,
not on a separate router-model call.

Minimum route classes:

- `deterministic_no_model`;
- `balanced_routine`;
- `complex_judgment`;
- `critical_independent`.

Minimum routing inputs:

- procedure ID;
- review tier;
- changed-surface classes;
- authority/lifecycle/storage/security risk classes;
- deterministic evidence completeness;
- prior review or fix-pass failure count;
- independence requirement;
- context reconstruction/reuse state;
- owner-approved budget class.

Budget may choose only among profiles already safe for the route. It must not
weaken a required independent review, lower the minimum safe profile for a
critical surface, or override missing deterministic evidence.

The route decision must be deterministic for identical authoritative inputs.
No LLM-based router is allowed.

### 5. Codex reference binding

Keep concrete OpenAI/Codex model and reasoning names in a separate reference
binding, not in lifecycle authority.

Revalidate the binding against current official Codex/OpenAI documentation and
focused local fixtures. Replace blanket expensive defaults with the lowest
profile/reasoning level that satisfies the reviewed route floor.

The initial binding must support the following policy shape:

- routine bounded semantic review uses the balanced profile by default;
- complex cross-file or cross-source judgment uses the complex profile;
- authority, lifecycle, storage, security, conflicting-review, repeated
  fix-pass, or weak-evidence cases escalate to the critical independent
  profile;
- high/max reasoning is escalation-only, not the default signal that a
  procedure is important;
- reviewer output verbosity is low/bounded by default;
- the lowest-cost candidate profile remains evaluation-only until focused
  fixtures show that blocker recall and lifecycle safety do not regress.

Exact provider bindings and reasoning values must be versioned, reviewable, and
replaceable without schema or lifecycle migration.

### 6. Prompt and request hygiene

Update the active self-hosting review-request generation so it uses progressive
disclosure:

- start from `TASK.md`, the active task contract, the effective approved plan,
  the required procedure/rubric, and the generated context manifest;
- include or retrieve additional repo authority only for a concrete scope,
  architecture, evidence, or acceptance question;
- do not instruct every reviewer to read all tasks, all prompts, or all project
  documentation by default;
- reference canonical skill/procedure files instead of duplicating their full
  prose into every request;
- keep requested output to verdict, findings, evidence refs, unresolved
  blockers, escalation reason, and required next action;
- preserve exact independent-review and source/runtime boundaries.

This phase may amend the task-local/master self-hosting prompt guidance needed
for this behavior, but must not rewrite the entire procedure library.

### 7. Usage and route telemetry

Record typed facts for each existing self-hosting review invocation where they
are available:

- route decision ID and authoritative inputs;
- context core and delta overlay IDs;
- context mode and reuse hit/miss plus reason;
- request bytes, core bytes, delta bytes, payload/ref counts, truncation facts;
- adapter ID and adapter capability snapshot;
- supplied provider/model/reasoning/verbosity invocation facts;
- input, cached-input, cache-write, and output tokens when reported by the
  adapter/provider;
- latency, retries, timeout/stale disposition, and tool-call count when
  available;
- final verdict, blocker count, fix-pass count, and escalation reason.

Do not fabricate unavailable token, cache, credit, or tool-call data. Estimated
cost is allowed only when the rate-card version and calculation inputs are
explicitly recorded; raw usage facts remain authoritative.

Telemetry must remain run/runtime state and must not become Git source by
accident.

### 8. Existing review-launch integration boundary

Integrate only with the already existing self-hosting plan-review and
implementation-review/fix-pass review launch surfaces.

The phase may:

- prepare the reusable context and delta request artifacts;
- resolve the provider-neutral route to the current Codex reference binding;
- pass the bounded request to the existing reviewed Codex CLI launch path;
- ingest the resulting structured review artifact through existing procedure
  result mechanisms;
- expose honest blocked disposition when required capabilities or usage facts
  are unavailable.

The phase must not create a general external runner, background service, generic
agent loop, or arbitrary provider execution surface.

### 9. Downstream task rebase

Amend future/live task authority so later phases consume, rather than duplicate,
this phase:

- Phase 23.8.7 reuses the provider-neutral route/context fields and extends them
  into general stage packets/results; it does not recreate the self-hosting
  review context substrate.
- Phase 23.9 adds proof provenance over these records; it does not make model
  judgment override deterministic evidence.
- Phase 24A reuses `ContextCore`/manifest and adds the minimal deterministic
  report and bounded packet/export view; it does not implement a competing
  context-core type.
- Phase 30 evaluates additional model/profile candidates and promotion gates;
  it does not postpone basic usage telemetry or current-route observability.
- Phase 31 remains the first home for general reviewed external-runner
  execution. This phase is only a narrow optimization of the already existing
  self-hosting review launch path.

## Expected implementation surfaces

The implementation plan must re-check exact repo authority before editing, but
likely surfaces include:

- `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md`;
- `docs/CONTEXT_BUDGET_POLICY.md`;
- `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`;
- `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md`;
- current self-hosting procedure registry and schema;
- current run/staging schemas or migrations only if typed durable records
  require them;
- current self-hosting review request/launch/result code;
- focused acceptance fixtures for routing, context reuse, repeat review, and
  telemetry;
- `tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`;
- `tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md`;
- `tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md`;
- relevant Phase 30/31 task wording;
- `docs/IMPLEMENTATION_ROADMAP.md` and `docs/OPERATIONS_PLAN.md`.

Do not treat this list as permission to touch every listed file. The approved
implementation plan must identify the smallest coherent edit set.

## Non-goals

- No second client/provider/desktop adapter.
- No Codex Desktop UI automation.
- No mandatory App Server dependency in core.
- No ACP or A2A implementation.
- No MCP execution adapter.
- No generic runner framework.
- No background daemon, watcher, scheduler, or autonomous loop.
- No parallel write-capable subagents.
- No LLM-based router.
- No broad report or packet catalog.
- No domain pack or Ozon/business-domain logic.
- No commercial data, credentials, secrets, raw exports, or local runtime state
  committed to Git.
- No self-approval, auto-merge, or automatic owner decision.
- No weakening of deterministic verification or independent review.
- No rewrite or replay of already accepted historical implementation commits.

## Required review tier

`extra-high`

Required independent lenses:

- architecture and scope-boundary review;
- lifecycle/authority review;
- storage/runtime-state review if durable schema or migration changes are
  proposed;
- cost/context/routing review against the exact approved plan and focused
  fixtures.

One combined independent artifact may satisfy multiple lenses only when each
verdict is separately labeled and evidence-backed.

## Required planning behavior

Before implementation:

1. inspect the current E implementation/closeout facts and current source HEAD;
2. audit the existing review launcher, procedure registry, context policy,
   routing policy, payload storage, and current tests;
3. identify which context and telemetry facts are already present;
4. produce one bounded plan with exact files, schema/migration decisions,
   compatibility behavior, fixtures, and stop conditions;
5. obtain independent plan review;
6. amend the plan if required;
7. obtain explicit owner approval of the exact reviewed plan artifact.

Implementation must stop and return for renewed owner approval if it requires a
second adapter, generic runner, daemon, native addon, broad dependency,
provider-specific lifecycle schema, or material departure from this task.

## Acceptance commands

At minimum:

```bash
npm run build
node --test tests/acceptance/phase23-8-6b1-review-launch.test.mjs
npm test
git diff --check
```

The approved plan must add focused tests for the new behavior and identify the
exact commands. Do not run the canonical full acceptance pack concurrently in
the same workspace/runtime context.

## Acceptance behavior

- The first review request creates one deterministic reusable context core and a
  bounded review overlay.
- Identical authoritative core inputs reproduce the same core identity/hash.
- An amended-plan or fix-pass review normally reuses the unchanged core and
  emits only the typed delta, prior findings/dispositions, and new evidence.
- A material task/plan/base/review-boundary change forces an honest core rebuild
  or broader fresh review.
- Independent review never inherits builder transcript authority merely to save
  tokens.
- Identical routing inputs produce the same provider-neutral route decision.
- Routine work no longer receives an expensive high-reasoning route solely
  because of the procedure name.
- Critical authority/lifecycle/storage/security work cannot be downgraded by
  budget.
- The current Codex reference binding is isolated and replaceable.
- Unsupported adapter capabilities fall back honestly; no fake session/cache
  reuse is recorded.
- Request/context sizes and available invocation usage facts are queryable.
- No unavailable token or cost facts are fabricated.
- Review outputs remain bounded and evidence-linked.
- Existing lifecycle, exclusive review ownership, verification, closeout, and
  harvest behavior remains intact.
- Phase 23.8.7, 23.9, 24A, 30, and 31 authority is reconciled to consume the new
  substrate without accidental duplicate types or premature general runner
  execution.
- No second adapter, generic runtime, domain logic, or future-phase execution is
  introduced.

## Delivery requirements

Return:

- implementation report;
- exact source commit and diff summary;
- schema/migration facts;
- route/context compatibility notes;
- focused and full test results;
- usage/telemetry examples from fixtures;
- independent implementation-review verdict;
- fix-pass report and fresh review if required;
- remaining debt and explicitly deferred adapter work;
- closeout and harvest facts under the existing lifecycle.
