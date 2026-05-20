import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertFailure,
  assertSuccess,
  configureLocalGitIdentity,
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

function createGovernanceReadyRepo() {
  const tempRepo = createTempDirectory("codex-harness-phase17-");
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);

  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");

  return tempRepo;
}

function createUninstalledRepo() {
  const tempRepo = createTempDirectory("codex-harness-phase17-uninstalled-");
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  return tempRepo;
}

function getGovernanceRoot(tempRepo) {
  return path.join(tempRepo, ".harness", "governance");
}

test("phase 17 governance help, review, proposal, metrics, and status stay inside the installed layer", () => {
  ensureBuiltCli();

  const tempRepo = createGovernanceReadyRepo();
  const governanceRoot = getGovernanceRoot(tempRepo);
  const reviewDir = path.join(governanceRoot, "reviews");
  const proposalDir = path.join(governanceRoot, "proposals");
  const metricsPath = path.join(governanceRoot, "metrics", "harness-metrics.json");

  const helpResult = runCli(["governance", "--help"], { cwd: tempRepo });
  assertSuccess(helpResult, "governance help");
  assert.match(helpResult.stdout, /node bin\/ch governance review/);
  assert.match(helpResult.stdout, /node bin\/ch governance proposal/);
  assert.match(helpResult.stdout, /node bin\/ch governance metrics/);
  assert.match(helpResult.stdout, /node bin\/ch governance status/);
  assert.match(helpResult.stdout, /node bin\/ch governance proposal --title <title>/);

  assertSuccess(runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo }), "agent record");
  assertSuccess(
    runCli(
      ["debt", "add", "--title", "governance debt", "--type", "process", "--severity", "low", "--reason", "test"],
      { cwd: tempRepo }
    ),
    "debt add"
  );
  assertSuccess(runCli(["decisions", "add", "--title", "governance decision", "--reason", "test"], { cwd: tempRepo }), "decision add");

  const statusBefore = runCli(["governance", "status"], { cwd: tempRepo });
  assertSuccess(statusBefore, "governance status before artifacts");
  assert.match(statusBefore.stdout, /governance scaffold: present/);
  assert.match(statusBefore.stdout, /reviews: 0/);
  assert.match(statusBefore.stdout, /proposals: 0/);
  assert.match(statusBefore.stdout, /debt: open=1 \| in_progress=0 \| resolved=0 \| accepted=0 \| obsolete=0/);
  assert.match(statusBefore.stdout, /decisions: active=1 \| superseded=0 \| rejected=0/);
  assert.match(statusBefore.stdout, /agent outputs: raw=1 \| accepted=0 \| stale=0 \| rejected=0/);

  const reviewResult = runCli(["governance", "review", "--mode", "weekly"], { cwd: tempRepo });
  assertSuccess(reviewResult, "governance review");
  assert.match(reviewResult.stdout, /mode: weekly/);
  assert.match(reviewResult.stdout, /status: review created/);

  const reviewFiles = fs.readdirSync(reviewDir);
  assert.equal(reviewFiles.length, 1);
  assert.match(reviewFiles[0], /^\d{4}-\d{2}-\d{2}-weekly-harness-review\.md$/);

  const reviewPath = path.join(reviewDir, reviewFiles[0]);
  const reviewContent = readText(reviewPath);
  assert.match(reviewContent, /# Harness Review - weekly - \d{4}-\d{2}-\d{2}/);
  assert.match(reviewContent, /## Evidence/);
  assert.match(reviewContent, /## Findings/);
  assert.match(reviewContent, /node bin\/ch governance proposal/);

  const secondReview = runCli(["governance", "review", "--mode", "weekly"], { cwd: tempRepo });
  assertSuccess(secondReview, "governance review idempotent");
  assert.match(secondReview.stdout, /status: review updated/);
  assert.equal(fs.readdirSync(reviewDir).length, 1, "same-day same-mode review should update the existing file");

  fs.mkdirSync(path.join(tempRepo, "research"), { recursive: true });
  writeText(path.join(tempRepo, "research", "summary.md"), "# Summary\n");

  const proposalResult = runCli(
    ["governance", "proposal", "--title", "Tighten review gate", "--research", "research/summary.md"],
    { cwd: tempRepo }
  );
  assertSuccess(proposalResult, "governance proposal");
  assert.match(proposalResult.stdout, /proposal id: HEP-0001/);
  assert.match(proposalResult.stdout, /research\/summary\.md/);

  const proposalFiles = fs.readdirSync(proposalDir).sort();
  assert.deepEqual(proposalFiles, ["HEP-0001-tighten-review-gate.json", "HEP-0001-tighten-review-gate.md"]);
  const proposalContent = readText(path.join(proposalDir, "HEP-0001-tighten-review-gate.md"));
  assert.match(proposalContent, /# HEP-0001 - Tighten review gate/);
  assert.match(proposalContent, /## Evidence/);
  assert.match(proposalContent, /## Expected Benefit/);
  assert.match(proposalContent, /## Risk/);
  assert.match(proposalContent, /## Rollback Plan/);
  assert.match(proposalContent, /## Acceptance Criteria/);
  assert.match(proposalContent, /research\/summary\.md/);
  const proposalRecord = readJson(path.join(proposalDir, "HEP-0001-tighten-review-gate.json"));
  assert.equal(proposalRecord.schema_version, 1);
  assert.equal(proposalRecord.producer_command, "node bin/ch governance proposal");
  assert.equal(proposalRecord.proposal_id, "HEP-0001");
  assert.equal(proposalRecord.title, "Tighten review gate");
  assert.equal(proposalRecord.status, "proposed");
  assert.equal(proposalRecord.markdown_path, ".harness/governance/proposals/HEP-0001-tighten-review-gate.md");
  assert.deepEqual(proposalRecord.research_inputs, ["research/summary.md"]);

  const metricsResult = runCli(["governance", "metrics"], { cwd: tempRepo });
  assertSuccess(metricsResult, "governance metrics");
  assert.ok(fs.existsSync(metricsPath), `expected metrics file: ${metricsPath}`);

  const metrics = readJson(metricsPath);
  assert.equal(metrics.producer_command, "node bin/ch governance metrics");
  assert.equal(metrics.governance.reviews, 1);
  assert.equal(metrics.governance.proposals, 1);
  assert.equal(metrics.task_artifacts.tasks, 1);
  assert.equal(metrics.memory.debt.open, 1);
  assert.equal(metrics.memory.decisions.active, 1);
  assert.equal(metrics.memory.agent_outputs.raw, 1);

  const statusAfter = runCli(["governance", "status"], { cwd: tempRepo });
  assertSuccess(statusAfter, "governance status after artifacts");
  assert.match(statusAfter.stdout, /reviews: 1/);
  assert.match(statusAfter.stdout, /proposals: 1/);
  assert.match(statusAfter.stdout, /latest review: \.harness[\\/]governance[\\/]reviews[\\/]/);
  assert.match(statusAfter.stdout, /latest proposal: \.harness[\\/]governance[\\/]proposals[\\/]HEP-0001-tighten-review-gate\.md/);
});

test("phase 17 governance fails closed on invalid arguments, missing install state, and product-repo execution", () => {
  ensureBuiltCli();

  const uninstalledRepo = createUninstalledRepo();
  const missingInstall = runCli(["governance", "status"], { cwd: uninstalledRepo });
  assertFailure(missingInstall, "governance status without install");
  assert.match(missingInstall.stderr, /Installed harness layer not found/);

  const tempRepo = createGovernanceReadyRepo();

  const badMode = runCli(["governance", "review", "--mode", "monthly"], { cwd: tempRepo });
  assertFailure(badMode, "governance review bad mode");
  assert.match(badMode.stderr, /Unknown governance review argument/);

  const missingTitle = runCli(["governance", "proposal"], { cwd: tempRepo });
  assertFailure(missingTitle, "governance proposal missing title");
  assert.match(missingTitle.stderr, /requires `--title <title>`/);

  const missingResearch = runCli(
    ["governance", "proposal", "--title", "Missing research", "--research", "missing.md"],
    { cwd: tempRepo }
  );
  assertFailure(missingResearch, "governance proposal missing research");
  assert.match(missingResearch.stderr, /Research input is not a readable file/);

  const metricsArgs = runCli(["governance", "metrics", "--unexpected"], { cwd: tempRepo });
  assertFailure(metricsArgs, "governance metrics bad args");
  assert.match(metricsArgs.stderr, /Unknown governance metrics argument/);

  for (const args of [
    ["governance", "review"],
    ["governance", "proposal", "--title", "product repo"],
    ["governance", "metrics"],
    ["governance", "status"]
  ]) {
    const result = runCli(args, { cwd: productRoot });
    assertFailure(result, `product repo governance refusal: ${args.join(" ")}`);
    assert.match(
      result.stderr,
      /must run in an installed target repository, not the codex-harness product repository/
    );
  }
});

test("phase 17 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
