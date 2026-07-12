import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import {
  assertFailure,
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
const ACTIVE_TASK_PATH = "tasks/PHASE_23_7_MINIMUM_SELF_HOSTING_OPERATOR_INTERPRETER.md";
const TIMESTAMP = "2026-05-25T00:00:00.000Z";
const REVIEW_PROCEDURES = new Set([
  "plan-review",
  "implementation-review",
  "fix-pass-review",
  "verification-review",
  "delivery-facts-review",
  "phase-closeout-review"
]);
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
    stagingModule: require(path.join(productRoot, "dist", "core", "run-staging-db.js"))
  };
}

function copySelfHostingProcedures(tempRepo) {
  fs.mkdirSync(path.join(tempRepo, "skills"), { recursive: true });
  fs.cpSync(path.join(productRoot, "skills", "self-hosting"), path.join(tempRepo, "skills", "self-hosting"), {
    recursive: true
  });
}

function defaultActiveTaskMarkdown() {
  return [
    "# Phase 23.7 - Minimum Self-Hosting Operator Interpreter",
    "",
    "Goal:",
    "Make operator/stage routing machine-visible without changing lifecycle or storage authority.",
    "",
    "Constraints:",
    "- operator/stage routing only",
    "- preserve lifecycle and storage boundaries",
    "- no provider adapters",
    ""
  ].join("\n");
}

function structuredBroadTaskMarkdown() {
  return [
    "# Phase 23.7 - Minimum Self-Hosting Operator Interpreter",
    "",
    "## Goal",
    "Handle a broad request that spans multiple modules and future phases without direct implementation.",
    "",
    "## Constraints",
    "- operator/stage routing only",
    "- preserve lifecycle and storage boundaries",
    "- this request is too broad for one implementation pass",
    "",
    "## Acceptance",
    "- do not implement future phases",
    "- propose the smallest reviewable split first",
    ""
  ].join("\n");
}

function createPhase237Repo(prefix, options = {}) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.7\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });

  if (!options.omitTaskMd) {
    writeText(
      path.join(tempRepo, "TASK.md"),
      [
        "# Current Task",
        "",
        `Implement only: ${ACTIVE_TASK_PATH}`,
        "",
        "Do not implement Phase 23.8 or later.",
        ""
      ].join("\n")
    );
  }

  if (options.activeTaskMarkdown !== null) {
    writeText(
      path.join(tempRepo, ACTIVE_TASK_PATH),
      options.activeTaskMarkdown ?? defaultActiveTaskMarkdown()
    );
  }

  writeText(
    path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
    [
      "## Phase 23.7 — Minimum Self-Hosting Operator Interpreter",
      "",
      "Task:",
      `\`${options.roadmapTaskPath ?? ACTIVE_TASK_PATH}\``,
      "",
      "Status:",
      "Next active implementation phase.",
      "",
      ...(!options.omitNextPhaseSection
        ? [
            "## Phase 23.8 — Agent-native Procedure Registry and Skill Surface",
            "",
            "Task:",
            "`tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md`",
            ""
          ]
        : [])
    ].join("\n")
  );

  copySelfHostingProcedures(tempRepo);
  return tempRepo;
}

function parseOperatorOutput(stdout) {
  const parsed = new Map();

  for (const line of stdout.trim().split(/\r?\n/)) {
    const separator = line.indexOf(": ");

    if (separator === -1) {
      continue;
    }

    parsed.set(line.slice(0, separator), line.slice(separator + 2));
  }

  return parsed;
}

function buildProcedureIdSet() {
  return new Set([
    "none",
    "feature-decomposition",
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review",
    "plan-amend",
    "architecture-review",
    "db-storage-review",
    "implementation-review",
    "fix-pass-review",
    "verification-review",
    "delivery-facts-review",
    "phase-closeout-review",
    "docs-consistency-review",
    "harness-audit"
  ]);
}

function buildTaggedEvidence(kind, suffix = "1") {
  return {
    evidence_id: `evidence-${kind}-${suffix}`,
    kind: `procedure:${kind}`,
    summary: kind,
    path: `evidence/${kind}-${suffix}.md`
  };
}

