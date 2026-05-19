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
  const memoryPath = path.join(tempRepo, ".harness", "memory");
  const managedTemplatesPath = path.join(tempRepo, ".harness", "templates", "managed");
  const managedAgentsBlockPath = path.join(managedTemplatesPath, "agents-block.md");
  const managedConfigPath = path.join(managedTemplatesPath, "config.toml");
  const decisionsPath = path.join(tempRepo, ".harness", "memory", "decisions");
  const debtPath = path.join(tempRepo, ".harness", "memory", "debt");
  const summariesPath = path.join(tempRepo, ".harness", "memory", "summaries");
  const governancePath = path.join(tempRepo, ".harness", "governance");
  const governanceReviewsPath = path.join(governancePath, "reviews");
  const governanceProposalsPath = path.join(governancePath, "proposals");
  const governanceMetricsPath = path.join(governancePath, "metrics");
  const governanceChangelogPath = path.join(governancePath, "changelog.md");
  const installJsonPath = path.join(tempRepo, ".harness", "install.json");
  const projectIndexPath = path.join(tempRepo, ".harness", "memory", "project-index.md");
  const debtJsonlPath = path.join(tempRepo, ".harness", "memory", "debt", "debt.jsonl");
  const debtMarkdownPath = path.join(tempRepo, ".harness", "memory", "debt", "debt.md");
  const agentsPath = path.join(tempRepo, "AGENTS.md");

  assert.ok(fs.existsSync(configPath), ".harness/config.toml was not created");
  assert.ok(fs.existsSync(tasksPath), ".harness/tasks was not created");
  assert.ok(fs.statSync(tasksPath).isDirectory(), ".harness/tasks is not a directory");
  assert.ok(fs.existsSync(templatesPath), ".harness/templates was not created");
  assert.ok(fs.statSync(templatesPath).isDirectory(), ".harness/templates is not a directory");
  assert.ok(fs.existsSync(managedTemplatesPath), ".harness/templates/managed was not created");
  assert.ok(fs.statSync(managedTemplatesPath).isDirectory(), ".harness/templates/managed is not a directory");
  assert.ok(fs.existsSync(managedAgentsBlockPath), ".harness/templates/managed/agents-block.md was not created");
  assert.ok(fs.existsSync(managedConfigPath), ".harness/templates/managed/config.toml was not created");
  assert.ok(fs.existsSync(memoryPath), ".harness/memory was not created");
  assert.ok(fs.statSync(memoryPath).isDirectory(), ".harness/memory is not a directory");
  assert.ok(fs.existsSync(decisionsPath), ".harness/memory/decisions was not created");
  assert.ok(fs.statSync(decisionsPath).isDirectory(), ".harness/memory/decisions is not a directory");
  assert.ok(fs.existsSync(debtPath), ".harness/memory/debt was not created");
  assert.ok(fs.statSync(debtPath).isDirectory(), ".harness/memory/debt is not a directory");
  assert.ok(fs.existsSync(summariesPath), ".harness/memory/summaries was not created");
  assert.ok(fs.statSync(summariesPath).isDirectory(), ".harness/memory/summaries is not a directory");
  assert.ok(fs.existsSync(governancePath), ".harness/governance was not created");
  assert.ok(fs.statSync(governancePath).isDirectory(), ".harness/governance is not a directory");
  assert.ok(fs.existsSync(governanceReviewsPath), ".harness/governance/reviews was not created");
  assert.ok(fs.statSync(governanceReviewsPath).isDirectory(), ".harness/governance/reviews is not a directory");
  assert.ok(fs.existsSync(governanceProposalsPath), ".harness/governance/proposals was not created");
  assert.ok(fs.statSync(governanceProposalsPath).isDirectory(), ".harness/governance/proposals is not a directory");
  assert.ok(fs.existsSync(governanceMetricsPath), ".harness/governance/metrics was not created");
  assert.ok(fs.statSync(governanceMetricsPath).isDirectory(), ".harness/governance/metrics is not a directory");
  assert.ok(fs.existsSync(governanceChangelogPath), ".harness/governance/changelog.md was not created");
  assert.ok(fs.existsSync(installJsonPath), ".harness/install.json was not created");
  assert.ok(fs.existsSync(projectIndexPath), ".harness/memory/project-index.md was not created");
  assert.ok(fs.existsSync(debtJsonlPath), ".harness/memory/debt/debt.jsonl was not created");
  assert.ok(fs.existsSync(debtMarkdownPath), ".harness/memory/debt/debt.md was not created");
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
  assert.equal(installMetadata.last_upgrade, undefined);

  const firstInstalledAt = installMetadata.installed_at;
  const secondInstall = runCli(["install"], { cwd: tempRepo });
  assertSuccess(secondInstall, "second install");

  const secondMetadata = readJson(installJsonPath);
  assert.equal(secondMetadata.installed_at, firstInstalledAt, "installed_at changed on reinstall");
  assert.match(secondInstall.stdout, /status: already up to date/);
  assert.match(secondInstall.stdout, /AGENTS\.md action: already up to date/);
});
