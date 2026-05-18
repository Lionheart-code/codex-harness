import * as fs from "node:fs";
import * as path from "node:path";
import { AGENT_RUN_STATUS_FILE, TASK_AGENTS_DIR, TASK_PROMPTS_DIR } from "./paths";
import { listTasks } from "./tasks";

export type AgentRunStatus = "raw";

export interface AgentRunRecord {
  run_id: string;
  task_id: string;
  role: string;
  profile: string;
  status: AgentRunStatus;
  prompt_path: string;
  output_path: string;
  created_at: string;
  updated_at: string;
  notes: string;
  command_metadata?: Record<string, unknown>;
}

export interface AgentRecordInput {
  role: string;
  output: string;
  profile?: string;
  prompt?: string;
  notes?: string;
}

export interface AgentRecordResult {
  targetRoot: string;
  taskId: string;
  runId: string;
  runDirectory: string;
  metadataPath: string;
  promptPath: string;
  outputPath: string;
  inferredPrompt: boolean;
}

export interface AgentListResult {
  targetRoot: string;
  taskId: string;
  runs: AgentRunRecord[];
  warnings: string[];
}

function getSingleTaskForLedger(cwd: string): { targetRoot: string; taskId: string } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Phase 8 `ch agent` requires exactly one task.");
  }

  return {
    targetRoot: result.targetRoot,
    taskId: result.tasks[0].task_id
  };
}

function getTaskAgentsDirectory(targetRoot: string, taskId: string): string {
  return path.join(targetRoot, ".harness", "tasks", taskId, TASK_AGENTS_DIR);
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function getNextRunId(agentsDir: string): string {
  if (!fs.existsSync(agentsDir)) {
    return "run-0001";
  }

  const numbers = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^run-(\d{4,})$/.exec(entry.name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));

  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  return `run-${String(next).padStart(4, "0")}`;
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function isPathWithin(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function resolveAbsolutePath(basePath: string, candidatePath: string): string {
  return path.isAbsolute(candidatePath) ? path.resolve(candidatePath) : path.resolve(basePath, candidatePath);
}

function validatePromptPath(targetRoot: string, promptPath: string): string {
  const absolutePromptPath = resolveAbsolutePath(targetRoot, promptPath);

  if (!isPathWithin(targetRoot, absolutePromptPath)) {
    throw new Error("Prompt path must stay inside the target repository.");
  }

  return absolutePromptPath;
}

function validateOutputPath(runDir: string, outputPath: string): string {
  const absoluteOutputPath = resolveAbsolutePath(runDir, outputPath);

  if (!isPathWithin(runDir, absoluteOutputPath)) {
    throw new Error("Output path must stay inside the agent run directory.");
  }

  return absoluteOutputPath;
}

function buildMalformedRunWarning(targetRoot: string, statusPath: string, runError: unknown): string {
  const message = runError instanceof Error ? runError.message : String(runError);
  return `Skipped malformed agent run: ${toRepoRelative(targetRoot, statusPath)} (${message})`;
}

function parseRecord(statusPath: string): AgentRunRecord {
  const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8")) as Partial<AgentRunRecord>;

  if (
    typeof parsed.run_id !== "string" ||
    typeof parsed.task_id !== "string" ||
    typeof parsed.role !== "string" ||
    typeof parsed.profile !== "string" ||
    parsed.status !== "raw" ||
    typeof parsed.prompt_path !== "string" ||
    typeof parsed.output_path !== "string" ||
    typeof parsed.created_at !== "string" ||
    typeof parsed.updated_at !== "string" ||
    typeof parsed.notes !== "string"
  ) {
    throw new Error("missing required agent-run fields");
  }

  return parsed as AgentRunRecord;
}

function resolvePromptPath(targetRoot: string, taskId: string, role: string, prompt?: string): { path: string; inferred: boolean } {
  if (prompt && prompt.trim().length > 0) {
    const absolutePrompt = validatePromptPath(targetRoot, prompt);
    return {
      path: toRepoRelative(targetRoot, absolutePrompt),
      inferred: false
    };
  }

  if (role.startsWith("scout-")) {
    return {
      path: toPortablePath(path.join(".harness", "tasks", taskId, TASK_PROMPTS_DIR, `${role}.md`)),
      inferred: true
    };
  }

  return {
    path: "",
    inferred: false
  };
}

function resolveOutputPath(targetRoot: string, runDir: string, output: string): string {
  const absoluteOutput = validateOutputPath(runDir, output);
  return toRepoRelative(targetRoot, absoluteOutput);
}

function getMetadataPath(runDir: string): string {
  return path.join(runDir, AGENT_RUN_STATUS_FILE);
}

export function recordAgentRun(cwd: string, input: AgentRecordInput): AgentRecordResult {
  const { targetRoot, taskId } = getSingleTaskForLedger(cwd);
  const agentsDir = getTaskAgentsDirectory(targetRoot, taskId);
  const runId = getNextRunId(agentsDir);
  const runDirectory = path.join(agentsDir, runId);
  const metadataPath = getMetadataPath(runDirectory);
  const timestamp = new Date().toISOString();
  const promptResolution = resolvePromptPath(targetRoot, taskId, input.role, input.prompt);
  const outputPath = resolveOutputPath(targetRoot, runDirectory, input.output);

  const record: AgentRunRecord = {
    run_id: runId,
    task_id: taskId,
    role: input.role,
    profile: input.profile ?? "",
    status: "raw",
    prompt_path: promptResolution.path,
    output_path: outputPath,
    created_at: timestamp,
    updated_at: timestamp,
    notes: input.notes ?? ""
  };

  fs.mkdirSync(runDirectory, { recursive: true });
  fs.writeFileSync(metadataPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return {
    targetRoot,
    taskId,
    runId,
    runDirectory,
    metadataPath,
    promptPath: record.prompt_path,
    outputPath: record.output_path,
      inferredPrompt: promptResolution.inferred
    };
}

export function listAgentRuns(cwd: string): AgentListResult {
  const { targetRoot, taskId } = getSingleTaskForLedger(cwd);
  const agentsDir = getTaskAgentsDirectory(targetRoot, taskId);

  if (!fs.existsSync(agentsDir)) {
    return {
      targetRoot,
      taskId,
      runs: [],
      warnings: []
    };
  }

  const warnings: string[] = [];
  const runs = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(agentsDir, entry.name, AGENT_RUN_STATUS_FILE))
    .filter((statusPath) => fs.existsSync(statusPath) && fs.statSync(statusPath).isFile())
    .flatMap((statusPath) => {
      try {
        return [parseRecord(statusPath)];
      } catch (runError) {
        warnings.push(buildMalformedRunWarning(targetRoot, statusPath, runError));
        return [];
      }
    })
    .sort((left, right) => left.run_id.localeCompare(right.run_id));

  return {
    targetRoot,
    taskId,
    runs,
    warnings
  };
}
