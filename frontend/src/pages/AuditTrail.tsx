import { Download } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { AuditEntry } from "../api/types";
import { useApi } from "../hooks";
import { Button, Card, CardHeader, EmptyState, SkeletonRows, downloadCsv } from "../components/ui";
import { AuditTimeline } from "../components/AuditTimeline";
import { TruthStateBar } from "../components/TruthStateBar";

const ACTION_COLORS: Record<string, string> = {
  EVENT_CREATED: "text-blue-600 dark:text-blue-400",
  EVENT_MATCHED: "text-cyan-600 dark:text-cyan-400",
  MATCH_REVIEWED: "text-amber-600 dark:text-amber-400",
  SCHEDULE_UPDATED: "text-emerald-600 dark:text-emerald-400",
  CONFLICT_CREATED: "text-red-600 dark:text-red-400",
  CONFLICT_RESOLVED: "text-emerald-600 dark:text-emerald-400",
  SCENARIO_CREATED: "text-slate-500",
  SCENARIO_RUN: "text-slate-500",
};

export function AuditTrail() {
  const [entityType, setEntityType] = useState("");
  const { data, loading } = useApi(
    () =>
      api.get<{ audit: AuditEntry[] }>(
        `/api/v1/projects/${PROJECT_ID}/audit${entityType ? `?entity_type=${entityType}` : ""}`,
      ),
    [entityType],
  );

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={8} /></Card></div>;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Audit Trail"
          subtitle="Every schedule modification is traceable — append-only, never silently overwritten"
          right={
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="text-[12px] font-semibold px-2 py-1.5 rounded border border-border bg-surface text-ink"
            >
              <option value="">All entities</option>
              <option value="EXECUTION_EVENT">Execution Events</option>
              <option value="SCHEDULE_ACTIVITY">Schedule Activities</option>
              <option value="CONFLICT">Conflicts</option>
              <option value="SCENARIO">Scenarios</option>
            </select>
          }
        />
        <div className="p-4 space-y-4">
          <TruthStateBar active={5} />
          <AuditTimeline entries={data?.audit || []} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Audit Log"
          subtitle={`${data?.audit.length || 0} entries`}
          right={
            <Button
              variant="ghost"
              disabled={!data || data.audit.length === 0}
              onClick={() =>
                downloadCsv(
                  "audit-trail.csv",
                  ["id", "action", "entity_type", "entity_id", "performed_by", "created_at", "reason"],
                  (data?.audit || []).map((a) => [a.id, a.action, a.entity_type, String(a.entity_id), a.performed_by, a.created_at, a.reason || ""]),
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
                <th className="px-4 py-2 font-semibold">Event ID</th>
                <th className="px-4 py-2 font-semibold">Action</th>
                <th className="px-4 py-2 font-semibold">Entity</th>
                <th className="px-4 py-2 font-semibold">User</th>
                <th className="px-4 py-2 font-semibold">Timestamp</th>
                <th className="px-4 py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {(data?.audit || []).length === 0 && (
                <tr>
                  <td colSpan={6}><EmptyState title="No audit entries" /></td>
                </tr>
              )}
              {(data?.audit || []).map((a) => (
                <tr key={a.id} className="border-b border-border/60 hover:bg-surface2">
                  <td className="px-4 py-2 mono text-[11px] font-semibold">{a.id.slice(0, 8)}</td>
                  <td className={`px-4 py-2 text-[11px] font-bold ${ACTION_COLORS[a.action] || "text-ink"}`}>
                    {a.action.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-muted">
                    {a.entity_type} <span className="mono">{String(a.entity_id).slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-2 text-[11px] text-muted">{a.performed_by}</td>
                  <td className="px-4 py-2 mono text-[11px] text-muted">{a.created_at?.slice(0, 19).replace("T", " ")}</td>
                  <td className="px-4 py-2 text-[11px] text-muted max-w-[280px] truncate">{a.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
