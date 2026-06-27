# Agent Brief - Harness Working Model, Routing, and Cheap-Orchestrator Placement

## Status

Non-authoritative planning brief.

This file is input for a future docs/task pass. It does not override:

1. `TASK.md`
2. `docs/MASTER_ARCHITECTURE.md`
3. `docs/IMPLEMENTATION_ROADMAP.md`
4. `docs/OPERATIONS_PLAN.md`
5. `AGENTS.md`

Any executing agent must read the active authority set first and stop if the
active task does not authorize this work.

## Purpose

Package one practical answer:

How should `codex-harness` work now, and where should a cheaper orchestrator,
subagents, model routing, and token-economy policy be introduced later?

## Bottom Line

The cheap-orchestrator idea is directionally correct, but only as a later
controlled mode.

It is compatible with `codex-harness` only if all of the following stay true:

- the harness remains procedure-first and repo-owned;
- the orchestrator mostly routes and waits instead of making deep boundary
  judgments;
- stronger specialist passes still own cross-boundary review;
- subagents are explicit and bounded, not default;
- child sessions are launched once and awaited to terminal state;
- cheaper routes are promoted only after local eval evidence shows no material
  degradation.

So the right shape is:

- policy first;
- advisory metadata later;
- provenance and evals after that;
- runtime enforcement only in a later explicit execution phase.

## What To Do Now

Current working method should stay simple:

1. use short harness-first prompts;
2. read repo-owned procedure/task authority first;
3. keep the main session on a conservative review-capable route;
4. use separate stronger review passes when independence matters;
5. use cheap helpers only for bounded mechanical work;
6. wait for terminal child results instead of relaunching;
7. record recurring misses as future task/eval inputs, not ad hoc prompt lore.

This keeps work aligned with the harness that already exists instead of
smuggling in premature runtime automation.

One explicit failure mode from the current self-hosting run should be carried
forward:

- `node bin/ch run status --operator --run <run-id>` is a stage oracle for the
  current run's durable evidence state, not an implementation backlog
  authority;
- the active `TASK.md`, the task it references, and the approved plan decide
  what may be implemented;
- later-stage `missing_evidence` or `next_allowed_action` output must not be
  treated as permission to widen implementation scope just to move the run
  forward;
- if satisfying a reported stage would require a missing product surface, the
  operator must first check whether that surface is already required by the
  active task or should instead be recorded as a follow-up gap.

## Current Temporary Operating Policy

This is a temporary operating policy, not a permanent lifecycle contract.

### Main continuous session

Use a conservative default for the session that:

- reads the active task;
- interprets procedure boundaries;
- decides whether to stay in the current procedure or stop at a gate;
- keeps the main continuity context.

Recommended current default:

- `GPT-5.4 high`

Possible later downshift candidate after local validation:

- `GPT-5.4 medium`

Do not default this role to `GPT-5.4-mini` yet.

### Independent cross-boundary review

Use a stronger separate review path for:

- `plan-review` when independence matters;
- `architecture-review`;
- `db-storage-review`;
- `harness-audit`;
- arbitration after conflicting findings.

Recommended default:

- `GPT-5.5 medium`

Escalation route:

- `GPT-5.5 high`

### Cheap bounded helper work

Use a cheaper route only for small self-contained tasks such as:

- wrapper/registry/schema parity scans;
- narrow docs-consistency checks;
- evidence extraction from files/logs;
- file classification or prefiltering;
- small read-heavy supporting scans.

Recommended default:

- `GPT-5.4-mini medium`

Possible lower setting:

- `GPT-5.4-mini low`

Use only when the packet is small and the result is non-authoritative.

## The Core Routing Rule

Do not route work only by procedure name or stage name.

Choose the route from two factors:

1. risk and judgment class;
2. context inheritance cost.

### Factor 1 - risk and judgment class

Use stronger routes when the work touches:

- architecture boundaries;
- DB or migration semantics;
- rollback or recovery rules;
- source/runtime authority boundaries;
- approval or sandbox policy;
- cross-phase lifecycle invariants;
- conflicting evidence;
- large blast radius if a blocker is missed.

### Factor 2 - context inheritance cost

A cheaper helper is only economical if it receives a small self-contained
packet.

