import * as path from "node:path";
import { error, lines } from "../core/logger";
import { generatePrompt, PromptMode } from "../core/prompts";

function printPromptHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch prompt plan",
    "  node bin/ch prompt work",
    "  node bin/ch prompt review"
  ]);
}

function isPromptMode(value: string): value is PromptMode {
  return value === "plan" || value === "work" || value === "review";
}

export async function runPrompt(args: string[]): Promise<number> {
  if (args.length !== 1 || !isPromptMode(args[0])) {
    error(`Unknown prompt argument(s): ${args.join(", ") || "(none)"}`);
    printPromptHelp();
    return 1;
  }

  try {
    const result = generatePrompt(process.cwd(), args[0]);

    lines([
      `codex-harness prompt ${result.mode}`,
      `target root: ${result.targetRoot}`,
      `task id: ${result.taskId}`,
      `prompt file: ${path.relative(result.targetRoot, result.outputPath)}`,
      `prompt status: ${result.outputStatus}`,
      `AGENTS.md status: ${result.agentsStatus}`
    ]);

    return 0;
  } catch (promptError) {
    const message = promptError instanceof Error ? promptError.message : String(promptError);
    error(message);
    return 1;
  }
}
