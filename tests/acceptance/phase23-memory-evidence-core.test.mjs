import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertSuccess,
  configureLocalGitIdentity,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
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

function createPhase23Repo(prefix = "codex-harness-phase23-") {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  configureLocalGitIdentity(tempRepo);
  writeText(path.join(tempRepo, "README.md"), "# phase 23\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  return tempRepo;
}

function createSelfHostingPhase23Repo(prefix = "codex-harness-phase23-self-hosting-") {
  const tempRepo = createPhase23Repo(prefix);
  writeText(
    path.join(tempRepo, "package.json"),
    JSON.stringify(
      {
        name: "codex-harness",
        version: "0.1.0",
        scripts: {
          build: "node -e \"process.stdout.write('build ok\\\\n')\"",
          test: "node -e \"process.stdout.write('test ok\\\\n')\""
        }
      },
      null,
      2
    ) + "\n"
  );
  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      "Implement only: tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md",
      ""
    ].join("\n")
  );
  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  writeText(path.join(tempRepo, "tasks", "PHASE_23_MEMORY_EVIDENCE_CORE.md"), "# Phase 23\n");
  assertSuccess(runCommand("git", ["add", "package.json", "TASK.md", "tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md"], { cwd: tempRepo }), "git add self-hosting files");
  assertSuccess(runCommand("git", ["commit", "-m", "self-hosting setup"], { cwd: tempRepo }), "git commit self-hosting setup");
  return tempRepo;
}

function loadPhase23Modules() {
  ensureBuiltCli();
  return {
    evidenceStore: require(path.join(productRoot, "dist", "core", "evidence-store.js")),
    verificationEvidence: require(path.join(productRoot, "dist", "core", "verification-evidence.js"))
  };
}

async function appendVerifiedSnapshot(store, snapshot) {
  const { buildVerificationSnapshotPayload } = loadPhase23Modules().verificationEvidence;
  await store.append({
    evidenceType: "verified_snapshot",
    scope: {
      target_project_id: snapshot.target_project_id,
      target_root: snapshot.target_root,
      namespace: snapshot.namespace,
      run_id: "run-test",
      phase_id: "23",
      task_path: "tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md"
    },
    producerCommand: "phase23-test",
    provenance: {
      producer: { type: "command", command: "phase23-test" },
      produced_at: snapshot.timestamp,
      reusable: true,
      stale: false,
      sensitivity: "local",
      redaction_status: "not_applicable",
      exportable: false,
      artifact_refs: []
    },
    payload: buildVerificationSnapshotPayload(snapshot)
  });
}

test("phase 23 memory CLI initializes local evidence storage under .harness only", async () => {
  ensureBuiltCli();
  const tempRepo = createPhase23Repo();

  const dryRun = runCli(["memory", "init", "--dry-run"], { cwd: tempRepo });
  assertSuccess(dryRun, "memory init dry-run");
  assert.match(dryRun.stdout, /dry-run: no files were written/);
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness")), false, "dry-run created runtime state");

  const init = runCli(["memory", "init"], { cwd: tempRepo });
  assertSuccess(init, "memory init");
  assert.match(init.stdout, /\.harness[\\/]memory[\\/]project\.sqlite/);
  assert.match(init.stdout, /\.harness[\\/]evidence[\\/]events\.jsonl/);
  assert.match(init.stdout, /\.harness[\\/]evidence[\\/]projection\.sqlite/);

  const ledgerPath = path.join(tempRepo, ".harness", "evidence", "events.jsonl");
  const projectionPath = path.join(tempRepo, ".harness", "evidence", "projection.sqlite");
  const artifactRoot = path.join(tempRepo, ".harness", "artifacts", "sha256");
  const projectDbPath = path.join(tempRepo, ".harness", "memory", "project.sqlite");
  assert.ok(fs.existsSync(ledgerPath), "ledger was not written");
  assert.ok(fs.existsSync(projectionPath), "projection was not written");
  assert.ok(fs.existsSync(artifactRoot), "artifact root was not created");
  assert.ok(fs.existsSync(projectDbPath), "project DB was not written");
  assert.equal(readText(ledgerPath).trim().split(/\r?\n/).length, 1);

  const status = runCli(["memory", "status"], { cwd: tempRepo });
  assertSuccess(status, "memory status");
  assert.match(status.stdout, /project db exists: true/);
  assert.match(status.stdout, /audit ledger:/);
  assert.match(status.stdout, /sqlite adapter: available/);

  const rebuild = runCli(["memory", "rebuild", "--dry-run"], { cwd: tempRepo });
  assertSuccess(rebuild, "memory rebuild dry-run");
  assert.match(rebuild.stdout, /dry-run: no files were written/);
});

