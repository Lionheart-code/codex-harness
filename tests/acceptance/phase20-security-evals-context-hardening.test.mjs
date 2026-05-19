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

function createGitRepo(prefix = "codex-harness-phase20-") {
  const tempRepo = createTempDirectory(prefix);
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# phase 20 test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  return tempRepo;
}

function createInstalledRepo() {
  const tempRepo = createGitRepo();
  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  return tempRepo;
}

function appendAdapterProfile(tempRepo, profileId, lines) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const current = fs.readFileSync(configPath, "utf8");
  const next = [current.trimEnd(), "", `[agents.${profileId}]`, ...lines, ""].join("\n");
  writeText(configPath, `${next}\n`);
}

function createContextReadyRepo() {
  const tempRepo = createInstalledRepo();
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");
  return tempRepo;
}

test("phase 20 help surfaces include security, context, and bare eval", () => {
  ensureBuiltCli();

  const topHelp = runCli(["--help"], { cwd: productRoot });
  assertSuccess(topHelp, "top-level help");
  assert.match(topHelp.stdout, /node bin\/ch security --help/);
  assert.match(topHelp.stdout, /node bin\/ch context --help/);
  assert.match(topHelp.stdout, /node bin\/ch eval$/m);

  const securityHelp = runCli(["security", "--help"], { cwd: productRoot });
  assertSuccess(securityHelp, "security help");
  assert.match(securityHelp.stdout, /node bin\/ch security doctor/);

  const contextHelp = runCli(["context", "--help"], { cwd: productRoot });
  assertSuccess(contextHelp, "context help");
  assert.match(contextHelp.stdout, /node bin\/ch context inspect plan/);
  assert.match(contextHelp.stdout, /node bin\/ch context inspect scout --role <repo-map\|tests\|docs\|security\|architecture>/);

  const evalHelp = runCli(["eval", "--help"], { cwd: productRoot });
  assertSuccess(evalHelp, "eval help");
  assert.match(evalHelp.stdout, /node bin\/ch eval$/m);
  assert.match(evalHelp.stdout, /node bin\/ch eval playground init/);
});

test("phase 20 security doctor reports product repo posture without mutating git state", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const result = runCli(["security", "doctor"], { cwd: productRoot });
  const afterStatus = getGitStatus(productRoot);

  assertSuccess(result, "security doctor product repo");
  assert.equal(afterStatus, beforeStatus, "security doctor changed product-repo git status");
  assert.match(result.stdout, /repository role: product/);
  assert.match(result.stdout, /installed layer: absent/);
  assert.match(result.stdout, /installed-layer security audit unavailable/);
});

test("phase 20 security doctor fails closed in a non-product git repo without an installed harness layer", () => {
  ensureBuiltCli();

  const tempRepo = createGitRepo("codex-harness-phase20-security-noinstall-");
  const beforeStatus = getGitStatus(tempRepo);
  const result = runCli(["security", "doctor"], { cwd: tempRepo });
  const afterStatus = getGitStatus(tempRepo);

  assertFailure(result, "security doctor missing installed layer");
  assert.equal(afterStatus, beforeStatus, "security doctor changed git status in non-installed repo");
  assert.match(result.stderr, /Installed harness layer not found/);
  assert.match(result.stderr, /Run `node bin\/ch install` first\./);
  assert.equal(fs.existsSync(path.join(tempRepo, ".harness")), false, "security doctor created .harness/");
  assert.equal(fs.existsSync(path.join(tempRepo, ".codex")), false, "security doctor created .codex/");
  assert.equal(fs.existsSync(path.join(tempRepo, ".agents")), false, "security doctor created .agents/");
});

