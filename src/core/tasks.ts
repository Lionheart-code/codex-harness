import * as fs from "node:fs";
import * as path from "node:path";
import { detectInstalledLayer } from "./install";
import { detectGitRepository } from "./git";
import { BRANCH_RECORD_FILE, WORKTREE_RECORD_FILE, createTaskId, getTaskTargetPaths, TASKS_DIR } from "./paths";

export interface TaskState {
  task_id: string;
  title: string;
  status: "created";
  created_at: string;
  updated_at: string;
  phase: "3";
  spec: "spec.md";
  acceptance: "acceptance.md";
  branch?: string;
  worktree?: string;
}

export interface TaskCreationPreview {
  targetRoot: string;
  taskId: string;
  targetPaths: string[];
}

export interface TaskCreationResult {
  targetRoot: string;
  taskId: string;
  createdPaths: string[];
}

export interface TaskListResult {
  targetRoot: string;
  tasks: TaskState[];
}

export function requireInstalledTargetRoot(cwd: string): string {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("This command must run inside a git repository.");
  }

  if (!detectInstalledLayer(gitStatus.rootPath)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  return gitStatus.rootPath;
}

function buildState(taskId: string, title: string, timestamp: string): TaskState {
  return {
    task_id: taskId,
    title,
    status: "created",
    created_at: timestamp,
    updated_at: timestamp,
    phase: "3",
    spec: "spec.md",
    acceptance: "acceptance.md"
  };
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

function readTaskState(statePath: string): TaskState {
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as TaskState;
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

export function previewTaskCreation(cwd: string, title: string): TaskCreationPreview {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const taskId = createTaskId(title);

  return {
    targetRoot,
    taskId,
    targetPaths: getTaskTargetPaths(taskId)
  };
}

export function createTask(cwd: string, title: string): TaskCreationResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const taskId = createTaskId(title);
  const taskDirectory = getTaskDirectory(targetRoot, taskId);

  if (fs.existsSync(taskDirectory)) {
    throw new Error(`Task already exists: ${path.join(TASKS_DIR, taskId)}`);
  }

  const timestamp = new Date().toISOString();
  const state = buildState(taskId, title, timestamp);
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
      tasks: []
    };
  }

  const tasks = fs
    .readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(tasksRoot, entry.name, "state.json"))
    .filter((statePath) => fs.existsSync(statePath) && fs.statSync(statePath).isFile())
    .map((statePath) => readTaskState(statePath))
    .sort((left, right) => left.task_id.localeCompare(right.task_id));

  return {
    targetRoot,
    tasks
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
