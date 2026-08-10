import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIgnoredPlatformMetadata } from "../dist/core/platform-metadata.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const productRoot = path.resolve(scriptsDir, "..");
const EXPECTED_FILES_ALLOWLIST = ["bin", "dist", "schemas", "README.md"];

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function listFilesRecursively(rootPath) {
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return [];
  }

  const results = [];

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (isIgnoredPlatformMetadata(entry.name)) continue;
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

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(productRoot, "package.json"), "utf8"));
}

function runPackDryRun() {
  const result = spawnSync(getNpmCommand(), ["pack", "--dry-run", "--json"], {
    cwd: productRoot,
    encoding: "utf8",
    shell: false,
    env: process.env
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run --json failed.\n${result.stderr}`);
  }

  let parsed;

  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm pack --dry-run --json returned invalid JSON.\n${result.stdout}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0] || !Array.isArray(parsed[0].files)) {
    throw new Error("npm pack --dry-run --json returned no package file listing.");
  }

  return parsed[0];
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

function assertExactFilesAllowlist(packageJson) {
  if (!Array.isArray(packageJson.files)) {
    throw new Error("package.json must define a files allowlist for Phase 22 packaging.");
  }

  const normalized = packageJson.files.map((entry) => String(entry));
  if (JSON.stringify(normalized) !== JSON.stringify(EXPECTED_FILES_ALLOWLIST)) {
    throw new Error(
      `package.json files allowlist must be exactly ${JSON.stringify(EXPECTED_FILES_ALLOWLIST)}.\nFound: ${JSON.stringify(normalized)}`
    );
  }
}

function main() {
  const packageJson = readPackageJson();
  assertExactFilesAllowlist(packageJson);

  const distEntrypoint = path.join(productRoot, "dist", "cli", "index.js");
  if (!fs.existsSync(distEntrypoint)) {
    throw new Error("Build output is missing: dist/cli/index.js");
  }

  const packInfo = runPackDryRun();
  const packedFiles = packInfo.files.map((entry) => entry.path.replace(/\\/g, "/"));
  const comparablePackedFiles = packedFiles.filter((entry) => !isIgnoredPlatformMetadata(entry));
  const packedFileSet = new Set(comparablePackedFiles);

  const requiredPaths = [
    "package.json",
    "README.md",
    "bin/ch",
    ...listFilesRecursively(path.join(productRoot, "dist")).map((filePath) => toPortableRelativePath(productRoot, filePath)),
    ...listFilesRecursively(path.join(productRoot, "schemas")).map((filePath) =>
      toPortableRelativePath(productRoot, filePath)
    )
  ].sort((left, right) => left.localeCompare(right));

  const missingPaths = requiredPaths.filter((relativePath) => !packedFileSet.has(relativePath));
  const unexpectedPaths = comparablePackedFiles.filter((relativePath) => !requiredPaths.includes(relativePath));
  const forbiddenPaths = comparablePackedFiles.filter((relativePath) => isForbiddenPackedPath(relativePath));
  const binEntry = packInfo.files.find((entry) => entry.path.replace(/\\/g, "/") === "bin/ch");

  if (!binEntry) {
    missingPaths.push("bin/ch");
  } else if (process.platform !== "win32" && (binEntry.mode & 0o111) === 0) {
    throw new Error(`Packed bin/ch is not executable. Observed mode: ${binEntry.mode}`);
  }

  if (missingPaths.length > 0 || unexpectedPaths.length > 0 || forbiddenPaths.length > 0) {
    const lines = ["Phase 22 package contents check failed."];

    if (missingPaths.length > 0) {
      lines.push("Missing required packed paths:");
      lines.push(...missingPaths.map((relativePath) => `- ${relativePath}`));
    }

    if (forbiddenPaths.length > 0) {
      lines.push("Forbidden packed paths present:");
      lines.push(...forbiddenPaths.map((relativePath) => `- ${relativePath}`));
    }
    if (unexpectedPaths.length > 0) {
      lines.push("Unexpected packed paths present:");
      lines.push(...unexpectedPaths.map((relativePath) => `- ${relativePath}`));
    }

    throw new Error(lines.join("\n"));
  }

  console.log(`Packed ${packedFiles.length} files and verified required runtime contents.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
