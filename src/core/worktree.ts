import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_PATH, DEFAULT_WORKTREE_ROOT } from "./paths";
import { hasValidHead, isSourceCheckoutDirty, runGitCommand, worktreePathExistsInGit } from "./git";
import {
  TaskState,
  getSingleTask,
  getTaskBranchRecordPath,
  getTaskWorktreeRecordPath,
  readTaskStateById,
  writeTaskState
} from "./tasks";

export interface WorktreeResult {
  targetRoot: string;
  taskId: string;
  branch: string;
  worktreePath: string;
  created: boolean;
  createdPaths: string[];
}

function readWorktreeRootFromConfig(targetRoot: string): string {
  const configPath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    return DEFAULT_WORKTREE_ROOT;
  }

  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  let currentSection = "";

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

    if (currentSection !== "worktree") {
      continue;
    }

    const rootMatch = /^root\s*=\s*"([^"]+)"$/.exec(trimmed);

    if (rootMatch) {
      return rootMatch[1];
    }
  }

  return DEFAULT_WORKTREE_ROOT;
}

function resolveConfiguredWorktreeRoot(targetRoot: string): string {
  return path.resolve(targetRoot, readWorktreeRootFromConfig(targetRoot));
}

function buildBranchName(taskId: string): string {
  return `task/${taskId}`;
}

function buildWorktreePath(targetRoot: string, taskId: string): string {
  return path.join(resolveConfiguredWorktreeRoot(targetRoot), path.basename(targetRoot), taskId);
}

function ensureHeadAndCleanCheckout(targetRoot: string): void {
  if (!hasValidHead(targetRoot)) {
    throw new Error("Source repository has no valid HEAD. Create an initial commit first.");
  }

  if (isSourceCheckoutDirty(targetRoot)) {
    throw new Error("Source checkout is dirty. Commit or stash non-harness changes before running `node bin/ch worktree`.");
  }
}

function updateStateWithWorktree(task: TaskState, branch: string, worktreePath: string): TaskState {
  return {
    ...task,
    branch,
    worktree: worktreePath,
    updated_at: new Date().toISOString()
  };
}

export function createOrResolveWorktree(cwd: string): WorktreeResult {
  const { targetRoot, task } = getSingleTask(cwd);
  ensureHeadAndCleanCheckout(targetRoot);

  const branch = task.branch ?? buildBranchName(task.task_id);
  const worktreePath = task.worktree ?? buildWorktreePath(targetRoot, task.task_id);
  const branchRecordPath = getTaskBranchRecordPath(targetRoot, task.task_id);
  const worktreeRecordPath = getTaskWorktreeRecordPath(targetRoot, task.task_id);

  if (fs.existsSync(branchRecordPath) && fs.existsSync(worktreeRecordPath)) {
    const recordedBranch = fs.readFileSync(branchRecordPath, "utf8").trim();
    const recordedWorktree = fs.readFileSync(worktreeRecordPath, "utf8").trim();

    if (recordedBranch !== branch || recordedWorktree !== worktreePath) {
      throw new Error("Recorded worktree metadata does not match the current task state.");
    }

    if (!fs.existsSync(recordedWorktree)) {
      throw new Error(`Recorded worktree path does not exist: ${recordedWorktree}`);
    }

    if (!worktreePathExistsInGit(targetRoot, recordedWorktree)) {
      throw new Error(`Recorded worktree is not registered with git: ${recordedWorktree}`);
    }

    return {
      targetRoot,
      taskId: task.task_id,
      branch: recordedBranch,
      worktreePath: recordedWorktree,
      created: false,
      createdPaths: [path.relative(targetRoot, branchRecordPath), path.relative(targetRoot, worktreeRecordPath)]
    };
  }

  if (fs.existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  const addResult = runGitCommand(targetRoot, ["worktree", "add", "-b", branch, worktreePath, "HEAD"]);

  if (addResult.error) {
    throw addResult.error;
  }

  if (addResult.status !== 0) {
    throw new Error(addResult.stderr.trim() || "git worktree add failed");
  }

  fs.writeFileSync(branchRecordPath, `${branch}\n`, "utf8");
  fs.writeFileSync(worktreeRecordPath, `${worktreePath}\n`, "utf8");

  const nextState = updateStateWithWorktree(readTaskStateById(targetRoot, task.task_id), branch, worktreePath);
  writeTaskState(targetRoot, task.task_id, nextState);

  return {
    targetRoot,
    taskId: task.task_id,
    branch,
    worktreePath,
    created: true,
    createdPaths: [path.relative(targetRoot, branchRecordPath), path.relative(targetRoot, worktreeRecordPath)]
  };
}
