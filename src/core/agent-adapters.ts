import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { reserveAgentRun, updateAgentRunRecord } from "./agent-ledger";
import {
  AGENT_RUN_COMMAND_FILE,
  AGENT_RUN_LOG_FILE,
  AGENT_RUN_OUTPUT_FILE,
  AGENT_RUN_PROMPT_FILE,
  CONFIG_PATH
} from "./paths";
import { renderScoutPromptForPaths, type ScoutRole, isScoutRole } from "./prompts";
import { assertSupportedSchemaVersion } from "./schema-migrations";
import { listTasks, type TaskState } from "./tasks";

type AdapterTransport = "manual_prompt" | "cli";
type WorkingDirectoryPolicy = "repo_root" | "task_worktree" | "explicit_path";
type PermissionMode = "read_only";
type OutputContract = "markdown";

interface AgentAdapterProfile {
  agentId: string;
  transport: AdapterTransport;
  command: string;
  args: string[];
  workingDirectoryPolicy: WorkingDirectoryPolicy;
  explicitPath?: string;
  permissionMode: PermissionMode;
  allowedRoles: ScoutRole[];
  outputContract: OutputContract;
  timeoutSeconds: number;
  requiresHumanConfirmation: boolean;
}

interface PreparedAgentRun {
  targetRoot: string;
  task: TaskState;
  agentId: string;
  requestedRole: ScoutRole;
  profile: AgentAdapterProfile;
  runId: string;
  runDirectory: string;
  metadataPath: string;
  promptPath: string;
  outputPath: string;
  logPath: string;
  commandPath: string;
  promptPathRelative: string;
  outputPathRelative: string;
  logPathRelative: string;
  commandSpec: AgentCommandSpec;
}

interface AgentCommandSpec {
  command: string;
  args: string[];
  cwd: string;
  timeout_seconds: number;
  shell: false;
  capture_stdout: true;
  capture_stderr: true;
  prompt_path: string;
  output_path: string;
  log_path: string;
}

export interface AgentPromptResult {
  targetRoot: string;
  taskId: string;
  agentId: string;
  role: ScoutRole;
  transport: AdapterTransport;
  runId: string;
  runDirectory: string;
  promptPath: string;
  outputPath: string;
  logPath: string;
  commandPath: string;
  cwd: string;
  timeoutSeconds: number;
  commandPreview: string;
  requiresHumanConfirmation: boolean;
}

export interface AgentRunExecutionResult extends AgentPromptResult {
  exitCode: number;
  durationMs: number;
}

interface CommandExecutionOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  signal: string;
  spawnError?: string;
}

export interface AdapterProfileSchemaMetadata {
  schemaVersion?: number;
  producerCommand?: string;
}

const ALLOWED_PLACEHOLDERS = new Set(["prompt_path", "output_path", "log_path", "cwd"]);

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function isPathWithin(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function getSingleTaskWithWorktree(cwd: string): { targetRoot: string; task: TaskState } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Phase 10 `ch agent` requires exactly one task.");
  }

  const task = result.tasks[0];

  if (!task.worktree) {
    throw new Error("Task worktree is not ready. Run `node bin/ch worktree` first.");
  }

  return {
    targetRoot: result.targetRoot,
    task
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

export function listAdapterProfileIds(targetRoot: string): string[] {
  const configPath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    return [];
  }

  return fs
    .readFileSync(configPath, "utf8")
    .split(/\r?\n/)
    .map((line) => /^\[agents\.([^\]]+)\]$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1])
    .sort((left, right) => left.localeCompare(right));
}

function parseAdapterProfileRaw(lines: string[], agentId: string): Record<string, unknown> {
  let inSection = false;
  const sectionName = `agents.${agentId}`;
  const raw: Record<string, unknown> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);

    if (sectionMatch) {
      inSection = sectionMatch[1] === sectionName;
      continue;
    }

    if (!inSection) {
      continue;
    }

    const keyValueMatch = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(trimmed);

    if (!keyValueMatch) {
      throw new Error(`Malformed adapter profile line in ${CONFIG_PATH}: ${trimmed}`);
    }

    const [, key, rawValue] = keyValueMatch;

    switch (key) {
      case "transport":
      case "command":
      case "working_directory_policy":
      case "explicit_path":
      case "permission_mode":
      case "output_contract":
        raw[key] = parseQuotedString(rawValue);
        break;
      case "args":
      case "allowed_roles":
        raw[key] = parseStringArray(rawValue);
        break;
      case "timeout_seconds":
        raw[key] = parseInteger(rawValue);
        break;
      case "requires_human_confirmation":
        raw[key] = parseBoolean(rawValue);
        break;
      case "schema_version":
        raw[key] = parseInteger(rawValue);
        break;
      case "producer_command":
        raw[key] = parseQuotedString(rawValue);
        break;
      default:
        break;
    }
  }

  if (Object.keys(raw).length === 0) {
    throw new Error(`Adapter profile not found: ${agentId}. Add [agents.${agentId}] to ${CONFIG_PATH}.`);
  }

  return raw;
}

