import * as fs from "node:fs";
import * as path from "node:path";
import {
  GOVERNANCE_CHANGELOG_PATH,
  GOVERNANCE_DIR,
  GOVERNANCE_METRICS_DIR,
  GOVERNANCE_PROPOSALS_DIR,
  GOVERNANCE_REVIEWS_DIR
} from "./paths";

export interface GovernanceSeedFilePlan {
  relativePath: string;
  absolutePath: string;
  content: string;
}

function buildInitialGovernanceChangelog(): string {
  return [
    "# Harness Governance Changelog",
    "",
    "Track accepted or reverted harness-governance decisions here.",
    "",
    "- No governance changes recorded yet.",
    ""
  ].join("\n");
}

export function getGovernanceDirectoryPaths(targetRoot: string): string[] {
  return [
    path.join(targetRoot, GOVERNANCE_DIR),
    path.join(targetRoot, GOVERNANCE_REVIEWS_DIR),
    path.join(targetRoot, GOVERNANCE_PROPOSALS_DIR),
    path.join(targetRoot, GOVERNANCE_METRICS_DIR)
  ];
}

export function getGovernanceSeedFilePlans(targetRoot: string): GovernanceSeedFilePlan[] {
  return [
    {
      relativePath: GOVERNANCE_CHANGELOG_PATH,
      absolutePath: path.join(targetRoot, GOVERNANCE_CHANGELOG_PATH),
      content: buildInitialGovernanceChangelog()
    }
  ];
}

export function ensureGovernanceScaffold(targetRoot: string): void {
  for (const directoryPath of getGovernanceDirectoryPaths(targetRoot)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  for (const seedFile of getGovernanceSeedFilePlans(targetRoot)) {
    if (!fs.existsSync(seedFile.absolutePath)) {
      fs.writeFileSync(seedFile.absolutePath, seedFile.content, "utf8");
    }
  }
}
