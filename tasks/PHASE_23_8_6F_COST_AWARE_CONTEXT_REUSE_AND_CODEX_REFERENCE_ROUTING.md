# Phase 23.8.6F - Cost-Aware Review Context Reuse and Codex Reference Routing

## Status

Active implementation phase. Phase 23.8.6E Authority Surface Freshness and
Downstream Task Revalidation is complete, independently reviewed, accepted,
merged, closed out, and harvested.

This phase is inserted immediately after Phase 23.8.6E and before Phase 23.8.7.
The near-term order becomes:

```text
23.8.6E -> 23.8.6F -> 23.8.7 -> 23.9 -> 24A
```

## Required successor-handoff corrections

The F implementation must resolve all observed native successor-handoff
defects, within this bounded contract only:

- The real successor-creation path must use Codex Desktop `create_thread` with
  its project/worktree target, and that Desktop-created successor task/worktree
  must exist before activation work begins.
- Native app-server `thread/start` may only attach a thread to a known existing
  `cwd`; it must never create a Git branch or worktree. Raw `git worktree add`
  is forbidden as a fallback where this contract requires Desktop-created
  successor ownership.
- If `list_projects`, `create_thread`, `read_thread`, `wait_threads`, cleanup,
  or an equivalent required Desktop capability is unavailable, the path must
  fail closed as `HANDOFF_CREATION_FAILED` with an explicit typed blocker and
  next allowed action. Computer Use and AppleScript must not bypass a product
  safety denial for controlling Codex Desktop.
- The Desktop-created successor itself owns branch attachment, `TASK.md`
  activation, authority edits, and the activation commit. Exactly one successor
  task, branch, worktree, and `TaskState` may own a transition; a matching
  successor must be reused idempotently and duplicate threads or worktrees are
  forbidden.
- Native and Git readback must prove task identity/link, exact `cwd`, branch,
  immutable base, activation `HEAD`, persistent state, and expected turn state
  before any successor turn, bootstrap, Harness run, or implementation. The
  predecessor must stop before successor implementation begins.
- Operator documentation must distinguish Desktop worktree creation from
  app-server thread attachment and state one non-contradictory transition
  order. Historical phase-specific `TASK.md` assertions must be replaced with
  a phase-neutral active-pointer invariant.
- Focused acceptance coverage must reject duplicate-successor instructions and
  raw-Git fallback. Harness must provide or document a product-owned,
  recoverable cleanup path for a prepared successor `TaskState`/worktree that
  never opened a run; manual `TaskState` or database edits remain forbidden.
- These corrections must not introduce a new Desktop adapter, generic UI
  automation, generic runner, background daemon, or Phase 23.8.7
  implementation.

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

### 1. Deterministic-first registered-procedure coverage

Apply a deterministic-first execution contract to every procedure present in
the self-hosting procedure registry at implementation time. The current
registry contains:

- `feature-decomposition`;
- `task-intake`;
- `task-prompt-writer`;
- `draft-plan`;
- `plan-review`;
- `plan-amend`;
- `architecture-review`;
- `db-storage-review`;
- `implementation-review`;
- `fix-pass-review`;
- `verification-review`;
- `delivery-facts-review`;
- `phase-closeout-review`;
- `docs-consistency-review`;
- `harness-audit`.

For each registered procedure, the checked-in procedure contract or route
policy must state:

- `deterministic_only`, `semantic_optional`, or `semantic_required`;
- deterministic typed, schema, database, identity, evidence, lifecycle,
  verification, delivery, merge, and harvest-readiness prechecks that apply;
- the unresolved semantic overlay, if any;
- minimum safe route floor and explicit escalation triggers;
- independence requirement and context-transport mode;
- whether an automatic Codex launch binding exists;
- the supported deterministic completion path; and
- the required typed output and evidence contract.

Execution follows one ladder: run every applicable deterministic precheck;
complete as `deterministic_no_model` when those results fully determine an
output; otherwise send only the unresolved semantic overlay to the lowest
validated safe binding; escalate only for typed residual architecture,
authority, lifecycle, storage, security, conflicting-evidence, or unresolved
critical-risk triggers. Lifecycle demand for a procedure artifact alone is not
a reason to invoke a model.

A deterministic completion is valid only when it satisfies the same output
schema, exact run/artifact identity, evidence, provenance, independence, and
approval boundaries as a semantic completion. It cannot self-approve, waive a
failed check, or bypass a required independent judgment. A missing launch
binding is a capability fact, not authority to inherit a prior expensive
binding silently.

