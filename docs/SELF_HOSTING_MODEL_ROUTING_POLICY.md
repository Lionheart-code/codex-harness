# Self-Hosting Model Routing Policy

## Purpose

Define the checked-in policy for self-hosting model/risk routing, bounded
helper use, and separate review launch discipline during the current manual
CLI-first phase.

This document is policy and documentation only. It does not add runtime model
selection, runner execution, provider-specific lifecycle logic, packet
automation, or approval authority.

`codex-harness` is not a worker. It is a lightweight supervisor,
orchestrator, and evaluator shell around external worker agents such as Codex,
Claude, Gemini, or other reviewed runners. The harness owns lifecycle,
evidence, issue routing, review/eval routing, and repair-first progression.

## Authority Layers

Treat these layers separately:

1. Official Codex CLI capabilities
2. Locally observed CLI help and model-capability output in the current
   worktree
3. Repo-owned harness policy in this document and the active task contract
4. Temporary model guidance for current manual self-hosting runs

Repo policy must not invent CLI flags that are absent from local help, and
temporary model guidance must not be treated as runtime routing authority.

## Target Operating Model

Routine manual review is transitional, not the steady-state target operating
model.

This phase preserves the current manual CLI surface, but later self-hosting
work should converge toward:

- deterministic checks as the first proof layer;
- an independent read-only reviewer-agent when review is required;
- a typed issue ledger instead of prose-only blocker memory;
- repair-first progression through bounded packets;
- owner stop only for configured high-risk decisions.

## Current Working Model

The current working method stays simple:

- read repo-owned task/procedure authority first;
- keep `codex-harness` in the supervisor/orchestrator role rather than the
  worker role;
- keep the main implementation session on a conservative builder route;
- use separate reviewer sessions when independence matters;
- use cheap helpers only for bounded, non-authoritative work;
- wait for terminal child completion before reading or acting on a child
  result;
- turn repeated misses into checked-in policy, tasks, or eval candidates rather
  than chat-only lore.

Current temporary model guidance is advisory only:

- main builder session: strong builder profile matched to task complexity;
- `plan-review`: `gpt-5.6-sol` with `high` reasoning;
- `implementation-review`: `gpt-5.6-sol` with `medium` reasoning;
- GPT-5.5 is a transitional baseline only, not automatic fallback or
  long-term route authority.

This guidance does not create provider/model routing, runtime profile
selection, or self-approval logic.

## Provider-Neutral Route Authority

The steady-state router is deterministic and policy-first. It runs no-model
checks first, derives a provider-neutral floor from typed facts, selects the
cheapest approved binding satisfying every floor, preserves review
independence and context transport, escalates only through typed triggers, and
blocks when no safe approved route exists. The default router is not an LLM.

Authoritative route classes:

```text
deterministic_no_model
mechanical_low_cost
routine_balanced
complex_judgment
critical_escalation
parallel_audit_leaf
parallel_audit_arbiter
```

Route precedence is:

```text
procedure_id
-> review_tier
-> changed_surface_classes
-> risk_classes
-> deterministic_evidence_state
-> prior review/fix-pass failures
-> independence requirement
-> context reconstruction cost
-> budget among safe profiles
```

Budget never weakens a profile floor, safety invariant, or independence
requirement. A route policy represents `profile_floor`, `reasoning_default`,
`reasoning_ceiling`, `escalation_triggers`,
`downgrade_forbidden_conditions`, and `verbosity_default` separately. A
procedure name alone never fixes one reasoning level.

Provisional bindings are not lifecycle authority:

```text
mechanical_low_cost: GPT-5.6 Luna
routine_balanced: GPT-5.6 Terra
complex_judgment: GPT-5.6 Sol
critical_escalation: GPT-5.6 Sol with higher reasoning
```

Luna and Terra remain evaluation candidates until Phase 30 promotes them.
Core contracts describe capabilities, while provider/model bindings remain
behind adapter/profile boundaries for Codex, Claude, Gemini, local models, and
future reviewed workers.

## Context Transport And Independence

Allowed transport modes are `fresh_packet`, `resume_same_role`,
`packet_plus_retrieval`, and `fork_non_authoritative`.

- planner-to-amendment and builder-to-bounded-fix-pass may resume the same role;
- independent review uses a fresh packet or packet plus read-only retrieval;
- forks and subagents are non-authoritative scouts or experiments unless a
  later contract promotes their result through review;
