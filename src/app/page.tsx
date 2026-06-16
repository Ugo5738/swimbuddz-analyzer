"use client";

import { Activity, CheckCircle2, Loader2, Upload, Waves } from "lucide-react";
import Script from "next/script";
import { useCallback, useRef, useState } from "react";

import {
  ACCEPTED_VIDEO_MIME,
  ApiError,
  createPublicAnalysis,
  GUMROAD_CHECKOUT_BASE,
  getCredits,
  MAX_DURATION_SECONDS,
  PRODUCTS,
  type PublicAnalysisJob,
  readVideoDuration,
  redeemLicense,
} from "@/lib/publicAnalyzer";
import { compressVideoForUpload } from "@/lib/videoCompress";

type Phase = "idle" | "working" | "queued" | "paywall" | "error";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function storeToken(jobId: string, token: string) {
  try {
    localStorage.setItem(`sbz_analyzer_${jobId}`, token);
  } catch {
    /* ignore */
  }
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [busyMsg, setBusyMsg] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<PublicAnalysisJob | null>(null);
  const fileRef = useRef<File | null>(null);

  const run = useCallback(async (file: File, emailValue: string) => {
    setPhase("working");
    setError("");
    try {
      setBusyMsg("Checking your clip…");
      let duration = 0;
      try {
        duration = await readVideoDuration(file);
      } catch {
        /* non-fatal — the worker re-checks */
      }
      if (duration && duration > MAX_DURATION_SECONDS) {
        setPhase("error");
        setError(
          `That clip is ${Math.round(duration)}s — please trim it to ${MAX_DURATION_SECONDS}s or less of a single length.`,
        );
        return;
      }

      setBusyMsg("Optimizing your video on this device…");
      setProgress(0);
      const compressed = await compressVideoForUpload(file, {
        onProgress: (f) => setProgress(Math.round(f * 100)),
      });

      setBusyMsg("Uploading…");
      setProgress(100);
      const result = await createPublicAnalysis(compressed.file, emailValue);
      storeToken(result.job_id, result.guest_token);
      setJob(result);
      setPhase("queued");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setPhase("paywall");
        return;
      }
      setPhase("error");
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const file = fd.get("video") as File | null;
      const emailValue = (fd.get("email") as string)?.trim().toLowerCase();
      if (!emailValue || !EMAIL_RE.test(emailValue)) {
        setError("Please enter a valid email — we'll send your result there.");
        return;
      }
      if (!file || file.size === 0) {
        setError("Please choose a freestyle video clip.");
        return;
      }
      fileRef.current = file;
      void run(file, emailValue);
    },
    [run],
  );

  if (phase === "queued" && job) return <Queued email={email} job={job} />;
  if (phase === "paywall")
    return (
      <Paywall
        email={email}
        onReady={() => {
          if (fileRef.current && email) void run(fileRef.current, email);
        }}
      />
    );

  return (
    <div>
      <section className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          <Waves size={16} /> Freestyle stroke analysis
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Get an instant AI breakdown of your freestyle.
        </h1>
        <p className="mt-3 text-slate-600">
          Upload a short, side-on clip. We measure your{" "}
          <strong>stroke rate</strong>, <strong>body roll</strong>, and{" "}
          <strong>breathing balance</strong>, flag what to work on, and suggest
          drills. Your <strong>first analysis is free</strong> — we&apos;ll email
          you the report when it&apos;s ready.
        </p>
      </section>

      {phase === "working" ? (
        <Working msg={busyMsg} progress={progress} />
      ) : (
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              We&apos;ll email you a link when it&apos;s ready.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="video">
              Freestyle clip
            </label>
            <input
              id="video"
              name="video"
              type="file"
              accept={ACCEPTED_VIDEO_MIME}
              required
              className="block w-full cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white"
            />
            <p className="mt-1 text-xs text-slate-400">
              For best results: film side-on with the swimmer in frame, 10–90
              seconds long. Large clips are compressed on your device first, so
              they upload fast.
            </p>
          </div>

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700"
          >
            <Upload size={18} /> Analyze my freestyle
          </button>

          <p className="text-center text-xs text-slate-400">
            By analyzing, you agree to our{" "}
            <a href="/terms" className="underline hover:text-slate-600">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-slate-600">
              Privacy Policy
            </a>
            .
          </p>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        A coach charges $50+ for video analysis. This is an instant, automated
        measurement tool — honest numbers, not a human coach.
      </p>
    </div>
  );
}

function Working({ msg, progress }: { msg: string; progress: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Loader2 className="mx-auto mb-4 animate-spin text-brand-600" size={32} />
      <p className="font-medium">{msg}</p>
      {progress > 0 && progress < 100 ? (
        <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-brand-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <p className="mt-3 text-xs text-slate-400">
        Keep this tab open until the upload finishes.
      </p>
    </div>
  );
}

function Queued({ email, job }: { email: string; job: PublicAnalysisJob }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
      <CheckCircle2 className="mx-auto mb-4 text-emerald-600" size={40} />
      <h2 className="text-xl font-bold">You&apos;re in the queue</h2>
      <p className="mt-2 text-slate-700">
        {job.estimated_ready_hint}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        We&apos;ll email <strong>{email}</strong> a link as soon as your analysis
        is ready. You can close this tab.
      </p>
      <p className="mt-4 text-xs text-slate-400">
        Credits remaining: {job.credits_remaining}
      </p>
    </div>
  );
}

function Paywall({ email, onReady }: { email: string; onReady: () => void }) {
  const [licenseKey, setLicenseKey] = useState("");
  const [permalink, setPermalink] = useState<string>(PRODUCTS[2].permalink);
  const [msg, setMsg] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const refresh = useCallback(async () => {
    setMsg("");
    try {
      const c = await getCredits(email);
      if (c.remaining_credits > 0) {
        onReady();
      } else {
        setMsg("No credits found yet. If you just bought, give it a few seconds.");
      }
    } catch {
      setMsg("Couldn't check your balance — try again.");
    }
  }, [email, onReady]);

  const redeem = useCallback(async () => {
    setRedeeming(true);
    setMsg("");
    try {
      await redeemLicense(email, licenseKey.trim(), permalink);
      onReady();
    } catch (e) {
      setMsg(
        e instanceof ApiError && e.reason === "already_redeemed"
          ? "That key has already been used."
          : "That license key wasn't recognized. It's in your Gumroad receipt email.",
      );
    } finally {
      setRedeeming(false);
    }
  }, [email, licenseKey, permalink, onReady]);

  return (
    <div className="space-y-6">
      {/* Loads Gumroad's overlay so .gumroad-button links open checkout on-page
          (graceful fallback: without JS the links open the product page). */}
      <Script src="https://gumroad.com/js/gumroad.js" strategy="afterInteractive" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Activity className="mx-auto mb-3 text-brand-600" size={28} />
        <h2 className="text-xl font-bold">You&apos;ve used your free analysis</h2>
        <p className="mt-1 text-sm text-slate-600">
          Grab a credit pack to keep analyzing. One-time purchase, no
          subscription.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PRODUCTS.map((p) => (
          <a
            key={p.permalink}
            href={`${GUMROAD_CHECKOUT_BASE}${p.permalink}`}
            target="_blank"
            rel="noreferrer"
            className={`gumroad-button rounded-xl border p-4 text-center transition hover:shadow-md ${
              "featured" in p && p.featured
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-sm font-semibold text-slate-500">{p.label}</div>
            <div className="my-1 text-2xl font-bold">${p.priceUsd}</div>
            <div className="text-xs text-slate-500">
              {p.credits} {p.credits === 1 ? "analysis" : "analyses"}
            </div>
          </a>
        ))}
      </div>

      <button
        onClick={refresh}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700"
      >
        I&apos;ve paid — continue
      </button>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Bought with a different email? Redeem a license key
        </summary>
        <div className="mt-3 space-y-2">
          <select
            value={permalink}
            onChange={(e) => setPermalink(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {PRODUCTS.map((p) => (
              <option key={p.permalink} value={p.permalink}>
                {p.label} — {p.credits} credits
              </option>
            ))}
          </select>
          <input
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="License key (in your Gumroad receipt)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={redeem}
            disabled={redeeming || !licenseKey.trim()}
            className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {redeeming ? "Redeeming…" : "Redeem credits"}
          </button>
        </div>
      </details>

      {msg ? <p className="text-center text-sm text-rose-600">{msg}</p> : null}
    </div>
  );
}
