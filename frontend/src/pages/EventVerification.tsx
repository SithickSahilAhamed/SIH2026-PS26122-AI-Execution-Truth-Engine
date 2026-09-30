import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { api, PROJECT_ID } from "../api/client";
import type { EventListItem, MatchCandidate } from "../api/types";
import { useApi } from "../hooks";
import { Card, CardHeader, EmptyState, FactTag, SkeletonRows, StatusBadge } from "../components/ui";
import { TrustDecision, TrustScore } from "../components/TrustScore";
import { TruthStateBar } from "../components/TruthStateBar";

function CandidateRow({ candidate, rank }: { candidate: MatchCandidate; rank: number }) {
  const e = candidate.explanation;
  const matchedSignals = [
    e.explicit_id_match && "activity ID",
    e.asset_match && "asset ID",
    e.discipline_match && "discipline",
    e.location_match && "location",
  ].filter(Boolean);
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-[10px] font-bold text-muted border border-border rounded px-1.5 py-0.5">
            #{rank}
          </span>
          <span className="mono text-[12px] font-bold text-ink">{candidate.activity_code}</span>
          <span className="text-[11px] text-muted truncate">{candidate.activity_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted">Match</span>
          <span className={`text-[15px] font-bold tabular-nums ${candidate.score >= 90 ? "text-emerald-600 dark:text-emerald-400" : candidate.score >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
            {candidate.score}%
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {e.explicit_id_match && <SignalTag ok label="Activity ID" />}
        {e.asset_match && <SignalTag ok label="Asset ID" />}
        {e.discipline_match && <SignalTag ok label="Discipline" />}
        {e.location_match && <SignalTag ok label="Location" />}
        {e.temporal_consistency ? <SignalTag ok label="Date Consistent" /> : <SignalTag ok={false} label="Date Inconsistent" />}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/30">
          Semantic {(e.semantic_similarity * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-2 text-[11px] text-muted leading-relaxed">
        Ranked #{rank} because it matched on {matchedSignals.length > 0 ? matchedSignals.join(", ") : "semantic similarity"}
        {e.temporal_consistency ? " with a consistent date window" : " despite an inconsistent date window"} and
        {(e.semantic_similarity * 100).toFixed(0)}% semantic similarity.
      </div>
    </div>
  );
}

function SignalTag({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">
      <CheckCircle2 className="w-3 h-3" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30">
      <XCircle className="w-3 h-3" /> {label}
    </span>
  );
}

export function EventVerification() {
  const { data, loading } = useApi(() => api.get<{ events: EventListItem[] }>(`/api/v1/projects/${PROJECT_ID}/events`));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (data?.events || []).find((e) => e.event.event_id === selectedId) || data?.events[0];
  const eventId = selected?.event.event_id;

  const { data: detail } = useApi(
    () => api.get<{ event: EventListItem["event"]; link: EventListItem["link"]; candidates: MatchCandidate[] }>(`/api/v1/events/${eventId}`),
    [eventId],
  );
  const { data: trust } = useApi(
    () =>
      api.get<{
        total_score: number;
        components: { evidence_agreement: number; activity_match: number; temporal_consistency: number; source_reliability: number; historical_consistency: number };
        decision: string;
        explanation: string[];
        conflict: { spread_percent: number; agreement_percent: number; description: string } | null;
      }>(`/api/v1/events/${eventId}/trust`),
    [eventId],
  );

  if (loading) return <div className="p-6"><Card><SkeletonRows rows={6} /></Card></div>;
  if (!data || data.events.length === 0) {
    return <div className="p-6"><Card><EmptyState title="No events" hint="Seed the demo dataset or upload a field report." /></Card></div>;
  }

  const ev = selected!.event;

  return (
    <div className="p-6 space-y-4 anim-fade-up">
      <Card>
        <CardHeader
          title="Event Verification"
          subtitle="Original field report → extracted structured event → candidate L5/L6 activities → trust"
          right={<TruthStateBar active={4} />}
        />
        <div className="p-4">
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {data.events.slice(0, 12).map((e) => (
              <button
                key={e.event.event_id}
                onClick={() => setSelectedId(e.event.event_id)}
                className={`mono text-[10px] font-semibold px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                  e.event.event_id === ev.event_id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-border text-muted hover:text-ink"
                }`}
              >
                {e.event.event_id}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                Original Field Report <FactTag type="FACT" />
              </div>
              <div className="border border-border rounded-md bg-surface2 p-4 text-[13px] leading-relaxed text-ink whitespace-pre-wrap min-h-[120px]">
                {ev.raw_text}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                <span className="font-semibold">{ev.source_type.replace(/_/g, " ")}</span>
                <span className="mono">{ev.timestamp}</span>
                <span>by {ev.reporter_id}</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                Extracted Structured Event <FactTag type="INFERENCE" />
              </div>
              <div className="border border-border rounded-md p-4 min-h-[120px]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  <Field label="Discipline" value={ev.discipline || "—"} />
                  <Field label="Activity Type" value={ev.event_type} />
                  <Field label="Asset" value={ev.mentioned_asset_id || "—"} mono />
                  <Field label="Line" value={ev.line_number || "—"} />
                  <Field label="Location" value={ev.location || "—"} />
                  <Field label="Progress" value={ev.progress_percent !== null ? `${ev.progress_percent}%` : "—"} />
                  <Field label="Extraction Confidence" value={`${(ev.extraction_confidence * 100).toFixed(0)}%`} />
                  <Field label="Resolution" value={ev.resolution_path.replace(/_/g, " ")} />
                </div>
                {ev.extraction_notes.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {ev.extraction_notes.map((n, i) => (
                      <div key={i} className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" /> {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Top 3 Candidate L5/L6 Activities" subtitle="Hybrid matching: structured signals + semantic similarity" />
          <div className="p-4 space-y-2">
            {(detail?.candidates || []).slice(0, 3).map((c, i) => (
              <CandidateRow key={c.activity_id} candidate={c} rank={i + 1} />
            ))}
            {(!detail || detail.candidates.length === 0) && (
              <EmptyState title="No candidates" hint="This claim could not be matched to any schedule activity." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Execution Trust Score" subtitle="Explainable confidence — not generic AI confidence" />
          <div className="p-4">
            {trust ? (
              <div className="space-y-4">
                <TrustScore score={trust.total_score} breakdown={trust.components} size="lg" />
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <TrustDecision decision={trust.decision} />
                  <StatusBadge status={selected!.link.match_status} />
                </div>
                {trust.conflict && (
                  <div className="border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 rounded-md p-3">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4" /> Conflict Detected
                    </div>
                    <div className="text-[12px] text-red-700/90 dark:text-red-300/90 mt-1">{trust.conflict.description}</div>
                    <div className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1">
                      Evidence agreement: {trust.conflict.agreement_percent}% — planner review required
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
                    Why the engine decided this
                  </div>
                  <ul className="space-y-1.5">
                    {trust.explanation.map((line, i) => (
                      <li key={i} className="text-[12px] text-ink flex items-start gap-2">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-600 shrink-0" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <EmptyState title="No trust calculation" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-[12px] font-semibold text-ink mt-0.5 ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}
