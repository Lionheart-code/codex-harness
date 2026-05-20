import * as fs from "node:fs";
import * as path from "node:path";
import {
  AGENTS_BACKUP_SUFFIX,
  AGENTS_PATH,
  PROMPT_PLAN_FILE,
  PROMPT_REVIEW_FILE,
  PROMPT_WORK_FILE,
  BRANCH_RECORD_FILE,
  TASK_PROMPTS_DIR,
  TASK_SCOUTS_DIR,
  WORKTREE_RECORD_FILE,
  getImplementationDisciplineSection,
  getTaskTargetPaths
} from "./paths";
import { inspectCheckConfig, type CheckCommandSpec } from "./checks";
import { listTasks, getTaskDirectory, TaskState } from "./tasks";

export type PromptMode = "plan" | "work" | "review";
export type ScoutRole = "repo-map" | "tests" | "docs" | "security" | "architecture";
type FileWriteStatus = "created" | "updated" | "unchanged";

export interface PromptGenerationResult {
  targetRoot: string;
  taskId: string;
  mode: PromptMode | "scout";
  outputPath: string;
  outputStatus: FileWriteStatus;
  agentsPath: string;
  agentsStatus: FileWriteStatus;
  findingsOutputPath?: string;
}

interface PromptContext {
  targetRoot: string;
  taskDirectory: string;
  task: TaskState;
  specPath: string;
  acceptancePath: string;
  statePath: string;
  branchRecordPath: string;
  worktreeRecordPath: string;
  worktreePath: string;
  checksCommands: CheckCommandSpec[];
}

export interface PromptInspectionContext {
  targetRoot: string;
  taskId: string;
  title: string;
  phase: string;
  taskDirectory: string;
  worktreePath: string;
  specPath: string;
  acceptancePath: string;
  statePath: string;
  branchRecordPath: string;
  worktreeRecordPath: string;
  checksCommands: string[];
}

export interface RenderedScoutPrompt {
  targetRoot: string;
  taskId: string;
  content: string;
  worktreePath: string;
}

function toMarkdownPath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function getPromptFilename(mode: PromptMode): string {
  switch (mode) {
    case "plan":
      return PROMPT_PLAN_FILE;
    case "work":
      return PROMPT_WORK_FILE;
    case "review":
      return PROMPT_REVIEW_FILE;
  }
}

function getPromptTitle(mode: PromptMode): string {
  switch (mode) {
    case "plan":
      return "Prompt Plan";
    case "work":
      return "Prompt Work";
    case "review":
      return "Prompt Review";
  }
}

export function isScoutRole(value: string): value is ScoutRole {
  return value === "repo-map" || value === "tests" || value === "docs" || value === "security" || value === "architecture";
}

function getAllowedScope(mode: PromptMode): string[] {
  switch (mode) {
    case "plan":
      return [
        "Scope the current task only.",
        "Reference task files by path instead of pasting large context.",
        "Do not write code or edit files."
      ];
    case "work":
      return [
        "Implement only the current task in the recorded worktree.",
        "Limit edits to files required by the task acceptance criteria.",
        "Do not add later-phase features or unrelated refactors."
      ];
    case "review":
      return [
        "Review only the current task changes and acceptance coverage.",
        "Focus on bugs, regressions, risks, and missing tests.",
        "Do not implement fixes unless explicitly asked."
      ];
  }
}

function getExpectedOutput(mode: PromptMode): string[] {
  switch (mode) {
    case "plan":
      return [
        "A scoped implementation plan for the current task only.",
        "Concrete acceptance coverage and explicit assumptions."
      ];
    case "work":
      return [
        "An implementation summary for the current task.",
        "Changed files and verification results."
      ];
    case "review":
      return [
        "Findings-first review output.",
        "Risks, regressions, and missing tests before any summary."
      ];
  }
}

function getModeInstructions(mode: PromptMode): string[] {
  switch (mode) {
    case "plan":
      return [
        "Produce a decision-complete implementation plan for the active task only.",
        "Keep later phases out of scope.",
        "Do not propose code edits yet."
      ];
    case "work":
      return [
        "Implement the active task in the recorded worktree.",
        "Use the task files as the source of truth.",
        "Run the required verification before reporting completion."
      ];
    case "review":
      return [
        "Review the current task implementation in code-review mode.",
        "Lead with findings, ordered by severity.",
        "Call out missing tests or residual risk if no defects are found."
      ];
  }
}