function writeRuntimeRunFixture(tempRepo, run) {
  const runDir = path.join(tempRepo, ".harness", "runs", run.run_id);
  fs.mkdirSync(runDir, { recursive: true });
  writeText(path.join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeText(
    path.join(tempRepo, ".harness", "runs", "current.json"),
    `${JSON.stringify(
      {
        run_id: run.run_id,
        run_path: `${run.run_id}/run.json`,
        updated_at: run.updated_at
      },
      null,
      2
    )}\n`
  );
}

function buildPlanReviewEvidenceMarkdown(reviewResult) {
  const verdict = reviewResult?.status === "PASS" ? "PASS" : "AMEND_REQUIRED";
  const outcomeState = reviewResult?.status === "PASS"
    ? "ready_for_implementation"
    : "needs_contract_surface_update";

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
    `verdict: ${verdict}`,
    `outcome_state: ${outcomeState}`,
    "blocking_findings: none",
    `required_amendments: ${verdict === "PASS" ? "none" : "amend plan per review findings"}`,
    "accepted_defaults: defaults stand",
    "real_operator_choices: none",
    `next_allowed_action: ${verdict === "PASS" ? "obtain explicit human approval of the reviewed plan" : "run plan-amend to address blocking review findings"}`,
    "validation_required: npm run build; node --test ...; git diff --check",
    "source_trace: procedure:plan-review",
    "future_phase_deferrals: none",
    "",
    "## Recommendation",
    "",
    verdict
  ].join("\n");
}

function materializeProcedureEvidenceFiles(tempRepo, run) {
  const runDir = path.join(tempRepo, ".harness", "runs", run.run_id);
  const latestPlanReviewResult = [...run.review_results]
    .reverse()
    .find((review) => /procedure:plan-review/i.test(review.source));
  const baseTimestamp = Date.parse("2026-05-25T00:01:00.000Z");

  for (const [index, evidence] of run.evidence.entries()) {
    if (!evidence.path) {
      continue;
    }

    const evidencePath = path.join(runDir, evidence.path);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    const content = evidence.kind === "procedure:plan-review" && latestPlanReviewResult
      ? buildPlanReviewEvidenceMarkdown(latestPlanReviewResult)
      : `${evidence.kind}\n`;
    writeText(evidencePath, content);
    const timestamp = new Date(baseTimestamp + index * 1000);
    fs.utimesSync(evidencePath, timestamp, timestamp);
  }
}

function createBaseRun(runtimeModule, tempRepo, runId) {
  return runtimeModule.buildRuntimeRun({
    runId,
    taskPath: "TASK.md",
    activeTaskPath: ACTIVE_TASK_PATH,
    phaseId: "23.7",
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
      ...procedureIds.map((procedureId, index) => buildTaggedEvidence(procedureId, `${run.evidence.length + index + 1}`))
    ]
  };
}

function addPlanApproval(runtimeModule, run, title = "Reviewed plan approved") {
  return runtimeModule.recordApproval(run, {
    approvalId: `approval-${run.approvals.length + 1}`,
    title,
    status: "approved",
    approver: "owner",
    createdAt: "2026-05-25T00:10:00.000Z"
  });
}

function addImplementationEvidence(runtimeModule, run) {
  const next = runtimeModule.recordStep(run, {
    stepId: "step-implementation",
    name: "Apply scoped implementation changes",
    status: "passed",
    startedAt: "2026-05-25T00:11:00.000Z",
    completedAt: "2026-05-25T00:12:00.000Z"
  });

  return runtimeModule.recordCommandResult(next, "step-implementation", {
    commandResultId: "command-build",
    command: "npm run build",
    status: "pass",
    exitCode: 0,
    completedAt: "2026-05-25T00:13:00.000Z"
  });
}

function addBlockingFinding(runtimeModule, run, title = "Blocking plan issue") {
  return runtimeModule.recordFinding(run, {
    findingId: `finding-${run.findings.length + 1}`,
    title,
    severity: "high",
    status: "open",
    blocking: true,
    createdAt: "2026-05-25T00:14:00.000Z"
  });
}

function addReviewResult(runtimeModule, run, status, summary = "Implementation review result", source = "reviewer") {
  return runtimeModule.recordReviewResult(run, {
    review_result_id: `review-${run.review_results.length + 1}`,
    status,
    created_at: "2026-05-25T00:15:00.000Z",
    summary,
    source,
    blockers: status === "FIX_REQUIRED" ? [summary] : [],
    artifact_refs: []
  });
}

