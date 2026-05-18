import * as fs from "node:fs";
import * as path from "node:path";
import {
  AGENTS_BACKUP_SUFFIX,
  AGENTS_PATH,
  CONFIG_PATH,
  PROMPT_PLAN_FILE,
  PROMPT_REVIEW_FILE,
  PROMPT_WORK_FILE,
  BRANCH_RECORD_FILE,
  WORKTREE_RECORD_FILE,
  getImplementationDisciplineSection,
  getTaskTargetPaths
} from "./paths";
import { listTasks, getTaskDirectory, TaskState } from "./tasks";

export type PromptMode = "plan" | "work" | "review";
type FileWriteStatus = "created" | "updated" | "unchanged";

export interface PromptGenerationResult {
  targetRoot: string;
  taskId: string;
  mode: PromptMode;
  outputPath: string;
  outputStatus: FileWriteStatus;
  agentsPath: string;
  agentsStatus: FileWriteStatus;
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
  checksCommands: string[];
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
    throw new Error("Phase 5 `ch prompt` supports exactly one task.");
  }

  return {
    targetRoot: result.targetRoot,
    task: result.tasks[0]
  };
}

function parseChecksCommands(targetRoot: string): string[] {
  const configPath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    return [];
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

    if (currentSection !== "checks") {
      continue;
    }

    const commandsMatch = /^commands\s*=\s*\[(.*)\]\s*$/.exec(trimmed);

    if (!commandsMatch) {
      continue;
    }

    const rawItems = commandsMatch[1].trim();

    if (rawItems.length === 0) {
      return [];
    }

    return rawItems
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.startsWith("\"") && item.endsWith("\""))
      .map((item) => item.slice(1, -1));
  }

  return [];
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
    checksCommands: parseChecksCommands(targetRoot)
  };
}

function relativeToTask(context: PromptContext, targetPath: string): string {
  return path.relative(context.taskDirectory, targetPath) || ".";
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
  lines.push(...context.checksCommands.map((command) => `- \`${command}\``));

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

function buildPromptContent(mode: PromptMode, context: PromptContext): string {
  const outputFiles = getTaskTargetPaths(context.task.task_id)
    .map((entry) => `- \`${entry}\``);
  const worktreeValue = context.worktreePath.length > 0 ? context.worktreePath : "not recorded";

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
