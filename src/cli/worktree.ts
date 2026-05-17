import { error, lines } from "../core/logger";
import { createOrResolveWorktree } from "../core/worktree";

export async function runWorktree(args: string[]): Promise<number> {
  if (args.length > 0) {
    error(`Unknown worktree argument(s): ${args.join(", ")}`);
    return 1;
  }

  try {
    const result = createOrResolveWorktree(process.cwd());

    lines([
      "codex-harness worktree",
      `target root: ${result.targetRoot}`,
      `task id: ${result.taskId}`,
      `branch: ${result.branch}`,
      `worktree: ${result.worktreePath}`,
      `status: ${result.created ? "worktree created" : "worktree already exists"}`,
      ...result.createdPaths.map((entry) => `- ${entry}`)
    ]);

    return 0;
  } catch (worktreeError) {
    const message = worktreeError instanceof Error ? worktreeError.message : String(worktreeError);
    error(message);
    return 1;
  }
}