function addVerificationResult(runtimeModule, run, status, summary = "Verification result") {
  return runtimeModule.recordVerificationResult(run, {
    verification_result_id: `verification-${run.verification_results.length + 1}`,
    status,
    created_at: "2026-05-25T00:16:00.000Z",
    summary,
    source: "verifier",
    artifact_refs: [],
    command_results: []
  });
}

function addDeliveryFacts(run) {
  return {
    ...run,
    delivery_facts: [
      ...run.delivery_facts,
      {
        delivery_fact_id: `delivery-${run.delivery_facts.length + 1}`,
        run_id: run.run_id,
        fact_kind: "pr",
        source: "github",
        status: "created",
        recorded_at: "2026-05-25T00:17:00.000Z",
        summary: "PR updated"
      }
    ],
    updated_at: "2026-05-25T00:17:00.000Z"
  };
}

function addCloseoutReceipt(runtimeModule, run, status) {
  const receipt = {
    ...runtimeModule.createCloseoutReceipt(run),
    status,
    blockers: status === "READY" ? [] : ["Closeout remains blocked."]
  };

  return {
    ...run,
    closeout_receipts: [...run.closeout_receipts, receipt],
    updated_at: receipt.created_at
  };
}

function setLifecycle(run, lifecycleStatus, extra = {}) {
  return {
    ...run,
    lifecycle_status: lifecycleStatus,
    ...extra
  };
}

function buildPostApprovalBaseRun(runtimeModule, tempRepo, runId) {
  let run = createBaseRun(runtimeModule, tempRepo, runId);
  run = addTaggedProcedures(run, "task-intake", "task-prompt-writer", "draft-plan", "plan-review");
  run = addReviewResult(runtimeModule, run, "PASS", "Plan review approved the plan", "procedure:plan-review");
  run = addPlanApproval(runtimeModule, run);
  return run;
}

function buildPostImplementationBaseRun(runtimeModule, tempRepo, runId) {
  let run = buildPostApprovalBaseRun(runtimeModule, tempRepo, runId);
  run = addImplementationEvidence(runtimeModule, run);
  run = addTaggedProcedures(run, "implementation-review");
  run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
  run = addVerificationResult(runtimeModule, run, "pass");
  run = addTaggedProcedures(run, "verification-review");
  run = addDeliveryFacts(run);
  run = addTaggedProcedures(run, "delivery-facts-review");
  return run;
}

function readNotes(output) {
  return output.get("notes") ? JSON.parse(output.get("notes")) : [];
}

function snapshotRepoFiles(rootPath) {
  const snapshot = new Map();

  function visit(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      const stat = fs.statSync(absolutePath);
      snapshot.set(path.relative(rootPath, absolutePath), `${stat.size}:${stat.mtimeMs}`);
    }
  }

  visit(rootPath);
  return snapshot;
}

function runOperatorStatus(tempRepo, ...args) {
  const result = runCli(["run", "status", "--operator", ...args], { cwd: tempRepo });
  assertSuccess(result, `run status --operator in ${tempRepo}`);
  return parseOperatorOutput(result.stdout);
}

function assertProjectedStage(output, expectedStage, expectedProcedure) {
  const allowedProcedureIds = buildProcedureIdSet();
  const actualProcedure = output.get("next_procedure_id");

  assert.equal(output.get("current_stage"), expectedStage);
  assert.equal(actualProcedure, expectedProcedure);
  assert.ok(allowedProcedureIds.has(actualProcedure), `unexpected next procedure id: ${actualProcedure}`);

  if (REVIEW_PROCEDURES.has(expectedProcedure)) {
    assert.match(output.get("next_allowed_action"), /separate read-only reviewer session/i);
  }
}

function seedQuarantineState(staging, tempRepo, runId) {
  const sqlite = require("node:sqlite");
  assert.equal(typeof sqlite.DatabaseSync, "function", "node:sqlite DatabaseSync must be available for quarantine acceptance coverage");

  const { stagingDbPath } = staging.resolveMemoryDbPaths(tempRepo, tempRepo, runId);
  fs.mkdirSync(path.dirname(stagingDbPath), { recursive: true });
  const database = new sqlite.DatabaseSync(stagingDbPath);

  try {
    database.exec([
      "CREATE TABLE IF NOT EXISTS payload_index (",
      "payload_id TEXT PRIMARY KEY,",
      "retention_class TEXT NOT NULL",
      ");"
    ].join(" "));
    database.prepare("INSERT INTO payload_index (payload_id, retention_class) VALUES (?, ?);").run("payload-1", "quarantine");
  } finally {
    database.close();
  }
}

