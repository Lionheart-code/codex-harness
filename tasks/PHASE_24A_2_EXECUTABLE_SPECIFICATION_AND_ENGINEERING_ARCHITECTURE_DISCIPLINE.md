# Phase 24A.2 - Executable Specification and Engineering Architecture Discipline

## Status

Planned. Starts only after Phase 24A.1 is complete, independently reviewed,
accepted, closed out, and harvested.

## Purpose

Close the gap between exact task requirements, authorized observable behavior,
material architecture decisions/invariants, implementation planning,
deterministic verification, semantic review, and requirement-specific proof.
Reuse existing requirement extraction, plan trace identities, procedures,
decision lifecycle, Project Memory, ContextCore/Manifest/Overlay, evidence, and
proof; do not create a coding-agent framework, requirements database,
architecture-agent framework, or parallel source of truth.

The target chain is:

`canonical task requirement ID -> authorized behavior scenario and/or architecture invariant -> plan trace/item -> implementation surface -> deterministic verification and/or required semantic review -> exact evidence -> requirement-specific proof`.

## Scope

Apply BDD/specification-by-example as an engineering discipline, not mandatory
syntax: discover behavior before implementation, formulate concrete authorized
examples, expose ambiguity rather than inventing outcomes, and automate stable,
material deterministic examples where appropriate. Do not add Cucumber,
`.feature` files, or mandatory Gherkin. Scenarios are required for material
observable CLI/API/lifecycle/approval/state/persistence/retry/replay/idempotency/
recovery/compatibility/security/procedure-result/packet behavior; they are not
required for spelling, documentation synchronization, stable mechanical
refactors, pure renames, every helper, or tasks with no material observable
behavior. Every scenario outcome derives from task authority or becomes an
explicit question/ambiguity/typed authority blocker.

Reuse canonical requirement identity early in intake, planning, plan review,
architecture and DB/storage review, implementation review, verification, and
proof. Requirement text remains authoritative in the task.

Every applicable mandatory task requirement must have machine-checkable
coverage through the minimum sufficient existing or new representation. The
semantic guarantee is mandatory. A physical `engineering-map.v1` artifact is
optional only when an existing plan contract is minimally extended to provide
equivalent exact, machine-checkable guarantees; prose coverage declared "good
enough" by an implementer is not sufficient.

Add one minimal plan-bound engineering trace map only if existing plan
structures cannot provide those equivalent guarantees. It is derived
from exact task authority, bound to one exact effective plan and applicable
run/base, and is neither a second requirement source nor accepted cross-task
memory. It identifies requirement inventory; authorized behavior scenarios;
material architecture invariants; plan surfaces and intended verification;
semantic-review responsibility when no deterministic oracle exists; and gaps
such as uncovered requirements, unauthorized scenarios, stale plan/map,
missing verification, or unresolved ambiguity.

Architecture discipline is risk-triggered. Material authority/lifecycle,
Project Memory/Run-Staging, persistence/schema/transaction/replay, approval/
security, public schema, dependency direction, compatibility/migration,
external execution, or cross-cutting reliability work must document the real
driver, constraint, alternatives, decision/tradeoff, failure/recovery,
authority/source/runtime consequence, revisit condition, and testable invariant
where practical. Small mechanical work may state that existing invariants hold;
never invent paper alternatives.

Use the existing staged-to-accepted Project Memory decision lifecycle for
durable architecture decisions; do not create an ADR directory. Procedure
responsibilities over the same contract are explicit:

- `task-intake` identifies canonical mandatory requirements and ambiguity;
- `task-prompt-writer` preserves those identities and forbids invented behavior;
- `draft-plan` creates the minimum sufficient scenarios/invariants/traces and
  verification ownership;
- `plan-amend` preserves or explicitly supersedes identities and restores
  coverage after semantic change;
- `plan-review` checks mandatory coverage, gaps, and invented behavior;
- `architecture-review` checks material drivers, decisions, invariants, and
  staged decision lifecycle;
- `db-storage-review` independently checks persistence, schema, transaction,
  migration, replay, and recovery obligations;
- `implementation-review` and `fix-pass-review` bind findings and changed
  surfaces to affected requirement/trace identities;
- `verification-review` maps deterministic and named semantic evidence to each
  applicable obligation;
- `phase-closeout-review` blocks remaining mandatory gaps and requires exact
  requirement-specific proof.

A generic semantic PASS cannot prove unrelated untraced requirements, and
deterministic failure outranks semantic PASS.

Feed trace references into existing ContextCore/Manifest/Overlay only where
they improve bounded review. Preserve surgical changes, one durable state
authority, explicit boundaries/transitions/side effects, deterministic policy,
and compatible recovery/migration reasoning without subjective maintainability
scores or universal design rules.

### Bounded uncertainty and spike tasks

When a planner cannot responsibly choose an implementation because one
technical assumption is unresolved, it may require a separate bounded research
or spike task before production implementation. The spike has one explicit
question or hypothesis, bounded scope and budget, explicit success/failure
evidence, and disposable non-authoritative experimental code by default. Spike
code is never silently promoted into production; an owner-reviewed decision and
task update are required first. This is not a new autonomous lifecycle or
general research agent. Phase 26 may propose such bounded tasks, while Phase 30
remains owner of systematic model, route, and evaluation experiments.

## Acceptance criteria

Fixtures prove canonical requirement reuse; unauthorized outcomes become
blockers; the required task-to-scenario/invariant-to-plan-to-surface-to-review/
verification-to-evidence-to-proof chain is machine-checkable; mandatory gaps
block plan acceptance and proof; exact owner approval binds the exact plan and
equivalent map/plan coverage representation; amendment makes stale coverage
fail closed; active versus accepted authority remains exact; retry/
idempotency/recovery evidence maps to its requirement; generic PASS cannot
close unrelated coverage; architecture and DB/storage ownership remain distinct;
staged decisions are not promoted early; a small non-behavioral task uses the
minimal direct trace; bounded spike proposals preserve their approval boundary;
and no Cucumber/Gherkin/second ADR source appears.

## Non-goals

No mandatory Gherkin or scenarios for every task, second requirement database
or ADR filesystem, generic architecture agent, autonomous multi-agent design,
broad task decomposer, Phase 24B reports, Phase 25 access, Phase 26 execution,
Phase 30 promotion, Phase 31 runner execution, automatic scenario/decision
authority, model-generated tests as authority without reviewed deterministic
evidence, universal fitness framework, or subjective maintainability scoring.