Rule:

- if the child would need broad task, plan, review, or runtime history
  reconstructed just to act correctly, keep the work in the current main
  session instead of spawning a cheap helper.

This is the main reason a cheap orchestrator is not yet the current default.

## No-Silent-Degradation Rule

Do not change model strength for cost reasons without local evidence.

That means:

- do not globally move important review classes from `high` to `medium` or
  `mini` because it sounds cheaper;
- do not assume vendor-level guidance alone proves the route is safe for this
  repository;
- do not treat a passed-looking answer as proof that blocker recall stayed
  intact.

Promote a cheaper route only after local evidence shows:

- blocker recall stayed acceptable;
- convergence did not materially worsen;
- lifecycle ordering did not regress;
- cross-boundary review quality did not collapse.

## When To Raise The Level

Escalate model or reasoning level when:

- a pass or near-pass ignored the obvious critical invariants;
- reasoning is vague or generic;
- a later stronger reviewer finds blockers the cheaper pass should have found;
- blocker categories keep shifting instead of narrowing;
- the operator cannot explain why the result is safe from the artifact alone;
- the remaining question is judgment under uncertainty rather than mechanical
  checking;
- repeated amendments reopen the same risk.

Conservative rule:

- if unsure whether the route was too weak, escalate one rung instead of
  guessing.

## Subagent Policy

Subagents fit the harness only as a bounded helper mechanism.

They are not default authority and not universal procedure behavior.

### Hard rule

Each concrete subagent use must be authorized by the active:

- procedure, or
- packet, or
- operator policy

for that exact helper role.

If explicit permission markers are absent, treat it as:

- `no-subagents`

### Safe use

Use subagents only when all of the following are true:

- the environment supports them;
- the work is parallelizable or read-heavy;
- the packet is small and self-contained;
- the child result is observational, classificatory, or non-authoritative;
- the orchestrator can proceed correctly only after the child returns.

### Unsafe use

Do not use subagents when:

- they must reconstruct broad history;
- they are expected to make final gate judgments;
- the work is not actually parallel;
- the repacking cost is larger than the value of parallelism.

### Recommended future permission markers

- `subagents_allowed: false|true`
- `subagent_scope: none|read_only|mechanical_only|bounded_parallel_read`
- `subagent_max_count: <n>`
- `subagent_profiles_allowed: [routing profiles]`
- `subagent_result_role: observation_only|classification_only|non_authoritative_summary`
- `subagent_wait_required: true`

## Child-Run Discipline

This rule should be treated as mandatory:

**launch once, wait for terminal result, then continue**

Do not:

- relaunch equivalent children because output has not appeared yet;
- treat temporary silence as completion;
- infer termination from "artifact not written yet";
- kill a still-live child because the orchestrator became impatient.

Current manual policy should be:

- one live child stays the active unit of work;
- the orchestrator may only poll or read that same child;
- success, failure, blocker, or next-step decisions happen only after terminal
  state is clear;
- termination is allowed only by explicit stop policy, explicit operator
  cancellation, or proven stuck state under that policy.

## Separate Codex CLI Review Launch Discipline

When this brief later becomes authoritative policy, separate review sessions
should not be left to prompt guesswork.

The harness should document a repo-owned local launch discipline for separate
review-only Codex CLI passes.

### Required local probe before uncertain review launch

Before drafting or running a separate review-only launch pattern on a given
machine, probe the local CLI in read-only mode:

```bash
codex --version || true
codex --help
codex exec --help
codex debug models --bundled || true
```

If `codex debug models --bundled` is unsupported, treat that as capability
information only, not as a blocker by itself.

The immediate source of truth for command shape must be:

- local `codex --help`
- local `codex exec --help`

Official docs remain supporting references, not permission to invent flags that
are absent locally.

### Required invariants for separate review launches

If the local CLI supports them, separate review passes should preserve these
invariants:

- non-interactive separate run;
- explicit model override;
- explicit reasoning-effort override if supported;
- read-only sandbox for review;
- durable review request artifact;
- durable review result artifact;
- current worktree as execution context;
- terminal child completion before reading or acting on the result.

### Preferred policy shape

The eventual canonical policy should document the local equivalent of a launch
pattern like:

- write `plan-review-request.md` or `implementation-review-request.md`;
- run `codex exec` in read-only mode from the current worktree;
- write the final review artifact through `--output-last-message` or a local
  equivalent if supported;
- inspect the result only after true terminal completion.

The docs must distinguish:

- official Codex CLI capabilities;
- locally observed CLI help and capabilities;
- repo-owned harness policy;
- temporary current-model guidance.

The docs must not hard-code one machine's transient absolute paths as repo
truth.

### Forbidden review-launch behavior

Repo policy should explicitly forbid:

- using `codex fork` for ordinary separate review passes unless local help and
  repo-owned procedure explicitly require it;
- starting an interactive TUI review and summarizing it manually as if it were
  a durable review artifact;
- letting the main implementation session review its own plan or diff;
- omitting the durable review artifact;
- running review in a write-enabled sandbox;
- launching a second equivalent reviewer while the first one is still alive;
- retrying blindly with a different mechanism;
- treating partial output as terminal completion.

### Allowed correction sequence

If the first review launch fails, the allowed correction sequence should be:

1. re-read the relevant local help output;
2. make exactly one syntax correction that preserves the required invariants;
3. rerun once;
4. if it still fails, stop and record the exact blocker.

Recommended blocker categories:

- unsupported CLI flag;
- unsupported model override;
- unsupported reasoning-effort override;
- unsupported sandbox mode;
- unsupported output artifact flag;
- auth, plan, or rate-limit issue;
- model unavailable in local account;
- shell quoting issue;
- missing Codex CLI feature;
- unknown CLI or runtime failure.

## What Actually Saves Cost First

The first cost savings should not come from globally weakening the main model.

The biggest near-term wins are:

1. short harness-first prompts;
2. repo-owned procedures and wrappers instead of ad hoc restatement;
3. bounded child packets instead of broad context reconstruction;
4. no duplicate child launches;
5. stable packet structure and stable instruction prefixes;
6. using cheap helpers only where the result is truly mechanical.

Prompt caching is directly relevant for API-backed paths and conceptually
relevant for CLI paths:

- keep stable instructions and tools early;
- keep volatile run-specific material late;
- avoid needless prompt reshaping between repeated calls.

But prompt caching should not be treated as the main current harness lever,
because the current waste source is more often orchestration churn than
provider-side caching.

## Cheap-Orchestrator Target

The desired later shape is:

- cheap orchestrator;
- expensive specialists.

The cheap orchestrator should do only this:

- read current stage and state;
- load the relevant procedure or packet;
- determine the allowed next action from explicit authority;
- launch one bounded helper or reviewer if explicitly allowed;
- wait for terminal result;
- route to the next allowed state;
- stop at approval or blocker boundaries.

### Why this is not the default today

Today the orchestrator still performs meaningful judgment:

- it reads and interprets authority;
- it distinguishes shallow from deep blockers;
- it can still break lifecycle order if its reasoning is weak.

Therefore:

- future target: yes;
- current default: not yet.

### Readiness conditions before downshift

Do not make the main orchestrator cheap by default until these are mostly
true:

1. procedure and state progression are durable and explicit;
2. packet and result structure is stable;
3. subagent permissions are explicit;
4. child wait and terminal-state policy is repo-owned and clear;
5. orchestration is mostly routing and waiting, not deep judgment;
6. local evals show no material degradation in blocker recall, convergence, or
   lifecycle correctness.

## Phase Placement

### Current active task context

`TASK.md` currently points to:

- `tasks/PHASE_23_8_5_AUTOMATION_ROADMAP_AND_TASK_AUTHORITY_REBASE.md`

That means this topic belongs here only as:

- planning input;
- roadmap/task placement guidance;
- non-runtime policy framing.

It does not belong here as runtime implementation.

### Phase 23.8.6A

If the repository adopts a narrow `23.8.6A` pre-step between `23.8.6` and
`23.8.7`, that pre-step should be used for one runtime-adjacent correction
only:

- generalize exact-artifact replay and idempotent re-ingestion across the full
  active self-hosting operator chain, so already-recorded durable artifacts can
  backfill newly parseable derived procedure state without duplicate evidence,
  per-run repair logic, or stage-skipping hacks.

