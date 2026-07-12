import * as fs from "node:fs";
import * as path from "node:path";
import { detectInstalledLayer } from "./install";
import { detectGitRepository } from "./git";
import { BRANCH_RECORD_FILE, WORKTREE_RECORD_FILE, createTaskId, getTaskTargetPaths, TASKS_DIR } from "./paths";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata, validateOptionalSchemaMetadata } from "./schema-migrations";

export type TaskType = "bugfix" | "feature" | "refactor" | "architecture" | "docs" | "deployment";

export interface TaskState {
  schema_version?: typeof CURRENT_SCHEMA_VERSION;
  producer_command?: string;
  task_id: string;
  title: string;
  status: "created";
  created_at: string;
  updated_at: string;
  phase: "3";
  spec: "spec.md";
  acceptance: "acceptance.md";
  task_type?: TaskType;
  branch?: string;
  worktree?: string;
  base_commit_sha?: string;
}

export interface TaskCreationPreview {
  targetRoot: string;
  taskId: string;
  targetPaths: string[];
  taskType?: TaskType;
}

export interface TaskCreationResult {
  targetRoot: string;
  taskId: string;
  createdPaths: string[];
}

export interface TaskListResult {
  targetRoot: string;
  tasks: TaskState[];
  warnings: string[];
}

export const TASK_TYPES: TaskType[] = [
  "bugfix",
  "feature",
  "refactor",
  "architecture",
  "docs",
  "deployment"
];

export interface TaskCreationOptions {
  taskType?: TaskType;
}

export function isTaskType(value: string): value is TaskType {
  return TASK_TYPES.includes(value as TaskType);
}

export function requireGitTargetRoot(cwd: string): string {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("This command must run inside a git repository.");
  }

  return gitStatus.rootPath;
}