function ensureSingleTask(cwd: string): { targetRoot: string; task: TaskState } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Exactly one task is required.");
  }

  return {
    targetRoot: result.targetRoot,
    task: result.tasks[0]
  };
}

function createPromptContext(cwd: string): PromptContext {
  const { targetRoot, task } = ensureSingleTask(cwd);
  const taskDirectory = getTaskDirectory(targetRoot, task.task_id);
  const branchRecordPath = path.join(taskDirectory, BRANCH_RECORD_FILE);
  const worktreeRecordPath = path.join(taskDirectory, WORKTREE_RECORD_FILE);

  if (!fs.existsSync(branchRecordPath) || !fs.existsSync(worktreeRecordPath) || !task.worktree) {
    throw new Error("Task worktree is not ready. Run `node bin/ch worktree` first.");
  }

  return {
    targetRoot,
    taskDirectory,
    task,
    specPath: path.join(taskDirectory, "spec.md"),
    acceptancePath: path.join(taskDirectory, "acceptance.md"),
    statePath: path.join(taskDirectory, "state.json"),
    branchRecordPath,
    worktreeRecordPath,
    worktreePath: task.worktree,
    checksCommands: inspectCheckConfig(targetRoot).commands
  };
}

export function getPromptInspectionContext(cwd: string): PromptInspectionContext {
  const context = createPromptContext(cwd);

  return {
    targetRoot: context.targetRoot,
    taskId: context.task.task_id,
    title: context.task.title,
    phase: context.task.phase,
    taskDirectory: context.taskDirectory,
    worktreePath: context.worktreePath,
    specPath: context.specPath,
    acceptancePath: context.acceptancePath,
    statePath: context.statePath,
    branchRecordPath: context.branchRecordPath,
    worktreeRecordPath: context.worktreeRecordPath,
    checksCommands: context.checksCommands.map((command) => command.displayCommand)
  };
}

function relativeToTask(context: PromptContext, targetPath: string): string {
  return toMarkdownPath(path.relative(context.taskDirectory, targetPath) || ".");
}

function buildVerificationLines(context: PromptContext): string[] {
  const lines = [
    `- Use \`${relativeToTask(context, context.acceptancePath)}\` as the primary verification reference.`
  ];

  if (context.checksCommands.length === 0) {
    lines.push("- No project-specific check commands are defined in `.harness/config.toml`.");
    return lines;
  }

  lines.push("- Run the project-specific commands listed in `.harness/config.toml`:");
  lines.push(...context.checksCommands.map((command) => `- \`${command.displayCommand}\``));

  return lines;
}

function getImplementationDisciplinePromptLines(): string[] {
  return [
    "Implementation discipline:",
    "- Surface ambiguity before choosing an implementation path.",
    "- Prefer the smallest implementation that satisfies the active task acceptance criteria.",
    "- Make surgical changes only; do not refactor unrelated code.",
    "- Do not add speculative flexibility, future features, or abstractions.",
    "- Verify with the required acceptance commands before reporting completion."
  ];
}

function getScoutPromptTitle(role: ScoutRole): string {
  switch (role) {
    case "repo-map":
      return "Scout Prompt: Repo Map";
    case "tests":
      return "Scout Prompt: Tests";
    case "docs":
      return "Scout Prompt: Docs";
    case "security":
      return "Scout Prompt: Security";
    case "architecture":
      return "Scout Prompt: Architecture";
  }
}

function getScoutFocus(role: ScoutRole): string[] {
  switch (role) {
    case "repo-map":
      return [
        "Map the repository structure, entrypoints, and major modules.",
        "Call out likely ownership zones and high-signal files for follow-up."
      ];
    case "tests":
      return [
        "Inspect the existing test layout, notable gaps, and likely acceptance coverage points.",
        "Call out high-signal test files and missing test areas."
      ];
    case "docs":
      return [
        "Inspect the docs that constrain the task and note stale or missing documentation.",
        "Call out the most relevant files for future implementation work."
      ];
    case "security":
      return [
        "Inspect obvious risk surfaces, secrets/config handling, and permission-sensitive areas.",
        "Call out files or flows that deserve closer review."
      ];
    case "architecture":
      return [
        "Inspect module boundaries, coupling, and likely implementation impact zones.",
        "Call out architectural constraints that should shape future work."
      ];
  }
}

