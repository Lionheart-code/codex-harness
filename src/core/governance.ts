import * as fs from "node:fs";
import * as path from "node:path";
import { type AgentRunStatus } from "./agent-ledger";
import { detectInstalledLayer } from "./install";
import { getMemoryStatus, type DebtStatus, type DecisionStatus } from "./memory";
import { ensureGovernanceScaffold } from "./governance-scaffold";
import {
  GOVERNANCE_CHANGELOG_PATH,
  GOVERNANCE_DIR,
  GOVERNANCE_METRICS_FILE,
  GOVERNANCE_METRICS_DIR,
  GOVERNANCE_PROPOSALS_DIR,
  GOVERNANCE_REVIEWS_DIR,
  INSTALL_JSON_PATH,
  PROMPT_PLAN_FILE,
  PROMPT_REVIEW_FILE,
  PROMPT_WORK_FILE,
  TASK_PROMPTS_DIR,
  TASK_RESULT_FILE,
  TASK_REVIEW_FILE,
  TASK_VERIFIER_FILE,
  TASKS_DIR
} from "./paths";
import { listTasks, requireGitTargetRoot } from "./tasks";

export type GovernanceReviewMode = "daily" | "weekly" | "release";

export interface GovernanceReviewResult {
  targetRoot: string;
  governanceRoot: string;
  reviewPath: string;
  mode: GovernanceReviewMode;
  created: boolean;
}

export interface GovernanceProposalResult {
  targetRoot: string;
  governanceRoot: string;
  proposalId: string;
  proposalPath: string;
  researchInputs: string[];
}

export interface GovernanceMetricsRecord {
  generated_at: string;
  producer_command: "node bin/ch governance metrics";
  harness_version: string;
  governance: {
    reviews: number;
    proposals: number;
    latest_review: string;
    latest_proposal: string;
  };
  task_artifacts: {
    tasks: number;
    verifier_records: number;
    review_records: number;
    reports: number;
    prompt_files: number;
  };
  memory: {
    debt: Record<DebtStatus, number>;
    decisions: Record<DecisionStatus, number>;
    agent_outputs: Record<AgentRunStatus, number>;
    warnings: number;
  };
}

export interface GovernanceMetricsResult {
  targetRoot: string;
  governanceRoot: string;
  metricsPath: string;
  metrics: GovernanceMetricsRecord;
}

export interface GovernanceStatusResult {
  targetRoot: string;
  governanceRoot: string;
  harnessVersion: string;
  scaffoldPresent: boolean;
  reviewCount: number;
  proposalCount: number;
  latestReviewPath: string;
  latestProposalPath: string;
  changelogPath: string;
  taskArtifacts: GovernanceMetricsRecord["task_artifacts"];
  debtCounts: Record<DebtStatus, number>;
  decisionCounts: Record<DecisionStatus, number>;
  agentCounts: Record<AgentRunStatus, number>;
  warnings: string[];
}

interface GovernanceEvidence {
  harnessVersion: string;
  reviewCount: number;
  proposalCount: number;
  latestReviewPath: string;
  latestProposalPath: string;
  taskArtifacts: GovernanceMetricsRecord["task_artifacts"];
  debtCounts: Record<DebtStatus, number>;
  decisionCounts: Record<DecisionStatus, number>;
  agentCounts: Record<AgentRunStatus, number>;
  warnings: string[];
}

