export interface Meta {
  request_id: string;
  timestamp: string;
}

export interface APIEnvelope<T> {
  success: boolean;
  data: T;
  meta: Meta;
}

export interface APIError {
  success: false;
  error: { code: string; message: string; details: Record<string, string> };
  meta: Meta;
}

export type Discipline = "CIVIL" | "PIPING" | "MECHANICAL" | "ELECTRICAL" | "INSTRUMENTATION" | "HSE" | "OTHER";
export type MatchStatus = "AUTO_MATCHED" | "REVIEW_REQUIRED" | "MATCHED_BY_PLANNER" | "UNMATCHED" | "REJECTED";
export type ExecutionStatus = "AUTO_APPROVED" | "REQUIRES_REVIEW" | "CONFLICT_DETECTED";
export type ActivityStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED" | "AT_RISK" | "BLOCKED";
export type SourceType = "DPR" | "SPREADSHEET" | "VOICE_TRANSCRIPT" | "SITE_DIARY" | "SUPERVISOR_UPDATE" | "OTHER";
export type EventType = "START" | "PROGRESS" | "COMPLETE" | "DELAY" | "BLOCK" | "RESUME" | "INSPECTION" | "TEST" | "OTHER";
export type FactType = "FACT" | "INFERENCE" | "FORECAST" | "OBSERVED" | "CALCULATED" | "SIMULATED" | "PLAN";

export interface Project {
  id: string;
  project_code: string;
  name: string;
  organization: string;
  location: string;
  status: string;
  start_date: string;
  planned_end_date: string;
}

export interface Activity {
  activity_id: string;
  activity_name: string;
  discipline: Discipline;
  asset_id: string | null;
  line_number: string | null;
  location: string | null;
  planned_start: string;
  planned_finish: string;
  planned_duration: number;
  predecessors: string[];
  version: number;
  actual_start: string | null;
  actual_finish: string | null;
  progress_percent: number;
  status: ActivityStatus;
  forecast_finish: string | null;
}

export interface ExtractedEvent {
  event_id: string;
  evidence_id: string;
  source_type: SourceType;
  reporter_id: string;
  timestamp: string;
  raw_text: string;
  sentence: string;
  mentioned_activity_id: string | null;
  mentioned_asset_id: string | null;
  line_number: string | null;
  discipline: Discipline | null;
  location: string | null;
  event_type: EventType;
  progress_percent: number | null;
  extraction_confidence: number;
  resolved_activity_id: string | null;
  resolution_path: "EXPLICIT_ID" | "ASSET_LOOKUP" | "KEYWORD_LOOKUP" | "UNRESOLVED";
  fact_type: FactType;
  extraction_notes: string[];
}

export interface MatchCandidate {
  activity_id: string;
  activity_code: string;
  activity_name: string;
  discipline: Discipline;
  rank: number;
  score: number;
  explanation: {
    asset_match: boolean;
    discipline_match: boolean;
    location_match: boolean;
    semantic_similarity: number;
    temporal_consistency: boolean;
    explicit_id_match: boolean;
  };
}

export interface TrustComponents {
  evidence_agreement: number;
  activity_match: number;
  temporal_consistency: number;
  source_reliability: number;
  historical_consistency: number;
}

export interface TrustBreakdown {
  total_score: number;
  components: TrustComponents;
}

export interface ConflictDetail {
  spread_percent: number;
  agreement_percent: number;
  low_claim_percent: number | null;
  high_claim_percent: number | null;
  description: string;
  severity: string;
}

export interface EvidenceLog {
  evidence_id: string;
  event_id: string;
  source_type: SourceType;
  reporter_id: string;
  timestamp: string;
  claimed_progress_percent: number | null;
  source_reliability: number;
  claim_summary: string;
}

export interface ExecutionState {
  activity_id: string;
  activity_name: string;
  fused_progress_percent: number;
  trust_score: number;
  status: ExecutionStatus;
  fact_type: FactType;
  breakdown: TrustComponents;
  evidence_logs: EvidenceLog[];
  conflict: ConflictDetail | null;
  explanation: string[];
  has_evidence: boolean;
  evaluated_at: string | null;
}

export interface Link {
  event_id: string;
  activity_id: string | null;
  match_status: MatchStatus;
  trust_score: number | null;
  matched_by: string;
  matched_at: string;
  reason: string;
}

