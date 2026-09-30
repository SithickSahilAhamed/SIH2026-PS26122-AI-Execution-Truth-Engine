import rawSnapshot from "./offlineSnapshot.json?raw";
import { ApiError } from "./errors";
import type {
  AuditEntry,
  Conflict,
  Dashboard,
  EventListItem,
  ProcessResult,
  Scenario,
  SeedSummary,
} from "./types";

interface SnapshotData {
  project_id: string;
  scenario_id: string;
  routes: Record<string, unknown>;
}

interface AuditPayload {
  audit: AuditEntry[];
}

interface EventsPayload {
  events: EventListItem[];
}

interface ConflictsPayload {
  conflicts: Conflict[];
  open_count: number;
}

interface PendingReview {
  event_id: string;
  activity_id: string | null;
  match_status: string;
  trust_score: number | null;
  event: EventListItem["event"] | null;
}

interface ReviewsPayload {
  pending: PendingReview[];
  pending_count: number;
}

interface SingleEventPayload {
  event: EventListItem["event"];
  link: EventListItem["link"];
  candidates: unknown[];
}

interface ReportsPayload {
  reports: { id: string }[];
}

let snapshot: SnapshotData | null = null;
let state: Record<string, unknown> | null = null;
let active = false;
const createdScenarios = new Map<string, Scenario>();
const listeners = new Set<(active: boolean) => void>();

function now(): string {
  return new Date().toISOString();
}

function loadSnapshot(): SnapshotData {
  if (!snapshot) snapshot = JSON.parse(rawSnapshot) as SnapshotData;
  return snapshot;
}

function ensureState(): Record<string, unknown> {
  if (!state) state = JSON.parse(JSON.stringify(loadSnapshot().routes)) as Record<string, unknown>;
  return state;
}

function resetState(): void {
  state = JSON.parse(JSON.stringify(loadSnapshot().routes)) as Record<string, unknown>;
  createdScenarios.clear();
}

export function isOfflineActive(): boolean {
  return active;
}

