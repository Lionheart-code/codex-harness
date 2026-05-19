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

function createSchemaRepo() {
  const tempRepo = createTempDirectory("codex-harness-phase19-");
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# schema test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  return tempRepo;
}

function getTaskRoot(tempRepo) {
  return path.join(tempRepo, ".harness", "tasks", "task-test-task");
}

function getWorktreePath(tempRepo) {
  return readText(path.join(getTaskRoot(tempRepo), "worktree.txt")).trim();
}

function getInstallPath(tempRepo) {
  return path.join(tempRepo, ".harness", "install.json");
}

function getStatePath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "state.json");
}

function getVerifierPath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "verifier.json");
}

function getReviewPath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "review.json");
}

function getAgentStatusPath(tempRepo) {
  return path.join(getTaskRoot(tempRepo), "agents", "run-0001", "status.json");
}

function getDebtPath(tempRepo) {
  return path.join(tempRepo, ".harness", "memory", "debt", "debt.jsonl");
}

function getDecisionPath(tempRepo) {
  return path.join(tempRepo, ".harness", "memory", "decisions", "DECISION-0001.json");
}

function getProposalMarkdownPath(tempRepo) {
  return path.join(tempRepo, ".harness", "governance", "proposals", "HEP-0001-tighten-review-gate.md");
}

function getProposalJsonPath(tempRepo) {
  return path.join(tempRepo, ".harness", "governance", "proposals", "HEP-0001-tighten-review-gate.json");
}

function getConfigPath(tempRepo) {
  return path.join(tempRepo, ".harness", "config.toml");
}

function writeCurrentManualReview(tempRepo) {
  writeText(
    getReviewPath(tempRepo),
    `${JSON.stringify(
      {
        schema_version: 1,
        producer_command: "node bin/ch review --exec",
        task_id: "task-test-task",
        result: "PASS",
        blockers: [],
        summary: "Current review artifact.",
        mode: "manual",
        created_at: "2026-05-19T00:00:00.000Z"
      },
      null,
      2
    )}\n`
  );
}

function appendCurrentAdapterProfile(tempRepo) {
  const configPath = getConfigPath(tempRepo);
  const current = readText(configPath);
  const profile = [
    "",
    "[agents.codex]",
    "# adapter profile comment",
    "schema_version = 1",
    'producer_command = "manual adapter profile"',
    'transport = "cli"',
    'command = "codex"',
    'args = ["exec", "{prompt_path}"]',
    'working_directory_policy = "repo_root"',
    'permission_mode = "read_only"',
    'allowed_roles = ["tests"]',
    'output_contract = "markdown"',
    "timeout_seconds = 600",
    "requires_human_confirmation = true",
    ""
  ].join("\n");
  writeText(configPath, `${current.trimEnd()}\n${profile}`);
}

function downgradeAdapterProfileToLegacy(tempRepo) {
  const configWithoutSchemaMeta = readText(getConfigPath(tempRepo))
    .replace(/^schema_version = 1\r?\n/m, "")
    .replace(/^producer_command = "manual adapter profile"\r?\n/m, "");
  writeText(getConfigPath(tempRepo), configWithoutSchemaMeta);
}

function updateChecksConfig(tempRepo, commands) {
  const configPath = getConfigPath(tempRepo);
  const content = readText(configPath);
  const replacement = [
    "[checks]",
    `commands = ${JSON.stringify(commands)}`,
    ""
  ].join("\n");
  const nextContent = content.replace(/\[checks\]\r?\ncommands = \[[^\n]*\]\r?\n/, replacement);
  writeText(configPath, nextContent);
}

function createSchemaReadyRepo() {
  const tempRepo = createSchemaRepo();

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  appendCurrentAdapterProfile(tempRepo);
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");
  assertSuccess(runCli(["agent", "record", "--role", "scout-tests", "--output", "sample.md"], { cwd: tempRepo }), "agent record");
  assertSuccess(
    runCli(["debt", "add", "--title", "schema debt", "--type", "technical", "--severity", "low", "--reason", "schema"], {
      cwd: tempRepo
    }),
    "debt add"
  );
  assertSuccess(runCli(["decisions", "add", "--title", "schema decision", "--reason", "schema"], { cwd: tempRepo }), "decision add");
  fs.mkdirSync(path.join(tempRepo, "research"), { recursive: true });
  writeText(path.join(tempRepo, "research", "summary.md"), "# Research\n");
  assertSuccess(
    runCli(["governance", "proposal", "--title", "Tighten review gate", "--research", "research/summary.md"], { cwd: tempRepo }),
    "governance proposal"
  );

  const worktreePath = getWorktreePath(tempRepo);
  fs.appendFileSync(path.join(worktreePath, "README.md"), "schema validation change\n", "utf8");
  updateChecksConfig(tempRepo, ["git status --short"]);
  assertSuccess(runCli(["capture"], { cwd: tempRepo }), "capture");
  assertSuccess(runCli(["check"], { cwd: tempRepo }), "check");
  writeCurrentManualReview(tempRepo);

  return tempRepo;
}

