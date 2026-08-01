import { canonicalJson, sha256Hex } from "./evidence-types";

export interface ProofEligibilityComponentRefV1 {
  component_kind: "procedure_registry" | "execution_policy" | "stage_map" | "predicate_contract";
  path: string;
  content_hash: `sha256:${string}`;
}

export interface ProofEligibilitySnapshotV1 {
  schema_version: "phase-23.9.proof-eligibility-snapshot.v1";
  record_kind: "proof_eligibility_snapshot";
  snapshot_id: `sha256:${string}`;
  run_instance_id: string;
  task_artifact_id: `sha256:${string}`;
  immutable_base: string;
  activation_source_head: string;
  contract_marker: `sha256:${string}`;
  component_refs: ProofEligibilityComponentRefV1[];
  bootstrap_eligibility: "eligible" | "bootstrap_ineligible" | "legacy_gap_unaccepted";
  created_at: string;
}

export function buildProofEligibilitySnapshot(
  input: Omit<ProofEligibilitySnapshotV1, "schema_version" | "record_kind" | "snapshot_id" | "contract_marker">
): ProofEligibilitySnapshotV1 {
  const components = [...input.component_refs].sort((a, b) => a.component_kind.localeCompare(b.component_kind));
  if (components.length !== 4 || new Set(components.map((entry) => entry.component_kind)).size !== 4) {
    throw new Error("proof_eligibility_component_cardinality_invalid");
  }
  const contractMarker = `sha256:${sha256Hex(canonicalJson(components))}` as const;
  const identity = {
    run_instance_id: input.run_instance_id,
    task_artifact_id: input.task_artifact_id,
    immutable_base: input.immutable_base,
    activation_source_head: input.activation_source_head,
    contract_marker: contractMarker
  };
  return {
    schema_version: "phase-23.9.proof-eligibility-snapshot.v1",
    record_kind: "proof_eligibility_snapshot",
    snapshot_id: `sha256:${sha256Hex(canonicalJson(identity))}`,
    ...input,
    contract_marker: contractMarker,
    component_refs: components
  };
}
