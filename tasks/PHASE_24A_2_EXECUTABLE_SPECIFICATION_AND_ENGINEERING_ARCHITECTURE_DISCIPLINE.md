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

Add one minimal plan-bound engineering trace map only if existing plan
structures cannot provide equivalent machine-checkable coverage. It is derived
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
durable architecture decisions; do not create an ADR directory. Procedures
must consume this same contract: intake exposes requirement inventory and
ambiguity; planning creates the minimum authorized traces; amendments preserve
or explicitly supersede identities; plan review checks coverage and invented
behavior; architecture and DB/storage reviews retain their distinct judgment;
implementation/fix review references affected traces; verification maps exact
evidence; closeout blocks remaining mandatory gaps. A generic semantic PASS
cannot prove unrelated untraced requirements, and deterministic failure
outranks semantic PASS.

Feed trace references into existing ContextCore/Manifest/Overlay only where
they improve bounded review. Preserve surgical changes, one durable state
authority, explicit boundaries/transitions/side effects, deterministic policy,
and compatible recovery/migration reasoning without subjective maintainability
scores or universal design rules.

## Acceptance criteria

Fixtures prove canonical requirement reuse; unauthorized outcomes become
blockers; scenario/invariant coverage is checkable; mandatory gaps block plan
acceptance and proof; exact owner approval binds exact plan/map; amendment makes
stale map fail closed; active versus accepted authority remains exact; retry/
idempotency/recovery evidence maps to its requirement; generic PASS cannot
close unrelated coverage; architecture and DB/storage ownership remain distinct;
staged decisions are not promoted early; a small non-behavioral task uses the
minimal direct trace; and no Cucumber/Gherkin/second ADR source appears.

## Non-goals

No mandatory Gherkin or scenarios for every task, second requirement database
or ADR filesystem, generic architecture agent, autonomous multi-agent design,
broad task decomposer, Phase 24B reports, Phase 25 access, Phase 26 execution,
Phase 30 promotion, Phase 31 runner execution, automatic scenario/decision
authority, model-generated tests as authority without reviewed deterministic
evidence, universal fitness framework, or subjective maintainability scoring.
