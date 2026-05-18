import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGitDiffPatch, getGitStatusLines, getGitStatusPaths } from "./git";
import { CONFIG_PATH, TASK_CHECK_LOG_FILE, TASK_DIFF_FILE, TASK_LOGS_DIR, TASK_VERIFIER_FILE } from "./paths";
import { listTasks } from "./tasks";

type VerifierResult = "captured" | "pass" | "fail";
type CommandResult = "pass" | "fail";

export interface CheckCommandRecord {
  command: string;
  exit_code: number;
  duration_ms: number;
  result: CommandResult;
}

export interface VerifierRecord {
  task_id: string;
  worktree_path: string;
  result: VerifierResult;
  captured_at: string;
  checked_at: string;
  diff_path: string;
  log_path: string;
  git_status_lines: string[];
  protected_paths: string[];
  protected_path_violations: string[];
  commands: CheckCommandRecord[];
}

export interface CaptureResult {
  targetRoot: string;
  taskId: string;
  worktreePath: string;
  diffPath: string;
  verifierPath: string;
  verifier: VerifierRecord;
}

export interface CheckResult extends CaptureResult {
  logPath: string;
}

interface CheckConfig {
  commands: string[];
  protectedPaths: string[];
}

interface CommandExecutionResult extends CheckCommandRecord {
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DEFAULT_PROTECTED_PATHS = ["AGENTS.md", ".harness/config.toml"];
const COMMAND_TIMEOUT_MS = 120000;

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function normalizeRepoRelativePath(relativePath: string): string {
  return toPortablePath(relativePath).replace(/^\.\/+/, "");
}

function getTaskPaths(targetRoot: string, taskId: string): {
  taskDirectory: string;
  diffPath: string;
  verifierPath: string;
  logsDirectory: string;
  logPath: string;
} {
  const taskDirectory = path.join(targetRoot, ".harness", "tasks", taskId);
  const logsDirectory = path.join(taskDirectory, TASK_LOGS_DIR);

  return {
    taskDirectory,
    diffPath: path.join(taskDirectory, TASK_DIFF_FILE),
    verifierPath: path.join(taskDirectory, TASK_VERIFIER_FILE),
    logsDirectory,
    logPath: path.join(logsDirectory, TASK_CHECK_LOG_FILE)
  };
}

function getSingleTaskWithWorktree(cwd: string): { targetRoot: string; taskId: string; worktreePath: string } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Phase 11 capture/check commands require exactly one task.");
  }

  const task = result.tasks[0];

  if (!task.worktree || task.worktree.trim().length === 0) {
    throw new Error("Task worktree is not ready. Run `node bin/ch worktree` first.");
  }

  if (!fs.existsSync(task.worktree)) {
    throw new Error(`Recorded worktree path does not exist: ${task.worktree}`);
  }

  return {
    targetRoot: result.targetRoot,
    taskId: task.task_id,
    worktreePath: task.worktree
  };
}

function parseStringArray(value: string): string[] | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validateCheckCommands(commands: string[]): string[] {
  for (const command of commands) {
    if (command.trim().length === 0) {
      throw new Error("The `[checks].commands` entries must not be empty or whitespace-only.");
    }
  }

  return commands;
}

function readCheckConfig(targetRoot: string): CheckConfig {
  const configPath = path.join(targetRoot, CONFIG_PATH);
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  let currentSection = "";
  let commands: string[] | undefined;
  let protectedPaths: string[] | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);

    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    if (currentSection !== "checks") {
      continue;
    }

    const keyValueMatch = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(trimmed);

    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;

    if (key === "commands") {
      commands = parseStringArray(rawValue);
      if (!commands) {
        throw new Error("The `[checks].commands` value must be a string array.");
      }
      commands = validateCheckCommands(commands);
    }

    if (key === "protected_paths") {
      protectedPaths = parseStringArray(rawValue);
      if (!protectedPaths) {
        throw new Error("The `[checks].protected_paths` value must be a string array.");
      }
    }
  }

  return {
    commands: commands ?? [],
    protectedPaths: protectedPaths ?? DEFAULT_PROTECTED_PATHS
  };
}

function collectProtectedPathViolations(statusLines: string[], protectedPaths: string[]): string[] {
  const normalizedProtected = new Set(protectedPaths.map((entry) => normalizeRepoRelativePath(entry)));
  const violations = new Set<string>();

  for (const statusPath of getGitStatusPaths(statusLines)) {
    const normalizedStatusPath = normalizeRepoRelativePath(statusPath);

    if (normalizedProtected.has(normalizedStatusPath)) {
      violations.add(normalizedStatusPath);
    }
  }

  return [...violations].sort((left, right) => left.localeCompare(right));
}

function ensureVerifierParentPaths(paths: { taskDirectory: string; logsDirectory: string }): void {
  fs.mkdirSync(paths.taskDirectory, { recursive: true });
  fs.mkdirSync(paths.logsDirectory, { recursive: true });
}