function mutateJson(filePath, updater) {
  const value = readJson(filePath);
  const nextValue = updater(value);
  writeText(filePath, `${JSON.stringify(nextValue, null, 2)}\n`);
}

function downgradeRepoToLegacy(tempRepo, { removeProposalJson = true } = {}) {
  mutateJson(getInstallPath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    delete value.updated_at;
    return value;
  });

  mutateJson(getStatePath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    return value;
  });

  mutateJson(getVerifierPath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    return value;
  });

  mutateJson(getReviewPath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    return value;
  });

  mutateJson(getAgentStatusPath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    return value;
  });

  const debtItems = readText(getDebtPath(tempRepo))
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line))
    .map((item) => {
      delete item.schema_version;
      delete item.producer_command;
      delete item.created_at;
      delete item.updated_at;
      return item;
    });
  writeText(getDebtPath(tempRepo), `${debtItems.map((item) => JSON.stringify(item)).join("\n")}\n`);

  mutateJson(getDecisionPath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    delete value.updated_at;
    return value;
  });

  downgradeAdapterProfileToLegacy(tempRepo);

  if (removeProposalJson) {
    fs.rmSync(getProposalJsonPath(tempRepo), { force: true });
  } else {
    mutateJson(getProposalJsonPath(tempRepo), (value) => {
      delete value.schema_version;
      delete value.producer_command;
      return value;
    });
  }
}

test("phase 19 schema help succeeds and top-level help includes schema commands", () => {
  ensureBuiltCli();

  const help = runCli(["schema", "--help"], { cwd: productRoot });
  assertSuccess(help, "schema help");
  assert.match(help.stdout, /node bin\/ch schema validate/);
  assert.match(help.stdout, /node bin\/ch schema migrate --dry-run/);

  const topHelp = runCli(["--help"], { cwd: productRoot });
  assertSuccess(topHelp, "top-level help");
  assert.match(topHelp.stdout, /node bin\/ch schema --help/);
  assert.match(topHelp.stdout, /node bin\/ch schema validate/);
});

test("phase 19 install seeds schema snapshots, keeps target-root boundaries intact, and schema validate passes on current artifacts", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaReadyRepo();
  assert.ok(fs.existsSync(path.join(tempRepo, ".harness", "schemas", "install.schema.json")));
  assert.equal(fs.existsSync(path.join(tempRepo, "schemas")), false, "target repo must not receive product schemas/");
  assert.equal(fs.existsSync(path.join(tempRepo, "migrations")), false, "target repo must not receive product migrations/");

  const validate = runCli(["schema", "validate"], { cwd: tempRepo });
  assertSuccess(validate, "schema validate current artifacts");
  assert.match(validate.stdout, /status: all schema-governed artifacts are valid/);
  assert.match(validate.stdout, /legacy: 0/);
  assert.match(validate.stdout, /errors: 0/);
});

const invalidCases = [
  {
    name: "install metadata with unsupported schema version",
    mutate: (tempRepo) => mutateJson(getInstallPath(tempRepo), (value) => ({ ...value, schema_version: 99 })),
    pattern: /install\.json|unsupported schema_version/
  },
  {
    name: "task state with malformed JSON",
    mutate: (tempRepo) => writeText(getStatePath(tempRepo), "{ not-valid-json }\n"),
    pattern: /state\.json|Invalid JSON/
  },
  {
    name: "verifier with unsupported schema version",
    mutate: (tempRepo) => mutateJson(getVerifierPath(tempRepo), (value) => ({ ...value, schema_version: 99 })),
    pattern: /verifier\.json|unsupported schema_version/
  },
  {
    name: "review with malformed JSON",
    mutate: (tempRepo) => writeText(getReviewPath(tempRepo), "{ not-valid-json }\n"),
    pattern: /review\.json|Invalid JSON/
  },
  {
    name: "agent run status with unsupported schema version",
    mutate: (tempRepo) => mutateJson(getAgentStatusPath(tempRepo), (value) => ({ ...value, schema_version: 99 })),
    pattern: /status\.json|unsupported schema_version/
  },
  {
    name: "debt ledger with malformed JSONL",
    mutate: (tempRepo) => writeText(getDebtPath(tempRepo), "{ not-valid-json }\n"),
    pattern: /debt\.jsonl|Unexpected token|Invalid/
  },
  {
    name: "decision record with unsupported schema version",
    mutate: (tempRepo) => mutateJson(getDecisionPath(tempRepo), (value) => ({ ...value, schema_version: 99 })),
    pattern: /DECISION-0001\.json|unsupported schema_version/
  },
  {
    name: "governance proposal sidecar with malformed JSON",
    mutate: (tempRepo) => writeText(getProposalJsonPath(tempRepo), "{ not-valid-json }\n"),
    pattern: /HEP-0001-tighten-review-gate\.json|Invalid JSON/
  },
  {
    name: "adapter profile with unsupported schema version",
    mutate: (tempRepo) =>
      writeText(
        getConfigPath(tempRepo),
        readText(getConfigPath(tempRepo)).replace(/schema_version = 1/, "schema_version = 99")
      ),
    pattern: /config\.toml|unsupported schema_version/
  }
];

