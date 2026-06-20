"use client";

import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import {
  type AnalysisResultPayload,
  type CoachFinding,
  type CoachResult,
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
          We&apos;ll email you when it&apos;s ready — or leave this open and
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

          {r.coach_result ? (
            <CoachSection
              coach={r.coach_result}
              evidenceUrls={r.coach_evidence_urls}
              shareUrls={r.coach_share_urls}
            />
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

const COACH_TONE: Record<string, string> = {
  fix: "border-amber-200 bg-amber-50",
  strength: "border-emerald-200 bg-emerald-50",
  info: "border-slate-200 bg-slate-50",
  unavailable: "border-slate-200 bg-slate-50",
};
const COACH_ORDER: Record<string, number> = { fix: 0, strength: 1, info: 2, unavailable: 3 };

function CoachSection({
  coach,
  evidenceUrls,
  shareUrls,
}: {
  coach: CoachResult;
  evidenceUrls: Record<string, string> | null;
  shareUrls: Record<string, string> | null;
}) {
  if (coach.refused) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold">Coach feedback</h2>
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t coach this clip well — film side-on, at or just above
          the waterline, with one swimmer clearly in frame.
        </p>
      </section>
    );
  }
  const findings = coach.results
    .flatMap((c) => c.findings)
    .filter((f) => f.component !== "gate" && f.available)
    .sort((a, b) => (COACH_ORDER[a.severity] ?? 9) - (COACH_ORDER[b.severity] ?? 9));
  if (findings.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-lg font-semibold">Coach feedback</h2>
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
          beta
        </span>
      </div>
      {coach.gate_tier === "borderline" ? (
        <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your camera angle is borderline — film a truer side-on view for sharper
          feedback.
        </p>
      ) : null}
      <div className="space-y-2">
        {findings.map((f, i) => (
          <CoachFindingCard
            key={`${f.component}-${i}`}
            f={f}
            evidenceUrls={evidenceUrls}
            shareUrls={shareUrls}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Automated check, not a human coach. For personalized coaching, swim with
        SwimBuddz Academy.
      </p>
    </section>
  );
}

function CoachFindingCard({
  f,
  evidenceUrls,
  shareUrls,
}: {
  f: CoachFinding;
  evidenceUrls: Record<string, string> | null;
  shareUrls: Record<string, string> | null;
}) {
  const tone = COACH_TONE[f.severity] ?? COACH_TONE.info;
  const drill = typeof f.extra?.drill === "string" ? (f.extra.drill as string) : null;
  const why =
    typeof f.extra?.why_it_matters === "string"
      ? (f.extra.why_it_matters as string)
      : null;
  const ref = f.evidence_frames[0];
  const t = ref?.timestamp_s;
  const label = ref ? `${f.component}:${ref.index}` : null;
  const thumb = ref && evidenceUrls ? evidenceUrls[label as string] : undefined;
  const share = label && shareUrls ? shareUrls[label] : undefined;
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt="Evidence frame from your clip"
            className="h-20 w-28 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{f.observation}</p>
            {t != null ? (
              <span className="shrink-0 text-xs text-slate-400">
                t={t.toFixed(1)}s
              </span>
            ) : null}
          </div>
          {why ? <p className="mt-1 text-sm text-slate-600">{why}</p> : null}
          {drill ? (
            <p className="mt-2 rounded-lg bg-white/70 p-2 text-sm">
              <span className="font-semibold">Drill: </span>
              {drill}
            </p>
          ) : null}
          {share ? (
            <a
              href={share}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline"
            >
              Share this card →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
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
