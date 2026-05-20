import * as fs from "node:fs";
import * as path from "node:path";
import { formatCommandForDisplay, runStructuredCommand, type StructuredCommandSpec } from "./command-runner";
import { getGitDiffPatch, getGitStatusLines, getGitStatusPaths } from "./git";
import { CONFIG_PATH, TASK_CHECK_LOG_FILE, TASK_DIFF_FILE, TASK_LOGS_DIR, TASK_VERIFIER_FILE } from "./paths";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata, validateOptionalSchemaMetadata } from "./schema-migrations";
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
  schema_version?: typeof CURRENT_SCHEMA_VERSION;
  producer_command?: string;
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

export interface CheckCommandSpec extends StructuredCommandSpec {
  source: "legacy" | "structured";
  displayCommand: string;
}

export interface CheckConfig {
  commands: CheckCommandSpec[];
  protectedPaths: string[];
}

interface CommandExecutionResult extends CheckCommandRecord {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  shell: boolean;
}

export const DEFAULT_PROTECTED_PATHS = ["AGENTS.md", ".harness/config.toml"];
export const DEFAULT_CHECK_TIMEOUT_SECONDS = 120;

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

function parseBoolean(value: string): boolean | undefined {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function parseInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function containsLegacyShellSyntax(command: string): boolean {
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    const next = command[index + 1] ?? "";

    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (
      character === "|" ||
      character === ";" ||
      character === "<" ||
      character === ">" ||
      character === "`" ||
      (character === "&" && next === "&") ||
      (character === "|" && next === "|") ||
      (character === "$" && next === "(")
    ) {
      return true;
    }
  }

  return false;
}

function tokenizeLegacyCommand(command: string): string[] {
  if (containsLegacyShellSyntax(command)) {
    throw new Error(
      "Legacy `[checks].commands` entries must not use shell syntax. Use structured `[[checks.commands]]` with `shell = true` when shell behavior is required."
    );
  }

  const tokens: string[] = [];
  let quote: "'" | '"' | undefined;
  let current = "";
  let tokenStarted = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      tokenStarted = true;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += character;
    tokenStarted = true;
  }

  if (quote) {
    throw new Error("Legacy `[checks].commands` contains an unterminated quoted string.");
  }

  if (tokenStarted) {
    tokens.push(current);
  }

  return tokens;
}

function normalizeLegacyCheckCommands(commands: string[]): CheckCommandSpec[] {
  return commands.map((rawCommand) => {
    if (rawCommand.trim().length === 0) {
      throw new Error("The `[checks].commands` entries must not be empty or whitespace-only.");
    }

    const tokens = tokenizeLegacyCommand(rawCommand);

    if (tokens.length === 0) {
      throw new Error("The `[checks].commands` entries must not be empty or whitespace-only.");
    }

    return {
      source: "legacy",
      command: tokens[0],
      args: tokens.slice(1),
      cwd: "",
      timeout_seconds: DEFAULT_CHECK_TIMEOUT_SECONDS,
      shell: false,
      capture_stdout: true,
      capture_stderr: true,
      displayCommand: rawCommand
    };
  });
}

function buildStructuredCheckCommand(raw: Record<string, unknown>, index: number): CheckCommandSpec {
  if (raw.cwd !== undefined) {
    throw new Error("The `[[checks.commands]]` entries must not set `cwd`; the harness derives it from the task worktree.");
  }

  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    throw new Error(`The \`[[checks.commands]]\` entry #${index} is missing command.`);
  }

  if (!Array.isArray(raw.args) || !raw.args.every((entry) => typeof entry === "string")) {
    throw new Error(`The \`[[checks.commands]]\` entry #${index} must define args as a string array.`);
  }

  if (typeof raw.timeout_seconds !== "number" || raw.timeout_seconds <= 0) {
    throw new Error(`The \`[[checks.commands]]\` entry #${index} must define a positive timeout_seconds.`);
  }

  if (raw.shell !== undefined && typeof raw.shell !== "boolean") {
    throw new Error(`The \`[[checks.commands]]\` entry #${index} has an invalid shell value.`);
  }

  return {
    source: "structured",
    command: raw.command,
    args: [...(raw.args as string[])],
    cwd: "",
    timeout_seconds: raw.timeout_seconds,
    shell: raw.shell ?? false,
    capture_stdout: true,
    capture_stderr: true,
    displayCommand: formatCommandForDisplay(raw.command, raw.args as string[])
  };
}

export interface CheckConfigInspection extends CheckConfig {
  commandsFormat: "empty" | "legacy" | "structured";
  protectedPathsSource: "default" | "configured";
}

