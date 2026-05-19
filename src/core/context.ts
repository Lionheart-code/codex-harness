import * as path from "node:path";
import {
  PROMPT_PLAN_FILE,
  PROMPT_REVIEW_FILE,
  PROMPT_WORK_FILE,
  TASK_PROMPTS_DIR,
  TASK_SCOUTS_DIR
} from "./paths";
import {
  getPromptInspectionContext,
  isScoutRole,
  type PromptMode,
  type PromptInspectionContext,
  type ScoutRole
} from "./prompts";

export interface ContextInspectionResult {
  targetRoot: string;
  taskId: string;
  title: string;
  phase: string;
  mode: PromptMode | "scout";
  scoutRole?: ScoutRole;
  taskDirectory: string;
  worktreePath: string;
  promptArtifactPath: string;
  referencePaths: {
    spec: string;
    acceptance: string;
    state: string;
    branchRecord: string;
    worktreeRecord: string;
    repoAgents: string;
  };
  checksCommands: string[];
  scoutPromptDirectory?: string;
  scoutOutputDirectory?: string;
  scoutOutputPath?: string;
  contextPolicyNotes: string[];
}

function buildBaseInspection(context: PromptInspectionContext, mode: PromptMode | "scout"): Omit<
  ContextInspectionResult,
  "promptArtifactPath" | "scoutRole" | "scoutPromptDirectory" | "scoutOutputDirectory" | "scoutOutputPath"
> {
  return {
    targetRoot: context.targetRoot,
    taskId: context.taskId,
    title: context.title,
    phase: context.phase,
    mode,
    taskDirectory: context.taskDirectory,
    worktreePath: context.worktreePath,
    referencePaths: {
      spec: context.specPath,
      acceptance: context.acceptancePath,
      state: context.statePath,
      branchRecord: context.branchRecordPath,
      worktreeRecord: context.worktreeRecordPath,
      repoAgents: path.join(context.targetRoot, "AGENTS.md")
    },
    checksCommands: [...context.checksCommands],
    contextPolicyNotes: [
      "Raw logs are not prompt context.",
      "Reference artifacts by path instead of pasting large files.",
      "Use only task-relevant summaries and references where safe."
    ]
  };
}

export function inspectPromptContext(cwd: string, mode: PromptMode): ContextInspectionResult {
  const context = getPromptInspectionContext(cwd);
  const base = buildBaseInspection(context, mode);

  const promptArtifactPath = path.join(
    context.taskDirectory,
    mode === "plan" ? PROMPT_PLAN_FILE : mode === "work" ? PROMPT_WORK_FILE : PROMPT_REVIEW_FILE
  );

  return {
    ...base,
    promptArtifactPath
  };
}

export function inspectScoutContext(cwd: string, role: string): ContextInspectionResult {
  if (!isScoutRole(role)) {
    throw new Error(`Unsupported scout role: ${role}`);
  }

  const context = getPromptInspectionContext(cwd);
  const base = buildBaseInspection(context, "scout");
  const scoutPromptDirectory = path.join(context.taskDirectory, TASK_PROMPTS_DIR);
  const scoutOutputDirectory = path.join(context.taskDirectory, TASK_SCOUTS_DIR);
  const promptArtifactPath = path.join(scoutPromptDirectory, `scout-${role}.md`);
  const scoutOutputPath = path.join(scoutOutputDirectory, `${role}.md`);

  return {
    ...base,
    scoutRole: role,
    promptArtifactPath,
    scoutPromptDirectory,
    scoutOutputDirectory,
    scoutOutputPath
  };
}
