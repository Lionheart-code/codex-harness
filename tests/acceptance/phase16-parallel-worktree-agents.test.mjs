import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  productRoot,
  readJson,
  readText,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function createParallelReadyRepo() {
  const tempRepo = createTempDirectory("codex-harness-phase16-");
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  fs.mkdirSync(path.join(tempRepo, "src"), { recursive: true });
  writeText(path.join(tempRepo, "README.md"), "# test\n");
  writeText(path.join(tempRepo, "src", "main.ts"), "export const value = 1;\n");
  assertSuccess(runCommand("git", ["add", "README.md", "src/main.ts"], { cwd: tempRepo }), "git add initial files");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");

  return tempRepo;
}

function createInstalledRepoWithoutTask() {
  const tempRepo = createTempDirectory("codex-harness-phase16-");
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");
  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");
  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");

  return tempRepo;
}

function createTaskWithoutWorktreeRepo() {
  const tempRepo = createInstalledRepoWithoutTask();
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  return tempRepo;
}

function getTaskRoot(tempRepo) {
  return path.join(tempRepo, ".harness", "tasks", "task-test-task");
}

function getTaskWorktree(tempRepo) {
  return readText(path.join(getTaskRoot(tempRepo), "worktree.txt")).trim();
}

function getParallelRoot(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "parallel");
}

function getPlanPath(tempRepo) {
  return path.join(getParallelRoot(tempRepo), "plan.json");
}

function getWorkerPromptPath(tempRepo, workerId) {
  return path.join(getParallelRoot(tempRepo), `${workerId}-prompt.md`);
}

function getIntegratorPromptPath(tempRepo) {
  return path.join(getParallelRoot(tempRepo), "integrator-prompt.md");
}

function runParallelPlan(tempRepo, extraArgs = []) {
  return runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:README.md",
      "--claim",
      "beta:src",
      ...extraArgs
    ],
    { cwd: tempRepo }
  );
}

function updateChecksConfig(tempRepo, commands) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const replacement = [
    "[checks]",
    `commands = ${JSON.stringify(commands)}`,
    ""
  ].join("\n");
  const nextContent = content.replace(/\[checks\]\r?\ncommands = \[[^\n]*\]\r?\n/, replacement);
  writeText(configPath, nextContent);
}

function writeReviewFile(tempRepo, payload) {
  writeText(path.join(getTaskRoot(tempRepo), "review.json"), `${JSON.stringify(payload, null, 2)}\n`);
}

function getValidPassReview() {
  return {
    task_id: "task-test-task",
    result: "PASS",
    blockers: [],
    summary: "Parallel review passed.",
    mode: "manual",
    created_at: "2026-05-18T00:00:00.000Z"
  };
}

function preparePassingIntegratorArtifacts(tempRepo, changedPath = "README.md") {
  const worktreePath = getTaskWorktree(tempRepo);
  fs.appendFileSync(path.join(worktreePath, changedPath), "parallel change\n", "utf8");
  updateChecksConfig(tempRepo, ["git status --short"]);
  assertSuccess(runCli(["capture"], { cwd: tempRepo }), "capture");
  assertSuccess(runCli(["check"], { cwd: tempRepo }), "check");
  writeReviewFile(tempRepo, getValidPassReview());
  assertSuccess(runCli(["report"], { cwd: tempRepo }), "report");
}

test("phase 16 root help and parallel help include the new scaffold commands", () => {
  ensureBuiltCli();

  const rootHelp = runCli(["--help"], { cwd: productRoot });
  assertSuccess(rootHelp, "root help");
  assert.match(rootHelp.stdout, /node bin\/ch parallel --help/);

  const parallelHelp = runCli(["parallel", "--help"], { cwd: productRoot });
  assertSuccess(parallelHelp, "parallel help");
  assert.match(parallelHelp.stdout, /node bin\/ch parallel plan/);
  assert.match(parallelHelp.stdout, /node bin\/ch parallel status/);
  assert.match(parallelHelp.stdout, /node bin\/ch parallel close/);
});

