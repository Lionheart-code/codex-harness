import * as fs from "node:fs";
import * as path from "node:path";

export interface ProductRepositoryIdentity {
  schema_version: 1;
  is_product_repository: boolean;
  root_path: string;
  matched_markers: string[];
}

const REQUIRED_MARKERS = [
  "src/core/install.ts",
  "src/core/runtime.ts",
  "schemas/install.schema.json",
  "skills/self-hosting/procedure-registry.json"
] as const;

export function detectProductRepositoryIdentity(rootPath: string): ProductRepositoryIdentity {
  const canonicalRoot = fs.realpathSync.native(rootPath);
  const matched = REQUIRED_MARKERS.filter((relativePath) =>
    fs.existsSync(path.join(canonicalRoot, relativePath)));
  return {
    schema_version: 1,
    is_product_repository: matched.length === REQUIRED_MARKERS.length,
    root_path: canonicalRoot,
    matched_markers: [...matched]
  };
}

export function assertNotProductRepository(rootPath: string): void {
  const identity = detectProductRepositoryIdentity(rootPath);
  if (identity.is_product_repository) {
    throw new Error(
      "product_repository_install_forbidden: install and upgrade cannot target the codex-harness product repository."
    );
  }
}
