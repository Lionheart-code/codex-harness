import * as fs from "node:fs";
import * as path from "node:path";
import { listAgentRuns, type AgentRunRecord } from "./agent-ledger";
import { type VerifierRecord } from "./checks";
import { listDebt, listDecisions, type DebtItem, type DecisionRecord } from "./memory";
import { TASK_CHECK_LOG_FILE, TASK_DIFF_FILE, TASK_RESULT_FILE, TASK_REVIEW_FILE, TASK_VERIFIER_FILE } from "./paths";
import { loadTaskReviewRecord, type ReviewRecord } from "./review";
import { getSingleTask, getTaskBranchRecordPath, getTaskDirectory, getTaskWorktreeRecordPath, type TaskState } from "./tasks";

export interface ReportResult {
  targetRoot: string;
  taskId: string;
  resultPath: string;
  reportMarkdown: string;
}

interface TaskArtifactPaths {
  taskDirectory: string;
  specPath: string;
  acceptancePath: string;
  diffPath: string;
  verifierPath: string;
  reviewPath: string;
  checkLogPath: string;
  resultPath: string;
  branchPath: string;
  worktreePath: string;
}

interface ArtifactPresence {
  spec: boolean;
  acceptance: boolean;
  diff: boolean;
  verifier: boolean;
  review: boolean;
  checkLog: boolean;
  branch: boolean;
  worktree: boolean;
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function getTaskArtifactPaths(targetRoot: string, taskId: string): TaskArtifactPaths {
  const taskDirectory = getTaskDirectory(targetRoot, taskId);
  const logsDirectory = path.join(taskDirectory, "logs");

  return {
    taskDirectory,
    specPath: path.join(taskDirectory, "spec.md"),
    acceptancePath: path.join(taskDirectory, "acceptance.md"),
    diffPath: path.join(taskDirectory, TASK_DIFF_FILE),
    verifierPath: path.join(taskDirectory, TASK_VERIFIER_FILE),
    reviewPath: path.join(taskDirectory, TASK_REVIEW_FILE),
    checkLogPath: path.join(logsDirectory, TASK_CHECK_LOG_FILE),
    resultPath: path.join(taskDirectory, TASK_RESULT_FILE),
    branchPath: getTaskBranchRecordPath(targetRoot, taskId),
    worktreePath: getTaskWorktreeRecordPath(targetRoot, taskId)
  };
}

function readOptionalText(filePath: string): string {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

function readOptionalTrimmedText(filePath: string): string {
  return readOptionalText(filePath).trim();
}

function readVerifierRecord(verifierPath: string): VerifierRecord | undefined {
  if (!fs.existsSync(verifierPath) || !fs.statSync(verifierPath).isFile()) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(verifierPath, "utf8")) as VerifierRecord;
}

function readReviewRecord(reviewPath: string, taskId: string): ReviewRecord | undefined {
  if (!fs.existsSync(reviewPath) || !fs.statSync(reviewPath).isFile()) {
    return undefined;
  }

  return loadTaskReviewRecord(reviewPath, taskId);
}

function getArtifactPresence(paths: TaskArtifactPaths): ArtifactPresence {
  return {
    spec: fs.existsSync(paths.specPath),
    acceptance: fs.existsSync(paths.acceptancePath),
    diff: fs.existsSync(paths.diffPath),
    verifier: fs.existsSync(paths.verifierPath),
    review: fs.existsSync(paths.reviewPath),
    checkLog: fs.existsSync(paths.checkLogPath),
    branch: fs.existsSync(paths.branchPath),
    worktree: fs.existsSync(paths.worktreePath)
  };
}

function renderBulletList(items: string[]): string[] {
  return items.length === 0 ? ["- None recorded."] : items.map((item) => `- ${item}`);
}

function renderTaskSummaryLines(targetRoot: string, task: TaskState, paths: TaskArtifactPaths): string[] {
  const summary = [
    `- Task ID: \`${task.task_id}\``,
    `- Title: ${task.title}`,
    `- Status: \`${task.status}\``,
    `- Created: \`${task.created_at}\``,
    `- Updated: \`${task.updated_at}\``,
    `- Spec: \`${toRepoRelative(targetRoot, paths.specPath)}\``,
    `- Acceptance: \`${toRepoRelative(targetRoot, paths.acceptancePath)}\``
  ];

  const branch = readOptionalTrimmedText(paths.branchPath);
  const worktree = readOptionalTrimmedText(paths.worktreePath);

  if (branch.length > 0) {
    summary.push(`- Branch: \`${branch}\``);
  }

  if (worktree.length > 0) {
    summary.push(`- Worktree: \`${worktree}\``);
  }

  return summary;
}

function buildArtifactReferenceLines(targetRoot: string, paths: TaskArtifactPaths, presence: ArtifactPresence): string[] {
  const lines = [
    `- Diff patch: ${presence.diff ? `\`${toRepoRelative(targetRoot, paths.diffPath)}\`` : "(missing)"}`,
    `- Verifier: ${presence.verifier ? `\`${toRepoRelative(targetRoot, paths.verifierPath)}\`` : "(missing)"}`,
    `- Review: ${presence.review ? `\`${toRepoRelative(targetRoot, paths.reviewPath)}\`` : "(missing)"}`,
    `- Check log: ${presence.checkLog ? `\`${toRepoRelative(targetRoot, paths.checkLogPath)}\`` : "(missing)"}`,
    `- Result: \`${toRepoRelative(targetRoot, paths.resultPath)}\``
  ];

