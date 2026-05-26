import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const helpersDir = path.dirname(currentFilePath);
export const productRoot = path.resolve(helpersDir, "..", "..");
export const cliEntrypoint = path.join(productRoot, "bin", "ch");
export const packageJsonPath = path.join(productRoot, "package.json");
const defaultTestHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-harness-test-home-"));

export function ensureBuiltCli() {
  const distEntrypoint = path.join(productRoot, "dist", "cli", "index.js");
  assert.ok(
    fs.existsSync(distEntrypoint),
    "Build output is missing. Run `npm run build` before executing acceptance tests."
  );
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: "utf8",
    shell: false,
    input: options.input,
    env: {
      ...process.env,
      HOME: defaultTestHome,
      USERPROFILE: defaultTestHome,
      ...(options.env ?? {})
    }
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

export function runCli(args, options = {}) {
  return runCommand(process.execPath, [cliEntrypoint, ...args], options);
}

export function assertSuccess(result, context) {
  if (result.error) {
    throw result.error;
  }

  assert.equal(
    result.status,
    0,
    `${context} failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

export function assertFailure(result, context) {
  if (result.error) {
    throw result.error;
  }

  assert.notEqual(
    result.status,
    0,
    `${context} unexpectedly succeeded.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

export function getGitStatus(cwd) {
  const result = runCommand("git", ["status", "--short", "--untracked-files=all"], { cwd });
  assertSuccess(result, `git status in ${cwd}`);
  return result.stdout;
}

function getGitTrackedFiles(cwd, relativePath) {
  const result = runCommand("git", ["ls-files", "--", relativePath], { cwd });
  assertSuccess(result, `git ls-files for ${relativePath} in ${cwd}`);
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getIgnoredGitStatus(cwd, relativePath) {
  const result = runCommand("git", ["status", "--ignored", "--short", "--untracked-files=all", "--", relativePath], { cwd });
  assertSuccess(result, `git status --ignored for ${relativePath} in ${cwd}`);
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitStatusMentionsPath(statusText, relativePath) {
  return statusText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => line.endsWith(relativePath) || line.includes(`${relativePath}/`));
}

export function createTempDirectory(prefix = "codex-harness-acceptance-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function configureLocalGitIdentity(cwd) {
  assertSuccess(runCommand("git", ["config", "user.name", "codex-harness-test"], { cwd }), `git config user.name in ${cwd}`);
  assertSuccess(
    runCommand("git", ["config", "user.email", "codex-harness-test@example.invalid"], { cwd }),
    `git config user.email in ${cwd}`
  );
}

export function removeDirectory(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

export function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

export function normalizePathForComparison(targetPath) {
  let resolved;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isPathInside(parentPath, childPath) {
  const normalizedParent = normalizePathForComparison(parentPath);
  const normalizedChild = normalizePathForComparison(childPath);
  const relative = path.relative(normalizedParent, normalizedChild);

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function readPackageVersion() {
  const packageJson = readJson(packageJsonPath);
  assert.equal(typeof packageJson.version, "string");
  return packageJson.version;
}

export function assertProductRepoBoundaryState() {
  const visibleStatus = getGitStatus(productRoot);

  for (const relativePath of [".codex", ".agents", ".harness"]) {
    const trackedFiles = getGitTrackedFiles(productRoot, relativePath);
    assert.deepEqual(trackedFiles, [], `forbidden generated path is tracked in product repo: ${relativePath}`);
    assert.equal(
      gitStatusMentionsPath(visibleStatus, relativePath),
      false,
      `forbidden generated path appears in git status: ${relativePath}`
    );

    if (fs.existsSync(path.join(productRoot, relativePath))) {
      const ignoredStatus = getIgnoredGitStatus(productRoot, relativePath);
      assert.notEqual(ignoredStatus.length, 0, `generated path exists locally but is not ignored: ${relativePath}`);
      assert.equal(
        ignoredStatus.every((line) => line.startsWith("!! ")),
        true,
        `generated path must remain ignored local state: ${relativePath}`
      );
    }
  }

  for (const relativePath of ["schemas", "migrations"]) {
    assert.equal(
      fs.existsSync(path.join(productRoot, relativePath)),
      true,
      `expected product source path to exist in product repo: ${relativePath}`
    );
  }
}