export function readAdapterProfileSchemaMetadata(targetRoot: string, agentId: string): AdapterProfileSchemaMetadata {
  const configPath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const raw = parseAdapterProfileRaw(lines, agentId);

  return {
    schemaVersion: typeof raw.schema_version === "number" ? raw.schema_version : undefined,
    producerCommand: typeof raw.producer_command === "string" ? raw.producer_command : undefined
  };
}

function isTransport(value: string): value is AdapterTransport {
  return value === "manual_prompt" || value === "cli";
}

function isWorkingDirectoryPolicy(value: string): value is WorkingDirectoryPolicy {
  return value === "repo_root" || value === "task_worktree" || value === "explicit_path";
}

function validateAllowedRoles(roles: string[]): ScoutRole[] {
  if (roles.length === 0) {
    throw new Error("Adapter profile is missing allowed_roles.");
  }

  const validated: ScoutRole[] = [];

  for (const role of roles) {
    if (!isScoutRole(role)) {
      throw new Error(`Unsupported adapter role: ${role}`);
    }

    validated.push(role);
  }

  return validated;
}

export function readAdapterProfile(targetRoot: string, agentId: string): AgentAdapterProfile {
  const configPath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const raw = parseAdapterProfileRaw(lines, agentId);

  assertSupportedSchemaVersion(raw.schema_version, `Adapter profile ${agentId}`);

  if (raw.schema_version !== undefined && typeof raw.producer_command !== "string") {
    throw new Error(`Adapter profile ${agentId} is missing producer_command for schema_version 1.`);
  }

  if (typeof raw.transport !== "string" || !isTransport(raw.transport)) {
    throw new Error(`Adapter profile ${agentId} has an invalid transport.`);
  }

  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    throw new Error(`Adapter profile ${agentId} is missing command.`);
  }

  if (!Array.isArray(raw.args)) {
    throw new Error(`Adapter profile ${agentId} is missing args.`);
  }

  if (typeof raw.working_directory_policy !== "string" || !isWorkingDirectoryPolicy(raw.working_directory_policy)) {
    throw new Error(`Adapter profile ${agentId} has an invalid working_directory_policy.`);
  }

  if (raw.working_directory_policy === "explicit_path" && typeof raw.explicit_path !== "string") {
    throw new Error(`Adapter profile ${agentId} requires explicit_path.`);
  }

  if (raw.permission_mode !== "read_only") {
    throw new Error(`Adapter profile ${agentId} must use permission_mode = "read_only" in Phase 10.`);
  }

  if (raw.output_contract !== "markdown") {
    throw new Error(`Adapter profile ${agentId} must use output_contract = "markdown" in Phase 10.`);
  }

  if (typeof raw.timeout_seconds !== "number" || raw.timeout_seconds <= 0) {
    throw new Error(`Adapter profile ${agentId} has an invalid timeout_seconds.`);
  }

  if (typeof raw.requires_human_confirmation !== "boolean") {
    throw new Error(`Adapter profile ${agentId} is missing requires_human_confirmation.`);
  }

  return {
    agentId,
    transport: raw.transport,
    command: raw.command,
    args: raw.args,
    workingDirectoryPolicy: raw.working_directory_policy,
    explicitPath: typeof raw.explicit_path === "string" ? raw.explicit_path : undefined,
    permissionMode: "read_only",
    allowedRoles: validateAllowedRoles(raw.allowed_roles as string[]),
    outputContract: "markdown",
    timeoutSeconds: raw.timeout_seconds,
    requiresHumanConfirmation: raw.requires_human_confirmation
  };
}

function resolveCommandCwd(targetRoot: string, task: TaskState, profile: AgentAdapterProfile): string {
  switch (profile.workingDirectoryPolicy) {
    case "repo_root":
      return targetRoot;
    case "task_worktree":
      return path.resolve(task.worktree ?? "");
    case "explicit_path": {
      const candidatePath = path.resolve(targetRoot, profile.explicitPath ?? "");

      if (isPathWithin(targetRoot, candidatePath)) {
        return candidatePath;
      }

      if (task.worktree && (candidatePath === task.worktree || isPathWithin(task.worktree, candidatePath))) {
        return candidatePath;
      }

      throw new Error("Adapter explicit_path must stay inside the target repository or current task worktree.");
    }
  }
}

