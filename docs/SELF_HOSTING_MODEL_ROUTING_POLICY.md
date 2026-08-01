# Self-Hosting Model Routing Policy

## Phase 23.9 production review binding

Planning bundles and standalone implementation/fix reviews use profile
`accepted-critical-independent`: `codex_cli`, OpenAI, `gpt-5.6-sol`, high
reasoning, read-only sandbox, approval `never`, file output, and
`fresh_independent_delta`. `safe_session_resume=false`; requested values are
comparison inputs and only retained raw startup observations establish the
observed profile.

## Purpose

Define the checked-in policy for self-hosting model/risk routing, bounded
helper use, and separate review launch discipline during the current manual
CLI-first phase.

Phase 23.8.6F implements the checked-in provider-neutral route policy and
isolated Codex reference binding only for existing `plan-review` and
`implementation-review` launches. It does not add general runner execution,
provider-specific lifecycle logic, packet automation, or approval authority.

Phase 23.9 authorizes one additional bounded planning-review cohort: a fresh,
independent, non-interactive Codex review may be continued sequentially across
the existing `plan-review`, `architecture-review`, and `db-storage-review`
lenses only when the exact saved thread and every observed profile/authority
fact validate. Each lens keeps a separate canonical artifact and verdict;
implementation review is excluded. This does not authorize a generic runner,
provider-host execution framework, defaulted resume, parallel review, or
automatic approval.

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
- `implementation-review`: `gpt-5.6-terra` with `high` reasoning;
- GPT-5.5 is a transitional baseline only, not automatic fallback or
  long-term route authority.

This guidance does not create provider/model routing, runtime profile
selection, or self-approval logic.

## File-output review launch liveness

For a registered `codex_cli` review profile with `output_mode: file`, the
checked-in `termination_policy: terminal_completion_only` is binding. The
original launcher is the sole owner of its direct reviewer child until that
child reaches terminal exit. `timeout_seconds` is the only automatic deadline
that may send `SIGTERM`; an explicit human cancellation remains a separate
human action.

`stale_after_seconds` is monitoring-only. Missing stdout/stderr records a
`progress_unknown` observation, but never signals the child, starts a
replacement reviewer, accepts a partial result, or advances lifecycle state.
PID and output-file changes are liveness observations rather than termination
authority. If the owner process cannot return to record terminal exit, the
claim remains fail-closed: do not adopt or clear it. Explicitly cancel through
the human recovery path, discard the affected run, and use a fresh run.

## Transitional C1A Cost-Control Bridge

Review tier and model reasoning are separate. `extra-high` controls review
strictness, required lenses, evidence, independence, and stop conditions; it
does not automatically select extreme reasoning.

For the current C1A review chain:

- use Sol High for `plan-review` and the architecture/authority judgment pass;
- use Terra High for `implementation-review`;
- use Terra Medium for docs-consistency, mechanical semantic review, and
  `harness-audit`;
- run verification, delivery-facts, and closeout deterministic-first;
- use Terra Medium for semantic follow-up after a deterministic-first gate;
- escalate to Sol High only for conflicting evidence, a critical
  authority/lifecycle finding, or a repeated failed fix-pass.

`xhigh`, `max`, and `ultra` are prohibited as defaults. Each requires a
separately recorded escalation reason. This is a bounded current binding and
cost-control bridge. Phase 23.8.6F owns the narrow existing-review-path runtime
enforcement; Phase 31 remains the owner of generalized dynamic routing and
external-runner enforcement.

## Review anti-recursion

Every Harness-launched reviewer receives a fixed parent-owned role, exact run
instance, procedure, attempt, claim, and marker environment context. A nested
`run launch-review` validates that context against the exact live Harness claim
and returns `REVIEW_RECURSION_FORBIDDEN` before creating an attempt, claim,
child, or artifact wait. Missing or conflicting inherited fields fail closed.
The environment marker is an early guardrail only; live Harness state remains
authority. The generated request also requires direct artifact completion and
forbids delegation or output-path polling. Existing timeout, cancellation,
exclusive ownership, observation, artifact validation, and ingestion remain
unchanged; no process-tree supervisor is introduced.

The C1A final report must state whether any extreme-reasoning escalation
occurred and cite its recorded trigger and reason; otherwise it states that no
such escalation occurred.

## Provider-Neutral Route Authority

The steady-state router is deterministic and policy-first. It runs no-model
checks first, derives a provider-neutral floor from typed facts, selects the
cheapest approved binding satisfying every floor, preserves review
independence and context transport, escalates only through typed triggers, and
blocks when no safe approved route exists. The default router is not an LLM.

Authoritative route classes:

```text
deterministic_no_model
balanced_routine
complex_judgment
critical_independent
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
deterministic_no_model: no model
balanced_routine: GPT-5.6 Terra
complex_judgment: GPT-5.6 Sol
critical_independent: GPT-5.6 Sol with independent review
```

Candidate profiles remain non-authoritative until a retained evaluation,
bounded canary, explicit owner decision, reviewed source application, and
exact application record change the accepted checked-in version. Phase 30
consumes these records and generalizes experimentation; it is not required to
enforce the narrow Phase F lifecycle.
Core contracts describe capabilities, while provider/model bindings remain
behind adapter/profile boundaries for Codex, Claude, Gemini, local models, and
future reviewed workers.

## Primary-source pattern decisions

Sources were revalidated on 2026-07-21. BitGN's deterministic exoskeleton is
adapted for prechecks and evidence-ledger discipline; mini-SWE-agent's bounded
linear loop is adapted to existing claims/timeouts; OpenAI Agents SDK handoff
and tracing concepts are adapted to filtered context and exact identities;
Deep Agents context patterns are adapted to stable core/manifest/delta
separation; Goose capability seams are adapted to the isolated binding. Their
agent runtimes are rejected as dependencies because Harness already owns the
required primitives and Phase F must not add a second execution framework.
Official Codex CLI/model/worktree documentation and local CLI 0.144.1 help are
adopted only for capability facts, never as proof of repository-specific
safety or cost superiority. Dependency impact for every decision is `none`.

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
codex exec -C "$PWD" -s read-only -m gpt-5.6-terra \
  -c 'model_reasoning_effort="high"' \
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
- Phase `23.8.6C2A` owns commit-backed next-task materialization and
  deterministic environment/procedure readiness for both Harness and Codex
  Desktop-created worktrees. It does not copy ignored private state, select a
  provider, or run a worker.
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
