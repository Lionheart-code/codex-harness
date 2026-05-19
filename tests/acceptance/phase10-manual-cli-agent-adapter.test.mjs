import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertProductRepoBoundaryState,
  assertFailure,
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  normalizePathForComparison,
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

function createAdapterReadyRepo() {
  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");

  return tempRepo;
}

function appendAdapterProfile(tempRepo, agentId, profile) {
  const configPath = path.join(tempRepo, ".harness", "config.toml");
  const content = readText(configPath);
  const lines = [
    "",
    `[agents.${agentId}]`,
    `transport = ${JSON.stringify(profile.transport)}`,
    `command = ${JSON.stringify(profile.command)}`,
    `args = ${JSON.stringify(profile.args)}`,
    `working_directory_policy = ${JSON.stringify(profile.workingDirectoryPolicy)}`,
    ...(profile.explicitPath ? [`explicit_path = ${JSON.stringify(profile.explicitPath)}`] : []),
    `permission_mode = ${JSON.stringify(profile.permissionMode)}`,
    `allowed_roles = ${JSON.stringify(profile.allowedRoles)}`,
    `output_contract = ${JSON.stringify(profile.outputContract)}`,
    `timeout_seconds = ${String(profile.timeoutSeconds)}`,
    `requires_human_confirmation = ${profile.requiresHumanConfirmation ? "true" : "false"}`,
    ""
  ];
  writeText(configPath, `${content.trimEnd()}\n${lines.join("\n")}`);
}

function portableNodePath() {
  return process.execPath.replace(/\\/g, "/");
}

test("phase 10 agent help includes prompt and run subcommands", () => {
  ensureBuiltCli();

  const result = runCli(["agent", "--help"], { cwd: productRoot });
  assertSuccess(result, "node bin/ch agent --help");
  assert.match(result.stdout, /node bin\/ch agent prompt <agent> --role <role>/);
  assert.match(result.stdout, /node bin\/ch agent run <agent> --role <role>/);
});

