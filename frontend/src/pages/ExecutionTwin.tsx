import { Boxes } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { ExecutionTwin, TrustBreakdown } from "../api/types";
import { useApi } from "../hooks";
import { Card, CardHeader, EmptyState, FactTag, SkeletonRows, StatusBadge } from "../components/ui";
import { TrustScore } from "../components/TrustScore";
import { TruthStateBar } from "../components/TruthStateBar";

export function ExecutionTwin() {
  const [activityId, setActivityId] = useState("PIP-L6-021");
  const { data: twin, loading } = useApi(() => api.get<ExecutionTwin>(`/api/v1/activities/${activityId}/execution-twin`), [activityId]);
  const { data: eventsData } = useApi(
    () => api.get<{ events: { event: { event_id: string }; link: { activity_id: string | null } }[] }>(
      `/api/v1/projects/${PROJECT_ID}/events`,
    ),
    [activityId],
  );
  const eventId = (eventsData?.events || []).find((e) => e.link.activity_id === activityId)?.event.event_id;
  const { data: trust } = useApi<TrustBreakdown | null>(
    () =>
      eventId
        ? api.get<TrustBreakdown>(`/api/v1/events/${eventId}/trust`)
        : Promise.resolve(null),
    [eventId],
  );

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={6} /></Card></div>;
  if (!twin) return <div className="p-6"><Card><EmptyState title="Select an activity" /></Card></div>;

  const varianceTone = twin.variance.days > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Execution Twin"
          subtitle="Planned state vs actual state vs forecast — one auditable card per L5/L6 activity"
          right={
            <input
              value={activityId}
              onChange={(e) => setActivityId(e.target.value.toUpperCase())}
              className="mono text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink w-36"
              placeholder="Activity ID"
            />
          }
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="mono text-[16px] font-bold text-ink">{twin.activity.activity_id}</span>
                <StatusBadge status={twin.status} />
              </div>
              <div className="text-[13px] text-muted mt-1">{twin.activity.activity_name}</div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
                <span>{twin.activity.discipline}</span>
                {twin.activity.asset_id && <span className="mono">{twin.activity.asset_id}</span>}
                {twin.activity.location && <span>{twin.activity.location}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-[34px] font-bold tabular-nums leading-none ${varianceTone}`}>
                {twin.variance.days > 0 ? `+${twin.variance.days}` : twin.variance.days}
                <span className="text-[14px] text-muted font-semibold"> days</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mt-1">Variance</div>
            </div>
          </div>

          <div className="mt-5">
            <TruthStateBar active={5} />
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatePanel
              title="Planned"
              factType="PLAN"
              rows={[
                { label: "Start", value: twin.planned.start },
                { label: "Finish", value: twin.planned.finish },
                { label: "Duration", value: `${twin.planned.duration_days}d` },
              ]}
            />
            <StatePanel
              title="Actual"
              factType="OBSERVED"
              rows={[
                { label: "Start", value: twin.actual.start?.slice(0, 16) || "—" },
                { label: "Finish", value: twin.actual.finish?.slice(0, 16) || "—" },
                { label: "Progress", value: `${twin.actual.progress}%` },
              ]}
              highlight={twin.actual.progress > 0}
            />
            <StatePanel
              title="Forecast"
              factType="FORECAST"
              rows={[
                { label: "Projected Finish", value: twin.forecast.finish?.slice(0, 16) || "—" },
                { label: "Evidence Sources", value: String(twin.evidence_count) },
                { label: "Trust Score", value: twin.trust_score !== null ? `${twin.trust_score}/100` : "—" },
              ]}
            />
          </div>

          {trust && twin.trust_score !== null && (
            <div className="mt-5 border border-border rounded-md p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
                Execution Trust Breakdown
              </div>
              <TrustScore score={trust.total_score} breakdown={trust.components} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatePanel({
  title,
  factType,
  rows,
  highlight,
}: {
  title: string;
  factType: "PLAN" | "OBSERVED" | "FORECAST";
  rows: { label: string; value: string }[];
  highlight?: boolean;
}) {
  return (
    <div className={`border rounded-md p-3 ${highlight ? "border-blue-300 dark:border-blue-500/40 bg-blue-50/40 dark:bg-blue-500/5" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink">{title}</span>
        <FactTag type={factType} />
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-[12px]">
            <span className="text-muted">{r.label}</span>
            <span className="font-semibold text-ink mono">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
