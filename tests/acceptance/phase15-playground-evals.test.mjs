import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  productRoot,
  readJson,
  removeDirectory,
  runCli,
  writeText
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];
const productFixtureDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }

  for (const targetPath of productFixtureDirectories) {
    removeDirectory(targetPath);
  }
});

function createPlaygroundRoot() {
  const baseDir = createTempDirectory("codex-harness-phase15-");
  const playgroundRoot = path.join(baseDir, "playground");
  tempDirectories.push(baseDir);
  return playgroundRoot;
}

function assertRequiredSmokeFields(record) {
  for (const key of [
    "task_id",
    "project",
    "category",
    "mode",
    "pass",
    "time_to_ready_ms",
    "manual_interventions",
    "failed_checks",
    "unsafe_command_blocks",
    "abandoned_worktree",
    "review_usefulness",
    "cost_limit_pressure_by_agent_role"
  ]) {
    assert.ok(Object.hasOwn(record, key), `missing smoke result field: ${key}`);
  }
}

function createProductFixtureDirectory(name) {
  const fixturePath = fs.mkdtempSync(path.join(productRoot, `${name}-`));
  productFixtureDirectories.push(fixturePath);
  return fixturePath;
}

test("phase 15 eval help succeeds and invalid playground roots fail closed", () => {
  ensureBuiltCli();

  const helpResult = runCli(["eval", "--help"], { cwd: productRoot });
  assertSuccess(helpResult, "eval help");
  assert.match(helpResult.stdout, /node bin\/ch eval playground init/);
  assert.match(helpResult.stdout, /node bin\/ch eval playground smoke/);
  assert.match(helpResult.stdout, /node bin\/ch eval playground clean/);

  const unknownScope = runCli(["eval", "unknown"], { cwd: productRoot });
  assertFailure(unknownScope, "eval unknown scope");
  assert.match(unknownScope.stderr, /Unknown eval scope: unknown/);

  const unknownAction = runCli(["eval", "playground", "unknown"], { cwd: productRoot });
  assertFailure(unknownAction, "eval unknown action");
  assert.match(unknownAction.stderr, /Unknown eval playground action: unknown/);

  const productRootRefusal = runCli(["eval", "playground", "init", "--root", "."], { cwd: productRoot });
  assertFailure(productRootRefusal, "eval product root refusal");
  assert.match(productRootRefusal.stderr, /Refusing to manage the product repository as a playground/);

  const parentRefusal = runCli(["eval", "playground", "clean", "--root", ".."], { cwd: productRoot });
  assertFailure(parentRefusal, "eval parent clean refusal");
  assert.match(parentRefusal.stderr, /Refusing to clean the product repository parent/);

  const filesystemRootRefusal = runCli(
    ["eval", "playground", "clean", "--root", path.parse(productRoot).root],
    { cwd: productRoot }
  );
  assertFailure(filesystemRootRefusal, "eval filesystem root clean refusal");
  assert.match(filesystemRootRefusal.stderr, /Refusing to clean a filesystem root/);
});

test("phase 15 eval playground commands fail outside the product repo root", () => {
  ensureBuiltCli();

  const outsideCwd = createTempDirectory("codex-harness-phase15-outside-");
  const outsideRoot = path.join(outsideCwd, "outside-playground");
  tempDirectories.push(outsideCwd);

  for (const args of [
    ["eval", "playground", "init", "--root", outsideRoot],
    ["eval", "playground", "smoke", "--root", outsideRoot],
    ["eval", "playground", "clean", "--root", outsideRoot]
  ]) {
    const result = runCli(args, { cwd: outsideCwd });
    assertFailure(result, `outside product cwd failure: ${args.join(" ")}`);
    assert.match(result.stderr, /must run from the codex-harness product repository root/);
  }

  assert.equal(fs.existsSync(outsideRoot), false, "outside-product eval commands must not create playground state");
});

