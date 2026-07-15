import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { CONFIG_PATH, DEFAULT_WORKTREE_ROOT } from "./paths";
import { detectGitRepository, hasValidHead, isSourceCheckoutDirty, runGitCommand, worktreePathExistsInGit } from "./git";
import { RunStagingDatabase, resolveHarnessRoots, writeCompatibilityRunArtifacts } from "./run-staging-db";
import { readSelfHostingProcedureRegistry, SELF_HOSTING_PROCEDURE_REGISTRY_PATH } from "./self-hosting-procedures";
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

export interface WorktreeBootstrapOptions {
  dryRun?: boolean;
  verifyOnly?: boolean;
}

export interface WorktreeBootstrapResult {
  targetRoot: string;
  dryRun: boolean;
  verifyOnly: boolean;
  setupCommand: string;
  checks: string[];
  state: "preview" | "ready";
}

const WORKTREE_BOOTSTRAP_SCRIPT = "npm ci && npm run build";
const WORKTREE_BOOTSTRAP_COMMAND = "npm run worktree:bootstrap";
const WORKTREE_BOOTSTRAP_MARKER_PATH = "dist/.codex-harness-worktree-bootstrap.json";

interface WorktreeBootstrapMarker {
  schema_version: 2;
  head_commit: string;
  source_tree_id: string;
  lockfile_sha256: string;
  dist_cli_sha256: string;
}

function resolveBootstrapTargetRoot(cwd: string): string {
  const repository = detectGitRepository(cwd);
  if (!repository.available) {
    throw new Error(`git is unavailable: ${repository.error ?? "unknown error"}`);
  }
  if (!repository.insideWorkTree || !repository.rootPath) {
    throw new Error("Worktree bootstrap must run inside a git worktree.");
  }
  return repository.rootPath;
}

function requireBootstrapPathWithoutSymlinks(canonicalRoot: string, absolutePath: string, relativePath: string): void {
  const relativeToRoot = path.relative(canonicalRoot, absolutePath);
  let currentPath = canonicalRoot;

  for (const component of relativeToRoot.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, component);
    if (fs.lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`path must not contain a symbolic link: ${relativePath}`);
    }
  }
}

function requireReadableBootstrapFile(targetRoot: string, relativePath: string): string {
  const canonicalRoot = fs.realpathSync.native(targetRoot);
  const absolutePath = path.resolve(canonicalRoot, relativePath);
  const relativeToRoot = path.relative(canonicalRoot, absolutePath);
  if (relativeToRoot === ".." || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Bootstrap surface must stay inside the worktree: ${relativePath}`);
  }

  let canonicalPath: string;
  try {
    requireBootstrapPathWithoutSymlinks(canonicalRoot, absolutePath, relativePath);
    canonicalPath = fs.realpathSync.native(absolutePath);
    const canonicalRelative = path.relative(canonicalRoot, canonicalPath);
    if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelative)) {
      throw new Error("path resolves outside the worktree");
    }
    if (!fs.statSync(canonicalPath).isFile()) {
      throw new Error("not a regular file");
    }
    fs.accessSync(canonicalPath, fs.constants.R_OK);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bootstrap surface is not a readable regular file: ${relativePath} (${message})`);
  }

  return canonicalPath;
}

function requireBootstrapDirectory(targetRoot: string, relativePath: string): void {
  const canonicalRoot = fs.realpathSync.native(targetRoot);
  const absolutePath = path.resolve(canonicalRoot, relativePath);
  const relativeToRoot = path.relative(canonicalRoot, absolutePath);
  if (relativeToRoot === ".." || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Bootstrap dependency directory must stay inside the worktree: ${relativePath}`);
  }

  try {
    requireBootstrapPathWithoutSymlinks(canonicalRoot, absolutePath, relativePath);
    const canonicalPath = fs.realpathSync.native(absolutePath);
    const canonicalRelative = path.relative(canonicalRoot, canonicalPath);
    if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelative)) {
      throw new Error("path resolves outside the worktree");
    }
    if (!fs.statSync(canonicalPath).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bootstrap dependency directory is missing: ${relativePath} (${message})`);
  }
}

