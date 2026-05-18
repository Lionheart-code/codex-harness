import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import {
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

function createReviewReadyRepo() {
  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");

  return tempRepo;
}

function getTaskRoot(tempRepo) {
  return path.join(tempRepo, ".harness", "tasks", "task-test-task");
}

function getWorktreePath(tempRepo) {
  return readText(path.join(getTaskRoot(tempRepo), "worktree.txt")).trim();
}

function getReviewPath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "review.json");
}

function getReviewPromptPath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "review-prompt.md");
}

function getCodexInvocationPath(tempRepo) {
  return path.join(tempRepo, "codex-invoked.txt");
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
  writeText(getReviewPath(tempRepo), `${JSON.stringify(payload, null, 2)}\n`);
}

function getValidManualReview(overrides = {}) {
  return {
    task_id: "task-test-task",
    result: "PASS",
    blockers: [],
    summary: "Manual review passed.",
    mode: "manual",
    created_at: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

function assertReviewValidationFailure(payload, expectedPattern) {
  ensureBuiltCli();

  const tempRepo = createReviewReadyRepo();

  if (typeof payload === "string") {
    writeText(getReviewPath(tempRepo), `${payload}\n`);
  } else {
    writeReviewFile(tempRepo, payload);
  }

  const result = runCli(["review"], { cwd: tempRepo });
  assertFailure(result, "review validation failure");
  assert.match(result.stderr, expectedPattern);
}

function createCapturedRepo() {
  const tempRepo = createReviewReadyRepo();
  const worktreePath = getWorktreePath(tempRepo);
  fs.appendFileSync(path.join(worktreePath, "README.md"), "review change\n", "utf8");
  updateChecksConfig(tempRepo, ["git status --short"]);
  assertSuccess(runCli(["capture"], { cwd: tempRepo }), "capture");
  assertSuccess(runCli(["check"], { cwd: tempRepo }), "check");
  return tempRepo;
}

function installCodexStub(tempRepo, scriptSource) {
  const stubDir = path.join(tempRepo, "stub-bin");
  fs.mkdirSync(stubDir, { recursive: true });
  const scriptPath = path.join(stubDir, "codex-stub.cjs");
  writeText(scriptPath, scriptSource);

  if (process.platform === "win32") {
    writeText(stubDir + "\\codex.cmd", `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
  } else {
    const launcherPath = path.join(stubDir, "codex");
    writeText(launcherPath, `#!/bin/sh\n"${process.execPath}" "${scriptPath}" "$@"\n`);
    fs.chmodSync(launcherPath, 0o755);
  }

  return stubDir;
}

function withPrependedPath(binDir, callback) {
  const previousPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}${path.delimiter}${previousPath}`;

  try {
    return callback();
  } finally {
    process.env.PATH = previousPath;
  }
}

function createInvocationTrackingStub(tempRepo, scriptBody) {
  const invocationPath = getCodexInvocationPath(tempRepo);
  const stubDir = installCodexStub(
    tempRepo,
    [
      "const fs = require('node:fs');",
      `fs.writeFileSync(${JSON.stringify(invocationPath)}, 'invoked', 'utf8');`,
      scriptBody
    ].join("\n")
  );

  return {
    invocationPath,
    stubDir
  };
}

test("phase 14 review help succeeds and prints usage", () => {
  ensureBuiltCli();

  const result = runCli(["review", "--help"], { cwd: productRoot });
  assertSuccess(result, "review help");
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /node bin\/ch review --exec/);
});

test("phase 14 review validates an existing PASS review artifact", () => {
  ensureBuiltCli();

  const tempRepo = createReviewReadyRepo();
  writeReviewFile(tempRepo, getValidManualReview());

  const result = runCli(["review"], { cwd: tempRepo });
  assertSuccess(result, "review manual pass");
  assert.match(result.stdout, /result: PASS/);
  assert.match(result.stdout, /summary: Manual review passed\./);
});

test("phase 14 review fails on invalid JSON", () => {
  ensureBuiltCli();

  const tempRepo = createReviewReadyRepo();
  writeText(getReviewPath(tempRepo), "{not-json}\n");

  const result = runCli(["review"], { cwd: tempRepo });
  assertFailure(result, "review invalid json");
  assert.match(result.stderr, /Invalid review JSON/);
});

test("phase 14 review fails on non-object JSON", () => {
  assertReviewValidationFailure("[]", /expected a JSON object/);
});

test("phase 14 review fails on wrong task_id", () => {
  assertReviewValidationFailure(
    getValidManualReview({ task_id: "task-other-task" }),
    /must match the current task/
  );
});

test("phase 14 review fails on invalid result", () => {
  assertReviewValidationFailure(
    getValidManualReview({ result: "MAYBE" }),
    /must be `PASS` or `FIX_REQUIRED`/
  );
});

test("phase 14 review fails when blockers is not an array", () => {
  assertReviewValidationFailure(
    getValidManualReview({ blockers: "not-an-array" }),
    /must be a string array/
  );
});

test("phase 14 review fails when blockers contain whitespace-only entries", () => {
  assertReviewValidationFailure(
    getValidManualReview({ blockers: ["   "] }),
    /must contain only non-empty strings/
  );
});

test("phase 14 review fails when FIX_REQUIRED has zero blockers", () => {
  assertReviewValidationFailure(
    getValidManualReview({ result: "FIX_REQUIRED", blockers: [], summary: "Needs fixes." }),
    /requires at least one blocker/
  );
});

test("phase 14 review fails when PASS includes blockers", () => {
  assertReviewValidationFailure(
    getValidManualReview({ blockers: ["unexpected blocker"], summary: "Invalid pass review." }),
    /must not include blockers/
  );
});

test("phase 14 review prints blockers and fails on FIX_REQUIRED", () => {
  ensureBuiltCli();

  const tempRepo = createReviewReadyRepo();
  writeReviewFile(
    tempRepo,
    getValidManualReview({
      result: "FIX_REQUIRED",
      blockers: ["Missing acceptance coverage."],
      summary: "Manual review found blockers."
    })
  );

  const result = runCli(["review"], { cwd: tempRepo });
  assertFailure(result, "review blockers");
  assert.match(result.stdout, /result: FIX_REQUIRED/);
  assert.match(result.stdout, /Missing acceptance coverage\./);
});

test("phase 14 report blocks READY FOR HUMAN REVIEW when review blockers exist", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  writeReviewFile(tempRepo, {
    ...getValidManualReview(),
    result: "FIX_REQUIRED",
    blockers: ["Verifier output is incomplete for release."],
    summary: "Review blockers remain."
  });

  const reportResult = runCli(["report"], { cwd: tempRepo });
  assertSuccess(reportResult, "report with review blockers");

  const reportContent = readText(path.join(getTaskRoot(tempRepo), "result.md"));
  assert.match(reportContent, /review\.json/);
  assert.match(reportContent, /Review result: FIX_REQUIRED/);
  assert.match(reportContent, /Review blocker: Verifier output is incomplete for release\./);
  assert.match(reportContent, /DO NOT MERGE/);
  assert.doesNotMatch(reportContent, /- READY FOR HUMAN REVIEW/);
});

test("phase 14 report fails closed on malformed existing review.json", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  writeReviewFile(
    tempRepo,
    getValidManualReview({
      blockers: ["unexpected blocker"],
      summary: "Invalid pass review."
    })
  );

  const result = runCli(["report"], { cwd: tempRepo });
  assertFailure(result, "report malformed review");
  assert.match(result.stderr, /must not include blockers/);
});

test("phase 14 review --exec sends the full multiline prompt through stdin and writes a validated review artifact", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  const receivedPromptPath = path.join(tempRepo, "received-review-prompt.txt");
  const stubDir = installCodexStub(
    tempRepo,
    [
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "const chunks = [];",
      "process.stdin.on('data', (chunk) => chunks.push(chunk));",
      "process.stdin.on('end', () => {",
      `  const prompt = Buffer.concat(chunks).toString('utf8');`,
      "  if (args.length !== 2 || args[0] !== 'exec' || args[1] !== '-') { process.stderr.write('expected exec -\\n'); process.exit(2); }",
      "  if (!prompt.includes('Task ID: task-test-task')) { process.stderr.write('missing task id\\n'); process.exit(3); }",
      "  if (!prompt.includes('\\n\\nOptional agent outputs:\\n')) { process.stderr.write('missing multiline section\\n'); process.exit(4); }",
      "  if (!prompt.includes('Return exactly one JSON object with this shape and no markdown fences:')) { process.stderr.write('missing json instructions\\n'); process.exit(5); }",
      "  if (!prompt.includes('  \"summary\": \"short review summary\"')) { process.stderr.write('missing trailing schema line\\n'); process.exit(6); }",
      `  fs.writeFileSync(${JSON.stringify(receivedPromptPath)}, prompt, 'utf8');`,
      "process.stdout.write(JSON.stringify({",
      "  task_id: 'task-test-task',",
      "  result: 'PASS',",
      "  blockers: [],",
      "  summary: 'Stub review passed.'",
      "}));",
      "});"
    ].join("\n")
  );

  const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
  assertSuccess(result, "review exec pass");
  assert.match(result.stdout, /result: PASS/);

  const promptArtifact = readText(getReviewPromptPath(tempRepo));
  assert.match(promptArtifact, /Optional agent outputs:/);
  assert.match(promptArtifact, /"summary": "short review summary"/);

  const receivedPrompt = readText(receivedPromptPath);
  assert.match(receivedPrompt, /Optional agent outputs:/);
  assert.match(receivedPrompt, /"summary": "short review summary"/);

  const review = readJson(getReviewPath(tempRepo));
  assert.equal(review.task_id, "task-test-task");
  assert.equal(review.result, "PASS");
  assert.equal(review.mode, "exec");
  assert.equal(Array.isArray(review.blockers), true);
  assert.equal(review.blockers.length, 0);
});

test("phase 14 review --exec accepts JSON wrapped in a single markdown code fence", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  const stubDir = installCodexStub(
    tempRepo,
    [
      "const args = process.argv.slice(2);",
      "if (args.length !== 2 || args[0] !== 'exec' || args[1] !== '-') { process.stderr.write('expected exec -\\n'); process.exit(2); }",
      "process.stdout.write(['```json', JSON.stringify({ task_id: 'task-test-task', result: 'PASS', blockers: [], summary: 'Fenced review passed.' }, null, 2), '```'].join('\\n'));"
    ].join("\n")
  );

  const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
  assertSuccess(result, "review exec fenced json");
  assert.match(result.stdout, /result: PASS/);

  const review = readJson(getReviewPath(tempRepo));
  assert.equal(review.result, "PASS");
  assert.equal(review.summary, "Fenced review passed.");
});

test("phase 14 review --exec fails closed on invalid JSON output", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  const stubDir = installCodexStub(
    tempRepo,
    [
      "const args = process.argv.slice(2);",
      "if (args[0] !== 'exec') { process.stderr.write('expected exec\\n'); process.exit(2); }",
      "process.stdout.write('not-json');"
    ].join("\n")
  );

  const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
  assertFailure(result, "review exec invalid json");
  assert.match(result.stderr, /Invalid review JSON/);
  assert.equal(fs.existsSync(getReviewPath(tempRepo)), false);
});

test("phase 14 review --exec fails closed on prose wrapped around fenced JSON", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  const stubDir = installCodexStub(
    tempRepo,
    [
      "const args = process.argv.slice(2);",
      "if (args.length !== 2 || args[0] !== 'exec' || args[1] !== '-') { process.stderr.write('expected exec -\\n'); process.exit(2); }",
      "process.stdout.write(['Here is the review:', '```json', JSON.stringify({ task_id: 'task-test-task', result: 'PASS', blockers: [], summary: 'Should fail.' }, null, 2), '```'].join('\\n'));"
    ].join("\n")
  );

  const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
  assertFailure(result, "review exec prose around fenced json");
  assert.match(result.stderr, /Invalid review JSON/);
  assert.equal(fs.existsSync(getReviewPath(tempRepo)), false);
});

test("phase 14 review --exec fails closed on schema-invalid JSON and preserves an existing valid review", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  writeReviewFile(tempRepo, getValidManualReview());
  const originalReview = readText(getReviewPath(tempRepo));

  const stubDir = installCodexStub(
    tempRepo,
    [
      "const args = process.argv.slice(2);",
      "if (args.length !== 2 || args[0] !== 'exec' || args[1] !== '-') { process.stderr.write('expected exec -\\n'); process.exit(2); }",
      "process.stdout.write(JSON.stringify({",
      "  task_id: 'task-test-task',",
      "  result: 'PASS',",
      "  blockers: ['unexpected blocker'],",
      "  summary: 'Invalid pass review.'",
      "}));"
    ].join("\n")
  );

  const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
  assertFailure(result, "review exec invalid shape");
  assert.match(result.stderr, /must not include blockers/);
  assert.equal(readText(getReviewPath(tempRepo)), originalReview);
});

test("phase 14 review --exec fails closed when the fake executable exits nonzero", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  const stubDir = installCodexStub(
    tempRepo,
    [
      "process.stderr.write('stub exec failed\\n');",
      "process.exit(9);"
    ].join("\n")
  );

  const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
  assertFailure(result, "review exec nonzero exit");
  assert.match(result.stderr, /codex exec failed: stub exec failed/);
  assert.equal(fs.existsSync(getReviewPath(tempRepo)), false);
});

test("phase 14 review --exec fails early when required artifacts are missing and does not invoke codex", () => {
  ensureBuiltCli();

  const requiredArtifacts = [
    { label: "spec.md", relativePath: "spec.md", expectedPattern: /Review requires spec\.md/ },
    { label: "acceptance.md", relativePath: "acceptance.md", expectedPattern: /Review requires acceptance\.md/ },
    { label: "diff.patch", relativePath: "diff.patch", expectedPattern: /Review requires diff\.patch/ },
    { label: "verifier.json", relativePath: "verifier.json", expectedPattern: /Review requires verifier\.json/ }
  ];

  for (const artifact of requiredArtifacts) {
    const tempRepo = createCapturedRepo();
    const taskRoot = getTaskRoot(tempRepo);
    const artifactPath = path.join(taskRoot, artifact.relativePath);
    const { invocationPath, stubDir } = createInvocationTrackingStub(
      tempRepo,
      "process.stdout.write(JSON.stringify({ task_id: 'task-test-task', result: 'PASS', blockers: [], summary: 'Should not run.' }));"
    );

    fs.rmSync(artifactPath, { force: true });

    const result = withPrependedPath(stubDir, () => runCli(["review", "--exec"], { cwd: tempRepo }));
    assertFailure(result, `review exec missing ${artifact.label}`);
    assert.match(result.stderr, artifact.expectedPattern);
    assert.equal(fs.existsSync(invocationPath), false, `codex should not run when ${artifact.label} is missing`);
    assert.equal(fs.existsSync(getReviewPath(tempRepo)), false);
  }
});

test("phase 14 review --exec reports ETIMEDOUT clearly and does not write review.json", () => {
  ensureBuiltCli();

  const tempRepo = createCapturedRepo();
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  const reviewModulePath = path.join(productRoot, "dist", "core", "review.js");
  const reviewModule = require(reviewModulePath);
  const originalSpawnSync = childProcess.spawnSync;

  childProcess.spawnSync = (command, args, options) => {
    if (command === "git") {
      return originalSpawnSync(command, args, options);
    }

    return {
      error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      status: null,
      stdout: "",
      stderr: ""
    };
  };

  try {
    assert.throws(() => reviewModule.runCodexExecReview(tempRepo), /codex exec timed out\./);
    assert.equal(fs.existsSync(getReviewPath(tempRepo)), false);
  } finally {
    childProcess.spawnSync = originalSpawnSync;
  }
});

test("phase 14 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();

  for (const relativePath of [".harness", ".codex", ".agents", "schemas", "migrations"]) {
    assert.equal(
      fs.existsSync(path.join(productRoot, relativePath)),
      false,
      `forbidden generated path exists in product repo: ${relativePath}`
    );
  }
});
