import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_PATH, DEFAULT_WORKTREE_ROOT } from "./paths";
import { hasValidHead, isSourceCheckoutDirty, runGitCommand, worktreePathExistsInGit } from "./git";
import { RunStagingDatabase, resolveHarnessRoots, writeCompatibilityRunArtifacts } from "./run-staging-db";
import {
  TaskState,
  getSingleTask,
  getTaskBranchRecordPath,
  getTaskWorktreeRecordPath,
  readTaskStateById,
  requireInstalledTargetRoot,
  listTasks,
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

export interface WorktreeDeleteResult {
  targetRoot: string;
  runId: string;
  worktreePath: string;
  lifecycleStatus: string;
  removed: boolean;
  manualOverrideRecorded: boolean;
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

function branchExists(targetRoot: string, branch: string): boolean {
  const result = runGitCommand(targetRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return result.status === 0;
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

  const addArgs = branchExists(targetRoot, branch)
    ? ["worktree", "add", worktreePath, branch]
    : ["worktree", "add", "-b", branch, worktreePath, "HEAD"];
  const addResult = runGitCommand(targetRoot, addArgs);

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

export function deleteWorktreeForRun(
  cwd: string,
  runId: string,
  manualOverrideReason?: string
): WorktreeDeleteResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const roots = resolveHarnessRoots(targetRoot);
  const staging = new RunStagingDatabase(roots.targetRoot, roots.projectRoot, runId);
  const run = staging.loadRun(runId);

  if (!run) {
    throw new Error(`Run not found in staging DB: ${runId}`);
  }

  const worktreePath = run.repository.task_worktree_path;
  if (!worktreePath || worktreePath.trim().length === 0) {
    throw new Error(`Run ${runId} does not record a task worktree path.`);
  }

  if (run.lifecycle_status !== "harvested" && run.lifecycle_status !== "discarded" && !manualOverrideReason) {
    throw new Error(
      `Run ${runId} cannot delete its worktree while lifecycle status is ${run.lifecycle_status}. Harvest, discard, or pass --manual-override <reason>.`
    );
  }

  if (manualOverrideReason) {
    const updatedRun = staging.recordManualOverride(runId, manualOverrideReason);
    writeCompatibilityRunArtifacts(targetRoot, updatedRun);
  }

  const removeArgs = manualOverrideReason || run.lifecycle_status === "harvested" || run.lifecycle_status === "discarded"
    ? ["worktree", "remove", "--force", worktreePath]
    : ["worktree", "remove", worktreePath];
  const removeResult = runGitCommand(targetRoot, removeArgs);

  if (removeResult.error) {
    throw removeResult.error;
  }

  if (removeResult.status !== 0) {
    throw new Error(removeResult.stderr.trim() || "git worktree remove failed");
  }

  const taskList = listTasks(targetRoot);
  if (taskList.tasks.length === 1 && taskList.tasks[0].worktree === worktreePath) {
    const task = taskList.tasks[0];
    const nextState: TaskState = {
      ...task,
      worktree: undefined,
      updated_at: new Date().toISOString()
    };
    writeTaskState(targetRoot, task.task_id, nextState);
    const worktreeRecordPath = getTaskWorktreeRecordPath(targetRoot, task.task_id);
    if (fs.existsSync(worktreeRecordPath)) {
      fs.rmSync(worktreeRecordPath, { force: true });
    }
  }

  return {
    targetRoot,
    runId,
    worktreePath,
    lifecycleStatus: run.lifecycle_status,
    removed: true,
    manualOverrideRecorded: Boolean(manualOverrideReason)
  };
}
