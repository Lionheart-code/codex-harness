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
  normalizePathForComparison,
  productRoot,
  readJson,
  readText,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const require = createRequire(import.meta.url);
const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function createInstalledPhase235Repo(prefix = "codex-harness-phase23-5-") {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23.5\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");

  const worktreePath = getTaskWorktree(tempRepo);
  tempDirectories.push(worktreePath);

  return tempRepo;
}

function getTaskRoot(tempRepo) {
  return path.join(tempRepo, ".harness", "tasks", "task-test-task");
}

function getTaskSpecPath() {
  return ".harness/tasks/task-test-task/spec.md";
}

function getTaskWorktree(tempRepo) {
  return readText(path.join(getTaskRoot(tempRepo), "worktree.txt")).trim();
}

function getRunPath(tempRepo, runId = "run-0001") {
  return path.join(tempRepo, ".harness", "runs", runId, "run.json");
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

function writePassReview(tempRepo, summary = "Phase 23.5 review passed.") {
  writeText(
    path.join(getTaskRoot(tempRepo), "review.json"),
    `${JSON.stringify(
      {
        task_id: "task-test-task",
        result: "PASS",
        blockers: [],
        summary,
        mode: "manual",
        created_at: "2026-05-22T00:10:00.000Z"
      },
      null,
      2
    )}\n`
  );
}

function preparePassingInstalledArtifacts(tempRepo) {
  const worktreePath = getTaskWorktree(tempRepo);
  fs.appendFileSync(path.join(worktreePath, "README.md"), "phase 23.5 change\n", "utf8");
  updateChecksConfig(tempRepo, ["git status --short"]);
  assertSuccess(runCli(["capture"], { cwd: tempRepo }), "capture");
  assertSuccess(runCli(["check"], { cwd: tempRepo }), "check");
  writePassReview(tempRepo);
}

function startRun(tempRepo) {
  const result = runCli(["run", "start", "--task", getTaskSpecPath()], { cwd: tempRepo });
  assertSuccess(result, "run start");
  return result;
}

function writeLegacyRuntimeArtifacts(tempRepo, runId = "run-legacy", status = "blocked") {
  const runDirectory = path.join(tempRepo, ".harness", "runs", runId);
  fs.mkdirSync(runDirectory, { recursive: true });
  writeText(
    path.join(runDirectory, "run.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        producer_command: "node bin/ch run start",
        run_id: runId,
        task_path: "TASK.md",
        status,
        created_at: "2026-05-22T00:00:00.000Z",
        updated_at: "2026-05-22T00:00:00.000Z",
        repository: {
          root_path: tempRepo,
          dirty: false
        },
        phase_runs: [],
        steps: [],
        artifacts: [],
        evidence: [],
        findings: [],
        decisions: [],
        approvals: [],
        command_results: [],
        verification_results: [],
        review_results: [],
        required_gates: [],
        remote_checks: [],
        closeout_receipts: []
      },
      null,
      2
    )}\n`
  );
  writeText(
    path.join(tempRepo, ".harness", "runs", "current.json"),
    `${JSON.stringify(
      {
        run_id: runId,
        run_path: `${runId}/run.json`,
        updated_at: "2026-05-22T00:00:00.000Z"
      },
      null,
      2
    )}\n`
  );
}

function writeDeliveryFactsFile(tempRepo, fileName = "delivery-facts.json") {
  const filePath = path.join(tempRepo, fileName);
  writeText(
    filePath,
    `${JSON.stringify(
      {
        facts: [
          {
            fact_kind: "pr",
            source: "github",
            status: "created",
            recorded_at: "2026-05-22T00:11:00.000Z",
            summary: "PR opened for task-test-task.",
            url: "https://example.invalid/pr/123"
          },
          {
            fact_kind: "remote_ci",
            source: "github",
            status: "pass",
            recorded_at: "2026-05-22T00:12:00.000Z",
            summary: "Remote CI passed for task-test-task.",
            external_run_id: "ci-123",
            url: "https://example.invalid/ci/123",
            commit_sha: "abc123",
            excerpt: "All required CI jobs passed."
          },
          {
            fact_kind: "merge_result",
            source: "github",
            status: "merged",
            recorded_at: "2026-05-22T00:13:00.000Z",
            summary: "PR merged for task-test-task.",
            url: "https://example.invalid/pr/123"
          },
          {
            fact_kind: "merge_commit",
            source: "github",
            status: "merged",
            recorded_at: "2026-05-22T00:13:00.000Z",
            summary: "Merge commit recorded for task-test-task.",
            url: "https://example.invalid/commit/abc123",
            commit_sha: "abc123"
          }
        ]
      },
      null,
      2
    )}\n`
  );
  return filePath;
}

function importPassingDeliveryFacts(tempRepo, filePath = writeDeliveryFactsFile(tempRepo)) {
  const result = runCli(
    ["memory", "delivery-facts", "import", "--run", "run-0001", "--file", path.basename(filePath)],
    { cwd: tempRepo }
  );
  assertSuccess(result, "memory delivery-facts import");
  return result;
}

function closeReadyRun(tempRepo) {
  const result = runCli(["run", "closeout", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(result, "run closeout");
  return result;
}

test("phase 23.5 canonical DB paths resolve project authority outside disposable worktrees", () => {
  ensureBuiltCli();
  const { resolveHarnessRoots, resolveMemoryDbPaths } = require(path.join(productRoot, "dist", "core", "run-staging-db.js"));
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-paths-");
  const worktreePath = getTaskWorktree(tempRepo);

  const sourceRoots = resolveHarnessRoots(tempRepo);
  const worktreeRoots = resolveHarnessRoots(worktreePath);
  const worktreePaths = resolveMemoryDbPaths(worktreeRoots.targetRoot, worktreeRoots.projectRoot, "run-0001");

  assert.equal(normalizePathForComparison(sourceRoots.targetRoot), normalizePathForComparison(tempRepo));
  assert.equal(normalizePathForComparison(sourceRoots.projectRoot), normalizePathForComparison(tempRepo));
  assert.equal(normalizePathForComparison(worktreeRoots.targetRoot), normalizePathForComparison(worktreePath));
  assert.equal(normalizePathForComparison(worktreeRoots.projectRoot), normalizePathForComparison(tempRepo));
  assert.notEqual(
    normalizePathForComparison(worktreeRoots.targetRoot),
    normalizePathForComparison(worktreeRoots.projectRoot)
  );
  assert.equal(path.relative(worktreeRoots.projectRoot, worktreePaths.projectDbPath), path.join(".harness", "memory", "project.sqlite"));
  assert.equal(path.relative(worktreeRoots.targetRoot, worktreePaths.stagingDbPath), path.join(".harness", "runs", "run-0001", "staging.sqlite"));
  assert.ok(path.relative(worktreePath, worktreePaths.projectDbPath).startsWith(".."));
});

test("phase 23.5 legacy runtime runs remain loadable without explicit migration", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-legacy-runtime-");

  writeLegacyRuntimeArtifacts(tempRepo, "run-legacy", "blocked");

  const status = runCli(["run", "status"], { cwd: tempRepo });
  assertSuccess(status, "run status on legacy runtime run");
  assert.match(status.stdout, /run id: run-legacy/);
  assert.match(status.stdout, /run mode: normal/);
  assert.match(status.stdout, /lifecycle status: blocked/);
  assert.match(status.stdout, /delivery facts: 0/);
  assert.match(status.stdout, /project root:/);

  const explicitStatus = runCli(["run", "status", "--run", "run-legacy"], { cwd: tempRepo });
  assertSuccess(explicitStatus, "run status --run on legacy runtime run");
  assert.match(explicitStatus.stdout, /run id: run-legacy/);
});

test("phase 23.5 delivery fact import is idempotent and preserves distinct facts", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-delivery-facts-");

  startRun(tempRepo);
  const baseFile = writeDeliveryFactsFile(tempRepo, "delivery-facts-base.json");
  importPassingDeliveryFacts(tempRepo, baseFile);
  importPassingDeliveryFacts(tempRepo, baseFile);

  writeText(
    path.join(tempRepo, "delivery-facts-extra.json"),
    `${JSON.stringify(
      {
        facts: [
          {
            fact_kind: "review",
            source: "github",
            status: "approved",
            recorded_at: "2026-05-22T00:13:00.000Z",
            summary: "External review approved the change.",
            url: "https://example.invalid/review/123"
          }
        ]
      },
      null,
      2
    )}\n`
  );
  assertSuccess(
    runCli(["memory", "delivery-facts", "import", "--run", "run-0001", "--file", "delivery-facts-extra.json"], { cwd: tempRepo }),
    "memory delivery-facts import distinct fact"
  );

  const runStatus = runCli(["run", "status", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(runStatus, "run status after repeated delivery-facts import");
  assert.match(runStatus.stdout, /delivery facts: 5/);

  const run = readJson(getRunPath(tempRepo));
  assert.equal(run.delivery_facts.length, 5);
  assert.equal(new Set(run.delivery_facts.map((fact) => fact.delivery_fact_id)).size, 5);
  assert.equal(run.remote_checks.length, 1);
  assert.equal(run.review_results.length, 1);
});

test("phase 23.5 closeout stays distinct from harvest and blocks worktree deletion until promotion", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-harvest-");
  const worktreePath = getTaskWorktree(tempRepo);

  preparePassingInstalledArtifacts(tempRepo);
  const start = startRun(tempRepo);
  assert.match(start.stdout, /run mode: normal/);
  assert.match(start.stdout, /project db: \.harness[\\/]memory[\\/]project\.sqlite/);
  assert.match(start.stdout, /staging db: \.harness[\\/]runs[\\/]run-0001[\\/]staging\.sqlite/);

  const projectStatus = runCli(["memory", "project", "status"], { cwd: tempRepo });
  assertSuccess(projectStatus, "memory project status");
  assert.match(projectStatus.stdout, /exists: true/);

  const importResult = importPassingDeliveryFacts(tempRepo);
  assert.match(importResult.stdout, /imported facts: 4/);

  const stagingStatus = runCli(["memory", "run", "status", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(stagingStatus, "memory run status");
  assert.match(stagingStatus.stdout, /delivery facts: 4/);
  assert.match(stagingStatus.stdout, /run mode: normal/);

  const closeout = closeReadyRun(tempRepo);
  assert.match(closeout.stdout, /closeout: READY/);

  const closedStatus = runCli(["run", "status", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(closedStatus, "run status after closeout");
  assert.match(closedStatus.stdout, /lifecycle status: closed/);
  assert.match(closedStatus.stdout, /delivery facts: 4/);

  const blockedDelete = runCli(["worktree", "delete", "--run", "run-0001"], { cwd: tempRepo });
  assertFailure(blockedDelete, "worktree delete before harvest");
  assert.match(blockedDelete.stderr, /Harvest, discard, or pass --manual-override <reason>/);

  const harvest = runCli(["memory", "harvest", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(harvest, "memory harvest");
  assert.match(harvest.stdout, /already harvested: false/);
  assert.match(harvest.stdout, /harvest status: promoted/);

  const harvestAgain = runCli(["memory", "harvest", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(harvestAgain, "memory harvest idempotent retry");
  assert.match(harvestAgain.stdout, /already harvested: true/);

  const harvestedRun = readJson(getRunPath(tempRepo));
  assert.equal(harvestedRun.lifecycle_status, "harvested");
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness", "memory", "project.sqlite")), true);

  const deleteAfterHarvest = runCli(["worktree", "delete", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(deleteAfterHarvest, "worktree delete after harvest");
  assert.match(deleteAfterHarvest.stdout, /status: worktree removed/);
  assert.equal(fs.existsSync(worktreePath), false, "worktree path should be removed after harvest");
  assert.equal(fs.existsSync(path.join(getTaskRoot(tempRepo), "worktree.txt")), false, "worktree record should be removed");
});

test("phase 23.5 harvest retry resolves from project authority when staging state is missing", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-harvest-retry-");

  preparePassingInstalledArtifacts(tempRepo);
  startRun(tempRepo);
  importPassingDeliveryFacts(tempRepo, writeDeliveryFactsFile(tempRepo, "delivery-facts-retry.json"));
  closeReadyRun(tempRepo);
  assertSuccess(runCli(["memory", "harvest", "--run", "run-0001"], { cwd: tempRepo }), "initial harvest");

  fs.rmSync(path.join(tempRepo, ".harness", "runs", "run-0001", "staging.sqlite"), { force: true });
  fs.rmSync(path.join(tempRepo, ".harness", "runs", "run-0001", "run.json"), { force: true });

  const retried = runCli(["memory", "harvest", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(retried, "harvest retry after staging removal");
  assert.match(retried.stdout, /already harvested: true/);
  assert.match(retried.stdout, /delivery facts: 4/);
});

test("phase 23.5 discarded runs can be deleted after an explicit discard reason", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-discard-");
  const worktreePath = getTaskWorktree(tempRepo);

  startRun(tempRepo);

  const blockedDelete = runCli(["worktree", "delete", "--run", "run-0001"], { cwd: tempRepo });
  assertFailure(blockedDelete, "worktree delete before discard");
  assert.match(blockedDelete.stderr, /Harvest, discard, or pass --manual-override <reason>/);

  const discard = runCli(
    ["run", "mark-discardable", "--run", "run-0001", "--reason", "superseded by follow-up task"],
    { cwd: tempRepo }
  );
  assertSuccess(discard, "run mark-discardable");
  assert.match(discard.stdout, /discard reason: superseded by follow-up task/);

  const runStatus = runCli(["run", "status", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(runStatus, "run status after discard");
  assert.match(runStatus.stdout, /lifecycle status: discarded/);

  const deleteAfterDiscard = runCli(["worktree", "delete", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(deleteAfterDiscard, "worktree delete after discard");
  assert.match(deleteAfterDiscard.stdout, /lifecycle status: discarded/);
  assert.equal(fs.existsSync(worktreePath), false, "discarded run worktree should be removable");
});

test("phase 23.5 discarded harvest records preserve unresolved counts and payload policy warnings", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-payload-policy-");
  const { RunStagingDatabase, resolveHarnessRoots } = require(path.join(productRoot, "dist", "core", "run-staging-db.js"));
  const { ProjectMemoryDatabase } = require(path.join(productRoot, "dist", "core", "project-memory-db.js"));

  startRun(tempRepo);

  const roots = resolveHarnessRoots(tempRepo);
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, "run-0001");
  staging.storePayload({
    parentRecordId: "manual-payload-policy-test",
    sourceRunId: "run-0001",
    kind: "manual_payload",
    mediaType: "text/plain",
    summary: "oversized quarantined payload",
    content: "x".repeat(300000),
    searchableText: "x".repeat(200),
    boundedExcerpt: "x".repeat(50),
    redactionStatus: "redacted",
    retentionClass: "quarantine"
  });

  const stagingStatus = runCli(["memory", "run", "status", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(stagingStatus, "memory run status after payload policy event");
  assert.match(stagingStatus.stdout, /payload warning threshold: 262144/);
  assert.match(stagingStatus.stdout, /payload policy: oversized=1 \| redacted=1 \| quarantine=1 \| discarded=0/);
  assert.match(stagingStatus.stdout, /payload\(s\) exceed the 262144-byte review threshold/i);
  assert.match(stagingStatus.stdout, /payload\(s\) are marked quarantine/i);

  assertSuccess(
    runCli(["run", "mark-discardable", "--run", "run-0001", "--reason", "manual discard for unresolved blockers"], { cwd: tempRepo }),
    "run mark-discardable for unresolved harvest"
  );
  const harvest = runCli(["memory", "harvest", "--run", "run-0001"], { cwd: tempRepo });
  assertSuccess(harvest, "harvest discarded run with unresolved state");
  assert.doesNotMatch(harvest.stdout, /unresolved count: 0/);
  assert.match(harvest.stdout, /quarantined count: 1/);
  assert.match(harvest.stdout, /redacted count: 1/);

  const projectDb = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);
  const harvestRecord = projectDb.getHarvestRecord("run-0001");
  assert.ok(harvestRecord, "harvest record should exist");
  assert.ok(harvestRecord.unresolved_count > 0, "discarded harvest should retain unresolved blockers");
  assert.equal(harvestRecord.quarantined_count, 1);
});

test("phase 23.5 duplicate harvest promotion is explicit and does not replace prior authority", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-harvest-guard-");
  const { ProjectMemoryDatabase } = require(path.join(productRoot, "dist", "core", "project-memory-db.js"));
  const { resolveHarnessRoots } = require(path.join(productRoot, "dist", "core", "run-staging-db.js"));

  startRun(tempRepo);

  const roots = resolveHarnessRoots(tempRepo);
  const projectDb = new ProjectMemoryDatabase(roots.targetRoot, roots.projectRoot);
  const run = readJson(getRunPath(tempRepo));
  const harvestRecord = {
    harvest_id: "harvest-run-0001",
    run_id: "run-0001",
    project_run_id: "run-0001",
    status: "promoted",
    promoted_at: "2026-05-22T00:20:00.000Z",
    accepted_count: 1,
    discarded_count: 0,
    quarantined_count: 0,
    redacted_count: 0,
    unresolved_count: 0,
    source_task_path: run.task_path,
    source_snapshot: run.source_snapshot ?? "unknown",
    details: {
      accepted_record_kinds: ["run"]
    }
  };

  projectDb.saveAcceptedRun(run, [], harvestRecord);
  assert.throws(
    () => projectDb.saveAcceptedRun(run, [], harvestRecord),
    /Harvest already exists for run run-0001/
  );
});

test("phase 23.5 manual override allows deleting a closed run and records the override reason", () => {
  ensureBuiltCli();
  const tempRepo = createInstalledPhase235Repo("codex-harness-phase23-5-override-");
  const worktreePath = getTaskWorktree(tempRepo);

  preparePassingInstalledArtifacts(tempRepo);
  startRun(tempRepo);
  importPassingDeliveryFacts(tempRepo, writeDeliveryFactsFile(tempRepo, "delivery-facts-override.json"));
  closeReadyRun(tempRepo);

  const manualOverride = runCli(
    ["worktree", "delete", "--run", "run-0001", "--manual-override", "operator cleanup after review"],
    { cwd: tempRepo }
  );
  assertSuccess(manualOverride, "worktree delete with manual override");
  assert.match(manualOverride.stdout, /manual override recorded: true/);

  const run = readJson(getRunPath(tempRepo));
  assert.equal(run.lifecycle_status, "closed");
  assert.equal(run.manual_override_reason, "operator cleanup after review");
  assert.equal(fs.existsSync(worktreePath), false, "manual override should remove the worktree");
});
