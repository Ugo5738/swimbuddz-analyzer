"use client";

import {
  AlertTriangle,
  ArrowLeft,
  EyeOff,
  GraduationCap,
  Info,
  Loader2,
  Lock,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import {
  type CoachFinding,
  failureMessage,
  getPublicAnalysis,
  type PublicAnalysisJobDetail,
  type StrokeInstance,
  inspectPublicAnalysis,
} from "@/lib/publicAnalyzer";
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
        <ResultBody detail={detail} token={token} jobId={jobId} />
      ) : null}
    </div>
  );
}

const DISCIPLINE_LABEL: Record<string, string> = {
  sprint: "Sprint",
  distance: "Distance",
  general: "general technique",
};

// Fixed scaffold — same order every render. Visible areas first, then the honest
// underwater gaps (the Academy hook).
const AREAS = [
  { key: "body_line", label: "Body line" },
  { key: "recovery_elbow", label: "Recovery & elbow" },
  { key: "head_breath", label: "Head & breathing" },
  { key: "entry_reach", label: "Entry & reach" },
] as const;

const CANT_SEE = [
  {
    key: "catch_pull",
    label: "Catch & pull",
    copy: "The catch and pull happen underwater — a coach in the pool can see what an above-water, side-on clip can't.",
  },
  {
    key: "kick",
    label: "Kick",
    copy: "Your kick runs mostly underwater and between frames — it's best read by a coach in the pool.",
  },
] as const;

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
const SEV_ORDER: Record<string, number> = { fix: 0, strength: 1, info: 2 };

function ResultBody({
  detail,
  token,
  jobId,
}: {
  detail: PublicAnalysisJobDetail;
  token: string | null;
  jobId: string;
}) {
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
  const hedged = collate
    ? (collate.extra.recovery_count_hedged as number)
    : null;
  const evidenceUrls = r?.coach_evidence_urls ?? null;
  const shareUrls = r?.coach_share_urls ?? null;
  const byArea = (key: string) =>
    findings
      .filter((f) => f.area === key && f.component !== "collate")
      .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const recoveries = (r?.instances ?? []).filter(
    (i) => i.phase === "recovery" && i.arm === "near",
  );
  const consistency = findings.find((f) => f.area === "consistency") ?? null;
  const clip = detail.annotated_video_url ?? detail.original_video_url ?? null;

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
            <Info size={14} /> ~{hedged} {hedged === 1 ? "recovery" : "recoveries"}{" "}
            seen · approximate
          </p>
        ) : null}
        {coach?.gate_tier === "borderline" ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your camera angle is borderline — film a truer side-on view for sharper
            feedback.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-400">
          An automated coach&apos;s eye — not a human coach.
        </p>
      </div>

      {coach ? (
        <div className="space-y-3">
          {AREAS.map((a) => (
            <AreaSection
              key={a.key}
              label={a.label}
              findings={
                a.key === "recovery_elbow"
                  ? byArea(a.key).slice(0, 1)
                  : byArea(a.key)
              }
              evidenceUrls={evidenceUrls}
              shareUrls={shareUrls}
            />
          ))}
          {CANT_SEE.map((c) => (
            <CantSeeCard key={c.key} label={c.label} copy={c.copy} />
          ))}
        </div>
      ) : (
        <p className="text-slate-600">
          We finished, but couldn&apos;t produce a coached read for this clip.
        </p>
      )}

      <RecoveryBrowser
        unlocked={detail.drilldown_unlocked}
        recoveries={recoveries}
        hedged={hedged}
        findings={byArea("recovery_elbow")}
        consistency={consistency}
        evidenceUrls={evidenceUrls}
        jobId={jobId}
        token={token}
        canInspect={detail.drilldown_unlocked && jobId !== "demo" && !!token}
      />

      {clip ? (
        <video
          src={clip}
          controls
          playsInline
          className="w-full rounded-2xl border border-slate-200 bg-black"
        />
      ) : null}

      <AcademyCTA />
    </div>
  );
}

function AreaSection({
  label,
  findings,
  evidenceUrls,
  shareUrls,
}: {
  label: string;
  findings: CoachFinding[];
  evidenceUrls: Record<string, string> | null;
  shareUrls: Record<string, string> | null;
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-slate-400">No clear read</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          We couldn&apos;t get a clear read on this from your clip — try a steadier,
          closer side-on angle.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-2 font-medium">{label}</p>
      <div className="space-y-2">
        {findings.map((f, i) => (
          <FindingCard
            key={`${f.component}-${f.instance_id ?? i}`}
            f={f}
            evidenceUrls={evidenceUrls}
            shareUrls={shareUrls}
          />
        ))}
      </div>
    </div>
  );
}