test("phase 20 security doctor reports installed repo posture and adapter profile details without mutating state", () => {
  ensureBuiltCli();

  const tempRepo = createInstalledRepo();
  appendAdapterProfile(tempRepo, "codex", [
    'transport = "cli"',
    'command = "codex"',
    'args = ["exec", "{prompt_path}"]',
    'working_directory_policy = "repo_root"',
    'permission_mode = "read_only"',
    'allowed_roles = ["tests"]',
    'output_contract = "markdown"',
    'timeout_seconds = 600',
    'requires_human_confirmation = true'
  ]);

  const beforeStatus = getGitStatus(tempRepo);
  const result = runCli(["security", "doctor"], { cwd: tempRepo });
  const afterStatus = getGitStatus(tempRepo);

  assertSuccess(result, "security doctor installed repo");
  assert.equal(afterStatus, beforeStatus, "security doctor changed installed-repo git status");
  assert.match(result.stdout, /repository role: installed_target/);
  assert.match(result.stdout, /installed layer: present/);
  assert.match(result.stdout, /protected paths source: default/);
  assert.match(result.stdout, /adapter profiles: 1/);
  assert.match(result.stdout, /permission_mode=read_only/);
  assert.match(result.stdout, /external capabilities by default: disabled/);
});

test("phase 20 security doctor fails closed on malformed adapter config", () => {
  ensureBuiltCli();

  const tempRepo = createInstalledRepo();
  appendAdapterProfile(tempRepo, "bad", [
    'transport = "cli"',
    'command = "codex"',
    'this is not valid toml'
  ]);

  const result = runCli(["security", "doctor"], { cwd: tempRepo });
  assertFailure(result, "security doctor malformed adapter config");
  assert.match(result.stderr, /Malformed adapter config:/);
});

test("phase 20 security doctor fails closed on unclear permission state", () => {
  ensureBuiltCli();

  const tempRepo = createInstalledRepo();
  appendAdapterProfile(tempRepo, "ambiguous", [
    'transport = "cli"',
    'command = "codex"',
    'args = ["exec", "{prompt_path}"]',
    'working_directory_policy = "repo_root"',
    'permission_mode = "review_only"',
    'allowed_roles = ["tests"]',
    'output_contract = "markdown"',
    'timeout_seconds = 600',
    'requires_human_confirmation = true'
  ]);

  const result = runCli(["security", "doctor"], { cwd: tempRepo });
  assertFailure(result, "security doctor unclear permission state");
  assert.match(result.stderr, /Unclear permission state:/);
});

test("phase 20 security subcommand and doctor arguments fail closed", () => {
  ensureBuiltCli();

  const badSubcommand = runCli(["security", "unknown"], { cwd: productRoot });
  assertFailure(badSubcommand, "security unknown subcommand");
  assert.match(badSubcommand.stderr, /Unknown security subcommand: unknown/);

  const badDoctorArgs = runCli(["security", "doctor", "--bad-flag"], { cwd: productRoot });
  assertFailure(badDoctorArgs, "security doctor unknown arguments");
  assert.match(badDoctorArgs.stderr, /Unknown security doctor argument\(s\): --bad-flag/);
});

test("phase 20 context inspect reports plan/work/review/scout context without mutating state", () => {
  ensureBuiltCli();

  const tempRepo = createContextReadyRepo();
  const beforeStatus = getGitStatus(tempRepo);

  const planResult = runCli(["context", "inspect", "plan"], { cwd: tempRepo });
  const workResult = runCli(["context", "inspect", "work"], { cwd: tempRepo });
  const reviewResult = runCli(["context", "inspect", "review"], { cwd: tempRepo });
  const scoutResult = runCli(["context", "inspect", "scout", "--role", "tests"], { cwd: tempRepo });

  const afterStatus = getGitStatus(tempRepo);

  assertSuccess(planResult, "context inspect plan");
  assertSuccess(workResult, "context inspect work");
  assertSuccess(reviewResult, "context inspect review");
  assertSuccess(scoutResult, "context inspect scout");
  assert.equal(afterStatus, beforeStatus, "context inspect changed installed-repo git status");

  assert.match(planResult.stdout, /prompt-plan\.md/);
  assert.match(workResult.stdout, /prompt-work\.md/);
  assert.match(workResult.stdout, /checks:/);
  assert.match(reviewResult.stdout, /prompt-review\.md/);
  assert.match(scoutResult.stdout, /mode: scout:tests/);
  assert.match(scoutResult.stdout, /scout-tests\.md/);
  assert.match(scoutResult.stdout, /Raw logs are not prompt context\./);
});

