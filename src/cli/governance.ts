import * as path from "node:path";
import {
  createGovernanceProposal,
  createGovernanceReview,
  getGovernanceStatus,
  isGovernanceReviewMode,
  writeGovernanceMetrics
} from "../core/governance";
import { error, lines } from "../core/logger";

interface GovernanceReviewArgs {
  mode: "daily" | "weekly" | "release";
  error?: string;
}

interface GovernanceProposalArgs {
  title: string;
  research: string[];
  error?: string;
}

function printGovernanceHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch governance --help",
    "  node bin/ch governance review",
    "  node bin/ch governance review --mode <daily|weekly|release>",
    "  node bin/ch governance proposal --title <title>",
    "  node bin/ch governance proposal --title <title> --research <path>",
    "  node bin/ch governance metrics",
    "  node bin/ch governance status"
  ]);
}

function parseReviewArgs(args: string[]): GovernanceReviewArgs {
  if (args.length === 0) {
    return { mode: "daily" };
  }

  if (args.length === 2 && args[0] === "--mode" && isGovernanceReviewMode(args[1])) {
    return { mode: args[1] };
  }

  return { mode: "daily", error: `Unknown governance review argument(s): ${args.join(", ")}` };
}

function parseProposalArgs(args: string[]): GovernanceProposalArgs {
  const result: GovernanceProposalArgs = {
    title: "",
    research: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    if ((current === "--title" || current === "--research") && (!next || next.startsWith("--"))) {
      return {
        title: "",
        research: [],
        error: `The \`${current}\` flag requires a value.`
      };
    }

    switch (current) {
      case "--title":
        result.title = next;
        index += 1;
        break;
      case "--research":
        result.research.push(next);
        index += 1;
        break;
      default:
        return {
          title: "",
          research: [],
          error: `Unknown governance proposal argument(s): ${args.join(", ")}`
        };
    }
  }

  if (result.title.trim().length === 0) {
    return {
      title: "",
      research: [],
      error: "Governance proposal requires `--title <title>`."
    };
  }

  return result;
}

