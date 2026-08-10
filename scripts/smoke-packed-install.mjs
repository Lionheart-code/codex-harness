import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIgnoredPlatformMetadata } from "../dist/core/platform-metadata.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const productRoot = path.resolve(scriptsDir, "..");

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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: "utf8",
    shell: false,
    env: options.env ?? process.env
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `stdout:\n${result.stdout ?? ""}`,
        `stderr:\n${result.stderr ?? ""}`
      ].join("\n")
    );
  }

  return result.stdout ?? "";
}

function createIsolatedNpmEnv(tempRoot) {
  const homeDir = path.join(tempRoot, "home");
  const cacheDir = path.join(tempRoot, "npm-cache");
  const userConfigPath = path.join(tempRoot, ".npmrc");

  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(userConfigPath, "", "utf8");

  return {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    npm_config_cache: cacheDir,
    npm_config_userconfig: userConfigPath,
    npm_config_fund: "false",
    npm_config_audit: "false"
  };
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Required ${label} is missing: ${filePath}`);
  }
}

function assertInstalledRuntimeFiles(installedPackageRoot) {
  const requiredFiles = [
    "package.json",
    "README.md",
    "bin/ch",
    ...listFilesRecursively(path.join(productRoot, "dist")).map((filePath) => toPortableRelativePath(productRoot, filePath)),
    ...listFilesRecursively(path.join(productRoot, "schemas")).map((filePath) =>
      toPortableRelativePath(productRoot, filePath)
    )
  ];

  const missingFiles = requiredFiles.filter((relativePath) => {
    const absoluteInstalledPath = path.join(installedPackageRoot, ...relativePath.split("/"));
    return !fs.existsSync(absoluteInstalledPath);
  });

  if (missingFiles.length > 0) {
    throw new Error(`Installed tarball is missing required runtime files:\n- ${missingFiles.join("\n- ")}`);
  }
  const installedFiles = listFilesRecursively(installedPackageRoot)
    .map((filePath) => toPortableRelativePath(installedPackageRoot, filePath));
  const unexpectedFiles = installedFiles.filter((relativePath) => !requiredFiles.includes(relativePath));
  if (unexpectedFiles.length > 0) {
    throw new Error(`Installed tarball has unexpected runtime files:\n- ${unexpectedFiles.join("\n- ")}`);
  }
}

function assertBinShebang(binPath) {
  const firstLine = fs.readFileSync(binPath, "utf8").split(/\r?\n/, 1)[0];

  if (firstLine !== "#!/usr/bin/env node") {
    throw new Error(`Installed bin/ch has invalid shebang: ${JSON.stringify(firstLine)}`);
  }
}

function assertExecutableBit(binPath) {
  if (process.platform === "win32") {
    return;
  }

  const mode = fs.statSync(binPath).mode;
  if ((mode & 0o111) === 0) {
    throw new Error(`Installed bin/ch is not executable. Observed mode: ${mode}`);
  }
}

function main() {
  const distEntrypoint = path.join(productRoot, "dist", "cli", "index.js");
  assertFileExists(distEntrypoint, "build output");

  const packageJson = readPackageJson();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-harness-packed-install-"));

  try {
    const tarballDir = path.join(tempRoot, "tarball");
    const tempProject = path.join(tempRoot, "project");
    fs.mkdirSync(tarballDir, { recursive: true });
    fs.mkdirSync(tempProject, { recursive: true });

    const npmEnv = createIsolatedNpmEnv(tempRoot);
    const packOutput = runCommand(getNpmCommand(), ["pack", "--json", "--pack-destination", tarballDir], {
      cwd: productRoot,
      env: npmEnv
    });

    let packResult;
    try {
      packResult = JSON.parse(packOutput);
    } catch {
      throw new Error(`npm pack --json returned invalid JSON.\n${packOutput}`);
    }

    if (!Array.isArray(packResult) || packResult.length === 0 || typeof packResult[0]?.filename !== "string") {
      throw new Error("npm pack --json returned no tarball metadata.");
    }

    const tarballPath = path.join(tarballDir, packResult[0].filename);
    assertFileExists(tarballPath, "packed tarball");

    runCommand(getNpmCommand(), ["init", "-y"], { cwd: tempProject, env: npmEnv });
    runCommand(getNpmCommand(), ["install", "--ignore-scripts", "--no-package-lock", tarballPath], {
      cwd: tempProject,
      env: npmEnv
    });

    const installedPackageRoot = path.join(tempProject, "node_modules", ...packageJson.name.split("/"));
    const installedBinPath = path.join(installedPackageRoot, "bin", "ch");
    assertFileExists(installedBinPath, "packed bin/ch");
    assertInstalledRuntimeFiles(installedPackageRoot);
    assertBinShebang(installedBinPath);
    assertExecutableBit(installedBinPath);

    for (const args of [["--help"], ["doctor", "platform"], ["doctor", "commands"]]) {
      runCommand(process.execPath, [installedBinPath, ...args], { cwd: tempProject, env: npmEnv });
    }

    console.log(`Packed tarball installed and CLI started successfully from ${packResult[0].filename}.`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
