import * as fs from "node:fs";
import * as path from "node:path";
import { createTaskId } from "./paths";
import { sha256Hex } from "./evidence-types";
import {
  buildTaskState,
  openVerifiedTaskStateStore,
  type TaskState
} from "./tasks";

export interface ZeroOwnerMaterializationInput {
  projectRoot: string;
  worktreePath: string;
  branch: string;
  baseCommitSha: string;
  taskPath: string;
  taskContractIdentity: `sha256:${string}`;
  pointerContents: string;
  dryRun?: boolean;
}

export interface ZeroOwnerMaterializationResult {
  task_state_id: string;
  created_owner: boolean;
  task_state: TaskState;
}

function samePath(left: string | undefined, right: string): boolean {
  const canonical = (value: string): string => {
    try {
      return fs.realpathSync.native(value);
    } catch {
      return path.resolve(value);
    }
  };
  return typeof left === "string" && canonical(left) === canonical(right);
}

export function materializeZeroOwnerTaskState(
  input: ZeroOwnerMaterializationInput
): ZeroOwnerMaterializationResult {
  const taskContractPath = path.join(input.worktreePath, input.taskPath);
  if (!fs.existsSync(taskContractPath) || !fs.statSync(taskContractPath).isFile()) {
    throw new Error("zero_owner_materialization_task_contract_missing");
  }
  const actualTaskIdentity = `sha256:${sha256Hex(fs.readFileSync(taskContractPath))}`;
  if (actualTaskIdentity !== input.taskContractIdentity) {
    throw new Error("zero_owner_materialization_task_contract_identity_mismatch");
  }
  const store = openVerifiedTaskStateStore(input.projectRoot);
  const all = store.enumerate();
  const exact = all.filter((state) =>
    state.branch === input.branch && samePath(state.worktree, input.worktreePath));
  const conflicts = all.filter((state) =>
    state.branch === input.branch || samePath(state.worktree, input.worktreePath));
  if (exact.length > 1 || (exact.length === 0 && conflicts.length > 0)) {
    throw new Error("zero_owner_materialization_ambiguous_ownership");
  }
  if (exact.length === 1) {
    const owner = exact[0];
    if (owner.base_commit_sha !== input.baseCommitSha) {
      throw new Error("zero_owner_materialization_base_conflict");
    }
    if (owner.task_path !== input.taskPath) {
      throw new Error("zero_owner_materialization_task_contract_conflict");
    }
    const pointerPath = path.join(input.worktreePath, "TASK.md");
    if (!fs.existsSync(pointerPath)
      || fs.readFileSync(pointerPath, "utf8") !== input.pointerContents) {
      throw new Error("zero_owner_materialization_pointer_readback_mismatch");
    }
    return { task_state_id: owner.task_id, created_owner: false, task_state: owner };
  }

  const timestamp = new Date().toISOString();
  const taskId = createTaskId(`Successor ${input.branch}`);
  const state: TaskState = {
    ...buildTaskState(taskId, `Successor ${input.branch}`, timestamp, "deployment"),
    branch: input.branch,
    worktree: fs.realpathSync.native(input.worktreePath),
    base_commit_sha: input.baseCommitSha,
    task_path: input.taskPath
  };
  if (input.dryRun) {
    return { task_state_id: taskId, created_owner: true, task_state: state };
  }

  const pointerPath = path.join(input.worktreePath, "TASK.md");
  const priorPointer = fs.existsSync(pointerPath) ? fs.readFileSync(pointerPath) : undefined;
  let created = false;
  try {
    store.createNew(state);
    created = true;
    fs.writeFileSync(pointerPath, input.pointerContents, "utf8");
    if (fs.readFileSync(pointerPath, "utf8") !== input.pointerContents) {
      throw new Error("zero_owner_materialization_pointer_readback_mismatch");
    }
    const readback = store.read(taskId);
    if (readback.branch !== input.branch || !samePath(readback.worktree, input.worktreePath)
      || readback.base_commit_sha !== input.baseCommitSha
      || readback.task_path !== input.taskPath) {
      throw new Error("zero_owner_materialization_owner_readback_mismatch");
    }
    return { task_state_id: taskId, created_owner: true, task_state: readback };
  } catch (error) {
    if (created) store.removeCreated(taskId);
    if (priorPointer === undefined) {
      if (fs.existsSync(pointerPath)) fs.unlinkSync(pointerPath);
    } else {
      fs.writeFileSync(pointerPath, priorPointer);
    }
    throw error;
  }
}
