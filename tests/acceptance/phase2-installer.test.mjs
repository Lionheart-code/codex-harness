import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  readJson,
  readPackageVersion,
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

test("phase 2 install creates the installed layer and reinstall is idempotent", () => {
  ensureBuiltCli();

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  const gitInit = runCommand("git", ["init"], { cwd: tempRepo });
  assertSuccess(gitInit, `git init in ${tempRepo}`);

  const firstInstall = runCli(["install"], { cwd: tempRepo });
  assertSuccess(firstInstall, "first install");

  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const tasksPath = path.join(tempRepo, ".harness", "tasks");
  const templatesPath = path.join(tempRepo, ".harness", "templates");
  const installJsonPath = path.join(tempRepo, ".harness", "install.json");
  const agentsPath = path.join(tempRepo, "AGENTS.md");

  assert.ok(fs.existsSync(configPath), ".harness/config.toml was not created");
  assert.ok(fs.existsSync(tasksPath), ".harness/tasks was not created");
  assert.ok(fs.statSync(tasksPath).isDirectory(), ".harness/tasks is not a directory");
  assert.ok(fs.existsSync(templatesPath), ".harness/templates was not created");
  assert.ok(fs.statSync(templatesPath).isDirectory(), ".harness/templates is not a directory");
  assert.ok(fs.existsSync(installJsonPath), ".harness/install.json was not created");
  assert.ok(fs.existsSync(agentsPath), "AGENTS.md was not created");

  const agentsContent = fs.readFileSync(agentsPath, "utf8");
  assert.match(agentsContent, /<!-- codex-harness:start -->/);
  assert.match(agentsContent, /<!-- codex-harness:end -->/);

  const installMetadata = readJson(installJsonPath);
  const expectedVersion = readPackageVersion();
  assert.equal(installMetadata.harness_version, expectedVersion);
  assert.equal(installMetadata.templates_version, expectedVersion);
  assert.equal(typeof installMetadata.installed_at, "string");
  assert.equal(installMetadata.source, "codex-harness");

  const firstInstalledAt = installMetadata.installed_at;
  const secondInstall = runCli(["install"], { cwd: tempRepo });
  assertSuccess(secondInstall, "second install");

  const secondMetadata = readJson(installJsonPath);
  assert.equal(secondMetadata.installed_at, firstInstalledAt, "installed_at changed on reinstall");
  assert.match(secondInstall.stdout, /status: already up to date/);
  assert.match(secondInstall.stdout, /AGENTS\.md action: already up to date/);
});
