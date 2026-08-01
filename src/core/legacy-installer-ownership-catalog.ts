import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalJson, sha256Hex } from "./evidence-types";
import { type InstallerOwnershipEntry } from "./installer-ownership";

export type InstallerCatalogSourceKind =
  | "released_package"
  | "committed_historical_installer_manifest"
  | "committed_historical_source";

export interface InstallerOwnershipCatalogProvenanceV1 {
  kind: InstallerCatalogSourceKind;
  source_id: string;
  source_content_hash: `sha256:${string}`;
  manifest_path: string;
  manifest_content_hash: `sha256:${string}`;
  review_authority_ref: string;
}

export interface InstallerOwnershipCatalogEntryV1 {
  entry_id: `sha256:${string}`;
  provenance: InstallerOwnershipCatalogProvenanceV1;
  inventory: InstallerOwnershipEntry[];
}

export interface InstallerOwnershipCatalogV1 {
  schema_version: "phase-23.9.installer-ownership-catalog.v1";
  record_kind: "installer_ownership_catalog";
  catalog_id: `sha256:${string}`;
  manifest_entries: InstallerOwnershipCatalogEntryV1[];
}

export function buildInstallerOwnershipCatalogEntry(
  input: Omit<InstallerOwnershipCatalogEntryV1, "entry_id">
): InstallerOwnershipCatalogEntryV1 {
  const provenance = input.provenance;
  if (!["released_package", "committed_historical_installer_manifest", "committed_historical_source"]
    .includes(provenance.kind)
    || !provenance.source_id.trim() || !provenance.manifest_path.trim()
    || !provenance.review_authority_ref.trim()
    || !/^sha256:[a-f0-9]{64}$/u.test(provenance.source_content_hash)
    || !/^sha256:[a-f0-9]{64}$/u.test(provenance.manifest_content_hash)) {
    throw new Error("installer_catalog_invalid_provenance");
  }
  const normalized = {
    provenance,
    inventory: [...input.inventory].sort((a, b) => a.path.localeCompare(b.path))
  };
  return { entry_id: `sha256:${sha256Hex(canonicalJson(normalized))}`, ...normalized };
}

export function buildInstallerOwnershipCatalog(
  entries: InstallerOwnershipCatalogEntryV1[]
): InstallerOwnershipCatalogV1 {
  const manifestEntries = [...entries].sort((a, b) => a.entry_id.localeCompare(b.entry_id));
  if (new Set(manifestEntries.map((entry) => entry.entry_id)).size !== manifestEntries.length) {
    throw new Error("installer_catalog_identity_conflict");
  }
  const identity = {
    schema_version: "phase-23.9.installer-ownership-catalog.v1" as const,
    record_kind: "installer_ownership_catalog" as const,
    manifest_entries: manifestEntries
  };
  return {
    ...identity,
    catalog_id: `sha256:${sha256Hex(canonicalJson(identity))}`
  };
}

export function parseInstallerOwnershipCatalog(raw: string): InstallerOwnershipCatalogV1 {
  const parsed = JSON.parse(raw) as InstallerOwnershipCatalogV1;
  if (parsed.schema_version !== "phase-23.9.installer-ownership-catalog.v1"
    || parsed.record_kind !== "installer_ownership_catalog"
    || !Array.isArray(parsed.manifest_entries)) {
    throw new Error("installer_catalog_invalid");
  }
  const rebuiltEntries = parsed.manifest_entries.map((entry) => buildInstallerOwnershipCatalogEntry({
    provenance: entry.provenance,
    inventory: entry.inventory
  }));
  const rebuilt = buildInstallerOwnershipCatalog(rebuiltEntries);
  if (canonicalJson(parsed) !== canonicalJson(rebuilt)) throw new Error("installer_catalog_identity_conflict");
  return parsed;
}

export function readInstallerOwnershipCatalog(filePath: string): InstallerOwnershipCatalogV1 {
  return parseInstallerOwnershipCatalog(fs.readFileSync(filePath, "utf8"));
}

export function writeInstallerOwnershipCatalog(
  filePath: string,
  catalog: InstallerOwnershipCatalogV1
): void {
  const bytes = `${JSON.stringify(catalog, null, 2)}\n`;
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(temporary, "wx");
  try {
    fs.writeFileSync(descriptor, bytes, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, filePath);
  const parent = fs.openSync(path.dirname(filePath), "r");
  try {
    fs.fsyncSync(parent);
  } finally {
    fs.closeSync(parent);
  }
  if (canonicalJson(readInstallerOwnershipCatalog(filePath)) !== canonicalJson(catalog)) {
    throw new Error("installer_catalog_readback_failed");
  }
}
