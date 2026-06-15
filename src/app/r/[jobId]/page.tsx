"use client";

import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import {
  type AnalysisResultPayload,
  failureMessage,
  fmtTime,
  getPublicAnalysis,
  type Observation,
  type PublicAnalysisJobDetail,
} from "@/lib/publicAnalyzer";

const POLL_MS = 15_000;
const ACTIVE = new Set(["pending", "processing"]);

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <Centered>
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </Centered>
      }
    >
      <ResultInner />
    </Suspense>
  );
}

function ResultInner() {
  const params = useParams<{ jobId: string }>();
  const search = useSearchParams();
  const jobId = params.jobId;

  const [detail, setDetail] = useState<PublicAnalysisJobDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Token: the in-session ?guest_token=, else localStorage from submit. (The
  // emailed magic-link ?t= JWT is wired in a later phase.)
  const token =
    search.get("guest_token") ||
    (typeof window !== "undefined"
      ? localStorage.getItem(`sbz_analyzer_${jobId}`)
      : null);

  const poll = useCallback(async () => {
    if (!token) {
      setError("missing-token");
      setLoading(false);
      return;
    }
    try {
      const d = await getPublicAnalysis(jobId, token);
      setDetail(d);
      setLoading(false);
      if (ACTIVE.has(d.status)) {
        timer.current = setTimeout(poll, POLL_MS);
      }
    } catch {
      setError("not-found");
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    void poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={16} /> Analyze another clip
      </Link>

      {loading ? (
        <Centered>
          <Loader2 className="animate-spin text-brand-600" size={32} />
          <p className="mt-3 text-slate-600">Loading your analysis…</p>
        </Centered>
      ) : error ? (
        <Centered>
          <AlertTriangle className="text-amber-500" size={32} />
          <p className="mt-3 font-medium">
            {error === "missing-token"
              ? "We can't find your access to this result."
              : "This analysis isn't available."}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Open the link from your email, or start a new analysis.
          </p>
        </Centered>
      ) : detail ? (
        <ResultBody detail={detail} />
      ) : null}
    </div>
  );
}

function ResultBody({ detail }: { detail: PublicAnalysisJobDetail }) {
  if (detail.status === "pending" || detail.status === "processing") {
    return (
      <Centered>
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <p className="mt-3 font-medium">
          {detail.status === "pending" ? "Queued" : "Analyzing your stroke…"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          This takes a few hours. We&apos;ll email you — or leave this open and
          it&apos;ll refresh itself.
        </p>
      </Centered>
    );
  }

  if (detail.status === "failed") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={32} />
        <h2 className="text-lg font-bold">We couldn&apos;t analyze this one</h2>
        <p className="mt-2 text-sm text-slate-600">
          {failureMessage(detail.error_message)}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Try another clip
        </Link>
      </div>
    );
  }

  const r = detail.result;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your freestyle analysis</h1>

      {r ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              label="Stroke rate"
              value={r.stroke_rate_spm != null ? r.stroke_rate_spm.toFixed(0) : "—"}
              unit="spm"
            />
            <Metric
              label="Body roll"
              value={
                r.body_roll_proxy_degrees != null
                  ? r.body_roll_proxy_degrees.toFixed(0)
                  : "—"
              }
              unit="°"
            />
            <Metric label="Breathing" value={breathLabel(r)} unit="" />
            <Metric
              label="Tracking"
              value={`${Math.round(r.pose_detection_rate * 100)}`}
              unit="%"
            />
          </div>

          {r.summary_text ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
              {r.summary_text}
            </p>
          ) : null}

          {detail.annotated_video_url ? (
            <video
              src={detail.annotated_video_url}
              controls
              playsInline
              className="w-full rounded-2xl border border-slate-200 bg-black"
            />
          ) : null}

          {r.observations.length > 0 ? (
            <section>
              <h2 className="mb-2 text-lg font-semibold">What we noticed</h2>
              <div className="space-y-2">
                {r.observations.map((o) => (
                  <ObservationRow key={o.key} o={o} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-slate-600">Your report is ready but has no metrics.</p>
      )}
    </div>
  );
}

function breathLabel(r: AnalysisResultPayload): string {
  const l = r.breath_count_left;
  const rt = r.breath_count_right;
  if (l == null && rt == null) return "—";
  return `${l ?? 0}/${rt ?? 0}`;
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">
        {value}
        <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

const TONE: Record<Observation["severity"], string> = {
  good: "border-emerald-200 bg-emerald-50",
  suggestion: "border-amber-200 bg-amber-50",
  unavailable: "border-slate-200 bg-slate-50",
};

function ObservationRow({ o }: { o: Observation }) {
  return (
    <div className={`rounded-xl border p-4 ${TONE[o.severity]}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{o.title}</span>
        {o.timestamp_s != null ? (
          <span className="text-xs text-slate-400">@ {fmtTime(o.timestamp_s)}</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-600">{o.detail}</p>
      {o.drill ? (
        <div className="mt-2 rounded-lg bg-white/70 p-3 text-sm">
          <div className="font-medium">Drill: {o.drill.title}</div>
          <p className="text-slate-600">{o.drill.how}</p>
        </div>
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
      {children}
    </div>
  );
}