function FindingCard({
  f,
  evidenceUrls,
  shareUrls,
}: {
  f: CoachFinding;
  evidenceUrls: Record<string, string> | null;
  shareUrls: Record<string, string> | null;
}) {
  const sev = SEV[f.severity] ?? SEV.info;
  const why =
    typeof f.extra?.why_it_matters === "string"
      ? (f.extra.why_it_matters as string)
      : null;
  const drill = typeof f.extra?.drill === "string" ? (f.extra.drill as string) : null;
  const ref = f.evidence_frames[0];
  const label = ref ? `${f.component}:${ref.index}` : null;
  const thumb = ref && evidenceUrls ? evidenceUrls[label as string] : undefined;
  const share = label && shareUrls ? shareUrls[label] : undefined;
  const lowConf = f.confidence > 0 && f.confidence <= 0.5;
  return (
    <div className={`rounded-lg border p-3 ${sev.tone}`}>
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt="Evidence frame from your clip"
            className="h-20 w-28 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
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
          <div className="mt-2 flex items-center gap-3 text-xs">
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

function CantSeeCard({ label, copy }: { label: string; copy: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <EyeOff size={18} className="text-slate-400" />
        <span className="font-medium text-slate-600">{label}</span>
        <span className="ml-auto text-xs text-slate-400">Can&apos;t see from this clip</span>
      </div>
      <p className="text-sm text-slate-600">{copy}</p>
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
    <div className={`mb-3 rounded-xl border p-4 ${sev.tone}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium">Consistency across your swim</span>
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

function RecoveryBrowser({
  unlocked,
  recoveries,
  hedged,
  findings,
  consistency,
  evidenceUrls,
  jobId,
  token,
  canInspect,
}: {
  unlocked: boolean;
  recoveries: StrokeInstance[];
  hedged: number | null;
  findings: CoachFinding[];
  consistency: CoachFinding | null;
  evidenceUrls: Record<string, string> | null;
  jobId: string;
  token: string | null;
  canInspect: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [extra, setExtra] = useState<Record<number, CoachFinding>>({});
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState("");

  const findingFor = (id: number) =>
    extra[id] ?? findings.find((f) => f.instance_id === id) ?? null;

  const onTap = async (id: number) => {
    if (selected === id) {
      setSelected(null);
      return;
    }
    setSelected(id);
    setInspectError("");
    if (findingFor(id) || !canInspect || !token || inspecting != null) return;

    setInspecting(id);
    try {
      const res = await inspectPublicAnalysis(jobId, token, "recovery_elbow", id);
      if (res.status === "ready" && res.finding) {
        setExtra((e) => ({ ...e, [id]: res.finding as CoachFinding }));
        setInspecting(null);
        return;
      }
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const d = await getPublicAnalysis(jobId, token);
        const fs = (d.result?.coach_result?.results ?? []).flatMap(
          (c) => c.findings,
        );
        const found = fs.find(
          (f) => f.area === "recovery_elbow" && f.instance_id === id,
        );
        if (found) {
          setExtra((e) => ({ ...e, [id]: found }));
          setInspecting(null);
          return;
        }
      }
      setInspecting(null);
      setInspectError("This is taking longer than expected — try again in a moment.");
    } catch {
      setInspecting(null);
      setInspectError("We couldn't analyze that stroke — please try again.");
    }
  };

  const sel = selected != null ? findingFor(selected) : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      {consistency ? <ConsistencyCard f={consistency} /> : null}

      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold">Your strokes, one by one</span>
        {!unlocked ? <Lock size={15} className="text-slate-400" /> : null}
      </div>

      {!unlocked ? (
        <>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: Math.min(8, Math.max(4, hedged ?? 6)) }).map(
              (_, i) => (
                <div
                  key={i}
                  className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 blur-[1px]"
                />
              ),
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Per-stroke breakdown unlocks as our stroke detection sharpens — and the
            number of strokes shown is approximate until it does.
          </p>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-400">
            We saw ~{recoveries.length} over-water recoveries (approximate). Tap one
            to see its read.
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recoveries.map((rec, i) => {
              const isSel = selected === rec.instance_id;
              const has = findingFor(rec.instance_id);
              return (
                <button
                  key={rec.instance_id}
                  type="button"
                  onClick={() => void onTap(rec.instance_id)}
                  className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border text-xs transition ${
                    isSel
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : has
                        ? "border-slate-300 hover:border-brand-400"
                        : "border-slate-200 text-slate-400"
                  }`}
                  aria-pressed={isSel}
                >
                  <span className="font-semibold">#{i + 1}</span>
                  <span>{rec.peak_s.toFixed(1)}s</span>
                </button>
              );
            })}
          </div>
          {selected != null ? (
            <div className="mt-3">
              {inspecting === selected ? (
                <p className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={15} /> Analyzing this
                  stroke…
                </p>
              ) : sel ? (
                <FindingCard f={sel} evidenceUrls={evidenceUrls} shareUrls={null} />
              ) : inspectError ? (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  {inspectError}
                </p>
              ) : (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  We coached a sample of your recoveries — tap to analyze this one.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
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
