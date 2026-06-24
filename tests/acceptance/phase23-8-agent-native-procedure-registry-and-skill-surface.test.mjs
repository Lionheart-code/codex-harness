import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import {
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  ensureBuiltCli,
  productRoot,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const ACTIVE_TASK_PATH = "tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md";
const TIMESTAMP = "2026-05-27T00:00:00.000Z";
const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function loadBuiltModules() {
  ensureBuiltCli();

  return {
    runtimeModule: require(path.join(productRoot, "dist", "core", "runtime.js")),
    registryModule: require(path.join(productRoot, "dist", "core", "self-hosting-procedures.js"))
  };
}

function activeTaskMarkdown(options = {}) {
  const acceptanceCommands = options.acceptanceCommands ?? [
    "npm run build",
    "node --test tests/acceptance/phase23-6-self-hosting-skills-plan-review-bootstrap.test.mjs tests/acceptance/self-hosting-review-policy-hardening.test.mjs tests/acceptance/phase23-7-operator-status.test.mjs tests/acceptance/phase23-8-agent-native-procedure-registry-and-skill-surface.test.mjs",
    "git diff --check"
  ];

  return [
    "# Phase 23.8 - Agent-native Procedure Registry and Skill Surface",
    "",
    "## Goal",
    "Introduce a checked-in machine-readable registry over canonical self-hosting procedures.",
    "",
    "## Constraints",
    "- canonical source remains skills/self-hosting/**",
    "- no provider or host adapters",
    "- hooks remain guardrails only",
    "",
    "## Acceptance",
    "- operator consumes structured procedure metadata where practical",
    "- review barriers stay explicit",
    "",
    "## Acceptance commands",
    "",
    "```bash",
    ...acceptanceCommands,
    "```",
    "",
    "## Acceptance behavior",
    "- registry points back to canonical files",
    "- review progression is outcome-aware enough to require typed review outcome before approval",
    ""
  ].join("\n");
}

function createPhase238Repo(prefix, options = {}) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.8\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "skills"), { recursive: true });

  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      `Implement only: ${ACTIVE_TASK_PATH}`,
      "",
      "Do not implement Phase 23.9 or later.",
      ""
    ].join("\n")
  );

  writeText(path.join(tempRepo, ACTIVE_TASK_PATH), options.taskMarkdown ?? activeTaskMarkdown());
  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.8 — Agent-native Procedure Registry and Skill Surface",
      "",
      "Task:",
      `\`${ACTIVE_TASK_PATH}\``,
      ""
    ].join("\n")
  );

  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });

  if (options.packageJson) {
    writeText(path.join(tempRepo, "package.json"), `${JSON.stringify(options.packageJson, null, 2)}\n`);
  }

  return tempRepo;
}

function parseOperatorOutput(stdout) {
  const parsed = new Map();

  for (const line of stdout.trim().split(/\r?\n/u)) {
    const separator = line.indexOf(": ");

    if (separator === -1) {
      continue;
    }

    parsed.set(line.slice(0, separator), line.slice(separator + 2));
  }

  return parsed;
}

function runOperatorStatus(tempRepo, runId) {
  const result = runCli(["run", "status", "--operator", "--run", runId], { cwd: tempRepo });
  assertSuccess(result, `run status --operator in ${tempRepo}`);
  return parseOperatorOutput(result.stdout);
}

