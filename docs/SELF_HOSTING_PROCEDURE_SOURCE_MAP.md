# Self-hosting Procedure Source Map

## Phase 23.9 contract resolution

The registry plus each procedure `SKILL.md`,
`references/output-format.md`, and output schema owns the exact output
contract/version. Prompt wrappers are derived and may not duplicate an ad hoc
format. Bundle ingestion rejects any lens output before mutation when that
resolved contract does not validate.

Status: maintained self-hosting authority surface, introduced in Phase 23.6
Target repo path: `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`  
Related phase: `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`  
Purpose: define where each self-hosting procedure comes from, how it is adapted for `codex-harness`, and what authority it has.

## 1. Core decision

Phase 23 remains historical/bootstrap evidence. This source map applies to Phase
23.6 and later self-hosting procedures only. It must not retroactively require
the historical Phase 23 run to satisfy later Phase 23.5 or Phase 23.6 lifecycle
rules.

Phase 23.6 must not invent self-hosting prompts ad hoc in chat.

Every self-hosting procedure must have a traceable source map:

```text
source material
-> adaptation decision
-> repo-owned procedure
-> optional Codex-discoverable sync/install target
-> later evidence/packet linkage
```

Phase 23.8.6F adds three canonical related-policy artifacts without changing
procedure identity or source authority:

```text
skills/self-hosting/procedure-execution-policy.json
skills/self-hosting/review-route-policy.json
skills/self-hosting/codex-reference-binding.json
```

They are `script_or_tooling` policy inputs except the binding's external model
capability facts, which are `external_or_network`. They contain no executable
skill, credential, shell fragment, dependency, or generated authority.

Phase F source/risk decisions, revalidated 2026-07-21:

| Source and revision | Type/status | Primitive and Harness equivalent | Incompatibility | Decision / target / dependency impact |
|---|---|---|---|---|
| BitGN insight 2026-06-15; `muxx/bitgn-ecom1-exoskeleton@61d0530eb31a2b359660d3f05b4d3bfcf412b8da` | `community_pattern_sources`; `advisory` | deterministic preflight/evidence ledger; existing prechecks and evidence refs | domain exoskeleton is not lifecycle authority | adapt in execution policy/ingestion; no dependency |
| `SWE-agent/mini-swe-agent@38c01a19ed1a58dd17dd7c95010e4f69d059c777` | `community_pattern_sources`; `advisory` | bounded linear loop/trajectory; existing claim, timeout, observation | Python shell agent would duplicate the launcher | adapt limits/trajectory in runtime/context; reject dependency |
| `openai/openai-agents-python@95185352c8b829405a96c3886960f030163bdf07` | `official_codex_sources`; `advisory` | filtered history/typed trace identity; existing run/artifact/payload IDs | SDK handoffs add a second runtime | adapt filtering/identity in context/evaluation; reject dependency |
| `langchain-ai/deepagents@89822e105b42840e079e19f905c8f4abe2604750` | `external_advisory_sources`; `advisory` | stable state/progressive retrieval; existing payload retention | graph state and nondeterministic compaction conflict with stable IDs | adapt core/manifest/delta; reject dependency |
| `aaif-goose/goose@3065c9701fdccd020f86f263c74ae4934a1333b8` | `community_pattern_sources`; `advisory` | capability/provider seam; existing `codex_cli` observation | provider/ACP/MCP runtime becomes a general runner | adapt isolated binding; reject dependency |
| Official Codex model/CLI/worktree docs plus local CLI 0.144.1 | `official_codex_sources`; authoritative for capability facts only | model/reasoning, JSONL, `-o`, read-only, Desktop worktrees | does not prove Harness safety, recall, or cost | adopt capability snapshot only; no SDK dependency |

Risk classification: `procedure-execution-policy.json` and
`review-route-policy.json` are local `script_or_tooling` inputs;
`codex-reference-binding.json` is `external_or_network` because fixed model
facts feed the existing read-only subprocess. None contains executable code,
shell interpolation, credentials, network calls, path traversal, generated
authority, or a new dependency. Any newly discovered behavior outside this
classification is `BLOCKED_SKILL_RISK_UNCLEAR`.

Active Phase 24A reuses the existing Phase 23.9 planning cohort through typed
planning-review authority facts and the existing deterministic semantic-review
policy. Free-text keyword/regex matching is not lifecycle routing authority.
Each lens keeps its registered procedure contract, canonical document,
structured verdict, and exact artifact identity; structured and document
verdicts must agree. Phase 24A.1 owns reusable generalization, including full
cohort states, exact carry-forward/invalidation, context reuse, and bounded
infrastructure recovery. Phase 24A.2 owns generic machine-checkable
requirement/scenario/invariant/plan/evidence/proof coverage. This source map does
not replace those task contracts or create a second policy layer.

## 2. Source classes

### A. Internal authoritative sources

These are binding for `codex-harness`.

