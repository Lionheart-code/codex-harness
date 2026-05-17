import { installHarness } from "../core/install";
import { error, lines } from "../core/logger";

export async function runInstall(args: string[]): Promise<number> {
  const hasDryRun = args.includes("--dry-run");
  const unknownArgs = args.filter((arg) => arg !== "--dry-run");

  if (unknownArgs.length > 0) {
    error(`Unknown install argument(s): ${unknownArgs.join(", ")}`);
    return 1;
  }

  try {
    const result = installHarness(process.cwd(), hasDryRun);
    const modeLabel = hasDryRun ? "dry-run" : "apply";
    const output = [
      `codex-harness install (${modeLabel})`,
      `target root: ${result.targetRoot}`,
      "install metadata:",
      `- harness_version: ${result.metadata.harness_version}`,
      `- templates_version: ${result.metadata.templates_version}`,
      `- installed_at: ${result.metadata.installed_at}`,
      `- source: ${result.metadata.source}`,
      `AGENTS.md action: ${result.agentsAction}`
    ];

    if (!result.ok) {
      output.push("conflicts:");
      output.push(...result.conflicts.map((conflict) => `- ${conflict}`));
      lines(output);
      return 1;
    }

    if (result.created.length === 0 && result.updated.length === 0) {
      output.push("status: already up to date");
    } else if (hasDryRun) {
      output.push("status: no files were written");
    } else {
      output.push("status: install completed");
    }

    output.push("created:");
    output.push(...(result.created.length > 0 ? result.created : ["- none"]).map((item) => item.startsWith("- ") ? item : `- ${item}`));
    output.push("updated:");
    output.push(...(result.updated.length > 0 ? result.updated : ["- none"]).map((item) => item.startsWith("- ") ? item : `- ${item}`));
    output.push("unchanged:");
    output.push(...(result.unchanged.length > 0 ? result.unchanged : ["- none"]).map((item) => item.startsWith("- ") ? item : `- ${item}`));
    output.push("backups:");
    output.push(...(result.backups.length > 0 ? result.backups : ["- none"]).map((item) => item.startsWith("- ") ? item : `- ${item}`));

    lines(output);
    return 0;
  } catch (installError) {
    const message = installError instanceof Error ? installError.message : String(installError);
    error(message);
    return 1;
  }
}