function writeRuntimeRunFixture(tempRepo, run) {
  const runDir = path.join(tempRepo, ".harness", "runs", run.run_id);
  fs.mkdirSync(runDir, { recursive: true });
  writeText(path.join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeText(
    path.join(tempRepo, ".harness", "runs", "current.json"),
    `${JSON.stringify({ run_id: run.run_id, run_path: `${run.run_id}/run.json`, updated_at: run.updated_at }, null, 2)}\n`
  );
}

function buildPlanReviewEvidenceMarkdown(reviewResult, overrides = {}) {
  const defaults = reviewResult?.status === "PASS"
    ? {
        verdict: "PASS",
        outcomeState: "ready_for_implementation",
        blockingFindings: "none",
        requiredAmendments: "none",
        acceptedDefaults: "defaults stand",
        realOperatorChoices: "none",
        nextAllowedAction: "obtain explicit human approval of the reviewed plan",
        validationRequired: "npm run build; node --test ...; git diff --check",
        sourceTrace: "procedure:plan-review",
        futurePhaseDeferrals: "none",
        recommendation: "PASS"
      }
    : {
        verdict: "AMEND_REQUIRED",
        outcomeState: "needs_contract_surface_update",
        blockingFindings: "none",
        requiredAmendments: "amend plan per review findings",
        acceptedDefaults: "defaults stand",
        realOperatorChoices: "none",
        nextAllowedAction: "run plan-amend to address blocking review findings",
        validationRequired: "npm run build; node --test ...; git diff --check",
        sourceTrace: "procedure:plan-review",
        futurePhaseDeferrals: "none",
        recommendation: "AMEND_REQUIRED"
      };
  const record = { ...defaults, ...overrides };

  return [
    "## Review Tier",
    "",
    "extra-high",
    "",
    "## Findings",
    "",
    "1. Review fixture.",
    "",
    "## Scope And Boundary Check",
    "",
    "Inside task boundary.",
    "",
    "## Policy Control Check",
    "",
    "anti_slop: pass",
    "design_invariant: pass",
    "scope_legality: pass",
    "evidence_gap: pass",
    "docs_consistency: pass",
    "future_phase_leakage: pass",
    "review_tier_controls: named",
    "",
    "## Validation Check",
    "",
    "validation fixture",
    "",
    "## Durable Decision Record",
    "",
    `verdict: ${record.verdict}`,
    `outcome_state: ${record.outcomeState}`,
    `blocking_findings: ${record.blockingFindings}`,
    `required_amendments: ${record.requiredAmendments}`,
    `accepted_defaults: ${record.acceptedDefaults}`,
    `real_operator_choices: ${record.realOperatorChoices}`,
    `next_allowed_action: ${record.nextAllowedAction}`,
    `validation_required: ${record.validationRequired}`,
    `source_trace: ${record.sourceTrace}`,
    `future_phase_deferrals: ${record.futurePhaseDeferrals}`,
    "",
    "## Recommendation",
    "",
    record.recommendation
  ].join("\n");
}

function materializeRunEvidenceFiles(tempRepo, run, timestampMap = {}, options = {}) {
  const runDir = path.join(tempRepo, ".harness", "runs", run.run_id);
  const latestPlanReviewResult = [...run.review_results]
    .reverse()
    .find((review) => /procedure:plan-review/i.test(review.source));

  for (const evidence of run.evidence) {
    if (!evidence.path) {
      continue;
    }

    const evidencePath = path.join(runDir, evidence.path);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    const content = evidence.kind === "procedure:plan-review"
      ? (options.genericPlanReviewOnly
        ? `${evidence.kind}\n`
        : buildPlanReviewEvidenceMarkdown(latestPlanReviewResult, options.planReviewDecisionOverrides))
      : `${evidence.kind}\n`;
    writeText(evidencePath, content);

    const procedureId = /^procedure:(.+)$/u.exec(evidence.kind)?.[1];
    const timestamp = timestampMap[evidence.path] ?? (procedureId ? timestampMap[procedureId] : undefined);
    if (timestamp) {
      const date = new Date(timestamp);
      fs.utimesSync(evidencePath, date, date);
    }
  }
}

function createBaseRun(runtimeModule, tempRepo, runId) {
  return runtimeModule.buildRuntimeRun({
    runId,
    taskPath: "TASK.md",
    activeTaskPath: ACTIVE_TASK_PATH,
    phaseId: "23.8",
    repository: {
      root_path: tempRepo,
      project_root: tempRepo,
      dirty: false
    },
    timestamp: TIMESTAMP
  });
}

function addTaggedProcedures(run, ...procedureIds) {
  return {
    ...run,
    evidence: [
      ...run.evidence,
      ...procedureIds.map((procedureId, index) => ({
        evidence_id: `evidence-${procedureId}-${run.evidence.length + index + 1}`,
        kind: `procedure:${procedureId}`,
        summary: procedureId,
        path: `evidence/${procedureId}-${index + 1}.md`
      }))
    ]
  };
}

function addReviewResult(runtimeModule, run, status, summary, source = "procedure:plan-review") {
  return runtimeModule.recordReviewResult(run, {
    review_result_id: `review-${run.review_results.length + 1}`,
    status,
    created_at: "2026-05-27T00:10:00.000Z",
    summary,
    source,
    blockers: status === "FIX_REQUIRED" ? [summary] : [],
    artifact_refs: []
  });
}

function addBlockingFinding(runtimeModule, run, title) {
  return runtimeModule.recordFinding(run, {
    findingId: `finding-${run.findings.length + 1}`,
    title,
    severity: "high",
    status: "open",
    blocking: true,
    createdAt: "2026-05-27T00:11:00.000Z"
  });
}

function readProcedureIdsFromCanonicalSkills(rootPath) {
  const proceduresRoot = path.join(rootPath, "skills", "self-hosting");
  const procedureIds = new Set();

  for (const entry of fs.readdirSync(proceduresRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(proceduresRoot, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      continue;
    }

    const skill = fs.readFileSync(skillPath, "utf8");
    const procedureId = /## procedure_id\s+`([^`]+)`/mu.exec(skill)?.[1]?.trim();
    if (procedureId) {
      procedureIds.add(procedureId);
    }
  }

  return procedureIds;
}

test("phase 23.8 registry is canonical, schema-backed, and preserves procedure semantics", () => {
  const { registryModule } = loadBuiltModules();
  const registry = registryModule.readSelfHostingProcedureRegistry(productRoot);
  assert.ok(registry, "expected checked-in self-hosting procedure registry");

  const expectedProcedureIds = readProcedureIdsFromCanonicalSkills(productRoot);
  const actualProcedureIds = new Set(registry.procedures.map((procedure) => procedure.procedure_id));
  assert.deepEqual(actualProcedureIds, expectedProcedureIds);

  assert.equal(registry.canonical_root, "skills/self-hosting/");
  assert.equal(registry.discovery_targets.every((target) => target.authority === "non-authoritative"), true);

  for (const procedure of registry.procedures) {
    const expectedPromptWrapperPath = `prompts/self-hosting/${procedure.procedure_id}.md`;
    assert.ok(fs.existsSync(path.join(productRoot, procedure.skill_path)), `missing skill path for ${procedure.procedure_id}`);
    assert.ok(fs.existsSync(path.join(productRoot, procedure.source_notes_path)), `missing source-notes path for ${procedure.procedure_id}`);
    assert.ok(fs.existsSync(path.join(productRoot, procedure.output_format_path)), `missing output-format path for ${procedure.procedure_id}`);
    assert.equal(procedure.prompt_wrapper_path, expectedPromptWrapperPath);
    assert.ok(
      fs.existsSync(path.join(productRoot, procedure.prompt_wrapper_path)),
      `missing prompt wrapper path for ${procedure.procedure_id}`
    );
    assert.ok(procedure.phase_23_5_dependencies.length > 0, `${procedure.procedure_id} must declare Phase 23.5 linkage`);
    assert.equal(procedure.generated_or_install_targets_non_authoritative, true);
  }

  const promptWrapperFiles = fs.readdirSync(path.join(productRoot, "prompts", "self-hosting"))
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .sort();
  assert.deepEqual(
    promptWrapperFiles,
    [...expectedProcedureIds].map((procedureId) => `${procedureId}.md`).sort(),
    "prompts/self-hosting must have exactly one wrapper per registry procedure"
  );

  const draftPlan = registry.procedures.find((procedure) => procedure.procedure_id === "draft-plan");
  const planReview = registry.procedures.find((procedure) => procedure.procedure_id === "plan-review");
  const planAmend = registry.procedures.find((procedure) => procedure.procedure_id === "plan-amend");
  assert.ok(draftPlan?.operator_contract?.real_operator_choices_only);
  assert.ok(planReview?.operator_contract?.durable_decision_fields?.includes("outcome_state"));
  assert.ok(planReview?.operator_contract?.allowed_outcome_states?.includes("needs_contract_surface_update"));
  assert.equal(planAmend?.operator_contract?.latest_amendment_supersedes_prior_plan, true);

  const registrySchema = JSON.parse(fs.readFileSync(path.join(productRoot, "schemas", "self-hosting-procedure-registry.schema.json"), "utf8"));
  assert.ok(
    registrySchema.properties?.procedures?.items?.required?.includes("phase_23_5_dependencies"),
    "registry schema must require Phase 23.5 dependency metadata"
  );
  assert.ok(
    registrySchema.properties?.procedures?.items?.required?.includes("prompt_wrapper_path"),
    "registry schema must require prompt wrapper metadata"
  );
  assert.equal(
    registrySchema.properties?.procedures?.items?.properties?.prompt_wrapper_path?.pattern,
    "^prompts/self-hosting/[a-z0-9-]+\\.md$"
  );
});

test("phase 23.8 registry validation fails closed on prompt wrapper path mismatch", () => {
  const { registryModule } = loadBuiltModules();
  const registry = JSON.parse(fs.readFileSync(path.join(productRoot, "skills", "self-hosting", "procedure-registry.json"), "utf8"));
  const firstProcedure = registry.procedures[0];
  firstProcedure.prompt_wrapper_path = "prompts/self-hosting/not-the-procedure.md";

  assert.throws(
    () => registryModule.validateSelfHostingProcedureRegistry(registry),
    (error) => error instanceof Error
      && error.message.includes(`prompt_wrapper_path must be prompts/self-hosting/${firstProcedure.procedure_id}.md`)
  );
});

test("phase 23.8 operator status uses registry required_inputs instead of hard-coded prompt strings", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-registry-inputs-");
  const registryPath = path.join(tempRepo, "skills", "self-hosting", "procedure-registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const taskPromptWriter = registry.procedures.find((procedure) => procedure.procedure_id === "task-prompt-writer");
  taskPromptWriter.required_inputs = ["registry-mutated-input", "registry-mutated-boundary"];
  writeText(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const run = addTaggedProcedures(createBaseRun(runtimeModule, tempRepo, "run-registry-inputs"), "task-intake");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "TASK_PROMPT_REQUIRED");
  assert.match(output.get("required_inputs"), /registry-mutated-input/);
  assert.match(output.get("required_inputs"), /registry-mutated-boundary/);
});

test("phase 23.8 run verify uses active task acceptance commands before package scripts", () => {
  ensureBuiltCli();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-task-verify-commands-", {
    taskMarkdown: activeTaskMarkdown({
      acceptanceCommands: [
        "node -e \"process.stdout.write('task-build ok\\\\n')\"",
        "node -e \"process.stdout.write('task-test ok\\\\n')\"",
        "git diff --check"
      ]
    }),
    packageJson: {
      name: "codex-harness",
      version: "0.1.0",
      scripts: {
        build: "node -e \"process.stderr.write('package build should not run\\\\n'); process.exit(1)\"",
        test: "node -e \"process.stderr.write('package test should not run\\\\n'); process.exit(1)\""
      }
    }
  });

  let run = createBaseRun(loadBuiltModules().runtimeModule, tempRepo, "run-task-acceptance-verify");
  loadBuiltModules().runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);

  const verify = runCli(["run", "verify", "--run", run.run_id], { cwd: tempRepo });
  assertSuccess(verify, "run verify uses task acceptance commands");
  assert.match(verify.stdout, /verification: pass/);

  const recordedRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", run.run_id, "run.json"), "utf8"));
  const latestVerification = recordedRun.verification_results.at(-1);
  assert.deepEqual(
    latestVerification.command_results.map((result) => result.command),
    [
      "node -e \"process.stdout.write('task-build ok\\\\n')\"",
      "node -e \"process.stdout.write('task-test ok\\\\n')\"",
      "git diff --check"
    ]
  );
});