const GOVERNANCE_REVIEW_MODES: GovernanceReviewMode[] = ["daily", "weekly", "release"];

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function normalizePathForComparison(targetPath: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function getProductRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function isProductRepository(targetRoot: string): boolean {
  return normalizePathForComparison(targetRoot) === normalizePathForComparison(getProductRoot());
}

function requireGovernanceTargetRoot(cwd: string): string {
  const targetRoot = requireGitTargetRoot(cwd);

  if (isProductRepository(targetRoot)) {
    throw new Error(
      "Phase 17 governance commands must run in an installed target repository, not the codex-harness product repository."
    );
  }

  if (!detectInstalledLayer(targetRoot)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  return targetRoot;
}

function ensureReadableFile(filePath: string): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Research input is not a readable file: ${filePath}`);
  }

  fs.accessSync(filePath, fs.constants.R_OK);
}

function readInstalledHarnessVersion(targetRoot: string): string {
  const installPath = path.join(targetRoot, INSTALL_JSON_PATH);
  const parsed = JSON.parse(fs.readFileSync(installPath, "utf8")) as { harness_version?: string };

  if (typeof parsed.harness_version !== "string" || parsed.harness_version.trim().length === 0) {
    throw new Error("Existing .harness/install.json is missing harness_version.");
  }

  return parsed.harness_version;
}

function isGovernanceReviewMode(value: string): value is GovernanceReviewMode {
  return GOVERNANCE_REVIEW_MODES.includes(value as GovernanceReviewMode);
}

function formatReviewDate(value: string): string {
  return value.slice(0, 10);
}

function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function getTaskArtifactCounts(targetRoot: string): GovernanceMetricsRecord["task_artifacts"] {
  const tasksRoot = path.join(targetRoot, TASKS_DIR);
  const counts: GovernanceMetricsRecord["task_artifacts"] = {
    tasks: 0,
    verifier_records: 0,
    review_records: 0,
    reports: 0,
    prompt_files: 0
  };

  if (!fs.existsSync(tasksRoot) || !fs.statSync(tasksRoot).isDirectory()) {
    return counts;
  }

  for (const entry of fs.readdirSync(tasksRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    counts.tasks += 1;
    const taskDirectory = path.join(tasksRoot, entry.name);

    if (fs.existsSync(path.join(taskDirectory, TASK_VERIFIER_FILE))) {
      counts.verifier_records += 1;
    }

    if (fs.existsSync(path.join(taskDirectory, TASK_REVIEW_FILE))) {
      counts.review_records += 1;
    }

    if (fs.existsSync(path.join(taskDirectory, TASK_RESULT_FILE))) {
      counts.reports += 1;
    }

    for (const promptName of [PROMPT_PLAN_FILE, PROMPT_WORK_FILE, PROMPT_REVIEW_FILE]) {
      if (fs.existsSync(path.join(taskDirectory, promptName))) {
        counts.prompt_files += 1;
      }
    }

    const promptDirectory = path.join(taskDirectory, TASK_PROMPTS_DIR);

    if (!fs.existsSync(promptDirectory) || !fs.statSync(promptDirectory).isDirectory()) {
      continue;
    }

    counts.prompt_files += fs
      .readdirSync(promptDirectory, { withFileTypes: true })
      .filter((promptEntry) => promptEntry.isFile())
      .length;
  }

  return counts;
}

function listGovernanceMarkdownFiles(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function collectGovernanceEvidence(targetRoot: string): GovernanceEvidence {
  const memoryStatus = getMemoryStatus(targetRoot);
  const taskList = listTasks(targetRoot);
  const reviewFiles = listGovernanceMarkdownFiles(path.join(targetRoot, GOVERNANCE_REVIEWS_DIR));
  const proposalFiles = listGovernanceMarkdownFiles(path.join(targetRoot, GOVERNANCE_PROPOSALS_DIR));

  return {
    harnessVersion: readInstalledHarnessVersion(targetRoot),
    reviewCount: reviewFiles.length,
    proposalCount: proposalFiles.length,
    latestReviewPath:
      reviewFiles.length > 0
        ? toPortablePath(path.join(GOVERNANCE_REVIEWS_DIR, reviewFiles[reviewFiles.length - 1]))
        : "",
    latestProposalPath:
      proposalFiles.length > 0
        ? toPortablePath(path.join(GOVERNANCE_PROPOSALS_DIR, proposalFiles[proposalFiles.length - 1]))
        : "",
    taskArtifacts: getTaskArtifactCounts(targetRoot),
    debtCounts: memoryStatus.debtCounts,
    decisionCounts: memoryStatus.decisionCounts,
    agentCounts: memoryStatus.agentCounts,
    warnings: [...taskList.warnings, ...memoryStatus.warnings]
  };
}

function buildModeFocusLines(mode: GovernanceReviewMode): string[] {
  switch (mode) {
    case "daily":
      return [
        "- Check active blockers, unresolved debt, and agent outputs that still need human acceptance.",
        "- Confirm no governance action implies silent code changes or permission changes."
      ];
    case "weekly":
      return [
        "- Review repeated friction across tasks, prompts, review blockers, and agent-output patterns.",
        "- Decide whether any repeated issue should become a Harness Enhancement Proposal."
      ];
    case "release":
      return [
        "- Audit architecture, phase boundaries, prompt surface area, adapter safety, and eval pressure.",
        "- Confirm any proposed harness changes still preserve earlier contracts and rollback paths."
      ];
  }
}

function buildWarningsSection(warnings: string[]): string[] {
  return warnings.length === 0 ? ["- None observed."] : warnings.map((warning) => `- ${warning}`);
}

function buildReviewMarkdown(targetRoot: string, mode: GovernanceReviewMode, generatedAt: string): string {
  const evidence = collectGovernanceEvidence(targetRoot);

  return [
    `# Harness Review - ${mode} - ${formatReviewDate(generatedAt)}`,
    "",
    `- Generated: \`${generatedAt}\``,
    `- Mode: \`${mode}\``,
    `- Installed harness version: \`${evidence.harnessVersion}\``,
    `- Governance root: \`${GOVERNANCE_DIR}\``,
    "",
    "## Focus",
    "",
    ...buildModeFocusLines(mode),
    "",
    "## Evidence",
    "",
    `- Project index: \`${path.join(".harness", "memory", "project-index.md").replace(/\\/g, "/")}\``,
    `- Debt ledger: \`${path.join(".harness", "memory", "debt", "debt.md").replace(/\\/g, "/")}\``,
    `- Governance changelog: \`${GOVERNANCE_CHANGELOG_PATH.replace(/\\/g, "/")}\``,
    `- Governance proposals: ${evidence.proposalCount}`,
    `- Governance reviews already recorded: ${evidence.reviewCount}`,
    `- Latest proposal: ${evidence.latestProposalPath || "(none)"}`,
    `- Latest review before this run: ${evidence.latestReviewPath || "(none)"}`,
    `- Task directories: ${evidence.taskArtifacts.tasks}`,
    `- Task verifier records: ${evidence.taskArtifacts.verifier_records}`,
    `- Task review records: ${evidence.taskArtifacts.review_records}`,
    `- Task reports: ${evidence.taskArtifacts.reports}`,
    `- Task prompt artifacts: ${evidence.taskArtifacts.prompt_files}`,
    `- Debt: open=${evidence.debtCounts.open} | in_progress=${evidence.debtCounts.in_progress} | resolved=${evidence.debtCounts.resolved} | accepted=${evidence.debtCounts.accepted} | obsolete=${evidence.debtCounts.obsolete}`,
    `- Decisions: active=${evidence.decisionCounts.active} | superseded=${evidence.decisionCounts.superseded} | rejected=${evidence.decisionCounts.rejected}`,
    `- Agent outputs: raw=${evidence.agentCounts.raw} | accepted=${evidence.agentCounts.accepted} | stale=${evidence.agentCounts.stale} | rejected=${evidence.agentCounts.rejected}`,
    "",
    "## Findings",
    "",
    "- Review current evidence and convert any real harness change into a proposal before editing product code.",
    "- Treat this review as an audit artifact only; it does not authorize self-modification, auto-merge, or permission changes.",
    "",
    "## Warnings",
    "",
    ...buildWarningsSection(evidence.warnings),
    "",
    "## Next Maintainer Action",
    "",
    "- If a harness change is justified, run `node bin/ch governance proposal --title \"...\"` and capture evidence first.",
    ""
  ].join("\n");
}

