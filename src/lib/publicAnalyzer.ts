// Public Stroke Lab analyzer API client + types. No auth — a guest is identified
// by their email + a per-job guest_token. Mirrors the public Pydantic schemas in
// services/ai_service/schemas/analysis.py and the /ai/public/* routes.

import { API_BASE_URL } from "./config";

// ─── Types ────────────────────────────────────────────────────────────
export type AnalysisJobStatus = "pending" | "processing" | "completed" | "failed";

// The swimmer's goal. Steers how the coach prioritises + frames feedback (a long
// front-quad glide is efficiency for distance, a dead-spot for sprint), never what
// it perceives. Mirrors DISCIPLINES in services/ai_service/pipeline/types.py.
export type Discipline = "sprint" | "distance" | "general";

export type DrillSuggestion = {
  key: string;
  title: string;
  why: string;
  how: string;
  academy_ref: string | null;
};

export type ObservationSeverity = "good" | "suggestion" | "unavailable";

export type Observation = {
  key: string;
  severity: ObservationSeverity;
  title: string;
  detail: string;
  timestamp_s: number | null;
  drill: DrillSuggestion | null;
};

export type TrackingGap = { start_s: number; end_s: number; duration_s: number };

// ── VLM-coach result (the new pipeline; mirrors the backend PipelineResult) ──
export type CoachFinding = {
  component: string;
  observation: string;
  severity: string; // "fix" | "strength" | "info" | "unavailable"
  evidence_frames: { index: number; timestamp_s: number }[];
  confidence: number;
  available: boolean;
  instance_id: number | null;
  area: string | null;
  extra: Record<string, unknown>;
};

export type CoachComponentResult = {
  component: string;
  findings: CoachFinding[];
  cost_usd: number;
  error: string | null;
  meta: Record<string, unknown>;
};

export type CoachResult = {
  input_profile: string;
  gate_tier: "clean" | "borderline" | "refuse" | string;
  results: CoachComponentResult[];
  total_cost_usd: number;
  refused: boolean;
  meta: Record<string, unknown>;
};

export type AnalysisResultPayload = {
  detected_stroke: string;
  pose_detection_rate: number;
  frames_total: number;
  frames_with_pose: number;
  stroke_rate_spm: number | null;
  body_roll_proxy_degrees: number | null;
  breath_count_left: number | null;
  breath_count_right: number | null;
  breath_balance_left_ratio: number | null;
  summary_text: string | null;
  observations: Observation[];
  tracking_gaps: TrackingGap[];
  coach_result: CoachResult | null;
  coach_evidence_urls: Record<string, string> | null;
  coach_share_urls: Record<string, string> | null;
};

export type PublicAnalysisJob = {
  job_id: string;
  status: AnalysisJobStatus;
  stroke_type: string;
  guest_token: string;
  credits_remaining: number;
  estimated_ready_hint: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type PublicAnalysisJobDetail = {
  job_id: string;
  status: AnalysisJobStatus;
  stroke_type: string;
  discipline: Discipline;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: AnalysisResultPayload | null;
  original_video_url: string | null;
  annotated_video_url: string | null;
};

export type PublicCredits = {
  email: string;
  can_submit_free: boolean;
  remaining_credits: number;
};

// ─── Constants ────────────────────────────────────────────────────────
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the backend member cap
export const MAX_DURATION_SECONDS = 90; // client fast-fail; worker hard cap is 120s
export const ACCEPTED_VIDEO_MIME =
  "video/mp4,video/quicktime,video/x-m4v,video/webm";

// The four live Gumroad products (permalink → credits). Mirrors PERMALINK_CREDITS
// in services/ai_service/services/credit_ops.py.
export const PRODUCTS = [
  { permalink: "vrjec", credits: 1, priceUsd: 6, label: "Single" },
  { permalink: "fgopu", credits: 3, priceUsd: 12, label: "Starter" },
  { permalink: "puxlbz", credits: 10, priceUsd: 29, label: "Popular", featured: true },
  { permalink: "arlum", credits: 25, priceUsd: 59, label: "Coach" },
] as const;

export const GUMROAD_CHECKOUT_BASE = "https://swimbuddz.gumroad.com/l/";

// ─── Errors ───────────────────────────────────────────────────────────
export class ApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function toError(resp: Response): Promise<ApiError> {
  const text = await resp.text();
  let message = text || `${resp.status} ${resp.statusText}`;
  let reason: string | undefined;
  if (resp.headers.get("content-type")?.includes("application/json")) {
    try {
      const j = JSON.parse(text);
      const d = j.detail;
      if (typeof d === "string") {
        message = d;
      } else if (d && typeof d === "object") {
        reason = d.reason;
        message = d.reason ?? JSON.stringify(d);
      } else if (j.message) {
        message = j.message;
      }
    } catch {
      /* keep raw text */
    }
  }
  return new ApiError(resp.status, message, reason);
}

// ─── API calls ────────────────────────────────────────────────────────
export async function createPublicAnalysis(
  file: File,
  guestEmail: string,
  discipline: Discipline = "general",
): Promise<PublicAnalysisJob> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      `Video is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`,
    );
  }
  const fd = new FormData();
  fd.append("video", file);
  fd.append("guest_email", guestEmail);
  fd.append("stroke_type", "freestyle");
  fd.append("discipline", discipline);

  const resp = await fetch(`${API_BASE_URL}/api/v1/ai/public/analyze`, {
    method: "POST",
    body: fd,
    cache: "no-store",
  });
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as PublicAnalysisJob;
}

export async function getPublicAnalysis(
  jobId: string,
  guestToken: string,
): Promise<PublicAnalysisJobDetail> {
  // Token goes in the query string, not an X-Guest-Token header: cross-origin the
  // gateway's CORS allow-headers doesn't include that custom header (preflight
  // would 400), and the backend accepts ?guest_token= (same as the email link).
  const resp = await fetch(
    `${API_BASE_URL}/api/v1/ai/public/analyze/${jobId}?guest_token=${encodeURIComponent(guestToken)}`,
    { cache: "no-store" },
  );
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as PublicAnalysisJobDetail;
}

export async function getCredits(email: string): Promise<PublicCredits> {
  const resp = await fetch(
    `${API_BASE_URL}/api/v1/ai/public/credits?email=${encodeURIComponent(email)}`,
    { cache: "no-store" },
  );
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as PublicCredits;
}

export async function redeemLicense(
  email: string,
  licenseKey: string,
  productPermalink: string,
): Promise<{ granted: number; remaining_credits: number }> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/ai/public/credits/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      license_key: licenseKey,
      product_permalink: productPermalink,
    }),
  });
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as { granted: number; remaining_credits: number };
}

// ─── UI helpers ───────────────────────────────────────────────────────
export function statusLabel(status: AnalysisJobStatus): string {
  return { pending: "Queued", processing: "Analyzing", completed: "Ready", failed: "Failed" }[
    status
  ];
}

export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration || 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video metadata"));
    };
    v.src = url;
  });
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Map a backend failure_reason / error_message to friendly copy.
export function failureMessage(reason: string | null): string {
  switch (reason) {
    case "too_long":
      return "That clip is too long. Trim it to a single length (≤90s) and try again — your credit was refunded.";
    case "video_unreadable":
      return "We couldn't read that video file. Try exporting it as MP4 and re-uploading — your credit was refunded.";
    case "could_not_track":
      return "We couldn't track a swimmer in that clip. Use a side-on view with the swimmer clearly in frame — your credit was refunded.";
    default:
      return "We couldn't analyze that clip — your credit was refunded. Try a clearer, side-on freestyle clip.";
  }
}