export function onOfflineChange(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function activateOffline(): void {
  if (active) return;
  active = true;
  ensureState();
  listeners.forEach((listener) => listener(true));
}

/** Live API is unreachable from an https page when the base URL is loopback. */
export function shouldSkipLiveApi(baseUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(baseUrl);
  return local && window.location.protocol === "https:";
}

function projectPath(): string {
  return `/api/v1/projects/${loadSnapshot().project_id}`;
}

function route<T>(key: string): T {
  const routes = ensureState();
  if (key in routes) return routes[key] as T;
  throw new ApiError(`Offline demo data has no entry for ${key.replace(/^(GET|POST|PUT) /, "")}`, "NOT_FOUND", 404);
}

function writeRoute(key: string, value: unknown): void {
  ensureState()[key] = value;
}

function pushAudit(entry: {
  entity_type: string;
  entity_id: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
}): void {
  const payload = state?.[`GET ${projectPath()}/audit`] as AuditPayload | undefined;
  if (!payload || !Array.isArray(payload.audit)) return;
  payload.audit.unshift({
    id: `AUD-OFFLINE-${Date.now()}`,
    performed_by: "planner-ui",
    created_at: now(),
    ...entry,
  });
}

function buildProcessResult(): ProcessResult {
  const events = route<EventsPayload>(`GET ${projectPath()}/events`);
  const conflicts = route<ConflictsPayload>(`GET ${projectPath()}/conflicts`);
  const reports = state?.[`GET ${projectPath()}/reports`] as ReportsPayload | undefined;
  const list = events.events;
  return {
    events: list.map((item) => item.event),
    states: {},
    unmatched_events: list.filter((item) => !item.event.resolved_activity_id).map((item) => item.event),
    conflict_activity_ids: conflicts.conflicts
      .filter((c) => c.status === "OPEN")
      .map((c) => c.activity_id),
    processed_evidence_count: reports?.reports.length ?? list.length,
  };
}

function resolveConflict(id: string, body: Record<string, unknown>): Conflict {
  const key = `GET ${projectPath()}/conflicts`;
  const payload = route<ConflictsPayload>(key);
  const conflict = payload.conflicts.find((c) => c.id === id);
  if (!conflict) throw new ApiError(`Conflict ${id} not found`, "NOT_FOUND", 404);
  const resolution = typeof body.resolution === "string" ? body.resolution : "Planner verified against site records.";
  conflict.status = "RESOLVED";
  conflict.resolution = resolution;
  conflict.resolved_by = typeof body.resolved_by === "string" ? body.resolved_by : "planner-ui";
  conflict.resolved_at = now();
  payload.open_count = payload.conflicts.filter((c) => c.status === "OPEN").length;
  writeRoute(key, payload);

  const dashboard = state?.[`GET ${projectPath()}/dashboard`] as Dashboard | undefined;
  if (dashboard?.open_conflicts) {
    dashboard.open_conflicts = dashboard.open_conflicts.filter((c) => c.id !== id);
  }
  pushAudit({
    entity_type: "CONFLICT",
    entity_id: id,
    action: "CONFLICT_RESOLVED",
    old_value: "OPEN",
    new_value: "RESOLVED",
    reason: resolution,
  });
  return conflict;
}

function reviewEvent(id: string, body: Record<string, unknown>): void {
  const status = typeof body.status === "string" ? body.status : "APPROVED";
  const selected =
    typeof body.selected_activity_id === "string" && body.selected_activity_id
      ? body.selected_activity_id
      : null;
  const reviewer = typeof body.reviewer_id === "string" ? body.reviewer_id : "planner-ui";

  const apply = (link: EventListItem["link"], event?: EventListItem["event"]) => {
    if (status === "REJECTED") {
      link.match_status = "REJECTED";
      link.reason = "Rejected in planner review";
    } else {
      link.match_status = "MATCHED_BY_PLANNER";
      link.activity_id = selected || link.activity_id;
      link.matched_by = reviewer;
      link.reason = "Confirmed by planner review";
      if (event && selected) event.resolved_activity_id = selected;
    }
    link.matched_at = now();
  };

  const eventsKey = `GET ${projectPath()}/events`;
  const events = route<EventsPayload>(eventsKey);
  const item = events.events.find((e) => e.event.event_id === id);
  if (item) apply(item.link, item.event);
  writeRoute(eventsKey, events);

  const singleKey = `GET /api/v1/events/${id}`;
  const single = state?.[singleKey] as SingleEventPayload | undefined;
  if (single) {
    apply(single.link, single.event);
    writeRoute(singleKey, single);
  }

  const reviewsKey = `GET ${projectPath()}/reviews`;
  const reviews = route<ReviewsPayload>(reviewsKey);
  const before = reviews.pending.length;
  reviews.pending = reviews.pending.filter((p) => p.event_id !== id);
  reviews.pending_count = reviews.pending.length;
  writeRoute(reviewsKey, reviews);

  const dashboard = state?.[`GET ${projectPath()}/dashboard`] as Dashboard | undefined;
  if (dashboard?.kpis && before !== reviews.pending.length) {
    dashboard.kpis.review_pending = reviews.pending_count;
  }
  pushAudit({
    entity_type: "EVENT",
    entity_id: id,
    action: "REVIEW_DECISION",
    old_value: item?.link.match_status ?? "REVIEW_REQUIRED",
    new_value: status,
    reason: typeof body.comments === "string" ? body.comments : "",
  });
}

function createScenario(body: Record<string, unknown> | undefined): Scenario {
  const canned = route<Scenario>(`POST ${projectPath()}/scenarios`);
  const scenario: Scenario = {
    ...canned,
    id: loadSnapshot().scenario_id,
    name: typeof body?.name === "string" ? body.name : canned.name,
    assumptions: (body?.assumptions as Scenario["assumptions"]) ?? canned.assumptions,
    result: null,
    status: "DRAFT",
    created_at: now(),
    completed_at: null,
  };
  createdScenarios.set(scenario.id, scenario);
  return scenario;
}

function runScenario(id: string): Scenario {
  const canned = route<Scenario>(`POST /api/v1/scenarios/${loadSnapshot().scenario_id}/run`);
  const created = createdScenarios.get(id) ?? canned;
  const result: Scenario = {
    ...canned,
    id,
    name: created.name,
    assumptions: created.assumptions,
    status: "COMPLETED",
    created_at: created.created_at,
    completed_at: now(),
    result: canned.result,
  };
  createdScenarios.set(id, result);
  return result;
}

function handlePost<T>(path: string, body: unknown): T {
  const payload = (body ?? {}) as Record<string, unknown>;

  if (path === "/api/v1/demo/seed") {
    resetState();
    return route<T>("POST /api/v1/demo/seed");
  }
  if (path === "/api/v1/evidence/submit") {
    const count = Array.isArray(body) ? body.length : 1;
    return { evidence_accepted: count } as T;
  }
  if (path === "/api/v1/engine/process") {
    return buildProcessResult() as T;
  }
  if (path === `/api/v1/projects/${loadSnapshot().project_id}/scenarios`) {
    return createScenario(payload) as T;
  }

  let match = /^\/api\/v1\/conflicts\/([^/]+)\/resolve$/.exec(path);
  if (match) return resolveConflict(match[1], payload) as T;

  match = /^\/api\/v1\/events\/([^/]+)\/review$/.exec(path);
  if (match) {
    reviewEvent(match[1], payload);
    return { ok: true } as T;
  }

  match = /^\/api\/v1\/scenarios\/([^/]+)\/run$/.exec(path);
  if (match) return runScenario(match[1]) as T;

  throw new ApiError(`Offline demo data cannot handle POST ${path}`, "NOT_FOUND", 404);
}

function handlePut<T>(path: string, body: unknown): T {
  if (path === "/api/v1/config/thresholds") {
    writeRoute(`GET ${path}`, body);
    return body as T;
  }
  throw new ApiError(`Offline demo data cannot handle PUT ${path}`, "NOT_FOUND", 404);
}

export function offlineRequest<T>(method: string, path: string, body?: unknown): T {
  ensureState();
  if (method === "GET") return route<T>(`GET ${path}`);
  if (method === "POST") return handlePost<T>(path, body);
  if (method === "PUT") return handlePut<T>(path, body);
  throw new ApiError(`Offline demo data cannot handle ${method} ${path}`, "METHOD_NOT_ALLOWED", 405);
}

export function offlineSeedSummary(): SeedSummary | null {
  if (!state) return null;
  return (state["POST /api/v1/demo/seed"] as SeedSummary) ?? null;
}