Complete contract coverage does not create automatic launch support. Phase F
may launch only through the existing `plan-review` and
`implementation-review` Codex surfaces. All other procedures remain
deterministic or manual according to their declared capabilities unless a
later reviewed task explicitly adds a launch surface.

### 2. Minimal reusable review context

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

`ContextManifest`:

- `context_manifest_id` and parent `context_core_id`;
- ordered canonical source and retrieval references;
- stable content hashes and byte counts;
- mandatory-block presence;
- redaction, truncation, omission, and retrieval-capability facts.

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

### 3. Context transport modes

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

### 4. Delta-oriented repeat review

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

### 5. Provider-neutral deterministic route intent

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

Recalculate routing before every model-eligible invocation. In addition to the
inputs above, the decision must include review-pass kind and index, prior
verdict, prior findings and dispositions, open and newly introduced blocker
counts, bounded delta size, material task/plan/base/architecture/authority/
lifecycle/storage/security changes, previous route outcome or reviewer
disagreement, and the current core reuse state. Supported pass kinds include
initial full review, amendment review, implementation review, fix-pass review,
regression reopen, verification check, delivery check, and closeout check.

Context or session reuse never carries forward a model, profile, reasoning
effort, or verbosity decision automatically. Reuse of the same reviewer
session is allowed only when independence still holds, and the new invocation
still receives a fresh deterministic route decision.

An unchanged-core amendment or fix-pass may downgrade by at most one adjacent
approved route or reasoning step when it checks only prior findings and their
dispositions, the bounded delta, new deterministic evidence, and regressions
in touched surfaces. The approved policy version must define the ordered
adjacent ladder; without that definition no downgrade is allowed. Restore the
stronger floor immediately for a new blocker, critical-surface change, missing
or conflicting evidence, reviewer disagreement, ambiguous lifecycle legality,
material authority/boundary change, or structured-output/evidence failure on a
cheaper route. A reviewer may emit typed residual-risk or reopen-scope signals
but cannot select or downgrade its successor reviewer.

### 6. Codex reference binding

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

Model class and reasoning effort are independent dimensions. Candidate
bindings must compare representative economy and balanced model classes at
multiple reasoning levels rather than assume that a smaller model with higher
reasoning is safer or cheaper. Use the lowest measured binding that satisfies
the route floor; high, xhigh, max, or equivalent modes remain escalation-only
unless accepted evidence proves they are required.

### 7. Prompt and request hygiene

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

### 8. Usage, eval, and policy-promotion records

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

Also record the routing-policy version, provider-binding version, procedure and
pass kind/index, prior finding dispositions, and final lifecycle outcome.

Do not fabricate unavailable token, cache, credit, or tool-call data. Estimated
cost is allowed only when the rate-card version and calculation inputs are
explicitly recorded; raw usage facts remain authoritative.

Telemetry must remain run/runtime state and must not become Git source by
accident.

Retained procedure artifacts plus exact context and delta identities must
support durable, queryable, replayable eval cases. Each case preserves
immutable input identity, task/procedure/pass classification, expected critical
findings or deterministic outcome, actual findings and fixes, verification and
final lifecycle outcome, binding and available usage facts, and
redaction/retention facts. Operational telemetry, selected eval cases, accepted
routing policy, and Project Memory remain distinct typed concepts.

For the existing self-hosting Codex review path only, provide a bounded policy
promotion lifecycle: shadow a candidate while retaining the approved route;
replay retained historical review packets offline; canary by procedure/pass/
risk class; record an explicit versioned owner-approved promotion or rejection;
apply the approved policy and binding deterministically; and support rollback
to the previous approved version. Promotion is never one global downgrade.

Reject promotion for any confirmed critical-blocker miss, illegal lifecycle
progression, independence violation, material blocker-recall or verdict
regression, savings erased by additional fix passes, repeated output/evidence
failure, or higher full-run cost despite lower unit token price. Phase F does
not add online self-learning, automatic promotion, model-authored route
authority, automatic owner approval, or silent policy mutation. Phase 30 keeps
ownership of generalized experimentation and immutable-evaluator governance.

### 9. Existing review-launch integration boundary

Integrate only with the already existing self-hosting plan-review and
implementation-review/fix-pass review launch surfaces.