test("phase 23.7 operator status projects boundary states and stays read-only without a run", () => {
  ensureBuiltCli();

  const noTaskRepo = createPhase237Repo("codex-harness-phase23-7-no-task-", {
    omitTaskMd: true
  });
  const noTaskOutput = runOperatorStatus(noTaskRepo);
  assertProjectedStage(noTaskOutput, "NO_ACTIVE_TASK", "none");

  const conflictRepo = createPhase237Repo("codex-harness-phase23-7-stale-task-", {
    roadmapTaskPath: "tasks/PHASE_23_6_SELF_HOSTING_SKILLS_PLAN_REVIEW_BOOTSTRAP.md"
  });
  const conflictOutput = runOperatorStatus(conflictRepo);
  assertProjectedStage(conflictOutput, "STALE_TASK_ROADMAP_CONFLICT", "none");

  const finalSectionRepo = createPhase237Repo("codex-harness-phase23-7-final-section-", {
    omitNextPhaseSection: true
  });
  const finalSectionOutput = runOperatorStatus(finalSectionRepo);
  assertProjectedStage(finalSectionOutput, "NO_ACTIVE_RUN", "none");

  const noRunRepo = createPhase237Repo("codex-harness-phase23-7-no-run-");
  const dryRunResult = runCli(["run", "status", "--operator", "--dry-run"], { cwd: noRunRepo });
  assertSuccess(dryRunResult, "run status --operator --dry-run without run");
  const dryRunOutput = parseOperatorOutput(dryRunResult.stdout);
  assertProjectedStage(dryRunOutput, "NO_ACTIVE_RUN", "none");
  assert.match(dryRunResult.stdout, /dry-run: no files were written/);
  assert.equal(fs.existsSync(path.join(noRunRepo, ".harness")), false, "operator dry-run must not create .harness");

  const noRunOutput = runOperatorStatus(noRunRepo);
  assertProjectedStage(noRunOutput, "NO_ACTIVE_RUN", "none");
  assert.equal(fs.existsSync(path.join(noRunRepo, ".harness")), false, "operator mode must stay read-only without --dry-run");

  const explicitMissingOutput = runOperatorStatus(noRunRepo, "--run", "run-missing");
  assertProjectedStage(explicitMissingOutput, "NO_ACTIVE_RUN", "none");
  assert.ok(readNotes(explicitMissingOutput).includes("explicit_run_not_found: run-missing"));
});

test("phase 23.7 operator status accepts split phase ids from task and roadmap", () => {
  ensureBuiltCli();

  const phaseCases = [
    {
      activeTaskPath: "tasks/PHASE_23_8_5_AUTOMATION_ROADMAP_AND_TASK_AUTHORITY_REBASE.md",
      taskHeading: "# Phase 23.8.5 - Automation Roadmap and Task Authority Rebase",
      roadmapHeading: "## Phase 23.8.5 — Automation Roadmap and Task Authority Rebase"
    },
    {
      activeTaskPath: "tasks/PHASE_24A_MINIMAL_EVIDENCE_REPORT_AND_REVIEW_PACKET.md",
      taskHeading: "# Phase 24A - Minimal Evidence Report and Review Packet",
      roadmapHeading: "## Phase 24A — Minimal Evidence Report and Review Packet"
    },
    {
      activeTaskPath: "tasks/PHASE_23_8_6B1_SUPERVISED_REVIEW_LAUNCH_AND_BLOCKED_DISPOSITION.md",
      taskHeading: "# Phase 23.8.6B1 - Supervised Review Launch and Blocked Disposition",
      roadmapHeading: "## Phase 23.8.6B1 — Supervised Review Launch and Blocked Disposition"
    },
    {
      activeTaskPath: "tasks/PHASE_23_8_6C1A_ROUTING_CONTEXT_AND_MODEL_POLICY_AUTHORITY_REBASE.md",
      taskHeading: "# Phase 23.8.6C1A - Routing, Context, and Model-Policy Authority Rebase",
      roadmapHeading: "## Phase 23.8.6C1A — Routing, Context, and Model-Policy Authority Rebase"
    }
  ];

  for (const phaseCase of phaseCases) {
    const tempRepo = createPhase237Repo("codex-harness-phase23-7-split-phase-", {
      activeTaskMarkdown: null,
      omitNextPhaseSection: true
    });

    writeText(
      path.join(tempRepo, "TASK.md"),
      [
        "# Current Task",
        "",
        `Implement only: ${phaseCase.activeTaskPath}`,
        "",
        "Do not implement later phases.",
        ""
      ].join("\n")
    );
    writeText(
      path.join(tempRepo, phaseCase.activeTaskPath),
      [
        phaseCase.taskHeading,
        "",
        "## Goal",
        "Keep operator routing aligned with split phase task identifiers.",
        "",
        "## Acceptance behavior",
        "- operator status must not report a stale task roadmap conflict.",
        ""
      ].join("\n")
    );
    writeText(
      path.join(tempRepo, "docs", "IMPLEMENTATION_ROADMAP.md"),
      [
        phaseCase.roadmapHeading,
        "",
        "Task:",
        `\`${phaseCase.activeTaskPath}\``,
        "",
        "Status:",
        "Active test phase.",
        ""
      ].join("\n")
    );

    const output = runOperatorStatus(tempRepo);
    assertProjectedStage(output, "NO_ACTIVE_RUN", "none");
    assert.notEqual(output.get("current_stage"), "STALE_TASK_ROADMAP_CONFLICT");

    const start = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
    assertSuccess(start, `run start for ${phaseCase.activeTaskPath}`);

    const currentRun = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", "current.json"), "utf8"));
    const run = JSON.parse(fs.readFileSync(path.join(tempRepo, ".harness", "runs", currentRun.run_id, "run.json"), "utf8"));
    const expectedPhaseId = /^# Phase ([^ ]+)/.exec(phaseCase.taskHeading)?.[1];
    assert.equal(run.phase_id, expectedPhaseId);
  }
});