test("phase 23 MemoryStore records scoped evidence, artifacts, and rebuildable projection queries", async () => {
  const { evidenceStore } = loadPhase23Modules();
  const tempRepo = createPhase23Repo();
  const store = new evidenceStore.MemoryEvidenceStore(tempRepo);

  await store.init(false);
  const artifact = store.artifacts.write({
    content: "command stdout\n",
    kind: "stdout",
    mediaType: "text/plain",
    producerCommand: "npm test"
  });
  assert.ok(fs.existsSync(path.join(tempRepo, artifact.path)), "artifact content was not stored");
  assert.equal(store.artifacts.verify(artifact).ok, true);

  await store.append({
    evidenceType: "command_result",
    scope: {
      ...store.scope(),
      run_id: "run-scoped",
      phase_id: "23",
      task_path: "tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md"
    },
    producerCommand: "phase23-test",
    provenance: {
      producer: { type: "command", command: "npm test" },
      produced_at: "2026-05-21T00:00:00.000Z",
      reusable: false,
      stale: false,
      sensitivity: "local",
      redaction_status: "not_applicable",
      exportable: false,
      artifact_refs: [artifact]
    },
    payload: {
      summary: "Recorded command result evidence.",
      command: "npm test",
      exit_code: 0
    }
  });

  const lines = readText(path.join(tempRepo, ".harness", "evidence", "events.jsonl"))
    .trim()
    .split(/\r?\n/)
    .map((line) => readJsonFromLine(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[1].scope.target_project_id, store.scope().target_project_id);
  assert.equal(lines[1].scope.target_root, tempRepo);
  assert.equal(lines[1].scope.namespace, "default");
  assert.equal(lines[1].scope.run_id, "run-scoped");

  const runs = await store.runs(10);
  assert.ok(runs.some((run) => run.run_id === "run-scoped"), "projection did not expose scoped run");
  const timeline = await store.show("run-scoped");
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].evidence_type, "command_result");

  const otherNamespace = new evidenceStore.MemoryEvidenceStore(tempRepo, { namespace: "other" });
  await otherNamespace.append({
    evidenceType: "command_result",
    scope: { ...otherNamespace.scope(), run_id: "run-scoped" },
    producerCommand: "phase23-test",
    provenance: {
      producer: { type: "command", command: "npm test" },
      produced_at: "2026-05-21T00:01:00.000Z",
      reusable: false,
      stale: false,
      sensitivity: "local",
      redaction_status: "not_applicable",
      exportable: false,
      artifact_refs: []
    },
    payload: { summary: "Other namespace evidence." }
  });
  assert.equal((await store.show("run-scoped")).length, 1, "default namespace query mixed unrelated evidence");
  assert.equal((await otherNamespace.show("run-scoped")).length, 1, "other namespace evidence was not queryable");
});

function readJsonFromLine(line) {
  return JSON.parse(line);
}

