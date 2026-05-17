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
    shell: false
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

export function getGitStatus(cwd) {
  const result = runCommand("git", ["status", "--short", "--untracked-files=all"], { cwd });
  assertSuccess(result, `git status in ${cwd}`);
  return result.stdout;
}

export function createTempDirectory(prefix = "codex-harness-acceptance-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDirectory(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function readPackageVersion() {
  const packageJson = readJson(packageJsonPath);
  assert.equal(typeof packageJson.version, "string");
  return packageJson.version;
}