export interface EventListItem {
  event: ExtractedEvent;
  link: Link;
  activity_code: string | null;
  activity_name: string | null;
  discipline: Discipline | null;
}

export interface Conflict {
  id: string;
  activity_id: string;
  conflict_type: string;
  description: string;
  severity: string;
  status: string;
  detected_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution?: string | null;
  claims: { source: string; claim: number | null }[];
}

export interface ProcessResult {
  events: ExtractedEvent[];
  states: Record<string, ExecutionState>;
  unmatched_events: ExtractedEvent[];
  conflict_activity_ids: string[];
  processed_evidence_count: number;
}

export interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  performed_by: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  created_at: string;
}

export interface Report {
  id: string;
  report_type: SourceType;
  file_name: string;
  raw_text: string;
  report_date: string;
  reported_by: string;
  processing_status: string;
}

export interface ExecutionTwin {
  activity: {
    activity_id: string;
    activity_name: string;
    discipline: Discipline;
    asset_id: string | null;
    location: string | null;
  };
  planned: { start: string; finish: string; duration_days: number; fact_type: FactType };
  actual: { start: string | null; finish: string | null; progress: number; fact_type: FactType };
  forecast: { finish: string | null; fact_type: FactType };
  variance: { days: number };
  trust_score: number | null;
  status: ActivityStatus;
  evidence_count: number;
  version: number;
}

export interface ImpactAnalysis {
  root_activity: string;
  delay_days: number;
  delay_fact_type: FactType;
  affected_activities: {
    activity_id: string;
    activity_code: string;
    activity_name: string;
    discipline: Discipline;
    impact_days: number;
    status: ActivityStatus;
    fact_type: FactType;
  }[];
  affected_milestones: {
    activity_id: string;
    activity_code: string;
    activity_name: string;
    discipline: Discipline;
    impact_days: number;
    status: ActivityStatus;
    fact_type: FactType;
  }[];
  affected_count: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  assumptions: {
    additional_crews?: { discipline: Discipline; count: number }[];
    duration_change_pct?: number;
    start_shift_days?: number;
  };
  baseline_snapshot: Record<string, { planned_finish: string; actual_finish: string | null; status: string }>;
  result: {
    simulated_activities: Record<string, { start: string; finish: string; duration_days: number }>;
    milestones: {
      milestone_id: string;
      milestone_name: string;
      baseline_finish: string;
      simulated_finish: string | null;
      delta_days: number;
      fact_type: FactType;
    }[];
    recovery_days: number;
    note: string;
  } | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface HistorySummary {
  sample_size: number;
  average_planned_duration_hours: number;
  average_actual_duration_hours: number;
  average_delay_hours: number;
  common_delay_causes: { cause: string; count: number }[];
  similar_activities: {
    id: string;
    discipline: Discipline;
    activity_type: string;
    planned_hours: number;
    actual_hours: number;
    delay_hours: number;
    delay_cause: string;
    contractor: string;
    location: string;
  }[];
}

export interface Dashboard {
  project: Project;
  kpis: {
    total_activities: number;
    completed: number;
    in_progress: number;
    delayed: number;
    at_risk: number;
    review_pending: number;
    unmatched: number;
    auto_linked: number;
    average_trust_score: number;
    auto_link_rate: number;
  };
  progress_trend: { week: string; planned_pct: number; actual_pct: number }[];
  discipline_breakdown: {
    discipline: Discipline;
    total: number;
    completed: number;
    in_progress: number;
    delayed: number;
    at_risk: number;
  }[];
  delay_trend: { week: string; delayed_count: number; avg_delay_days: number }[];
  trust_distribution: { band: string; count: number }[];
  recent_events: {
    event_id: string;
    source_type: SourceType;
    sentence: string;
    resolved_activity_id: string | null;
    progress_percent: number | null;
    event_type: EventType;
    timestamp: string;
  }[];
  open_conflicts: Conflict[];
  critical_activities: {
    activity_id: string;
    activity_name: string;
    discipline: Discipline;
    status: ActivityStatus;
    progress_percent: number;
    trust_score: number | null;
    variance_days: number;
  }[];
}

export interface SeedSummary {
  seeded: boolean;
  activities: number;
  dependencies: number;
  reports: number;
  events: number;
  evaluated_activities: number;
  auto_approved: number;
  requires_review: number;
  conflicts: number;
  unmatched_events: number;
  historical_records: number;
}
