import { error, lines } from "../core/logger";
import { bootstrapWorktree, createOrResolveWorktree, deleteWorktreeForRun } from "../core/worktree";

type ParsedOptions = Record<string, string | boolean>;

function parseOptions(args: string[], valueFlags: Set<string>): ParsedOptions {
  const parsed: ParsedOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (!valueFlags.has(name)) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }

    parsed[name] = value;
    index += 1;
  }

  return parsed;
}

function printHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch worktree",
    "  node bin/ch worktree delete --run <run-id> [--manual-override <reason>]",
    "  node bin/ch worktree bootstrap [--verify] [--dry-run]"
  ]);
}

function stringOption(options: ParsedOptions, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
}

async function runCreate(args: string[]): Promise<number> {
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

async function runDelete(args: string[]): Promise<number> {
  try {
    const options = parseOptions(args, new Set(["run", "manual-override"]));
    const runId = stringOption(options, "run");

    if (!runId) {
      throw new Error("--run is required.");
    }

    const result = deleteWorktreeForRun(process.cwd(), runId, stringOption(options, "manual-override"));
    lines([
      "codex-harness worktree delete",
      `target root: ${result.targetRoot}`,
      `run id: ${result.runId}`,
      `worktree: ${result.worktreePath}`,
      `lifecycle status: ${result.lifecycleStatus}`,
      `manual override recorded: ${result.manualOverrideRecorded ? "true" : "false"}`,
      `status: ${result.removed ? "worktree removed" : "no-op"}`
    ]);
    return 0;
  } catch (worktreeError) {
    const message = worktreeError instanceof Error ? worktreeError.message : String(worktreeError);
    error(message);
    return 1;
  }
}

async function runBootstrap(args: string[]): Promise<number> {
  let verifyOnly = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--verify") {
      verifyOnly = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    error(`Unknown worktree bootstrap option: ${arg}`);
    return 1;
  }

  try {
    const result = bootstrapWorktree(process.cwd(), { dryRun, verifyOnly });
    lines([
      "codex-harness worktree bootstrap",
      `target root: ${result.targetRoot}`,
      `dry run: ${result.dryRun ? "yes" : "no"}`,
      `verify only: ${result.verifyOnly ? "yes" : "no"}`,
      `setup command: ${result.setupCommand}`,
      `status: ${result.state}`,
      ...result.checks.map((entry) => `- ${entry}`)
    ]);
    return 0;
  } catch (worktreeError) {
    const message = worktreeError instanceof Error ? worktreeError.message : String(worktreeError);
    error(message);
    return 1;
  }
}

export async function runWorktree(args: string[]): Promise<number> {
  if (args.length === 0) {
    return runCreate(args);
  }

  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    printHelp();
    return 0;
  }

  const [subcommand, ...subcommandArgs] = args;
  if (subcommand === "delete") {
    return runDelete(subcommandArgs);
  }
  if (subcommand === "bootstrap") {
    return runBootstrap(subcommandArgs);
  }

  return runCreate(args);
}