```text
TASK.md
tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md
tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md
tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md
tasks/PHASE_24A_1_SELF_HOSTING_REVIEW_LIFECYCLE_COMPLETION.md
tasks/PHASE_24A_2_EXECUTABLE_SPECIFICATION_AND_ENGINEERING_ARCHITECTURE_DISCIPLINE.md
tasks/PHASE_24B_EXPANDED_REPORTS_AND_PACKETS.md
docs/IMPLEMENTATION_ROADMAP.md
docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md
docs/HUMAN_OPERATOR_MANUAL.md
docs/PRODUCT_VS_PROJECT_LAYER.md
docs/SECURITY_AND_PERMISSION_MODEL.md
docs/PHASE_ACCEPTANCE.md
existing run/review/verify/closeout docs and tests
```

Authority level:

```text
binding
```

Use:

```text
Define codex-harness-specific lifecycle, storage, evidence, review, delivery
facts, closeout, and acceptance rules.
```

### B. Official Codex sources

These define Codex-native behavior and override community assumptions.

```text
Codex Skills documentation
Codex best practices
Codex AGENTS.md documentation
Codex Hooks documentation
Codex config/reference documentation where needed
Codex Subagents documentation only if later used
```

Authority level:

```text
binding for Codex behavior
```

Use:

```text
Define SKILL.md metadata, skill discovery/install behavior, plan-first
guidance, AGENTS.md discovery, and hook limitations.
```

### Official reference URLs verified during Phase 23.6

```text
Codex Skills:
  https://developers.openai.com/codex/skills

Codex Hooks:
  https://developers.openai.com/codex/hooks

Codex Best practices:
  https://developers.openai.com/codex/learn/best-practices

Codex AGENTS.md:
  https://developers.openai.com/codex/guides/agents-md
```

Rules:

```text
Official docs define Codex-native behavior.
Community packs and external audits do not override official Codex docs.
If official docs change, update this source map and the affected
procedure source-notes before changing procedure contracts.
```

### C. External advisory sources

These are useful but not authoritative.

```text
DenisSergeevitch/agents-best-practices
selected prior architecture audits
reviewed Deep Research outputs, only if explicitly supplied
```

Authority level:

```text
advisory only
```

Use:

```text
Review harness architecture, workflow discipline, and missing safety or
evidence boundaries.
```

Reviewed Deep Research rule:

```text
If a reviewed Deep Research report is explicitly supplied as implementation
input, it is advisory evidence only. It does not override repo task/docs
contracts or official Codex behavior. Its absence must not block Phase 23.6.
```

## 2.5 Phase 23.8 bounded Step R source trace

Step R is a bounded prompt/review prior-art audit. It is not a separate phase.
It records advisory inputs for prompt/procedure hardening before registry
implementation.

Required audit fields:

```text
source_url_or_doc
source_type
pattern_observed
accepted/adapted/rejected/deferred
target_file
reason
```

Source status values for provenance and later registry metadata:

```text
authoritative
advisory
derived
deprecated
rejected
```

Step R source trace:

| source_url_or_doc | source_type | pattern_observed | accepted/adapted/rejected/deferred | target_file | reason |
| --- | --- | --- | --- | --- | --- |
| `https://openai.com/index/harness-engineering/` | official | Short `AGENTS.md`, repo docs as system of record, doc gardening, feedback loops | accepted | `README.md`, `docs/HUMAN_OPERATOR_MANUAL.md`, `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`, `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md` | Align product self-hosting docs around repo-local authority and freshness checks. |
| `https://openai.com/index/unlocking-the-codex-harness/` | official | App Server as serious future access-layer candidate with approvals/event surface | adapted | `tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `tasks/PHASE_25_AGENT_ACCESS_LAYER.md` | Record App Server as future candidate only; do not implement it in Phase 23.8. |
| `https://developers.openai.com/codex/skills` | official | Progressive-disclosure skills, compact `SKILL.md`, details in references | accepted | `skills/self-hosting/**`, `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md` | Keep procedure skills compact and registry-friendly. |
| `https://developers.openai.com/codex/guides/agents-md` | official | `AGENTS.md` as short map to deeper repo truth | accepted | `AGENTS.md`, `README.md`, `docs/HUMAN_OPERATOR_MANUAL.md` | Keep `AGENTS.md` short and remove install-local managed block drift. |
| `https://developers.openai.com/codex/cli` | official | CLI as scriptable access surface with explicit auth/profile controls | adapted | `docs/IMPLEMENTATION_ROADMAP.md`, `tasks/PHASE_25_AGENT_ACCESS_LAYER.md` | Keep CLI as current baseline and avoid API-key-default claims. |
| `https://developers.openai.com/codex/subagents` | official | Bounded helper mechanism, not durable execution authority | adapted | `tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`, `docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md` | Preserve later access-layer boundary and reject current autonomous loops. |
| `https://developers.openai.com/codex/hooks` | official | Hooks are guardrails/reminders, not authority | accepted | `docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md`, `docs/PHASE_ACCEPTANCE.md`, `skills/self-hosting/delivery-facts-review/SKILL.md` | Reinforce hook limits and keep authority in repo/runtime contracts. |
| `https://github.com/openai/codex/blob/main/AGENTS.md` | repo_pattern | Real short-map `AGENTS.md` example | adapted | `AGENTS.md`, `README.md` | Advisory prior-art supporting short product AGENTS discipline. |
| `https://github.com/openai/codex/blob/main/.codex/skills/code-review/SKILL.md` | repo_pattern | Narrow review skill with clear trigger and output | adapted | `skills/self-hosting/plan-review/SKILL.md`, `skills/self-hosting/implementation-review/SKILL.md`, `skills/self-hosting/harness-audit/SKILL.md` | Keep review surfaces narrow and explicit. |
| `https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills-best-practices.md` | repo_pattern | Compact skills and references-first organization | adapted | `skills/self-hosting/**` | Advisory support for compact `SKILL.md` plus references. |
| `https://github.com/google-gemini/gemini-cli/blob/main/.gemini/commands/review-and-fix.toml` | repo_pattern | Review-and-fix flow, gather context, bounded remediation | adapted/rejected | `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md`, `skills/self-hosting/fix-pass-review/SKILL.md` | Adapt bounded fix-pass; reject persona injection, auto-fix loop, commit/revert automation. |
| `https://github.com/anthropics/claude-code-action/blob/main/.claude/commands/review-pr.md` | repo_pattern | Findings-first review posture | adapted | `prompts/99-review-current-task.md`, `skills/self-hosting/implementation-review/references/output-format.md` | Keep findings-first review and explicit blockers. |
| `https://github.com/Aider-AI/aider/blob/main/aider/coders/architect_prompts.py` | repo_pattern | Architecture-oriented planning checks | adapted | `prompts/00-slash-plan-master.md`, `skills/self-hosting/architecture-review/SKILL.md` | Strengthen architecture boundary review without importing prompt blobs. |
| `https://github.com/Aider-AI/aider/blob/main/aider/coders/base_prompts.py` | repo_pattern | Narrow prompting around task intent and edits | adapted | `prompts/00-slash-plan-master.md` | Support concise task-scoped planning checks. |
| `https://github.com/cline/cline/blob/main/apps/vscode/src/core/prompts/system-prompt/README.md` | repo_pattern | Layered prompt architecture | deferred | `prompts/00-slash-plan-master.md` | Useful framing, but current patch avoids broad prompt architecture rewrite. |
| `https://github.com/continuedev/continue/blob/main/.continue/agents/test-coverage.md` | repo_pattern | Focused specialist review agent | adapted | `skills/self-hosting/verification-review/SKILL.md` | Advisory support for narrow verification-review scope. |
| `https://github.com/OpenHands/OpenHands/blob/main/AGENTS.md` | repo_pattern | Repo-map guidance for agents | adapted | `README.md`, `docs/HUMAN_OPERATOR_MANUAL.md` | Reinforces short map over giant manual. |
| `https://github.com/SWE-agent/SWE-agent/blob/main/config/sweagent_0_7/07.yaml` | repo_pattern | Structured prompt/config boundary | deferred | `prompts/00-slash-plan-master.md` | Useful reference, but current patch avoids model-specific config machinery. |
| `AI Agentic Software Engineering Research.docx` | advisory_doc | Read-only review skills, compact skills, bounded fix-pass, App Server vs CLI trade-off, provenance | adapted | `docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md`, `tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`, `tasks/PHASE_25_AGENT_ACCESS_LAYER.md` | User-provided advisory research that supports the bounded patch. |
| `AI Agent Frameworks and Workflows.docx` | advisory_doc | Skill risk vetting, local-first/domain-pack separation, evidence provenance | adapted | `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`, `docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md` | User-provided advisory research for metadata/risk/freshness additions. |

### D. Community pattern sources

These are pattern libraries only. They must not be bulk-installed in this
phase.

```text
affaan-m/ECC
Anthropic skills repository
Agent Skills specification
meta-harness repositories
other community skill or agent packs
```

Authority level:

```text
pattern source only
```

Use:

```text
Study structure, naming, rubrics, and workflow patterns. Adapt only after
compatibility review.
```

Forbidden:

```text
No bulk install.
No direct runtime authority.
No unreviewed hooks, rules, or commands.
No copying provider-specific behavior as Codex-native fact.
```

## 3. Canonical source and install targets

Phase 23.6 source-of-truth decision:

```text
Canonical source-of-truth:
  skills/self-hosting/**

Optional Codex discovery or sync target:
  .agents/skills/**

Optional user-level install target:
  $HOME/.agents/skills/**
```

Official discovery rule preserved by this phase:

```text
Codex discovers repo and user skills from Codex-recognized locations such as
.agents/skills/** and $HOME/.agents/skills/**.
Codex must not be assumed to auto-discover arbitrary skills/self-hosting/**
without an explicit sync/install path.
```

Rules:

```text
Generated or local discovery targets must not become hidden source-of-truth.
.agents/** remains ignored or local installed state in this repo unless a
future reviewed boundary change says otherwise.
Prompt wrappers under prompts/self-hosting/<procedure-id>.md are mandatory
derived invocation helpers and not source-of-truth.
Generated product prompts from node bin/ch prompt ... are separate task-local
artifacts and do not replace checked-in self-hosting procedure wrappers.
```

## 4. Procedure contract

Every self-hosting procedure must follow this contract.

```yaml
procedure_id: string
title: string
purpose: string
when_to_use: string[]
required_inputs: string[]
preconditions: string[]
forbidden_scope: string[]
checklist: string[]
expected_output_format: string
blocker_conditions: string[]
evidence_to_record: string[]
phase_23_5_dependencies: string[]
phase_24_packet_dependencies: string[]
source_adaptation_notes:
  internal_sources: string[]
  official_codex_sources: string[]
  external_advisory_sources: string[]
  community_pattern_sources: string[]
  adopted: string[]
  adapted: string[]
  rejected: string[]
authority_level: binding | advisory | pattern-only
```

## 4A. Phase 23.8 registry metadata extension

Phase 23.8 preserves the Phase 23.6 procedure IDs and extends the documented
contract with registry-oriented metadata. This section documents the target
metadata. The Phase 23.8 checked-in registry implements the subset needed for
current operator/runtime consumption and points back to canonical skill
contracts; broader actor, permission, risk, side-effect, and control metadata
remain the documented target for a later reviewed schema expansion before any
runner or execution surface consumes them.

```yaml
canonical_skill_path: string
prompt_wrapper_path: string
actor_mode: read_only | write_capable | approval_gated
permission_mode: read_only | local_write | approval_required
risk_class: read_only | local_write_contract | script_or_tooling | external_or_network
side_effect_class: none | local_files | runtime_state | external_state
allowed_stages: string[]
required_outputs: string[]
required_evidence: string[]
blocking_conditions: string[]
forbidden_actions: string[]
requires_human_approval: boolean
review_tier_applicability: standard | high | extra-high
required_controls: string[]
non_authoritative_surfaces: string[]
output_format_path: string
source_notes_path: string
source_of_truth_path: string
policy_dependencies: string[]
advisory_sources: string[]
source_status: authoritative | advisory | derived | deprecated | rejected
last_reviewed_or_verification_note: string
validity_scope: string
not_applied_to: string[]
deprecation_notes: string[]
```

Registry material must not create a parallel taxonomy or new procedure IDs.
Generated or discovery targets remain non-authoritative surfaces.

## 4B. Skill risk vetting

Every self-hosting procedure should be classifiable with a bounded risk review.
Check especially for:

```text
scripts
shell commands
network references
MCP/tool references
hardcoded credentials
path traversal
broad filesystem access
instruction manipulation
generated/non-authoritative surfaces
external dependency assumptions
```

If a procedure or related artifact cannot be classified safely, return
`BLOCKED_SKILL_RISK_UNCLEAR`.

Current repo note: `skills/self-hosting/**` does not currently embed packaged
scripts or executables, so skill risk vetting is primarily a metadata and
boundary discipline in this phase.

Minimum file shape:

```text
skills/self-hosting/<procedure-id>/SKILL.md
skills/self-hosting/<procedure-id>/references/source-notes.md
skills/self-hosting/<procedure-id>/references/output-format.md
```

Phase 23.8 adds a checked-in derived registry:

```text
skills/self-hosting/procedure-registry.json
```

It must point back to the canonical files above and must not replace them as
the authority source.

The registry also records `prompt_wrapper_path` for each procedure. That path is
derived metadata and must equal `prompts/self-hosting/<procedure-id>.md`; it does
not make prompt wrappers authoritative.

## 5. Procedure source map entries

### feature-decomposition

- `procedure_id`: `feature-decomposition`
- `purpose`: Convert a broad request into reviewable task-contract proposals
  without starting implementation.
- `primary internal sources`: `TASK.md`;
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/IMPLEMENTATION_ROADMAP.md`; `docs/AGENT_ORCHESTRATION.md`;
  `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `official Codex sources`: Codex Skills; Codex best practices;
  Codex AGENTS.md
- `external/advisory sources`: `agents-best-practices`; prior architecture
  audits; reviewed Deep Research only if explicitly supplied
- `community pattern sources`: Agent Skills specification; meta-harness
  pattern references
- `what was adopted`: Plan-first decomposition; goals and non-goals; ordered
  task proposals; explicit stop before implementation