test("phase 23.7 operator flag is rejected outside run status", () => {
  ensureBuiltCli();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-operator-flag-reject-");
  const result = runCli(["run", "verify", "--operator", "--dry-run"], { cwd: tempRepo });

  assertFailure(result, "run verify --operator --dry-run");
  assert.match(result.stderr, /Unknown option: --operator/);
});

test("phase 23.7 operator status projects all pre-implementation stages", () => {
  const { runtimeModule } = loadBuiltModules();
  const scenarios = [
    {
      name: "TASK_INTAKE_REQUIRED",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        return createBaseRun(runtimeModule, tempRepo, "run-task-intake");
      },
      expectedProcedure: "task-intake"
    },
    {
      name: "FEATURE_DECOMPOSITION_REQUIRED",
      activeTaskMarkdown: structuredBroadTaskMarkdown(),
      buildRun(tempRepo) {
        return addTaggedProcedures(createBaseRun(runtimeModule, tempRepo, "run-feature-decomposition"), "task-intake");
      },
      expectedProcedure: "feature-decomposition"
    },
    {
      name: "TASK_PROMPT_REQUIRED",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        return addTaggedProcedures(createBaseRun(runtimeModule, tempRepo, "run-task-prompt"), "task-intake");
      },
      expectedProcedure: "task-prompt-writer"
    },
    {
      name: "PLAN_DRAFT_REQUIRED",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        return addTaggedProcedures(createBaseRun(runtimeModule, tempRepo, "run-plan-draft"), "task-intake", "task-prompt-writer");
      },
      expectedProcedure: "draft-plan"
    },
    {
      name: "PLAN_REVIEW_REQUIRED",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        return addTaggedProcedures(
          createBaseRun(runtimeModule, tempRepo, "run-plan-review"),
          "task-intake",
          "task-prompt-writer",
          "draft-plan"
        );
      },
      expectedProcedure: "plan-review"
    },
    {
      name: "PLAN_AMEND_REQUIRED",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        let run = addTaggedProcedures(
          createBaseRun(runtimeModule, tempRepo, "run-plan-amend"),
          "task-intake",
          "task-prompt-writer",
          "draft-plan",
          "plan-review"
        );
        run = addReviewResult(runtimeModule, run, "FIX_REQUIRED", "Plan review requires amendment", "procedure:plan-review");
        run = addBlockingFinding(runtimeModule, run, "Plan review found a blocking issue");
        return run;
      },
      expectedProcedure: "plan-amend"
    },
    {
      name: "PLAN_APPROVAL_REQUIRED",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        let run = addTaggedProcedures(
          createBaseRun(runtimeModule, tempRepo, "run-plan-approval"),
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
        return run;
      },
      expectedProcedure: "none"
    },
    {
      name: "IMPLEMENTATION_READY",
      activeTaskMarkdown: defaultActiveTaskMarkdown(),
      buildRun(tempRepo) {
        return addPlanApproval(
          runtimeModule,
          addReviewResult(
            runtimeModule,
            addTaggedProcedures(
              createBaseRun(runtimeModule, tempRepo, "run-implementation-ready"),
              "task-intake",
              "task-prompt-writer",
              "draft-plan",
              "plan-review"
            ),
            "PASS",
            "Plan review approved the plan",
            "procedure:plan-review"
          )
        );
      },
      expectedProcedure: "none"
    }
  ];

  for (const scenario of scenarios) {
    const tempRepo = createPhase237Repo(`codex-harness-phase23-7-${scenario.name.toLowerCase()}-`, {
      activeTaskMarkdown: scenario.activeTaskMarkdown
    });
    const run = scenario.buildRun(tempRepo);
    runtimeModule.validateRuntimeRun(run);
    writeRuntimeRunFixture(tempRepo, run);
    materializeProcedureEvidenceFiles(tempRepo, run);

    const output = runOperatorStatus(tempRepo, "--run", run.run_id);
    assertProjectedStage(output, scenario.name, scenario.expectedProcedure);
  }
});