function validateArgPlaceholders(args: string[]): void {
  for (const arg of args) {
    const matches = arg.matchAll(/\{([a-z_]+)\}/g);

    for (const match of matches) {
      if (!ALLOWED_PLACEHOLDERS.has(match[1])) {
        throw new Error(`Unsupported adapter argument placeholder: {${match[1]}}`);
      }
    }
  }
}

function substituteArgTemplates(args: string[], values: Record<string, string>): string[] {
  return args.map((arg) =>
    arg.replace(/\{([a-z_]+)\}/g, (_, key: string) => values[key] ?? `{${key}}`)
  );
}

function stringifyCommandPreview(spec: AgentCommandSpec): string {
  return [spec.command, ...spec.args].map((segment) => (/\s/.test(segment) ? JSON.stringify(segment) : segment)).join(" ");
}

function buildCommandMetadata(
  profile: AgentAdapterProfile,
  spec: AgentCommandSpec,
  outcome?: CommandExecutionOutcome
): Record<string, unknown> {
  return {
    agent_id: profile.agentId,
    transport: profile.transport,
    permission_mode: profile.permissionMode,
    working_directory_policy: profile.workingDirectoryPolicy,
    output_contract: profile.outputContract,
    timeout_seconds: profile.timeoutSeconds,
    requires_human_confirmation: profile.requiresHumanConfirmation,
    command: spec.command,
    args: spec.args,
    cwd: spec.cwd,
    shell: spec.shell,
    capture_stdout: spec.capture_stdout,
    capture_stderr: spec.capture_stderr,
    prompt_path: spec.prompt_path,
    output_path: spec.output_path,
    log_path: spec.log_path,
    exit_code: outcome?.exitCode ?? null,
    duration_ms: outcome?.durationMs ?? null,
    timed_out: outcome?.timedOut ?? false,
    signal: outcome?.signal ?? "",
    spawn_error: outcome?.spawnError ?? ""
  };
}

function buildExecutionLog(spec: AgentCommandSpec, outcome: CommandExecutionOutcome): string {
  const lines = [
    "codex-harness agent run log",
    `command: ${stringifyCommandPreview(spec)}`,
    `cwd: ${spec.cwd}`,
    `timeout_seconds: ${spec.timeout_seconds}`,
    `exit_code: ${outcome.exitCode}`,
    `timed_out: ${outcome.timedOut ? "true" : "false"}`,
    `signal: ${outcome.signal || "(none)"}`,
    `duration_ms: ${outcome.durationMs}`
  ];

  if (outcome.spawnError) {
    lines.push(`spawn_error: ${outcome.spawnError}`);
  }

  lines.push("", "stderr:");
  lines.push(outcome.stderr.length > 0 ? outcome.stderr : "(none)");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function executeCommand(spec: AgentCommandSpec): CommandExecutionOutcome {
  const startedAt = Date.now();
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd,
    encoding: "utf8",
    shell: false,
    timeout: spec.timeout_seconds * 1000
  });
  const durationMs = Date.now() - startedAt;
  const spawnError = result.error ? result.error.message : undefined;
  const timedOut =
    (result.error instanceof Error && "code" in result.error && result.error.code === "ETIMEDOUT") ||
    (typeof result.signal === "string" && result.signal.length > 0 && result.status === null);

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
    durationMs,
    timedOut,
    signal: result.signal ?? "",
    spawnError
  };
}