This belongs in `23.8.6A` only if that task is explicitly framed as a narrow
extension of the `23.8.6` procedure-ingestion foundation.

#### Why 23.8.6A becomes required

Treat `23.8.6A` as a required bridge, not an optional polish pass, when all of
the following are true:

- `23.8.6` exact immutable run identity is enforced for closeout, harvest, and
  other mutating runtime paths;
- legacy self-hosting runs without `run_instance_id` remain readable for
  status/inspection but can no longer be mutated honestly;
- the active self-hosting path still needs to continue from already-recorded
  durable artifacts rather than restarting from an empty fresh run.

In that state, the old run cannot be closed out or harvested honestly, but a
replacement run also cannot be restored correctly unless the product can replay
and re-ingest the exact already-recorded artifacts across the active operator
chain.

So the practical rule is:

- if `23.8.6` hardens exact identity first, and the repository still needs
  honest self-hosting continuity on legacy or partially-ingested runs, then
  `23.8.6A` is the next required runtime bridge;
- without it, agents are pushed toward manual `run.json` repair, per-run
  patches, stage skipping, or fake restart behavior, which is exactly what the
  harness is supposed to forbid.

This is why `23.8.6A` should be framed as continuity repair for the active
self-hosting path, not as a broad new architecture phase.

#### Full active chain for 23.8.6A

If `23.8.6A` is adopted, the default target set should be:

- `task-intake`
- `task-prompt-writer`
- `draft-plan`
- `plan-review`
- `plan-amend`
- `architecture-review`
- `db-storage-review`
- `implementation-review`
- `fix-pass-review`
- `verification-review`
- `delivery-facts-review`
- `phase-closeout-review`
- `approve-plan`

Reason:

- runtime/operator progression already depends on these as real durable
  evidence surfaces;
- early procedures are currently exposed because stage routing already waits on
  their evidence;
- later review procedures are the most likely to arrive through separate
  review sessions, delayed parsing, or exact-artifact replay scenarios.
- this is the minimum chain needed to let a replacement exact-identity run
  recover honest progress from already-recorded artifacts without manual repair
  or re-running unrelated completed work.

#### Out of default 23.8.6A scope

Do not include these by default:

- `feature-decomposition`
- `docs-consistency-review`
- `harness-audit`

Only include them if `23.8.6A` is intentionally widened to cover all registry
procedures rather than the active self-hosting run chain.

#### What 23.8.6A is not

`23.8.6A` should not become:

- model-routing policy packaging;
- provider/model selection logic;
- subagent launch policy;
- runner/session orchestration;
- stage-packet automation;
- report/proof/access work.

Those remain later concerns.

### Phase 23.8.6

Home for:

- durable procedure-result ingestion;
- run identity;
- next-task activation and new-cycle materialization through formal commands.

Not the home for:

- model routing runtime;
- child session orchestration;
- subagent launch policy;
- runner execution.

If `23.8.6A` exists, it is the right place for the narrow replay/re-ingestion
repair described above. It is not the right place for docs/policy packaging.

### Phase 23.8.7

Home for advisory packet metadata only.

This is the first correct place to introduce packet-level advisory fields such
as:

- `routing_profile`
- `recommended_model`
- `recommended_reasoning_effort`
- `review_separation_required`
- `context_budget_class`
- `escalation_triggers`
- `deescalation_triggers`
- `forbidden_routes`
- `subagents_allowed`
- `subagent_scope`
- `subagent_max_count`
- `subagent_profiles_allowed`
- `subagent_wait_required`
- `child_execution_mode`
- `single_live_child_required`
- `expected_terminal_artifact`
- `result_wait_policy`
- `child_stop_policy`

Important:

- advisory only;
- no launch logic;
- no runtime enforcement;
- no runner invocation.

### Phase 24A and 24B

Home for reporting and provenance such as:

- which routing profile was used;
- which model and effort were used;
- why escalation or de-escalation happened;
- whether the pass was inline, separate review, or bounded helper;
- whether a later stronger review overruled it.

### Phase 30

Home for eval-backed calibration:

- blocker recall by review class;
- cost per outcome by route;
- convergence quality after re-review;
- usefulness of cheap helpers on bounded packets;
- false positives and false negatives in trigger or route selection;
- promotion of recurring findings into evals.

