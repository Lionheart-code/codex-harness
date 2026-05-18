import * as path from "node:path";
import { addDebt, isDebtSeverity, isDebtType, listDebt, resolveDebt } from "../core/memory";
import { error, lines } from "../core/logger";

interface DebtAddArgs {
  title?: string;
  type?: string;
  severity?: string;
  reason?: string;
  locations: string[];
  impact?: string;
  paydownCondition?: string;
  agentRun?: string;
  unknownFlags: string[];
  positional: string[];
  missingValueFor?: string;
}

function printDebtHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch debt add --title <title> --type <type> --severity <severity> --reason <reason>",
    "  node bin/ch debt add --title <title> --type <type> --severity <severity> --reason <reason> --location <path>",
    "  node bin/ch debt list",
    "  node bin/ch debt resolve --id <DEBT-0001>"
  ]);
}

function parseDebtAddArgs(args: string[]): DebtAddArgs {
  const result: DebtAddArgs = {
    locations: [],
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
      case "--type":
        result.type = next;
        break;
      case "--severity":
        result.severity = next;
        break;
      case "--reason":
        result.reason = next;
        break;
      case "--location":
        result.locations.push(next);
        break;
      case "--impact":
        result.impact = next;
        break;
      case "--paydown-condition":
        result.paydownCondition = next;
        break;
      case "--agent-run":
        result.agentRun = next;
        break;
      default:
        result.unknownFlags.push(current);
        break;
    }

    index += 1;
  }

  return result;
}

function parseResolveArgs(args: string[]): { debtId?: string; errorMessage?: string } {
  if (args.length === 0) {
    return { errorMessage: "The `--id` flag is required." };
  }

  if (args.length !== 2 || args[0] !== "--id") {
    return { errorMessage: `Unknown debt resolve argument(s): ${args.join(", ")}` };
  }

  return {
    debtId: args[1]
  };
}

export async function runDebt(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand) {
    error("A debt subcommand is required.");
    printDebtHelp();
    return 1;
  }

  if (subcommand === "add") {
    const parsed = parseDebtAddArgs(subcommandArgs);

    if (parsed.missingValueFor) {
      error(`The \`${parsed.missingValueFor}\` flag requires a value.`);
      printDebtHelp();
      return 1;
    }

    if (parsed.unknownFlags.length > 0) {
      error(`Unknown debt add flag(s): ${parsed.unknownFlags.join(", ")}`);
      printDebtHelp();
      return 1;
    }

    if (parsed.positional.length > 0) {
      error(`Unknown debt add argument(s): ${parsed.positional.join(", ")}`);
      printDebtHelp();
      return 1;
    }

    if (!parsed.title || !parsed.type || !parsed.severity || !parsed.reason) {
      error("Debt add requires `--title`, `--type`, `--severity`, and `--reason`.");
      printDebtHelp();
      return 1;
    }

    if (!isDebtType(parsed.type)) {
      error(`Unsupported debt type: ${parsed.type}`);
      return 1;
    }

    if (!isDebtSeverity(parsed.severity)) {
      error(`Unsupported debt severity: ${parsed.severity}`);
      return 1;
    }

    try {
      const result = addDebt(process.cwd(), {
        title: parsed.title,
        type: parsed.type,
        severity: parsed.severity,
        reason: parsed.reason,
        locations: parsed.locations,
        impact: parsed.impact,
        paydownCondition: parsed.paydownCondition,
        agentRun: parsed.agentRun
      });

      lines([
        "codex-harness debt add",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `debt id: ${result.debt.debt_id}`,
        `status: ${result.debt.status}`,
        `debt ledger: ${path.relative(result.targetRoot, result.debtLedgerPath)}`,
        `debt markdown: ${path.relative(result.targetRoot, result.debtMarkdownPath)}`,
        `project index: ${path.relative(result.targetRoot, result.projectIndexPath)}`
      ]);

      return 0;
    } catch (debtError) {
      const message = debtError instanceof Error ? debtError.message : String(debtError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "list") {
    if (subcommandArgs.length > 0) {
      error(`Unknown debt list argument(s): ${subcommandArgs.join(", ")}`);
      printDebtHelp();
      return 1;
    }

    try {
      const result = listDebt(process.cwd());
      const warningLines =
        result.warnings.length > 0
          ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
          : [];

      if (result.items.length === 0) {
        lines([
          "codex-harness debt list",
          `target root: ${result.targetRoot}`,
          "No debt items found.",
          ...warningLines
        ]);
        return 0;
      }

      lines([
        "codex-harness debt list",
        `target root: ${result.targetRoot}`,
        ...result.items.map(
          (item) =>
            `- ${item.debt_id} | ${item.status} | ${item.severity} | ${item.type} | ${item.title} | task=${item.created_by_task}`
        ),
        ...warningLines
      ]);

      return 0;
    } catch (debtError) {
      const message = debtError instanceof Error ? debtError.message : String(debtError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "resolve") {
    const parsed = parseResolveArgs(subcommandArgs);

    if (parsed.errorMessage || !parsed.debtId) {
      error(parsed.errorMessage ?? "The `--id` flag is required.");
      printDebtHelp();
      return 1;
    }

    try {
      const result = resolveDebt(process.cwd(), parsed.debtId);

      lines([
        "codex-harness debt resolve",
        `target root: ${result.targetRoot}`,
        `task id: ${result.taskId}`,
        `debt id: ${result.debt.debt_id}`,
        `status: ${result.alreadyResolved ? "already resolved" : "resolved"}`,
        `debt ledger: ${path.relative(result.targetRoot, result.debtLedgerPath)}`
      ]);

      return 0;
    } catch (debtError) {
      const message = debtError instanceof Error ? debtError.message : String(debtError);
      error(message);
      return 1;
    }
  }

  error(`Unknown debt subcommand: ${subcommand}`);
  printDebtHelp();
  return 1;
}
