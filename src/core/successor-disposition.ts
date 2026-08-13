import { canonicalJson, sha256Hex } from "./evidence-types";

export type SuccessorDisposition =
  | {
      schema_version: 2;
      record_kind: "successor_disposition";
      record_id: `sha256:${string}`;
      source_run_instance_id: string;
      disposition: "selected_successor";
      next_task_decision_id: `sha256:${string}`;
      next_task: {
        task_path: string;
        base_commit_sha: string;
        decision_source_artifact_identity: `sha256:${string}`;
        task_contract_identity: `sha256:${string}`;
      };
      no_successor: null;
    }
  | {
      schema_version: 2;
      record_kind: "successor_disposition";
      record_id: `sha256:${string}`;
      source_run_instance_id: string;
      disposition: "no_successor";
      next_task_decision_id: null;
      next_task: null;
      no_successor: {
        reason: string;
        decision_owner_id: string;
        decision_approval_id: string;
        no_successor_decision_id: `sha256:${string}`;
      };
    };

export function buildSuccessorDisposition(
  input: Omit<SuccessorDisposition, "schema_version" | "record_kind" | "record_id">
): SuccessorDisposition {
  if (!input.source_run_instance_id.trim()) throw new Error("successor_disposition_missing_run_instance");
  const identity = { schema_version: 2, record_kind: "successor_disposition", ...input };
  return {
    ...identity,
    record_id: `sha256:${sha256Hex(canonicalJson(identity))}`
  } as SuccessorDisposition;
}

export function assertCompatibleSuccessorDisposition(
  existing: SuccessorDisposition | undefined,
  proposed: SuccessorDisposition
): void {
  if (existing && canonicalJson(existing) !== canonicalJson(proposed)) {
    throw new Error("successor_disposition_conflict");
  }
}
