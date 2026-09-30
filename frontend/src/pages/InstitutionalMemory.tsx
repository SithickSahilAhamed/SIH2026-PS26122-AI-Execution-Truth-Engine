import { Brain, Search } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { HistorySummary } from "../api/types";
import { useApi } from "../hooks";
import { Card, CardHeader, EmptyState, SkeletonRows } from "../components/ui";

export function InstitutionalMemory() {
  const [discipline, setDiscipline] = useState("PIPING");
  const [activityType, setActivityType] = useState("");
  const { data, loading, refetch } = useApi(
    () =>
      api.get<HistorySummary>(
        `/api/v1/projects/${PROJECT_ID}/history/similar?discipline=${discipline}${activityType ? `&activity_type=${encodeURIComponent(activityType)}` : ""}`,
      ),
    [discipline, activityType],
  );

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={6} /></Card></div>;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Institutional Memory"
          subtitle="Historical execution patterns from completed activities — queried, not invented"
        />
        <div className="p-4">
          <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2.5 bg-surface2 max-w-xl">
            <Search className="w-4 h-4 text-muted shrink-0" />
            <input
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              placeholder='Try "erection" or "welding"…'
              className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted outline-none"
            />
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="text-[12px] font-semibold px-2 py-1 rounded border border-border bg-surface text-ink"
            >
              {["CIVIL", "PIPING", "MECHANICAL", "ELECTRICAL", "INSTRUMENTATION", "HSE"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[11px] text-muted">
            Query: <span className="mono font-semibold text-ink">show historical performance for similar {discipline.toLowerCase()} activities</span>
          </div>
        </div>
      </Card>

      {!data || data.sample_size === 0 ? (
        <Card><EmptyState title="No historical records" hint="No completed activities match this query." /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Sample Size</div>
              <div className="text-[24px] font-bold text-ink mt-1 tabular-nums">{data.sample_size}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Avg Planned Duration</div>
              <div className="text-[24px] font-bold text-ink mt-1 tabular-nums">{data.average_planned_duration_hours}h</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Avg Actual Duration</div>
              <div className="text-[24px] font-bold text-ink mt-1 tabular-nums">{data.average_actual_duration_hours}h</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Avg Delay</div>
              <div className="text-[24px] font-bold text-red-600 dark:text-red-400 mt-1 tabular-nums">
                +{data.average_delay_hours}h
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Common Delay Causes" subtitle="Aggregated from historical records" />
              <div className="p-4 space-y-2.5">
                {data.common_delay_causes.map((c) => {
                  const max = data.common_delay_causes[0]?.count || 1;
                  return (
                    <div key={c.cause}>
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <span className="font-medium text-ink">{c.cause}</span>
                        <span className="text-muted tabular-nums">{c.count} occurrences</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${(c.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader title="Similar Historical Activities" subtitle="Execution patterns from comparable work" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-muted border-b border-border">
                      <th className="px-4 py-2 font-semibold">ID</th>
                      <th className="px-4 py-2 font-semibold">Type</th>
                      <th className="px-4 py-2 font-semibold">Planned</th>
                      <th className="px-4 py-2 font-semibold">Actual</th>
                      <th className="px-4 py-2 font-semibold">Delay</th>
                      <th className="px-4 py-2 font-semibold">Cause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.similar_activities.map((a) => (
                      <tr key={a.id} className="border-b border-border/60 hover:bg-surface2">
                        <td className="px-4 py-2 mono text-[11px] font-semibold">{a.id}</td>
                        <td className="px-4 py-2 text-[11px]">{a.activity_type}</td>
                        <td className="px-4 py-2 mono text-[11px] text-muted">{a.planned_hours}h</td>
                        <td className="px-4 py-2 mono text-[11px] text-muted">{a.actual_hours}h</td>
                        <td className={`px-4 py-2 mono text-[11px] font-semibold ${a.delay_hours > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {a.delay_hours > 0 ? `+${a.delay_hours}h` : "—"}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-muted">{a.delay_cause}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="p-4 flex items-center gap-3">
            <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="text-[12px] text-muted">
              <span className="font-semibold text-ink">Execution pattern:</span> {discipline} activities average{" "}
              <span className="font-semibold text-ink">{data.average_actual_duration_hours}h</span> actual vs{" "}
              <span className="font-semibold text-ink">{data.average_planned_duration_hours}h</span> planned. Recurring
              bottleneck: <span className="font-semibold text-ink">{data.common_delay_causes[0]?.cause || "none"}</span>.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
