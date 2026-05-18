import * as path from "node:path";
import { addDecision, listDecisions } from "../core/memory";
import { error, lines } from "../core/logger";

interface DecisionAddArgs {
  title?: string;
  reason?: string;
  context?: string;
  alternatives: string[];
  affected: string[];
  unknownFlags: string[];
  positional: string[];
  missingValueFor?: string;
}

function printDecisionsHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch decisions add --title <title> --reason <reason>",
    "  node bin/ch decisions add --title <title> --reason <reason> --context <text> --alternative <option> --affected <path>",
    "  node bin/ch decisions list"
  ]);
}

function parseDecisionAddArgs(args: string[]): DecisionAddArgs {
  const result: DecisionAddArgs = {
    alternatives: [],
    affected: [],
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
      case "--title":
        result.title = next;
        break;
      case "--reason":
        result.reason = next;
        break;
      case "--context":
        result.context = next;
        break;
      case "--alternative":
        result.alternatives.push(next);
        break;
      case "--affected":
        result.affected.push(next);
        break;
      default:
        result.unknownFlags.push(current);
        break;
    }

    index += 1;
  }

  return result;
}

export async function runDecisions(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand) {
    error("A decisions subcommand is required.");
    printDecisionsHelp();
    return 1;
  }

  if (subcommand === "add") {
    const parsed = parseDecisionAddArgs(subcommandArgs);

    if (parsed.missingValueFor) {
      error(`The \`${parsed.missingValueFor}\` flag requires a value.`);
      printDecisionsHelp();
      return 1;
    }

    if (parsed.unknownFlags.length > 0) {
      error(`Unknown decisions add flag(s): ${parsed.unknownFlags.join(", ")}`);
      printDecisionsHelp();
      return 1;
    }

    if (parsed.positional.length > 0) {
      error(`Unknown decisions add argument(s): ${parsed.positional.join(", ")}`);
      printDecisionsHelp();
      return 1;
    }

    if (!parsed.title || !parsed.reason) {
      error("Decisions add requires `--title` and `--reason`.");
      printDecisionsHelp();
      return 1;
    }

    try {
      const result = addDecision(process.cwd(), {
        title: parsed.title,
        reason: parsed.reason,
        context: parsed.context,
        alternatives: parsed.alternatives,
        affected: parsed.affected
      });

      lines([
        "codex-harness decisions add",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `decision id: ${result.decision.decision_id}`,
        `status: ${result.decision.status}`,
        `decision path: ${path.relative(result.targetRoot, result.decisionPath)}`,
        `project index: ${path.relative(result.targetRoot, result.projectIndexPath)}`
      ]);

      return 0;
    } catch (decisionError) {
      const message = decisionError instanceof Error ? decisionError.message : String(decisionError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "list") {
    if (subcommandArgs.length > 0) {
      error(`Unknown decisions list argument(s): ${subcommandArgs.join(", ")}`);
      printDecisionsHelp();
      return 1;
    }

    try {
      const result = listDecisions(process.cwd());
      const warningLines =
        result.warnings.length > 0
          ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
          : [];

      if (result.decisions.length === 0) {
        lines([
          "codex-harness decisions list",
          `target root: ${result.targetRoot}`,
          "No decisions found.",
          ...warningLines
        ]);
        return 0;
      }

      lines([
        "codex-harness decisions list",
        `target root: ${result.targetRoot}`,
        ...result.decisions.map(
          (decision) =>
            `- ${decision.decision_id} | ${decision.status} | ${decision.title} | ${decision.date} | related_tasks=${decision.related_task_ids.join(",") || "(none)"}`
        ),
        ...warningLines
      ]);

      return 0;
    } catch (decisionError) {
      const message = decisionError instanceof Error ? decisionError.message : String(decisionError);
      error(message);
      return 1;
    }
  }

  error(`Unknown decisions subcommand: ${subcommand}`);
  printDecisionsHelp();
  return 1;
}
