import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertProductRepoBoundaryState,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
  packageJsonPath,
  productRoot,
  readJson,
  readText,
  removeDirectory,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpm(args, options = {}) {
  return runCommand(getNpmCommand(), args, options);
}

function listFilesRecursively(rootPath) {
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return [];
  }

  const results = [];

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const absolutePath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFilesRecursively(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      results.push(absolutePath);
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function toPortableRelativePath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).replace(/\\/g, "/");
}

function isForbiddenPackedPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const forbiddenPrefixes = [
    ".git/",
    "node_modules/",
    ".harness/",
    ".codex/",
    ".agents/",
    "tests/",
    "src/",
    "docs/",
    "tasks/",
    "prompts/",
    "scripts/",
    "logs/",
    "migrations/"
  ];

  if (
    normalized === "TASK.md" ||
    normalized === "AGENTS.md" ||
    normalized === "README_START_HERE.md" ||
    normalized === ".env" ||
    normalized.endsWith(".tgz")
  ) {
    return true;
  }

  if (normalized.startsWith(".env.")) {
    return true;
  }

  return forbiddenPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function readPackDryRun() {
  const result = runNpm(["pack", "--dry-run", "--json"]);
  assertSuccess(result, "npm pack --dry-run --json");

  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0].files), "pack output must include files");
  return parsed[0];
}

test("phase 22 package metadata uses the explicit packaging allowlist and canonical repository URL", () => {
  ensureBuiltCli();

  const packageJson = readJson(packageJsonPath);
  assert.deepEqual(packageJson.files, ["bin", "dist", "schemas", "README.md"]);
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/Lionheart-code/codex-harness.git"
  });
});

test("phase 22 release dry run succeeds without mutating tracked product-repo state", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const result = runNpm(["run", "release:dry-run"]);
  const afterStatus = getGitStatus(productRoot);

  assertSuccess(result, "npm run release:dry-run");
  assert.equal(afterStatus, beforeStatus, "release:dry-run changed tracked product-repo git status");
  assert.match(result.stdout, /Packed tarball installed and CLI started successfully/);
});

test("phase 22 npm pack dry run includes required runtime files and excludes forbidden paths", () => {
  ensureBuiltCli();

  const packInfo = readPackDryRun();
  const packedFiles = packInfo.files.map((entry) => entry.path.replace(/\\/g, "/"));
  const packedFileSet = new Set(packedFiles);
  const requiredPaths = [
    "package.json",
    "README.md",
    "bin/ch",
    ...listFilesRecursively(path.join(productRoot, "dist")).map((filePath) => toPortableRelativePath(productRoot, filePath)),
    ...listFilesRecursively(path.join(productRoot, "schemas")).map((filePath) =>
      toPortableRelativePath(productRoot, filePath)
    )
  ];

  const missingPaths = requiredPaths.filter((relativePath) => !packedFileSet.has(relativePath));
  const forbiddenPaths = packedFiles.filter((relativePath) => isForbiddenPackedPath(relativePath));
  const packedBinEntry = packInfo.files.find((entry) => entry.path.replace(/\\/g, "/") === "bin/ch");

  assert.deepEqual(missingPaths, [], `missing packed runtime paths:\n${missingPaths.join("\n")}`);
  assert.deepEqual(forbiddenPaths, [], `forbidden packed paths present:\n${forbiddenPaths.join("\n")}`);
  assert.ok(packedBinEntry, "bin/ch must be present in the packed tarball");

  if (process.platform !== "win32") {
    assert.notEqual(packedBinEntry.mode & 0o111, 0, `packed bin/ch is not executable: ${packedBinEntry.mode}`);
  }
});

test("phase 22 packed-install smoke succeeds from the generated tarball", () => {
  ensureBuiltCli();

  const result = runCommand(process.execPath, [path.join(productRoot, "scripts", "smoke-packed-install.mjs")]);
  assertSuccess(result, "packed-install smoke");
  assert.match(result.stdout, /Packed tarball installed and CLI started successfully/);
});

test("phase 22 acceptance runner fails closed when no acceptance tests are found", () => {
  const emptyAcceptanceDir = createTempDirectory("codex-harness-phase22-empty-acceptance-");
  tempDirectories.push(emptyAcceptanceDir);

  const result = runCommand(process.execPath, [path.join(productRoot, "scripts", "run-acceptance.mjs")], {
    env: {
      CODEX_HARNESS_ACCEPTANCE_DIR: emptyAcceptanceDir
    }
  });

  assertFailure(result, "empty acceptance suite");
  assert.match(result.stderr, /No acceptance tests found/);
});

test("phase 22 acceptance runner times out with clear diagnostics for hanging acceptance suites", () => {
  const hangingAcceptanceDir = createTempDirectory("codex-harness-phase22-hanging-acceptance-");
  tempDirectories.push(hangingAcceptanceDir);
  writeText(
    path.join(hangingAcceptanceDir, "hang.test.mjs"),
    'import { test } from "node:test";\n\ntest("hangs", async () => {\n  await new Promise(() => {});\n});\n'
  );

  const result = runCommand(process.execPath, [path.join(productRoot, "scripts", "run-acceptance.mjs")], {
    env: {
      CODEX_HARNESS_ACCEPTANCE_DIR: hangingAcceptanceDir,
      CODEX_HARNESS_ACCEPTANCE_TIMEOUT_MS: "1500"
    }
  });

  assertFailure(result, "hanging acceptance suite timeout");
  assert.match(result.stderr, /Acceptance suite timed out after 1500ms/);
});

test("phase 22 CI workflow is least-privilege and publish-free", () => {
  const workflowPath = path.join(productRoot, ".github", "workflows", "ci.yml");
  const workflowText = readText(workflowPath);

  assert.match(workflowText, /pull_request:/);
  assert.match(workflowText, /push:\n\s+branches:\n\s+- main/);
  assert.match(workflowText, /timeout-minutes:\s+45/);
  assert.match(workflowText, /permissions:\n\s+contents: read/);
  assert.match(workflowText, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflowText, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(workflowText, /node-version:\s+22/);
  assert.match(workflowText, /npm ci/);
  assert.match(workflowText, /npm run build/);
  assert.match(workflowText, /npm test/);
  assert.match(workflowText, /npm run test:acceptance/);
  assert.match(workflowText, /npm run release:dry-run/);
  assert.doesNotMatch(workflowText, /id-token:\s*write/);
  assert.doesNotMatch(workflowText, /npm publish/);
  assert.doesNotMatch(workflowText, /NPM_TOKEN|NODE_AUTH_TOKEN/);
  assert.doesNotMatch(workflowText, /^\s*cache:/m);
});

test("phase 22 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