test("phase 23 verification evidence reuse is exact-input-set and invalidates conservatively", async () => {
  const { evidenceStore, verificationEvidence } = loadPhase23Modules();
  const tempRepo = createPhase23Repo();
  const store = new evidenceStore.MemoryEvidenceStore(tempRepo);
  await store.init(false);

  const commands = [{ command: "npm test" }];
  const successResult = [{ command: "npm test", exit_code: 0, duration_ms: 10 }];
  const baseSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands,
    commandResults: successResult,
    timestamp: "2026-05-21T00:00:00.000Z"
  });
  await appendVerifiedSnapshot(store, baseSnapshot);

  const sameSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands,
    commandResults: successResult,
    timestamp: "2026-05-21T00:01:00.000Z"
  });
  const sameDecision = await verificationEvidence.decideLocalVerificationReuse(store, sameSnapshot);
  assert.equal(sameDecision.decision.status, "REUSED");

  fs.appendFileSync(path.join(tempRepo, "README.md"), "tracked change\n", "utf8");
  const trackedChanged = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands,
    commandResults: successResult
  });
  const trackedDecision = await verificationEvidence.decideLocalVerificationReuse(store, trackedChanged);
  assert.equal(trackedDecision.decision.status, "STALE");
  assert.ok(trackedDecision.decision.invalidated_by.includes("changed tracked file"));
  assertSuccess(runCommand("git", ["checkout", "--", "README.md"], { cwd: tempRepo }), "restore README");

  writeText(path.join(tempRepo, "notes.txt"), "first\n");
  const untrackedChanged = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands,
    commandResults: successResult
  });
  const untrackedDecision = await verificationEvidence.decideLocalVerificationReuse(store, untrackedChanged);
  assert.equal(untrackedDecision.decision.status, "STALE");
  assert.ok(untrackedDecision.decision.invalidated_by.includes("changed untracked file"));

  const untrackedNamespaceStore = new evidenceStore.MemoryEvidenceStore(tempRepo, { namespace: "removed-untracked" });
  const untrackedSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    namespace: "removed-untracked",
    commands,
    commandResults: successResult
  });
  await appendVerifiedSnapshot(untrackedNamespaceStore, untrackedSnapshot);
  fs.rmSync(path.join(tempRepo, "notes.txt"));
  const removedUntrackedSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    namespace: "removed-untracked",
    commands,
    commandResults: successResult
  });
  const removedDecision = await verificationEvidence.decideLocalVerificationReuse(untrackedNamespaceStore, removedUntrackedSnapshot);
  assert.equal(removedDecision.decision.status, "STALE");
  assert.ok(removedDecision.decision.invalidated_by.includes("removed untracked file"));

  const differentCommandSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands: [{ command: "npm run build" }],
    commandResults: [{ command: "npm run build", exit_code: 0, duration_ms: 10 }]
  });
  assert.ok(
    verificationEvidence.compareVerifiedSnapshots(baseSnapshot, differentCommandSnapshot).includes("changed command set")
  );

  fs.appendFileSync(path.join(tempRepo, "README.md"), "committed base change\n", "utf8");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README base change");
  assertSuccess(runCommand("git", ["commit", "-m", "base change"], { cwd: tempRepo }), "git commit base change");
  const differentBaseSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands,
    commandResults: successResult
  });
  assert.ok(verificationEvidence.compareVerifiedSnapshots(baseSnapshot, differentBaseSnapshot).includes("different base commit"));

  const otherRoot = createPhase23Repo("codex-harness-phase23-other-root-");
  const otherRootSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: otherRoot,
    commands,
    commandResults: successResult
  });
  assert.ok(verificationEvidence.compareVerifiedSnapshots(baseSnapshot, otherRootSnapshot).includes("different root/worktree"));
});

test("phase 23 failed prior verification and corrupt artifacts cannot be reused", async () => {
  const { evidenceStore, verificationEvidence } = loadPhase23Modules();
  const tempRepo = createPhase23Repo();
  const failedStore = new evidenceStore.MemoryEvidenceStore(tempRepo, { namespace: "failed" });
  await failedStore.init(false);

  const failedSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    namespace: "failed",
    commands: [{ command: "npm test" }],
    commandResults: [{ command: "npm test", exit_code: 1, duration_ms: 10 }]
  });
  await appendVerifiedSnapshot(failedStore, failedSnapshot);
  const failedDecision = await verificationEvidence.decideLocalVerificationReuse(failedStore, failedSnapshot);
  assert.equal(failedDecision.decision.status, "FAILED");
  assert.ok(failedDecision.decision.invalidated_by.includes("failed previous verification"));

  const artifactStore = new evidenceStore.MemoryEvidenceStore(tempRepo, { namespace: "artifact" });
  const artifact = artifactStore.artifacts.write({
    content: "stdout\n",
    kind: "stdout",
    mediaType: "text/plain"
  });
  const artifactSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    namespace: "artifact",
    commands: [{ command: "npm test" }],
    commandResults: [{ command: "npm test", exit_code: 0, duration_ms: 10, stdout_artifact: artifact }]
  });
  await appendVerifiedSnapshot(artifactStore, artifactSnapshot);
  fs.rmSync(path.join(tempRepo, artifact.path));
  const corruptDecision = await verificationEvidence.decideLocalVerificationReuse(artifactStore, artifactSnapshot);
  assert.equal(corruptDecision.decision.status, "STALE");
  assert.ok(corruptDecision.decision.invalidated_by.some((entry) => entry.includes("artifact is missing")));
});