function getNextProposalId(targetRoot: string): string {
  const proposalsDirectory = path.join(targetRoot, GOVERNANCE_PROPOSALS_DIR);
  const currentNumbers = listGovernanceMarkdownFiles(proposalsDirectory)
    .map((name) => /^HEP-(\d{4,})-/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));
  const nextNumber = currentNumbers.length === 0 ? 1 : Math.max(...currentNumbers) + 1;

  return `HEP-${String(nextNumber).padStart(4, "0")}`;
}

function resolveResearchInputs(cwd: string, targetRoot: string, research: string[]): string[] {
  return research.map((inputPath) => {
    const resolvedPath = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(cwd, inputPath);
    ensureReadableFile(resolvedPath);

    return normalizedRepoRelativeOrAbsolute(targetRoot, resolvedPath);
  });
}

function normalizedRepoRelativeOrAbsolute(targetRoot: string, absolutePath: string): string {
  const normalizedTargetRoot = normalizePathForComparison(targetRoot);
  const normalizedAbsolutePath = normalizePathForComparison(absolutePath);
  const relative = path.relative(normalizedTargetRoot, normalizedAbsolutePath);

  if (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return toPortablePath(relative);
  }

  return toPortablePath(absolutePath);
}

function buildProposalMarkdown(
  targetRoot: string,
  proposalId: string,
  title: string,
  researchInputs: string[],
  createdAt: string
): string {
  const evidence = collectGovernanceEvidence(targetRoot);
  const researchLines = researchInputs.length === 0 ? ["- None supplied."] : researchInputs.map((item) => `- ${item}`);

  return [
    `# ${proposalId} - ${title.trim()}`,
    "",
    `- HEP ID: \`${proposalId}\``,
    `- Title: ${title.trim()}`,
    `- Status: proposed`,
    `- Created: \`${createdAt}\``,
    "",
    "## Problem",
    "",
    "- TODO: describe the harness problem or friction precisely.",
    "",
    "## Evidence",
    "",
    `- Latest governance review: ${evidence.latestReviewPath || "(none yet)"}`,
    `- Governance proposals already recorded: ${evidence.proposalCount}`,
    `- Task reports available: ${evidence.taskArtifacts.reports}`,
    `- Review artifacts available: ${evidence.taskArtifacts.review_records}`,
    `- Debt snapshot: open=${evidence.debtCounts.open} | in_progress=${evidence.debtCounts.in_progress} | accepted=${evidence.debtCounts.accepted}`,
    `- Agent-output snapshot: raw=${evidence.agentCounts.raw} | stale=${evidence.agentCounts.stale} | rejected=${evidence.agentCounts.rejected}`,
    ...researchLines,
    "",
    "## Affected Files/Components",
    "",
    "- TODO: list the product files, commands, docs, or templates that would change.",
    "",
    "## Expected Benefit",
    "",
    "- TODO: explain the expected correctness, safety, cost, or usability improvement.",
    "",
    "## Risk",
    "",
    "- TODO: describe regression, safety, portability, or scope-creep risks.",
    "",
    "## Rollback Plan",
    "",
    "- TODO: describe how to revert or disable this change if it regresses behavior.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] Define deterministic checks or acceptance tests for the change.",
    "- [ ] Confirm existing earlier-phase workflows still pass.",
    "",
    "## Evaluation Plan",
    "",
    "- [ ] Define how to compare before/after behavior or maintainer friction.",
    ""
  ].join("\n");
}