test("phase 16 parallel plan creates worker worktrees, prompts, and an idempotent open plan", () => {
  ensureBuiltCli();

  const tempRepo = createParallelReadyRepo();
  const planResult = runParallelPlan(tempRepo, ["--integrator-claim", "README.md"]);
  assertSuccess(planResult, "parallel plan");
  assert.match(planResult.stdout, /status: parallel plan created/);

  const planPath = getPlanPath(tempRepo);
  assert.ok(fs.existsSync(planPath), `expected plan.json: ${planPath}`);
  assert.ok(fs.existsSync(getIntegratorPromptPath(tempRepo)));
  assert.ok(fs.existsSync(getWorkerPromptPath(tempRepo, "alpha")));
  assert.ok(fs.existsSync(getWorkerPromptPath(tempRepo, "beta")));

  const plan = readJson(planPath);
  assert.equal(plan.status, "open");
  assert.equal(plan.task_id, "task-test-task");
  assert.deepEqual(plan.integrator_claims, ["readme.md"]);
  assert.equal(plan.workers.length, 2);

  const integratorWorktree = getTaskWorktree(tempRepo);

  for (const worker of plan.workers) {
    assert.equal(path.isAbsolute(worker.worktree_path), true);
    assert.notEqual(worker.worktree_path, integratorWorktree);
    assert.equal(worker.worktree_path.startsWith(tempRepo), false, "worker worktree must stay outside source repo");
    assert.equal(fs.existsSync(worker.worktree_path), true);
  }

  const secondPlan = runParallelPlan(tempRepo, ["--integrator-claim", "README.md"]);
  assertSuccess(secondPlan, "parallel plan idempotent");
  assert.match(secondPlan.stdout, /status: parallel plan already exists/);

  const statusResult = runCli(["parallel", "status"], { cwd: tempRepo });
  assertSuccess(statusResult, "parallel status open");
  assert.match(statusResult.stdout, /status: open/);
  assert.match(statusResult.stdout, /alpha/);
  assert.match(statusResult.stdout, /beta/);

  preparePassingIntegratorArtifacts(tempRepo, "README.md");
  const closeResult = runCli(["parallel", "close"], { cwd: tempRepo });
  assertSuccess(closeResult, "parallel close");
  assert.match(closeResult.stdout, /status: closed/);

  const closedPlan = readJson(planPath);
  assert.equal(closedPlan.status, "closed");
  assert.equal(typeof closedPlan.closed_at, "string");

  const closedStatus = runCli(["parallel", "status"], { cwd: tempRepo });
  assertSuccess(closedStatus, "parallel status closed");
  assert.match(closedStatus.stdout, /status: closed/);
});

test("phase 16 parallel plan fails closed on missing task and missing worktree preconditions", () => {
  ensureBuiltCli();

  const noTaskRepo = createInstalledRepoWithoutTask();
  const noTaskResult = runParallelPlan(noTaskRepo);
  assertFailure(noTaskResult, "parallel plan without task");
  assert.match(noTaskResult.stderr, /No tasks found/);

  const noWorktreeRepo = createTaskWithoutWorktreeRepo();
  const noWorktreeResult = runParallelPlan(noWorktreeRepo);
  assertFailure(noWorktreeResult, "parallel plan without worktree");
  assert.match(noWorktreeResult.stderr, /Task worktree is not ready/);
});

