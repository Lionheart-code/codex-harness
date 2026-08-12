# Phase 24A - Minimal Evidence Report and Review Packet

## Status

Active successor to accepted and harvested Phase 23.9. The superseded
`tasks/PHASE_24_REPORTS_AND_EVIDENCE_PACKETS.md` is a source catalog only; it
does not expand this task into Phase 24B.

## Purpose

Implement the smallest useful deterministic report/packet substrate before the
broader Phase 24 report catalog is attempted.

## Scope

Implement only:

- one deterministic run evidence or closeout report;
- one deterministic report/export view over the Phase 23.8.6F
  `ContextCore`/`ContextManifest`;
- one bounded implementation-review packet view using the Phase 23.8.6F
  `ReviewDeltaOverlay`.

Reuse the Phase 23.8.6F shared core, manifest, and overlay records; do not create
competing context-core, manifest, or review-overlay types. The shared records
contain task identity/contract refs, effective approved plan refs,
procedure-contract refs, review tier, surface/risk classes, exact
run/worktree/source/base identity, architectural invariants, changed-file and
diff refs, prior findings/dispositions, verification, missing evidence, and
bounded payload refs.

The manifest records a stable ID and content hash, deterministic ordering,
size budget, truncation/redaction facts, and source provenance. Identical
authoritative inputs produce identical ordering/hash. Missing mandatory
context blocks generation, and mandatory context is never removed for budget.
Independent reviewers receive the packet plus read-only retrieval, not builder
transcript authority.

Required behavior preserved from the original Phase 24 task:

- reports/packets consume accepted Project Memory DB records and
  operator/procedure/proof state plus Phase 23.8.6F and 23.8.7 route, context,
  policy/binding-version, transport, usage, and invocation records;
- reports/packets do not decide lifecycle;
- output is deterministic where practical;
- claims link to evidence or are marked inference/missing;
- redaction happens before export;
- packet size/truncation is visible;
- provenance includes Project Memory record IDs, payload/chunk refs where
  needed, procedure IDs, and source-map/procedure-contract refs;
- remote CI/check provenance is represented when available, including provider,
  run ID or URL, commit SHA, job/step conclusions, and bounded/redacted
  failed-step excerpts when failed;
- no hidden model-side summarization;
- no LLM call required for deterministic report generation;
- report route summary, deterministic-versus-semantic split, context
  size/reuse, missing evidence, and redaction/truncation facts;
- no domain-specific prompt logic in core.

## Non-goals

- No proposal drafts.
- No governance report catalog.
- No repeated-failure analytics.
- No reviewer-disagreement report.
- No portable export bundle.
- No broad packet taxonomy.
- No MCP.
- No full Agent Access Layer.
- No domain packs.
- No external writes.
- No lifecycle authority independent of runtime/closeout/harvest rules.

## Future-phase impact check

- Prepares Phase 24B, Phase 25A, and Phase 26 by proving the smallest useful
  report/packet substrate.
- Must not pre-implement broad packet catalog, proposal drafting, governance
  analytics, domain packs, MCP, or planner execution.
- Preserves the domain/core boundary by keeping outputs self-hosting/workflow
  generic and evidence-linked.
- Requires architecture review if report generation starts deciding lifecycle,
  promoting tasks, summarizing hidden model memory, or adding domain-specific
  report logic in core.

## Acceptance commands

```bash
npm run build
npm test
npm run test:acceptance
node bin/ch memory report --help
node bin/ch memory packet --help
git diff --check
```

If command grouping differs, implement equivalent behavior and document the
mapping.

## Acceptance behavior

- Run evidence/closeout report can be generated from accepted records.
- One review/handoff packet includes relevant task, evidence, proof/procedure
  refs, missing evidence markers, and bounded context.
- Redaction and truncation are visible.
- Material claims are evidence-linked, inference-marked, or missing/unknown.
- No LLM/API call is required.
- No proposal drafts, governance catalog, broad packet taxonomy, MCP, Agent
  Access Layer, domain packs, dashboard, SaaS, or external writes are
  introduced.

## Review classification

