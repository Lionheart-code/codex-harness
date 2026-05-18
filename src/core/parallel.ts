import * as fs from "node:fs";
import * as path from "node:path";
import {
  getGitStatusLines,
  getGitStatusPaths,
  hasValidHead,
  isSourceCheckoutDirty,
  runGitCommand,
  worktreePathExistsInGit
} from "./git";
import {
  CONFIG_PATH,
  PARALLEL_INTEGRATOR_PROMPT_FILE,
  PARALLEL_PLAN_FILE,
  TASK_DIFF_FILE,
  TASK_PARALLEL_DIR,
  TASK_REVIEW_FILE,
  TASK_RESULT_FILE,
  TASK_VERIFIER_FILE
} from "./paths";
import { loadTaskReviewRecord } from "./review";
import { getTaskDirectory, listTasks, type TaskState } from "./tasks";

type ParallelPlanStatus = "open" | "closed";

export interface ParallelPlanInput {
  workers: string[];
  claims: string[];
  integratorClaims: string[];
}

interface NormalizedWorkerLayout {
  workerId: string;
  claims: string[];
}

interface ParsedPlanLayout {
  targetRoot: string;
  task: TaskState;
  integratorClaims: string[];
  workers: NormalizedWorkerLayout[];
}

export interface ParallelWorkerRecord {
  worker_id: string;
  branch: string;
  worktree_path: string;
  claims: string[];
  prompt_path: string;
}

export interface ParallelPlanRecord {
  task_id: string;
  integrator_worktree_path: string;
  integrator_claims: string[];
  status: ParallelPlanStatus;
  created_at: string;
  closed_at: string;
  workers: ParallelWorkerRecord[];
}

export interface ParallelPlanResult {
  targetRoot: string;
  taskId: string;
  planPath: string;
  parallelDirectory: string;
  integratorPromptPath: string;
  created: boolean;
  status: ParallelPlanStatus;
  workers: ParallelWorkerRecord[];
  integratorClaims: string[];
}

export interface ParallelWorkerStatus {
  workerId: string;
  branch: string;
  worktreePath: string;
  claims: string[];
  promptPath: string;
  exists: boolean;
  registered: boolean;
  dirty: boolean;
}

export interface ParallelStatusResult {
  targetRoot: string;
  taskId: string;
  planPath: string;
  status: ParallelPlanStatus;
  integratorWorktreePath: string;
  integratorClaims: string[];
  workers: ParallelWorkerStatus[];
  healthy: boolean;
}

export interface ParallelCloseResult {
  targetRoot: string;
  taskId: string;
  planPath: string;
  closedAt: string;
  status: ParallelPlanStatus;
}

interface ParallelPaths {
  parallelDirectory: string;
  planPath: string;
  integratorPromptPath: string;
}

function getSingleTaskForParallel(cwd: string): { targetRoot: string; task: TaskState } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Phase 16 `ch parallel` requires exactly one task.");
  }

  return {
    targetRoot: result.targetRoot,
    task: result.tasks[0]
  };
}

function readWorktreeRootFromConfig(targetRoot: string): string {
  const configPath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    return "../.codex-harness-worktrees";
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

  return "../.codex-harness-worktrees";
}

function resolveConfiguredWorktreeRoot(targetRoot: string): string {
  return path.resolve(targetRoot, readWorktreeRootFromConfig(targetRoot));
}

