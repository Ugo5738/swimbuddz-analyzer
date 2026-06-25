"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Maximize2,
  Share2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  type CoachFinding,
  failureMessage,
  fmtTime,
  getPublicAnalysis,
  GUMROAD_CHECKOUT_BASE,
  isSystemFailure,
  PRODUCTS,
  type PublicAnalysisJobDetail,
  retryPublicAnalysis,
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

  // One-click retry of a FAILED job (re-run on the stored clip, free). Throws on
  // failure so the button can fall back to "upload again"; on success we re-poll
  // and the job flips back to analyzing.
  const onRetry = useCallback(async () => {
    if (!token) return;
    await retryPublicAnalysis(jobId, token);
    setError("");
    setDetail(null);
    setLoading(true);
    void poll();
  }, [jobId, token, poll]);

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
        <ResultBody detail={detail} onRetry={onRetry} />
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

function ResultBody({
  detail,
  onRetry,
}: {
  detail: PublicAnalysisJobDetail;
  onRetry?: () => Promise<void>;
}) {
  // Hooks must run before any early return.
  const [view, setView] = useState<"above" | "under">("above");
  const cycles = useMemo(() => buildCycles(detail), [detail]);
  const [openCycle, setOpenCycle] = useState<number | null>(() =>
    defaultOpenCycle(cycles),
  );

  const r = detail.result;
  const coach = r?.coach_result ?? null;
  const isWorking =
    detail.status === "pending" || detail.status === "processing";
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
    return <RefusalCard reason={detail.error_message} onRetry={onRetry} />;
  }

  const findings = coach
    ? coach.results
        .flatMap((c) => c.findings)
        .filter((f) => f.component !== "gate")
    : [];
  const collate = findings.find(
    (f) => typeof f.extra?.recovery_count_hedged === "number",
  );
  const hedged = collate
    ? (collate.extra.recovery_count_hedged as number)
    : null;
  const evidenceUrls = r?.coach_evidence_urls ?? null;
  const clip = detail.annotated_video_url ?? detail.original_video_url ?? null;
  // Fault-first: lead with the coach's ranked verdict, not the cycles. The cycle
  // view is demoted to a "stroke by stroke" evidence lens below.
  const verdict = coach
    ? buildVerdict(detail)
    : { fixes: [], strengths: [], notes: [], cantSee: [] };
  const topFix = verdict.fixes[0]?.observation ?? null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Your freestyle read</h1>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            Coached for{" "}
            {DISCIPLINE_LABEL[detail.discipline] ?? "general technique"}
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
            Still analyzing — more sections appear as each part finishes.
            We&apos;ll email you when it&apos;s done.
          </p>
        ) : null}
        {coach?.gate_tier === "borderline" ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your camera angle is borderline — film a truer side-on view for
            sharper feedback.
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
              />
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Nothing major to fix in what we can see — your visible basics
                look solid. Try another angle or session to go deeper.
              </div>
            )}

            {verdict.strengths.length || verdict.notes.length ? (
              <WhatElse
                strengths={verdict.strengths}
                notes={verdict.notes}
                evidenceUrls={evidenceUrls}
                clip={clip}
              />
            ) : null}

            {verdict.cantSee.length ? (
              <CantSeeNotes notes={verdict.cantSee} />
            ) : null}

            {cycles.length ? (
              <StrokeByStroke
                cycles={cycles}
                openId={openCycle}
                setOpenId={setOpenCycle}
                hedged={hedged}
                evidenceUrls={evidenceUrls}
                clip={clip}
              />
            ) : null}
          </div>

          <div className="mt-6 space-y-4 lg:mt-0 lg:sticky lg:top-6">
            {clip ? <FullClipPlayer clip={clip} /> : null}
            <BuyMore />
          </div>
        </div>
      )}

      <AcademyCTA />
    </div>
  );
}