test("phase 23.8 operator progression requires typed review outcome and treats plan-amend as the latest effective plan update", () => {
  const { runtimeModule } = loadBuiltModules();

  const missingOutcomeRepo = createPhase238Repo("codex-harness-phase23-8-missing-review-outcome-");
  const missingOutcomeRun = addTaggedProcedures(
    createBaseRun(runtimeModule, missingOutcomeRepo, "run-missing-plan-review-outcome"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review"
  );
  runtimeModule.validateRuntimeRun(missingOutcomeRun);
  writeRuntimeRunFixture(missingOutcomeRepo, missingOutcomeRun);
  materializeRunEvidenceFiles(missingOutcomeRepo, missingOutcomeRun, {}, { genericPlanReviewOnly: true });
  const missingOutcome = runOperatorStatus(missingOutcomeRepo, missingOutcomeRun.run_id);
  assert.equal(missingOutcome.get("current_stage"), "PLAN_REVIEW_REQUIRED");
  assert.equal(missingOutcome.get("stop_reason"), "missing_plan_review_decision_record");

  const amendRequiredRepo = createPhase238Repo("codex-harness-phase23-8-plan-amend-required-");
  let amendRequiredRun = addTaggedProcedures(
    createBaseRun(runtimeModule, amendRequiredRepo, "run-plan-amend-required"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review"
  );
  amendRequiredRun = addReviewResult(runtimeModule, amendRequiredRun, "FIX_REQUIRED", "Plan review requires amendment");
  amendRequiredRun = addBlockingFinding(runtimeModule, amendRequiredRun, "Blocking plan review finding");
  runtimeModule.validateRuntimeRun(amendRequiredRun);
  writeRuntimeRunFixture(amendRequiredRepo, amendRequiredRun);
  materializeRunEvidenceFiles(amendRequiredRepo, amendRequiredRun);
  const amendRequired = runOperatorStatus(amendRequiredRepo, amendRequiredRun.run_id);
  assert.equal(amendRequired.get("current_stage"), "PLAN_AMEND_REQUIRED");

  const amendedPlanRepo = createPhase238Repo("codex-harness-phase23-8-amended-plan-ready-");
  let amendedPlanRun = addTaggedProcedures(
    createBaseRun(runtimeModule, amendedPlanRepo, "run-amended-plan-ready"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review",
    "plan-amend"
  );
  amendedPlanRun = addReviewResult(runtimeModule, amendedPlanRun, "FIX_REQUIRED", "Plan review requires amendment");
  runtimeModule.validateRuntimeRun(amendedPlanRun);
  writeRuntimeRunFixture(amendedPlanRepo, amendedPlanRun);
  materializeRunEvidenceFiles(amendedPlanRepo, amendedPlanRun);
  const amendedPlan = runOperatorStatus(amendedPlanRepo, amendedPlanRun.run_id);
  assert.equal(amendedPlan.get("current_stage"), "PLAN_APPROVAL_REQUIRED");
});

test("phase 23.8 pre-implementation gate does not accept review results from a different procedure as the plan-review durable record", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-wrong-review-source-");
  let run = addTaggedProcedures(
    createBaseRun(runtimeModule, tempRepo, "run-wrong-review-source"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review"
  );
  run = addReviewResult(
    runtimeModule,
    run,
    "PASS",
    "Implementation review passed",
    "procedure:implementation-review"
  );

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeRunEvidenceFiles(tempRepo, run, {}, { genericPlanReviewOnly: true });
  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_REVIEW_REQUIRED");
  assert.equal(output.get("stop_reason"), "missing_plan_review_decision_record");
});

test("phase 23.8 operator progression uses durable plan-review semantics over generic review-result status", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-durable-review-semantics-");
  let run = addTaggedProcedures(
    createBaseRun(runtimeModule, tempRepo, "run-durable-review-semantics"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review"
  );
  run = addReviewResult(
    runtimeModule,
    run,
    "PASS",
    "Generic runtime review status says plan review passed",
    "procedure:plan-review"
  );

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeRunEvidenceFiles(tempRepo, run, {}, {
    planReviewDecisionOverrides: {
      verdict: "AMEND_REQUIRED",
      outcomeState: "needs_contract_surface_update",
      requiredAmendments: "tighten the task contract and amend the plan",
      nextAllowedAction: "run plan-amend to address durable plan-review findings",
      recommendation: "AMEND_REQUIRED"
    }
  });

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_AMEND_REQUIRED");
  assert.equal(output.get("stop_reason"), "plan_review_requires_amendment");
  assert.match(output.get("next_allowed_action"), /run plan-amend/i);
});

test("phase 23.8 stale plan-amend evidence does not satisfy a later durable plan-review amendment decision", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-stale-plan-amend-");
  let run = addTaggedProcedures(
    createBaseRun(runtimeModule, tempRepo, "run-stale-plan-amend"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review",
    "plan-amend"
  );
  run = addReviewResult(
    runtimeModule,
    run,
    "PASS",
    "Generic runtime review status says plan review passed",
    "procedure:plan-review"
  );

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeRunEvidenceFiles(tempRepo, run, {
    "draft-plan": "2026-05-27T00:10:00.000Z",
    "plan-amend": "2026-05-27T00:10:30.000Z",
    "plan-review": "2026-05-27T00:12:00.000Z"
  }, {
    planReviewDecisionOverrides: {
      verdict: "AMEND_REQUIRED",
      outcomeState: "needs_contract_surface_update",
      requiredAmendments: "update the plan after the latest review findings",
      nextAllowedAction: "run plan-amend to produce a fresh effective amended plan",
      recommendation: "AMEND_REQUIRED"
    }
  });

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_AMEND_REQUIRED");
  assert.equal(output.get("stop_reason"), "plan_review_requires_amendment");
  assert.match(output.get("missing_evidence"), /fresh plan-amend after the latest durable plan-review decision/);
  assert.match(output.get("notes"), /plan_amend_stale_for_latest_plan_review: true/);
});

test("phase 23.8 stale plan approval does not survive a later plan-amend", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-stale-plan-approval-");
  let run = addTaggedProcedures(
    createBaseRun(runtimeModule, tempRepo, "run-stale-plan-approval"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review",
    "plan-amend"
  );
  run = addReviewResult(runtimeModule, run, "FIX_REQUIRED", "Plan review requires amendment");
  run = runtimeModule.recordApproval(run, {
    approvalId: "approval-reviewed-plan",
    title: "Reviewed plan approved",
    status: "approved",
    approver: "owner",
    reason: "Human approved the reviewed plan before the later amendment landed.",
    createdAt: "2026-05-27T00:11:00.000Z"
  });

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeRunEvidenceFiles(tempRepo, run, {
    "draft-plan": "2026-05-27T00:10:00.000Z",
    "plan-review": "2026-05-27T00:10:30.000Z",
    "plan-amend": "2026-05-27T00:12:00.000Z"
  });

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_APPROVAL_REQUIRED");
  assert.equal(output.get("stop_reason"), "missing_plan_approval");
});

test("phase 23.8 approval before the latest plan-review does not satisfy the reviewed-plan approval boundary", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase238Repo("codex-harness-phase23-8-pre-review-approval-");
  let run = addTaggedProcedures(
    createBaseRun(runtimeModule, tempRepo, "run-pre-review-approval"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review"
  );
  run = addReviewResult(
    runtimeModule,
    run,
    "PASS",
    "Plan review approved the plan",
    "procedure:plan-review"
  );
  run = runtimeModule.recordApproval(run, {
    approvalId: "approval-pre-review",
    title: "Reviewed plan approved",
    status: "approved",
    approver: "owner",
    reason: "Human approved the plan before the plan-review evidence was recorded.",
    createdAt: "2026-05-27T00:10:15.000Z"
  });

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeRunEvidenceFiles(tempRepo, run, {
    "draft-plan": "2026-05-27T00:10:00.000Z",
    "plan-review": "2026-05-27T00:10:30.000Z"
  });

  const output = runOperatorStatus(tempRepo, run.run_id);
  assert.equal(output.get("current_stage"), "PLAN_APPROVAL_REQUIRED");
  assert.equal(output.get("stop_reason"), "missing_plan_approval");
});