for (const invalidCase of invalidCases) {
  test(`phase 19 schema validate fails closed on ${invalidCase.name}`, () => {
    ensureBuiltCli();

    const tempRepo = createSchemaReadyRepo();
    invalidCase.mutate(tempRepo);

    const result = runCli(["schema", "validate"], { cwd: tempRepo });
    assertFailure(result, `schema validate invalid case: ${invalidCase.name}`);
    assert.match(result.stdout, /status: migration or manual fixes are required/);
    assert.match(result.stdout, invalidCase.pattern);
  });
}

test("phase 19 legacy unversioned artifacts remain readable by existing commands before migration", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaReadyRepo();
  downgradeRepoToLegacy(tempRepo);

  assertSuccess(runCli(["status"], { cwd: tempRepo }), "status on legacy task state");
  assertSuccess(runCli(["agent", "list"], { cwd: tempRepo }), "agent list on legacy status");
  assertSuccess(runCli(["debt", "list"], { cwd: tempRepo }), "debt list on legacy debt");
  assertSuccess(runCli(["decisions", "list"], { cwd: tempRepo }), "decisions list on legacy decision");
  assertSuccess(runCli(["review"], { cwd: tempRepo }), "review validate on legacy review");
  assertSuccess(runCli(["report"], { cwd: tempRepo }), "report on legacy verifier");
  assertSuccess(runCli(["governance", "status"], { cwd: tempRepo }), "governance status on markdown-only proposal");
  assertSuccess(runCli(["agent", "prompt", "codex", "--role", "tests"], { cwd: tempRepo }), "agent prompt on legacy adapter profile");
});

test("phase 19 schema validate reports unversioned adapter profiles as legacy and requiring migration", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaReadyRepo();
  downgradeAdapterProfileToLegacy(tempRepo);

  const validate = runCli(["schema", "validate"], { cwd: tempRepo });
  assertFailure(validate, "schema validate on legacy adapter profile");
  assert.match(validate.stdout, /legacy: 1/);
  assert.match(validate.stdout, /\.harness[\\/]config\.toml/);
  assert.match(validate.stdout, /legacy unversioned artifact; run `node bin\/ch schema migrate --dry-run` and `node bin\/ch schema migrate`\./);
});

test("phase 19 schema migrate --dry-run reports legacy rewrites without mutating the repo", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaReadyRepo();
  downgradeRepoToLegacy(tempRepo);
  const beforeStatus = getGitStatus(tempRepo);

  const dryRun = runCli(["schema", "migrate", "--dry-run"], { cwd: tempRepo });
  const afterStatus = getGitStatus(tempRepo);

  assertSuccess(dryRun, "schema migrate dry-run");
  assert.equal(afterStatus, beforeStatus, "schema migrate --dry-run changed repo git status");
  assert.match(dryRun.stdout, /status: no files were written/);
  assert.match(dryRun.stdout, /\.harness[\\/]install\.json/);
  assert.match(dryRun.stdout, /\.harness[\\/]tasks[\\/]task-test-task[\\/]state\.json/);
  assert.match(dryRun.stdout, /\.harness[\\/]tasks[\\/]task-test-task[\\/]verifier\.json/);
  assert.match(dryRun.stdout, /\.harness[\\/]tasks[\\/]task-test-task[\\/]review\.json/);
  assert.match(dryRun.stdout, /\.harness[\\/]tasks[\\/]task-test-task[\\/]agents[\\/]run-0001[\\/]status\.json/);
  assert.match(dryRun.stdout, /\.harness[\\/]memory[\\/]debt[\\/]debt\.jsonl/);
  assert.match(dryRun.stdout, /\.harness[\\/]config\.toml/);
  assert.match(dryRun.stdout, /\.harness[\\/]memory[\\/]decisions[\\/]DECISION-0001\.json/);
  assert.match(dryRun.stdout, /\.harness[\\/]governance[\\/]proposals[\\/]HEP-0001-tighten-review-gate\.json/);
});