The report/packet substrate is **high** risk because it projects accepted
evidence for review and future retrieval. The prerequisite successor/lifecycle
hardening is **extra-high** risk because it touches task authority,
materialization, exact source identity, and closeout provenance. Use the
existing registered procedures and review-tier policy; this is not a new
permanent review framework. Planning and review must inspect architecture,
lifecycle/authority, Project Memory/staging/storage, source/runtime, and
future-phase leakage boundaries.

## Read before implementation

Repository implementation and current task/docs authority outrank historical
assumptions. Before planning or editing, inspect `TASK.md`, this task, the
Phase 23.8.6F, 23.8.7, and 23.9 task contracts,
`docs/IMPLEMENTATION_ROADMAP.md`, `docs/OPERATIONS_PLAN.md`,
`docs/PROJECT_MEMORY_AND_DEBT.md`, `docs/ARTIFACT_SCHEMAS_AND_MIGRATIONS.md`,
`docs/CONTEXT_BUDGET_POLICY.md`, `docs/SECURITY_AND_PERMISSION_MODEL.md`,
`docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md`,
`docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md`,
`docs/SELF_HOSTING_REVIEW_TIER_POLICY.md`, and
`docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md`. Inspect the current
`ProjectMemoryDatabase` and `RunStagingDatabase` read/write boundaries,
payload/chunk/redaction helpers, 23.8.6F `ContextCore`, `ContextManifest`, and
`ReviewDeltaOverlay`, 23.9 proof code/schemas, memory CLI,
successor/materialization/bootstrap/review/delivery/closeout paths, and
relevant acceptance tests.

## Required Phase 23.9-to-24A lifecycle correctness hardening

This phase owns only the minimum corrective hardening needed for 24A to enter
and complete the normal Harness lifecycle; it must not become a generic
lifecycle rewrite.

### A1. Task pointer grammar

`TASK.md` pointer syntax and task-contract prose must be unambiguous. A direct
task contract remains direct when it contains a multiline `Implement only:`
heading followed by scope bullets; a valid `TASK.md` pointer resolves normally.
Path traversal, unreadable/malformed pointers, recursion/ambiguity, and
out-of-repository references fail closed. Require a grammar/authority-correct
solution and tests, not a filename-specific regex or workaround.

### A2. Successor source identity is not task-contract identity

Decision-source artifact identity and selected task-contract content identity
are distinct, explicit semantic objects. Future normal zero-owner
materialization validates the correct task-contract identity and never treats a
decision-source hash as it. Historical decisions remain readable;
compatibility/recovery behavior is explicit and fail-closed. Never rewrite
accepted Project Memory or manually edit a database.

Preserve the already-harvested 23.9-to-24A facts:

- decision id: `sha256:d3e50570980357c07a812978f3a4b25848ede772fd74f36388b7e657d89bfb36`;
- immutable base: `296e868c65ae818620f41b842534bc013d5dba08`;
- selected task: `tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md`;
- decision-source artifact identity:
  `sha256:db8b57c21d499124b92489bfe1a5a8278e8565ff73d055342d91505e4ed45ad9`.

The decision-source identity is not the selected task-contract content hash.

### A3. Phase-neutral materialized-successor bootstrap

A Harness-materialized successor is governed by canonical TaskState, exact
branch/worktree, immutable recorded base, committed activation, and
deterministic worktree-bootstrap readiness. `run start` for 24A must enforce
that authority. Wrong branch/worktree/base, absent or conflicting owner, dirty
activation, stale readiness, or invalid activation chain fails closed. Reusable
guarantees must not disappear due to old literal phase-id allowlists; do not
generalize unrelated Phase-23.9-only behavior.

### A4. Reusable reviewed-source-to-delivery provenance

A passing implementation/fix-pass review on an exact clean committed tree using
the established implementation-baseline/delivery-source chain must establish
the exact reviewed source needed downstream. Exact reviewed tree, baseline,
review identity, delivery commit/tree relationship, ancestry, and delivery
facts remain mandatory. Delivery/closeout must not fail only because reusable
code is gated to `phase_id === "23.9"`. Do not weaken delivery proof or
generalize an explicitly Phase-23.9-only proof producer or unrelated mechanism.
The narrow combined planning-review reuse authorized below is limited to the
existing self-hosting planning path. Add an end-to-end deterministic fixture
for the Phase 24A reusable review-to-delivery-to-closeout path.