- transcript and hidden reasoning are not authority;
- prompt caching is an execution optimization, not memory, proof, or authority;
- raw logs stay bounded, referenced, and provenance-linked;
- a deterministic shared context core may feed separate semantic overlays, but
  each review keeps its own rubric, verdict, evidence trail, and independence.

## Two-Factor Routing Rule

Do not route work only by procedure name.

Choose the route from two factors:

1. Risk and judgment class
2. Context inheritance cost

Use stronger routes when the work touches architecture boundaries, storage or
migration semantics, rollback/recovery rules, source/runtime authority,
approval or sandbox policy, cross-phase lifecycle invariants, conflicting
evidence, or large blast radius if a blocker is missed.

Use a cheaper helper only when the packet is genuinely small and
self-contained. If the child would need broad task, plan, review, or runtime
history reconstructed just to act correctly, keep the work in the main
session.

## No-Silent-Degradation

Do not weaken model strength or review separation for cost reasons without
local evidence.

That means:

- do not globally weaken important review classes because a cheaper route
  sounds good;
- do not treat vendor guidance alone as proof that the route is safe for this
  repository;
- do not treat a passed-looking answer as proof that blocker recall stayed
  intact.

Promote a cheaper route only after local evidence shows blocker recall,
convergence, lifecycle ordering, and cross-boundary review quality did not
materially regress.

## Bounded Helpers And Subagents

Bounded helpers and subagents are not default authority. External agents are
workers, not lifecycle owners.

Use them only when all of the following are true:

- the active procedure, packet, or repo-owned policy explicitly allows the
  helper role;
- the work is parallelizable, read-heavy, or mechanically classificatory;
- the packet is small and self-contained;
- the child result is observational or non-authoritative;
- the parent can proceed correctly only after the child returns.

If explicit permission markers are absent, treat the route as `no-subagents`.

The cheap orchestrator pattern is a later controlled target only. It belongs
to later advisory/eval/execution phases, not current runtime behavior.

## Child Wait Discipline

For any separate review or bounded helper launch:

- allow only one live equivalent child for the same task at a time;
- wait for terminal completion before reading or acting on the result;
- do not relaunch blindly because the first attempt is slow;
- do not treat partial output as terminal completion;
- if the process exits but the artifact is missing or stale, treat that as a
  blocker, not a silent pass.

## Codex CLI Separate Review Launch Discipline

Probe local CLI help before uncertain launches:

```bash
codex --version || true
codex --help
codex exec --help
codex debug models --bundled || true
```

Observed local support in the current worktree:

- explicit model override: supported via `--model`;
- generic config override: supported via `--config`;
- dedicated reasoning-effort flag: not advertised by local help;
- read-only sandbox selection: supported via `--sandbox read-only`;
- durable final artifact write: supported via `--output-last-message`;
- current worktree execution context: supported via `--cd`;
- `codex exec --help` does not advertise `--ask-for-approval`, so review
  launch examples for this phase must not depend on that flag.

Required worktree-relative artifact paths:

- `.harness/runs/<run-id>/manual/plan-review-request.md`
- `.harness/runs/<run-id>/manual/plan-review.md`
- `.harness/runs/<run-id>/manual/implementation-review-request.md`
- `.harness/runs/<run-id>/manual/implementation-review.md`

Preferred non-interactive review launch shape for `plan-review`:

```bash
RUN_ID=<run-id>
codex exec -C "$PWD" -s read-only -m gpt-5.6-sol \
  -c 'model_reasoning_effort="high"' \
  -o ".harness/runs/$RUN_ID/manual/plan-review.md" \
  - < ".harness/runs/$RUN_ID/manual/plan-review-request.md"
```

Preferred non-interactive review launch shape for `implementation-review`:

```bash
RUN_ID=<run-id>
codex exec -C "$PWD" -s read-only -m gpt-5.6-sol \
  -c 'model_reasoning_effort="medium"' \
  -o ".harness/runs/$RUN_ID/manual/implementation-review.md" \
  - < ".harness/runs/$RUN_ID/manual/implementation-review-request.md"
```

Interpretation rules:

- use `--config` for `model_reasoning_effort` only if the local CLI accepts the
  key at launch time;
- if the local CLI rejects that config key, fail closed and record the exact
  blocker;
- use the checked-in `prompts/self-hosting/<procedure-id>.md` wrapper as the
  invocation helper, but keep the canonical `skills/self-hosting/**` contract
  as authority.

Forbidden review-launch behavior:

