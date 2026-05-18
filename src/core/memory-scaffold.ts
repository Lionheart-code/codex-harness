import * as path from "node:path";
import { DEBT_JSONL_PATH, DEBT_MARKDOWN_PATH, PROJECT_INDEX_PATH } from "./paths";

export interface MemorySeedFilePlan {
  relativePath: string;
  absolutePath: string;
  content: string;
}

function buildInitialDebtMarkdown(): string {
  return [
    "# Debt Ledger",
    "",
    "Tracked debt items: 0",
    "",
    "## Unresolved",
    "- None recorded.",
    "",
    "## Closed",
    "- None recorded.",
    ""
  ].join("\n");
}

function buildInitialProjectIndex(): string {
  return [
    "# Project Index",
    "",
    "## Main Modules",
    "- Not cataloged in Phase 9.",
    "",
    "## Important Commands",
    "- `node bin/ch memory status`",
    "- `node bin/ch debt list`",
    "- `node bin/ch decisions list`",
    "",
    "## Active Architecture Decisions",
    "- None recorded.",
    "",
    "## Active Debt",
    "- None recorded.",
    "",
    "## Recent Completed Tasks",
    "- None recorded in Phase 9.",
    "",
    "## Open Tasks",
    "- None recorded.",
    "",
    "## Known Risky Areas",
    "- See unresolved debt and active decisions.",
    ""
  ].join("\n");
}

export function getMemorySeedFilePlans(targetRoot: string): MemorySeedFilePlan[] {
  return [
    {
      relativePath: PROJECT_INDEX_PATH,
      absolutePath: path.join(targetRoot, PROJECT_INDEX_PATH),
      content: buildInitialProjectIndex()
    },
    {
      relativePath: DEBT_JSONL_PATH,
      absolutePath: path.join(targetRoot, DEBT_JSONL_PATH),
      content: ""
    },
    {
      relativePath: DEBT_MARKDOWN_PATH,
      absolutePath: path.join(targetRoot, DEBT_MARKDOWN_PATH),
      content: buildInitialDebtMarkdown()
    }
  ];
}