  return lines;
}

function buildChangedFilesLines(verifier: VerifierRecord | undefined): string[] {
  if (!verifier) {
    return ["- No verifier result is recorded, so changed files are unavailable."];
  }

  if (verifier.git_status_lines.length === 0) {
    return ["- No changed files were captured."];
  }

  return verifier.git_status_lines.map((line) => `- ${line}`);
}

function buildAgentRunSummaryLines(runs: AgentRunRecord[]): string[] {
  if (runs.length === 0) {
    return [];
  }

  return [
    "## Agent Runs",
    "",
    ...runs.map(
      (run) =>
        `- ${run.run_id} | ${run.status} | ${run.role} | ${run.profile || "(none)"} | ${run.output_path || "(none)"}`
    ),
    ""
  ];
}

function buildDoneLines(
  presence: ArtifactPresence,
  verifier: VerifierRecord | undefined,
  review: ReviewRecord | undefined,
  runs: AgentRunRecord[]
): string[] {
  const lines: string[] = [];

  if (presence.diff) {
    lines.push("Diff patch was captured.");
  }

  if (presence.verifier) {
    lines.push(`Verifier result was recorded: ${verifier?.result ?? "unknown"}.`);
  }

  if (presence.checkLog) {
    lines.push("Deterministic check log was recorded.");
  }

  if (presence.review) {
    lines.push(`Review result was recorded: ${review?.result ?? "unknown"}.`);
  }

  if (runs.length > 0) {
    lines.push(`Agent runs were recorded: ${runs.length}.`);
  }

  return renderBulletList(lines);
}

function buildNotDoneLines(
  presence: ArtifactPresence,
  verifier: VerifierRecord | undefined,
  review: ReviewRecord | undefined
): string[] {
  const lines: string[] = [];

  if (!presence.diff) {
    lines.push("Diff patch is missing.");
  }

  if (!presence.verifier) {
    lines.push("Verifier result is missing.");
  } else if (verifier?.result !== "pass") {
    lines.push(`Verifier result is not pass: ${verifier?.result ?? "unknown"}.`);
  }

  if (presence.verifier && !presence.checkLog) {
    lines.push("Check log is missing.");
  }

  if (review?.result === "FIX_REQUIRED") {
    lines.push("Review blockers prevent READY FOR HUMAN REVIEW.");
  }

  return renderBulletList(lines);
}