// Per-clip viewer — a REAL (native) video player inside the coach card, so it behaves
// exactly like YouTube: click the body to play/pause, drag the SEEK BAR (only the bar)
// to scrub, native volume + fullscreen. It opens paused on the coached moment.
//   • expand (⤢): full-screen player looped to the selected moment (the chunk).
//   • hide (◎): collapses THIS clip (only this one) to a one-line "Show clip" stub.
function ClipViewer({
  clip,
  t,
  poster,
  half = 1.25,
  className = "",
}: {
  clip: string | null;
  t: number;
  poster?: string;
  half?: number;
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!clip) {
    // No video to scrub — fall back to the static evidence frame if we have one.
    // eslint-disable-next-line @next/next/no-img-element
    return poster ? (
      <img
        src={poster}
        alt=""
        className={`rounded-lg border border-slate-200 ${className}`}
      />
    ) : null;
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 ${className}`}
      >
        <Eye size={14} /> Show clip · {fmtTime(t)}
      </button>
    );
  }

  return (
    <>
      <div
        className={`group relative overflow-hidden rounded-lg border border-slate-200 bg-black ${className}`}
      >
        {/* Native player: the browser's own controls. The seek bar is the ONLY thing
            that scrubs (drag the line); the body just plays/pauses — exactly YouTube. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={clip}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            // open paused on the coached moment
            const v = e.currentTarget;
            v.currentTime = Math.min(t, v.duration || t);
          }}
          className="block h-auto w-full"
        />
        {/* overlay controls — top-right, clear of the native bar (which sits bottom) */}
        <div className="absolute right-1.5 top-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Watch the selected moment full-screen"
            className="rounded-md bg-black/55 p-1.5 text-white transition hover:bg-black/75"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Hide this clip"
            className="rounded-md bg-black/55 p-1.5 text-white transition hover:bg-black/75"
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>
      {expanded ? (
        <ClipLightbox
          clip={clip}
          t={t}
          half={half}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}

// Full-screen player. Portalled to <body> so it escapes the result page's
// `lg:-translate-x-1/2` ancestor (a transform breaks position:fixed). Native
// <video controls> gives the YouTube-style slider / play / volume / fullscreen.
// By default it LOOPS the selected moment [t-half, t+half] (the chunk Daniel asked
// for); "Play full clip" lifts the clamp to watch the whole swim.
function ClipLightbox({
  clip,
  t,
  half = 1.25,
  onClose,
}: {
  clip: string;
  t: number;
  half?: number;
  onClose: () => void;
}) {
  const vref = useRef<HTMLVideoElement>(null);
  const [full, setFull] = useState(false);
  const start = Math.max(0, t - half);
  const end = t + half;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock background scroll
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Re-anchor to the chunk start whenever we switch back from full-clip.
  useEffect(() => {
    const v = vref.current;
    if (v && !full) v.currentTime = Math.min(start, v.duration || start);
  }, [full, start]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Clip player"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close player"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X size={20} />
      </button>
      <div
        className="flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={vref}
          src={clip}
          controls
          autoPlay
          loop={!full}
          playsInline
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            v.currentTime = full ? 0 : Math.min(start, v.duration || start);
          }}
          onTimeUpdate={(e) => {
            // Keep playback inside the selected moment unless "full clip" is on.
            const v = e.currentTarget;
            if (
              !full &&
              (v.currentTime > end || v.currentTime < start - 0.05)
            ) {
              v.currentTime = start;
            }
          }}
          className="max-h-[80vh] max-w-[92vw] rounded-lg bg-black shadow-2xl"
        />
        <div className="flex items-center gap-3 text-sm text-white/90">
          <span className="tabular-nums">
            {full
              ? "Full swim"
              : `Selected moment · ${fmtTime(start)}–${fmtTime(end)}`}
          </span>
          <button
            type="button"
            onClick={() => setFull((f) => !f)}
            className="rounded-full border border-white/30 px-3 py-1 font-medium hover:bg-white/10"
          >
            {full ? "Just this moment" : "Play full clip"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// The whole swim, top-right — back by request. Native controls so the user can
// watch the full clip continuously (the per-finding ClipViewers are zoomed moments).
function FullClipPlayer({ clip }: { clip: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold">Your full swim</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={clip}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-lg bg-black"
      />
    </section>
  );
}

function TopFixes({
  fixes,
  evidenceUrls,
  clip,
}: {
  fixes: CoachFinding[];
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="font-semibold">Your top fixes</p>
      <p className="mb-3 text-sm text-slate-600">
        In priority order — start at #1.
      </p>
      <div className="space-y-3">
        {fixes.map((f, i) => (
          <FixCard
            key={f.area ?? i}
            n={i + 1}
            f={f}
            evidenceUrls={evidenceUrls}
            clip={clip}
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
}: {
  n: number;
  f: CoachFinding;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
}) {
  const why =
    typeof f.extra?.why_it_matters === "string"
      ? (f.extra.why_it_matters as string)
      : null;
  const drill =
    typeof f.extra?.drill === "string" ? (f.extra.drill as string) : null;
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
        {ref ? (
          <ClipViewer
            clip={clip}
            t={ref.timestamp_s}
            poster={thumb}
            className="mt-2"
          />
        ) : null}
        {drill ? (
          <p className="mt-2 rounded-lg bg-white/70 p-2 text-sm">
            <span className="font-semibold">Drill: </span>
            {drill}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Visibility limits, kept clearly apart from coaching. "Hand entry not visible" is
// the camera's fault, not the swimmer's — showing it next to strengths reads as a
// failing. Neutral styling + copy that names it as an angle limit, not a critique.
function CantSeeNotes({ notes }: { notes: CoachFinding[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <EyeOff size={16} className="text-slate-400" />
        <p className="font-semibold text-slate-700">
          What we couldn&apos;t see clearly
        </p>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Not faults — the camera angle just didn&apos;t show these. A truer
        side-on clip (filmed level with the water, swimmer filling the frame)
        would let us coach them.
      </p>
      <ul className="space-y-1.5">
        {notes.map((f, i) => (
          <li
            key={f.area ?? `${f.component}-${i}`}
            className="flex items-start gap-2 text-sm text-slate-600"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
            {f.observation}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WhatElse({
  strengths,
  notes,
  evidenceUrls,
  clip,
}: {
  strengths: CoachFinding[];
  notes: CoachFinding[];
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
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
        <div className="min-w-0 flex-1">
          <p className="text-sm">{f.observation}</p>
          {ref ? (
            <ClipViewer
              clip={clip}
              t={ref.timestamp_s}
              poster={thumb}
              className="mt-2 max-w-xs"
            />
          ) : null}
        </div>
      </div>
    );
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-2 font-semibold">
        What&apos;s working &amp; worth noting
      </p>
      <div className="space-y-2">
        {strengths.map((f) =>
          row(f, "border-emerald-200 bg-emerald-50", "bg-emerald-500"),
        )}
        {notes.map((f) =>
          row(f, "border-slate-200 bg-slate-50", "bg-slate-400"),
        )}
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
}: {
  cycles: Cycle[];
  openId: number | null;
  setOpenId: (id: number | null) => void;
  hedged: number | null;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
      >
        <ChevronDown
          size={16}
          className={`transition ${show ? "rotate-180" : ""}`}
        />
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
}: {
  cycles: Cycle[];
  openId: number | null;
  setOpenId: (id: number | null) => void;
  hedged: number | null;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
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
                  {c.coachedCount
                    ? `${c.coachedCount} read${c.coachedCount > 1 ? "s" : ""}`
                    : "no read yet"}
                </span>
                {c.coachedCount ? (
                  <Check
                    size={11}
                    strokeWidth={3}
                    className="text-emerald-300"
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {open ? (
        <CycleDetail cycle={open} evidenceUrls={evidenceUrls} clip={clip} />
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
}: {
  cycle: Cycle;
  evidenceUrls: Record<string, string> | null;
  clip: string | null;
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
}: {
  f: CoachFinding;
  label?: string;
  evidenceUrls: Record<string, string> | null;
  shareUrls: Record<string, string> | null;
  clip?: string | null;
}) {
  const sev = SEV[f.severity] ?? SEV.info;
  const why =
    typeof f.extra?.why_it_matters === "string"
      ? (f.extra.why_it_matters as string)
      : null;
  const drill =
    typeof f.extra?.drill === "string" ? (f.extra.drill as string) : null;
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
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.pill}`}
        >
          {sev.label}
        </span>
        {ref ? (
          <span className="text-xs text-slate-600">
            t={ref.timestamp_s.toFixed(1)}s
          </span>
        ) : null}
      </div>
      <p className="font-medium">{f.observation}</p>
      {why ? <p className="mt-1 text-sm text-slate-600">{why}</p> : null}
      {ref ? (
        <ClipViewer
          clip={clip ?? null}
          t={ref.timestamp_s}
          poster={thumb}
          className="mt-2 max-w-sm"
        />
      ) : null}
      {drill ? (
        <p className="mt-2 rounded-lg bg-white/70 p-2 text-sm">
          <span className="font-semibold">Drill: </span>
          {drill}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
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
      <button
        type="button"
        onClick={() => setView("above")}
        className={tab(view === "above")}
      >
        Above water
      </button>
      <button
        type="button"
        onClick={() => setView("under")}
        className={tab(view === "under")}
      >
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
        <span className="font-medium">kick</span> happen below the surface in
        every stroke — a coach in the pool sees what an above-water, side-on
        clip can&apos;t.
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

function RefusalCard({
  reason,
  onRetry,
}: {
  reason: string | null;
  onRetry?: () => Promise<void>;
}) {
  // A system hiccup (capacity/our end) is NOT a clip problem — don't show filming
  // tips, offer a one-click re-run (free). A clip/angle refusal keeps the how-to-film
  // help + a re-upload link (re-running the same bad clip won't help).
  const onUs = isSystemFailure(reason);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    setRetryFailed(false);
    try {
      await onRetry();
    } catch {
      setRetryFailed(true); // fall back to "upload again"
      setRetrying(false);
    }
  };
  const canRetry = onUs && onRetry && !retryFailed;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <h2 className="text-lg font-bold">
        {onUs
          ? "That one's on us — give it another go."
          : "We couldn't coach this clip well — and we won't guess."}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{failureMessage(reason)}</p>
      {onUs ? null : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="mb-1 font-medium">How to film a clip we can read:</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>Side-on, level with the swimmer</li>
            <li>Camera at or just above the waterline</li>
            <li>One swimmer clearly in frame</li>
          </ul>
        </div>
      )}
      {canRetry ? (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {retrying ? (
            <>
              <Loader2 className="animate-spin" size={16} /> Re-running…
            </>
          ) : (
            "Try again"
          )}
        </button>
      ) : (
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
        >
          {onUs ? "Upload again" : "Try another clip"}
        </Link>
      )}
      {retryFailed ? (
        <p className="mt-2 text-xs text-slate-500">
          Couldn&apos;t re-run automatically — please upload your clip again.
        </p>
      ) : null}
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