This is also the correct place to prove whether a cheaper orchestrator is good
enough for wider use.

### Phase 31

Home for real reviewed child or runner execution.

This is the first correct phase for runtime-enforced child execution rules
such as:

- durable invocation identity;
- one non-terminal child per packet or packet version;
- explicit terminal states;
- no relaunch before terminal or reviewed recovery;
- explicit execution policy boundaries;
- provider-neutral runner surfaces.

This later runtime layer should apply equally to:

- local CLI review sessions;
- bounded subagents;
- future API-backed or provider-backed execution paths.

### Separate docs/policy packaging pass

The model-routing, cheap-orchestrator, and bounded-subagent policy from this
brief should not be overloaded into `23.8.6A` if that phase is used for the
runtime pre-step above.

If the repository wants to promote this brief into authority, use a separate
narrow docs/task-policy pass after `23.8.6A` rather than mixing:

- runtime replay/re-ingestion repair; and
- docs/model-routing policy packaging

into one task context.

That separate docs/task-policy pass should also package the Codex CLI separate
review launch discipline above into repo-owned policy and narrow operator docs
so future agents stop guessing and relaunching incorrectly.

## What Not To Do

Do not:

- make `GPT-5.4-mini` the default orchestrator now;
- turn subagents into default behavior;
- put provider/model names into lifecycle authority;
- insert runtime routing logic into 23.8.5 or 23.8.6;
- add runner invocation to 23.8.7;
- optimize for token savings by weakening boundary reviews;
- depend on prompt magic instead of repo-owned policy and procedure surfaces.

## Short Practical Working Rule

If the user asks how to work right now, the answer should be:

1. run the harness with short procedure-first prompts;
2. keep the main session conservative;
3. use a separate stronger review for independent boundary checks;
4. use cheap helpers only for bounded mechanical work;
5. wait for terminal child results;
6. record recurring misses for later packet, report, and eval phases.

## Suggested Future Packaging Pass

When this moves from note to authority, the future agent should:

1. read:
   - `TASK.md`
   - `AGENTS.md`
   - `docs/MASTER_ARCHITECTURE.md`
   - `docs/IMPLEMENTATION_ROADMAP.md`
   - `docs/OPERATIONS_PLAN.md`
   - `docs/SELF_HOSTING_REVIEW_TIER_POLICY.md`
   - this brief
2. verify the active task authorizes docs/task-policy work;
3. if authorized:
   - create a canonical doc such as
     `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md`;
   - add only narrow references from operator/manual/roadmap surfaces;
   - keep the content advisory and provider-neutral;
   - do not add runtime code;
4. if not authorized:
   - stop;
   - report the correct task placement.

## Acceptance For That Future Pass

Keep acceptance narrow unless the active task explicitly expands it:

```bash
npm run build
git diff --check
```

## Source Material Used

Primary local inputs:

- `/Users/lionheart/Downloads/deep-research-report (6).md`
- `/Users/lionheart/.codex/attachments/83ac93df-2739-4956-a9e6-624d252b833b/pasted-text.txt`
- current repository task and roadmap docs

Official references consulted:

- [Harness engineering](https://openai.com/index/harness-engineering/)
- [Subagents](https://developers.openai.com/codex/subagents)
- [Agent Skills](https://developers.openai.com/codex/skills)
- [Codex best practices](https://developers.openai.com/codex/learn/best-practices)
- [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
- [Using GPT-5.5](https://developers.openai.com/api/docs/guides/latest-model)
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Follow a goal](https://developers.openai.com/codex/use-cases/follow-goals)
- [Iterate on difficult problems](https://developers.openai.com/codex/use-cases/iterate-on-difficult-problems)
- [Agent improvement loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)
- [Testing agent skills systematically with evals](https://developers.openai.com/blog/eval-skills)
- [Build iterative repair loops with Codex](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex)

## Final Answer

Yes, your idea fits the harness, but only in this form:

- cheap orchestrator later;
- expensive specialists now where judgment matters;
- explicit subagent permission;
- explicit wait discipline;
- no silent degradation;
- runtime enforcement only after the packet, report, and eval foundations are
  in place.
