import { error, lines } from "../core/logger";
import { runSecurityDoctor } from "../core/security";

function printSecurityHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch security --help",
    "  node bin/ch security doctor"
  ]);
}

export async function runSecurity(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printSecurityHelp();
    return 0;
  }

  if (subcommand !== "doctor") {
    error(`Unknown security subcommand: ${subcommand}`);
    printSecurityHelp();
    return 1;
  }

  if (subcommandArgs.length > 0) {
    error(`Unknown security doctor argument(s): ${subcommandArgs.join(", ")}`);
    printSecurityHelp();
    return 1;
  }

  try {
    const result = runSecurityDoctor(process.cwd());
    const output = [
      "codex-harness security doctor",
      `cwd: ${result.cwd}`,
      `repository root: ${result.repositoryRoot ?? "(unknown)"}`,
      `repository role: ${result.repositoryRole}`,
      `installed layer: ${result.installedLayer}`,
      "external CLI agents: read_only by current implementation",
      "external capabilities by default: disabled"
    ];

    if (result.repositoryRole === "product") {
      output.push("status: product repository posture only; installed-layer security audit unavailable");
      lines(output);
      return 0;
    }

    output.push(`protected paths source: ${result.protectedPathsSource}`);
    output.push(`protected paths: ${result.protectedPaths.join(", ")}`);
    output.push(`default protected paths: ${result.defaultProtectedPaths.join(", ")}`);
    output.push(`adapter profiles: ${result.adapterProfiles.length}`);

    for (const profile of result.adapterProfiles) {
      output.push(
        `- ${profile.agentId} | transport=${profile.transport} | cwd_policy=${profile.workingDirectoryPolicy} | permission_mode=${profile.permissionMode} | roles=${profile.allowedRoles.join("/")} | output=${profile.outputContract} | timeout_seconds=${profile.timeoutSeconds} | requires_human_confirmation=${profile.requiresHumanConfirmation ? "true" : "false"}`
      );
    }

    lines(output);
    return 0;
  } catch (securityError) {
    const message = securityError instanceof Error ? securityError.message : String(securityError);
    error(message);
    return 1;
  }
}
