import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export interface PreparedSuccessorCleanupEvidence {
  schema_version: 1;
  producer_command: string;
  decision_id: string;
  thread_id: string;
  thread_link: string;
  project_id: string;
  cwd: string;
  branch: string;
  immutable_base: string;
  task_state_id: string;
  task_state_path: string;
  task_state_hash: string;
  archived_at: string;
  archive_readback: {
    thread_id: string;
    archived: true;
    managed_worktree_absent: true;
    observed_cwd: string;
  };
  worktree_absent: boolean;
  successor_run_absent: boolean;
  activation_commit_absent: boolean;
}

export interface PreparedSuccessorCleanupReceipt {
  receipt_id: string;
  decision_id: string;
  status: "prepared" | "complete" | "partial" | "blocked";
  original_branch: string;
  recovery_branch: string;
  original_task_state_path: string;
  archived_task_state_path: string;
  task_state_hash: string;
  completed_steps: string[];
  next_action: string;
}

export function validatePreparedSuccessorCleanupEvidence(value: unknown): PreparedSuccessorCleanupEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Prepared-successor cleanup evidence must be an object.");
  const evidence = value as PreparedSuccessorCleanupEvidence;
  for (const field of ["decision_id", "thread_id", "thread_link", "project_id", "cwd", "branch", "immutable_base", "task_state_id", "task_state_path", "task_state_hash", "archived_at"] as const) {
    if (typeof evidence[field] !== "string" || !evidence[field].trim()) throw new Error(`Prepared-successor cleanup evidence is missing ${field}.`);
  }
  if (!evidence.archive_readback || evidence.archive_readback.thread_id !== evidence.thread_id
    || evidence.archive_readback.archived !== true || evidence.archive_readback.managed_worktree_absent !== true
    || evidence.archive_readback.observed_cwd !== evidence.cwd) {
    throw new Error("HANDOFF_CLEANUP_BLOCKED: archived Desktop thread readback does not match the successor identity.");
  }
  if (!evidence.worktree_absent || !evidence.successor_run_absent || !evidence.activation_commit_absent) {
    throw new Error("HANDOFF_CLEANUP_BLOCKED: successor must have no worktree, run, or activation commit.");
  }
  return evidence;
}

export function buildPreparedSuccessorCleanupReceipt(targetRoot: string, evidence: PreparedSuccessorCleanupEvidence): PreparedSuccessorCleanupReceipt {
  const branchParts = evidence.branch.split("/").filter(Boolean);
  const leaf = branchParts[branchParts.length - 1] ?? "successor";
  const decisionShort = evidence.decision_id.replace(/[^a-zA-Z0-9]/gu, "").slice(0, 12).toLowerCase();
  const archived = path.join(targetRoot, ".harness", "archive", "prepared-successors", evidence.decision_id, evidence.task_state_id);
  const identity = JSON.stringify({ decision_id: evidence.decision_id, task_state_hash: evidence.task_state_hash, branch: evidence.branch });
  return {
    receipt_id: `prepared-successor-cleanup-${createHash("sha256").update(identity).digest("hex")}`,
    decision_id: evidence.decision_id,
    status: "prepared",
    original_branch: evidence.branch,
    recovery_branch: `codex/recovery/${decisionShort}-${leaf}`,
    original_task_state_path: evidence.task_state_path,
    archived_task_state_path: path.relative(targetRoot, archived).replace(/\\/gu, "/"),
    task_state_hash: evidence.task_state_hash,
    completed_steps: [],
    next_action: "journal the receipt before recoverably quarantining branch and TaskState"
  };
}

export function readPreparedSuccessorCleanupEvidence(filePath: string): PreparedSuccessorCleanupEvidence {
  return validatePreparedSuccessorCleanupEvidence(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
}