test("phase 20 context inspect fails closed on unsupported context mode and scout role", () => {
  ensureBuiltCli();

  const tempRepo = createContextReadyRepo();

  const badMode = runCli(["context", "inspect", "unknown"], { cwd: tempRepo });
  assertFailure(badMode, "context inspect unsupported mode");
  assert.match(badMode.stderr, /Unsupported context mode: unknown/);

  const badRole = runCli(["context", "inspect", "scout", "--role", "unknown"], { cwd: tempRepo });
  assertFailure(badRole, "context inspect unsupported role");
  assert.match(badRole.stderr, /Unsupported scout role: unknown/);
});

test("phase 20 context inspect fails closed on missing installed layer", () => {
  ensureBuiltCli();

  const tempRepo = createGitRepo("codex-harness-phase20-noinstall-");
  const result = runCli(["context", "inspect", "plan"], { cwd: tempRepo });
  assertFailure(result, "context inspect missing installed layer");
  assert.match(result.stderr, /Installed harness layer not found/);
});

test("phase 20 context inspect fails closed on missing active task", () => {
  ensureBuiltCli();

  const tempRepo = createInstalledRepo();
  const result = runCli(["context", "inspect", "plan"], { cwd: tempRepo });
  assertFailure(result, "context inspect missing task");
  assert.match(result.stderr, /No tasks found/);
});

test("phase 20 context inspect fails closed on multiple active tasks", () => {
  ensureBuiltCli();

  const tempRepo = createInstalledRepo();
  assertSuccess(runCli(["init", "task one"], { cwd: tempRepo }), "init task one");
  assertSuccess(runCli(["init", "task two"], { cwd: tempRepo }), "init task two");

  const result = runCli(["context", "inspect", "plan"], { cwd: tempRepo });
  assertFailure(result, "context inspect multiple tasks");
  assert.match(result.stderr, /Exactly one task is required\./);
});

test("phase 20 context inspect fails closed on missing worktree metadata", () => {
  ensureBuiltCli();

  const tempRepo = createInstalledRepo();
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");

  const result = runCli(["context", "inspect", "plan"], { cwd: tempRepo });
  assertFailure(result, "context inspect missing worktree metadata");
  assert.match(result.stderr, /Task worktree is not ready/);
});

test(
  "phase 20 bare eval runs deterministic offline regression checks",
  { skip: process.env.CODEX_HARNESS_EVAL_RUNNING === "1" },
  () => {
    ensureBuiltCli();

    const beforeStatus = getGitStatus(productRoot);
    const result = runCli(["eval"], { cwd: productRoot });
    const afterStatus = getGitStatus(productRoot);

    assertSuccess(result, "phase 20 bare eval");
    assert.equal(afterStatus, beforeStatus, "bare eval changed product-repo git status");
    assert.match(result.stdout, /mode: deterministic_local_regression/);
    assert.match(result.stdout, /- build \| exit_code=0/);
    assert.match(result.stdout, /- acceptance \| exit_code=0/);
    assert.match(result.stdout, /status: passed/);
  }
);

test("phase 20 bare eval fails outside the product repo root", () => {
  ensureBuiltCli();

  const tempDir = createTempDirectory("codex-harness-phase20-outside-");
  tempDirectories.push(tempDir);

  const result = runCli(["eval"], { cwd: tempDir });
  assertFailure(result, "phase 20 bare eval outside product root");
  assert.match(result.stderr, /must run from the codex-harness product repository root/);
});

test("phase 20 product repo generated-path boundary remains intact", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
