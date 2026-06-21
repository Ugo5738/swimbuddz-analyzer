"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  EyeOff,
  GraduationCap,
  Info,
  Loader2,
  Lock,
  PlayCircle,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CoachFinding,
  failureMessage,
  fmtTime,
  getPublicAnalysis,
  type PublicAnalysisJobDetail,
} from "@/lib/publicAnalyzer";
import {
  buildCycles,
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

function ResultBody({ detail }: { detail: PublicAnalysisJobDetail }) {
  // Hooks must run before any early return.
  const [viewer, setViewer] = useState<{ frame?: string; t: number } | null>(null);
  const [view, setView] = useState<"coach" | "timeline">("coach");
  const cycles = useMemo(() => buildCycles(detail), [detail]);
  const [openCycle, setOpenCycle] = useState<number | null>(() =>
    defaultOpenCycle(cycles),
  );
  const onEvidence = (frame: string | undefined, t: number) => setViewer({ frame, t });

  if (detail.status === "pending" || detail.status === "processing") {
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

  const r = detail.result;
  const coach = r?.coach_result ?? null;

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
  const consistency = findings.find((f) => f.area === "consistency") ?? null;
  const clip = detail.annotated_video_url ?? detail.original_video_url ?? null;
  // The "start here" steer: the highest-priority fix across all aspects, surfaced
  // as a pointer into the cycle that holds it (not a duplicated card).
  const rankOf = (f: CoachFinding) =>
    typeof f.extra?.rank === "number" ? (f.extra.rank as number) : 9;
  const steer =
    [...findings]
      .filter((f) => f.severity === "fix" && f.area !== "consistency")
      .sort((a, b) => rankOf(a) - rankOf(b))[0] ?? null;
  const steerCycleId = steer
    ? (cycles.find((c) => c.subReads.some((s) => s.finding === steer))?.id ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Your freestyle read</h1>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            Coached for {DISCIPLINE_LABEL[detail.discipline] ?? "general technique"}
          </span>
        </div>
        {hedged != null ? (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
            <Info size={14} /> ~{hedged} {hedged === 1 ? "cycle" : "cycles"} seen ·
            approximate
          </p>
        ) : null}
        {coach?.gate_tier === "borderline" ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your camera angle is borderline — film a truer side-on view for sharper
            feedback.
          </p>
        ) : null}
        <ViewSelector
          view={view}
          setView={setView}
          timelineUnlocked={detail.timeline_unlocked}
        />
      </div>

      {view === "timeline" && detail.timeline_unlocked ? (
        <TimelineView
          clip={clip}
          findings={findings}
          evidenceUrls={evidenceUrls}
          onEvidence={onEvidence}
        />
      ) : (
        <>
          {steer ? (
            <StartHerePointer
              steer={steer}
              onJump={() =>
                steerCycleId != null ? setOpenCycle(steerCycleId) : undefined
              }
            />
          ) : null}

          {coach && cycles.length ? (
            <CycleSpine
              cycles={cycles}
              openId={openCycle}
              setOpenId={setOpenCycle}
              hedged={hedged}
              evidenceUrls={evidenceUrls}
              clip={clip}
              onEvidence={onEvidence}
            />
          ) : coach ? (
            <p className="text-slate-600">
              We coached your clip, but couldn&apos;t pick out distinct stroke
              cycles — try a steadier, closer side-on angle.
            </p>
          ) : (
            <p className="text-slate-600">
              We finished, but couldn&apos;t produce a coached read for this clip.
            </p>
          )}

          <CantSeeStrip />

          {consistency ? <ConsistencyCard f={consistency} /> : null}

          {clip ? (
            <video
              src={clip}
              controls
              playsInline
              className="w-full rounded-2xl border border-slate-200 bg-black"
            />
          ) : null}
        </>
      )}

      <AcademyCTA />

      {viewer ? (
        <EvidenceViewer
          frameUrl={viewer.frame}
          timestamp={viewer.t}
          clip={clip}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}

function StartHerePointer({
  steer,
  onJump,
}: {
  steer: CoachFinding;
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className="flex w-full items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-left transition hover:border-brand-300"
    >
      <Sparkles size={16} className="shrink-0 text-brand-600" />
      <span className="min-w-0 text-sm">
        <span className="font-semibold text-brand-700">Start here ▸ </span>
        {steer.observation}
      </span>
      <span className="ml-auto shrink-0 text-xs font-medium text-brand-600">
        open the cycle →
      </span>
    </button>
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
      <p className="font-semibold">Your stroke cycles</p>
      <p className="mb-3 text-xs text-slate-400">
        We saw ~{hedged ?? cycles.length} over-water cycles (approximate). Tap one to
        open its reads.
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
                  {c.coachedCount ? `${c.coachedCount} read${c.coachedCount > 1 ? "s" : ""}` : "tap to coach"}
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
  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Cycle at {fmtTime(cycle.t)} — what the camera can see
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {cycle.subReads.map((sr) =>
          sr.finding ? (
            <FindingCard
              key={sr.aspect}
              f={sr.finding}
              label={sr.label}
              evidenceUrls={evidenceUrls}
              shareUrls={null}
              clip={clip}
              onEvidence={onEvidence}
            />
          ) : (
            <UncoachedSubRead key={sr.aspect} label={sr.label} />
          ),
        )}
      </div>
    </div>
  );
}

function UncoachedSubRead({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white/60 p-3">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400">
        <Sparkles size={12} /> tap to coach
      </span>
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
          <span className="text-xs text-slate-400">t={ref.timestamp_s.toFixed(1)}s</span>
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
              <span className="text-slate-400">low-confidence read</span>
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
  timelineUnlocked,
}: {
  view: "coach" | "timeline";
  setView: (v: "coach" | "timeline") => void;
  timelineUnlocked: boolean;
}) {
  const tab = (active: boolean) =>
    active
      ? "rounded-md bg-white px-3 py-1 font-medium text-slate-800 shadow-sm"
      : "rounded-md px-3 py-1 text-slate-500";
  return (
    <div className="mt-3 flex flex-col gap-1">
      <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
        <button type="button" onClick={() => setView("coach")} className={tab(view === "coach")}>
          Coach&apos;s read
        </button>
        <button
          type="button"
          disabled={!timelineUnlocked}
          onClick={() => timelineUnlocked && setView("timeline")}
          className={
            timelineUnlocked
              ? tab(view === "timeline")
              : "inline-flex items-center gap-1 rounded-md px-3 py-1 text-slate-400 disabled:cursor-not-allowed"
          }
        >
          {!timelineUnlocked ? <Lock size={12} /> : null} Timeline
        </button>
      </div>
      {!timelineUnlocked ? (
        <p className="text-xs text-slate-400">
          A video-led timeline view unlocks as our stroke detection sharpens.
        </p>
      ) : null}
    </div>
  );
}

const AREA_SHORT: Record<string, string> = {
  body_line: "body line",
  recovery_elbow: "elbow",
  head_breath: "head",
  entry_reach: "entry",
};

function TimelineView({
  clip,
  findings,
  evidenceUrls,
  onEvidence,
}: {
  clip: string | null;
  findings: CoachFinding[];
  evidenceUrls: Record<string, string> | null;
  onEvidence: (frame: string | undefined, t: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const moments = findings
    .filter(
      (f) =>
        f.evidence_frames[0] &&
        f.area !== "consistency" &&
        (f.severity === "fix" || f.severity === "strength"),
    )
    .map((f) => ({ f, t: f.evidence_frames[0].timestamp_s }))
    .sort((a, b) => a.t - b.t);

  const span = duration || (moments.length ? moments[moments.length - 1].t + 1 : 1);
  const active = [...moments].reverse().find((m) => m.t <= current + 0.3) ?? moments[0] ?? null;

  const seek = (t: number) => {
    setCurrent(t);
    const v = videoRef.current;
    if (v) {
      v.currentTime = t;
      void v.play?.()?.catch(() => {});
    }
  };

  if (moments.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No flagged moments to place on a timeline for this clip.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {clip ? (
        <video
          ref={videoRef}
          src={clip}
          controls
          playsInline
          className="w-full rounded-2xl bg-black"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-400">
          Your clip plays here — upload a real clip to watch it sync.
        </div>
      )}

      <div className="relative mx-2 mt-4 h-1.5 rounded-full bg-slate-100">
        {moments.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => seek(m.t)}
            aria-label={`Jump to ${m.t.toFixed(1)} seconds`}
            style={{ left: `${(m.t / span) * 100}%` }}
            className={`absolute -top-1.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white ${
              m.f.severity === "fix" ? "bg-amber-400" : "bg-emerald-400"
            } ${active === m ? "ring-2 ring-brand-400" : ""}`}
          />
        ))}
        <div
          style={{ left: `${Math.min(100, (current / span) * 100)}%` }}
          className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 bg-slate-600"
        />
      </div>

      {active ? (
        <FindingCard
          f={active.f}
          evidenceUrls={evidenceUrls}
          shareUrls={null}
          clip={clip}
          onEvidence={onEvidence}
        />
      ) : null}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="shrink-0 text-slate-400">Jump to:</span>
        {moments.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => seek(m.t)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              active === m
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${m.f.severity === "fix" ? "bg-amber-400" : "bg-emerald-400"}`}
            />
            {m.t.toFixed(0)}s {AREA_SHORT[m.f.area ?? ""] ?? ""}
          </button>
        ))}
      </div>
    </div>
  );
}

function EvidenceViewer({
  frameUrl,
  timestamp,
  clip,
  onClose,
}: {
  frameUrl?: string;
  timestamp: number;
  clip: string | null;
  onClose: () => void;
}) {
  const start = Math.max(0, timestamp - 0.4);
  const end = timestamp + 0.8;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-9 right-0 text-white"
          aria-label="Close"
        >
          <X size={24} />
        </button>
        {clip ? (
          <video
            src={clip}
            autoPlay
            muted
            playsInline
            className="w-full rounded-xl bg-black"
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = start;
            }}
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime >= end) {
                e.currentTarget.currentTime = start;
              }
            }}
          />
        ) : frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frameUrl}
            alt="Evidence frame"
            className="w-full rounded-xl bg-black"
          />
        ) : (
          <div className="rounded-xl bg-slate-800 p-8 text-center text-sm text-slate-300">
            No frame available for this moment.
          </div>
        )}
        <p className="mt-2 text-center text-xs text-white/70">
          {clip
            ? `Looping ${timestamp.toFixed(1)}s in your clip`
            : `Frame at ${timestamp.toFixed(1)}s`}
        </p>
      </div>
    </div>
  );
}

function CantSeeStrip() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <EyeOff size={18} className="text-slate-400" />
        <span className="font-medium text-slate-600">
          Underwater — the camera can&apos;t see this
        </span>
        <span className="ml-auto text-xs text-slate-400">every cycle</span>
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

function ConsistencyCard({ f }: { f: CoachFinding }) {
  const sev = SEV[f.severity] ?? SEV.info;
  return (
    <div className={`rounded-xl border p-4 ${sev.tone}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium">Consistency across your cycles</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${sev.pill}`}
        >
          {sev.label}
        </span>
      </div>
      <p className="text-sm">{f.observation}</p>
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
