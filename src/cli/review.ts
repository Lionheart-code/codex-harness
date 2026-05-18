import * as path from "node:path";
import { error, lines } from "../core/logger";
import { runCodexExecReview, validateCurrentTaskReview } from "../core/review";

function printReviewHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch review",
    "  node bin/ch review --exec"
  ]);
}

function renderReviewOutput(
  mode: "manual" | "exec",
  result: ReturnType<typeof validateCurrentTaskReview> | ReturnType<typeof runCodexExecReview>
): string[] {
  const output = [
    `codex-harness review (${mode})`,
    `target root: ${result.targetRoot}`,
    `task id: ${result.taskId}`,
    `review path: ${path.relative(result.targetRoot, result.reviewPath)}`,
    `result: ${result.review.result}`,
    `summary: ${result.review.summary}`
  ];

  if (result.review.blockers.length > 0) {
    output.push("blockers:");
    output.push(...result.review.blockers.map((blocker) => `- ${blocker}`));
  }

  return output;
}

export async function runReview(args: string[]): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h" || args[0] === "help")) {
    printReviewHelp();
    return 0;
  }

  if (args.length > 1 || (args.length === 1 && args[0] !== "--exec")) {
    error(`Unknown review argument(s): ${args.join(", ")}`);
    printReviewHelp();
    return 1;
  }

  try {
    if (args[0] === "--exec") {
      const result = runCodexExecReview(process.cwd());
      lines(renderReviewOutput("exec", result));
      return result.review.result === "PASS" ? 0 : 1;
    }

    const result = validateCurrentTaskReview(process.cwd());
    lines(renderReviewOutput("manual", result));
    return result.review.result === "PASS" ? 0 : 1;
  } catch (reviewError) {
    const message = reviewError instanceof Error ? reviewError.message : String(reviewError);
    error(message);
    return 1;
  }
}
