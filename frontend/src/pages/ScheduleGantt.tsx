import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { Activity } from "../api/types";
import { useApi } from "../hooks";
import { Button, Card, CardHeader, EmptyState, SkeletonRows, StatusBadge, downloadCsv } from "../components/ui";
import { Gantt } from "../components/Gantt";

type Filter = "ALL" | "DELAYED" | "AT_RISK" | "COMPLETED" | "NOT_STARTED";

export function ScheduleGantt() {
  const { data, loading } = useApi(() => api.get<{ activities: Activity[] }>(`/api/v1/projects/${PROJECT_ID}/activities`));
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activities = useMemo(() => {
    let rows = data?.activities || [];
    if (filter !== "ALL") rows = rows.filter((a) => a.status === filter);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (a) => a.activity_id.toLowerCase().includes(q) || a.activity_name.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, filter, query]);

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={10} /></Card></div>;
  if (!data || data.activities.length === 0) {
    return <div className="p-6"><Card><EmptyState title="No schedule" hint="Seed the demo dataset to load the baseline schedule." /></Card></div>;
  }

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Schedule / Gantt"
          subtitle="Planned vs actual — blue/grey planned, blue actual, red delayed, amber at risk"
          right={
            <div className="flex items-center gap-2">
              <input
                placeholder="Filter activities…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="text-[12px] px-2.5 py-1.5 rounded border border-border bg-surface text-ink placeholder:text-muted w-44"
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink"
              >
                <option value="ALL">All</option>
                <option value="DELAYED">Delayed</option>
                <option value="AT_RISK">At Risk</option>
                <option value="COMPLETED">Completed</option>
                <option value="NOT_STARTED">Not Started</option>
              </select>
            </div>
          }
        />
        <Gantt activities={activities} selectedId={selectedId} onSelect={setSelectedId} />
        {activities.length === 0 && <EmptyState title="No activities match" hint="Clear the filter or search query." />}
      </Card>

      <Card>
        <CardHeader
          title="Activity Register"
          subtitle={`${activities.length} activities${activities.length > 60 ? " — showing first 60" : ""}`}
          right={
            <Button
              variant="ghost"
              disabled={activities.length === 0}
              onClick={() =>
                downloadCsv(
                  "schedule-register.csv",
                  ["activity_id", "activity_name", "discipline", "planned_start", "planned_finish", "actual_start", "actual_finish", "status"],
                  activities.map((a) => [a.activity_id, a.activity_name, a.discipline, a.planned_start, a.planned_finish, a.actual_start || "", a.actual_finish || "", a.status]),
                )
              }
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted border-b border-border">
                <th className="px-4 py-2 font-semibold">Activity</th>
                <th className="px-4 py-2 font-semibold">Discipline</th>
                <th className="px-4 py-2 font-semibold">Planned Start</th>
                <th className="px-4 py-2 font-semibold">Planned Finish</th>
                <th className="px-4 py-2 font-semibold">Actual Start</th>
                <th className="px-4 py-2 font-semibold">Actual Finish</th>
                <th className="px-4 py-2 font-semibold">Variance</th>
                <th className="px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {activities.slice(0, 60).map((a) => {
                const variance =
                  a.actual_finish && a.planned_finish
                    ? Math.max(0, Math.round((new Date(a.actual_finish).getTime() - new Date(a.planned_finish).getTime()) / 86400000))
                    : a.actual_start && a.planned_finish && new Date(a.actual_start) > new Date(a.planned_finish)
                      ? Math.round((new Date("2026-12-15").getTime() - new Date(a.planned_finish).getTime()) / 86400000)
                      : 0;
                return (
                  <tr
                    key={a.activity_id}
                    className={`border-b border-border/60 cursor-pointer ${selectedId === a.activity_id ? "bg-blue-50/60 dark:bg-blue-500/5" : "hover:bg-surface2"}`}
                    onClick={() => setSelectedId(a.activity_id)}
                  >
                    <td className="px-4 py-2">
                      <div className="mono text-[11px] font-semibold text-ink">{a.activity_id}</div>
                      <div className="text-[11px] text-muted max-w-[220px] truncate">{a.activity_name}</div>
                    </td>
                    <td className="px-4 py-2 text-[11px]">{a.discipline}</td>
                    <td className="px-4 py-2 mono text-[11px] text-muted">{a.planned_start}</td>
                    <td className="px-4 py-2 mono text-[11px] text-muted">{a.planned_finish}</td>
                    <td className="px-4 py-2 mono text-[11px] text-muted">{a.actual_start?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-2 mono text-[11px] text-muted">{a.actual_finish?.slice(0, 10) || "—"}</td>
                    <td className={`px-4 py-2 tabular-nums font-semibold ${variance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {variance > 0 ? `+${variance}d` : "—"}
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={a.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
