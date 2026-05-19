import { error, lines } from "../core/logger";
import { migrateSchemas, validateSchemas } from "../core/schema";

function printSchemaHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch schema --help",
    "  node bin/ch schema validate",
    "  node bin/ch schema migrate --dry-run",
    "  node bin/ch schema migrate"
  ]);
}

export async function runSchema(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printSchemaHelp();
    return 0;
  }

  if (subcommand === "validate") {
    if (subcommandArgs.length > 0) {
      error(`Unknown schema validate argument(s): ${subcommandArgs.join(", ")}`);
      printSchemaHelp();
      return 1;
    }

    try {
      const result = validateSchemas(process.cwd());
      const output = [
        "codex-harness schema validate",
        `target root: ${result.targetRoot}`,
        `checked: ${result.checked}`,
        `valid: ${result.valid}`,
        `legacy: ${result.legacy.length}`,
        `errors: ${result.errors.length}`
      ];

      if (result.legacy.length > 0) {
        output.push("legacy artifacts:");
        output.push(...result.legacy.map((issue) => `- ${issue.relativePath}: ${issue.message}`));
      }

      if (result.errors.length > 0) {
        output.push("errors:");
        output.push(...result.errors.map((issue) => `- ${issue.relativePath}: ${issue.message}`));
      }

      if (result.legacy.length === 0 && result.errors.length === 0) {
        output.push("status: all schema-governed artifacts are valid");
        lines(output);
        return 0;
      }

      output.push("status: migration or manual fixes are required");
      lines(output);
      return 1;
    } catch (schemaError) {
      const message = schemaError instanceof Error ? schemaError.message : String(schemaError);
      error(message);
      return 1;
    }
  }

  if (subcommand === "migrate") {
    const hasDryRun = subcommandArgs.includes("--dry-run");
    const unknownArgs = subcommandArgs.filter((arg) => arg !== "--dry-run");

    if (unknownArgs.length > 0) {
      error(`Unknown schema migrate argument(s): ${unknownArgs.join(", ")}`);
      printSchemaHelp();
      return 1;
    }

    try {
      const result = migrateSchemas(process.cwd(), hasDryRun);
      const modeLabel = hasDryRun ? "dry-run" : "apply";
      const output = [
        `codex-harness schema migrate (${modeLabel})`,
        `target root: ${result.targetRoot}`,
        `migration id: ${result.migrationId}`
      ];

      if (!result.ok) {
        output.push("status: blocked");
        output.push("blocked:");
        output.push(...(result.blocked.length > 0 ? result.blocked : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
        output.push("created:");
        output.push(...(result.created.length > 0 ? result.created : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
        output.push("updated:");
        output.push(...(result.updated.length > 0 ? result.updated : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
        output.push("backups:");
        output.push(...(result.backups.length > 0 ? result.backups : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
        lines(output);
        return 1;
      }

      if (result.created.length === 0 && result.updated.length === 0) {
        output.push("status: already up to date");
      } else if (hasDryRun) {
        output.push("status: no files were written");
      } else {
        output.push("status: migration completed");
      }

      output.push("created:");
      output.push(...(result.created.length > 0 ? result.created : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
      output.push("updated:");
      output.push(...(result.updated.length > 0 ? result.updated : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
      output.push("unchanged:");
      output.push(...(result.unchanged.length > 0 ? result.unchanged : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
      output.push("backups:");
      output.push(...(result.backups.length > 0 ? result.backups : ["- none"]).map((item) => (item.startsWith("- ") ? item : `- ${item}`)));
      lines(output);
      return 0;
    } catch (schemaError) {
      const message = schemaError instanceof Error ? schemaError.message : String(schemaError);
      error(message);
      return 1;
    }
  }

  error(`Unknown schema subcommand: ${subcommand}`);
  printSchemaHelp();
  return 1;
}
