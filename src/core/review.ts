import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { listAgentRuns } from "./agent-ledger";
import {
  TASK_DIFF_FILE,
  TASK_REVIEW_FILE,
  TASK_REVIEW_PROMPT_FILE,
  TASK_SCOUTS_DIR,
  TASK_VERIFIER_FILE
} from "./paths";
import { getSingleTask, getTaskDirectory } from "./tasks";

export type ReviewResult = "PASS" | "FIX_REQUIRED";
export type ReviewMode = "manual" | "exec";

export interface ReviewRecord {
  task_id: string;
  result: ReviewResult;
  blockers: string[];
  summary: string;
  mode: ReviewMode;
  created_at: string;
}

export interface ReviewValidationResult {
  targetRoot: string;
  taskId: string;
  reviewPath: string;
  review: ReviewRecord;
}

export interface ExecReviewResult extends ReviewValidationResult {
  command: string;
  exitCode: number;
}

interface ReviewPaths {
  taskDirectory: string;
  specPath: string;
  acceptancePath: string;
  diffPath: string;
  verifierPath: string;
  promptPath: string;
  reviewPath: string;
  scoutsDirectory: string;
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function getReviewPaths(targetRoot: string, taskId: string): ReviewPaths {
  const taskDirectory = getTaskDirectory(targetRoot, taskId);

  return {
    taskDirectory,
    specPath: path.join(taskDirectory, "spec.md"),
    acceptancePath: path.join(taskDirectory, "acceptance.md"),
    diffPath: path.join(taskDirectory, TASK_DIFF_FILE),
    verifierPath: path.join(taskDirectory, TASK_VERIFIER_FILE),
    promptPath: path.join(taskDirectory, TASK_REVIEW_PROMPT_FILE),
    reviewPath: path.join(taskDirectory, TASK_REVIEW_FILE),
    scoutsDirectory: path.join(taskDirectory, TASK_SCOUTS_DIR)
  };
}

function parseJsonObject(input: string, sourceLabel: string): Record<string, unknown> {
  let parsed: unknown;
  const sanitizedInput = sanitizeReviewJsonInput(input);

  try {
    parsed = JSON.parse(sanitizedInput);
  } catch (jsonError) {
    const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
    throw new Error(`Invalid review JSON in ${sourceLabel}: ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid review JSON in ${sourceLabel}: expected a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function sanitizeReviewJsonInput(input: string): string {
  const trimmed = input.trim();
  const fencedMatch = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);

  if (!fencedMatch) {
    return input;
  }

  return fencedMatch[1];
}

function validateBlockers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("Review field `blockers` must be a string array.");
  }

  const blockers = value.map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error("Review blockers must contain only non-empty strings.");
    }

    return entry.trim();
  });

  return blockers;
}

export function validateReviewRecord(value: unknown, expectedTaskId: string): ReviewRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Review record must be a JSON object.");
  }

  const record = value as Record<string, unknown>;

  if (record.task_id !== expectedTaskId) {
    throw new Error(`Review field \`task_id\` must match the current task: ${expectedTaskId}.`);
  }

  if (record.result !== "PASS" && record.result !== "FIX_REQUIRED") {
    throw new Error("Review field `result` must be `PASS` or `FIX_REQUIRED`.");
  }

  const blockers = validateBlockers(record.blockers);

  if (typeof record.summary !== "string" || record.summary.trim().length === 0) {
    throw new Error("Review field `summary` must be a non-empty string.");
  }

  if (record.mode !== "manual" && record.mode !== "exec") {
    throw new Error("Review field `mode` must be `manual` or `exec`.");
  }

  if (typeof record.created_at !== "string" || record.created_at.trim().length === 0) {
    throw new Error("Review field `created_at` must be a non-empty string.");
  }

  if (record.result === "FIX_REQUIRED" && blockers.length === 0) {
    throw new Error("Review result `FIX_REQUIRED` requires at least one blocker.");
  }

  if (record.result === "PASS" && blockers.length > 0) {
    throw new Error("Review result `PASS` must not include blockers.");
  }

  return {
    task_id: expectedTaskId,
    result: record.result,
    blockers,
    summary: record.summary.trim(),
    mode: record.mode,
    created_at: record.created_at.trim()
  };
}

function readValidatedReview(reviewPath: string, taskId: string): ReviewRecord {
  if (!fs.existsSync(reviewPath) || !fs.statSync(reviewPath).isFile()) {
    throw new Error(`Review artifact not found: ${reviewPath}`);
  }

  const content = fs.readFileSync(reviewPath, "utf8");
  const parsed = parseJsonObject(content, reviewPath);
  return validateReviewRecord(parsed, taskId);
}

function writeReviewRecord(reviewPath: string, record: ReviewRecord): void {
  fs.writeFileSync(reviewPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function writeReviewPrompt(promptPath: string, prompt: string): void {
  fs.writeFileSync(promptPath, `${prompt}\n`, "utf8");
}

function collectScoutPaths(paths: ReviewPaths): string[] {
  if (!fs.existsSync(paths.scoutsDirectory) || !fs.statSync(paths.scoutsDirectory).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(paths.scoutsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(paths.scoutsDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function collectAgentOutputPaths(cwd: string, targetRoot: string): string[] {
  const result = listAgentRuns(cwd);

  return result.runs
    .map((run) => path.join(targetRoot, run.output_path))
    .filter((outputPath) => fs.existsSync(outputPath) && fs.statSync(outputPath).isFile())
    .sort((left, right) => left.localeCompare(right));
}

function requireExecInput(pathLabel: string, absolutePath: string): void {
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Review requires ${pathLabel}: ${absolutePath}`);
  }
}

function buildExecPrompt(
  targetRoot: string,
  taskId: string,
  paths: ReviewPaths,
  scoutPaths: string[],
  agentOutputPaths: string[]
): string {
  const scoutLines =
    scoutPaths.length === 0 ? ["- None recorded."] : scoutPaths.map((entry) => `- ${toRepoRelative(targetRoot, entry)}`);
  const agentLines =
    agentOutputPaths.length === 0
      ? ["- None recorded."]
      : agentOutputPaths.map((entry) => `- ${toRepoRelative(targetRoot, entry)}`);

  return [
    "Review the current task artifacts and return JSON only.",
    "",
    `Task ID: ${taskId}`,
    "",
    "Required inputs:",
    `- spec: ${toRepoRelative(targetRoot, paths.specPath)}`,
    `- acceptance: ${toRepoRelative(targetRoot, paths.acceptancePath)}`,
    `- diff: ${toRepoRelative(targetRoot, paths.diffPath)}`,
    `- verifier: ${toRepoRelative(targetRoot, paths.verifierPath)}`,
    "",
    "Optional scout outputs:",
    ...scoutLines,
    "",
    "Optional agent outputs:",
    ...agentLines,
    "",
    "Decide whether the task is PASS or FIX_REQUIRED.",
    "Blockers must be explicit. If any blocker exists, the result must be FIX_REQUIRED.",
    "Do not propose later-phase features.",
    "Return exactly one JSON object with this shape and no markdown fences:",
    "{",
    '  "task_id": "current-task-id",',
    '  "result": "PASS" or "FIX_REQUIRED",',
    '  "blockers": ["explicit blocker", "..." ],',
    '  "summary": "short review summary"',
    "}"
  ].join("\n");
}

function buildExecReviewRecord(rawOutput: string, taskId: string): ReviewRecord {
  const parsed = parseJsonObject(rawOutput, "codex exec stdout");

  return validateReviewRecord(
    {
      ...parsed,
      mode: "exec",
      created_at: new Date().toISOString()
    },
    taskId
  );
}

export function loadTaskReviewRecord(reviewPath: string, taskId: string): ReviewRecord {
  return readValidatedReview(reviewPath, taskId);
}

export function validateCurrentTaskReview(cwd: string): ReviewValidationResult {
  const { targetRoot, task } = getSingleTask(cwd);
  const paths = getReviewPaths(targetRoot, task.task_id);
  const review = readValidatedReview(paths.reviewPath, task.task_id);

  return {
    targetRoot,
    taskId: task.task_id,
    reviewPath: paths.reviewPath,
    review
  };
}

function buildExecCommand(): { file: string; args: string[] } {
  return process.platform === "win32"
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", "codex", "exec", "-"] }
    : { file: "codex", args: ["exec", "-"] };
}

export function runCodexExecReview(cwd: string): ExecReviewResult {
  const { targetRoot, task } = getSingleTask(cwd);
  const paths = getReviewPaths(targetRoot, task.task_id);

  requireExecInput("spec.md", paths.specPath);
  requireExecInput("acceptance.md", paths.acceptancePath);
  requireExecInput(TASK_DIFF_FILE, paths.diffPath);
  requireExecInput(TASK_VERIFIER_FILE, paths.verifierPath);

  const scoutPaths = collectScoutPaths(paths);
  const agentOutputPaths = collectAgentOutputPaths(cwd, targetRoot);
  const prompt = buildExecPrompt(targetRoot, task.task_id, paths, scoutPaths, agentOutputPaths);
  const command = buildExecCommand();

  writeReviewPrompt(paths.promptPath, prompt);

  const result = spawnSync(command.file, command.args, {
    cwd: targetRoot,
    encoding: "utf8",
    input: prompt,
    shell: false,
    timeout: 600000
  });

  if (result.error) {
    if ("code" in result.error && result.error.code === "ETIMEDOUT") {
      throw new Error("codex exec timed out.");
    }

    throw new Error(`codex exec failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(stderr.length > 0 ? `codex exec failed: ${stderr}` : "codex exec failed.");
  }

  const review = buildExecReviewRecord(result.stdout ?? "", task.task_id);
  writeReviewRecord(paths.reviewPath, review);

  return {
    targetRoot,
    taskId: task.task_id,
    reviewPath: paths.reviewPath,
    review,
    command: "codex exec",
    exitCode: result.status ?? 1
  };
}
