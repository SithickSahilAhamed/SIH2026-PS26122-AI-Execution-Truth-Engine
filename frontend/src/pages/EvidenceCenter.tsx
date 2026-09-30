import { AlertTriangle, Database } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { EventListItem } from "../api/types";
import { useApi } from "../hooks";
import { Card, CardHeader, EmptyState, FactTag, SkeletonRows, StatusBadge } from "../components/ui";
import { TruthStateBar } from "../components/TruthStateBar";

export function EvidenceCenter() {
  const { data, loading } = useApi(() => api.get<{ events: EventListItem[] }>(`/api/v1/projects/${PROJECT_ID}/events`));
  const [activityId, setActivityId] = useState<string>("PIP-L6-021");

  const events = (data?.events || []).filter((e) => e.link.activity_id === activityId);
  const claims = events
    .map((e) => ({ source: e.event.source_type, claim: e.event.progress_percent, ts: e.event.timestamp, reporter: e.event.reporter_id, sentence: e.event.sentence }))
    .filter((c) => c.claim !== null);
  const values = claims.map((c) => c.claim as number);
  const agreement =
    values.length > 1
      ? Math.round((values.filter((v) => Math.abs(v - values[0]) <= 5).length / values.length) * 1000) / 10
      : 100;
  const hasConflict = values.length > 1 && Math.max(...values) - Math.min(...values) > 5;

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={6} /></Card></div>;

  const activityIds = Array.from(new Set((data?.events || []).map((e) => e.link.activity_id).filter(Boolean))) as string[];

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Evidence & Conflict Center"
          subtitle="All evidence sources for one activity — contradictory claims are never hidden"
          right={
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink mono"
            >
              {activityIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          }
        />

        <div className="p-4">
          <TruthStateBar active={4} />
        </div>

        {hasConflict && (
          <div className="mx-4 mt-4 border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-md p-4">
            <div className="flex items-center gap-2 text-[13px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4" /> Conflict Detected
            </div>
            <div className="text-[12px] text-red-700/90 dark:text-red-300/90 mt-1">
              Evidence agreement: {agreement}% — claims range {Math.min(...values)}% to {Math.max(...values)}%.
              No source is automatically selected. Planner review required.
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="border border-border rounded-md p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Sources</div>
              <div className="text-[20px] font-bold text-ink mt-1 tabular-nums">{events.length}</div>
            </div>
            <div className="border border-border rounded-md p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Evidence Agreement</div>
              <div className={`text-[20px] font-bold mt-1 tabular-nums ${hasConflict ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {agreement}%
              </div>
            </div>
            <div className="border border-border rounded-md p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Claim Spread</div>
              <div className="text-[20px] font-bold text-ink mt-1 tabular-nums">
                {values.length > 1 ? `${Math.min(...values)}–${Math.max(...values)}%` : "—"}
              </div>
            </div>
            <div className="border border-border rounded-md p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Status</div>
              <div className="mt-1.5">{hasConflict ? <StatusBadge status="CONFLICT_DETECTED" /> : <StatusBadge status="AUTO_APPROVED" />}</div>
            </div>
          </div>

          {events.length === 0 && <EmptyState title="No evidence" hint="Select an activity with field evidence." />}

          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.event.event_id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className="w-3.5 h-3.5 text-muted shrink-0" />
                    <span className="text-[11px] font-semibold">{e.event.source_type.replace(/_/g, " ")}</span>
                    <span className="mono text-[10px] text-muted">{e.event.evidence_id}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <FactTag type="FACT" />
                    <span className="mono text-[11px] text-muted">{e.event.timestamp}</span>
                  </div>
                </div>
                <div className="text-[12px] text-ink mt-1.5">{e.event.sentence}</div>
                <div className="flex items-center gap-4 mt-1.5 text-[11px] text-muted">
                  <span>Reporter: {e.event.reporter_id}</span>
                  <span>
                    Claim: <strong className="text-ink">{e.event.progress_percent ?? "—"}%</strong>
                  </span>
                  <span>Reliability: {(0.95 * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