test("phase 16 parallel plan fails closed on dirty preconditions and malformed worker layout", () => {
  ensureBuiltCli();

  const dirtySourceRepo = createParallelReadyRepo();
  fs.appendFileSync(path.join(dirtySourceRepo, "README.md"), "dirty source\n", "utf8");
  const dirtySourceResult = runParallelPlan(dirtySourceRepo);
  assertFailure(dirtySourceResult, "parallel plan dirty source");
  assert.match(dirtySourceResult.stderr, /Source checkout is dirty/);

  const dirtyIntegratorRepo = createParallelReadyRepo();
  fs.appendFileSync(path.join(getTaskWorktree(dirtyIntegratorRepo), "README.md"), "dirty worktree\n", "utf8");
  const dirtyIntegratorResult = runParallelPlan(dirtyIntegratorRepo);
  assertFailure(dirtyIntegratorResult, "parallel plan dirty integrator");
  assert.match(dirtyIntegratorResult.stderr, /Integrator task worktree is dirty/);

  const tooFewWorkersRepo = createParallelReadyRepo();
  const tooFewWorkers = runCli(
    ["parallel", "plan", "--worker", "solo", "--claim", "solo:README.md"],
    { cwd: tooFewWorkersRepo }
  );
  assertFailure(tooFewWorkers, "parallel plan too few workers");
  assert.match(tooFewWorkers.stderr, /at least two workers/);

  const duplicateWorkersRepo = createParallelReadyRepo();
  const duplicateWorkers = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "alpha",
      "--claim",
      "alpha:README.md",
      "--claim",
      "alpha:src"
    ],
    { cwd: duplicateWorkersRepo }
  );
  assertFailure(duplicateWorkers, "parallel plan duplicate workers");
  assert.match(duplicateWorkers.stderr, /Duplicate worker id/);

  const missingClaimRepo = createParallelReadyRepo();
  const missingClaim = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:README.md"
    ],
    { cwd: missingClaimRepo }
  );
  assertFailure(missingClaim, "parallel plan missing claim");
  assert.match(missingClaim.stderr, /requires at least one claim/);

  const unknownWorkerClaimRepo = createParallelReadyRepo();
  const unknownWorkerClaim = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:README.md",
      "--claim",
      "gamma:src"
    ],
    { cwd: unknownWorkerClaimRepo }
  );
  assertFailure(unknownWorkerClaim, "parallel plan unknown worker claim");
  assert.match(unknownWorkerClaim.stderr, /unknown worker/);

  const overlappingClaimsRepo = createParallelReadyRepo();
  const overlappingClaims = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:src",
      "--claim",
      "beta:src/main.ts"
    ],
    { cwd: overlappingClaimsRepo }
  );
  assertFailure(overlappingClaims, "parallel plan overlapping claims");
  assert.match(overlappingClaims.stderr, /claims overlap/);

  const outsideClaimRepo = createParallelReadyRepo();
  const outsideClaim = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:README.md",
      "--claim",
      "beta:../outside"
    ],
    { cwd: outsideClaimRepo }
  );
  assertFailure(outsideClaim, "parallel plan outside claim");
  assert.match(outsideClaim.stderr, /stay inside the target repository/);

  const managedClaimRepo = createParallelReadyRepo();
  const managedClaim = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:README.md",
      "--claim",
      "beta:.harness"
    ],
    { cwd: managedClaimRepo }
  );
  assertFailure(managedClaim, "parallel plan managed claim");
  assert.match(managedClaim.stderr, /harness-managed paths/);

  const managedClaimCaseVariantRepo = createParallelReadyRepo();
  const managedClaimCaseVariant = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:README.md",
      "--claim",
      "beta:AGENTS.md"
    ],
    { cwd: managedClaimCaseVariantRepo }
  );
  assertFailure(managedClaimCaseVariant, "parallel plan managed claim case variant");
  assert.match(managedClaimCaseVariant.stderr, /harness-managed paths/);

  const rootClaimRepo = createParallelReadyRepo();
  const rootClaim = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:.",
      "--claim",
      "beta:src"
    ],
    { cwd: rootClaimRepo }
  );
  assertFailure(rootClaim, "parallel plan root claim");
  assert.match(rootClaim.stderr, /stay inside the target repository/);

  const overlappingClaimsCaseVariantRepo = createParallelReadyRepo();
  const overlappingClaimsCaseVariant = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:src",
      "--claim",
      "beta:SRC/main.ts"
    ],
    { cwd: overlappingClaimsCaseVariantRepo }
  );
  assertFailure(overlappingClaimsCaseVariant, "parallel plan overlapping claims case variant");
  assert.match(overlappingClaimsCaseVariant.stderr, /claims overlap/);

  const conflictingPlanRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(conflictingPlanRepo), "initial parallel plan");
  const conflictingPlan = runCli(
    [
      "parallel",
      "plan",
      "--worker",
      "alpha",
      "--worker",
      "beta",
      "--claim",
      "alpha:src",
      "--claim",
      "beta:README.md"
    ],
    { cwd: conflictingPlanRepo }
  );
  assertFailure(conflictingPlan, "parallel plan conflicting layout");
  assert.match(conflictingPlan.stderr, /does not match the requested worker and claim layout/);
});

test("phase 16 parallel status fails when the plan is missing or worker integrity is broken", () => {
  ensureBuiltCli();

  const missingPlanRepo = createParallelReadyRepo();
  const missingPlan = runCli(["parallel", "status"], { cwd: missingPlanRepo });
  assertFailure(missingPlan, "parallel status missing plan");
  assert.match(missingPlan.stderr, /Parallel plan artifact not found/);

  const brokenRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(brokenRepo), "parallel plan");
  const plan = readJson(getPlanPath(brokenRepo));
  removeDirectory(plan.workers[0].worktree_path);

  const brokenStatus = runCli(["parallel", "status"], { cwd: brokenRepo });
  assertFailure(brokenStatus, "parallel status broken worker");
  assert.match(brokenStatus.stdout, /exists=false/);
});