test("phase 23.7 operator status does not treat generic approved approvals as plan approval", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-generic-approval-");
  let run = addTaggedProcedures(
    createBaseRun(runtimeModule, tempRepo, "run-generic-approval"),
    "task-intake",
    "task-prompt-writer",
    "draft-plan",
    "plan-review"
  );
  run = addReviewResult(runtimeModule, run, "PASS", "Plan review approved the plan", "procedure:plan-review");

  run = runtimeModule.recordApproval(run, {
    approvalId: "approval-generic",
    title: "Approved",
    status: "approved",
    approver: "owner",
    createdAt: "2026-05-25T00:10:00.000Z"
  });

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeProcedureEvidenceFiles(tempRepo, run);

  const output = runOperatorStatus(tempRepo, "--run", run.run_id);
  assertProjectedStage(output, "PLAN_APPROVAL_REQUIRED", "none");
});

test("phase 23.7 operator status does not emit CLOSEOUT_READY without a ready closeout receipt", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-closeout-receipt-");
  const run = addTaggedProcedures(
    buildPostImplementationBaseRun(runtimeModule, tempRepo, "run-closeout-receipt-missing"),
    "phase-closeout-review"
  );

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeProcedureEvidenceFiles(tempRepo, run);

  const output = runOperatorStatus(tempRepo, "--run", run.run_id);
  assertProjectedStage(output, "CLOSEOUT_REVIEW_REQUIRED", "none");
  assert.match(output.get("missing_evidence"), /ready closeout receipt/);
});

