import {
  type EvidenceEventEnvelope,
  type EvidenceRunSummary,
  type EvidenceScope,
  type EvidenceTimelineEntry,
  type ProjectionAvailability,
  type VerifiedSnapshot
} from "./evidence-types";

export interface ProjectionValidationResult {
  ok: boolean;
  adapter: string;
  eventCount: number;
  errors: string[];
}

export interface ProjectionAdapter {
  readonly name: string;
  probe(): Promise<ProjectionAvailability>;
  init(): Promise<void>;
  close(): Promise<void>;
  applyEvent(event: EvidenceEventEnvelope): Promise<void>;
  rebuild(events: EvidenceEventEnvelope[]): Promise<void>;
  validate(events: EvidenceEventEnvelope[]): Promise<ProjectionValidationResult>;
  queryRuns(scope: Partial<EvidenceScope>, limit: number): Promise<EvidenceRunSummary[]>;
  queryTimeline(scope: Partial<EvidenceScope>, runId: string): Promise<EvidenceTimelineEntry[]>;
  queryLatestVerifiedSnapshot(
    scope: Pick<EvidenceScope, "target_project_id" | "target_root" | "namespace">,
    fingerprintId: string
  ): Promise<{ event: EvidenceEventEnvelope; snapshot: VerifiedSnapshot } | undefined>;
}

export class ProjectionStore {
  private readonly adapter: ProjectionAdapter;

  constructor(adapter: ProjectionAdapter) {
    this.adapter = adapter;
  }

  async probe(): Promise<ProjectionAvailability> {
    return this.adapter.probe();
  }

  async init(): Promise<void> {
    await this.adapter.init();
  }

  async close(): Promise<void> {
    await this.adapter.close();
  }

  async applyEvent(event: EvidenceEventEnvelope): Promise<void> {
    await this.adapter.applyEvent(event);
  }

  async rebuild(events: EvidenceEventEnvelope[]): Promise<void> {
    await this.adapter.rebuild(events);
  }

  async validate(events: EvidenceEventEnvelope[]): Promise<ProjectionValidationResult> {
    return this.adapter.validate(events);
  }

  async queryRuns(scope: Partial<EvidenceScope>, limit: number): Promise<EvidenceRunSummary[]> {
    return this.adapter.queryRuns(scope, limit);
  }

  async queryTimeline(scope: Partial<EvidenceScope>, runId: string): Promise<EvidenceTimelineEntry[]> {
    return this.adapter.queryTimeline(scope, runId);
  }

  async queryLatestVerifiedSnapshot(
    scope: Pick<EvidenceScope, "target_project_id" | "target_root" | "namespace">,
    fingerprintId: string
  ): Promise<{ event: EvidenceEventEnvelope; snapshot: VerifiedSnapshot } | undefined> {
    return this.adapter.queryLatestVerifiedSnapshot(scope, fingerprintId);
  }
}
