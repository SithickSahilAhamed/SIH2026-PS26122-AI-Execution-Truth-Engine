import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Link2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { api, PROJECT_ID } from "../api/client";
import type { Dashboard } from "../api/types";
import { useApi } from "../hooks";
import { Card, CardHeader, FactTag, KpiCard, StatusBadge } from "../components/ui";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
};

export function CommandCenter() {
  const { data, loading, error } = useApi(() => api.get<Dashboard>(`/api/v1/projects/${PROJECT_ID}/dashboard`));

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
        <div className="skeleton h-64" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-muted">
          {error || "No data"}{" "}
          <button
            className="ml-2 text-blue-600 font-semibold"
            onClick={() => api.post(`/api/v1/demo/seed`).then(() => location.reload())}
          >
            Seed demo data
          </button>
        </Card>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="p-6 space-y-5 anim-fade-up">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Total Activities" value={kpis.total_activities} />
        <KpiCard label="Processed Events" value={kpis.auto_linked + kpis.review_pending + kpis.unmatched} sub="field events fused" />
        <KpiCard label="Auto Linked" value={kpis.auto_linked} tone="success" sub={`${kpis.auto_link_rate}% auto-link rate`} />
        <KpiCard label="Needs Review" value={kpis.review_pending} tone="warning" sub="planner queue" />
        <KpiCard label="Unmatched" value={kpis.unmatched} tone="critical" sub="flagged, not discarded" />
        <KpiCard label="Delayed" value={kpis.delayed} tone="critical" sub="behind planned finish" />
        <KpiCard label="At Risk" value={kpis.at_risk} tone="warning" sub="conflict or low trust" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader title="Progress Trend" subtitle="Cumulative planned vs actual progress (%)" />
          <div className="h-56 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.progress_trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted)" }} tickFormatter={(w: string) => w.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(w) => `Week of ${w}`} />
                <Area type="monotone" dataKey="planned_pct" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeWidth={1.5} name="Planned" />
                <Area type="monotone" dataKey="actual_pct" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} strokeWidth={1.5} name="Actual" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Execution Trust Distribution" subtitle="Fused activities by trust band" />
          <div className="h-56 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trust_distribution} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} name="Activities">
                  {data.trust_distribution.map((d) => (
                    <Cell
                      key={d.band}
                      fill={d.band === "90-100" ? "#16a34a" : d.band === "70-89" ? "#d97706" : d.band === "50-69" ? "#ea580c" : "#dc2626"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Discipline Breakdown" subtitle="Activity status by discipline" />
          <div className="h-52 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.discipline_breakdown} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="discipline" tick={{ fontSize: 9, fill: "var(--muted)" }} tickFormatter={(d: string) => d.slice(0, 4)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="completed" stackId="a" fill="#16a34a" name="Completed" />
                <Bar dataKey="in_progress" stackId="a" fill="#2563eb" name="In Progress" />
                <Bar dataKey="delayed" stackId="a" fill="#dc2626" name="Delayed" />
                <Bar dataKey="at_risk" stackId="a" fill="#d97706" name="At Risk" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Delay Trend" subtitle="Delayed activities per week" />
          <div className="h-52 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.delay_trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted)" }} tickFormatter={(w: string) => w.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(w) => `Week of ${w}`} />
                <Bar dataKey="delayed_count" fill="#dc2626" radius={[3, 3, 0, 0]} name="Delayed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Open Conflicts"
            subtitle={`${data.open_conflicts.length} unresolved`}
            right={
              <Link to="/conflicts" className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
          <div className="divide-y divide-border max-h-52 overflow-y-auto">
            {data.open_conflicts.length === 0 && <div className="p-4 text-[12px] text-muted">No open conflicts</div>}
            {data.open_conflicts.map((c) => (
              <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="mono text-[11px] font-semibold text-ink">{c.activity_id}</span>
                  <span className="text-[11px] text-muted truncate">{c.description}</span>
                </div>
                <StatusBadge status={c.severity === "HIGH" ? "CONFLICT_DETECTED" : "REVIEW_REQUIRED"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Recent Execution Events"
            subtitle="Latest field evidence processed"
            right={
              <Link to="/extraction" className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                Verify <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted border-b border-border">
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Claim</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Progress</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_events.map((e) => (
                  <tr key={e.event_id} className="border-b border-border/60 hover:bg-surface2">
                    <td className="px-4 py-2 mono text-[11px] font-semibold">{e.event_id}</td>
                    <td className="px-4 py-2">
                      <span className="text-[11px] font-medium">{e.source_type.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-2 max-w-[280px] truncate text-muted">{e.sentence}</td>
                    <td className="px-4 py-2">
                      {e.resolved_activity_id ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {e.resolved_activity_id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-[11px] font-semibold">
                          <XCircle className="w-3.5 h-3.5" /> Unmatched
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums font-semibold">{e.progress_percent !== null ? `${e.progress_percent}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Critical Activities"
            subtitle="Delayed, at-risk or in conflict"
            right={
              <Link to="/schedule" className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                Schedule <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
          <div className="divide-y divide-border">
            {data.critical_activities.map((a) => (
              <div key={a.activity_id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {a.status === "DELAYED" ? (
                    <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="mono text-[11px] font-semibold text-ink">{a.activity_id}</div>
                    <div className="text-[11px] text-muted truncate">{a.activity_name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.trust_score !== null && (
                    <span className="text-[11px] text-muted tabular-nums">Trust {a.trust_score}</span>
                  )}
                  <span className="text-[11px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                    +{a.variance_days}d
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Fact Provenance" subtitle="Every value in this system carries a fact type" />
        <div className="px-4 py-3 flex flex-wrap gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><FactTag type="FACT" /> Directly reported field information</span>
          <span className="flex items-center gap-1.5"><FactTag type="INFERENCE" /> AI-derived activity mapping</span>
          <span className="flex items-center gap-1.5"><FactTag type="OBSERVED" /> Measured actual execution</span>
          <span className="flex items-center gap-1.5"><FactTag type="CALCULATED" /> Dependency-propagated impact</span>
          <span className="flex items-center gap-1.5"><FactTag type="FORECAST" /> Predicted future state</span>
          <span className="flex items-center gap-1.5"><FactTag type="SIMULATED" /> What-if scenario output</span>
        </div>
      </Card>
    </div>
  );
}
