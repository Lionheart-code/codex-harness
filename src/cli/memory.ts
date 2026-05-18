import * as path from "node:path";
import { error, lines } from "../core/logger";
import { getMemoryStatus } from "../core/memory";

function printMemoryHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch memory status"
  ]);
}

export async function runMemory(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (subcommand !== "status" || subcommandArgs.length > 0) {
    error(`Unknown memory argument(s): ${args.join(", ") || "(none)"}`);
    printMemoryHelp();
    return 1;
  }

  try {
    const result = getMemoryStatus(process.cwd());
    const warningLines =
      result.warnings.length > 0
        ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
        : [];

    lines([
      "codex-harness memory status",
      `target root: ${result.targetRoot}`,
      `memory root: ${result.memoryRoot}`,
      `debt: open=${result.debtCounts.open} | in_progress=${result.debtCounts.in_progress} | resolved=${result.debtCounts.resolved} | accepted=${result.debtCounts.accepted} | obsolete=${result.debtCounts.obsolete}`,
      `decisions: active=${result.decisionCounts.active} | superseded=${result.decisionCounts.superseded} | rejected=${result.decisionCounts.rejected}`,
      `agent outputs: raw=${result.agentCounts.raw} | accepted=${result.agentCounts.accepted} | stale=${result.agentCounts.stale} | rejected=${result.agentCounts.rejected}`,
      `project index: ${path.relative(result.targetRoot, result.projectIndexPath)}`,
      `debt markdown: ${path.relative(result.targetRoot, result.debtMarkdownPath)}`,
      ...warningLines
    ]);

    return 0;
  } catch (memoryError) {
    const message = memoryError instanceof Error ? memoryError.message : String(memoryError);
    error(message);
    return 1;
  }
}
