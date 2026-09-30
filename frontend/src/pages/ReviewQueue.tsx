import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { EventListItem } from "../api/types";
import { useApi } from "../hooks";
import { Button, Card, CardHeader, EmptyState, SkeletonRows, StatusBadge } from "../components/ui";

interface PendingReview {
  event_id: string;
  activity_id: string | null;
  match_status: string;
  trust_score: number | null;
  event: EventListItem["event"] | null;
}

export function ReviewQueue() {
  const { data, loading, refetch } = useApi(
    () => api.get<{ pending: PendingReview[]; pending_count: number }>(`/api/v1/projects/${PROJECT_ID}/reviews`),
  );
  const { data: activitiesData } = useApi(
    () => api.get<{ activities: { activity_id: string }[] }>(`/api/v1/projects/${PROJECT_ID}/activities`),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(p: PendingReview, status: string) {
    const target = status === "REASSIGNED" ? targets[p.event_id] || "" : p.activity_id || "";
    if ((status === "APPROVED" || status === "REASSIGNED") && !target) {
      setError(`Select a target activity before ${status === "APPROVED" ? "approving" : "reassigning"} ${p.event_id}.`);
      return;
    }
    setBusy(p.event_id);
    setError(null);
    try {
      await api.post(`/api/v1/events/${p.event_id}/review`, {
        status,
        selected_activity_id: target || undefined,
        comments: comments[p.event_id] || "",
        reviewer_id: "planner-ui",
      });
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review action failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={5} /></Card></div>;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Planner Review Queue"
          subtitle={`${data?.pending_count || 0} events awaiting human decision — low-confidence matches are never auto-accepted`}
        />
        {error && (
          <div className="mx-4 mt-4 border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-md px-4 py-2.5 text-[12px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="divide-y divide-border">
          {(data?.pending || []).length === 0 && (
            <EmptyState title="Queue clear" hint="All events have been reviewed." />
          )}
          {(data?.pending || []).map((p) => (
            <div key={p.event_id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="mono text-[12px] font-bold text-ink">{p.event_id}</span>
                    <StatusBadge status={p.match_status} />
                    {p.trust_score !== null && (
                      <span className="text-[11px] text-muted tabular-nums">Trust {p.trust_score}/100</span>
                    )}
                    {p.activity_id && (
                      <span className="mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        → {p.activity_id}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-ink mt-1.5">{p.event?.sentence}</div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
                    <span>{p.event?.source_type.replace(/_/g, " ")}</span>
                    <span className="mono">{p.event?.timestamp}</span>
                    <span>by {p.event?.reporter_id}</span>
                  </div>
                </div>
                {p.match_status === "CONFLICT_DETECTED" && (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide shrink-0">
                    <AlertTriangle className="w-4 h-4" /> Conflict
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <select
                  value={targets[p.event_id] ?? p.activity_id ?? ""}
                  onChange={(e) => setTargets((t) => ({ ...t, [p.event_id]: e.target.value }))}
                  className="mono text-[11px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink max-w-[180px]"
                  aria-label="Target activity"
                >
                  <option value="">Select target…</option>
                  {(activitiesData?.activities || []).map((a) => (
                    <option key={a.activity_id} value={a.activity_id}>
                      {a.activity_id}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Review comments (optional)"
                  className="flex-1 text-[12px] px-2.5 py-1.5 rounded border border-border bg-surface text-ink placeholder:text-muted"
                  value={comments[p.event_id] || ""}
                  onChange={(e) => setComments((c) => ({ ...c, [p.event_id]: e.target.value }))}
                />
                <Button
                  variant="success"
                  disabled={busy === p.event_id}
                  onClick={() => decide(p, "APPROVED")}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button variant="ghost" disabled={busy === p.event_id} onClick={() => decide(p, "REASSIGNED")}>
                  Reassign
                </Button>
                <Button variant="danger" disabled={busy === p.event_id} onClick={() => decide(p, "REJECTED")}>
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
