import * as path from "node:path";
import { error, lines } from "../core/logger";
import { generatePrompt, generateScoutPrompt, PromptMode } from "../core/prompts";

function printPromptHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch prompt plan",
    "  node bin/ch prompt work",
    "  node bin/ch prompt review",
    "  node bin/ch prompt scout --role repo-map",
    "  node bin/ch prompt scout --role tests",
    "  node bin/ch prompt scout --role docs",
    "  node bin/ch prompt scout --role security",
    "  node bin/ch prompt scout --role architecture"
  ]);
}

function isPromptMode(value: string): value is PromptMode {
  return value === "plan" || value === "work" || value === "review";
}

function parseScoutRole(args: string[]): { ok: true; role: string } | { ok: false; message: string } {
  if (args.length === 0) {
    return { ok: false, message: "Missing scout arguments." };
  }

  let role: string | undefined;
  const unknownFlags: string[] = [];
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--role") {
      const next = args[index + 1];

      if (!next || next.startsWith("--")) {
        return { ok: false, message: "The `--role` flag requires a scout role." };
      }

      if (role) {
        return { ok: false, message: "The `--role` flag may only be provided once." };
      }

      role = next;
      index += 1;
      continue;
    }

    if (current.startsWith("--")) {
      unknownFlags.push(current);
      continue;
    }

    positional.push(current);
  }

  if (unknownFlags.length > 0) {
    return { ok: false, message: `Unknown scout flag(s): ${unknownFlags.join(", ")}` };
  }

  if (positional.length > 0) {
    return { ok: false, message: `Unknown scout argument(s): ${positional.join(", ")}` };
  }

  if (!role) {
    return { ok: false, message: "A scout role is required." };
  }

  return { ok: true, role };
}

export async function runPrompt(args: string[]): Promise<number> {
  if (args.length === 1 && isPromptMode(args[0])) {
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

  if (args[0] !== "scout") {
    error(`Unknown prompt argument(s): ${args.join(", ") || "(none)"}`);
    printPromptHelp();
    return 1;
  }

  const parsedScout = parseScoutRole(args.slice(1));

  if (!parsedScout.ok) {
    error(parsedScout.message);
    printPromptHelp();
    return 1;
  }

  try {
    const result = generateScoutPrompt(process.cwd(), parsedScout.role);

    lines([
      "codex-harness prompt scout",
      `target root: ${result.targetRoot}`,
      `task id: ${result.taskId}`,
      `prompt file: ${path.relative(result.targetRoot, result.outputPath)}`,
      `findings output: ${path.relative(result.targetRoot, result.findingsOutputPath ?? "")}`,
      `prompt status: ${result.outputStatus}`
    ]);

    return 0;
  } catch (promptError) {
    const message = promptError instanceof Error ? promptError.message : String(promptError);
    error(message);
    return 1;
  }
}