- `what was adapted`: Convert broad requests into codex-harness phase/task
  contracts with repo-specific boundaries and approval flow
- `what was rejected`: Autonomous roadmap ownership; direct implementation from
  a broad request
- `canonical source path`: `skills/self-hosting/feature-decomposition/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No approval of scope; no implementation; no mutation of
  `TASK.md`
- `related Phase 23.5 rules`: Hooks are guardrails only; accepted memory
  authority remains DB-first; closeout and harvest stay separate
- `related Phase 24 packet types`: `planner packet`

### task-intake

- `procedure_id`: `task-intake`
- `purpose`: Normalize an active task into a stable implementation contract
  before planning.
- `primary internal sources`: `TASK.md`;
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/PHASE_ACCEPTANCE.md`; `docs/HUMAN_OPERATOR_MANUAL.md`
- `official Codex sources`: Codex AGENTS.md; Codex best practices
- `external/advisory sources`: `agents-best-practices`; prior prompt or plan
  audits
- `community pattern sources`: Agent Skills specification
- `what was adopted`: Extract scope, non-goals, required reading, and
  validation expectations before planning
- `what was adapted`: Use codex-harness task files as the binding contract and
  normalize review, evidence, and verification expectations
- `what was rejected`: Vague task summaries with no acceptance or boundary map
- `canonical source path`: `skills/self-hosting/task-intake/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No plan approval; no implementation; no scope expansion
- `related Phase 23.5 rules`: Approved plan must later map to evidence,
  verification, delivery facts, and closeout gates
- `related Phase 24 packet types`: `planner packet`

### task-prompt-writer

- `procedure_id`: `task-prompt-writer`
- `purpose`: Produce or review task-local generated implementation guidance
  derived from approved repo contracts.
- `primary internal sources`:
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/HUMAN_OPERATOR_MANUAL.md`; `docs/SECURITY_AND_PERMISSION_MODEL.md`;
  `prompts/00-slash-plan-master.md`; `prompts/99-review-current-task.md`
- `official Codex sources`: Codex AGENTS.md; Codex Skills; Codex best
  practices
- `external/advisory sources`: Prior prompt audits; `agents-best-practices`
- `community pattern sources`: Agent Skills specification
- `what was adopted`: Task-local prompt guidance points at repo artifacts,
  boundaries, required checks, and non-goals
- `what was adapted`: Prompt writing becomes derived task-local guidance from
  procedures rather than source-of-truth, while checked-in self-hosting
  procedure wrappers remain a separate repo-owned surface
- `what was rejected`: Chat-only mega prompts with no artifact contract
- `canonical source path`: `skills/self-hosting/task-prompt-writer/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No direct implementation; no prompt invented without task
  and procedure inputs
- `related Phase 23.5 rules`: Prompt output must respect delivery facts,
  verification, and harvest boundaries already defined elsewhere
- `related Phase 24 packet types`: `planner packet`

### draft-plan

- `procedure_id`: `draft-plan`
- `purpose`: Produce an implementation plan without editing files or starting
  execution.
- `primary internal sources`: `TASK.md`;
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/IMPLEMENTATION_ROADMAP.md`; `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex best practices; Codex AGENTS.md
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Agent Skills specification
- `what was adopted`: Plan-first discipline; explicit assumptions, risks,
  validation, and done conditions
- `what was adapted`: Planning gates around codex-harness phase/task boundaries
  and evidence expectations, including deterministic defaults versus real
  operator choices
- `what was rejected`: Implementation during planning; hidden scope decisions
- `canonical source path`: `skills/self-hosting/draft-plan/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No writes; no plan approval; no runtime changes
- `related Phase 23.5 rules`: Approved plan should later be recordable as
  evidence and reviewed against closeout gates
- `related Phase 24 packet types`: `planner packet`

### plan-review

- `procedure_id`: `plan-review`
- `purpose`: Independently review a plan before implementation begins.
- `primary internal sources`:
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/IMPLEMENTATION_ROADMAP.md`; `docs/SECURITY_AND_PERMISSION_MODEL.md`;
  `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex best practices; Codex AGENTS.md
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Agent Skills specification
- `what was adopted`: Separate reviewer pass; explicit findings; review
  intensity tiers
- `what was adapted`: Review against codex-harness task, plan, and phase
  boundaries before implementation, plus a durable decision record for
  operator/runtime consumption
- `what was rejected`: Reviewer as implementer; optional plan review
- `canonical source path`: `skills/self-hosting/plan-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No implementation; no silent plan rewrite
- `related Phase 23.5 rules`: Review must preserve lifecycle, verification, and
  delivery-facts boundaries
- `related Phase 24 packet types`: `plan-review packet`

### plan-amend

- `procedure_id`: `plan-amend`
- `purpose`: Amend a plan in response to explicit review findings while keeping
  the change history visible.
- `primary internal sources`:
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/PHASE_ACCEPTANCE.md`; `docs/HUMAN_OPERATOR_MANUAL.md`
- `official Codex sources`: Codex best practices
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Agent Skills specification
- `what was adopted`: Amendment traceability; accepted/rejected review items;
  stable revised output
