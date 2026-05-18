import * as path from "node:path";
import { closeParallelPlan, createParallelPlan, getParallelPlanStatus } from "../core/parallel";
import { error, lines } from "../core/logger";

interface ParallelPlanArgs {
  workers: string[];
  claims: string[];
  integratorClaims: string[];
  unknownFlags: string[];
  positional: string[];
  missingValueFor?: string;
}

function printParallelHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch parallel --help",
    "  node bin/ch parallel plan --worker <worker-id> --worker <worker-id> --claim <worker-id>:<repo-relative-path>",
    "  node bin/ch parallel plan --worker <worker-id> --claim <worker-id>:<repo-relative-path> --integrator-claim <repo-relative-path>",
    "  node bin/ch parallel status",
    "  node bin/ch parallel close"
  ]);
}

function parsePlanArgs(args: string[]): ParallelPlanArgs {
  const result: ParallelPlanArgs = {
    workers: [],
    claims: [],
    integratorClaims: [],
    unknownFlags: [],
    positional: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (!current.startsWith("--")) {
      result.positional.push(current);
      continue;
    }

    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      result.missingValueFor = current;
      return result;
    }

    switch (current) {
      case "--worker":
        result.workers.push(next);
        break;
      case "--claim":
        result.claims.push(next);
        break;
      case "--integrator-claim":
        result.integratorClaims.push(next);
        break;
      default:
        result.unknownFlags.push(current);
        break;
    }

    index += 1;
  }

  return result;
}

export async function runParallel(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printParallelHelp();
    return 0;
  }

  if (subcommand === "plan") {
    const parsed = parsePlanArgs(subcommandArgs);

    if (parsed.missingValueFor) {
      error(`The \`${parsed.missingValueFor}\` flag requires a value.`);
      printParallelHelp();
      return 1;
    }

    if (parsed.unknownFlags.length > 0) {
      error(`Unknown parallel plan flag(s): ${parsed.unknownFlags.join(", ")}`);
      printParallelHelp();
      return 1;
    }

    if (parsed.positional.length > 0) {
      error(`Unknown parallel plan argument(s): ${parsed.positional.join(", ")}`);
      printParallelHelp();
      return 1;
    }

    try {
      const result = createParallelPlan(process.cwd(), {
        workers: parsed.workers,
        claims: parsed.claims,
        integratorClaims: parsed.integratorClaims
      });

      lines([
        "codex-harness parallel plan",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `parallel directory: ${path.relative(result.targetRoot, result.parallelDirectory)}`,
        `plan path: ${path.relative(result.targetRoot, result.planPath)}`,
        `integrator prompt: ${path.relative(result.targetRoot, result.integratorPromptPath)}`,
        `status: ${result.created ? "parallel plan created" : "parallel plan already exists"}`,
        ...result.workers.map(
          (worker) =>
            `- ${worker.worker_id} | branch=${worker.branch} | worktree=${worker.worktree_path} | claims=${worker.claims.join(", ")}`
        )
      ]);

      return 0;
    } catch (parallelError) {
      const message = parallelError instanceof Error ? parallelError.message : String(parallelError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "status") {
    if (subcommandArgs.length > 0) {
      error(`Unknown parallel status argument(s): ${subcommandArgs.join(", ")}`);
      printParallelHelp();
      return 1;
    }

    try {
      const result = getParallelPlanStatus(process.cwd());

      lines([
        "codex-harness parallel status",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `plan path: ${path.relative(result.targetRoot, result.planPath)}`,
        `status: ${result.status}`,
        `integrator worktree: ${result.integratorWorktreePath}`,
        `integrator claims: ${result.integratorClaims.length > 0 ? result.integratorClaims.join(", ") : "(none)"}`,
        ...result.workers.map(
          (worker) =>
            `- ${worker.workerId} | branch=${worker.branch} | exists=${worker.exists ? "true" : "false"} | registered=${worker.registered ? "true" : "false"} | dirty=${worker.dirty ? "true" : "false"} | worktree=${worker.worktreePath} | claims=${worker.claims.join(", ")}`
        )
      ]);

      return result.healthy ? 0 : 1;
    } catch (parallelError) {
      const message = parallelError instanceof Error ? parallelError.message : String(parallelError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "close") {
    if (subcommandArgs.length > 0) {
      error(`Unknown parallel close argument(s): ${subcommandArgs.join(", ")}`);
      printParallelHelp();
      return 1;
    }

    try {
      const result = closeParallelPlan(process.cwd());

      lines([
        "codex-harness parallel close",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `plan path: ${path.relative(result.targetRoot, result.planPath)}`,
        `status: ${result.status}`,
        `closed_at: ${result.closedAt}`
      ]);

      return 0;
    } catch (parallelError) {
      const message = parallelError instanceof Error ? parallelError.message : String(parallelError);
      error(message);
      return 1;
    }
  }

  error(`Unknown parallel subcommand: ${subcommand}`);
  printParallelHelp();
  return 1;
}