function buildPromptContent(mode: PromptMode, context: PromptContext): string {
  const outputFiles = getTaskTargetPaths(context.task.task_id)
    .map((entry) => `- \`${toMarkdownPath(entry)}\``);
  const worktreeValue = context.worktreePath.length > 0 ? toMarkdownPath(context.worktreePath) : "not recorded";

  return [
    `# ${getPromptTitle(mode)}`,
    "",
    ...getModeInstructions(mode),
    "",
    "Task context:",
    `- task_id: \`${context.task.task_id}\``,
    `- title: ${context.task.title}`,
    `- phase: \`${context.task.phase}\``,
    `- worktree path: \`${worktreeValue}\``,
    "",
    "Reference paths:",
    `- spec: \`${relativeToTask(context, context.specPath)}\``,
    `- acceptance: \`${relativeToTask(context, context.acceptancePath)}\``,
    `- state: \`${relativeToTask(context, context.statePath)}\``,
    `- branch record: \`${relativeToTask(context, context.branchRecordPath)}\``,
    `- worktree record: \`${relativeToTask(context, context.worktreeRecordPath)}\``,
    `- repo AGENTS: \`${relativeToTask(context, path.join(context.targetRoot, AGENTS_PATH))}\``,
    "",
    "Allowed scope:",
    ...getAllowedScope(mode).map((line) => `- ${line}`),
    "",
    "Verification:",
    ...buildVerificationLines(context),
    "",
    "Expected output:",
    ...getExpectedOutput(mode).map((line) => `- ${line}`),
    "",
    ...getImplementationDisciplinePromptLines(),
    "",
    "Task file reminder:",
    ...outputFiles,
    ""
  ].join("\n");
}

function getBackupPath(filePath: string): string {
  const initialPath = `${filePath}${AGENTS_BACKUP_SUFFIX}`;

  if (!fs.existsSync(initialPath)) {
    return initialPath;
  }

  let counter = 1;

  while (true) {
    const candidate = `${initialPath}.${counter}`;

    if (!fs.existsSync(candidate)) {
      return candidate;
    }

    counter += 1;
  }
}

function ensureImplementationDisciplineSection(targetRoot: string): FileWriteStatus {
  const agentsPath = path.join(targetRoot, AGENTS_PATH);
  const section = getImplementationDisciplineSection();

  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, `${section}\n`, "utf8");
    return "created";
  }

  const currentContent = fs.readFileSync(agentsPath, "utf8");

  if (currentContent.includes(section)) {
    return "unchanged";
  }

  const trimmed = currentContent.trimEnd();
  const separator = trimmed.length > 0 ? "\n\n" : "";
  const nextContent = `${trimmed}${separator}${section}\n`;
  const backupPath = getBackupPath(agentsPath);
  fs.copyFileSync(agentsPath, backupPath);
  fs.writeFileSync(agentsPath, nextContent, "utf8");

  return "updated";
}

function writeGeneratedPrompt(outputPath: string, content: string): FileWriteStatus {
  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, content, "utf8");
    return "created";
  }

  const currentContent = fs.readFileSync(outputPath, "utf8");

  if (currentContent === content) {
    return "unchanged";
  }

  fs.writeFileSync(outputPath, content, "utf8");
  return "updated";
}