- `what was adapted`: Codex-harness review findings become explicit plan deltas
  before approval and yield one effective amended plan for implementation
- `what was rejected`: Silent plan rewriting; scope growth hidden in revisions
- `canonical source path`: `skills/self-hosting/plan-amend/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No implementation; no suppression of unresolved review
  findings
- `related Phase 23.5 rules`: Revised plan should remain compatible with
  verification, delivery facts, and harvest gates
- `related Phase 24 packet types`: `plan-review packet`

### architecture-review

- `procedure_id`: `architecture-review`
- `purpose`: Check whether a task or plan crosses core boundaries or drags
  future phases forward.
- `primary internal sources`: `docs/IMPLEMENTATION_ROADMAP.md`;
  `docs/PRODUCT_VS_PROJECT_LAYER.md`;
  `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`;
  `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`
- `official Codex sources`: Codex AGENTS.md; Codex Skills
- `external/advisory sources`: `agents-best-practices`; prior architecture
  audits
- `community pattern sources`: Meta-harness references; Agent Skills
  specification
- `what was adopted`: Boundary review before implementation for high-risk tasks
- `what was adapted`: Map architecture review to codex-harness phase boundaries
  and solo-maintainable core goals
- `what was rejected`: Generic architecture advice disconnected from repo facts
- `canonical source path`: `skills/self-hosting/architecture-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No future-phase implementation; no provider-specific core
  logic; no runtime orchestration creep
- `related Phase 23.5 rules`: Preserve DB-first lifecycle, hook guardrail
  model, and runtime boundary separation
- `related Phase 24 packet types`: `plan-review packet` when `high` or
  `extra-high`

### db-storage-review

- `procedure_id`: `db-storage-review`
- `purpose`: Review storage, lifecycle, and authority changes against the
  Phase 23.5 model.
- `primary internal sources`:
  `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`;
  `docs/SECURITY_AND_PERMISSION_MODEL.md`;
  `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`
- `official Codex sources`: Codex Hooks documentation only where hook behavior
  intersects evidence handling
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Storage review patterns from community packs,
  pattern-only
- `what was adopted`: Storage authority checks; harvest and idempotency review;
  audit versus authority distinction
- `what was adapted`: Compare new work against codex-harness Project Memory DB,
  Run/Staging DB, delivery facts, and harvest rules
- `what was rejected`: JSONL or loose files as primary new operational memory
- `canonical source path`: `skills/self-hosting/db-storage-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No redefinition of DB authority; no hooks as accepted
  memory writers
- `related Phase 23.5 rules`: Project DB authority; staging writes only;
  harvest/idempotency; delivery facts import; closeout and harvest separation
- `related Phase 24 packet types`: `DB/storage-review packet`

### implementation-review

- `procedure_id`: `implementation-review`
- `purpose`: Review a diff against the approved task and plan rather than style
  alone.
- `primary internal sources`: `TASK.md`; approved plan; `docs/PHASE_ACCEPTANCE.md`;
  `docs/HUMAN_OPERATOR_MANUAL.md`
- `official Codex sources`: Codex best practices
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Review-output patterns from community skills
- `what was adopted`: Findings-first review; diff-versus-plan comparison;
  boundary and non-goal checks
- `what was adapted`: Focus review on codex-harness acceptance criteria,
  lifecycle evidence, and phase creep risks
- `what was rejected`: Style-only review with no task or plan comparison
- `canonical source path`: `skills/self-hosting/implementation-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No new implementation work; no scope expansion hidden as
  review feedback
- `related Phase 23.5 rules`: Review evidence must remain compatible with local
  verification, delivery facts, and closeout gates
- `related Phase 24 packet types`: `implementation-review packet`

### fix-pass-review

- `procedure_id`: `fix-pass-review`
- `purpose`: Verify that a follow-up fix addresses review findings without
  widening scope.
- `primary internal sources`: Review findings; approved plan; `TASK.md`;
  `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex best practices
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Review-fix workflow patterns
- `what was adopted`: Finding-driven fix verification; explicit residual risk
  handling
- `what was adapted`: Keep fix passes tightly scoped to the accepted
  codex-harness task and plan
- `what was rejected`: Opportunistic refactors and adjacent improvements during
  the fix pass
- `canonical source path`: `skills/self-hosting/fix-pass-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No new feature work; no policy changes unrelated to the
  reviewed findings
- `related Phase 23.5 rules`: Fix verification must not bypass lifecycle,
  delivery-facts, or harvest boundaries
- `related Phase 24 packet types`: `implementation-review packet`

### verification-review