export function requireInstalledTargetRoot(cwd: string): string {
  const targetRoot = requireGitTargetRoot(cwd);

  if (!detectInstalledLayer(targetRoot)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  return targetRoot;
}

function buildState(
  taskId: string,
  title: string,
  timestamp: string,
  taskType?: TaskType
): TaskState {
  const state: TaskState = {
    ...buildSchemaMetadata("node bin/ch init"),
    task_id: taskId,
    title,
    status: "created",
    created_at: timestamp,
    updated_at: timestamp,
    phase: "3",
    spec: "spec.md",
    acceptance: "acceptance.md"
  };

  if (taskType) {
    state.task_type = taskType;
  }

  return state;
}

export function parseTaskState(statePath: string): TaskState {
  const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<TaskState> & Record<string, unknown>;

  validateOptionalSchemaMetadata(parsed, `Task state ${statePath}`);

  if (
    typeof parsed.task_id !== "string" ||
    typeof parsed.title !== "string" ||
    parsed.status !== "created" ||
    typeof parsed.created_at !== "string" ||
    typeof parsed.updated_at !== "string" ||
    parsed.phase !== "3" ||
    parsed.spec !== "spec.md" ||
    parsed.acceptance !== "acceptance.md"
  ) {
    throw new Error("missing required task-state fields");
  }

  if (parsed.task_type !== undefined && !isTaskType(parsed.task_type)) {
    throw new Error(`unsupported task_type: ${String(parsed.task_type)}`);
  }

  if (parsed.branch !== undefined && typeof parsed.branch !== "string") {
    throw new Error("invalid branch value");
  }

  if (parsed.worktree !== undefined && typeof parsed.worktree !== "string") {
    throw new Error("invalid worktree value");
  }

  if (parsed.base_commit_sha !== undefined && (typeof parsed.base_commit_sha !== "string" || parsed.base_commit_sha.trim().length === 0)) {
    throw new Error("invalid base_commit_sha value");
  }

  return parsed as TaskState;
}

function buildMalformedTaskWarning(targetRoot: string, statePath: string, taskError: unknown): string {
  const message = taskError instanceof Error ? taskError.message : String(taskError);
  return `Skipped malformed task state: ${path.relative(targetRoot, statePath)} (${message})`;
}

function readTaskState(statePath: string): TaskState {
  return parseTaskState(statePath);
}

function buildSpecMarkdown(taskId: string, title: string, timestamp: string): string {
  return [
    `# ${title}`,
    "",
    `- Task ID: \`${taskId}\``,
    `- Created: \`${timestamp}\``,
    "",
    "## Task Details",
    "",
    "- TODO: describe the task details."
  ].join("\n") + "\n";
}

function buildAcceptanceMarkdown(): string {
  return [
    "# Acceptance",
    "",
    "- [ ] Define acceptance criteria.",
    "- [ ] Run required checks.",
    "- [ ] Confirm the checklist reflects actual results."
  ].join("\n") + "\n";
}

export function getTaskDirectory(targetRoot: string, taskId: string): string {
  return path.join(targetRoot, TASKS_DIR, taskId);
}

export function getTaskStatePath(targetRoot: string, taskId: string): string {
  return path.join(getTaskDirectory(targetRoot, taskId), "state.json");
}

export function getTaskBranchRecordPath(targetRoot: string, taskId: string): string {
  return path.join(getTaskDirectory(targetRoot, taskId), BRANCH_RECORD_FILE);
}

export function getTaskWorktreeRecordPath(targetRoot: string, taskId: string): string {
  return path.join(getTaskDirectory(targetRoot, taskId), WORKTREE_RECORD_FILE);
}

export function readTaskStateById(targetRoot: string, taskId: string): TaskState {
  return readTaskState(getTaskStatePath(targetRoot, taskId));
}

export function writeTaskState(targetRoot: string, taskId: string, state: TaskState): void {
  fs.writeFileSync(getTaskStatePath(targetRoot, taskId), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function previewTaskCreation(
  cwd: string,
  title: string,
  options: TaskCreationOptions = {}
): TaskCreationPreview {
  const targetRoot = requireGitTargetRoot(cwd);
  const taskId = createTaskId(title);

  return {
    targetRoot,
    taskId,
    targetPaths: getTaskTargetPaths(taskId),
    taskType: options.taskType
  };
}

export function createTask(
  cwd: string,
  title: string,
  options: TaskCreationOptions = {}
): TaskCreationResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const taskId = createTaskId(title);
  const taskDirectory = getTaskDirectory(targetRoot, taskId);

  if (fs.existsSync(taskDirectory)) {
    throw new Error(`Task already exists: ${path.join(TASKS_DIR, taskId)}`);
  }

  const timestamp = new Date().toISOString();
  const state = buildState(taskId, title, timestamp, options.taskType);
  const specPath = path.join(taskDirectory, "spec.md");
  const acceptancePath = path.join(taskDirectory, "acceptance.md");
  const statePath = getTaskStatePath(targetRoot, taskId);

  fs.mkdirSync(taskDirectory, { recursive: true });
  fs.writeFileSync(specPath, buildSpecMarkdown(taskId, title, timestamp), "utf8");
  fs.writeFileSync(acceptancePath, buildAcceptanceMarkdown(), "utf8");
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  return {
    targetRoot,
    taskId,
    createdPaths: getTaskTargetPaths(taskId)
  };
}

export function listTasks(cwd: string): TaskListResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const tasksRoot = path.join(targetRoot, TASKS_DIR);

  if (!fs.existsSync(tasksRoot)) {
    return {
      targetRoot,
      tasks: [],
      warnings: []
    };
  }

  const warnings: string[] = [];
  const tasks = fs
    .readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(tasksRoot, entry.name, "state.json"))
    .filter((statePath) => fs.existsSync(statePath) && fs.statSync(statePath).isFile())
    .flatMap((statePath) => {
      try {
        return [readTaskState(statePath)];
      } catch (taskError) {
        warnings.push(buildMalformedTaskWarning(targetRoot, statePath, taskError));
        return [];
      }
    })
    .sort((left, right) => left.task_id.localeCompare(right.task_id));

  return {
    targetRoot,
    tasks,
    warnings
  };
}

export function getSingleTask(cwd: string): { targetRoot: string; task: TaskState } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Phase 4 `ch worktree` requires exactly one task.");
  }

  return {
    targetRoot: result.targetRoot,
    task: result.tasks[0]
  };
}