function ensureDirectory(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function buildScoutPromptContent(
  role: ScoutRole,
  context: PromptContext,
  promptDirectory: string,
  outputDirectory: string,
  findingsOutputPath: string
): string {

  return [
    `# ${getScoutPromptTitle(role)}`,
    "",
    "This prompt is for manual use in Codex, Gemini CLI, or another trusted agent.",
    "The harness does not execute any external agent automatically.",
    "",
    "Role profile:",
    "- role: `scout`",
    "- permission mode: `read_only`",
    "- working directory policy: `repo_root`",
    "- output trust: raw and untrusted until reviewed",
    "",
    "Task context:",
    `- task_id: \`${context.task.task_id}\``,
    `- title: ${context.task.title}`,
    `- phase: \`${context.task.phase}\``,
    `- worktree path: \`${toMarkdownPath(context.worktreePath)}\``,
    "",
    "Reference paths:",
    `- spec: \`${relativeToTask(context, context.specPath)}\``,
    `- acceptance: \`${relativeToTask(context, context.acceptancePath)}\``,
    `- state: \`${relativeToTask(context, context.statePath)}\``,
    `- branch record: \`${relativeToTask(context, context.branchRecordPath)}\``,
    `- worktree record: \`${relativeToTask(context, context.worktreeRecordPath)}\``,
    `- repo AGENTS: \`${relativeToTask(context, path.join(context.targetRoot, AGENTS_PATH))}\``,
    `- scout prompt directory: \`${relativeToTask(context, promptDirectory)}\``,
    `- scout output directory: \`${relativeToTask(context, outputDirectory)}\``,
    "",
    "Scout output path:",
    `- Write findings only to \`${relativeToTask(context, findingsOutputPath)}\`.`,
    "",
    "Read-only rules:",
    "- Inspect only.",
    "- Do not edit files.",
    "- Do not run write commands.",
    "- Do not create branches or worktrees.",
    "- Do not create additional output files beyond the specified scout output path.",
    "- Report uncertainty and assumptions.",
    "",
    "Context rules:",
    "- Reference task files and project paths instead of dumping huge context.",
    "- Do not paste large raw files or raw logs unless a short excerpt is strictly necessary.",
    "",
    "Scout focus:",
    ...getScoutFocus(role).map((line) => `- ${line}`),
    "",
    "Expected findings format:",
    "- Relevant files",
    "- Findings",
    "- Risks",
    "- Suggested focus",
    "- Confidence",
    "- Assumptions and uncertainty",
    "",
    ...getImplementationDisciplinePromptLines(),
    ""
  ].join("\n");
}

export function renderScoutPromptForPaths(
  cwd: string,
  role: string,
  promptDirectory: string,
  outputDirectory: string,
  findingsOutputPath: string
): RenderedScoutPrompt {
  if (!isScoutRole(role)) {
    throw new Error(`Unsupported scout role: ${role}`);
  }

  const context = createPromptContext(cwd);

  return {
    targetRoot: context.targetRoot,
    taskId: context.task.task_id,
    content: buildScoutPromptContent(role, context, promptDirectory, outputDirectory, findingsOutputPath),
    worktreePath: context.worktreePath
  };
}

export function generatePrompt(cwd: string, mode: PromptMode): PromptGenerationResult {
  const context = createPromptContext(cwd);
  const outputPath = path.join(context.taskDirectory, getPromptFilename(mode));
  const outputContent = buildPromptContent(mode, context);
  const agentsStatus = ensureImplementationDisciplineSection(context.targetRoot);
  const outputStatus = writeGeneratedPrompt(outputPath, outputContent);

  return {
    targetRoot: context.targetRoot,
    taskId: context.task.task_id,
    mode,
    outputPath,
    outputStatus,
    agentsPath: path.join(context.targetRoot, AGENTS_PATH),
    agentsStatus
  };
}

export function generateScoutPrompt(cwd: string, role: string): PromptGenerationResult {
  const base = ensureSingleTask(cwd);
  const taskDirectory = getTaskDirectory(base.targetRoot, base.task.task_id);
  const scoutsDirectory = path.join(taskDirectory, TASK_SCOUTS_DIR);
  const promptDirectory = path.join(taskDirectory, TASK_PROMPTS_DIR);
  const outputPath = path.join(promptDirectory, `scout-${role}.md`);
  const findingsOutputPath = path.join(scoutsDirectory, `${role}.md`);
  const rendered = renderScoutPromptForPaths(cwd, role, promptDirectory, scoutsDirectory, findingsOutputPath);

  ensureDirectory(promptDirectory);
  ensureDirectory(scoutsDirectory);

  const outputStatus = writeGeneratedPrompt(outputPath, rendered.content);

  return {
    targetRoot: rendered.targetRoot,
    taskId: rendered.taskId,
    mode: "scout",
    outputPath,
    outputStatus,
    agentsPath: path.join(rendered.targetRoot, AGENTS_PATH),
    agentsStatus: "unchanged",
    findingsOutputPath
  };
}