function buildChecksLines(verifier: VerifierRecord | undefined, review: ReviewRecord | undefined): string[] {
  const lines: string[] = [];

  if (!review) {
    lines.push("- Review result: not recorded.");
  } else {
    lines.push(`- Review result: ${review.result} | mode=${review.mode} | blockers=${review.blockers.length}`);
    lines.push(`- Review summary: ${review.summary}`);

    if (review.blockers.length > 0) {
      lines.push(...review.blockers.map((blocker) => `- Review blocker: ${blocker}`));
    }
  }

  if (!verifier) {
    lines.push("- No verifier result is recorded.");
    return lines;
  }

  if (verifier.result === "pass") {
    lines.push("- Verifier result: pass");

    if (verifier.commands.length === 0) {
      lines.push("- No deterministic commands were recorded.");
    } else {
      lines.push(
        ...verifier.commands.map(
          (command) =>
            `- pass | exit_code=${command.exit_code} | duration_ms=${command.duration_ms} | ${command.command}`
        )
      );
    }

    return lines;
  }

  lines.push(`- Verifier result: ${verifier.result}`);

  if (verifier.protected_path_violations.length > 0) {
    lines.push(...verifier.protected_path_violations.map((entry) => `- Protected path violation: ${entry}`));
  }

  if (verifier.commands.length > 0) {
    lines.push(
      ...verifier.commands.map(
        (command) =>
          `- ${command.result} | exit_code=${command.exit_code} | duration_ms=${command.duration_ms} | ${command.command}`
      )
    );
  } else if (verifier.result === "captured") {
    lines.push("- Deterministic checks were not recorded after capture.");
  }

  return lines;
}

function buildRiskLines(
  verifier: VerifierRecord | undefined,
  review: ReviewRecord | undefined,
  taskDebt: DebtItem[],
  taskRuns: AgentRunRecord[],
  verifierWarnings: string[]
): string[] {
  const lines: string[] = [];

  if (!verifier) {
    lines.push("No verifier result is recorded.");
  } else if (verifier.result !== "pass") {
    lines.push(`Verifier result is ${verifier.result}.`);
  }

  if (review?.result === "FIX_REQUIRED") {
    for (const blocker of review.blockers) {
      lines.push(`Review blocker: ${blocker}`);
    }
  }

  for (const debt of taskDebt.filter((item) => item.status !== "resolved" && item.status !== "obsolete")) {
    lines.push(`Unresolved debt: ${debt.debt_id} | ${debt.severity} | ${debt.title}`);
  }

  for (const run of taskRuns.filter((run) => run.status !== "accepted")) {
    lines.push(`Agent output not accepted: ${run.run_id} | ${run.status} | ${run.role}`);
  }

  lines.push(...verifierWarnings.map((warning) => `Artifact warning: ${warning}`));

  return renderBulletList(lines);
}

function buildFollowUpLines(taskDebt: DebtItem[]): string[] {
  const unresolved = taskDebt.filter((item) => item.status !== "resolved" && item.status !== "obsolete");
  return renderBulletList(unresolved.map((item) => `${item.debt_id} | ${item.severity} | ${item.title}`));
}

function buildDebtCreatedLines(taskDebt: DebtItem[]): string[] {
  return renderBulletList(taskDebt.map((item) => `${item.debt_id} | ${item.status} | ${item.severity} | ${item.title}`));
}

function buildDebtResolvedLines(taskDebt: DebtItem[]): string[] {
  const resolved = taskDebt.filter((item) => item.status === "resolved");
  return renderBulletList(resolved.map((item) => `${item.debt_id} | ${item.severity} | ${item.title}`));
}

function buildDecisionSummaryLines(taskDecisions: DecisionRecord[]): string[] {
  if (taskDecisions.length === 0) {
    return [];
  }

  return [
    "## Decisions",
    "",
    ...taskDecisions.map((decision) => `- ${decision.decision_id} | ${decision.status} | ${decision.title}`),
    ""
  ];
}

function buildNextActionLine(
  verifier: VerifierRecord | undefined,
  review: ReviewRecord | undefined,
  taskDebt: DebtItem[]
): string {
  if (!verifier) {
    return "- Run `node bin/ch capture` and `node bin/ch check`, then regenerate the report.";
  }

  if (verifier.result === "captured") {
    return "- Run `node bin/ch check` to record deterministic verification.";
  }

  if (verifier.result === "fail") {
    return "- Address failed checks or protected-path violations, rerun `node bin/ch check`, then regenerate the report.";
  }

  if (review?.result === "FIX_REQUIRED") {
    return "- Address review blockers, regenerate `review.json`, then rerun `node bin/ch review` and `node bin/ch report`.";
  }

  const unresolvedHighDebt = taskDebt.some(
    (item) => item.severity === "high" && item.status !== "resolved" && item.status !== "obsolete"
  );

  if (unresolvedHighDebt) {
    return "- Resolve or explicitly accept high-severity debt before human review.";
  }

  return "- Human should review the diff, verifier, and report before merge.";
}