- `procedure_id`: `verification-review`
- `purpose`: Check local build, test, and acceptance evidence deterministically.
- `primary internal sources`: Task acceptance commands; latest runtime
  verification result or verified snapshot; `package.json`;
  `.github/workflows/ci.yml`; `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex best practices
- `external/advisory sources`: Prior acceptance or regression audits
- `community pattern sources`: Deterministic verification patterns
- `what was adopted`: Exact command-based verification; local versus remote
  distinction; evidence-first interpretation
- `what was adapted`: Treat task acceptance commands as the primary local
  verification source and include release dry-run only when the repo CI or
  package boundary requires it
- `what was rejected`: "Tests probably passed" claims; remote CI inferred from
  local success; unrelated top-level run command results used in place of the
  latest verification record
- `canonical source path`: `skills/self-hosting/verification-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No fabrication of results; no substitution of review prose
  for command evidence
- `related Phase 23.5 rules`: Local verification reuse rules; local success is
  not remote CI; closeout can remain blocked before remote gates complete
- `related Phase 24 packet types`: `implementation-review packet`

### delivery-facts-review

- `procedure_id`: `delivery-facts-review`
- `purpose`: Confirm PR, CI, review, and merge evidence is present or explicitly
  missing before closeout.
- `primary internal sources`:
  `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`;
  `docs/HUMAN_OPERATOR_MANUAL.md`; `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex Hooks documentation where reminder hooks are
  relevant
- `external/advisory sources`: Prior closeout audits
- `community pattern sources`: Delivery-facts review patterns
- `what was adopted`: Provider-neutral delivery fact review before closeout and
  harvest
- `what was adapted`: Use codex-harness delivery-facts terminology and import
  model without introducing Phase 24 packet generation
- `what was rejected`: Closeout based only on human memory or implied remote
  state
- `canonical source path`: `skills/self-hosting/delivery-facts-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No remote-state fabrication; no hooks as primary delivery
  facts authority
- `related Phase 23.5 rules`: Delivery facts import; closeout prerequisites;
  local versus remote evidence separation
- `related Phase 24 packet types`: `closeout-review packet`

### phase-closeout-review

- `procedure_id`: `phase-closeout-review`
- `purpose`: Verify that a run or phase is ready for closeout and harvest under
  Phase 23.5 rules.
- `primary internal sources`:
  `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`;
  `docs/HUMAN_OPERATOR_MANUAL.md`; `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex best practices
- `external/advisory sources`: `agents-best-practices`
- `community pattern sources`: Closeout-checklist patterns
- `what was adopted`: Explicit readiness checklist; unresolved blockers stay
  visible; harvest remains distinct from closeout
- `what was adapted`: Use codex-harness run status, delivery facts, discard,
  manual override, and harvest terms
- `what was rejected`: Treating `closed` as equivalent to `harvested`
- `canonical source path`: `skills/self-hosting/phase-closeout-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No worktree deletion approval before harvest, discard, or
  manual override
- `related Phase 23.5 rules`: `closed != harvested`; harvest and discard rules;
  delivery facts required for closeout
- `related Phase 24 packet types`: `closeout-review packet`

### docs-consistency-review

- `procedure_id`: `docs-consistency-review`
- `purpose`: Check that docs, roadmap, tasks, and contracts do not contradict an
  implementation.
- `primary internal sources`: `docs/IMPLEMENTATION_ROADMAP.md`; task files;
  `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`;
  `docs/PRODUCT_VS_PROJECT_LAYER.md`; `docs/PHASE_ACCEPTANCE.md`
- `official Codex sources`: Codex AGENTS.md
- `external/advisory sources`: Prior documentation audits
- `community pattern sources`: Documentation review patterns
- `what was adopted`: Cross-document consistency review before closeout
- `what was adapted`: Limit the review to contradictions that affect the active
  codex-harness task or future phase boundaries
