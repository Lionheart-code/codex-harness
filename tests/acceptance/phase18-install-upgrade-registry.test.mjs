import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
  normalizePathForComparison,
  productRoot,
  readJson,
  readPackageVersion,
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

function createIsolatedHome() {
  const homeDir = createTempDirectory("codex-harness-phase18-home-");
  tempDirectories.push(homeDir);
  return homeDir;
}

function getHomeEnv(homeDir) {
  return { HOME: homeDir, USERPROFILE: homeDir };
}

function getRegistryPath(homeDir) {
  return path.join(homeDir, ".codex-harness", "registry.json");
}

function createInstalledRepo(homeDir, prefix = "codex-harness-phase18-repo-") {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(
    runCli(["install"], {
      cwd: tempRepo,
      env: getHomeEnv(homeDir)
    }),
    `install in ${tempRepo}`
  );

  return tempRepo;
}

test("phase 18 exposes upgrade help and doctor help", () => {
  ensureBuiltCli();

  const upgradeHelp = runCli(["upgrade", "--help"], { cwd: productRoot });
  assertSuccess(upgradeHelp, "upgrade help");
  assert.match(upgradeHelp.stdout, /node bin\/ch upgrade --dry-run/);
  assert.match(upgradeHelp.stdout, /node bin\/ch upgrade$/m);

  const doctorHelp = runCli(["doctor", "--help"], { cwd: productRoot });
  assertSuccess(doctorHelp, "doctor help");
  assert.match(doctorHelp.stdout, /node bin\/ch doctor --all/);
});

test("phase 18 install writes the real optional registry and doctor --all reads that installed project", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir, "codex-harness-phase18-install-registry-");
  const registryPath = getRegistryPath(homeDir);
  const expectedVersion = readPackageVersion();

  assert.ok(fs.existsSync(registryPath), "expected install to create the optional registry file");

  const registry = readJson(registryPath);
  assert.equal(registry.version, 1);
  assert.equal(registry.projects.length, 1);
  assert.equal(
    normalizePathForComparison(registry.projects[0].root_path),
    normalizePathForComparison(tempRepo),
    "registry should record the installed target root"
  );
  assert.equal(registry.projects[0].harness_version, expectedVersion);
  assert.equal(registry.projects[0].templates_version, expectedVersion);
  assert.equal(typeof registry.projects[0].registered_at, "string");
  assert.equal(typeof registry.projects[0].updated_at, "string");

  const doctorAll = runCli(["doctor", "--all"], {
    cwd: productRoot,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(doctorAll, "doctor --all from real install registry");
  assert.match(doctorAll.stdout, /projects: 1/);
  assert.match(doctorAll.stdout, /installed: 1/);
  assert.match(doctorAll.stdout, new RegExp(tempRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(doctorAll.stdout, new RegExp(`harness_version=${expectedVersion}`));
});

test("phase 18 upgrade dry-run is safe and apply is idempotent on a current install", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir);
  const installJsonPath = path.join(tempRepo, ".harness", "install.json");
  const beforeStatus = getGitStatus(tempRepo);
  const beforeMetadata = readJson(installJsonPath);

  const dryRun = runCli(["upgrade", "--dry-run"], {
    cwd: tempRepo,
    env: { HOME: homeDir, USERPROFILE: homeDir }
  });
  const afterDryRunStatus = getGitStatus(tempRepo);

  assertSuccess(dryRun, "upgrade dry-run");
  assert.equal(afterDryRunStatus, beforeStatus, "upgrade --dry-run changed repo status");
  assert.match(dryRun.stdout, /status: already up to date/);

  const applyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: { HOME: homeDir, USERPROFILE: homeDir }
  });
  assertSuccess(applyResult, "upgrade apply on current install");
  assert.match(applyResult.stdout, /status: already up to date/);

  const afterMetadata = readJson(installJsonPath);
  assert.equal(afterMetadata.installed_at, beforeMetadata.installed_at);
  assert.equal(afterMetadata.last_upgrade, undefined);
});