test("phase 23.7 operator status projects implementation, closeout, and lifecycle stages", () => {
  const { runtimeModule } = loadBuiltModules();
  const scenarios = [
    {
      name: "IMPLEMENTATION_REVIEW_REQUIRED",
      buildRun(tempRepo) {
        return addImplementationEvidence(runtimeModule, buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-implementation-review"));
      },
      expectedProcedure: "implementation-review",
      assertExtra(output) {
        const forbiddenActions = JSON.parse(output.get("forbidden_actions"));
        assert.ok(forbiddenActions.includes("implementation"));
        assert.ok(forbiddenActions.includes("source edits"));
        assert.ok(forbiddenActions.includes("closeout"));
      }
    },
    {
      name: "FIX_PASS_REQUIRED",
      buildRun(tempRepo) {
        let run = buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-fix-pass");
        run = addImplementationEvidence(runtimeModule, run);
        run = addTaggedProcedures(run, "implementation-review");
        run = addReviewResult(
          runtimeModule,
          run,
          "FIX_REQUIRED",
          "Implementation review requires fixes",
          "procedure:implementation-review"
        );
        return run;
      },
      expectedProcedure: "fix-pass-review"
    },
    {
      name: "VERIFICATION_REVIEW_REQUIRED",
      buildRun(tempRepo) {
        let run = buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-verification-review");
        run = addImplementationEvidence(runtimeModule, run);
        run = addTaggedProcedures(run, "implementation-review");
        run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
        run = addVerificationResult(runtimeModule, run, "pass");
        return run;
      },
      expectedProcedure: "verification-review",
      assertExtra(output) {
        const forbiddenActions = JSON.parse(output.get("forbidden_actions"));
        assert.ok(forbiddenActions.includes("implementation"));
        assert.ok(forbiddenActions.includes("source edits"));
        assert.match(output.get("missing_evidence"), /verification-review/);
      }
    },
    {
      name: "DELIVERY_FACTS_REVIEW_REQUIRED",
      buildRun(tempRepo) {
        let run = buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-delivery-facts-review");
        run = addImplementationEvidence(runtimeModule, run);
        run = addTaggedProcedures(run, "implementation-review");
        run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
        run = addVerificationResult(runtimeModule, run, "pass");
        run = addTaggedProcedures(run, "verification-review");
        return run;
      },
      expectedProcedure: "delivery-facts-review",
      assertExtra(output) {
        const forbiddenActions = JSON.parse(output.get("forbidden_actions"));
        assert.ok(forbiddenActions.includes("implementation"));
        assert.ok(forbiddenActions.includes("source edits"));
      }
    },
    {
      name: "CLOSEOUT_REVIEW_REQUIRED",
      buildRun(tempRepo) {
        return buildPostImplementationBaseRun(runtimeModule, tempRepo, "run-closeout-review");
      },
      expectedProcedure: "phase-closeout-review",
      assertExtra(output) {
        const forbiddenActions = JSON.parse(output.get("forbidden_actions"));
        assert.ok(forbiddenActions.includes("implementation"));
        assert.ok(forbiddenActions.includes("source edits"));
      }
    },
    {
      name: "CLOSEOUT_READY",
      buildRun(tempRepo) {
        let run = addTaggedProcedures(
          buildPostImplementationBaseRun(runtimeModule, tempRepo, "run-closeout-ready"),
          "phase-closeout-review"
        );
        run = addCloseoutReceipt(runtimeModule, run, "READY");
        return setLifecycle(run, "active");
      },
      expectedProcedure: "none"
    },
    {
      name: "HARVEST_READY",
      buildRun(tempRepo) {
        let run = addTaggedProcedures(
          buildPostImplementationBaseRun(runtimeModule, tempRepo, "run-harvest-ready"),
          "phase-closeout-review"
        );
        run = addCloseoutReceipt(runtimeModule, run, "READY");
        return setLifecycle(run, "closed");
      },
      expectedProcedure: "none"
    },
    {
      name: "RUN_HARVESTED",
      buildRun(tempRepo) {
        let run = addTaggedProcedures(
          buildPostImplementationBaseRun(runtimeModule, tempRepo, "run-harvested"),
          "phase-closeout-review"
        );
        run = addCloseoutReceipt(runtimeModule, run, "READY");
        return setLifecycle(run, "harvested", { harvested_at: "2026-05-25T00:18:00.000Z" });
      },
      expectedProcedure: "none"
    },
    {
      name: "RUN_DISCARDED",
      buildRun(tempRepo) {
        const run = buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-discarded");
        return setLifecycle(run, "discarded", { discard_reason: "Manual discard decision" });
      },
      expectedProcedure: "none"
    }
  ];

  for (const scenario of scenarios) {
    const tempRepo = createPhase237Repo(`codex-harness-phase23-7-${scenario.name.toLowerCase()}-`);
    const run = scenario.buildRun(tempRepo);
    runtimeModule.validateRuntimeRun(run);
    writeRuntimeRunFixture(tempRepo, run);
    materializeProcedureEvidenceFiles(tempRepo, run);

    const output = runOperatorStatus(tempRepo, "--run", run.run_id);
    assertProjectedStage(output, scenario.name, scenario.expectedProcedure);
    scenario.assertExtra?.(output);
  }
});

test("phase 23.7 operator status does not route delivery-facts review findings into fix-pass", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-delivery-facts-findings-");
  let run = buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-delivery-facts-findings");

  run = addImplementationEvidence(runtimeModule, run);
  run = addTaggedProcedures(run, "implementation-review");
  run = addReviewResult(runtimeModule, run, "PASS", "Implementation review passed", "procedure:implementation-review");
  run = addVerificationResult(runtimeModule, run, "pass");
  run = addTaggedProcedures(run, "verification-review", "delivery-facts-review");
  run = addReviewResult(
    runtimeModule,
    run,
    "FIX_REQUIRED",
    "Delivery facts review requires recorded PR and CI facts",
    "procedure:delivery-facts-review"
  );

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeProcedureEvidenceFiles(tempRepo, run);

  const output = runOperatorStatus(tempRepo, "--run", run.run_id);
  assertProjectedStage(output, "DELIVERY_FACTS_REVIEW_REQUIRED", "delivery-facts-review");
  assert.match(output.get("missing_evidence"), /delivery facts/);
});

