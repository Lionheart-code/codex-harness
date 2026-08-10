import { canonicalJson, sha256Hex } from "./evidence-types";

export interface ProofEligibilityComponentRefV1 {
  component_kind: "procedure_registry" | "execution_policy" | "stage_map" | "predicate_contract";
  path: string;
  content_hash: `sha256:${string}`;
}

export interface ProcedureRequirementV1 {
  procedure_id: string;
  procedure_occurrence: "single" | "planning_candidate" | "planning_closure";
  requirement_class: "always" | "required_if";
  predicate_id: string;
  predicate_result: "true" | "false" | "deferred";
  basis_ref_ids: string[];
}

export interface StageRequirementV1 {
  stage_id: string;
  requirement_class: "always" | "required_if";
  predicate_id: string;
  predicate_result: "true" | "false" | "deferred";
  basis_ref_ids: string[];
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
  procedure_requirements: ProcedureRequirementV1[];
  stage_requirements: StageRequirementV1[];
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
  const procedures = [...input.procedure_requirements].sort((a, b) =>
    `${a.procedure_id}:${a.procedure_occurrence}`.localeCompare(`${b.procedure_id}:${b.procedure_occurrence}`));
  const stages = [...input.stage_requirements].sort((a, b) => a.stage_id.localeCompare(b.stage_id));
  const invalidRequirement = (entry: ProcedureRequirementV1 | StageRequirementV1): boolean =>
    (entry.requirement_class === "always" && (entry.predicate_result !== "true" || entry.basis_ref_ids.length !== 0))
    || (entry.requirement_class === "required_if" && entry.predicate_result !== "deferred" && entry.basis_ref_ids.length === 0)
    || new Set(entry.basis_ref_ids).size !== entry.basis_ref_ids.length;
  if (procedures.length === 0 || stages.length === 0
    || new Set(procedures.map((entry) => `${entry.procedure_id}:${entry.procedure_occurrence}`)).size !== procedures.length
    || new Set(stages.map((entry) => entry.stage_id)).size !== stages.length
    || procedures.some(invalidRequirement) || stages.some(invalidRequirement)) {
    throw new Error("proof_eligibility_applicability_predicates_invalid");
  }
  const contractMarker = `sha256:${sha256Hex(canonicalJson({ components, procedures, stages }))}` as const;
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
    component_refs: components,
    procedure_requirements: procedures,
    stage_requirements: stages
  };
}
