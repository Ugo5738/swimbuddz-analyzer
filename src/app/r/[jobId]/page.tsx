"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  EyeOff,
  GraduationCap,
  Loader2,
  PlayCircle,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CoachFinding,
  failureMessage,
  fmtTime,
  getPublicAnalysis,
  GUMROAD_CHECKOUT_BASE,
  PRODUCTS,
  type PublicAnalysisJobDetail,
} from "@/lib/publicAnalyzer";
import {
  buildCycles,
  buildVerdict,
  type Cycle,
  cycleThumb,
  defaultOpenCycle,
} from "@/lib/cycles";
import { DEMO_DETAIL } from "@/lib/demoResult";

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

  const token =
    search.get("guest_token") ||
    (typeof window !== "undefined"
      ? localStorage.getItem(`sbz_analyzer_${jobId}`)
      : null);

  const poll = useCallback(async () => {
    if (jobId === "demo") {
      setDetail(DEMO_DETAIL); // no-backend preview of the redesign
      setLoading(false);
      return;
    }
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
    // Mobile stays in the shared max-w-3xl column; on desktop the result page
    // breaks out wider (centred in the viewport, scrollbar-safe via 92vw) so the
    // two-column read can use the screen instead of a skinny middle strip.
    <div className="lg:relative lg:left-1/2 lg:w-[92vw] lg:max-w-6xl lg:-translate-x-1/2">
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

const DISCIPLINE_LABEL: Record<string, string> = {
  sprint: "Sprint",
  distance: "Distance",
  general: "general technique",
};

const SEV: Record<string, { label: string; tone: string; pill: string }> = {
  fix: {
    label: "Work on this",
    tone: "border-amber-200 bg-amber-50",
    pill: "bg-amber-100 text-amber-800",
  },
  strength: {
    label: "Strength",
    tone: "border-emerald-200 bg-emerald-50",
    pill: "bg-emerald-100 text-emerald-800",
  },
  info: {
    label: "Note",
    tone: "border-slate-200 bg-slate-50",
    pill: "bg-slate-100 text-slate-600",
  },
};

type Marker = { t: number; severity: string; label: string; key: string };

function ResultBody({ detail }: { detail: PublicAnalysisJobDetail }) {
  // Hooks must run before any early return.
  const [view, setView] = useState<"above" | "under">("above");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cycles = useMemo(() => buildCycles(detail), [detail]);
  const [openCycle, setOpenCycle] = useState<number | null>(() =>
    defaultOpenCycle(cycles),
  );
  // Inline (no modal): clicking a read seeks the sticky clip to that moment and
  // brings it into view — read and watch in one place, no scroll-hunting.
  const onEvidence = (_frame: string | undefined, t: number) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = Math.max(0, t);
      void v.play();
    } catch {
      /* autoplay may be blocked — the seek still lands */
    }
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const r = detail.result;
  const coach = r?.coach_result ?? null;
  const isWorking = detail.status === "pending" || detail.status === "processing";
  // Progressive rendering: the worker persists a partial result after each stage,
  // so once any analysis stage has landed we render what's ready (and keep polling
  // for the rest) instead of a blank "analyzing" wait.
  const hasPartial =
    coach != null && coach.results.some((c) => c.component !== "gate");

  if (isWorking && !hasPartial) {
    return (
      <Centered>
        <Loader2 className="animate-spin text-brand-600" size={32} />
        <p className="mt-3 font-medium">
          {detail.status === "pending" ? "Queued" : "Analyzing your stroke…"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          We&apos;ll email you when it&apos;s ready.
        </p>
      </Centered>
    );
  }

  if (detail.status === "failed" || coach?.refused) {
    return <RefusalCard reason={detail.error_message} />;
  }

  const findings = coach
    ? coach.results.flatMap((c) => c.findings).filter((f) => f.component !== "gate")
    : [];
  const collate = findings.find(
    (f) => typeof f.extra?.recovery_count_hedged === "number",
  );
  const hedged = collate ? (collate.extra.recovery_count_hedged as number) : null;
  const evidenceUrls = r?.coach_evidence_urls ?? null;
  const clip = detail.annotated_video_url ?? detail.original_video_url ?? null;
  // Fault-first: lead with the coach's ranked verdict, not the cycles. The cycle
  // view is demoted to a "stroke by stroke" evidence lens below.
  const verdict = coach
    ? buildVerdict(detail)
    : { fixes: [], strengths: [], notes: [] };
  const topFix = verdict.fixes[0]?.observation ?? null;
  // A poster so the heavy clip doesn't auto-download on metered data: reuse a
  // frame we already have.
  const poster = (() => {
    for (const f of [...verdict.fixes, ...verdict.strengths]) {
      const ref = f.evidence_frames[0];
      const k = ref ? `${f.component}:${ref.index}` : null;
      if (k && evidenceUrls?.[k]) return evidenceUrls[k];
    }
    return undefined;
  })();
  // Coached moments → markers on the scrubber. (Borderline clips have their evidence
  // frames stripped by the backend honesty pass, so there are simply no markers.)
  const markers: Marker[] = [];
  for (const f of [...verdict.fixes, ...verdict.strengths, ...verdict.notes]) {
    const ref = f.evidence_frames[0];
    if (ref)
      markers.push({
        t: ref.timestamp_s,
        severity: f.severity,
        label: f.observation,
        key: `${f.component}:${ref.index}`,
      });
  }
  markers.sort((a, b) => a.t - b.t);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Your freestyle read</h1>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            Coached for {DISCIPLINE_LABEL[detail.discipline] ?? "general technique"}
          </span>
          {coach ? (
            <div className="ml-auto">
              <ShareRead topFix={topFix} />
            </div>
          ) : null}
        </div>
        {isWorking ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
            <Loader2 className="animate-spin" size={16} />
            Still analyzing — more sections appear as each part finishes. We&apos;ll
            email you when it&apos;s done.
          </p>
        ) : null}
        {coach?.gate_tier === "borderline" ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your camera angle is borderline — film a truer side-on view for sharper
            feedback.
          </p>
        ) : null}
        {coach ? <ViewSelector view={view} setView={setView} /> : null}
      </div>

      {!coach ? (
        <p className="text-slate-600">
          We finished, but couldn&apos;t produce a coached read for this clip.
        </p>
      ) : view === "under" ? (
        <CantSeeStrip />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
          <div className="space-y-6">
            {verdict.fixes.length ? (
              <TopFixes
                fixes={verdict.fixes}
                evidenceUrls={evidenceUrls}
                clip={clip}
                onEvidence={onEvidence}
              />
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Nothing major to fix in what we can see — your visible basics look
                solid. Try another angle or session to go deeper.
              </div>
            )}

            {verdict.strengths.length || verdict.notes.length ? (
              <WhatElse
                strengths={verdict.strengths}
                notes={verdict.notes}
                evidenceUrls={evidenceUrls}
                clip={clip}
                onEvidence={onEvidence}
              />
            ) : null}

            {cycles.length ? (
              <StrokeByStroke
                cycles={cycles}
                openId={openCycle}
                setOpenId={setOpenCycle}
                hedged={hedged}
                evidenceUrls={evidenceUrls}
                clip={clip}
                onEvidence={onEvidence}
              />
            ) : null}
          </div>

          <div className="mt-6 space-y-4 lg:mt-0 lg:sticky lg:top-6">
            {clip ? (
              <VideoScrubber
                clip={clip}
                poster={poster}
                markers={markers}
                videoRef={videoRef}
              />
            ) : null}
            <BuyMore />
          </div>
        </div>
      )}

      <AcademyCTA />
    </div>
  );
}