function normalizeForComparison(targetPath: string): string {
  return process.platform === "win32" ? targetPath.toLowerCase() : targetPath;
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function normalizeClaim(claim: string): string {
  const portable = toPortablePath(claim).replace(/^\.\/+/, "").replace(/\/+$/, "");
  // Claims are normalized case-insensitively so boundary checks fail closed
  // across Windows, macOS, and mixed-case user input.
  return portable.toLowerCase();
}

function claimsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function isManagedClaim(normalizedClaim: string): boolean {
  return (
    normalizedClaim === ".harness" ||
    normalizedClaim.startsWith(".harness/") ||
    normalizedClaim === ".codex" ||
    normalizedClaim.startsWith(".codex/") ||
    normalizedClaim === ".agents" ||
    normalizedClaim.startsWith(".agents/") ||
    normalizedClaim === "schemas" ||
    normalizedClaim.startsWith("schemas/") ||
    normalizedClaim === "migrations" ||
    normalizedClaim.startsWith("migrations/") ||
    normalizedClaim === "agents.md"
  );
}

function ensureHeadAndCleanCheckout(targetRoot: string): void {
  if (!hasValidHead(targetRoot)) {
    throw new Error("Source repository has no valid HEAD. Create an initial commit first.");
  }

  if (isSourceCheckoutDirty(targetRoot)) {
    throw new Error("Source checkout is dirty. Commit or stash non-harness changes before running `node bin/ch parallel plan`.");
  }
}

function ensureTaskWorktreeReady(task: TaskState): string {
  if (!task.worktree || task.worktree.trim().length === 0) {
    throw new Error("Task worktree is not ready. Run `node bin/ch worktree` first.");
  }

  if (!fs.existsSync(task.worktree)) {
    throw new Error(`Recorded worktree path does not exist: ${task.worktree}`);
  }

  return task.worktree;
}

function ensureWorktreeClean(worktreePath: string, label: string): void {
  if (getGitStatusLines(worktreePath).length > 0) {
    throw new Error(`${label} is dirty. Commit or stash changes before continuing.`);
  }
}

function isValidWorkerId(workerId: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(workerId);
}

function buildParallelPaths(targetRoot: string, taskId: string): ParallelPaths {
  const taskDirectory = getTaskDirectory(targetRoot, taskId);
  const parallelDirectory = path.join(taskDirectory, TASK_PARALLEL_DIR);

  return {
    parallelDirectory,
    planPath: path.join(parallelDirectory, PARALLEL_PLAN_FILE),
    integratorPromptPath: path.join(parallelDirectory, PARALLEL_INTEGRATOR_PROMPT_FILE)
  };
}

function readPlanRecord(planPath: string): ParallelPlanRecord {
  const parsed = JSON.parse(fs.readFileSync(planPath, "utf8")) as Partial<ParallelPlanRecord>;

  if (
    typeof parsed.task_id !== "string" ||
    typeof parsed.integrator_worktree_path !== "string" ||
    !Array.isArray(parsed.integrator_claims) ||
    parsed.integrator_claims.some((entry) => typeof entry !== "string") ||
    (parsed.status !== "open" && parsed.status !== "closed") ||
    typeof parsed.created_at !== "string" ||
    typeof parsed.closed_at !== "string" ||
    !Array.isArray(parsed.workers)
  ) {
    throw new Error(`Invalid parallel plan artifact: ${planPath}`);
  }

  const workers = parsed.workers.map((worker) => {
    if (
      !worker ||
      typeof worker !== "object" ||
      typeof worker.worker_id !== "string" ||
      typeof worker.branch !== "string" ||
      typeof worker.worktree_path !== "string" ||
      typeof worker.prompt_path !== "string" ||
      !Array.isArray(worker.claims) ||
      worker.claims.some((entry) => typeof entry !== "string")
    ) {
      throw new Error(`Invalid parallel worker record in ${planPath}`);
    }

    return {
      worker_id: worker.worker_id,
      branch: worker.branch,
      worktree_path: worker.worktree_path,
      claims: worker.claims,
      prompt_path: worker.prompt_path
    };
  });

  return {
    task_id: parsed.task_id,
    integrator_worktree_path: parsed.integrator_worktree_path,
    integrator_claims: parsed.integrator_claims,
    status: parsed.status,
    created_at: parsed.created_at,
    closed_at: parsed.closed_at,
    workers
  };
}

function writePlanRecord(planPath: string, record: ParallelPlanRecord): void {
  fs.writeFileSync(planPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function parseClaimSpec(claimSpec: string): { workerId: string; claimPath: string } {
  const separatorIndex = claimSpec.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === claimSpec.length - 1) {
    throw new Error(`Invalid worker claim: ${claimSpec}. Use <worker-id>:<repo-relative-path>.`);
  }

  return {
    workerId: claimSpec.slice(0, separatorIndex),
    claimPath: claimSpec.slice(separatorIndex + 1)
  };
}

function resolveClaimPath(targetRoot: string, claimPath: string): string {
  if (path.isAbsolute(claimPath)) {
    throw new Error(`Claim must be repo-relative, not absolute: ${claimPath}`);
  }

  const candidatePath = path.resolve(targetRoot, claimPath);
  const relative = path.relative(targetRoot, candidatePath);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Claim must stay inside the target repository: ${claimPath}`);
  }

  const normalizedClaim = normalizeClaim(relative);

  if (normalizedClaim.length === 0) {
    throw new Error(`Claim must not resolve to the repository root: ${claimPath}`);
  }

  if (isManagedClaim(normalizedClaim)) {
    throw new Error(`Claim must not target harness-managed paths: ${claimPath}`);
  }

  return normalizedClaim;
}

function sortClaims(claims: string[]): string[] {
  return [...claims].sort((left, right) => left.localeCompare(right));
}

function normalizePlanLayout(cwd: string, input: ParallelPlanInput): ParsedPlanLayout {
  const { targetRoot, task } = getSingleTaskForParallel(cwd);
  ensureTaskWorktreeReady(task);

  if (input.workers.length < 2) {
    throw new Error("Parallel plan requires at least two workers.");
  }

  const seenWorkerIds = new Set<string>();

  for (const workerId of input.workers) {
    if (!isValidWorkerId(workerId)) {
      throw new Error(`Invalid worker id: ${workerId}. Use lowercase letters, numbers, and dashes only.`);
    }

    if (seenWorkerIds.has(workerId)) {
      throw new Error(`Duplicate worker id: ${workerId}`);
    }

    seenWorkerIds.add(workerId);
  }

  const workerClaims = new Map<string, string[]>();

  for (const workerId of input.workers) {
    workerClaims.set(workerId, []);
  }

  for (const claimSpec of input.claims) {
    const { workerId, claimPath } = parseClaimSpec(claimSpec);

    if (!seenWorkerIds.has(workerId)) {
      throw new Error(`Worker claim references an unknown worker: ${workerId}`);
    }

    const normalizedClaim = resolveClaimPath(targetRoot, claimPath);
    const claims = workerClaims.get(workerId) ?? [];

    if (claims.includes(normalizedClaim)) {
      throw new Error(`Duplicate claim for worker ${workerId}: ${claimPath}`);
    }

    claims.push(normalizedClaim);
    workerClaims.set(workerId, claims);
  }

  const workers = [...workerClaims.entries()]
    .map(([workerId, claims]) => ({
      workerId,
      claims: sortClaims(claims)
    }))
    .sort((left, right) => left.workerId.localeCompare(right.workerId));

  for (const worker of workers) {
    if (worker.claims.length === 0) {
      throw new Error(`Worker ${worker.workerId} requires at least one claim.`);
    }
  }

  for (let leftIndex = 0; leftIndex < workers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < workers.length; rightIndex += 1) {
      for (const leftClaim of workers[leftIndex].claims) {
        for (const rightClaim of workers[rightIndex].claims) {
          if (claimsOverlap(leftClaim, rightClaim)) {
            throw new Error(
              `Worker claims overlap: ${workers[leftIndex].workerId}:${leftClaim} and ${workers[rightIndex].workerId}:${rightClaim}`
            );
          }
        }
      }
    }
  }

  const integratorClaims: string[] = [];

  for (const claimPath of input.integratorClaims) {
    const normalizedClaim = resolveClaimPath(targetRoot, claimPath);

    if (integratorClaims.includes(normalizedClaim)) {
      throw new Error(`Duplicate integrator claim: ${claimPath}`);
    }

    integratorClaims.push(normalizedClaim);
  }

  return {
    targetRoot,
    task,
    integratorClaims: sortClaims(integratorClaims),
    workers
  };
}

function createWorkerBranchName(taskId: string, workerId: string): string {
  return `task/${taskId}-parallel/${workerId}`;
}

function buildWorkerWorktreePath(targetRoot: string, taskId: string, workerId: string): string {
  return path.join(resolveConfiguredWorktreeRoot(targetRoot), path.basename(targetRoot), taskId, "parallel", workerId);
}

function writeTextFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function buildWorkerPromptContent(task: TaskState, worker: ParallelWorkerRecord): string {
  return [
    `# Parallel Worker Prompt — ${worker.worker_id}`,
    "",
    "This is a manual Phase 16 worker scaffold.",
    "Do not execute external write-capable agents automatically from the harness.",
    "",
    `- Integrator task: \`${task.task_id}\``,
    `- Worker id: \`${worker.worker_id}\``,
    `- Worker branch: \`${worker.branch}\``,
    `- Worker worktree: \`${toPortablePath(worker.worktree_path)}\``,
    "",
    "Allowed file claims:",
    ...worker.claims.map((claim) => `- \`${claim}\``),
    "",
    "Rules:",
    "- Edit only inside the worker worktree.",
    "- Edit only inside the declared claim paths.",
    "- Do not merge branches.",
    "- Do not modify harness-managed paths.",
    "- Leave the worker worktree clean before handoff.",
    ""
  ].join("\n");
}

function buildIntegratorPromptContent(task: TaskState, record: ParallelPlanRecord): string {
  return [
    "# Parallel Integrator Prompt",
    "",
    "This is a manual Phase 16 integrator scaffold.",
    "",
    `- Integrator task: \`${task.task_id}\``,
    `- Integrator worktree: \`${toPortablePath(record.integrator_worktree_path)}\``,
    "",
    "Worker claims:",
    ...record.workers.map((worker) => `- ${worker.worker_id}: ${worker.claims.join(", ")}`),
    "",
    "Integrator claims:",
    ...(record.integrator_claims.length === 0
      ? ["- None declared."]
      : record.integrator_claims.map((claim) => `- \`${claim}\``)),
    "",
    "Final gate:",
    "- Produce the final integrator changes in the current task worktree.",
    "- Run `node bin/ch capture`, `node bin/ch check`, `node bin/ch review`, and `node bin/ch report`.",
    "- Run `node bin/ch parallel close` only after the final verifier and human review gate are satisfied.",
    ""
  ].join("\n");
}

function runGitOrThrow(cwd: string, args: string[]): void {
  const result = runGitCommand(cwd, args);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
}

function recordsMatchOpenPlan(record: ParallelPlanRecord, layout: ParsedPlanLayout): boolean {
  if (record.status !== "open") {
    return false;
  }

  if (record.task_id !== layout.task.task_id) {
    return false;
  }

  if (normalizeForComparison(record.integrator_worktree_path) !== normalizeForComparison(layout.task.worktree ?? "")) {
    return false;
  }

  if (record.integrator_claims.length !== layout.integratorClaims.length) {
    return false;
  }

  if (sortClaims(record.integrator_claims).join("|") !== layout.integratorClaims.join("|")) {
    return false;
  }

  const sortedWorkers = [...record.workers].sort((left, right) => left.worker_id.localeCompare(right.worker_id));

  if (sortedWorkers.length !== layout.workers.length) {
    return false;
  }

  for (let index = 0; index < sortedWorkers.length; index += 1) {
    if (sortedWorkers[index].worker_id !== layout.workers[index].workerId) {
      return false;
    }

    if (sortClaims(sortedWorkers[index].claims).join("|") !== layout.workers[index].claims.join("|")) {
      return false;
    }
  }

  return true;
}

function loadExistingOpenPlanOrThrow(layout: ParsedPlanLayout, paths: ParallelPaths): ParallelPlanResult | undefined {
  if (!fs.existsSync(paths.planPath)) {
    return undefined;
  }

  const record = readPlanRecord(paths.planPath);

  if (record.status === "closed") {
    throw new Error("Existing parallel plan is already closed.");
  }

  if (!recordsMatchOpenPlan(record, layout)) {
    throw new Error("Existing parallel plan does not match the requested worker and claim layout.");
  }

  const status = getParallelPlanStatusFromRecord(layout.targetRoot, record);

  if (!status.healthy) {
    throw new Error("Existing parallel plan is not reusable because recorded worker integrity is broken.");
  }

  return {
    targetRoot: layout.targetRoot,
    taskId: layout.task.task_id,
    planPath: paths.planPath,
    parallelDirectory: paths.parallelDirectory,
    integratorPromptPath: paths.integratorPromptPath,
    created: false,
    status: record.status,
    workers: record.workers,
    integratorClaims: record.integrator_claims
  };
}

function getParallelPlanStatusFromRecord(targetRoot: string, record: ParallelPlanRecord): ParallelStatusResult {
  const workers = record.workers.map((worker) => {
    const exists = fs.existsSync(worker.worktree_path);
    const registered = exists ? worktreePathExistsInGit(targetRoot, worker.worktree_path) : false;
    const dirty = exists && registered ? getGitStatusLines(worker.worktree_path).length > 0 : false;

    return {
      workerId: worker.worker_id,
      branch: worker.branch,
      worktreePath: worker.worktree_path,
      claims: worker.claims,
      promptPath: worker.prompt_path,
      exists,
      registered,
      dirty
    };
  });

  return {
    targetRoot,
    taskId: record.task_id,
    planPath: "",
    status: record.status,
    integratorWorktreePath: record.integrator_worktree_path,
    integratorClaims: record.integrator_claims,
    workers,
    healthy: workers.every((worker) => worker.exists && worker.registered)
  };
}

function collectTrackedChangedPaths(worktreePath: string): string[] {
  return sortClaims(
    getGitStatusLines(worktreePath)
      .filter((line) => !line.startsWith("?? "))
      .flatMap((line) => getGitStatusPaths([line]))
      .map((entry) => normalizeClaim(entry))
  );
}

function isClaimAllowed(allowedClaims: string[], changedPath: string): boolean {
  return allowedClaims.some((claim) => changedPath === claim || changedPath.startsWith(`${claim}/`));
}

export function createParallelPlan(cwd: string, input: ParallelPlanInput): ParallelPlanResult {
  const layout = normalizePlanLayout(cwd, input);
  const paths = buildParallelPaths(layout.targetRoot, layout.task.task_id);
  const existing = loadExistingOpenPlanOrThrow(layout, paths);

  if (existing) {
    return existing;
  }

  ensureHeadAndCleanCheckout(layout.targetRoot);
  ensureWorktreeClean(ensureTaskWorktreeReady(layout.task), "Integrator task worktree");

  const workers: ParallelWorkerRecord[] = layout.workers.map((worker) => {
    const branch = createWorkerBranchName(layout.task.task_id, worker.workerId);
    const worktreePath = buildWorkerWorktreePath(layout.targetRoot, layout.task.task_id, worker.workerId);

    if (fs.existsSync(worktreePath)) {
      throw new Error(`Parallel worker worktree path already exists: ${worktreePath}`);
    }

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    runGitOrThrow(layout.targetRoot, ["worktree", "add", "-b", branch, worktreePath, "HEAD"]);

    return {
      worker_id: worker.workerId,
      branch,
      worktree_path: worktreePath,
      claims: worker.claims,
      prompt_path: path.join(paths.parallelDirectory, `${worker.workerId}-prompt.md`)
    };
  });

  const record: ParallelPlanRecord = {
    task_id: layout.task.task_id,
    integrator_worktree_path: ensureTaskWorktreeReady(layout.task),
    integrator_claims: layout.integratorClaims,
    status: "open",
    created_at: new Date().toISOString(),
    closed_at: "",
    workers
  };

  fs.mkdirSync(paths.parallelDirectory, { recursive: true });
  writePlanRecord(paths.planPath, record);
  writeTextFile(paths.integratorPromptPath, buildIntegratorPromptContent(layout.task, record));

  for (const worker of workers) {
    writeTextFile(worker.prompt_path, buildWorkerPromptContent(layout.task, worker));
  }

  return {
    targetRoot: layout.targetRoot,
    taskId: layout.task.task_id,
    planPath: paths.planPath,
    parallelDirectory: paths.parallelDirectory,
    integratorPromptPath: paths.integratorPromptPath,
    created: true,
    status: record.status,
    workers: record.workers,
    integratorClaims: record.integrator_claims
  };
}

export function getParallelPlanStatus(cwd: string): ParallelStatusResult {
  const { targetRoot, task } = getSingleTaskForParallel(cwd);
  const paths = buildParallelPaths(targetRoot, task.task_id);

  if (!fs.existsSync(paths.planPath)) {
    throw new Error(`Parallel plan artifact not found: ${paths.planPath}`);
  }

  const record = readPlanRecord(paths.planPath);
  const result = getParallelPlanStatusFromRecord(targetRoot, record);

  return {
    ...result,
    planPath: paths.planPath
  };
}

function readVerifierResult(taskDirectory: string): { result: string; path: string } {
  const verifierPath = path.join(taskDirectory, TASK_VERIFIER_FILE);

  if (!fs.existsSync(verifierPath) || !fs.statSync(verifierPath).isFile()) {
    throw new Error(`Parallel close requires ${TASK_VERIFIER_FILE}: ${verifierPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(verifierPath, "utf8")) as { result?: unknown };

  if (typeof parsed.result !== "string") {
    throw new Error(`Verifier artifact is invalid: ${verifierPath}`);
  }

  return {
    result: parsed.result,
    path: verifierPath
  };
}

export function closeParallelPlan(cwd: string): ParallelCloseResult {
  const { targetRoot, task } = getSingleTaskForParallel(cwd);
  const paths = buildParallelPaths(targetRoot, task.task_id);

  if (!fs.existsSync(paths.planPath)) {
    throw new Error(`Parallel plan artifact not found: ${paths.planPath}`);
  }

  const record = readPlanRecord(paths.planPath);

  if (record.status !== "open") {
    throw new Error("Parallel plan is not open.");
  }

  const status = getParallelPlanStatusFromRecord(targetRoot, record);

  for (const worker of status.workers) {
    if (!worker.exists) {
      throw new Error(`Parallel worker worktree is missing: ${worker.worktreePath}`);
    }

    if (!worker.registered) {
      throw new Error(`Parallel worker worktree is not registered with git: ${worker.worktreePath}`);
    }

    if (worker.dirty) {
      throw new Error(`Parallel worker worktree is dirty: ${worker.worktreePath}`);
    }
  }

  const taskDirectory = getTaskDirectory(targetRoot, task.task_id);
  const diffPath = path.join(taskDirectory, TASK_DIFF_FILE);
  const reviewPath = path.join(taskDirectory, TASK_REVIEW_FILE);
  const resultPath = path.join(taskDirectory, TASK_RESULT_FILE);

  if (!fs.existsSync(diffPath) || !fs.statSync(diffPath).isFile()) {
    throw new Error(`Parallel close requires ${TASK_DIFF_FILE}: ${diffPath}`);
  }

  const verifier = readVerifierResult(taskDirectory);

  if (verifier.result !== "pass") {
    throw new Error(`Parallel close requires verifier result pass. Received: ${verifier.result}.`);
  }

  if (!fs.existsSync(reviewPath) || !fs.statSync(reviewPath).isFile()) {
    throw new Error(`Parallel close requires ${TASK_REVIEW_FILE}: ${reviewPath}`);
  }

  const review = loadTaskReviewRecord(reviewPath, task.task_id);

  if (review.result !== "PASS") {
    throw new Error(`Parallel close requires review result PASS. Received: ${review.result}.`);
  }

  if (!fs.existsSync(resultPath) || !fs.statSync(resultPath).isFile()) {
    throw new Error(`Parallel close requires ${TASK_RESULT_FILE}: ${resultPath}`);
  }

  const reportContent = fs.readFileSync(resultPath, "utf8");

  if (!/READY FOR HUMAN REVIEW/.test(reportContent)) {
    throw new Error("Parallel close requires the final report to contain READY FOR HUMAN REVIEW.");
  }

  const integratorWorktreePath = ensureTaskWorktreeReady(task);
  const changedTrackedPaths = collectTrackedChangedPaths(integratorWorktreePath);
  const allowedClaims = sortClaims([
    ...record.integrator_claims,
    ...record.workers.flatMap((worker) => worker.claims)
  ]);

  for (const changedPath of changedTrackedPaths) {
    if (!isClaimAllowed(allowedClaims, changedPath)) {
      throw new Error(`Final integrator changes fall outside declared claims: ${changedPath}`);
    }
  }

  const closedAt = new Date().toISOString();
  const nextRecord: ParallelPlanRecord = {
    ...record,
    status: "closed",
    closed_at: closedAt
  };

  writePlanRecord(paths.planPath, nextRecord);

  return {
    targetRoot,
    taskId: task.task_id,
    planPath: paths.planPath,
    closedAt,
    status: "closed"
  };
}
