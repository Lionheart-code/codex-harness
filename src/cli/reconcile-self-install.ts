import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalJson, sha256Hex } from "../core/evidence-types";
import { parseInstallerOwnershipManifest } from "../core/installer-ownership";
import {
  buildInstallerOwnershipCatalog,
  buildInstallerOwnershipCatalogEntry,
  readInstallerOwnershipCatalog,
  writeInstallerOwnershipCatalog,
  type InstallerCatalogSourceKind
} from "../core/legacy-installer-ownership-catalog";
import { error, lines } from "../core/logger";
import {
  applySelfInstallReconciliation,
  prepareSelfInstallReconciliation,
  readSelfInstallReconciliation,
  rollbackSelfInstallReconciliation
} from "../core/product-self-install-reconciliation";

export async function runReconcileSelfInstall(args: string[]): Promise<number> {
  try {
    const command = args[0];
    const dryRun = args.includes("--dry-run");
    if (command === "journal") {
      const result = prepareSelfInstallReconciliation(process.cwd(), dryRun);
      lines([
        "codex-harness reconcile-self-install journal",
        `journal_id: ${result.journal_id}`,
        `state: ${result.state}`,
        `inventory_hash: ${result.inventory_hash}`,
        `dry-run: ${dryRun}`
      ]);
      return 0;
    }
    if (command === "apply" || command === "resume") {
      const journalIndex = args.indexOf("--journal");
      if (journalIndex < 0 || !args[journalIndex + 1]) throw new Error("--journal <sha256:id> is required");
      if (dryRun) {
        const current = readSelfInstallReconciliation(process.cwd(), args[journalIndex + 1]);
        lines([`journal_id: ${current.journal_id}`, `state: ${current.state}`, "dry-run: true"]);
        return 0;
      }
      const result = applySelfInstallReconciliation(
        readSelfInstallReconciliation(process.cwd(), args[journalIndex + 1])
      );
      lines([`journal_id: ${result.journal_id}`, `state: ${result.state}`]);
      return 0;
    }
    if (command === "rollback") {
      const journalIndex = args.indexOf("--journal");
      if (journalIndex < 0 || !args[journalIndex + 1]) throw new Error("--journal <sha256:id> is required");
      const current = readSelfInstallReconciliation(process.cwd(), args[journalIndex + 1]);
      if (dryRun) {
        lines([`journal_id: ${current.journal_id}`, `state: ${current.state}`, "dry-run: true"]);
        return 0;
      }
      const result = rollbackSelfInstallReconciliation(current);
      lines([`journal_id: ${result.journal_id}`, `state: ${result.state}`]);
      return 0;
    }
    if (command === "catalog-build") {
      const value = (name: string): string => {
        const index = args.indexOf(`--${name}`);
        if (index < 0 || !args[index + 1]) throw new Error(`--${name} is required`);
        return args[index + 1];
      };
      const sourceKind = value("source-kind");
      if (!["released_package", "committed_historical_installer_manifest", "committed_historical_source"].includes(sourceKind)) {
        throw new Error("--source-kind is invalid");
      }
      const source = value("source");
      const manifestPath = value("manifest");
      const outputPath = path.resolve(value("output"));
      const expectedOutput = path.resolve("assets/installer-ownership-catalog.v1.json");
      if (outputPath !== expectedOutput) throw new Error("installer_catalog_output_path_invalid");
      const status = await import("../core/git").then(({ runGitCommand }) =>
        runGitCommand(process.cwd(), ["status", "--porcelain=v1", "--untracked-files=all"]));
      const branch = await import("../core/git").then(({ runGitCommand }) =>
        runGitCommand(process.cwd(), ["symbolic-ref", "--short", "HEAD"]));
      if (status.status !== 0 || status.stdout.trim() || branch.status !== 0 || !branch.stdout.trim()) {
        throw new Error("installer_catalog_source_worktree_not_clean_named_branch");
      }
      let manifestBytes: Buffer;
      let sourceBytes: Buffer;
      if (sourceKind === "released_package") {
        const sourcePath = path.resolve(source);
        if (sourcePath.startsWith(path.resolve(".harness") + path.sep)) {
          throw new Error("installer_catalog_target_derived_source_forbidden");
        }
        sourceBytes = fs.readFileSync(sourcePath);
        const resolvedManifest = fs.statSync(sourcePath).isDirectory()
          ? path.join(sourcePath, manifestPath)
          : sourcePath;
        manifestBytes = fs.readFileSync(resolvedManifest);
      } else {
        const { runGitCommand } = await import("../core/git");
        const object = runGitCommand(process.cwd(), ["show", `${source}:${manifestPath}`]);
        if (object.status !== 0) throw new Error("installer_catalog_git_object_unavailable");
        manifestBytes = Buffer.from(object.stdout, "utf8");
        const tree = runGitCommand(process.cwd(), ["rev-parse", `${source}^{tree}`]);
        if (tree.status !== 0) throw new Error("installer_catalog_git_source_unavailable");
        sourceBytes = Buffer.from(tree.stdout.trim(), "utf8");
      }
      const manifest = parseInstallerOwnershipManifest(manifestBytes.toString("utf8"));
      const entry = buildInstallerOwnershipCatalogEntry({
        provenance: {
          kind: sourceKind as InstallerCatalogSourceKind,
          source_id: source,
          source_content_hash: `sha256:${sha256Hex(sourceBytes)}`,
          manifest_path: manifestPath,
          manifest_content_hash: `sha256:${sha256Hex(manifestBytes)}`,
          review_authority_ref: value("review-authority-ref")
        },
        inventory: manifest.entries
      });
      const catalog = readInstallerOwnershipCatalog(outputPath);
      const existing = catalog.manifest_entries.find((candidate) => candidate.entry_id === entry.entry_id);
      if (existing && canonicalJson(existing) !== canonicalJson(entry)) {
        throw new Error("installer_catalog_identity_conflict");
      }
      const next = buildInstallerOwnershipCatalog([
        ...catalog.manifest_entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
        entry
      ]);
      lines([
        `entry_id: ${entry.entry_id}`,
        `catalog_id: ${next.catalog_id}`,
        `source_content_hash: ${entry.provenance.source_content_hash}`,
        `dry-run: ${dryRun}`
      ]);
      if (!dryRun && !existing) {
        writeInstallerOwnershipCatalog(outputPath, next);
      }
      return 0;
    }
    throw new Error("Usage: node bin/ch reconcile-self-install catalog-build|journal|apply|resume|rollback ...");
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}