function requireCleanBootstrapCheckout(targetRoot: string): void {
  const status = runGitCommand(targetRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.error || status.status !== 0) {
    throw new Error("Unable to verify a clean worktree bootstrap checkout.");
  }
  if (status.stdout.trim().length > 0) {
    throw new Error(`Worktree bootstrap requires a clean checkout: ${status.stdout.trim()}`);
  }
}

function resolveBootstrapHeadCommit(targetRoot: string): string {
  const result = runGitCommand(targetRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (result.error || result.status !== 0 || result.stdout.trim().length === 0) {
    throw new Error("Unable to resolve the committed HEAD for worktree readiness.");
  }
  return result.stdout.trim();
}

function resolveBootstrapSourceTreeId(targetRoot: string): string {
  const result = runGitCommand(targetRoot, ["rev-parse", "--verify", "HEAD^{tree}"]);
  if (result.error || result.status !== 0 || result.stdout.trim().length === 0) {
    throw new Error("Unable to resolve the committed source tree for worktree readiness.");
  }
  return result.stdout.trim();
}

function hashBootstrapLockfile(targetRoot: string): string {
  const lockfilePath = requireReadableBootstrapFile(targetRoot, "package-lock.json");
  return createHash("sha256").update(fs.readFileSync(lockfilePath)).digest("hex");
}

function hashBootstrapCliOutput(targetRoot: string): string {
  const outputPath = requireReadableBootstrapFile(targetRoot, "dist/cli/index.js");
  return createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
}

function requireDependenciesMatchCommittedLockfile(targetRoot: string): void {
  requireBootstrapDirectory(targetRoot, "node_modules");
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund", "--json"], {
    cwd: targetRoot,
    encoding: "utf8",
    shell: false
  });
  if (result.error) {
    throw new Error(`Unable to verify installed dependencies against the committed package lockfile: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "npm ci --dry-run failed").trim();
    throw new Error(`Installed dependencies cannot be verified against the committed package lockfile: ${detail}`);
  }

  let report: unknown;
  try {
    const stdout = result.stdout.trim();
    const jsonStart = stdout.lastIndexOf("\n{");
    const reportText = jsonStart >= 0
      ? stdout.slice(jsonStart + 1)
      : stdout;
    report = JSON.parse(reportText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Installed dependency verification did not return JSON: ${message}`);
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Installed dependency verification did not return an npm change report.");
  }
  const changes = ["added", "changed", "removed"].map((field) => (report as Record<string, unknown>)[field]);
  if (changes.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
    throw new Error("Installed dependency verification returned an invalid npm change report.");
  }
  if (changes.some((value) => value !== 0)) {
    throw new Error("Installed dependencies do not match the committed package lockfile; run node bin/ch worktree bootstrap.");
  }
}

function requireWritableBootstrapMarkerPath(targetRoot: string): string {
  const canonicalRoot = fs.realpathSync.native(targetRoot);
  const markerPath = path.resolve(canonicalRoot, WORKTREE_BOOTSTRAP_MARKER_PATH);
  const relativeToRoot = path.relative(canonicalRoot, markerPath);
  if (relativeToRoot === ".." || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Bootstrap readiness marker must stay inside the worktree: ${WORKTREE_BOOTSTRAP_MARKER_PATH}`);
  }

  try {
    requireBootstrapPathWithoutSymlinks(canonicalRoot, path.dirname(markerPath), path.dirname(WORKTREE_BOOTSTRAP_MARKER_PATH));
    try {
      if (fs.lstatSync(markerPath).isSymbolicLink()) {
        throw new Error("path must not be a symbolic link");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bootstrap readiness marker cannot be written: ${WORKTREE_BOOTSTRAP_MARKER_PATH} (${message})`);
  }

  return markerPath;
}

