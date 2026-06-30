// Public Stroke Lab analyzer API client + types. No auth — a guest is identified
// by their email + a per-job guest_token. Mirrors the public Pydantic schemas in
// services/ai_service/schemas/analysis.py and the /ai/public/* routes.

import { API_BASE_URL } from "./config";

// ─── Types ────────────────────────────────────────────────────────────
export type AnalysisJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

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

export type TrackingGap = {
  start_s: number;
  end_s: number;
  duration_s: number;
};

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

// One segmented phase instance (a recovery / entry / glide / breath chunk). The
// backend exposes a whitelisted projection only when the per-stroke drilldown is
// unlocked; null otherwise. Powers the recovery browser.
export type StrokeInstance = {
  instance_id: number;
  phase: string; // recovery | entry | glide | breath
  arm: string; // near | far | none
  start_s: number;
  end_s: number;
  peak_s: number;
  confidence: number;
};

export type AnalysisResultPayload = {
  // Null on coach-primary runs (the legacy pose/metrics pass is retired).
  detected_stroke: string | null;
  pose_detection_rate: number | null;
  frames_total: number | null;
  frames_with_pose: number | null;
  // NOTE: the old stroke_rate_spm / body_roll_degrees / breath_count fields are
  // gone on purpose — the pivot bans those numbers; the backend never sends them.
  summary_text: string | null;
  observations: Observation[];
  tracking_gaps: TrackingGap[];
  instances: StrokeInstance[] | null;
  coach_result: CoachResult | null;
  coach_evidence_urls: Record<string, string> | null;
  coach_share_urls: Record<string, string> | null;
  inspect_statuses: Record<string, InspectStatus> | null;
};

export type PublicAnalysisJob = {
  job_id: string;
  status: AnalysisJobStatus;
  stroke_type: string;
  guest_token: string;
  credits_remaining: number;
  estimated_ready_hint: string;
  queue_depth?: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type PublicAnalysisJobDetail = {
  job_id: string;
  status: AnalysisJobStatus;
  stroke_type: string;
  discipline: Discipline;
  drilldown_unlocked: boolean;
  timeline_unlocked: boolean;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: AnalysisResultPayload | null;
  original_video_url: string | null;
  annotated_video_url: string | null;
  queue_depth?: number | null;
};

export type PublicCredits = {
  email: string;
  can_submit_free: boolean;
  remaining_credits: number;
};

export type PublicDirectUpload = {
  job_id: string;
  guest_token: string;
  upload_url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_in: number;
};

export type PublicUploadStage =
  | "preparing"
  | "uploading"
  | "finalizing";

export type PublicUploadCallbacks = {
  onProgress?: (percent: number) => void;
  onStage?: (stage: PublicUploadStage) => void;
};

export type InspectStatus = {
  aspect: string;
  instance_id: number;
  status: "queued" | "processing" | "retrying" | "completed" | "failed";
  attempt: number;
  message?: string | null;
  next_retry_at?: string | null;
  queue_depth?: number | null;
  error_reason?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
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
  {
    permalink: "puxlbz",
    credits: 10,
    priceUsd: 29,
    label: "Popular",
    featured: true,
  },
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
  callbacks?: PublicUploadCallbacks | ((percent: number) => void),
): Promise<PublicAnalysisJob> {
  const uploadCallbacks =
    typeof callbacks === "function" ? { onProgress: callbacks } : callbacks;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      `Video is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`,
    );
  }
  try {
    uploadCallbacks?.onStage?.("preparing");
    const upload = await createDirectUpload(file, guestEmail, discipline);
    uploadCallbacks?.onStage?.("uploading");
    await putDirectUpload(file, upload, uploadCallbacks?.onProgress);
    uploadCallbacks?.onStage?.("finalizing");
    const resp = await fetch(
      `${API_BASE_URL}/api/v1/ai/public/analyze/${upload.job_id}/complete-upload?guest_token=${encodeURIComponent(upload.guest_token)}`,
      { method: "POST", cache: "no-store" },
    );
    if (!resp.ok) throw await toError(resp);
    return (await resp.json()) as PublicAnalysisJob;
  } catch (e) {
    if (
      e instanceof ApiError &&
      (e.status === 404 || e.status === 405 || e.status === 501)
    ) {
      return createMultipartPublicAnalysis(file, guestEmail, discipline);
    }
    throw e;
  }
}