function buildMetricsRecord(targetRoot: string): GovernanceMetricsRecord {
  const evidence = collectGovernanceEvidence(targetRoot);

  return {
    generated_at: new Date().toISOString(),
    producer_command: "node bin/ch governance metrics",
    harness_version: evidence.harnessVersion,
    governance: {
      reviews: evidence.reviewCount,
      proposals: evidence.proposalCount,
      latest_review: evidence.latestReviewPath,
      latest_proposal: evidence.latestProposalPath
    },
    task_artifacts: evidence.taskArtifacts,
    memory: {
      debt: evidence.debtCounts,
      decisions: evidence.decisionCounts,
      agent_outputs: evidence.agentCounts,
      warnings: evidence.warnings.length
    }
  };
}

function getMetricsPath(targetRoot: string): string {
  return path.join(targetRoot, GOVERNANCE_METRICS_DIR, GOVERNANCE_METRICS_FILE);
}

export function createGovernanceReview(cwd: string, mode: GovernanceReviewMode): GovernanceReviewResult {
  const targetRoot = requireGovernanceTargetRoot(cwd);
  ensureGovernanceScaffold(targetRoot);

  const generatedAt = new Date().toISOString();
  const reviewFileName = `${formatReviewDate(generatedAt)}-${mode}-harness-review.md`;
  const reviewPath = path.join(targetRoot, GOVERNANCE_REVIEWS_DIR, reviewFileName);
  const created = !fs.existsSync(reviewPath);

  fs.writeFileSync(reviewPath, buildReviewMarkdown(targetRoot, mode, generatedAt), "utf8");

  return {
    targetRoot,
    governanceRoot: path.join(targetRoot, GOVERNANCE_DIR),
    reviewPath,
    mode,
    created
  };
}