test("phase 23.7 operator status preserves implementation continuity after later-stage evidence on a clean worktree", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-clean-worktree-continuity-");
  let run = buildPostApprovalBaseRun(runtimeModule, tempRepo, "run-clean-worktree-continuity");

  run = addTaggedProcedures(run, "implementation-review");
  run = addReviewResult(runtimeModule, run, "FIX_REQUIRED", "Implementation review requires follow-up", "procedure:implementation-review");
  run = addTaggedProcedures(run, "fix-pass-review");
  run = addReviewResult(runtimeModule, run, "PASS", "Fix-pass Review passed", "procedure:fix-pass-review");
  run = addVerificationResult(runtimeModule, run, "pass", "Verification passed");
  run = addTaggedProcedures(run, "verification-review");

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeProcedureEvidenceFiles(tempRepo, run);

  const output = runOperatorStatus(tempRepo, "--run", run.run_id);
  assertProjectedStage(output, "DELIVERY_FACTS_REVIEW_REQUIRED", "delivery-facts-review");
  assert.match(output.get("missing_evidence"), /delivery facts/);
});

test("phase 23.7 operator status projects RUN_QUARANTINED without creating runtime side effects", () => {
  const { runtimeModule, stagingModule } = loadBuiltModules();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-quarantined-");
  const run = createBaseRun(runtimeModule, tempRepo, "run-quarantined");
  const paths = stagingModule.resolveMemoryDbPaths(tempRepo, tempRepo, run.run_id);

  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeProcedureEvidenceFiles(tempRepo, run);
  seedQuarantineState(stagingModule, tempRepo, run.run_id);
  const before = snapshotRepoFiles(tempRepo);

  const dryRunOutput = runOperatorStatus(tempRepo, "--run", run.run_id, "--dry-run");
  const output = runOperatorStatus(tempRepo, "--run", run.run_id);
  const after = snapshotRepoFiles(tempRepo);

  assert.deepEqual(after, before, "operator status must not create SQLite side effects, runtime artifacts, preview runs, or persisted context");
  assert.equal(fs.existsSync(`${paths.stagingDbPath}-wal`), false);
  assert.equal(fs.existsSync(`${paths.stagingDbPath}-shm`), false);
  assert.equal(fs.existsSync(`${paths.projectDbPath}-wal`), false);
  assert.equal(fs.existsSync(`${paths.projectDbPath}-shm`), false);
  assertProjectedStage(dryRunOutput, "RUN_QUARANTINED", "none");
  assertProjectedStage(output, "RUN_QUARANTINED", "none");
  assert.ok(readNotes(output).some((note) => note === "quarantined_payloads: 1"));
});

test("phase 23.7 operator status does not use installed-layer prompt review or verifier fallbacks", () => {
  const { runtimeModule } = loadBuiltModules();
  const tempRepo = createPhase237Repo("codex-harness-phase23-7-installed-layer-");

  fs.mkdirSync(path.join(tempRepo, ".harness", "tasks", "task-installed"), { recursive: true });
  writeText(path.join(tempRepo, ".harness", "install.json"), "{}\n");
  writeText(path.join(tempRepo, ".harness", "tasks", "task-installed", "prompt-plan.md"), "installed prompt\n");
  writeText(path.join(tempRepo, ".harness", "tasks", "task-installed", "review.json"), "{\"result\":\"PASS\"}\n");
  writeText(path.join(tempRepo, ".harness", "tasks", "task-installed", "verifier.json"), "{\"result\":\"pass\"}\n");

  let run = createBaseRun(runtimeModule, tempRepo, "run-installed-layer");
  run = addTaggedProcedures(run, "task-intake");
  runtimeModule.validateRuntimeRun(run);
  writeRuntimeRunFixture(tempRepo, run);
  materializeProcedureEvidenceFiles(tempRepo, run);

  const output = runOperatorStatus(tempRepo, "--run", run.run_id);
  assertProjectedStage(output, "TASK_PROMPT_REQUIRED", "task-prompt-writer");
  assert.match(output.get("missing_evidence"), /task-prompt-writer/);
});
