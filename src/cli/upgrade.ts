import { error, lines } from "../core/logger";
import { upgradeHarness } from "../core/upgrade";

function printUpgradeHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch upgrade --help",
    "  node bin/ch upgrade --dry-run",
    "  node bin/ch upgrade"
  ]);
}

export async function runUpgrade(args: string[]): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h" || args[0] === "help")) {
    printUpgradeHelp();
    return 0;
  }

  const hasDryRun = args.includes("--dry-run");
  const unknownArgs = args.filter((arg) => arg !== "--dry-run");

  if (unknownArgs.length > 0) {
    error(`Unknown upgrade argument(s): ${unknownArgs.join(", ")}`);
    printUpgradeHelp();
    return 1;
  }

  try {
    const result = upgradeHarness(process.cwd(), hasDryRun);
    const modeLabel = hasDryRun ? "dry-run" : "apply";
    const output = [
      `codex-harness upgrade (${modeLabel})`,
      `target root: ${result.targetRoot}`,
      "install metadata:",
      `- harness_version: ${result.metadata.harness_version}`,
      `- templates_version: ${result.metadata.templates_version}`,
      `- installed_at: ${result.metadata.installed_at}`,
      `- source: ${result.metadata.source}`
    ];

    if (!result.ok) {
      output.push("status: blocked");
      output.push("blocked:");
      output.push(...(result.blocked.length > 0 ? result.blocked : ["- none"]).map((item) =>
        item.startsWith("- ") ? item : `- ${item}`
      ));
      output.push("created:");
      output.push(...(result.created.length > 0 ? result.created : ["- none"]).map((item) =>
        item.startsWith("- ") ? item : `- ${item}`
      ));
      output.push("updated:");
      output.push(...(result.updated.length > 0 ? result.updated : ["- none"]).map((item) =>
        item.startsWith("- ") ? item : `- ${item}`
      ));
      output.push("backups:");
      output.push(...(result.backups.length > 0 ? result.backups : ["- none"]).map((item) =>
        item.startsWith("- ") ? item : `- ${item}`
      ));
      lines(output);
      return 1;
    }

    if (result.created.length === 0 && result.updated.length === 0) {
      output.push("status: already up to date");
    } else if (hasDryRun) {
      output.push("status: no files were written");
    } else {
      output.push("status: upgrade completed");
    }

    output.push("created:");
    output.push(...(result.created.length > 0 ? result.created : ["- none"]).map((item) =>
      item.startsWith("- ") ? item : `- ${item}`
    ));
    output.push("updated:");
    output.push(...(result.updated.length > 0 ? result.updated : ["- none"]).map((item) =>
      item.startsWith("- ") ? item : `- ${item}`
    ));
    output.push("unchanged:");
    output.push(...(result.unchanged.length > 0 ? result.unchanged : ["- none"]).map((item) =>
      item.startsWith("- ") ? item : `- ${item}`
    ));
    output.push("blocked:");
    output.push(...(result.blocked.length > 0 ? result.blocked : ["- none"]).map((item) =>
      item.startsWith("- ") ? item : `- ${item}`
    ));
    output.push("backups:");
    output.push(...(result.backups.length > 0 ? result.backups : ["- none"]).map((item) =>
      item.startsWith("- ") ? item : `- ${item}`
    ));
    output.push(`registry action: ${result.registryAction}`);

    if (result.warnings.length > 0) {
      output.push("warnings:");
      output.push(...result.warnings.map((warning) => `- ${warning}`));
    }

    lines(output);
    return 0;
  } catch (upgradeError) {
    const message = upgradeError instanceof Error ? upgradeError.message : String(upgradeError);
    error(message);
    return 1;
  }
}