function writeWorktreeBootstrapMarker(targetRoot: string): void {
  const markerPath = requireWritableBootstrapMarkerPath(targetRoot);
  requireDependenciesMatchCommittedLockfile(targetRoot);
  const marker: WorktreeBootstrapMarker = {
    schema_version: 2,
    head_commit: resolveBootstrapHeadCommit(targetRoot),
    source_tree_id: resolveBootstrapSourceTreeId(targetRoot),
    lockfile_sha256: hashBootstrapLockfile(targetRoot),
    dist_cli_sha256: hashBootstrapCliOutput(targetRoot)
  };
  fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, "utf8");
}

function requireCurrentWorktreeBootstrapMarker(targetRoot: string): void {
  const markerPath = requireReadableBootstrapFile(targetRoot, WORKTREE_BOOTSTRAP_MARKER_PATH);
  let marker: unknown;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Worktree bootstrap readiness marker is unreadable: ${message}`);
  }
  if (
    !marker
    || typeof marker !== "object"
    || Array.isArray(marker)
    || (marker as Record<string, unknown>).schema_version !== 2
    || typeof (marker as Record<string, unknown>).head_commit !== "string"
    || typeof (marker as Record<string, unknown>).source_tree_id !== "string"
    || typeof (marker as Record<string, unknown>).lockfile_sha256 !== "string"
    || typeof (marker as Record<string, unknown>).dist_cli_sha256 !== "string"
  ) {
    throw new Error("Worktree bootstrap readiness marker is invalid.");
  }
  const typedMarker = marker as WorktreeBootstrapMarker;
  if (typedMarker.head_commit !== resolveBootstrapHeadCommit(targetRoot)) {
    throw new Error("Worktree bootstrap readiness marker does not match committed HEAD.");
  }
  if (typedMarker.source_tree_id !== resolveBootstrapSourceTreeId(targetRoot)) {
    throw new Error("Worktree bootstrap readiness marker does not match the committed source tree.");
  }
  if (typedMarker.lockfile_sha256 !== hashBootstrapLockfile(targetRoot)) {
    throw new Error("Worktree bootstrap readiness marker does not match the committed package lockfile.");
  }
  if (typedMarker.dist_cli_sha256 !== hashBootstrapCliOutput(targetRoot)) {
    throw new Error("Worktree bootstrap readiness marker does not match generated CLI output.");
  }
}

function readWorktreeBootstrapPackage(targetRoot: string): void {
  const packagePath = requireReadableBootstrapFile(targetRoot, "package.json");
  requireReadableBootstrapFile(targetRoot, "package-lock.json");
  const bootstrapInputs = ["package.json", "package-lock.json"];
  const tracked = runGitCommand(targetRoot, ["ls-files", "--error-unmatch", "--", ...bootstrapInputs]);
  if (tracked.error || tracked.status !== 0) {
    throw new Error("Bootstrap package manifest and lockfile must be committed tracked files.");
  }
  const dirty = runGitCommand(targetRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--", ...bootstrapInputs]);
  if (dirty.error || dirty.status !== 0) {
    throw new Error("Unable to verify committed bootstrap package inputs.");
  }
  if (dirty.stdout.trim().length > 0) {
    throw new Error(`Bootstrap package manifest and lockfile must be clean before setup: ${dirty.stdout.trim()}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(packagePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read bootstrap package manifest: ${message}`);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bootstrap package manifest must be a JSON object.");
  }

  const scripts = (value as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    throw new Error(`Bootstrap package manifest must declare ${WORKTREE_BOOTSTRAP_COMMAND}.`);
  }
  if ((scripts as Record<string, unknown>)["worktree:bootstrap"] !== WORKTREE_BOOTSTRAP_SCRIPT) {
    throw new Error(`Bootstrap package manifest must declare worktree:bootstrap as ${WORKTREE_BOOTSTRAP_SCRIPT}.`);
  }
}

function requireTrackedCleanBootstrapFiles(targetRoot: string, relativePaths: string[]): void {
  const paths = [...new Set(relativePaths)];
  const tracked = runGitCommand(targetRoot, ["ls-files", "--error-unmatch", "--", ...paths]);
  if (tracked.error || tracked.status !== 0) {
    throw new Error("Bootstrap procedure surfaces must be committed tracked files.");
  }
  const dirty = runGitCommand(targetRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--", ...paths]);
  if (dirty.error || dirty.status !== 0) {
    throw new Error("Unable to verify committed bootstrap procedure surfaces.");
  }
  if (dirty.stdout.trim().length > 0) {
    throw new Error(`Bootstrap procedure surfaces must be clean before readiness: ${dirty.stdout.trim()}`);
  }
}

function verifyTrackedBootstrapSurfaces(targetRoot: string, requireRuntimeReadiness: boolean): string[] {
  readWorktreeBootstrapPackage(targetRoot);
  const checks = ["package.json", "package-lock.json", "bin/ch", "AGENTS.md", SELF_HOSTING_PROCEDURE_REGISTRY_PATH];
  for (const relativePath of checks) {
    requireReadableBootstrapFile(targetRoot, relativePath);
  }

  const registry = readSelfHostingProcedureRegistry(targetRoot);
  if (!registry) {
    throw new Error("Self-hosting procedure registry not found for worktree bootstrap.");
  }
  for (const procedure of registry.procedures) {
    for (const relativePath of [
      procedure.skill_path,
      procedure.source_notes_path,
      procedure.output_format_path,
      procedure.prompt_wrapper_path
    ]) {
      requireReadableBootstrapFile(targetRoot, relativePath);
      checks.push(relativePath);
    }
  }

  requireTrackedCleanBootstrapFiles(targetRoot, checks);
  requireCleanBootstrapCheckout(targetRoot);

  if (requireRuntimeReadiness) {
    requireDependenciesMatchCommittedLockfile(targetRoot);
    requireCurrentWorktreeBootstrapMarker(targetRoot);
    checks.push("node_modules", "dist/cli/index.js", WORKTREE_BOOTSTRAP_MARKER_PATH);
  }

  return [...new Set(checks)];
}

export function bootstrapWorktree(cwd: string, options: WorktreeBootstrapOptions = {}): WorktreeBootstrapResult {
  const targetRoot = resolveBootstrapTargetRoot(cwd);
  const dryRun = options.dryRun ?? false;
  const verifyOnly = options.verifyOnly ?? false;

  if (dryRun) {
    return {
      targetRoot,
      dryRun,
      verifyOnly,
      setupCommand: WORKTREE_BOOTSTRAP_COMMAND,
      checks: verifyTrackedBootstrapSurfaces(targetRoot, false),
      state: "preview"
    };
  }

  if (!verifyOnly) {
    verifyTrackedBootstrapSurfaces(targetRoot, false);
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(command, ["run", "worktree:bootstrap"], {
      cwd: targetRoot,
      encoding: "utf8",
      shell: false
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "worktree bootstrap command failed").trim();
      throw new Error(`Worktree bootstrap setup failed: ${detail}`);
    }
    writeWorktreeBootstrapMarker(targetRoot);
  }

  return {
    targetRoot,
    dryRun,
    verifyOnly,
    setupCommand: WORKTREE_BOOTSTRAP_COMMAND,
    checks: verifyTrackedBootstrapSurfaces(targetRoot, true),
    state: "ready"
  };
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

function resolveHeadCommit(targetRoot: string): string {
  const result = runGitCommand(targetRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to resolve source HEAD commit.");
  }
  return result.stdout.trim();
}

function updateStateWithWorktree(task: TaskState, branch: string, worktreePath: string, baseCommitSha: string): TaskState {
  return {
    ...task,
    branch,
    worktree: worktreePath,
    ...(task.base_commit_sha ? {} : { base_commit_sha: baseCommitSha }),
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

  const materializedHead = resolveHeadCommit(worktreePath);
  const nextState = updateStateWithWorktree(readTaskStateById(targetRoot, task.task_id), branch, worktreePath, materializedHead);
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