async function createDirectUpload(
  file: File,
  guestEmail: string,
  discipline: Discipline,
): Promise<PublicDirectUpload> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/ai/public/analyze/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guest_email: guestEmail,
      filename: file.name || "clip.mp4",
      content_type: file.type || "video/mp4",
      size_bytes: file.size,
      stroke_type: "freestyle",
      discipline,
    }),
    cache: "no-store",
  });
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as PublicDirectUpload;
}

function putDirectUpload(
  file: File,
  upload: PublicDirectUpload,
  onUploadProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.upload_url);
    for (const [key, value] of Object.entries(upload.headers || {})) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onUploadProgress?.(100);
        resolve();
      } else {
        reject(new ApiError(xhr.status, `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      reject(
        new ApiError(
          0,
          "Upload failed. Please check your connection and try again.",
        ),
      );
    };
    onUploadProgress?.(0);
    xhr.send(file);
  });
}

async function createMultipartPublicAnalysis(
  file: File,
  guestEmail: string,
  discipline: Discipline,
): Promise<PublicAnalysisJob> {
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

// Re-run a failed or system-limited partial analysis on its stored clip — free.
// The job flips back to pending; keep polling getPublicAnalysis.
export async function retryPublicAnalysis(
  jobId: string,
  guestToken: string,
): Promise<{ status: string }> {
  const resp = await fetch(
    `${API_BASE_URL}/api/v1/ai/public/analyze/${jobId}/retry?guest_token=${encodeURIComponent(guestToken)}`,
    { method: "POST", cache: "no-store" },
  );
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as { status: string };
}

export type InspectResponse = {
  status: "ready" | InspectStatus["status"];
  finding?: CoachFinding;
  inspect_status?: InspectStatus;
  queue_depth?: number | null;
};

// Request an on-demand read of one recovery (the per-stroke drilldown). "ready"
// means it was already coached (free); queued/retrying/processing statuses include
// visible backoff state in inspect_status while the frontend polls.
export async function inspectPublicAnalysis(
  jobId: string,
  guestToken: string,
  aspect: string,
  instanceId: number,
): Promise<InspectResponse> {
  const resp = await fetch(
    `${API_BASE_URL}/api/v1/ai/public/analyze/${jobId}/inspect?guest_token=${encodeURIComponent(guestToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspect, instance_id: instanceId }),
      cache: "no-store",
    },
  );
  if (!resp.ok) throw await toError(resp);
  return (await resp.json()) as InspectResponse;
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
  return {
    pending: "Queued",
    processing: "Analyzing",
    completed: "Ready",
    failed: "Failed",
  }[status];
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

// System failures — "on us", not the swimmer's clip. The UI hides filming tips for
// these and leads with a retry (it's worth trying again; the clip was fine).
export const SYSTEM_FAILURE_REASONS = new Set([
  "temporarily_unavailable",
  "coach_unavailable",
  "analysis_error",
]);

export function isSystemFailure(reason: string | null): boolean {
  return reason != null && SYSTEM_FAILURE_REASONS.has(reason);
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
    case "temporarily_unavailable":
      return "We got a rush of clips and couldn't finish yours in time — that's on us, not your clip. Your credit's refunded; give it a minute and try again.";
    case "coach_unavailable":
      return "Our coach is briefly unavailable — on our end, not your clip. Your credit's refunded; please try again shortly.";
    case "analysis_error":
      return "Something went wrong on our end analyzing that clip — your credit's refunded. Please try again.";
    default:
      return "We couldn't analyze that clip — your credit was refunded. Try a clearer, side-on freestyle clip.";
  }
}