The automatic Codex launch command remains limited to the currently supported
`plan-review` and `implementation-review` procedures. `fix-pass-review` and all
other procedures receive route/context/capability contracts but no new
automatic binding unless an existing supported surface is proven during the
reviewed implementation plan or a later task explicitly authorizes one.

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

### 10. Downstream task rebase

Amend future/live task authority so later phases consume, rather than duplicate,
this phase:

- Phase 23.8.7 reuses route decisions, routing-policy and provider-binding
  versions, `ContextCore`, `ReviewDeltaOverlay`, context-transport facts, and
  usage facts in general stage packets/results; it does not recreate the
  self-hosting router, context substrate, or telemetry model.
- Phase 23.9 adds proof provenance over deterministic checks, policy/binding,
  route, context, independence, invocation, escalation, promotion, and usage
  records; it does not become routing authority or make model judgment override
  deterministic evidence.
- Phase 24A reuses `ContextCore`, `ContextManifest`, and
  `ReviewDeltaOverlay` and adds the minimal deterministic report and bounded
  packet/export view; it does not implement competing context types or require
  an LLM for deterministic report generation.
- Phase 30 consumes F eval cases, shadow/replay/canary results,
  promotion/rejection decisions, policy versions, rejected candidates, and
  rollback records while retaining generalized experimentation and immutable
  evaluator ownership.
- Phase 31 remains the first home for general reviewed external-runner
  execution. It consumes and generalizes approved F route, binding, context,
  telemetry, escalation, and promotion contracts without recreating ad hoc
  provider/model selection. This phase is only a narrow optimization of the
  already existing self-hosting review launch path.

### 11. Harvested procedure-artifact transfer observability

Before relying on harvested procedure evidence for context reuse, verify that
each harvested procedure artifact and its complete retained payloads are
durably present in the Project DB. Keep storage correctness distinct from
reporting completeness: a correct transfer is not evidence that the current
harvest receipt reports it truthfully. If the receipt does not report the
transfer, add operator-visible procedure-artifact and payload-transfer counts,
with focused acceptance coverage for those reported counts.

### 12. Bounded primary-source prior-art comparison

The reviewed Phase F implementation plan must compare current primary sources
for BitGN ECOM1 Exoskeleton, mini-SWE-agent, OpenAI Agents SDK, LangGraph/Deep
Agents, and Goose. Limit the comparison to deterministic preflight, cheap
helper versus strong central reasoning, evidence ledgers, context
deduplication/progressive disclosure, structured outputs, guardrails, tracing
and eval records, simple linear execution, session/handoff filtering, and
provider/adapter seams.

For each candidate, record the useful primitive, equivalent behavior already
present in `codex-harness`, boundary incompatibilities, an adopt/adapt/reject
decision, and dependency impact. The default is no new dependency. Any
framework or dependency requires separate owner approval plus evidence that it
reduces total code, migration risk, operational complexity, and maintenance.
Use prior art as a pattern source, not as a replacement runtime.

Current policy documents that still assign the first shared context substrate
to Phase 24A or all runtime routing to Phase 31 are Phase F implementation
reconciliation targets. This task-contract amendment does not claim that those
runtime policies or behaviors have already changed.

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
- Every registered procedure has an explicit deterministic/semantic class,
  prechecks, route floor, escalation, independence, transport, capability, and
  output/evidence contract.
- A deterministic completion satisfies the same exact-identity, evidence,
  approval, and independent-judgment rules as a semantic completion.
- Automatic Codex launch remains limited to `plan-review` and
  `implementation-review`; missing bindings are reported without inherited
  fallback.
- Every model-eligible invocation recalculates its route, including repeat
  review passes and reused sessions.
- A bounded downgrade cannot cross an undefined or non-adjacent policy step,
  and any reopen trigger restores the stronger floor.
- Routine work no longer receives an expensive high-reasoning route solely
  because of the procedure name.
- Critical authority/lifecycle/storage/security work cannot be downgraded by
  budget.
- The current Codex reference binding is isolated and replaceable.
- Unsupported adapter capabilities fall back honestly; no fake session/cache
  reuse is recorded.
- Request/context sizes and available invocation usage facts are queryable.
- Eval cases remain distinct from operational telemetry, accepted policy, and
  Project Memory.
- Shadow, replay, canary, promotion/rejection, and rollback remain bounded to
  the existing self-hosting review path and require explicit owner promotion.
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