export function createGovernanceProposal(
  cwd: string,
  title: string,
  research: string[] = []
): GovernanceProposalResult {
  const targetRoot = requireGovernanceTargetRoot(cwd);
  ensureGovernanceScaffold(targetRoot);

  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    throw new Error("Proposal title must not be empty.");
  }

  const proposalId = getNextProposalId(targetRoot);
  const researchInputs = resolveResearchInputs(cwd, targetRoot, research);
  const proposalPath = path.join(
    targetRoot,
    GOVERNANCE_PROPOSALS_DIR,
    `${proposalId}-${slugifyTitle(trimmedTitle)}.md`
  );

  fs.writeFileSync(
    proposalPath,
    buildProposalMarkdown(targetRoot, proposalId, trimmedTitle, researchInputs, new Date().toISOString()),
    "utf8"
  );

  return {
    targetRoot,
    governanceRoot: path.join(targetRoot, GOVERNANCE_DIR),
    proposalId,
    proposalPath,
    researchInputs
  };
}

export function writeGovernanceMetrics(cwd: string): GovernanceMetricsResult {
  const targetRoot = requireGovernanceTargetRoot(cwd);
  ensureGovernanceScaffold(targetRoot);

  const metricsPath = getMetricsPath(targetRoot);
  const metrics = buildMetricsRecord(targetRoot);
  fs.writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

  return {
    targetRoot,
    governanceRoot: path.join(targetRoot, GOVERNANCE_DIR),
    metricsPath,
    metrics
  };
}

export function getGovernanceStatus(cwd: string): GovernanceStatusResult {
  const targetRoot = requireGovernanceTargetRoot(cwd);
  const governanceRoot = path.join(targetRoot, GOVERNANCE_DIR);
  const scaffoldPresent = fs.existsSync(governanceRoot) && fs.statSync(governanceRoot).isDirectory();
  const evidence = collectGovernanceEvidence(targetRoot);

  return {
    targetRoot,
    governanceRoot,
    harnessVersion: evidence.harnessVersion,
    scaffoldPresent,
    reviewCount: evidence.reviewCount,
    proposalCount: evidence.proposalCount,
    latestReviewPath: evidence.latestReviewPath,
    latestProposalPath: evidence.latestProposalPath,
    changelogPath: path.join(targetRoot, GOVERNANCE_CHANGELOG_PATH),
    taskArtifacts: evidence.taskArtifacts,
    debtCounts: evidence.debtCounts,
    decisionCounts: evidence.decisionCounts,
    agentCounts: evidence.agentCounts,
    warnings: evidence.warnings
  };
}

export { isGovernanceReviewMode };
