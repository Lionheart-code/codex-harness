import * as path from "node:path";
import { error, lines } from "../core/logger";
import { listAgentRuns, recordAgentRun } from "../core/agent-ledger";

interface RecordArgs {
  role?: string;
  output?: string;
  profile?: string;
  prompt?: string;
  notes?: string;
  unknownFlags: string[];
  positional: string[];
  missingValueFor?: string;
}

function printAgentHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch agent record --role <role> --output <path>",
    "  node bin/ch agent list"
  ]);
}

function parseRecordArgs(args: string[]): RecordArgs {
  const result: RecordArgs = {
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
      case "--role":
        result.role = next;
        break;
      case "--output":
        result.output = next;
        break;
      case "--profile":
        result.profile = next;
        break;
      case "--prompt":
        result.prompt = next;
        break;
      case "--notes":
        result.notes = next;
        break;
      default:
        result.unknownFlags.push(current);
        break;
    }

    index += 1;
  }

  return result;
}

export async function runAgent(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand) {
    error("An agent subcommand is required.");
    printAgentHelp();
    return 1;
  }

  if (subcommand === "record") {
    const parsed = parseRecordArgs(subcommandArgs);

    if (parsed.missingValueFor) {
      error(`The \`${parsed.missingValueFor}\` flag requires a value.`);
      printAgentHelp();
      return 1;
    }

    if (parsed.unknownFlags.length > 0) {
      error(`Unknown agent record flag(s): ${parsed.unknownFlags.join(", ")}`);
      printAgentHelp();
      return 1;
    }

    if (parsed.positional.length > 0) {
      error(`Unknown agent record argument(s): ${parsed.positional.join(", ")}`);
      printAgentHelp();
      return 1;
    }

    if (!parsed.role) {
      error("The `--role` flag is required.");
      printAgentHelp();
      return 1;
    }

    if (!parsed.output) {
      error("The `--output` flag is required.");
      printAgentHelp();
      return 1;
    }

    try {
      const result = recordAgentRun(process.cwd(), {
        role: parsed.role,
        output: parsed.output,
        profile: parsed.profile,
        prompt: parsed.prompt,
        notes: parsed.notes
      });

      const output = [
        "codex-harness agent record",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `run id: ${result.runId}`,
        `run directory: ${path.relative(result.targetRoot, result.runDirectory)}`,
        `metadata: ${path.relative(result.targetRoot, result.metadataPath)}`,
        `prompt path: ${result.promptPath || "(none)"}`,
        `output path: ${result.outputPath}`,
        "status: raw"
      ];

      if (!result.promptPath) {
        output.push("note: no prompt path was provided or inferred");
      } else if (result.inferredPrompt) {
        output.push("note: prompt path was inferred from the scout role");
      }

      lines(output);
      return 0;
    } catch (agentError) {
      const message = agentError instanceof Error ? agentError.message : String(agentError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "list") {
    if (subcommandArgs.length > 0) {
      error(`Unknown agent list argument(s): ${subcommandArgs.join(", ")}`);
      printAgentHelp();
      return 1;
    }

    try {
      const result = listAgentRuns(process.cwd());
      const warningLines =
        result.warnings.length > 0
          ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
          : [];

      if (result.runs.length === 0) {
        lines([
          "codex-harness agent list",
          `target root: ${result.targetRoot}`,
          `task id: ${result.taskId}`,
          "No agent runs found.",
          ...warningLines
        ]);
        return 0;
      }

      lines([
        "codex-harness agent list",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        ...result.runs.map((run) => {
          const segments = [
            `- ${run.run_id}`,
            run.status,
            run.role,
            `created_at=${run.created_at}`,
            `prompt_path=${run.prompt_path || "(none)"}`,
            `output_path=${run.output_path}`
          ];

          if (run.profile) {
            segments.push(`profile=${run.profile}`);
          }

          return segments.join(" | ");
        }),
        ...warningLines
      ]);

      return 0;
    } catch (agentError) {
      const message = agentError instanceof Error ? agentError.message : String(agentError);
      error(message);
      return 1;
    }
  }

  error(`Unknown agent subcommand: ${subcommand}`);
  printAgentHelp();
  return 1;
}