### B. Preserve legitimate Phase-23.9-only proof behavior

Product self-hosting runs are `bootstrap`; the 23.9 proof producer applies to
eligible `normal` Phase-23.9 target runs. A bootstrap 23.9 run may legitimately
lack an accepted `proof_record`. Phase 24A is a consumer/view layer when proof
exists and must not broaden eligibility merely to manufacture proof or mutate
historical records. Represent absent/non-applicable/legacy proof through typed
availability facts. Acceptance covers an accepted exact run with valid proof
and an accepted bootstrap/legacy run without proof; fabricated proof is banned.

### C. Prerequisite planning-gate lifecycle correctness

Before the broader report/packet slice can begin, complete only the narrow
planning-gate corrections demonstrated by this live run. This is not a generic
review runner or routing framework.

1. Derive the required planning-review set deterministically from the active
   task, exact effective plan, planned implementation surfaces, surface/risk
   classifications, lifecycle/authority and storage/security implications,
   review tier, procedure policy, and required independence. Planned surfaces
   count before an implementation diff exists; a model must not select the
   reviews that govern its own work. For this Phase 24A plan, the expected
   perspectives are `plan-review`, `architecture-review`, and
   `db-storage-review`. Do not hardcode that set by phase name or introduce a
   second review-routing framework.
2. Keep owner approval closed until every derived perspective has a current,
   terminal, acceptable result. Each result must bind to the same exact
   effective-plan content, reviewed source, task, immutable base, run instance,
   and exact review cohort (or equivalent complete review-set identity). Missing,
   stale, malformed, nonterminal, wrong-plan, or mismatched evidence fails
   closed; a lone `plan-review` PASS is insufficient when another lens is
   required.
3. For the existing self-hosting planning path only, narrowly reuse the proven
   Phase-23.9 combined planning-review capability when compatible independent,
   read-only required perspectives share the exact plan/source/task/base and a
   bounded context load. For current 24A it may use one independent invocation
   to evaluate plan, architecture/lifecycle, and DB/storage correctness, but it
   must emit and record distinct canonical procedure identities, artifacts, and
   typed verdicts. Shared invocation never collapses separate judgments. Do not
   generalize this into a multi-agent system, provider abstraction, unrestricted
   parallel review, or Phase 31 execution.
4. Bind final effective plan, complete required cohort, explicit owner approval,
   exact reviewed clean source, run/worktree/branch/base, and implementation
   baseline durably through structured evidence. When no genuine post-review,
   owner-authorized source modification exists, the reviewed clean source HEAD
   itself is eligible as the baseline; do not manufacture an authority-overlay
   commit. Preserve exact overlay provenance when such a source change exists.
   New Phase-F-and-later paths fail closed on ambiguous binding while legitimate
   historical records remain compatible.
5. The final owner-review plan is self-contained implementation authority with
   this task and repository authority. Earlier draft/amend artifacts remain
   provenance, not operative instructions that a later worker must reconstruct.
6. Preserve exact authority selection: accepted historical reporting reads
   accepted/harvested Project Memory, active packet generation reads only the
   exact active Run/Staging authority, `run_instance_id` is authoritative, and
   accepted and active records are never silently merged. `ContextCore`,
   `ContextManifest`, and `ReviewDeltaOverlay` resolve one exact intended
   run/candidate or fail closed.
7. Preserve registered execution-policy timeout authority: registered procedure
   timeout is the managed default; any CLI override is explicit and bounded;
   timeout and stale/liveness remain distinct; only terminal process completion
   makes output evidence; genuine timeout remains `REVIEW_PROCESS_TIMEOUT`; and
   fresh attempts preserve ownership, attempt/output identity, and stale-artifact
   isolation. Repair obsolete fixtures rather than weakening that policy.

Focused acceptance must prove planned-surface review derivation, complete
required-cohort approval gating, exact cohort binding, current self-hosting
combined-review artifacts, clean reviewed-source baseline establishment, and
the retained timeout/stale/ownership/terminal-output protections. It must not
implement the optimization/completion work reserved for Phase 24A.1 or the
engineering-specification discipline reserved for Phase 24A.2.

## Exact minimal deliverables and authority

Implement only this vertical slice:

1. One deterministic historical evidence/closeout report for one exact
   accepted/harvested run, covering exact run/task/phase/source identity,
   verification, current/superseded reviews, delivery/remote-check facts,
   proof availability/refs, evidence gaps, inferences, unknowns, available
   route/context/usage, and redaction/truncation facts. It does not decide
   acceptance, closeout, or harvest.
2. One deterministic inspect/export view over existing 23.8.6F `ContextCore`
   and `ContextManifest`, validating and showing exact IDs/hashes, stable
   ordered source/retrieval refs, bytes, mandatory-block status, redactions,
   truncations/omissions, retrieval capability, source provenance, and
   available reuse/transport facts. It creates no competing context type.
3. One bounded implementation-review view over existing `ReviewDeltaOverlay`
   and exact parent context records. Include/reference active task,
   approved/effective plan, procedure/source-map, exact run, immutable base and
   snapshot, reviewed candidate/diff, changed files/surfaces/risk, prior
   findings/dispositions, verification, applicable proof, missing evidence,
   existing policy-derived semantic review facts, route/profile/policy/binding
   versions, independence/transport, bounded retrieval/payload refs, and
   budget/redaction facts. It is a review view—not StagePacket or runner
   authority—and never selects a provider/model, launches/resumes a reviewer,
   or executes a runner.

Historical reports read accepted/harvested state from
`.harness/memory/project.sqlite` through Project Memory APIs only. Run-local
staging, JSONL, projection SQLite, chats, loose markdown, hidden model memory,
and Git alone are not accepted-memory authority. An active current
implementation-review packet may read only its exact typed Staging/Run state
and required existing context/procedure artifacts; visibly distinguish it from
accepted Project Memory. Narrow read APIs may be added at existing database
boundaries, never a raw-SQL CLI or second database abstraction.

`run_instance_id` is authoritative. `run_id` is convenience only: internal
joins use the former; `--run` may resolve only one valid run in selected
authority and otherwise fails ambiguous; manifests carry both where applicable;
equal display IDs never cross-join exact runs.

## Determinism, claims, proof, and recorded routing facts

For stable authoritative inputs, canonical field/source/ref/claim and
omission/truncation ordering are stable. Repeated generation has the same
canonical semantic body/content hash; changing a semantic input changes the
identity. UUIDs, wall-clock presentation metadata, and hidden model output do
not influence semantic identity unless explicitly justified.

Every material claim is evidence-linked with exact record/artifact/payload/ref,
inference-marked, or explicitly missing/unknown. Deterministic evidence
outranks model judgment; semantic verdicts cannot erase failing deterministic
checks, required missing evidence, source/runtime violations, or lifecycle
blockers. Superseded records stay traceable and never silently appear current.

When accepted proof exists, validate exact run plus record/content identity by
the proof contract and expose relevant proof/evidence-gap refs. If unavailable,
state the supported unavailable/not-applicable/legacy reason. Missing/corrupt
required proof is a source-contract integrity problem; never fabricate it.

Surface only recorded route/context/usage facts when present: route decision,
route policy, provider binding, class, profile floor, reasoning bounds,
changed-surface/risk, deterministic evidence, required semantic reviews,
independence, ContextCore/Manifest/Overlay IDs/hashes, transport/reuse, usage
ref/values. Separate deterministic facts, semantic judgment, human decisions,
and missing information. Never infer provider/model or add Phase 31 execution.

## Redaction, budget, CI, schemas, runtime boundary, and CLI

Redaction occurs before export leaves governed reads. Respect existing payload
sensitivity/retention metadata; never dump raw chunks or CI logs by default;
only permitted bounded/redacted excerpts, visible status, and safe refs may
appear. A sentinel-secret fixture proves secret bytes never enter output.

Actual output/context bytes and selected budget are visible. Optional sections
use stable priority and record omissions/truncation. Mandatory task/plan/run,
procedure, unresolved blocker, acceptance, and independence material is never
silently removed; mandatory over-budget generation fails with a typed bounded
error. Reuse existing context-budget principles.

Represent recorded remote CI/check facts only—provider, external ID/URL, exact
commit, available job/step conclusion, bounded/redacted failed excerpt, exact
evidence/payload ref—without network refresh.