- `what was rejected`: Broad documentation rewrites outside task scope
- `canonical source path`: `skills/self-hosting/docs-consistency-review/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No speculative roadmap edits; no future-phase rewrites
- `related Phase 23.5 rules`: Keep lifecycle, authority, and local-state
  boundary rules consistent across docs
- `related Phase 24 packet types`: `docs-consistency packet`

### harness-audit

- `procedure_id`: `harness-audit`
- `purpose`: Run a holistic self-hosting audit against the current repo,
  workflow, and guardrails.
- `primary internal sources`: Current task; current docs; current tests;
  current acceptance rules
- `official Codex sources`: Codex Skills; Codex best practices; Codex Hooks
- `external/advisory sources`: `agents-best-practices`; prior architecture or
  governance audits
- `community pattern sources`: Meta-harness pattern references
- `what was adopted`: Model proposes and harness validates; legible procedures;
  bounded autonomy
- `what was adapted`: Local-first codex-harness constraints and solo-maintainer
  product boundary
- `what was rejected`: Treating external skill guidance as runtime authority
- `canonical source path`: `skills/self-hosting/harness-audit/`
- `Codex discovery/install path`: Sync or install from
  `skills/self-hosting/**` into `.agents/skills/**` or
  `$HOME/.agents/skills/**` when needed
- `authority level`: `binding`
- `forbidden scope`: No future runtime architecture; no provider-specific or
  domain-pack implementation
- `related Phase 23.5 rules`: Preserve DB-first memory authority, guardrail
  hook role, and closeout/harvest separation
- `related Phase 24 packet types`: `extra-high` architecture or closeout work,
  as referenced by later packet selection

## 6. Policy source map entry

### self-hosting-agent-operating-policy

- `procedure_id`: `self-hosting-agent-operating-policy`
- `purpose`: Define role autonomy, protected deterministic workflows,
  command/process behavior, initiative capture, and future-phase ownership
  boundaries for self-hosting work.
- `primary internal sources`:
  `tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md`;
  `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`;
  `docs/IMPLEMENTATION_ROADMAP.md`;
  `docs/AGENT_BOUNDARIES_AND_ADAPTERS.md`;
  `docs/SECURITY_AND_PERMISSION_MODEL.md`;
  `docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md`;
  `docs/HUMAN_OPERATOR_MANUAL.md`
- `official Codex sources`: Codex best practices; Codex AGENTS.md;
  Codex Hooks; Codex Skills
- `external/advisory sources`: `agents-best-practices`; reviewed Deep Research
  only if explicitly supplied
- `community pattern sources`: Meta-harness and community workflow patterns,
  pattern-only
- `what was adopted`: Role-based autonomy; hooks as guardrails; initiative
  captured as reviewable outputs; provider-neutral layering; bounded
  command/process policy
- `what was adapted`: Convert high-level harness advice into a Phase 23.6
  contract that keeps later phase ownership explicit and preserves the current
  product boundary
- `what was rejected`: Process manager; daemon; local message bus;
  provider-specific core logic; MCP or A2A implementation in Phase 23.6;
  domain logic in core; auto-commit; auto-merge
- `canonical source path`: `docs/SELF_HOSTING_AGENT_OPERATING_POLICY.md`
- `Codex discovery/install path`: Referenced from repo docs and procedure
  skills; not a separately installed runtime policy target in Phase 23.6
- `authority level`: `binding`
- `forbidden scope`: No runtime supervision; no autonomous product management;
  no protected-workflow bypass without explicit task reason
- `related Phase 23.5 rules`: Hooks are guardrails only; Project Memory DB is
  accepted authority; delivery facts and harvest remain explicit lifecycle
  gates
- `related Phase 24 packet types`: Referenced by planner, plan-review,
  implementation-review, and closeout-review packet interpretation

## 7. Procedure-to-packet linkage for Phase 24

Phase 24 packet manifests must reference these procedure ids:

```text
planner packet:
  feature-decomposition when the request is too broad for one implementation
  pass
  task-intake
  task-prompt-writer
  draft-plan

plan-review packet:
  plan-review
  plan-amend
  architecture-review if high or extra-high

implementation-review packet:
  implementation-review
  fix-pass-review
  verification-review

closeout-review packet:
  delivery-facts-review
  phase-closeout-review

DB/storage-review packet:
  db-storage-review

docs-consistency packet:
  docs-consistency-review
```

Rule:

```text
A Phase 24 packet must identify the procedure contract or rubric used to select
and interpret evidence.
```

## 8. Review intensity mapping

```text
standard:
  task-intake
  draft-plan
  plan-review
  implementation-review
  verification-review
  phase-closeout-review

high:
  architecture-review
  db-storage-review
  delivery-facts-review
  docs-consistency-review

extra-high:
  architecture-review
  db-storage-review
  delivery-facts-review
  harness-audit
```

High and extra-high work may recommend stronger reviewers or models, but Phase
23.6 must not hardcode provider-specific behavior into core runtime.

## 9. Installation and discovery policy

Allowed:

```text
Create repo-owned self-hosting procedures.
Document how to sync or install them into Codex-recognized discovery paths.
Use external advisory skills only as optional review inputs.
```

Not allowed:

```text
Bulk install ECC.
Bulk install Anthropic or other community packs.
Vendor broad external skill packs into core.
Treat external skill instructions as runtime authority.
Treat .agents/skills/** as versioned product source in this repo.
```

## 10. Phase 23.6 acceptance additions

Phase 23.6 is not complete unless:

```text
docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md exists.
All 15 required procedures are source-mapped.
self-hosting-agent-operating-policy is source-mapped.
Every required procedure has source_adaptation_notes.
Each procedure states what was adopted, adapted, and rejected.
Canonical source path is documented as skills/self-hosting/**.
Codex discovery/install paths are documented.
Generated or local discovery targets are not hidden source-of-truth.
Plan-review workflow, review intensity tiers, and Phase 24 packet linkage are
documented.
```
