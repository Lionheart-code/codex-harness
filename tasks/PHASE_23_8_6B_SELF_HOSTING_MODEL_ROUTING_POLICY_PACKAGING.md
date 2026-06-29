# Phase 23.8.6B - Self-Hosting Model Routing Policy Packaging

## Status

Planned. Starts only after Phase 23.8.6 and Phase 23.8.6A are complete,
reviewed, accepted, and merged.

Before materializing this task context:

- local `main` must be fast-forwarded to fresh `origin/main`;
- one task = one branch = one worktree must be preserved.

## Purpose

Promote the checked-in self-hosting model-routing and separate-review-launch
policy into narrow authoritative docs/task surfaces without adding runtime
code.

This pass packages the current CLI-first review discipline, bounded-helper
policy, and future-phase placement rules so future agents stop guessing about
separate review launches, model/risk routing, and where runtime execution
belongs.

## Scope

Required behavior:

- Create `docs/SELF_HOSTING_MODEL_ROUTING_POLICY.md` as the canonical policy,
  or update it if it already exists.
- Encode:
  - the current working model;
  - the two-factor routing rule: risk/judgment class plus context inheritance
    cost;
  - the no-silent-degradation rule;
  - the bounded helper and subagent policy;
  - explicit wait discipline for child runs;
  - cheap orchestrator as a later controlled target only;
  - Codex CLI separate review launch discipline;
  - phase placement across 23.8.6, 23.8.6A, 23.8.6B, 23.8.6B2, 23.8.6C,
    23.8.6D, 23.8.6E, 23.8.7, 24A/24B, 30, and 31.
- Perform a read-only local Codex CLI capability probe before drafting the
  implementation plan:
  - `codex --version || true`
  - `codex --help`
  - `codex exec --help`
  - `codex debug models --bundled || true`
- Treat local `codex --help` and `codex exec --help` output as the immediate
  source of truth for command shape in the worktree. Official Codex docs may be
  used only as supporting reference.
- Do not invent flags that are not present locally.
- The implementation plan for this phase must include a section named exactly
  `Codex CLI Separate Review Launch Discipline`.
- That plan section must specify:
  - the locally supported command shape for non-interactive review-only passes;
  - whether `codex exec` supports explicit model override;
  - whether `codex exec` supports config override for
    `model_reasoning_effort`;
  - whether `codex exec` supports read-only sandbox selection;
  - whether `codex exec` supports writing the final review artifact through
    `--output-last-message` or a local equivalent;
  - exact worktree-relative artifact paths for:
    - `.harness/runs/<run-id>/manual/plan-review-request.md`
    - `.harness/runs/<run-id>/manual/plan-review.md`
    - `.harness/runs/<run-id>/manual/implementation-review-request.md`
    - `.harness/runs/<run-id>/manual/implementation-review.md`
  - exact failure categories if launch is not possible.
- Require separate review-only sessions for:
  - `plan-review` using `gpt-5.5` with high reasoning or the closest locally
    supported equivalent;
  - `implementation-review` using `gpt-5.5` with medium reasoning or the
    closest locally supported equivalent.
- Require `plan-review` to explicitly review the proposed Codex CLI launch
  discipline and documentation placement before implementation starts.
- Require `implementation-review` to explicitly verify:
  - the docs include the review-launch discipline;
  - the command examples are non-interactive and artifact-producing;
  - the policy forbids `codex fork` misuse for ordinary review passes;
  - local CLI capability probing is required before uncertain launches;
  - failed launches cannot be silently retried or faked;
  - no runtime code or runner execution was added in this pass.
- Package the following review-launch invariants into repo-owned policy:
  - non-interactive separate run;
  - explicit model override if supported locally;
  - explicit reasoning-effort override if supported locally;
  - read-only sandbox for review;
  - durable review request artifact;
  - durable review result artifact;
  - current worktree as execution context;
  - terminal child completion before reading or acting on the result.
- Package the allowed correction sequence if the first review launch fails:
  1. read the relevant local help output again;
  2. make exactly one syntax correction that preserves the required
     invariants;
  3. rerun once;
  4. if it still fails, stop and report the exact blocker.
- Restrict blocker categories to:
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
- Add only narrow consistency updates where truly needed in:
  - `docs/HUMAN_OPERATOR_MANUAL.md`
  - `docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`
  - `docs/OPERATIONS_PLAN.md`
  - `docs/IMPLEMENTATION_ROADMAP.md`
  - `docs/MASTER_ARCHITECTURE.md`
  - `tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md`
  - `tasks/PHASE_30_BOUNDED_AGENT_EXPERIMENTATION_LOOP.md`
  - `tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md`
- Preserve the exact-identity rule in docs/policy packaging:
  - display `run_id` is not a globally unique accepted-memory identity;
  - exact `run_instance_id` remains the authoritative cross-run identity;
  - policy/examples must not imply that later `run-0001` reuse may overwrite
    earlier accepted/project-memory state from a different exact run instance.
- Preserve the lifecycle-completion rule in docs/policy packaging:
  - finishing review or local verification is not the terminal success state
    for an active self-hosting run;
  - the harness must continue through closeout and harvest under the existing
    lifecycle rules unless a real gate or blocker stops it.

## Non-goals

- No runtime code.
- No runner execution.
- No provider-specific lifecycle logic.
- No packet execution logic.
- No launch automation inside the product runtime.
- No `codex fork` workflow for ordinary review passes unless a later reviewed
  repo-owned contract explicitly requires it.
- No silent fallback from durable separate review into interactive/manual
  summary behavior.

## Future-phase impact check

- Packages the policy boundary needed before later packet metadata, reports,
  eval calibration, and reviewed runner execution phases.
- Prepares the immediate later 23.8.6B2/6C/6E docs/task surfaces to consume
  checked-in review-launch and policy assumptions without moving runtime
  behavior into those phases.
- Keeps Phase 23.8.7 advisory only and Phase 31 as the first home for
  runtime-enforced child/runner execution.
- Must not pre-implement runtime replay/re-ingestion repair, packet
  automation, runner execution, provider routing, proof generation, or reports.
- Requires architecture review if this pass starts adding runtime launch logic,
  provider-specific lifecycle behavior, or execution enforcement instead of
  narrow policy packaging.

## Acceptance commands

```bash
npm run build
git diff --check
```

## Acceptance behavior

- The repo contains a canonical self-hosting model-routing policy surface.
- The policy distinguishes:
  - official Codex CLI capabilities;
  - locally observed CLI help/capabilities;
  - repo-owned harness policy;
  - current temporary model guidance.
- The policy and related docs require future agents to probe local CLI help
  before uncertain separate review launches.
- The final working review-launch command shape or exact blocker is required to
  be recorded in the run artifact.
- The command examples are non-interactive, review-only, artifact-producing,
  and wait for terminal completion.
- The packaged policy/docs do not describe display `run_id` reuse as safe
  overwrite behavior and instead preserve the exact-identity/no-clobber rule
  for accepted/project memory.
- The packaged policy/docs do not present review completion or local
  verification completion as equivalent to honest run completion; closeout and
  harvest remain explicit end-of-run lifecycle gates.
- No runtime code, runner execution, or provider-specific lifecycle logic is
  introduced.
