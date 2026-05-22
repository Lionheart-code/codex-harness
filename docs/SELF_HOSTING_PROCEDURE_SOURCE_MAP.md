# Self-hosting Procedure Source Map

Status: proposed Phase 23.6 deliverable  
Target repo path: `docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`  
Related phase: `tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md`  
Purpose: define where each self-hosting procedure/prompt comes from, how it is adapted for `codex-harness`, and what authority it has.

---

## 1. Core decision

### Historical Phase 23 closeout note

Phase 23 remains historical/bootstrap evidence. This source map is for Phase 23.6 and later self-hosting procedures; it must not retroactively require the old Phase 23 run to satisfy future Phase 23.5/23.6 lifecycle rules.


Phase 23.6 must not invent self-hosting prompts ad hoc in chat.

Every self-hosting procedure must have a traceable source map:

```text
source material
→ adaptation decision
→ repo-owned procedure
→ optional Codex-discoverable skill/install target
→ evidence/packet integration
```

This source map is required because Phase 23.6 is supposed to make future harness work less manual and less dependent on long pasted prompts.

---

## 2. Source classes

### A. Internal authoritative sources

These are binding for codex-harness.

```text
TASK.md
tasks/PHASE_23_5_DB_FIRST_MEMORY_LIFECYCLE_HOOKS_RECONCILIATION.md
tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md
tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md
docs/IMPLEMENTATION_ROADMAP.md
docs/HARNESS_GOVERNANCE_AND_EVOLUTION.md
docs/HUMAN_OPERATOR_MANUAL.md
docs/PRODUCT_VS_PROJECT_LAYER.md
docs/SECURITY_AND_PERMISSION_MODEL.md
docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md
existing run/review/verify/closeout source code
existing tests/acceptance/**
```

Authority level:

```text
binding
```

Use:

```text
Define project-specific lifecycle, storage, evidence, harvest, delivery facts, closeout, and acceptance rules.
```

### B. Official Codex sources

These define Codex-native behavior and must override community assumptions.

```text
OpenAI Codex Skills documentation
OpenAI Codex Best practices
OpenAI Codex AGENTS.md documentation
OpenAI Codex Hooks documentation
OpenAI Codex config/reference documentation where needed
OpenAI Codex Subagents documentation where needed
```

Authority level:

```text
binding for Codex behavior
```

Use:

```text
Define SKILL.md format, skill discovery/install behavior, plan-mode expectations, AGENTS.md role, hook limitations, and Codex-native surfaces.
```


## 2.1 Official reference URLs to verify during implementation

Implementation agents must verify the current official Codex documentation before relying on Codex-specific behavior:

```text
Codex Skills:
  https://developers.openai.com/codex/skills

Codex Hooks:
  https://developers.openai.com/codex/hooks

Codex Best practices / plan-first guidance:
  https://developers.openai.com/codex/learn/best-practices

Codex AGENTS.md:
  https://developers.openai.com/codex/guides/agents-md

Codex Subagents, only if used:
  https://developers.openai.com/codex/subagents
```

Rules:

```text
Official docs define Codex-native behavior.
Community packs and external audits do not override official Codex docs.
If official docs changed, update this source map and the affected procedure source-notes before creating procedures.
```

### C. External advisory sources

These are useful but not authoritative.

```text
DenisSergeevitch/agents-best-practices
selected prior architecture audits
selected prior deep-research outputs after correction
/Users/lionheart/Downloads/reviewed_deep_research_phase_23_6_agent_operating_mechanics.md
```

Authority level:

```text
advisory only
```

Use:

```text
Review harness architecture, check agentic workflow discipline, identify missing safety/evidence/review boundaries.
```

Reviewed Deep Research rule:

```text
The reviewed Deep Research file is advisory evidence only.
It may inform procedure and policy design, but it does not override repo task/docs contracts or official Codex behavior.
```

### D. Community pattern sources

These are pattern libraries only. They must not be bulk-installed in this phase.

```text
affaan-m/ECC
Anthropic skills repository
Agent Skills specification
meta-harness repositories
other community skill/agent packs
```

Authority level:

```text
pattern source only
```

Use:

```text
Study structure, naming, rubrics, and workflow patterns. Adapt only after compatibility review.
```

Forbidden:

```text
No bulk install.
No direct runtime authority.
No unreviewed hooks/rules/commands.
No copying provider-specific behavior as Codex-native fact.
```

---

## 3. Canonical source and install targets

Default Phase 23.6 decision:

```text
Canonical source-of-truth:
  skills/self-hosting/**

Optional Codex discovery/sync target:
  .agents/skills/**

User-level optional install target:
  $HOME/.agents/skills/**
```

Official Codex discovery rule to preserve:

```text
Codex discovers repo/user skills from Codex-recognized skill locations such as .agents/skills/** and $HOME/.agents/skills/**.
Codex must not be assumed to auto-discover arbitrary skills/self-hosting/** without an explicit sync/install path.
```

Rule:

```text
Generated/local install targets must not become hidden source-of-truth.
```

Current repo boundary assumption:

```text
.agents/** is ignored/local installed state unless a later reviewed product/source boundary change explicitly says otherwise.
```

If the repository deliberately chooses `.agents/skills/**` as versioned source, it must explicitly update product/source boundary docs and acceptance behavior.

---

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
output_format: string
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

Minimum file shape:

```text
skills/self-hosting/<procedure-id>/SKILL.md
skills/self-hosting/<procedure-id>/references/source-notes.md
skills/self-hosting/<procedure-id>/references/output-format.md
```

Optional manual prompt shape:

```text
prompts/self-hosting/<procedure-id>.md
```

Prompt files are invocation templates, not source-of-truth.

---

## 5. Required procedure source map

| Procedure | Main purpose | Internal binding sources | Official Codex sources | External/advisory sources | What to adopt | What to adapt | What to reject |
|---|---|---|---|---|---|---|---|
| `feature-decomposition` | Convert a too-broad request into reviewable task-contract proposals | TASK.md; roadmap; governance docs; agent-role docs; Phase 23.5 lifecycle rules | Best practices; AGENTS.md docs; Skills docs | agents-best-practices; reviewed Deep Research | decomposition before implementation; explicit goals/non-goals; ordered task contracts | codex-harness task/phase boundaries and approval flow | broad request turning directly into implementation or autonomous roadmap ownership |
| `task-intake` | Normalize a task before planning | TASK.md; roadmap; governance docs; Phase 23.5 lifecycle rules | AGENTS.md docs; Best practices | prior audits | Task contract extraction | codex-harness fields: scope, non-goals, evidence expectations | vague task summaries without acceptance |
| `task-prompt-writer` | Produce implementation prompts from approved task/procedure | task files; operator manual; security docs | Best practices; AGENTS.md docs; Skills docs | prior prompt audits | explicit context/read-before-editing/non-goals/checks | prompts must point to repo files and lifecycle state | chat-only mega prompts with no artifact contract |
| `draft-plan` | Create an implementation plan without editing | task file; Phase 23.5 lifecycle; roadmap | Codex Plan mode; Best practices | agents-best-practices | plan-first discipline | approved_plan_hash/evidence requirements | implementation during planning |
| `plan-review` | Independently review a plan before implementation | task file; roadmap; governance/security docs | Best practices; Subagents if used | agents-best-practices | separate reviewer pass | review intensity tiers | reviewer as executor |
| `plan-amend` | Convert review findings into amended plan | plan-review output; task file; Phase 23.5 evidence rules | Best practices | agents-best-practices | amendment traceability | stable output with accepted/rejected review items | silent plan rewriting |
| `architecture-review` | Check cross-phase and core-boundary impact | roadmap; product-vs-project; governance docs | AGENTS.md docs; Skills docs | agents-best-practices; architecture audits | boundary review | codex-harness specific phase/dependency map | generic architecture advice with no repo facts |
| `db-storage-review` | Review DB-first memory/storage changes | Phase 23.5; schema/migration docs; security docs | Hooks docs only where hooks write evidence | agents-best-practices | storage authority checks | Project DB vs Run/Staging DB; harvest/idempotency | JSONL-as-primary for new behavior |
| `implementation-review` | Review diff against task and approved plan | task file; approved plan; Phase 23.5 evidence rules | Best practices; review surfaces | agents-best-practices | diff-vs-plan review | codex-harness non-goals and boundary checks | review that only checks style |
| `fix-pass-review` | Verify fixes address findings without scope expansion | implementation review; task; approved plan | Best practices | agents-best-practices | finding-driven fix pass | no new scope without new task/plan | opportunistic refactors |
| `verification-review` | Check build/test/acceptance evidence | task acceptance; package scripts; Phase 23.5 delivery facts | Best practices | prior audits | deterministic verification | local/remote evidence separation | “tests probably passed” claims |
| `delivery-facts-review` | Confirm PR/CI/review/merge evidence import | Phase 23.5 delivery facts import; closeout rules | Hooks docs where hook-assisted reminders exist | prior closeout audit | PR/CI/review/merge facts | provider-neutral facts model | closeout based on human memory |
| `phase-closeout-review` | Verify final closeout/harvest readiness | Phase 23.5 harvest/closed!=harvested; Phase 24 packets | Best practices | agents-best-practices | closeout checklist | harvest/discard/manual override rules | deleting worktree after closed-only |
| `docs-consistency-review` | Check docs/tasks/roadmap do not contradict implementation | roadmap; task files; governance docs | AGENTS.md docs | prior audits | consistency review | phase dependency map | broad doc rewrite outside task |
| `harness-audit` | Holistic external-style harness audit | all current task/docs/source | Skills docs; Best practices; Hooks docs | Denis agents-best-practices | model proposes / harness validates discipline | local-first codex-harness constraints | external skill as authority |