test("phase 10 agent prompt requires an adapter profile and rejects unsupported roles", () => {
  ensureBuiltCli();

  const tempRepo = createAdapterReadyRepo();

  const missingProfile = runCli(["agent", "prompt", "codex", "--role", "tests"], { cwd: tempRepo });
  assertFailure(missingProfile, "agent prompt missing adapter profile");
  assert.match(missingProfile.stderr, /Adapter profile not found: codex/);

  appendAdapterProfile(tempRepo, "codex", {
    transport: "manual_prompt",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('unused')"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });

  const badRole = runCli(["agent", "prompt", "codex", "--role", "builder"], { cwd: tempRepo });
  assertFailure(badRole, "agent prompt invalid role");
  assert.match(badRole.stderr, /Unsupported scout role: builder/);
});

test("phase 10 manual prompt adapter creates run-local prompt and command artifacts without executing", () => {
  ensureBuiltCli();

  const tempRepo = createAdapterReadyRepo();

  appendAdapterProfile(tempRepo, "codex", {
    transport: "manual_prompt",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('manual prompt')", "{prompt_path}"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });

  const promptResult = runCli(["agent", "prompt", "codex", "--role", "tests"], { cwd: tempRepo });
  assertSuccess(promptResult, "agent prompt manual adapter");
  assert.match(promptResult.stdout, /transport: manual_prompt/);
  assert.match(promptResult.stdout, /prompt mode: manual prompt only/);

  const runDirectory = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-0001");
  const promptPath = path.join(runDirectory, "prompt.md");
  const commandPath = path.join(runDirectory, "command.json");
  const statusPath = path.join(runDirectory, "status.json");
  const outputPath = path.join(runDirectory, "output.md");
  const logPath = path.join(runDirectory, "log.txt");

  assert.ok(fs.existsSync(promptPath), `expected prompt file to exist: ${promptPath}`);
  assert.ok(fs.existsSync(commandPath), `expected command file to exist: ${commandPath}`);
  assert.ok(fs.existsSync(statusPath), `expected status file to exist: ${statusPath}`);
  assert.equal(fs.existsSync(outputPath), false, "output.md must not be created by prompt-only flow");
  assert.equal(fs.existsSync(logPath), false, "log.txt must not be created by prompt-only flow");

  const promptContent = readText(promptPath);
  assert.match(promptContent, /Write findings only to/);
  assert.match(promptContent, /agents\/run-0001\/output\.md/);
  assert.match(promptContent, /manual use in Codex, Gemini CLI, or another trusted agent/i);

  const commandSpec = readJson(commandPath);
  assert.equal(commandSpec.command, portableNodePath());
  assert.equal(commandSpec.shell, false);
  assert.equal(commandSpec.capture_stdout, true);
  assert.equal(commandSpec.capture_stderr, true);
  assert.ok(path.isAbsolute(commandSpec.prompt_path));
  assert.ok(path.isAbsolute(commandSpec.output_path));
  assert.ok(path.isAbsolute(commandSpec.log_path));

  const status = readJson(statusPath);
  assert.equal(status.role, "scout-tests");
  assert.equal(status.profile, "codex");
  assert.equal(status.status, "raw");
  assert.equal(status.prompt_path, ".harness/tasks/task-test-task/agents/run-0001/prompt.md");
  assert.equal(status.output_path, ".harness/tasks/task-test-task/agents/run-0001/output.md");

  const listResult = runCli(["agent", "list"], { cwd: tempRepo });
  assertSuccess(listResult, "agent list phase 10 prompt");
  assert.match(listResult.stdout, /run-0001/);
  assert.match(listResult.stdout, /profile=codex/);
  assert.match(listResult.stdout, /prompt_path=.harness\/tasks\/task-test-task\/agents\/run-0001\/prompt\.md/);
});

test("phase 10 agent run executes a configured read-only cli adapter and captures artifacts", () => {
  ensureBuiltCli();

  const tempRepo = createAdapterReadyRepo();
  const successScript = [
    "const fs=require('fs');",
    "const prompt=fs.readFileSync(process.argv[1],'utf8');",
    "process.stderr.write('phase10 stderr\\n');",
    "process.stdout.write(prompt.includes('Write findings only to') ? 'phase10 ok\\n' : 'phase10 bad\\n');"
  ].join("");

  appendAdapterProfile(tempRepo, "node-scout", {
    transport: "cli",
    command: portableNodePath(),
    args: ["-e", successScript, "{prompt_path}"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: false
  });

  const runResult = runCli(["agent", "run", "node-scout", "--role", "tests"], { cwd: tempRepo });
  assertSuccess(runResult, "agent run cli adapter");
  assert.match(runResult.stdout, /exit_code: 0/);
  assert.match(runResult.stdout, /status: raw/);

  const runDirectory = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents", "run-0001");
  const commandPath = path.join(runDirectory, "command.json");
  const outputPath = path.join(runDirectory, "output.md");
  const logPath = path.join(runDirectory, "log.txt");
  const statusPath = path.join(runDirectory, "status.json");

  assert.equal(readText(outputPath), "phase10 ok\n");
  assert.match(readText(logPath), /phase10 stderr/);
  assert.match(readText(logPath), /exit_code: 0/);

  const commandSpec = readJson(commandPath);
  assert.equal(
    normalizePathForComparison(commandSpec.cwd),
    normalizePathForComparison(tempRepo)
  );
  assert.equal(commandSpec.shell, false);
  assert.equal(commandSpec.capture_stdout, true);
  assert.equal(commandSpec.capture_stderr, true);

  const status = readJson(statusPath);
  assert.equal(status.status, "raw");
  assert.equal(status.command_metadata.exit_code, 0);
  assert.equal(status.command_metadata.timed_out, false);
  assert.equal(
    normalizePathForComparison(status.command_metadata.cwd),
    normalizePathForComparison(tempRepo)
  );
});

test("phase 10 agent run rejects manual transport before creating a ledger entry", () => {
  ensureBuiltCli();

  const tempRepo = createAdapterReadyRepo();

  appendAdapterProfile(tempRepo, "codex", {
    transport: "manual_prompt",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('unused')"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });

  const runResult = runCli(["agent", "run", "codex", "--role", "tests"], { cwd: tempRepo });
  assertFailure(runResult, "agent run manual transport");
  assert.match(runResult.stderr, /must use transport = "cli" for `ch agent run`/);

  const agentsDir = path.join(tempRepo, ".harness", "tasks", "task-test-task", "agents");
  assert.equal(fs.existsSync(agentsDir), false, "manual transport run must not create agent artifacts");
});

test("phase 10 adapter failures remain bounded and clear", () => {
  ensureBuiltCli();

  const tempRepo = createAdapterReadyRepo();

  appendAdapterProfile(tempRepo, "bad-permission", {
    transport: "manual_prompt",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('unused')"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "write_worktree",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });
  appendAdapterProfile(tempRepo, "bad-transport", {
    transport: "api",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('unused')"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });
  appendAdapterProfile(tempRepo, "bad-explicit", {
    transport: "cli",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('unused')"],
    workingDirectoryPolicy: "explicit_path",
    explicitPath: "../outside",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });
  appendAdapterProfile(tempRepo, "bad-placeholder", {
    transport: "cli",
    command: portableNodePath(),
    args: ["-e", "process.stdout.write('unused')", "{bad_token}"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });
  appendAdapterProfile(tempRepo, "missing-command", {
    transport: "cli",
    command: "definitely-missing-agent-command",
    args: [],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });
  appendAdapterProfile(tempRepo, "failing-command", {
    transport: "cli",
    command: portableNodePath(),
    args: ["-e", "process.stderr.write('bad\\n');process.exit(7);"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 10,
    requiresHumanConfirmation: true
  });
  appendAdapterProfile(tempRepo, "timeout-command", {
    transport: "cli",
    command: portableNodePath(),
    args: ["-e", "setTimeout(() => process.stdout.write('late'), 2000);"],
    workingDirectoryPolicy: "repo_root",
    permissionMode: "read_only",
    allowedRoles: ["tests"],
    outputContract: "markdown",
    timeoutSeconds: 1,
    requiresHumanConfirmation: true
  });

  const badPermission = runCli(["agent", "prompt", "bad-permission", "--role", "tests"], { cwd: tempRepo });
  assertFailure(badPermission, "agent prompt bad permission");
  assert.match(badPermission.stderr, /must use permission_mode = "read_only"/);

  const badTransport = runCli(["agent", "prompt", "bad-transport", "--role", "tests"], { cwd: tempRepo });
  assertFailure(badTransport, "agent prompt bad transport");
  assert.match(badTransport.stderr, /invalid transport/);

  const badExplicit = runCli(["agent", "run", "bad-explicit", "--role", "tests"], { cwd: tempRepo });
  assertFailure(badExplicit, "agent run bad explicit path");
  assert.match(badExplicit.stderr, /explicit_path must stay inside the target repository or current task worktree/);

  const badPlaceholder = runCli(["agent", "run", "bad-placeholder", "--role", "tests"], { cwd: tempRepo });
  assertFailure(badPlaceholder, "agent run bad placeholder");
  assert.match(badPlaceholder.stderr, /Unsupported adapter argument placeholder: \{bad_token\}/);

  const missingCommand = runCli(["agent", "run", "missing-command", "--role", "tests"], { cwd: tempRepo });
  assertFailure(missingCommand, "agent run missing executable");
  assert.match(missingCommand.stderr, /Agent command failed to start:/);

  const failingCommand = runCli(["agent", "run", "failing-command", "--role", "tests"], { cwd: tempRepo });
  assertFailure(failingCommand, "agent run failing executable");
  assert.match(failingCommand.stderr, /Agent command exited with status 7/);

  const timeoutCommand = runCli(["agent", "run", "timeout-command", "--role", "tests"], { cwd: tempRepo });
  assertFailure(timeoutCommand, "agent run timeout");
  assert.match(timeoutCommand.stderr, /timed out after 1 seconds/);

  const extraArgs = runCli(["agent", "run", "timeout-command", "--role", "tests", "extra"], { cwd: tempRepo });
  assertFailure(extraArgs, "agent run extra args");
  assert.match(extraArgs.stderr, /requires exactly one adapter id/);
});

test("phase 10 acceptance leaves forbidden generated paths absent in the product repo", () => {
  ensureBuiltCli();
  assertProductRepoBoundaryState();
});