function prepareAgentRun(cwd: string, agentId: string, requestedRole: string): PreparedAgentRun {
  if (!isScoutRole(requestedRole)) {
    throw new Error(`Unsupported scout role: ${requestedRole}`);
  }

  const { targetRoot, task } = getSingleTaskWithWorktree(cwd);
  const profile = readAdapterProfile(targetRoot, agentId);

  if (!profile.allowedRoles.includes(requestedRole)) {
    throw new Error(`Adapter profile ${agentId} does not allow role: ${requestedRole}`);
  }

  validateArgPlaceholders(profile.args);

  const commandCwd = resolveCommandCwd(targetRoot, task, profile);
  const ledgerRole = `scout-${requestedRole}`;
  const reservation = reserveAgentRun(cwd, {
    role: ledgerRole,
    output: AGENT_RUN_OUTPUT_FILE,
    profile: agentId,
    inferPrompt: false
  });
  const promptPath = path.join(reservation.runDirectory, AGENT_RUN_PROMPT_FILE);
  const commandPath = path.join(reservation.runDirectory, AGENT_RUN_COMMAND_FILE);
  const outputPath = path.join(reservation.runDirectory, AGENT_RUN_OUTPUT_FILE);
  const logPath = path.join(reservation.runDirectory, AGENT_RUN_LOG_FILE);
  const renderedPrompt = renderScoutPromptForPaths(
    cwd,
    requestedRole,
    reservation.runDirectory,
    reservation.runDirectory,
    outputPath
  );
  const commandSpec: AgentCommandSpec = {
    command: profile.command,
    args: substituteArgTemplates(profile.args, {
      prompt_path: promptPath,
      output_path: outputPath,
      log_path: logPath,
      cwd: commandCwd
    }),
    cwd: commandCwd,
    timeout_seconds: profile.timeoutSeconds,
    shell: false,
    capture_stdout: true,
    capture_stderr: true,
    prompt_path: promptPath,
    output_path: outputPath,
    log_path: logPath
  };

  fs.writeFileSync(promptPath, renderedPrompt.content, "utf8");
  fs.writeFileSync(commandPath, `${JSON.stringify(commandSpec, null, 2)}\n`, "utf8");

  updateAgentRunRecord(reservation.metadataPath, (record) => ({
    ...record,
    prompt_path: toRepoRelative(targetRoot, promptPath),
    output_path: toRepoRelative(targetRoot, outputPath),
    updated_at: new Date().toISOString(),
    command_metadata: buildCommandMetadata(profile, commandSpec)
  }));

  return {
    targetRoot,
    task,
    agentId,
    requestedRole,
    profile,
    runId: reservation.runId,
    runDirectory: reservation.runDirectory,
    metadataPath: reservation.metadataPath,
    promptPath,
    outputPath,
    logPath,
    commandPath,
    promptPathRelative: toRepoRelative(targetRoot, promptPath),
    outputPathRelative: toRepoRelative(targetRoot, outputPath),
    logPathRelative: toRepoRelative(targetRoot, logPath),
    commandSpec
  };
}

function toPromptResult(prepared: PreparedAgentRun): AgentPromptResult {
  return {
    targetRoot: prepared.targetRoot,
    taskId: prepared.task.task_id,
    agentId: prepared.agentId,
    role: prepared.requestedRole,
    transport: prepared.profile.transport,
    runId: prepared.runId,
    runDirectory: toRepoRelative(prepared.targetRoot, prepared.runDirectory),
    promptPath: prepared.promptPathRelative,
    outputPath: prepared.outputPathRelative,
    logPath: prepared.logPathRelative,
    commandPath: toRepoRelative(prepared.targetRoot, prepared.commandPath),
    cwd: prepared.commandSpec.cwd,
    timeoutSeconds: prepared.profile.timeoutSeconds,
    commandPreview: stringifyCommandPreview(prepared.commandSpec),
    requiresHumanConfirmation: prepared.profile.requiresHumanConfirmation
  };
}

export function generateAgentPrompt(cwd: string, agentId: string, requestedRole: string): AgentPromptResult {
  const prepared = prepareAgentRun(cwd, agentId, requestedRole);
  return toPromptResult(prepared);
}

export function executeAgentRun(cwd: string, agentId: string, requestedRole: string): AgentRunExecutionResult {
  const { targetRoot } = getSingleTaskWithWorktree(cwd);
  const profile = readAdapterProfile(targetRoot, agentId);

  if (profile.transport !== "cli") {
    throw new Error(`Adapter profile ${agentId} must use transport = "cli" for \`ch agent run\`.`);
  }

  const prepared = prepareAgentRun(cwd, agentId, requestedRole);
  const outcome = executeCommand(prepared.commandSpec);

  fs.writeFileSync(prepared.outputPath, outcome.stdout, "utf8");
  fs.writeFileSync(prepared.logPath, buildExecutionLog(prepared.commandSpec, outcome), "utf8");

  updateAgentRunRecord(prepared.metadataPath, (record) => ({
    ...record,
    updated_at: new Date().toISOString(),
    command_metadata: buildCommandMetadata(prepared.profile, prepared.commandSpec, outcome)
  }));

  if (outcome.timedOut) {
    throw new Error(`Agent command timed out after ${prepared.profile.timeoutSeconds} seconds.`);
  }

  if (outcome.spawnError) {
    throw new Error(`Agent command failed to start: ${outcome.spawnError}`);
  }

  if (outcome.exitCode !== 0) {
    throw new Error(`Agent command exited with status ${outcome.exitCode}.`);
  }

  return {
    ...toPromptResult(prepared),
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs
  };
}