export async function runGovernance(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printGovernanceHelp();
    return 0;
  }

  if (subcommand === "review") {
    const parsed = parseReviewArgs(subcommandArgs);

    if (parsed.error) {
      error(parsed.error);
      printGovernanceHelp();
      return 1;
    }

    try {
      const result = createGovernanceReview(process.cwd(), parsed.mode);

      lines([
        "codex-harness governance review",
        `target root: ${result.targetRoot}`,
        `governance root: ${path.relative(result.targetRoot, result.governanceRoot)}`,
        `mode: ${result.mode}`,
        `review path: ${path.relative(result.targetRoot, result.reviewPath)}`,
        `status: ${result.created ? "review created" : "review updated"}`
      ]);

      return 0;
    } catch (governanceError) {
      const message = governanceError instanceof Error ? governanceError.message : String(governanceError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "proposal") {
    const parsed = parseProposalArgs(subcommandArgs);

    if (parsed.error) {
      error(parsed.error);
      printGovernanceHelp();
      return 1;
    }

    try {
      const result = createGovernanceProposal(process.cwd(), parsed.title, parsed.research);

      lines([
        "codex-harness governance proposal",
        `target root: ${result.targetRoot}`,
        `governance root: ${path.relative(result.targetRoot, result.governanceRoot)}`,
        `proposal id: ${result.proposalId}`,
        `proposal path: ${path.relative(result.targetRoot, result.proposalPath)}`,
        "research inputs:",
        ...(result.researchInputs.length > 0 ? result.researchInputs.map((item) => `- ${item}`) : ["- none"])
      ]);

      return 0;
    } catch (governanceError) {
      const message = governanceError instanceof Error ? governanceError.message : String(governanceError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "metrics") {
    if (subcommandArgs.length > 0) {
      error(`Unknown governance metrics argument(s): ${subcommandArgs.join(", ")}`);
      printGovernanceHelp();
      return 1;
    }

    try {
      const result = writeGovernanceMetrics(process.cwd());

      lines([
        "codex-harness governance metrics",
        `target root: ${result.targetRoot}`,
        `governance root: ${path.relative(result.targetRoot, result.governanceRoot)}`,
        `metrics path: ${path.relative(result.targetRoot, result.metricsPath)}`,
        `reviews: ${result.metrics.governance.reviews}`,
        `proposals: ${result.metrics.governance.proposals}`,
        `task artifacts: tasks=${result.metrics.task_artifacts.tasks} | verifiers=${result.metrics.task_artifacts.verifier_records} | reviews=${result.metrics.task_artifacts.review_records} | reports=${result.metrics.task_artifacts.reports} | prompts=${result.metrics.task_artifacts.prompt_files}`,
        `debt: open=${result.metrics.memory.debt.open} | in_progress=${result.metrics.memory.debt.in_progress} | resolved=${result.metrics.memory.debt.resolved} | accepted=${result.metrics.memory.debt.accepted} | obsolete=${result.metrics.memory.debt.obsolete}`,
        `decisions: active=${result.metrics.memory.decisions.active} | superseded=${result.metrics.memory.decisions.superseded} | rejected=${result.metrics.memory.decisions.rejected}`,
        `agent outputs: raw=${result.metrics.memory.agent_outputs.raw} | accepted=${result.metrics.memory.agent_outputs.accepted} | stale=${result.metrics.memory.agent_outputs.stale} | rejected=${result.metrics.memory.agent_outputs.rejected}`
      ]);

      return 0;
    } catch (governanceError) {
      const message = governanceError instanceof Error ? governanceError.message : String(governanceError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "status") {
    if (subcommandArgs.length > 0) {
      error(`Unknown governance status argument(s): ${subcommandArgs.join(", ")}`);
      printGovernanceHelp();
      return 1;
    }

    try {
      const result = getGovernanceStatus(process.cwd());
      const changelogRelative = path.relative(result.targetRoot, result.changelogPath);

      lines([
        "codex-harness governance status",
        `target root: ${result.targetRoot}`,
        `governance root: ${path.relative(result.targetRoot, result.governanceRoot)}`,
        `installed harness version: ${result.harnessVersion}`,
        `governance scaffold: ${result.scaffoldPresent ? "present" : "absent"}`,
        `reviews: ${result.reviewCount}`,
        `proposals: ${result.proposalCount}`,
        `latest review: ${result.latestReviewPath || "(none)"}`,
        `latest proposal: ${result.latestProposalPath || "(none)"}`,
        `changelog: ${result.scaffoldPresent ? changelogRelative : GOVERNANCE_CHANGELOG_FALLBACK}`,
        `task artifacts: tasks=${result.taskArtifacts.tasks} | verifiers=${result.taskArtifacts.verifier_records} | reviews=${result.taskArtifacts.review_records} | reports=${result.taskArtifacts.reports} | prompts=${result.taskArtifacts.prompt_files}`,
        `debt: open=${result.debtCounts.open} | in_progress=${result.debtCounts.in_progress} | resolved=${result.debtCounts.resolved} | accepted=${result.debtCounts.accepted} | obsolete=${result.debtCounts.obsolete}`,
        `decisions: active=${result.decisionCounts.active} | superseded=${result.decisionCounts.superseded} | rejected=${result.decisionCounts.rejected}`,
        `agent outputs: raw=${result.agentCounts.raw} | accepted=${result.agentCounts.accepted} | stale=${result.agentCounts.stale} | rejected=${result.agentCounts.rejected}`,
        ...(result.warnings.length > 0 ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)] : [])
      ]);

      return 0;
    } catch (governanceError) {
      const message = governanceError instanceof Error ? governanceError.message : String(governanceError);
      error(message);
      return 1;
    }
  }

  error(`Unknown governance subcommand: ${subcommand}`);
  printGovernanceHelp();
  return 1;
}

const GOVERNANCE_CHANGELOG_FALLBACK = ".harness/governance/changelog.md";
