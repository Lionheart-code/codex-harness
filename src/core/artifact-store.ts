import * as fs from "node:fs";
import * as path from "node:path";
import {
  SHA256_ARTIFACTS_DIR
} from "./paths";
import {
  type ArtifactEvidenceRef,
  type EvidenceSensitivity,
  type RedactionStatus,
  sha256Hex,
  toPortablePath
} from "./evidence-types";

export interface ArtifactStoreWriteInput {
  content: string | Buffer;
  kind: string;
  mediaType?: string;
  producerCommand?: string;
  sensitivity?: EvidenceSensitivity;
  redactionStatus?: RedactionStatus;
  exportable?: boolean;
}

export interface ArtifactIntegrityResult {
  ok: boolean;
  reason?: string;
}

function artifactPathForHash(targetRoot: string, hash: string): string {
  return path.join(targetRoot, SHA256_ARTIFACTS_DIR, hash.slice(0, 2), hash);
}

function toArtifactRefPath(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath));
}

export class ArtifactStore {
  readonly targetRoot: string;
  readonly artifactRoot: string;

  constructor(targetRoot: string) {
    this.targetRoot = targetRoot;
    this.artifactRoot = path.join(targetRoot, SHA256_ARTIFACTS_DIR);
  }

  write(input: ArtifactStoreWriteInput): ArtifactEvidenceRef {
    const buffer = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
    const hash = sha256Hex(buffer);
    const absolutePath = artifactPathForHash(this.targetRoot, hash);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, buffer);
    } else {
      const existingHash = sha256Hex(fs.readFileSync(absolutePath));
      if (existingHash !== hash) {
        throw new Error(`Artifact hash collision or corruption detected for ${toArtifactRefPath(this.targetRoot, absolutePath)}.`);
      }
    }

    return {
      artifact_id: `sha256:${hash}`,
      sha256: hash,
      path: toArtifactRefPath(this.targetRoot, absolutePath),
      kind: input.kind,
      media_type: input.mediaType ?? "text/plain",
      size_bytes: buffer.byteLength,
      ...(input.producerCommand ? { producer_command: input.producerCommand } : {}),
      sensitivity: input.sensitivity ?? "local",
      redaction_status: input.redactionStatus ?? "not_applicable",
      exportable: input.exportable ?? false
    };
  }

  verify(ref: ArtifactEvidenceRef): ArtifactIntegrityResult {
    const absolutePath = path.resolve(this.targetRoot, ref.path);
    const relative = path.relative(this.targetRoot, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return {
        ok: false,
        reason: `artifact path resolves outside target root: ${ref.path}`
      };
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return {
        ok: false,
        reason: `artifact is missing: ${ref.path}`
      };
    }

    const content = fs.readFileSync(absolutePath);
    const actualHash = sha256Hex(content);

    if (actualHash !== ref.sha256) {
      return {
        ok: false,
        reason: `artifact hash mismatch: ${ref.path}`
      };
    }

    if (content.byteLength !== ref.size_bytes) {
      return {
        ok: false,
        reason: `artifact size mismatch: ${ref.path}`
      };
    }

    return { ok: true };
  }
}

export function getArtifactStore(targetRoot: string): ArtifactStore {
  return new ArtifactStore(targetRoot);
}