export function inspectCheckConfig(targetRoot: string): CheckConfigInspection {
  const configPath = path.join(targetRoot, CONFIG_PATH);
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  let currentSection = "";
  let legacyCommands: string[] | undefined;
  const structuredCommands: Array<Record<string, unknown>> = [];
  let protectedPaths: string[] | undefined;
  let currentStructuredCommand: Record<string, unknown> | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const arraySectionMatch = /^\[\[([^\]]+)\]\]$/.exec(trimmed);

    if (arraySectionMatch) {
      currentSection = arraySectionMatch[1];
      if (currentSection === "checks.commands") {
        currentStructuredCommand = {};
        structuredCommands.push(currentStructuredCommand);
      } else {
        currentStructuredCommand = undefined;
      }
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);

    if (sectionMatch) {
      currentSection = sectionMatch[1];
      currentStructuredCommand = undefined;
      continue;
    }

    const keyValueMatch = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(trimmed);

    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;

    if (currentSection === "checks") {
      if (key === "commands") {
        legacyCommands = parseStringArray(rawValue);
        if (!legacyCommands) {
          throw new Error("The `[checks].commands` value must be a string array.");
        }
      }

      if (key === "protected_paths") {
        protectedPaths = parseStringArray(rawValue);
        if (!protectedPaths) {
          throw new Error("The `[checks].protected_paths` value must be a string array.");
        }
      }

      continue;
    }

    if (currentSection === "checks.commands" && currentStructuredCommand) {
      switch (key) {
        case "command":
          currentStructuredCommand.command = parseQuotedString(rawValue);
          break;
        case "args":
          currentStructuredCommand.args = parseStringArray(rawValue);
          break;
        case "timeout_seconds":
          currentStructuredCommand.timeout_seconds = parseInteger(rawValue);
          break;
        case "shell":
          currentStructuredCommand.shell = parseBoolean(rawValue);
          break;
        case "cwd":
          currentStructuredCommand.cwd = parseQuotedString(rawValue);
          break;
        default:
          throw new Error(`Unsupported key in [[checks.commands]]: ${key}`);
      }
    }
  }

  if (legacyCommands && structuredCommands.length > 0) {
    throw new Error(
      "Use either legacy `[checks].commands` or structured `[[checks.commands]]`, not both in the same config."
    );
  }

  const normalizedCommands =
    legacyCommands !== undefined
      ? normalizeLegacyCheckCommands(legacyCommands)
      : structuredCommands.map((entry, index) => buildStructuredCheckCommand(entry, index + 1));

  return {
    commands: normalizedCommands,
    commandsFormat:
      legacyCommands !== undefined ? "legacy" : structuredCommands.length > 0 ? "structured" : "empty",
    protectedPaths: protectedPaths ?? DEFAULT_PROTECTED_PATHS,
    protectedPathsSource: protectedPaths ? "configured" : "default"
  };
}

function parseQuotedString(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
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

export function validateVerifierRecord(value: unknown): VerifierRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Verifier record must be a JSON object.");
  }

  const record = value as Record<string, unknown>;
  validateOptionalSchemaMetadata(record, "verifier.json");

  if (
    typeof record.task_id !== "string" ||
    typeof record.worktree_path !== "string" ||
    (record.result !== "captured" && record.result !== "pass" && record.result !== "fail") ||
    typeof record.captured_at !== "string" ||
    typeof record.checked_at !== "string" ||
    typeof record.diff_path !== "string" ||
    typeof record.log_path !== "string" ||
    !Array.isArray(record.git_status_lines) ||
    !record.git_status_lines.every((entry) => typeof entry === "string") ||
    !Array.isArray(record.protected_paths) ||
    !record.protected_paths.every((entry) => typeof entry === "string") ||
    !Array.isArray(record.protected_path_violations) ||
    !record.protected_path_violations.every((entry) => typeof entry === "string") ||
    !Array.isArray(record.commands)
  ) {
    throw new Error("Verifier record is missing required fields.");
  }

  for (const command of record.commands) {
    if (
      !command ||
      typeof command !== "object" ||
      typeof command.command !== "string" ||
      typeof command.exit_code !== "number" ||
      typeof command.duration_ms !== "number" ||
      (command.result !== "pass" && command.result !== "fail")
    ) {
      throw new Error("Verifier record has invalid command entries.");
    }
  }

  return record as unknown as VerifierRecord;
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
  const config = inspectCheckConfig(targetRoot);
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
    ...buildSchemaMetadata("node bin/ch capture"),
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
    `shell: ${execution.shell ? "true" : "false"}`,
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

function executeCheckCommand(command: CheckCommandSpec, cwd: string): CommandExecutionResult {
  const result = runStructuredCommand({
    ...command,
    cwd
  });
  return {
    command: command.displayCommand,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    result: result.timedOut || result.exitCode !== 0 || Boolean(result.spawnError) ? "fail" : "pass",
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    shell: command.shell
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
  const config = inspectCheckConfig(snapshot.targetRoot);
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
    ...buildSchemaMetadata("node bin/ch check"),
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
