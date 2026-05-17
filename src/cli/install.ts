import { error, lines } from "../core/logger";
import { getInstallTargetPaths } from "../core/paths";

export async function runInstall(args: string[]): Promise<number> {
  const hasDryRun = args.includes("--dry-run");
  const unknownArgs = args.filter((arg) => arg !== "--dry-run");

  if (unknownArgs.length > 0) {
    error(`Unknown install argument(s): ${unknownArgs.join(", ")}`);
    return 1;
  }

  if (!hasDryRun) {
    error("Phase 1 only supports `ch install --dry-run`.");
    return 1;
  }

  lines([
    "codex-harness install (dry-run)",
    "No files will be created in Phase 1.",
    "Planned Phase 2 targets:",
    ...getInstallTargetPaths().map((target) => `- ${target}`)
  ]);

  return 0;
}
