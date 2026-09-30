import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { EventListItem, Report } from "../api/types";
import { useApi } from "../hooks";
import { Button, Card, CardHeader, EmptyState, SkeletonRows, StatusBadge, downloadCsv } from "../components/ui";

export function FieldReports() {
  const { data, loading } = useApi(() => api.get<{ reports: Report[] }>(`/api/v1/projects/${PROJECT_ID}/reports`));
  const [selected, setSelected] = useState<Report | null>(null);
  const { data: eventsData } = useApi(
    () => api.get<{ events: EventListItem[] }>(`/api/v1/projects/${PROJECT_ID}/events`),
    [selected?.id],
  );

  const linkedEvents = selected
    ? (eventsData?.events || []).filter((e) => e.event.evidence_id === selected.id)
    : [];

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={8} /></Card></div>;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Field Reports"
          subtitle={`${data?.reports.length || 0} source documents ingested`}
          right={
            <Button
              variant="ghost"
              disabled={!data || data.reports.length === 0}
              onClick={() =>
                downloadCsv(
                  "field-reports.csv",
                  ["id", "report_type", "report_date", "reported_by", "processing_status"],
                  (data?.reports || []).map((r) => [r.id, r.report_type, r.report_date, r.reported_by, r.processing_status]),
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
                <th className="px-4 py-2 font-semibold">Report ID</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Reported By</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Content</th>
              </tr>
            </thead>
            <tbody>
              {(data?.reports || []).map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-border/60 cursor-pointer transition-colors ${
                    selected?.id === r.id ? "bg-blue-50/60 dark:bg-blue-500/5" : "hover:bg-surface2"
                  }`}
                  onClick={() => setSelected(r)}
                >
                  <td className="px-4 py-2 mono text-[11px] font-semibold">{r.id}</td>
                  <td className="px-4 py-2 text-[11px] font-medium">{r.report_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 mono text-[11px] text-muted">{r.report_date}</td>
                  <td className="px-4 py-2 text-[11px] text-muted">{r.reported_by}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.processing_status} /></td>
                  <td className="px-4 py-2 max-w-[320px] truncate text-muted">{r.raw_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <Card>
          <CardHeader title="Report Detail" subtitle={selected.file_name} />
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">Raw Field Text</div>
              <div className="border border-border rounded-md bg-surface2 p-4 text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                {selected.raw_text}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div className="border border-border rounded p-2">
                  <div className="text-muted text-[10px] uppercase tracking-widest">Type</div>
                  <div className="font-semibold mt-0.5">{selected.report_type.replace(/_/g, " ")}</div>
                </div>
                <div className="border border-border rounded p-2">
                  <div className="text-muted text-[10px] uppercase tracking-widest">Reporter</div>
                  <div className="font-semibold mt-0.5">{selected.reported_by}</div>
                </div>
                <div className="border border-border rounded p-2">
                  <div className="text-muted text-[10px] uppercase tracking-widest">Date</div>
                  <div className="font-semibold mt-0.5 mono">{selected.report_date}</div>
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                Extracted Events ({linkedEvents.length})
              </div>
              {linkedEvents.length === 0 && <EmptyState title="No events extracted" hint="This report has not been processed by the engine." />}
              <div className="space-y-2">
                {linkedEvents.map((e) => (
                  <div key={e.event.event_id} className="border border-border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[11px] font-semibold">{e.event.event_id}</span>
                      <StatusBadge status={e.link.match_status} />
                    </div>
                    <div className="text-[12px] text-ink mt-1.5">{e.event.sentence}</div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {e.event.event_type}
                      </span>
                      <span>Progress: {e.event.progress_percent !== null ? `${e.event.progress_percent}%` : "—"}</span>
                      <span>Confidence: {(e.event.extraction_confidence * 100).toFixed(0)}%</span>
                      {e.event.resolved_activity_id && (
                        <span className="mono font-semibold text-blue-600 dark:text-blue-400">
                          → {e.event.resolved_activity_id}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
