import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
  productRoot,
  removeDirectory,
  runCli,
  runCommand
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function read(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

function createBootstrapFixture(prefix) {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);
  const ignoredSegments = new Set([".agents", ".codex", ".git", ".harness", "dist", "node_modules"]);
  fs.cpSync(productRoot, tempRepo, {
    recursive: true,
    filter(sourcePath) {
      const relativePath = path.relative(productRoot, sourcePath);
      return !relativePath.split(path.sep).some((segment) => ignoredSegments.has(segment) || segment === ".DS_Store");
    }
  });
  const fixturePackage = {
    name: "codex-harness-bootstrap-fixture",
    version: "1.0.0",
    private: true,
    scripts: {
      build: "node -e \"const fs=require('node:fs'); fs.mkdirSync('node_modules',{recursive:true}); fs.mkdirSync('dist/cli',{recursive:true}); fs.writeFileSync('dist/cli/index.js','module.exports = {};\\n')\"",
      "worktree:bootstrap": "npm ci && npm run build"
    }
  };
  const fixtureLock = {
    name: fixturePackage.name,
    version: fixturePackage.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: fixturePackage.name,
        version: fixturePackage.version
      }
    }
  };
  fs.writeFileSync(path.join(tempRepo, "package.json"), `${JSON.stringify(fixturePackage, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(tempRepo, "package-lock.json"), `${JSON.stringify(fixtureLock, null, 2)}\n`, "utf8");
  fs.appendFileSync(path.join(tempRepo, ".gitignore"), "\ndist/\nbootstrap-fixture-output/\n", "utf8");
  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), "git init bootstrap fixture");
  configureLocalGitIdentity(tempRepo);
  assertSuccess(runCommand("git", ["add", "."], { cwd: tempRepo }), "git add bootstrap fixture");
  assertSuccess(runCommand("git", ["commit", "-m", "bootstrap fixture"], { cwd: tempRepo }), "git commit bootstrap fixture");
  return tempRepo;
}

test("phase 23.8.6C2A remains the completed bounded task-materialization predecessor", () => {
  const task = read("tasks/PHASE_23_8_6C2A_COMMIT_BACKED_TASK_MATERIALIZATION_AND_ENVIRONMENT_BOOTSTRAP.md");
  const roadmap = read("docs/IMPLEMENTATION_ROADMAP.md");
  const operations = read("docs/OPERATIONS_PLAN.md");
  const manual = read("docs/HUMAN_OPERATOR_MANUAL.md");
  const stageMap = read("docs/SELF_HOSTING_OPERATOR_STAGE_MAP.md");

  assert.equal(
    read("TASK.md").trim(),
    "# Current Task\n\nImplement only: tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md\n\nDo not implement Phase 24A or later."
  );
  assert.match(task, /^# Phase 23\.8\.6C2A - Commit-Backed Task Materialization and Environment Bootstrap/m);
  assert.match(task, /materialize-next-task[\s\S]*must not start a runtime run/);
  assert.match(task, /Codex Desktop[\s\S]*existing worktree/);
  assert.match(task, /deterministic, repo-owned worktree bootstrap-and-verify path/);
  assert.match(task, /do not copy, serialize, or infer ignored private state/i);
  assert.match(task, /\.worktreeinclude/);
  assert.match(task, /combined architecture\/authority and db-storage\s+conclusion/);
  assert.match(task, /pre-implementation `plan-review`: Sol High/);
  assert.match(task, /post-implementation `implementation-review`: Terra High/);
  assert.match(task, /Terra Medium for docs-consistency, `harness-audit`/);
  assert.match(operations, /23\.8\.6C2 -> 23\.8\.6C2A -> 23\.8\.6D/);
  assert.match(operations, /worktree bootstrap/);
  assert.match(operations, /failed\s+labeled verdict routes to a fix pass/i);
  assert.match(operations, /zero matching owners, normal materialization\s+transactionally creates exactly one canonical installed `TaskState` owner/i);
  assert.doesNotMatch(operations, /fails closed unless exactly one installed TaskState owns/i);
  assert.match(operations, /Materialization never opens a successor run\./);
  assert.match(operations, /Codex Desktop `create_thread`/);
  assert.match(operations, /materialize-next-task[\s\S]*--enter-existing/);
  assert.doesNotMatch(operations, /\(--create\|--enter-existing\)/);
  assert.match(manual, /node bin\/ch worktree bootstrap/);
  assert.match(manual, /fresh combined review before verification/i);
  assert.match(manual, /zero matching owners, normal materialization transactionally\s+creates exactly one installed `TaskState` owner/i);
  assert.doesNotMatch(manual, /requires exactly one installed TaskState/i);
  assert.doesNotMatch(manual, /Until C2A is\s+delivered/);
  assert.match(stageMap, /stop\s+the predecessor before successor\s+implementation work/);
  assert.match(stageMap, /COMBINED_ARCHITECTURE_DB_REVIEW_REQUIRED/);
  assert.match(stageMap, /Codex Desktop[\s\S]*`create_thread`/);
  assert.match(stageMap, /cleanup-prepared-successor/);
  assert.match(stageMap, /HANDOFF_CREATION_FAILED/);
  assert.match(roadmap, /## Phase 23\.8\.6C2A — Commit-Backed Task Materialization and Environment Bootstrap/);
});

test("phase 23.8.6C2A bootstrap uses committed inputs, creates only local setup output, and verifies tracked procedure surfaces", () => {
  ensureBuiltCli();
  const tempRepo = createBootstrapFixture("codex-harness-phase23-8-6c2a-bootstrap-");
  const before = getGitStatus(tempRepo);

  const preview = runCli(["worktree", "bootstrap", "--dry-run"], { cwd: tempRepo });
  assertSuccess(preview, "worktree bootstrap --dry-run");
  assert.match(preview.stdout, /status: preview/);
  assert.match(preview.stdout, /skills\/self-hosting\/procedure-registry\.json/);
  assert.equal(getGitStatus(tempRepo), before, "bootstrap dry-run changed the fixture");

  const bootstrap = runCli(["worktree", "bootstrap"], { cwd: tempRepo });
  assertSuccess(bootstrap, "worktree bootstrap");
  assert.match(bootstrap.stdout, /status: ready/);
  assert.equal(fs.existsSync(path.join(tempRepo, "node_modules")), true);
  assert.equal(fs.existsSync(path.join(tempRepo, "dist", "cli", "index.js")), true);
  assert.equal(fs.existsSync(path.join(tempRepo, "dist", ".codex-harness-worktree-bootstrap.json")), true);
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness")), false, "bootstrap created ignored Harness state");
  assert.equal(fs.existsSync(path.join(tempRepo, ".codex")), false, "bootstrap created Desktop state");
  assert.equal(fs.existsSync(path.join(tempRepo, ".worktreeinclude")), false, "bootstrap created an operator opt-in");

  const verified = runCli(["worktree", "bootstrap", "--verify"], { cwd: tempRepo });
  assertSuccess(verified, "worktree bootstrap --verify after deterministic setup");

  const staleDependencyPath = path.join(tempRepo, "node_modules", "stale-dependency");
  fs.mkdirSync(staleDependencyPath, { recursive: true });
  fs.writeFileSync(path.join(staleDependencyPath, "package.json"), "{\"name\":\"stale-dependency\",\"version\":\"1.0.0\"}\n", "utf8");
  const staleDependencies = runCli(["worktree", "bootstrap", "--verify"], { cwd: tempRepo });
  assertFailure(staleDependencies, "worktree bootstrap --verify with stale dependency state");
  assert.match(staleDependencies.stderr, /installed dependencies do not match the committed package lockfile/i);
  assertSuccess(runCli(["worktree", "bootstrap"], { cwd: tempRepo }), "worktree bootstrap restores stale dependency state");

  fs.appendFileSync(path.join(tempRepo, "README.md"), "\nbootstrap marker freshness\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add bootstrap marker freshness fixture");
  assertSuccess(runCommand("git", ["commit", "-m", "change bootstrap fixture head"], { cwd: tempRepo }), "git commit bootstrap marker freshness fixture");
  const staleOutput = runCli(["worktree", "bootstrap", "--verify"], { cwd: tempRepo });
  assertFailure(staleOutput, "worktree bootstrap --verify with stale generated output");
  assert.match(staleOutput.stderr, /readiness marker does not match committed HEAD/i);

  const markerPath = path.join(tempRepo, "dist", ".codex-harness-worktree-bootstrap.json");
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  marker.head_commit = runCommand("git", ["rev-parse", "HEAD"], { cwd: tempRepo }).stdout.trim();
  fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, "utf8");
  const rewrittenMarker = runCli(["worktree", "bootstrap", "--verify"], { cwd: tempRepo });
  assertFailure(rewrittenMarker, "worktree bootstrap --verify with a rewritten stale marker");
  assert.match(rewrittenMarker.stderr, /readiness marker does not match the committed source tree/i);

  fs.appendFileSync(path.join(tempRepo, "package-lock.json"), "\n");
  const dirtyInput = runCli(["worktree", "bootstrap", "--verify"], { cwd: tempRepo });
  assertFailure(dirtyInput, "worktree bootstrap --verify with dirty lockfile");
  assert.match(dirtyInput.stderr, /package manifest and lockfile must be clean before setup/i);

  const untrackedSurfaceRepo = createBootstrapFixture("codex-harness-phase23-8-6c2a-untracked-surface-");
  const registryPath = "skills/self-hosting/procedure-registry.json";
  assertSuccess(runCommand("git", ["rm", "--cached", registryPath], { cwd: untrackedSurfaceRepo }), "remove registry from fixture index");
  const untrackedSurface = runCli(["worktree", "bootstrap", "--dry-run"], { cwd: untrackedSurfaceRepo });
  assertFailure(untrackedSurface, "worktree bootstrap with untracked registry surface");
  assert.match(untrackedSurface.stderr, /procedure surfaces must be committed tracked files/i);

  const symlinkSurfaceRepo = createBootstrapFixture("codex-harness-phase23-8-6c2a-symlink-surface-");
  const agentsPath = path.join(symlinkSurfaceRepo, "AGENTS.md");
  fs.rmSync(agentsPath);
  fs.symlinkSync("README.md", agentsPath);
  const symlinkSurface = runCli(["worktree", "bootstrap", "--dry-run"], { cwd: symlinkSurfaceRepo });
  assertFailure(symlinkSurface, "worktree bootstrap with a symlinked tracked surface");
  assert.match(symlinkSurface.stderr, /path must not contain a symbolic link/i);

  const symlinkOutputRepo = createBootstrapFixture("codex-harness-phase23-8-6c2a-symlink-output-");
  assertSuccess(runCli(["worktree", "bootstrap"], { cwd: symlinkOutputRepo }), "bootstrap symlink output fixture");
  const relocatedOutputPath = path.join(symlinkOutputRepo, "bootstrap-fixture-output");
  fs.renameSync(path.join(symlinkOutputRepo, "dist"), relocatedOutputPath);
  fs.symlinkSync("bootstrap-fixture-output", path.join(symlinkOutputRepo, "dist"), "dir");
  assertSuccess(runCommand("git", ["add", "-f", "dist"], { cwd: symlinkOutputRepo }), "track symlinked output fixture");
  assertSuccess(runCommand("git", ["commit", "-m", "track symlinked output fixture"], { cwd: symlinkOutputRepo }), "commit symlinked output fixture");
  const symlinkOutput = runCli(["worktree", "bootstrap", "--verify"], { cwd: symlinkOutputRepo });
  assertFailure(symlinkOutput, "worktree bootstrap --verify with a symlinked output path component");
  assert.match(symlinkOutput.stderr, /path must not contain a symbolic link/i);

  const markerSymlinkRepo = createBootstrapFixture("codex-harness-phase23-8-6c2a-symlink-marker-");
  const markerTargetDirectory = createTempDirectory("codex-harness-phase23-8-6c2a-symlink-target-");
  tempDirectories.push(markerTargetDirectory);
  const markerTargetPath = path.join(markerTargetDirectory, "external-marker-target");
  const markerTargetContents = "must not be overwritten\n";
  fs.writeFileSync(markerTargetPath, markerTargetContents, "utf8");
  fs.mkdirSync(path.join(markerSymlinkRepo, "dist"), { recursive: true });
  fs.symlinkSync(markerTargetPath, path.join(markerSymlinkRepo, "dist", ".codex-harness-worktree-bootstrap.json"));
  const markerSymlink = runCli(["worktree", "bootstrap"], { cwd: markerSymlinkRepo });
  assertFailure(markerSymlink, "worktree bootstrap with a pre-existing readiness-marker symlink");
  assert.match(markerSymlink.stderr, /readiness marker cannot be written[\s\S]*symbolic link/i);
  assert.equal(fs.readFileSync(markerTargetPath, "utf8"), markerTargetContents, "bootstrap followed a readiness-marker symlink");
});

test("downstream contracts require C2A and preserve its ownership boundary", () => {
  const d = read("tasks/PHASE_23_8_6D_PROCEDURE_ARTIFACT_PAYLOAD_STORAGE_AND_WORKTREE_RETENTION.md");
  const e = read("tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md");
  const stage = read("tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md");
  const proof = read("tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md");

  assert.match(e, /Complete\. Independently reviewed, accepted, merged, closed out, and harvested/);
  for (const downstream of [stage, proof]) {
    assert.match(downstream, /23\.8\.6C2A/);
  }
  assert.match(d, /C2A/);
  assert.match(d, /No reimplementation of C2A commit-backed task activation/);
  assert.match(stage, /No reimplementation of Phase 23\.8\.6C2A/);
  assert.match(proof, /committed activation[\s\S]*current source snapshot\s+provenance/);
});