test("phase 15 init seeds a managed playground, materializes the corpus, and is idempotent", () => {
  ensureBuiltCli();

  const playgroundRoot = createPlaygroundRoot();
  const initResult = runCli(["eval", "playground", "init", "--root", playgroundRoot], { cwd: productRoot });
  assertSuccess(initResult, "eval playground init");
  assert.match(initResult.stdout, /status: playground initialized/);

  assert.ok(fs.existsSync(path.join(playgroundRoot, ".codex-harness-playground.json")));
  assert.ok(fs.existsSync(path.join(playgroundRoot, "python-app", ".git")));
  assert.ok(fs.existsSync(path.join(playgroundRoot, "ts-app", ".git")));

  const corpus = readJson(path.join(playgroundRoot, "eval-corpus.json"));
  assert.equal(Array.isArray(corpus.tasks), true);
  assert.equal(corpus.tasks.length, 20);
  assert.equal(corpus.tasks.filter((task) => task.category === "bugfix").length, 5);
  assert.equal(corpus.tasks.filter((task) => task.category === "feature").length, 5);
  assert.equal(corpus.tasks.filter((task) => task.category === "refactor").length, 5);
  assert.equal(corpus.tasks.filter((task) => task.category === "docs").length, 3);
  assert.equal(corpus.tasks.filter((task) => task.category === "deployment").length, 2);
  assert.equal(corpus.tasks.filter((task) => task.local_smoke === true).length, 4);

  const secondInit = runCli(["eval", "playground", "init", "--root", playgroundRoot], { cwd: productRoot });
  assertSuccess(secondInit, "eval playground init second run");
  assert.match(secondInit.stdout, /status: playground reinitialized/);

  const unmanagedRoot = path.join(path.dirname(playgroundRoot), "unmanaged");
  fs.mkdirSync(unmanagedRoot, { recursive: true });
  writeText(path.join(unmanagedRoot, "keep.txt"), "unmanaged\n");

  const unmanagedResult = runCli(["eval", "playground", "init", "--root", unmanagedRoot], { cwd: productRoot });
  assertFailure(unmanagedResult, "eval playground init unmanaged refusal");
  assert.match(unmanagedResult.stderr, /Refusing to initialize a non-empty unmanaged playground target/);
});

test("phase 15 smoke fails on unmanaged or missing-marker roots without creating smoke results", () => {
  ensureBuiltCli();

  const unmanagedBase = createTempDirectory("codex-harness-phase15-unmanaged-");
  const unmanagedRoot = path.join(unmanagedBase, "playground");
  tempDirectories.push(unmanagedBase);
  fs.mkdirSync(unmanagedRoot, { recursive: true });
  writeText(path.join(unmanagedRoot, "keep.txt"), "not-managed\n");

  const smokeResult = runCli(["eval", "playground", "smoke", "--root", unmanagedRoot], { cwd: productRoot });
  assertFailure(smokeResult, "eval playground smoke unmanaged root");
  assert.match(smokeResult.stderr, /Managed playground marker not found/);
  assert.equal(fs.existsSync(path.join(unmanagedRoot, "smoke-results.json")), false);
  assert.equal(fs.existsSync(path.join(unmanagedRoot, "eval-corpus.json")), false);
  assert.equal(fs.existsSync(path.join(unmanagedRoot, "python-app")), false);
  assert.equal(fs.existsSync(path.join(unmanagedRoot, "ts-app")), false);
});

test("phase 15 clean refuses a managed-looking directory inside the product repo and leaves it intact", () => {
  ensureBuiltCli();

  const fixtureRoot = createProductFixtureDirectory("tmp-phase15-clean-fixture");
  const markerPath = path.join(fixtureRoot, ".codex-harness-playground.json");
  writeText(
    markerPath,
    `${JSON.stringify({ managed_by: "codex-harness", kind: "playground", created_from: "codex-harness" }, null, 2)}\n`
  );
  writeText(path.join(fixtureRoot, "keep.txt"), "inside-product\n");

  const result = runCli(["eval", "playground", "clean", "--root", fixtureRoot], { cwd: productRoot });
  assertFailure(result, "eval playground clean inside product repo refusal");
  assert.match(result.stderr, /Refusing to clean a playground inside the product repository/);
  assert.equal(fs.existsSync(fixtureRoot), true, "fixture directory must remain after refusal");
  assert.equal(fs.existsSync(markerPath), true, "marker file must remain after refusal");

  removeDirectory(fixtureRoot);
});