test("phase 19 schema migrate applies explicit legacy-to-v1 rewrites with backups and is idempotent", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaReadyRepo();
  const proposalMarkdownBefore = readText(getProposalMarkdownPath(tempRepo));
  downgradeRepoToLegacy(tempRepo);

  const migrate = runCli(["schema", "migrate"], { cwd: tempRepo });
  assertSuccess(migrate, "schema migrate apply");
  assert.match(migrate.stdout, /status: migration completed/);
  assert.ok(fs.existsSync(`${getInstallPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getStatePath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getVerifierPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getReviewPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getAgentStatusPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getDebtPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getConfigPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(`${getDecisionPath(tempRepo)}.codex-harness.bak`));
  assert.ok(fs.existsSync(getProposalJsonPath(tempRepo)), "schema migrate should recreate missing governance proposal sidecar");
  assert.equal(readText(getProposalMarkdownPath(tempRepo)), proposalMarkdownBefore, "proposal markdown must remain unchanged");

  assert.equal(readJson(getInstallPath(tempRepo)).schema_version, 1);
  assert.equal(readJson(getStatePath(tempRepo)).schema_version, 1);
  assert.equal(readJson(getVerifierPath(tempRepo)).schema_version, 1);
  assert.equal(readJson(getReviewPath(tempRepo)).schema_version, 1);
  assert.equal(readJson(getAgentStatusPath(tempRepo)).schema_version, 1);
  assert.equal(readJson(getDecisionPath(tempRepo)).schema_version, 1);
  assert.equal(readJson(getProposalJsonPath(tempRepo)).schema_version, 1);
  const migratedConfig = readText(getConfigPath(tempRepo));
  assert.match(migratedConfig, /\[agents\.codex\]/);
  assert.match(migratedConfig, /schema_version = 1/);
  assert.match(migratedConfig, /producer_command = "node bin\/ch schema migrate"/);
  assert.match(migratedConfig, /# adapter profile comment/);
  assert.match(migratedConfig, /\[checks\]/);
  assert.match(migratedConfig, /commands = \["git status --short"\]/);
  assert.equal(
    readText(getDebtPath(tempRepo))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line))[0].schema_version,
    1
  );

  const validate = runCli(["schema", "validate"], { cwd: tempRepo });
  assertSuccess(validate, "schema validate after migrate");

  const secondMigrate = runCli(["schema", "migrate"], { cwd: tempRepo });
  assertSuccess(secondMigrate, "schema migrate idempotent");
  assert.match(secondMigrate.stdout, /status: already up to date/);
});

test("phase 19 upgrade does not migrate runtime-governed artifacts", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaRepo();
  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");

  mutateJson(getStatePath(tempRepo), (value) => {
    delete value.schema_version;
    delete value.producer_command;
    return value;
  });

  const beforeState = readText(getStatePath(tempRepo));
  const upgrade = runCli(["upgrade"], { cwd: tempRepo });
  assertSuccess(upgrade, "upgrade on repo with legacy runtime artifact");
  assert.equal(readText(getStatePath(tempRepo)), beforeState, "upgrade must not migrate runtime-governed state.json");
});

test("phase 19 schema migrate blocks without partial writes when a malformed governed artifact exists", () => {
  ensureBuiltCli();

  const tempRepo = createSchemaReadyRepo();
  downgradeAdapterProfileToLegacy(tempRepo);
  const originalConfig = readText(getConfigPath(tempRepo));
  writeText(getReviewPath(tempRepo), "{ not-valid-json }\n");

  const migrate = runCli(["schema", "migrate"], { cwd: tempRepo });
  assertFailure(migrate, "schema migrate blocked on malformed governed artifact");
  assert.match(migrate.stdout, /status: blocked/);
  assert.match(migrate.stdout, /\.harness[\\/]config\.toml/);
  assert.match(migrate.stdout, /review\.json/);
  assert.equal(readText(getConfigPath(tempRepo)), originalConfig, "blocked migrate must not partially rewrite config.toml");
  assert.equal(fs.existsSync(`${getConfigPath(tempRepo)}.codex-harness.bak`), false, "blocked migrate must not create config backup");
});

test("phase 19 product-repo boundary keeps runtime paths absent while source schemas and migrations exist", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