test("phase 16 parallel close fails on missing artifacts, failing verifier, failing review, report gate, and out-of-claim changes", () => {
  ensureBuiltCli();

  const missingArtifactsRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(missingArtifactsRepo), "parallel plan");
  const missingArtifacts = runCli(["parallel", "close"], { cwd: missingArtifactsRepo });
  assertFailure(missingArtifacts, "parallel close missing artifacts");
  assert.match(missingArtifacts.stderr, /requires diff\.patch/);

  const verifierFailRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(verifierFailRepo), "parallel plan");
  fs.appendFileSync(path.join(getTaskWorktree(verifierFailRepo), "README.md"), "fail verifier\n", "utf8");
  updateChecksConfig(verifierFailRepo, ['node -e "process.exit(1)"']);
  assertSuccess(runCli(["capture"], { cwd: verifierFailRepo }), "capture");
  const failingCheck = runCli(["check"], { cwd: verifierFailRepo });
  assertFailure(failingCheck, "check fail");
  writeReviewFile(verifierFailRepo, getValidPassReview());
  assertSuccess(runCli(["report"], { cwd: verifierFailRepo }), "report fail verifier");
  const verifierFailClose = runCli(["parallel", "close"], { cwd: verifierFailRepo });
  assertFailure(verifierFailClose, "parallel close verifier fail");
  assert.match(verifierFailClose.stderr, /verifier result pass/);

  const reviewFailRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(reviewFailRepo), "parallel plan");
  preparePassingIntegratorArtifacts(reviewFailRepo, "README.md");
  writeReviewFile(reviewFailRepo, {
    ...getValidPassReview(),
    result: "FIX_REQUIRED",
    blockers: ["Need more coverage."],
    summary: "Fix required."
  });
  assertSuccess(runCli(["report"], { cwd: reviewFailRepo }), "report review fail");
  const reviewFailClose = runCli(["parallel", "close"], { cwd: reviewFailRepo });
  assertFailure(reviewFailClose, "parallel close review fail");
  assert.match(reviewFailClose.stderr, /review result PASS/);

  const reportGateRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(reportGateRepo), "parallel plan");
  preparePassingIntegratorArtifacts(reportGateRepo, "README.md");
  assertSuccess(
    runCli(
      ["debt", "add", "--title", "high debt", "--type", "technical", "--severity", "high", "--reason", "gate"],
      { cwd: reportGateRepo }
    ),
    "debt add high"
  );
  assertSuccess(runCli(["report"], { cwd: reportGateRepo }), "report gated");
  const reportGateContent = readText(path.join(getTaskRoot(reportGateRepo), "result.md"));
  assert.match(reportGateContent, /DO NOT MERGE/);
  const reportGateClose = runCli(["parallel", "close"], { cwd: reportGateRepo });
  assertFailure(reportGateClose, "parallel close report gate");
  assert.match(reportGateClose.stderr, /READY FOR HUMAN REVIEW/);

  const outsideClaimsRepo = createParallelReadyRepo();
  assertSuccess(
    runCli(
      [
        "parallel",
        "plan",
        "--worker",
        "alpha",
        "--worker",
        "beta",
        "--claim",
        "alpha:src",
        "--claim",
        "beta:docs",
        "--integrator-claim",
        "src"
      ],
      { cwd: outsideClaimsRepo }
    ),
    "parallel plan outside claims"
  );
  preparePassingIntegratorArtifacts(outsideClaimsRepo, "README.md");
  const outsideClaimsClose = runCli(["parallel", "close"], { cwd: outsideClaimsRepo });
  assertFailure(outsideClaimsClose, "parallel close outside claims");
  assert.match(outsideClaimsClose.stderr, /outside declared claims/);
});

test("phase 16 parallel close fails when a worker worktree is dirty", () => {
  ensureBuiltCli();

  const tempRepo = createParallelReadyRepo();
  assertSuccess(runParallelPlan(tempRepo), "parallel plan");
  const plan = readJson(getPlanPath(tempRepo));
  fs.appendFileSync(path.join(plan.workers[0].worktree_path, "README.md"), "dirty worker\n", "utf8");
  preparePassingIntegratorArtifacts(tempRepo, "README.md");

  const closeResult = runCli(["parallel", "close"], { cwd: tempRepo });
  assertFailure(closeResult, "parallel close dirty worker");
  assert.match(closeResult.stderr, /worker worktree is dirty/);
});

test("phase 16 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
