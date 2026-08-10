import { canonicalJson, sha256Hex } from "./evidence-types";

export type InstallerDisposition =
  | "remove"
  | "preserve_as_runtime"
  | "quarantine"
  | "ambiguous_stop";

export interface InstallerOwnershipEntry {
  path: string;
  content_hash: `sha256:${string}`;
  disposition: InstallerDisposition;
  owner: "installer" | "runtime" | "user" | "ambiguous";
}

export interface InstallerOwnershipManifestV1 {
  schema_version: 1;
  record_kind: "installer_ownership_manifest";
  product_root: string;
  entries: InstallerOwnershipEntry[];
  manifest_id: `sha256:${string}`;
}

export function buildInstallerOwnershipManifest(
  productRoot: string,
  entries: InstallerOwnershipEntry[]
): InstallerOwnershipManifestV1 {
  const normalized = [...entries]
    .map((entry) => ({ ...entry, path: entry.path.replace(/\\/g, "/") }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) {
    throw new Error("installer_ownership_duplicate_path");
  }
  for (const entry of normalized) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(entry.content_hash)) {
      throw new Error(`installer_ownership_invalid_hash:${entry.path}`);
    }
    if (entry.owner === "ambiguous" && entry.disposition !== "ambiguous_stop") {
      throw new Error(`installer_ownership_ambiguous_must_stop:${entry.path}`);
    }
  }
  const identity = {
    schema_version: 1 as const,
    record_kind: "installer_ownership_manifest" as const,
    product_root: productRoot,
    entries: normalized
  };
  return {
    ...identity,
    manifest_id: `sha256:${sha256Hex(canonicalJson(identity))}`
  };
}

export function parseInstallerOwnershipManifest(raw: string): InstallerOwnershipManifestV1 {
  const parsed = JSON.parse(raw) as InstallerOwnershipManifestV1;
  if (parsed.schema_version !== 1 || parsed.record_kind !== "installer_ownership_manifest"
    || typeof parsed.product_root !== "string" || !Array.isArray(parsed.entries)) {
    throw new Error("installer_ownership_manifest_invalid");
  }
  const rebuilt = buildInstallerOwnershipManifest(parsed.product_root, parsed.entries);
  if (canonicalJson(parsed) !== canonicalJson(rebuilt)) {
    throw new Error("installer_ownership_manifest_identity_mismatch");
  }
  return parsed;
}
