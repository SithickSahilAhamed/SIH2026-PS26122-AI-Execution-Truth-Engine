import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { Conflict } from "../api/types";
import { useApi } from "../hooks";
import { Button, Card, CardHeader, EmptyState, SkeletonRows, StatusBadge } from "../components/ui";

export function Conflicts() {
  const { data, loading, refetch } = useApi(() => api.get<{ conflicts: Conflict[]; open_count: number }>(`/api/v1/projects/${PROJECT_ID}/conflicts`));
  const [resolving, setResolving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function resolve(conflict: Conflict) {
    setResolving(conflict.id);
    setError(null);
    try {
      await api.post(`/api/v1/conflicts/${conflict.id}/resolve`, {
        resolution: notes[conflict.id] || "Planner verified against site records.",
        resolved_by: "planner-ui",
      });
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setResolving(null);
    }
  }

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={4} /></Card></div>;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Conflict Center"
          subtitle={`${data?.open_count || 0} open conflicts — contradictory evidence is surfaced, never silently resolved`}
        />
        {error && (
          <div className="mx-4 mt-4 border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-md px-4 py-2.5 text-[12px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="divide-y divide-border">
          {(data?.conflicts || []).length === 0 && <EmptyState title="No conflicts" hint="All evidence sources agree." />}
          {(data?.conflicts || []).map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="mono text-[12px] font-bold text-ink">{c.activity_id}</span>
                  <StatusBadge status={c.status === "OPEN" ? "CONFLICT_DETECTED" : "RESOLVED"} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {c.conflict_type.replace(/_/g, " ")} · {c.severity}
                </span>
              </div>
              <div className="text-[12px] text-ink mt-2">{c.description}</div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                {c.claims.map((claim, i) => (
                  <div key={i} className="border border-border rounded-md px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold">{claim.source}</span>
                    <span className={`text-[14px] font-bold tabular-nums ${claim.claim === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {claim.claim !== null ? `${claim.claim}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>

              {c.status === "OPEN" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    placeholder="Resolution notes"
                    className="flex-1 text-[12px] px-2.5 py-1.5 rounded border border-border bg-surface text-ink placeholder:text-muted"
                    value={notes[c.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                  />
                  <Button variant="success" disabled={resolving === c.id} onClick={() => resolve(c)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                  </Button>
                </div>
              )}
              {c.status === "RESOLVED" && c.resolution && (
                <div className="mt-3 text-[12px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {c.resolution}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