function writeVerifierFile(verifierPath: string, record: VerifierRecord): void {
  fs.writeFileSync(verifierPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function captureSnapshot(cwd: string): {
  targetRoot: string;
  taskId: string;
  worktreePath: string;
  diffPath: string;
  verifierPath: string;
  logPath: string;
  protectedPaths: string[];
  protectedPathViolations: string[];
  gitStatusLines: string[];
  capturedAt: string;
} {
  const { targetRoot, taskId, worktreePath } = getSingleTaskWithWorktree(cwd);
  const config = readCheckConfig(targetRoot);
  const paths = getTaskPaths(targetRoot, taskId);
  const gitStatusLines = getGitStatusLines(worktreePath);
  const diffPatch = getGitDiffPatch(worktreePath);
  const capturedAt = new Date().toISOString();

  fs.mkdirSync(paths.taskDirectory, { recursive: true });
  fs.writeFileSync(paths.diffPath, diffPatch, "utf8");

  return {
    targetRoot,
    taskId,
    worktreePath,
    diffPath: paths.diffPath,
    verifierPath: paths.verifierPath,
    logPath: paths.logPath,
    protectedPaths: config.protectedPaths,
    protectedPathViolations: collectProtectedPathViolations(gitStatusLines, config.protectedPaths),
    gitStatusLines,
    capturedAt
  };
}

function buildCapturedVerifier(snapshot: ReturnType<typeof captureSnapshot>): VerifierRecord {
  return {
    task_id: snapshot.taskId,
    worktree_path: snapshot.worktreePath,
    result: "captured",
    captured_at: snapshot.capturedAt,
    checked_at: "",
    diff_path: toRepoRelative(snapshot.targetRoot, snapshot.diffPath),
    log_path: toRepoRelative(snapshot.targetRoot, snapshot.logPath),
    git_status_lines: snapshot.gitStatusLines,
    protected_paths: snapshot.protectedPaths,
    protected_path_violations: snapshot.protectedPathViolations,
    commands: []
  };
}

function formatCommandLogSection(execution: CommandExecutionResult, cwd: string): string {
  return [
    `command: ${execution.command}`,
    `cwd: ${cwd}`,
    `result: ${execution.result}`,
    `exit_code: ${execution.exit_code}`,
    `duration_ms: ${execution.duration_ms}`,
    `timed_out: ${execution.timedOut ? "true" : "false"}`,
    "stdout:",
    execution.stdout.length > 0 ? execution.stdout : "(none)",
    "stderr:",
    execution.stderr.length > 0 ? execution.stderr : "(none)",
    ""
  ].join("\n");
}

function executeCheckCommand(command: string, cwd: string): CommandExecutionResult {
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
    timeout: COMMAND_TIMEOUT_MS
  });
  const durationMs = Date.now() - startedAt;
  const timedOut =
    (result.error instanceof Error && "code" in result.error && result.error.code === "ETIMEDOUT") ||
    (typeof result.signal === "string" && result.signal.length > 0 && result.status === null);

  return {
    command,
    exit_code: result.status ?? 1,
    duration_ms: durationMs,
    result: timedOut || result.status !== 0 || Boolean(result.error) ? "fail" : "pass",
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
    timedOut
  };
}

export function captureTaskState(cwd: string): CaptureResult {
  const snapshot = captureSnapshot(cwd);
  const verifier = buildCapturedVerifier(snapshot);

  writeVerifierFile(snapshot.verifierPath, verifier);

  return {
    targetRoot: snapshot.targetRoot,
    taskId: snapshot.taskId,
    worktreePath: snapshot.worktreePath,
    diffPath: snapshot.diffPath,
    verifierPath: snapshot.verifierPath,
    verifier
  };
}

export function runDeterministicChecks(cwd: string): CheckResult {
  const snapshot = captureSnapshot(cwd);
  const config = readCheckConfig(snapshot.targetRoot);
  const paths = getTaskPaths(snapshot.targetRoot, snapshot.taskId);
  const checkedAt = new Date().toISOString();
  const commandExecutions = config.commands.map((command) => executeCheckCommand(command, snapshot.worktreePath));
  const logSections = [
    "codex-harness check log",
    `task_id: ${snapshot.taskId}`,
    `worktree_path: ${snapshot.worktreePath}`,
    `captured_at: ${snapshot.capturedAt}`,
    `checked_at: ${checkedAt}`,
    `protected_path_violations: ${snapshot.protectedPathViolations.length}`,
    ""
  ];

  if (config.commands.length === 0) {
    logSections.push("No check commands were configured.");
    logSections.push("");
  } else {
    for (const execution of commandExecutions) {
      logSections.push(formatCommandLogSection(execution, snapshot.worktreePath));
    }
  }

  const hasCommandFailure = commandExecutions.some((command) => command.result === "fail");
  const result: VerifierResult =
    hasCommandFailure || snapshot.protectedPathViolations.length > 0 ? "fail" : "pass";
  const verifier: VerifierRecord = {
    task_id: snapshot.taskId,
    worktree_path: snapshot.worktreePath,
    result,
    captured_at: snapshot.capturedAt,
    checked_at: checkedAt,
    diff_path: toRepoRelative(snapshot.targetRoot, snapshot.diffPath),
    log_path: toRepoRelative(snapshot.targetRoot, paths.logPath),
    git_status_lines: snapshot.gitStatusLines,
    protected_paths: snapshot.protectedPaths,
    protected_path_violations: snapshot.protectedPathViolations,
    commands: commandExecutions.map(({ command, exit_code, duration_ms, result: commandResult }) => ({
      command,
      exit_code,
      duration_ms,
      result: commandResult
    }))
  };

  ensureVerifierParentPaths(paths);
  fs.writeFileSync(paths.logPath, `${logSections.join("\n")}\n`, "utf8");
  writeVerifierFile(snapshot.verifierPath, verifier);

  return {
    targetRoot: snapshot.targetRoot,
    taskId: snapshot.taskId,
    worktreePath: snapshot.worktreePath,
    diffPath: snapshot.diffPath,
    verifierPath: snapshot.verifierPath,
    logPath: paths.logPath,
    verifier
  };
}