- using `codex fork` for ordinary separate review passes;
- using an interactive TUI transcript as if it were a durable review artifact;
- letting the main implementation session review its own plan or diff as
  durable review evidence;
- omitting the durable review request or result artifact;
- running review in a write-enabled sandbox;
- launching a second equivalent reviewer while the first one is still alive;
- retrying blindly with a different mechanism;
- treating partial output as terminal completion.

Allowed correction sequence if the first review launch fails:

1. Re-read the relevant local help output
2. Make exactly one syntax correction that preserves the required invariants
3. Rerun once
4. If it still fails, stop and record the exact blocker

Allowed blocker categories:

- unsupported CLI flag;
- unsupported model override;
- unsupported reasoning-effort override;
- unsupported sandbox mode;
- unsupported output artifact flag;
- auth/plan/rate-limit issue;
- model unavailable in local account;
- shell quoting issue;
- missing Codex CLI feature;
- unknown CLI/runtime failure.

## Exact Identity And Lifecycle Completion

Display `run_id` is not the globally unique accepted-memory identity.

Exact `run_instance_id` remains the authoritative cross-run identity. Policy
examples and future runtime behavior must not imply that later `run-0001` reuse
may overwrite earlier accepted/project-memory state from a different exact run
instance.

Finishing review or local verification is not the terminal success state for an
active self-hosting run. The harness must continue through closeout and harvest
under the existing lifecycle rules unless a real gate or blocker stops it.

Blocker notes are not accepted review results. A launch blocker, hang report,
or missing artifact remains issue evidence until an independent review artifact
or later repair step resolves it.

## Phase Placement

- Phase `23.8.6` owns durable procedure-result ingestion, exact run identity,
  and new-cycle materialization commands.
- Phase `23.8.6A` owns replay and re-ingestion continuity across the active
  self-hosting chain.
- Phase `23.8.6B` owns this checked-in policy packaging pass only.
- Phase `23.8.6B1` owns supervised review launch, blocked disposition, and
  exact-identity-safe launch evidence for `plan-review` and
  `implementation-review`.
- Phase `23.8.6B2` owns verification-command rationalization and serialization.
- Phase `23.8.6C` owns the minimum self-hosting orchestrator entrypoint:
  read operator status, select exactly one next procedure, prepare one bounded
  worker handoff, prompt, or packet for an external worker surface outside
  harness runtime runner execution, ingest any returned result as typed
  lifecycle evidence, run deterministic checks, run independent
  reviewer/evaluator agents when required by review tier, record typed
  `RunIssue` entries, emit a `RepairPacket` before continuing when unresolved
  issues exist, and stop on a hard blocker, configured owner gate, or budget
  stop. It must not launch external runners or implement runtime execution
  enforcement.
- Phase `23.8.6D` owns procedure artifact payload storage and worktree
  retention.
- Phase `23.8.6E` owns authority-surface freshness and downstream task
  revalidation.
- Phase `23.8.7` formalizes `StagePacket`, `StageResult`,
  `ExecutionPolicy`, `RunIssue`, and `RepairPacket` contracts after Phase
  `23.8.6C` proves the minimum loop. It must not be the first place where that
  loop exists.
- Phases `24A` and `24B` may report which route/model/effort was used and why.
- Phase `30` is the home for broader eval-backed calibration and promotion or
  rejection of cheaper routes after minimum lifecycle fixtures already exist.
- Phase `31` is the reviewed external runner-adapter boundary. It may execute
  approved packets through reviewed worker surfaces under `RunnerProfile` and
  `ExecutionPolicy` boundaries, and it remains the runtime execution
  enforcement boundary, but it must not become a coding agent, auto-merge
  system, or unrestricted autonomous repair loop.

## Required Future Fixtures

The following observed failure classes must become typed fixtures in the
minimum orchestrator and later packet/result layers rather than remain chat
folklore:

- self-approval attempt;
- skipped `architecture-review`;
- skipped `db-storage-review`;
- `AMEND_REQUIRED` without valid amended-plan review;
- missing `implementation-review` artifact;
- blocker note treated as `ACCEPT`;
- source edits before valid lifecycle approval;
- reviewer launch hang;
- failed verification;
- scope creep;
- fake closeout.

## Non-goals

- No runtime model routing
- No runner execution
- No packet execution logic
- No provider-specific lifecycle logic
- No automatic launch orchestration in the runtime
- No silent fallback from durable separate review into interactive/manual
  summary behavior