function buildMergeRecommendationLine(
  verifier: VerifierRecord | undefined,
  review: ReviewRecord | undefined,
  taskDebt: DebtItem[]
): string {
  if (!verifier || verifier.result !== "pass") {
    return "- DO NOT MERGE";
  }

  if (review?.result === "FIX_REQUIRED") {
    return "- DO NOT MERGE";
  }

  const unresolvedHighDebt = taskDebt.some(
    (item) => item.severity === "high" && item.status !== "resolved" && item.status !== "obsolete"
  );

  return unresolvedHighDebt ? "- DO NOT MERGE" : "- READY FOR HUMAN REVIEW";
}

function collectWarnings(
  debtWarnings: string[],
  decisionWarnings: string[],
  agentWarnings: string[]
): string[] {
  return [...debtWarnings, ...decisionWarnings, ...agentWarnings];
}

function buildReportMarkdown(
  targetRoot: string,
  task: TaskState,
  paths: TaskArtifactPaths,
  verifier: VerifierRecord | undefined,
  review: ReviewRecord | undefined,
  taskRuns: AgentRunRecord[],
  taskDebt: DebtItem[],
  taskDecisions: DecisionRecord[],
  warnings: string[]
): string {
  const presence = getArtifactPresence(paths);

  return [
    `# Task Report — ${task.title}`,
    "",
    "## Task Summary",
    "",
    ...renderTaskSummaryLines(targetRoot, task, paths),
    "",
    "## Artifact References",
    "",
    ...buildArtifactReferenceLines(targetRoot, paths, presence),
    "",
    "## Changed Files",
    "",
    ...buildChangedFilesLines(verifier),
    "",
    ...buildAgentRunSummaryLines(taskRuns),
    ...buildDecisionSummaryLines(taskDecisions),
    "## Done",
    "",
    ...buildDoneLines(presence, verifier, review, taskRuns),
    "",
    "## Not done",
    "",
    ...buildNotDoneLines(presence, verifier, review),
    "",
    "## Checks",
    "",
    ...buildChecksLines(verifier, review),
    "",
    "## Risks",
    "",
    ...buildRiskLines(verifier, review, taskDebt, taskRuns, warnings),
    "",
    "## Follow-ups",
    "",
    ...buildFollowUpLines(taskDebt),
    "",
    "## Debt created",
    "",
    ...buildDebtCreatedLines(taskDebt),
    "",
    "## Debt resolved",
    "",
    ...buildDebtResolvedLines(taskDebt),
    "",
    "## Next action",
    "",
    buildNextActionLine(verifier, review, taskDebt),
    "",
    "## Merge recommendation",
    "",
    buildMergeRecommendationLine(verifier, review, taskDebt),
    ""
  ].join("\n");
}

export function generateTaskReport(cwd: string): ReportResult {
  const { targetRoot, task } = getSingleTask(cwd);
  const paths = getTaskArtifactPaths(targetRoot, task.task_id);
  const verifier = readVerifierRecord(paths.verifierPath);
  const review = readReviewRecord(paths.reviewPath, task.task_id);
  const taskRunsResult = listAgentRuns(cwd);
  const debtResult = listDebt(cwd);
  const decisionResult = listDecisions(cwd);
  const taskDebt = debtResult.items.filter((item) => item.created_by_task === task.task_id);
  const taskDecisions = decisionResult.decisions.filter((decision) => decision.related_task_ids.includes(task.task_id));
  const warnings = collectWarnings(debtResult.warnings, decisionResult.warnings, taskRunsResult.warnings);
  const reportMarkdown = buildReportMarkdown(
    targetRoot,
    task,
    paths,
    verifier,
    review,
    taskRunsResult.runs,
    taskDebt,
    taskDecisions,
    warnings
  );

  fs.writeFileSync(paths.resultPath, reportMarkdown, "utf8");

  return {
    targetRoot,
    taskId: task.task_id,
    resultPath: paths.resultPath,
    reportMarkdown
  };
}