Keep the surface equivalent to `node bin/ch memory report ...` and
`node bin/ch memory packet ...`, with useful help, exact `--run-instance`, and
ambiguity-safe `--run`. Generation requires no LLM/API/network and mutates no
lifecycle, approvals, review, harvest, TaskState, accepted memory, or staging.
Explicit exports are ignored/private runtime artifacts, not checked-in source
or automatic accepted memory, and must not dirty Git. Do not repurpose
`node bin/ch report` without a compatibility-safe rationale.

Follow the schema-forward rule: reusable machine-readable report/packet/view
contracts need checked-in schema authority; an ephemeral view needs explicit
justification. Default: no new database, migration, storage authority,
duplicate memory store, or raw-SQL public interface. If migration becomes
unavoidable, stop that portion for storage/architecture review. Source may
contain code/schemas/tests/docs/templates; reports, packets, exports, chunks,
evidence, and DB data stay runtime. Never commit `.harness/**`, `.codex/**`,
raw payloads, secrets, runtime DBs, or exports.

## Explicit additional non-goals

No Phase 24B catalog; proposal/governance/repeated-failure/reviewer-disagreement
analytics; portable bundles; broad/planner/closeout packet taxonomies; MCP,
Agent Access Layer, hosted API, dashboard, domain packs or domain formatting;
autonomous agent; provider/model or generic-runner execution; Phase 30/31 work;
lifecycle decisions from views; second ContextCore/Manifest/Overlay or
StagePacket/StageResult; proof generation; or accepted-memory promotion outside
harvest.

## Required negative/regression coverage

Focused fixtures may consolidate assertions but must cover: valid pointer and
this direct task's multiline grammar; malformed/out-of-repo pointer;
decision-source/task-contract identity separation and readable historical
decision; phase-neutral successor authority; reusable review/delivery/closeout
provenance; retained Phase-23.9-only proof behavior; exact-instance reporting
and display-ID ambiguity; proof-present and honest proof-absent cases;
determinism and changed semantic input; corrupt identity/context failure; exact
context/overlay parent validation; mandatory packet context; current-versus-
superseded evidence; pre-serialization sentinel redaction; deterministic
optional truncation and mandatory over-budget blocking; bounded/redacted CI
failure; no lifecycle/DB/TaskState mutation, LLM/API/network call, or Git
dirtiness; and no Phase 24B/25/30/31 leakage.

## Acceptance additions, reviewer focus, and implementation order

Preserve all acceptance commands above. Add one focused Phase 24A command and
only the necessary upstream regressions for successor/bootstrap, 23.8.6F
context reuse, 23.8.7 consumed contracts, 23.9 proof/provenance compatibility,
and 24A behavior. If `npm test` and `npm run test:acceptance` are demonstrably
the same canonical suite, document and run it once; retain the semantic full-
suite requirement and `git diff --check`.

Review scope leakage; raw SQL; accepted/staging mixing; display-ID joins; views
gaining lifecycle authority or mutating state; ambiguous pointers; identity
conflation; old allowlists; indiscriminate 23.9 changes; fabricated proof;
hidden model output; unverified context reconstruction; competing types;
post-serialization secrets; unbounded payloads; nondeterministic identity;
mandatory truncation; generated source; unreviewed schemas/migrations; and
domain core logic.

Suggested order: prove defects; correct pointer and identity semantics;
generalize only needed successor/bootstrap and reviewed-source guarantees; add
narrow reads; define contracts/schemas; implement report, context view, and
overlay packet; project claims/proof/route/redaction/budget/CI; add CLI; run
focused/canonical checks; complete independent review/fix-pass; then delivery,
closeout, and harvest gates. This is guidance, not permission to bypass plan
review.

## Required implementation return and completion

The eventual implementation return reports branch/base, approved plan, changed
files, lifecycle corrections, implemented types/input authority, identity joins,
schema/migration decision, deterministic/redaction/budget/proof fixtures,
negative tests, verification, review/fix-pass, delivery/CI, closeout/harvest,
future work not implemented, debt, and final Git status. Completion requires
all assigned lifecycle corrections and three views; exact authority/identity;
honest proof; evidence-linked claims; pre-export redaction; visible budgets;
non-mutating deterministic output; runtime-only exports; no future leakage; and
all review, verification, delivery, closeout, and harvest gates.
