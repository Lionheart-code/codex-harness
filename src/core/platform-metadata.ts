import * as path from "node:path";

export function isIgnoredPlatformMetadata(targetPath: string): boolean {
  return path.basename(targetPath) === ".DS_Store";
}