---

## 5.1 Policy source map entries

| Policy or contract | Main purpose | Internal binding sources | Official Codex sources | External/advisory sources | What to adopt | What to adapt | What to reject |
|---|---|---|---|---|---|---|---|
| `self-hosting-agent-operating-policy` | Define role autonomy, protected deterministic workflows, command/process behavior, initiative capture, and future-phase ownership boundaries for self-hosting work | Phase 23.5 lifecycle/storage authority; Phase 23.6 workflow contract; roadmap; agent boundaries; security; governance; operator manual | Best practices; AGENTS.md docs; Hooks docs; Skills docs | agents-best-practices; reviewed Deep Research | role-based autonomy; hooks as guardrails; initiative capture; provider-neutral layering; bounded command/process policy | codex-harness protected-flow list, approval path, and Phase 24/25/26 ownership boundaries | process manager; daemon; local message bus; provider-specific core logic; MCP/A2A implementation in Phase 23.6; domain logic in core; auto-commit; auto-merge |

Reviewed Deep Research disposition for this policy:

```text
Adopted:
  prompt-only governance is insufficient
  hooks are guardrails, not durable authority
  initiative should be captured as reviewable outputs
  provider/model differences belong behind later adapters
  domain autonomy belongs in later domain packs

Adapted:
  command/process safety is a lightweight Phase 23.6 contract, not runtime supervision
  decomposition becomes a self-hosting procedure, not autonomous product planning

Rejected for Phase 23.6:
  process manager
  daemon
  message bus
  provider-specific core logic
  MCP/A2A implementation
  domain logic in core
  auto-commit
  auto-merge
```

---

## 6. Procedure-to-packet linkage for Phase 24

Phase 24 evidence packets must reference these procedure ids.

```text
planner packet:
  feature-decomposition when the request is too broad for one implementation pass
  task-intake
  task-prompt-writer
  draft-plan

plan-review packet:
  plan-review
  plan-amend
  architecture-review if high/extra-high

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
A packet must identify the procedure contract/rubric used to select and interpret evidence.
```

---

## 7. Review intensity mapping

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
  architecture-review + db-storage-review + delivery-facts-review + harness-audit
```

High and extra-high tasks may recommend stronger models/reviewers, but must not hardcode provider-specific behavior into core runtime.

---

## 8. Installation and discovery policy

Phase 23.6 should not require bulk external skill installation.

Allowed:

```text
Use DenisSergeevitch/agents-best-practices as user-level advisory skill for audits.
Create repo-owned self-hosting procedures.
Document how to sync/install them for Codex discovery.
```

Not allowed:

```text
Install ECC.
Install broad Anthropic packs.
Vendor community skill packs into core.
Treat external skill instructions as runtime authority.
```

---

## 9. Acceptance additions for Phase 23.6

Phase 23.6 is not complete unless:

```text
docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md exists.
`feature-decomposition` is source-mapped.
`self-hosting-agent-operating-policy` is source-mapped.
Every required procedure has source_adaptation_notes.
Each procedure states adopted/adapted/rejected source material.
Canonical source path is documented.
Official Codex skill discovery locations are stated accurately.
Codex discovery/install/sync path is documented.
Procedure-to-packet linkage for Phase 24 is documented.
Generated .agents/skills targets are not hidden source-of-truth.
```

---

## 10. Implementation note for Codex

When implementing Phase 23.6, Codex should first build the source map and procedure contract, then create procedure files.

Do not start by writing generic prompt templates.

Correct order:

```text
1. Inspect repo conventions.
2. Write/update SELF_HOSTING_PROCEDURE_SOURCE_MAP.
3. Choose canonical source path.
4. Create procedure contract.
5. Create procedure files.
6. Create optional prompt wrappers derived from procedures.
7. Document Codex discovery/sync path.
8. Add validation tests/fixtures where appropriate.
```