test("phase 18 upgrade fails closed on locally modified managed config", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir);
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const configBackupPath = `${configPath}.codex-harness.bak`;

  fs.appendFileSync(configPath, "\n# local change\n", "utf8");

  const dryRun = runCli(["upgrade", "--dry-run"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertFailure(dryRun, "upgrade dry-run with local config drift");
  assert.match(dryRun.stdout, /status: blocked/);
  assert.match(dryRun.stdout, /config contains local modifications outside the managed baseline/);

  const applyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertFailure(applyResult, "upgrade apply with local config drift");
  assert.equal(fs.existsSync(configBackupPath), false, "blocked upgrade should not create backups");
  assert.match(readText(configPath), /# local change/);
});

test("phase 18 upgrade fails closed on locally modified AGENTS managed block while preserving unrelated user content", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir, "codex-harness-phase18-agents-drift-");
  const agentsPath = path.join(tempRepo, "AGENTS.md");
  const agentsBackupPath = `${agentsPath}.codex-harness.bak`;
  const originalAgents = readText(agentsPath).trim();
  const modifiedBlock = originalAgents.replace(
    "This repository has an installed `codex-harness` layer.",
    "This repository has a locally modified `codex-harness` layer."
  );
  const userWrappedAgents = `# User Notes\n\n${modifiedBlock}\n\n## Footer\n- keep me\n`;

  writeText(agentsPath, userWrappedAgents);

  const dryRun = runCli(["upgrade", "--dry-run"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertFailure(dryRun, "upgrade dry-run with local AGENTS managed-block drift");
  assert.match(dryRun.stdout, /status: blocked/);
  assert.match(dryRun.stdout, /AGENTS\.md managed block contains local modifications/);

  const applyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertFailure(applyResult, "upgrade apply with local AGENTS managed-block drift");
  assert.equal(fs.existsSync(agentsBackupPath), false, "blocked AGENTS upgrade should not create backups");
  assert.equal(readText(agentsPath), userWrappedAgents);
  assert.match(readText(agentsPath), /# User Notes/);
  assert.match(readText(agentsPath), /## Footer/);
});

test("phase 18 upgrade refreshes legacy managed content, preserves unrelated AGENTS text, creates backups, and recreates missing seed files", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir);
  const packageVersion = readPackageVersion();
  const agentsPath = path.join(tempRepo, "AGENTS.md");
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const managedAgentsBlockPath = path.join(tempRepo, ".harness", "templates", "managed", "agents-block.md");
  const managedConfigPath = path.join(tempRepo, ".harness", "templates", "managed", "config.toml");
  const projectIndexPath = path.join(tempRepo, ".harness", "memory", "project-index.md");
  const installJsonPath = path.join(tempRepo, ".harness", "install.json");
  const originalAgents = readText(agentsPath).trim();
  const legacyAgentsBlock = originalAgents.replace(
    "This repository has an installed `codex-harness` layer.",
    "This repository has an installed legacy `codex-harness` layer."
  );
  const legacyConfig = readText(configPath)
    .replace(`version = "${packageVersion}"`, 'version = "0.0.0-legacy"')
    .replace(`templates_version = "${packageVersion}"`, 'templates_version = "0.0.0-legacy"');

  writeText(agentsPath, `# Local Notes\n\n${legacyAgentsBlock}\n\n## Footer\n- keep me\n`);
  writeText(managedAgentsBlockPath, `${legacyAgentsBlock}\n`);
  writeText(configPath, legacyConfig);
  writeText(managedConfigPath, legacyConfig);
  fs.rmSync(projectIndexPath);

  const dryRun = runCli(["upgrade", "--dry-run"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(dryRun, "upgrade dry-run for managed refresh");
  assert.match(dryRun.stdout, /updated:/);
  assert.match(dryRun.stdout, /AGENTS\.md/);
  assert.match(dryRun.stdout, /\.harness[\\/]config\.toml/);
  assert.match(dryRun.stdout, /created:/);
  assert.match(dryRun.stdout, /\.harness[\\/]memory[\\/]project-index\.md/);

  const applyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(applyResult, "upgrade apply for managed refresh");
  assert.match(applyResult.stdout, /status: upgrade completed/);

  const upgradedAgents = readText(agentsPath);
  assert.match(upgradedAgents, /# Local Notes/);
  assert.match(upgradedAgents, /## Footer/);
  assert.match(upgradedAgents, /This repository has an installed `codex-harness` layer\./);
  assert.doesNotMatch(upgradedAgents, /legacy `codex-harness` layer/);
  assert.match(readText(configPath), new RegExp(`version = "${packageVersion}"`));
  assert.ok(fs.existsSync(`${agentsPath}.codex-harness.bak`), "expected AGENTS backup");
  assert.ok(fs.existsSync(`${configPath}.codex-harness.bak`), "expected config backup");
  assert.ok(fs.existsSync(projectIndexPath), "expected missing seed file to be recreated");

  const installMetadata = readJson(installJsonPath);
  assert.equal(installMetadata.last_upgrade.from_version, packageVersion);
  assert.equal(installMetadata.last_upgrade.to_version, packageVersion);
  assert.ok(
    installMetadata.last_upgrade.changed_paths.includes("AGENTS.md"),
    "expected AGENTS.md in changed_paths"
  );
  assert.ok(
    installMetadata.last_upgrade.backup_paths.some((backupPath) => backupPath.includes("AGENTS.md.codex-harness.bak")),
    "expected AGENTS backup in backup_paths"
  );
});

test("phase 18 upgrade recreates or refreshes the optional registry entry without making repo-local behavior depend on registry", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir, "codex-harness-phase18-upgrade-registry-");
  const registryPath = getRegistryPath(homeDir);
  const expectedVersion = readPackageVersion();

  fs.rmSync(registryPath);

  const dryRun = runCli(["upgrade", "--dry-run"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(dryRun, "upgrade dry-run without existing registry");
  assert.equal(fs.existsSync(registryPath), false, "upgrade --dry-run should not recreate the registry");

  const applyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(applyResult, "upgrade apply should recreate the optional registry");
  assert.match(applyResult.stdout, /registry action: created/);
  assert.ok(fs.existsSync(registryPath), "expected upgrade to recreate registry.json");

  const firstRegistry = readJson(registryPath);
  const matchingEntries = firstRegistry.projects.filter(
    (entry) => normalizePathForComparison(entry.root_path) === normalizePathForComparison(tempRepo)
  );
  assert.equal(matchingEntries.length, 1, "expected exactly one registry entry for the upgraded project");
  assert.equal(matchingEntries[0].harness_version, expectedVersion);
  assert.equal(matchingEntries[0].templates_version, expectedVersion);

  const secondApplyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(secondApplyResult, "second upgrade apply");

  const secondRegistry = readJson(registryPath);
  const secondMatches = secondRegistry.projects.filter(
    (entry) => normalizePathForComparison(entry.root_path) === normalizePathForComparison(tempRepo)
  );
  assert.equal(secondMatches.length, 1, "upgrade should preserve a single registry entry for the project");
});

test("phase 18 doctor --all uses the optional registry and reports missing and non-installed entries", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const initialDoctorAll = runCli(["doctor", "--all"], {
    cwd: productRoot,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(initialDoctorAll, "doctor --all without registry");
  assert.match(initialDoctorAll.stdout, /status: no registered projects/);

  const installedRepo = createInstalledRepo(homeDir, "codex-harness-phase18-installed-");
  const uninstalledRepo = createTempDirectory("codex-harness-phase18-uninstalled-");
  tempDirectories.push(uninstalledRepo);
  assertSuccess(runCommand("git", ["init"], { cwd: uninstalledRepo }), `git init in ${uninstalledRepo}`);

  const registryPath = getRegistryPath(homeDir);
  const registry = readJson(registryPath);
  registry.projects.push({
    root_path: path.join(homeDir, "missing-repo"),
    harness_version: "0.1.0",
    templates_version: "0.1.0",
    registered_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  registry.projects.push({
    root_path: uninstalledRepo,
    harness_version: "0.1.0",
    templates_version: "0.1.0",
    registered_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  writeText(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const doctorAll = runCli(["doctor", "--all"], {
    cwd: productRoot,
    env: getHomeEnv(homeDir)
  });
  assertSuccess(doctorAll, "doctor --all with registry entries");
  assert.match(doctorAll.stdout, /projects: 3/);
  assert.match(doctorAll.stdout, /installed: 1/);
  assert.match(doctorAll.stdout, /status=installed/);
  assert.match(doctorAll.stdout, /status=missing/);
  assert.match(doctorAll.stdout, /status=not-installed/);
  assert.match(doctorAll.stdout, new RegExp(installedRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("phase 18 upgrade fails closed on malformed install metadata without rewriting managed or runtime files", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const tempRepo = createInstalledRepo(homeDir, "codex-harness-phase18-malformed-install-");
  const installJsonPath = path.join(tempRepo, ".harness", "install.json");
  const agentsPath = path.join(tempRepo, "AGENTS.md");
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const projectIndexPath = path.join(tempRepo, ".harness", "memory", "project-index.md");
  const agentsBefore = readText(agentsPath);
  const configBefore = readText(configPath);
  const runtimeBefore = `${readText(projectIndexPath)}\nlocal runtime marker\n`;
  const installBackupPath = `${installJsonPath}.codex-harness.bak`;
  const configBackupPath = `${configPath}.codex-harness.bak`;
  const agentsBackupPath = `${agentsPath}.codex-harness.bak`;

  writeText(projectIndexPath, runtimeBefore);
  writeText(installJsonPath, "{not valid json\n");

  const dryRun = runCli(["upgrade", "--dry-run"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertFailure(dryRun, "upgrade dry-run with malformed install.json");
  assert.match(dryRun.stderr, /property name|Unexpected token|JSON|position/i);

  const applyResult = runCli(["upgrade"], {
    cwd: tempRepo,
    env: getHomeEnv(homeDir)
  });
  assertFailure(applyResult, "upgrade apply with malformed install.json");
  assert.match(applyResult.stderr, /property name|Unexpected token|JSON|position/i);

  assert.equal(readText(agentsPath), agentsBefore);
  assert.equal(readText(configPath), configBefore);
  assert.equal(readText(projectIndexPath), runtimeBefore);
  assert.equal(fs.existsSync(installBackupPath), false, "malformed install metadata should not create install backups");
  assert.equal(fs.existsSync(configBackupPath), false, "malformed install metadata should not create config backups");
  assert.equal(fs.existsSync(agentsBackupPath), false, "malformed install metadata should not create AGENTS backups");
});

test("phase 18 doctor --all fails on malformed registry data", () => {
  ensureBuiltCli();

  const homeDir = createIsolatedHome();
  const registryDir = path.join(homeDir, ".codex-harness");
  const registryPath = getRegistryPath(homeDir);
  fs.mkdirSync(registryDir, { recursive: true });
  writeText(registryPath, "{not valid json\n");

  const result = runCli(["doctor", "--all"], {
    cwd: productRoot,
    env: getHomeEnv(homeDir)
  });
  assertFailure(result, "doctor --all malformed registry");
});
