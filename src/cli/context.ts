import * as path from "node:path";
import { inspectPromptContext, inspectScoutContext } from "../core/context";
import { error, lines } from "../core/logger";
import type { PromptMode } from "../core/prompts";

function printContextHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch context --help",
    "  node bin/ch context inspect plan",
    "  node bin/ch context inspect work",
    "  node bin/ch context inspect review",
    "  node bin/ch context inspect scout --role <repo-map|tests|docs|security|architecture>"
  ]);
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return path.relative(targetRoot, absolutePath).replace(/\\/g, "/") || ".";
}

function printInspectionResult(result: ReturnType<typeof inspectPromptContext> | ReturnType<typeof inspectScoutContext>): void {
  const output = [
    "codex-harness context inspect",
    `target root: ${result.targetRoot}`,
    `task id: ${result.taskId}`,
    `title: ${result.title}`,
    `phase: ${result.phase}`,
    `mode: ${result.mode}${result.scoutRole ? `:${result.scoutRole}` : ""}`,
    `task directory: ${toRepoRelative(result.targetRoot, result.taskDirectory)}`,
    `worktree path: ${result.worktreePath}`,
    `prompt artifact path: ${toRepoRelative(result.targetRoot, result.promptArtifactPath)}`,
    "reference paths:",
    `- spec: ${toRepoRelative(result.targetRoot, result.referencePaths.spec)}`,
    `- acceptance: ${toRepoRelative(result.targetRoot, result.referencePaths.acceptance)}`,
    `- state: ${toRepoRelative(result.targetRoot, result.referencePaths.state)}`,
    `- branch record: ${toRepoRelative(result.targetRoot, result.referencePaths.branchRecord)}`,
    `- worktree record: ${toRepoRelative(result.targetRoot, result.referencePaths.worktreeRecord)}`,
    `- repo AGENTS: ${toRepoRelative(result.targetRoot, result.referencePaths.repoAgents)}`
  ];

  if (result.scoutPromptDirectory && result.scoutOutputDirectory && result.scoutOutputPath) {
    output.push(`scout prompt directory: ${toRepoRelative(result.targetRoot, result.scoutPromptDirectory)}`);
    output.push(`scout output directory: ${toRepoRelative(result.targetRoot, result.scoutOutputDirectory)}`);
    output.push(`scout output path: ${toRepoRelative(result.targetRoot, result.scoutOutputPath)}`);
  }

  if (result.mode === "work") {
    output.push("checks:");
    output.push(
      ...(result.checksCommands.length > 0
        ? result.checksCommands.map((command) => `- ${command}`)
        : ["- none configured"])
    );
  }

  output.push("context policy:");
  output.push(...result.contextPolicyNotes.map((note) => `- ${note}`));
  lines(output);
}

export async function runContext(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printContextHelp();
    return 0;
  }

  if (subcommand !== "inspect") {
    error(`Unknown context subcommand: ${subcommand}`);
    printContextHelp();
    return 1;
  }

  const [mode, ...modeArgs] = subcommandArgs;

  if (!mode) {
    printContextHelp();
    return 0;
  }

  try {
    if (mode === "plan" || mode === "work" || mode === "review") {
      if (modeArgs.length > 0) {
        error(`Unknown context inspect argument(s): ${modeArgs.join(", ")}`);
        printContextHelp();
        return 1;
      }

      printInspectionResult(inspectPromptContext(process.cwd(), mode as PromptMode));
      return 0;
    }

    if (mode === "scout") {
      if (modeArgs.length !== 2 || modeArgs[0] !== "--role" || modeArgs[1].trim().length === 0) {
        error(`Unknown context inspect scout argument(s): ${modeArgs.join(", ")}`);
        printContextHelp();
        return 1;
      }

      printInspectionResult(inspectScoutContext(process.cwd(), modeArgs[1]));
      return 0;
    }

    error(`Unsupported context mode: ${mode}`);
    printContextHelp();
    return 1;
  } catch (contextError) {
    const message = contextError instanceof Error ? contextError.message : String(contextError);
    error(message);
    return 1;
  }
}
