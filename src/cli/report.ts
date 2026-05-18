import * as path from "node:path";
import { error, lines } from "../core/logger";
import { generateTaskReport } from "../core/report";

function printReportHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch report"
  ]);
}

export async function runReport(args: string[]): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h" || args[0] === "help")) {
    printReportHelp();
    return 0;
  }

  if (args.length > 0) {
    error(`Unknown report argument(s): ${args.join(", ")}`);
    printReportHelp();
    return 1;
  }

  try {
    const result = generateTaskReport(process.cwd());

    lines([
      "codex-harness report",
      `target root: ${result.targetRoot}`,
      `task id: ${result.taskId}`,
      `result path: ${path.relative(result.targetRoot, result.resultPath)}`,
      "status: report written"
    ]);

    return 0;
  } catch (reportError) {
    const message = reportError instanceof Error ? reportError.message : String(reportError);
    error(message);
    return 1;
  }
}