test("phase 23 classifies docs/task-only changes separately and local reuse does not satisfy remote CI", async () => {
  ensureBuiltCli();
  const { verificationEvidence } = loadPhase23Modules();
  const tempRepo = createPhase23Repo();
  fs.mkdirSync(path.join(tempRepo, "docs"), { recursive: true });
  writeText(path.join(tempRepo, "docs", "operator.md"), "# operator docs\n");

  const docsSnapshot = verificationEvidence.captureVerifiedSnapshot({
    targetRoot: tempRepo,
    commands: [{ command: "npm test" }],
    commandResults: [{ command: "npm test", exit_code: 0, duration_ms: 10 }]
  });
  assert.equal(docsSnapshot.change_classification, "docs_task_only");

  writeText(
    path.join(tempRepo, "TASK.md"),
    [
      "# Current Task",
      "",
      "Implement only: tasks/PHASE_23_MEMORY_EVIDENCE_CORE.md",
      ""
    ].join("\n")
  );
  fs.mkdirSync(path.join(tempRepo, "tasks"), { recursive: true });
  writeText(path.join(tempRepo, "tasks", "PHASE_23_MEMORY_EVIDENCE_CORE.md"), "# Phase 23\n");
  assertSuccess(runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo }), "run start");
  const closeout = runCli(["run", "closeout", "--dry-run"], { cwd: tempRepo });
  assertSuccess(closeout, "run closeout dry-run");
  assert.match(closeout.stdout, /Required remote gate Remote CI is missing/);
});

test("phase 23 runtime commands update the projection and self-hosting verification reuses exact evidence", () => {
  ensureBuiltCli();
  const tempRepo = createSelfHostingPhase23Repo();

  const start = runCli(["run", "start", "--task", "TASK.md"], { cwd: tempRepo });
  assertSuccess(start, "run start in self-hosting repo");

  const statusAfterStart = runCli(["memory", "status"], { cwd: tempRepo });
  assertSuccess(statusAfterStart, "memory status after run start");
  assert.match(statusAfterStart.stdout, /project db exists: true/);
  assert.match(statusAfterStart.stdout, /current run: run-0001/);
  assert.match(statusAfterStart.stdout, /audit events: 1/);

  const verifyFirst = runCli(["run", "verify"], { cwd: tempRepo });
  assertSuccess(verifyFirst, "first run verify in self-hosting repo");
  assert.match(verifyFirst.stdout, /verification: pass/);
  assert.match(verifyFirst.stdout, /Self-hosting verification commands passed/);

  const statusAfterVerify = runCli(["memory", "status"], { cwd: tempRepo });
  assertSuccess(statusAfterVerify, "memory status after self-hosting verify");
  assert.match(statusAfterVerify.stdout, /audit projection exists: true/);
  assert.match(statusAfterVerify.stdout, /artifact root: \.harness[\\/]artifacts[\\/]sha256/);

  const runs = runCli(["memory", "runs", "--last", "5"], { cwd: tempRepo });
  assertSuccess(runs, "memory runs after self-hosting verify");
  assert.match(runs.stdout, /run-0001/);

  const show = runCli(["memory", "show", "run-0001"], { cwd: tempRepo });
  assertSuccess(show, "memory show after self-hosting verify");
  assert.match(show.stdout, /command_result/);
  assert.match(show.stdout, /verified_snapshot/);
  assert.match(show.stdout, /verification_result/);

  const verifySecond = runCli(["run", "verify"], { cwd: tempRepo });
  assertSuccess(verifySecond, "second run verify in self-hosting repo");
  assert.match(verifySecond.stdout, /verification: pass/);
  assert.match(verifySecond.stdout, /Local verification evidence reused/);

  const remote = runCli(["run", "remote-status", "--provider", "github", "--status", "pass"], { cwd: tempRepo });
  assertSuccess(remote, "run remote-status in self-hosting repo");
  const showAfterRemote = runCli(["memory", "show", "run-0001"], { cwd: tempRepo });
  assertSuccess(showAfterRemote, "memory show after remote-status");
  assert.match(showAfterRemote.stdout, /remote_ci/);
});

test("phase 23 product repo keeps generated runtime state out of source and package allowlist", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
  const packageJson = readJson(path.join(productRoot, "package.json"));
  assert.deepEqual(packageJson.files, ["bin", "dist", "schemas", "README.md"]);
  assert.equal(getGitStatus(productRoot).includes(".harness/"), false);
});