test("phase 15 smoke preserves artifacts until asserted, then clean removes only the managed playground", () => {
  ensureBuiltCli();

  const playgroundRoot = createPlaygroundRoot();
  const initResult = runCli(["eval", "playground", "init", "--root", playgroundRoot], { cwd: productRoot });
  assertSuccess(initResult, "phase 15 lifecycle init");

  assert.ok(fs.existsSync(path.join(playgroundRoot, ".codex-harness-playground.json")));
  assert.ok(fs.existsSync(path.join(playgroundRoot, "eval-corpus.json")));
  assert.ok(fs.existsSync(path.join(playgroundRoot, "python-app", ".git")));
  assert.ok(fs.existsSync(path.join(playgroundRoot, "ts-app", ".git")));

  const smokeResult = runCli(["eval", "playground", "smoke", "--root", playgroundRoot], { cwd: productRoot });
  assertSuccess(smokeResult, "phase 15 lifecycle smoke");
  assert.match(smokeResult.stdout, /passed: 4/);
  assert.match(smokeResult.stdout, /failed: 0/);

  const smokeResultsPath = path.join(playgroundRoot, "smoke-results.json");
  assert.ok(fs.existsSync(smokeResultsPath), `expected smoke-results.json: ${smokeResultsPath}`);

  const smokeResults = readJson(smokeResultsPath);
  assert.equal(smokeResults.mode, "local_deterministic_smoke");
  assert.equal(Array.isArray(smokeResults.results), true);
  assert.equal(smokeResults.results.length, 4);
  assert.deepEqual(
    smokeResults.results.map((record) => record.task_id),
    [
      "task-fix-greeting-bug",
      "task-add-greeting-feature",
      "task-document-ts-usage",
      "task-playground-safety-lifecycle"
    ]
  );

  for (const record of smokeResults.results) {
    assertRequiredSmokeFields(record);
    assert.equal(record.mode, "local_deterministic_smoke");
    assert.equal(record.manual_interventions, 0);
    assert.equal(record.review_usefulness, null);
    assert.equal(record.cost_limit_pressure_by_agent_role, null);
    assert.equal(record.pass, true);
  }

  const safetyRecord = smokeResults.results.find((record) => record.task_id === "task-playground-safety-lifecycle");
  assert.ok(safetyRecord, "missing safety/lifecycle smoke record");
  assert.equal(safetyRecord.unsafe_command_blocks, 1);

  for (const artifactPath of [
    path.join(playgroundRoot, "python-app", ".harness", "tasks", "task-fix-greeting-bug", "diff.patch"),
    path.join(playgroundRoot, "python-app", ".harness", "tasks", "task-fix-greeting-bug", "verifier.json"),
    path.join(playgroundRoot, "python-app", ".harness", "tasks", "task-fix-greeting-bug", "result.md"),
    path.join(playgroundRoot, "ts-app", ".harness", "tasks", "task-add-greeting-feature", "diff.patch"),
    path.join(playgroundRoot, "ts-app", ".harness", "tasks", "task-add-greeting-feature", "verifier.json"),
    path.join(playgroundRoot, "ts-app", ".harness", "tasks", "task-add-greeting-feature", "result.md"),
    path.join(playgroundRoot, "docs-scenario-target", "ts-app", ".harness", "tasks", "task-document-ts-usage", "diff.patch"),
    path.join(playgroundRoot, "docs-scenario-target", "ts-app", ".harness", "tasks", "task-document-ts-usage", "verifier.json"),
    path.join(playgroundRoot, "docs-scenario-target", "ts-app", ".harness", "tasks", "task-document-ts-usage", "result.md")
  ]) {
    assert.ok(fs.existsSync(artifactPath), `expected scenario artifact: ${artifactPath}`);
  }

  assert.equal(fs.existsSync(path.join(playgroundRoot, "managed-clean-target")), false);
  assert.equal(fs.existsSync(path.join(playgroundRoot, "managed-idempotent-target")), true);
  assert.equal(fs.existsSync(path.join(playgroundRoot, "unmanaged-clean-target")), true);
  assert.equal(fs.existsSync(path.join(playgroundRoot, "unmanaged-init-target")), true);
  assert.ok(fs.existsSync(smokeResultsPath), "smoke-results.json must exist before main clean");

  const cleanResult = runCli(["eval", "playground", "clean", "--root", playgroundRoot], { cwd: productRoot });
  assertSuccess(cleanResult, "phase 15 lifecycle clean");
  assert.match(cleanResult.stdout, /status: playground removed/);
  assert.equal(fs.existsSync(playgroundRoot), false);
});

test("phase 15 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();

  for (const relativePath of [".harness", ".codex", ".agents", "schemas", "migrations"]) {
    assert.equal(
      fs.existsSync(path.join(productRoot, relativePath)),
      false,
      `forbidden generated path exists in product repo: ${relativePath}`
    );
  }
});
