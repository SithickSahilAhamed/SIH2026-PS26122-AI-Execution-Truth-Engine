import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { ImpactAnalysis } from "../api/types";
import { useApi } from "../hooks";
import { Card, CardHeader, EmptyState, FactTag, SkeletonRows } from "../components/ui";
import { DependencyGraph } from "../components/DependencyGraph";

export function DependencyImpact() {
  const { data: activitiesData } = useApi(() => api.get<{ activities: { activity_id: string; status: string }[] }>(`/api/v1/projects/${PROJECT_ID}/activities`));
  const [rootId, setRootId] = useState("PIP-L6-021");
  const { data: impact, loading } = useApi(() => api.get<ImpactAnalysis>(`/api/v1/activities/${rootId}/impact`), [rootId]);

  const delayed = (activitiesData?.activities || []).filter((a) => a.status === "DELAYED" || a.status === "AT_RISK");

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={6} /></Card></div>;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Dependency Impact Engine"
          subtitle="Observed actual → calculated dependency propagation → forecast milestone impact"
          right={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Root activity</span>
              <input
                value={rootId}
                onChange={(e) => setRootId(e.target.value.toUpperCase())}
                className="mono text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink w-36"
              />
            </div>
          }
        />
        <div className="p-4">
          {delayed.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">
                Quick select (delayed / at risk)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {delayed.map((a) => (
                  <button
                    key={a.activity_id}
                    onClick={() => setRootId(a.activity_id)}
                    className={`mono text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${
                      rootId === a.activity_id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-border text-muted hover:text-ink"
                    }`}
                  >
                    {a.activity_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!impact ? (
            <EmptyState title="No impact data" hint="Enter a valid activity id." />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="border border-border rounded-md p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Affected Activities</div>
                  <div className="text-[22px] font-bold text-ink mt-1 tabular-nums">{impact.affected_count}</div>
                </div>
                <div className="border border-border rounded-md p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Affected Milestones</div>
                  <div className="text-[22px] font-bold text-ink mt-1 tabular-nums">{impact.affected_milestones.length}</div>
                </div>
                <div className="border border-border rounded-md p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Calculated Delay</div>
                  <div className="text-[22px] font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                    +{impact.delay_days}d
                  </div>
                </div>
                <div className="border border-border rounded-md p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Propagation</div>
                  <div className="mt-1.5"><FactTag type={impact.delay_fact_type} /></div>
                </div>
              </div>
              <DependencyGraph impact={impact} />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