function VideoScrubber({
  clip,
  poster,
  markers,
  videoRef,
}: {
  clip: string;
  poster?: string;
  markers: Marker[];
  videoRef: React.RefObject<HTMLVideoElement>;
}) {
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const pct = (t: number) =>
    duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0;
  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    void v.play();
  };
  const dotColor = (sev: string) =>
    sev === "fix"
      ? "bg-amber-500"
      : sev === "strength"
        ? "bg-emerald-500"
        : "bg-slate-400";
  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={clip}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        className="w-full rounded-2xl border border-slate-200 bg-black"
      />
      {markers.length ? (
        <div className="px-1">
          <div
            className="relative h-6 cursor-pointer"
            onClick={(e) => {
              if (duration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - rect.left) / rect.width) * duration);
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
            <div
              className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-400"
              style={{ width: `${pct(current)}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow"
              style={{ left: `${pct(current)}%` }}
            />
            {markers.map((m) => (
              <button
                key={m.key}
                type="button"
                title={`${fmtTime(m.t)} — ${m.label}`}
                aria-label={`Jump to ${fmtTime(m.t)} — ${m.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  seek(m.t);
                }}
                className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition hover:scale-150 ${dotColor(m.severity)}`}
                style={{ left: `${pct(m.t)}%` }}
              />
            ))}
          </div>
          <p className="mt-1 text-center text-xs text-slate-400">
            {markers.length} coached {markers.length === 1 ? "moment" : "moments"} —
            tap a dot (or a read) to jump
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TopFixes({
  fixes,
  evidenceUrls,
  clip,
  onEvidence,
}: {
  fixes: CoachFinding[];
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="font-semibold">Your top fixes</p>
      <p className="mb-3 text-sm text-slate-600">In priority order — start at #1.</p>
      <div className="space-y-3">
        {fixes.map((f, i) => (
          <FixCard
            key={f.area ?? i}
            n={i + 1}
            f={f}
            evidenceUrls={evidenceUrls}
            clip={clip}
            onEvidence={onEvidence}
          />
        ))}
      </div>
    </section>
  );
}

function FixCard({
  n,
  f,
  evidenceUrls,
  clip,
  onEvidence,
}: {
  n: number;
  f: CoachFinding;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  const why =
    typeof f.extra?.why_it_matters === "string"
      ? (f.extra.why_it_matters as string)
      : null;
  const drill = typeof f.extra?.drill === "string" ? (f.extra.drill as string) : null;
  const ref = f.evidence_frames[0];
  const key = ref ? `${f.component}:${ref.index}` : null;
  const thumb = key && evidenceUrls ? evidenceUrls[key] : undefined;
  return (
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{f.observation}</p>
        {why ? <p className="mt-0.5 text-sm text-slate-600">{why}</p> : null}
        <div className="mt-2 flex items-start gap-3">
          {thumb ? (
            <button
              type="button"
              onClick={() => ref && onEvidence(thumb, ref.timestamp_s)}
              className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-amber-200"
              aria-label="Watch this moment in your clip"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white opacity-0 transition hover:opacity-100">
                <PlayCircle size={22} />
              </span>
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            {drill ? (
              <p className="rounded-lg bg-white/70 p-2 text-sm">
                <span className="font-semibold">Drill: </span>
                {drill}
              </p>
            ) : null}
            {ref && clip ? (
              <button
                type="button"
                onClick={() => onEvidence(thumb, ref.timestamp_s)}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
              >
                <PlayCircle size={14} /> Watch this moment
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatElse({
  strengths,
  notes,
  evidenceUrls,
  clip,
  onEvidence,
}: {
  strengths: CoachFinding[];
  notes: CoachFinding[];
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  const row = (f: CoachFinding, tone: string, dot: string) => {
    const ref = f.evidence_frames[0];
    const key = ref ? `${f.component}:${ref.index}` : null;
    const thumb = key && evidenceUrls ? evidenceUrls[key] : undefined;
    return (
      <div
        key={`${f.component}-${f.area}`}
        className={`flex items-start gap-2 rounded-lg border p-3 ${tone}`}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <p className="text-sm">{f.observation}</p>
          {ref && clip ? (
            <button
              type="button"
              onClick={() => onEvidence(thumb, ref.timestamp_s)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
            >
              <PlayCircle size={12} /> Watch this moment
            </button>
          ) : null}
        </div>
      </div>
    );
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-2 font-semibold">What&apos;s working &amp; worth noting</p>
      <div className="space-y-2">
        {strengths.map((f) => row(f, "border-emerald-200 bg-emerald-50", "bg-emerald-500"))}
        {notes.map((f) => row(f, "border-slate-200 bg-slate-50", "bg-slate-400"))}
      </div>
    </section>
  );
}

function StrokeByStroke({
  cycles,
  openId,
  setOpenId,
  hedged,
  evidenceUrls,
  clip,
  onEvidence,
}: {
  cycles: Cycle[];
  openId: number | null;
  setOpenId: (id: number | null) => void;
  hedged: number | null;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
      >
        <ChevronDown size={16} className={`transition ${show ? "rotate-180" : ""}`} />
        {show ? "Hide stroke-by-stroke evidence" : "See it stroke by stroke"}
      </button>
      {show ? (
        <div className="mt-2">
          <CycleSpine
            cycles={cycles}
            openId={openId}
            setOpenId={setOpenId}
            hedged={hedged}
            evidenceUrls={evidenceUrls}
            clip={clip}
            onEvidence={onEvidence}
          />
        </div>
      ) : null}
    </div>
  );
}

function CycleSpine({
  cycles,
  openId,
  setOpenId,
  hedged,
  evidenceUrls,
  clip,
  onEvidence,
}: {
  cycles: Cycle[];
  openId: number | null;
  setOpenId: (id: number | null) => void;
  hedged: number | null;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  const open = cycles.find((c) => c.id === openId) ?? null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="font-semibold">Your recovery, stroke by stroke</p>
      <p className="mb-3 text-xs text-slate-500">
        ~{hedged ?? cycles.length} over-water recoveries (approximate) — the one
        thing that changes stroke to stroke. Tap one to see its elbow read.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {cycles.map((c) => {
          const isOpen = openId === c.id;
          const thumb = cycleThumb(c, evidenceUrls);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(isOpen ? null : c.id)}
              aria-pressed={isOpen}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border text-left transition ${
                isOpen
                  ? "border-brand-500 ring-2 ring-brand-300"
                  : c.coachedCount
                    ? "border-emerald-300 hover:border-brand-400"
                    : "border-slate-200 hover:border-brand-300"
              }`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt={`Cycle at ${fmtTime(c.t)}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-sky-100 to-sky-300" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <span className="absolute left-1.5 top-1 text-[11px] font-semibold text-white drop-shadow-sm">
                {fmtTime(c.t)}
              </span>
              <span className="absolute inset-x-1.5 bottom-1 flex items-center justify-between text-[10px] font-medium text-white">
                <span className="drop-shadow-sm">
                  {c.coachedCount ? `${c.coachedCount} read${c.coachedCount > 1 ? "s" : ""}` : "no read yet"}
                </span>
                {c.coachedCount ? (
                  <Check size={11} strokeWidth={3} className="text-emerald-300" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {open ? (
        <CycleDetail
          cycle={open}
          evidenceUrls={evidenceUrls}
          clip={clip}
          onEvidence={onEvidence}
        />
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Tap a cycle above to see what the camera caught in it.
        </p>
      )}
    </section>
  );
}

function CycleDetail({
  cycle,
  evidenceUrls,
  clip,
  onEvidence,
}: {
  cycle: Cycle;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  const reads = cycle.subReads.filter((s) => s.finding);
  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Recovery at {fmtTime(cycle.t)}
      </p>
      {reads.length ? (
        <div className="space-y-2">
          {reads.map((sr) => (
            <FindingCard
              key={sr.aspect}
              f={sr.finding as CoachFinding}
              label={sr.label}
              evidenceUrls={evidenceUrls}
              shareUrls={null}
              clip={clip}
              onEvidence={onEvidence}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          We couldn&apos;t read a clear recovery in this stroke.
        </p>
      )}
    </div>
  );
}

function FindingCard({
  f,
  label,
  evidenceUrls,
  shareUrls,
  clip,
  onEvidence,
}: {
  f: CoachFinding;
  label?: string;
  evidenceUrls: Record<string, string> | null;
  shareUrls: Record<string, string> | null;
  clip?: string | null;
  onEvidence?: (frame: string | undefined, t: number) => void;
}) {
  const sev = SEV[f.severity] ?? SEV.info;
  const why =
    typeof f.extra?.why_it_matters === "string"
      ? (f.extra.why_it_matters as string)
      : null;
  const drill = typeof f.extra?.drill === "string" ? (f.extra.drill as string) : null;
  const ref = f.evidence_frames[0];
  const key = ref ? `${f.component}:${ref.index}` : null;
  const thumb = key && evidenceUrls ? evidenceUrls[key] : undefined;
  const share = key && shareUrls ? shareUrls[key] : undefined;
  const lowConf = f.confidence > 0 && f.confidence <= 0.5;
  return (
    <div className={`rounded-lg border p-3 ${sev.tone}`}>
      {label ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
      ) : null}
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.pill}`}>
          {sev.label}
        </span>
        {ref ? (
          <span className="text-xs text-slate-600">t={ref.timestamp_s.toFixed(1)}s</span>
        ) : null}
      </div>
      <div className="flex items-start gap-3">
        {thumb ? (
          <button
            type="button"
            onClick={() => ref && onEvidence?.(thumb, ref.timestamp_s)}
            className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200"
            aria-label="View this moment in your clip"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt="Evidence frame from your clip"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white opacity-0 transition hover:opacity-100">
              <PlayCircle size={22} />
            </span>
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{f.observation}</p>
          {why ? <p className="mt-1 text-sm text-slate-600">{why}</p> : null}
          {drill ? (
            <p className="mt-2 rounded-lg bg-white/70 p-2 text-sm">
              <span className="font-semibold">Drill: </span>
              {drill}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {ref && clip && onEvidence ? (
              <button
                type="button"
                onClick={() => onEvidence(thumb, ref.timestamp_s)}
                className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
              >
                <PlayCircle size={13} /> Watch this moment
              </button>
            ) : null}
            {share ? (
              <a
                href={share}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
              >
                <Share2 size={13} /> Share this card
              </a>
            ) : null}
            {lowConf ? (
              <span className="text-slate-600">low-confidence read</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewSelector({
  view,
  setView,
}: {
  view: "above" | "under";
  setView: (v: "above" | "under") => void;
}) {
  const tab = (active: boolean) =>
    active
      ? "rounded-md bg-white px-3 py-1 font-medium text-slate-800 shadow-sm"
      : "rounded-md px-3 py-1 text-slate-500";
  return (
    <div className="mt-3 inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
      <button type="button" onClick={() => setView("above")} className={tab(view === "above")}>
        Above water
      </button>
      <button type="button" onClick={() => setView("under")} className={tab(view === "under")}>
        Underwater
      </button>
    </div>
  );
}

const AREA_SHORT: Record<string, string> = {
  body_line: "body line",
  recovery_elbow: "elbow",
  head_breath: "head",
  entry_reach: "entry",
};

function CantSeeStrip() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <EyeOff size={18} className="text-slate-400" />
        <span className="font-medium text-slate-600">
          Underwater — the camera can&apos;t see this
        </span>
        <span className="ml-auto text-xs text-slate-500">every cycle</span>
      </div>
      <p className="text-sm text-slate-600">
        Your <span className="font-medium">catch &amp; pull</span> and your{" "}
        <span className="font-medium">kick</span> happen below the surface in every
        stroke — a coach in the pool sees what an above-water, side-on clip can&apos;t.
      </p>
      <a
        href="https://swimbuddz.com/academy"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
      >
        <GraduationCap size={15} /> Get eyes underwater → SwimBuddz Academy
      </a>
    </div>
  );
}

function RefusalCard({ reason }: { reason: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <h2 className="text-lg font-bold">
        We couldn&apos;t coach this clip well — and we won&apos;t guess.
      </h2>
      <p className="mt-2 text-sm text-slate-600">{failureMessage(reason)}</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="mb-1 font-medium">How to film a clip we can read:</p>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>Side-on, level with the swimmer</li>
          <li>Camera at or just above the waterline</li>
          <li>One swimmer clearly in frame</li>
        </ul>
      </div>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
      >
        Try another clip
      </Link>
    </div>
  );
}

function ShareRead({ topFix }: { topFix: string | null }) {
  const onShare = async () => {
    const url =
      typeof window !== "undefined"
        ? window.location.href
        : "https://analyzer.swimbuddz.com";
    const text = topFix
      ? `I just got my freestyle stroke analysed by SwimBuddz Stroke Lab — my #1 fix: "${topFix}" Get your free stroke read:`
      : "I just got my freestyle stroke analysed by SwimBuddz Stroke Lab. Get your free stroke read:";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "My Stroke Lab read", text, url });
        return;
      } catch {
        /* user cancelled — fall through to WhatsApp */
      }
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  return (
    <button
      type="button"
      onClick={onShare}
      title="Share my read"
      aria-label="Share my read"
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
    >
      <Share2 size={16} /> Share
    </button>
  );
}

function BuyMore() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-semibold">Got another clip?</p>
      <p className="mt-1 text-sm text-slate-600">
        Analyse your next session — credit packs from $6.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRODUCTS.map((p) => (
          <a
            key={p.permalink}
            href={`${GUMROAD_CHECKOUT_BASE}${p.permalink}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 hover:border-brand-300"
          >
            <span className="font-semibold">{p.label}</span> · {p.credits}{" "}
            {p.credits > 1 ? "clips" : "clip"} · ${p.priceUsd}
          </a>
        ))}
      </div>
    </div>
  );
}

function AcademyCTA() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-5">
      <GraduationCap size={28} className="shrink-0 text-brand-600" />
      <p className="text-sm text-brand-800">
        <span className="font-semibold">
          This is an automated check, not a human coach.
        </span>{" "}
        For eyes-on, personalised coaching — including the bits the camera
        can&apos;t see — come swim with{" "}
        <a
          href="https://swimbuddz.com/academy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline"
        >
          SwimBuddz Academy
        </a>
        .
      </p>
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
