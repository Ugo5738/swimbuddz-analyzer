// A no-backend, no-credits demo of the redesigned result page (route: /r/demo).
// Realistic mock of a completed sprint analysis with the per-stroke drilldown
// unlocked, so the areas scaffold, the consistency card, and the selectable
// recovery filmstrip can be previewed without a real worker run. Dev/design aid.

import type { CoachFinding, PublicAnalysisJobDetail } from "./publicAnalyzer";

const STAMP = "2026-06-21T12:00:00Z";

const rec = (instance_id: number, peak_s: number) => ({
  instance_id,
  phase: "recovery",
  arm: "near",
  start_s: Math.round((peak_s - 0.3) * 100) / 100,
  end_s: Math.round((peak_s + 0.3) * 100) / 100,
  peak_s,
  confidence: 0.8,
});

const f = (o: {
  component: string;
  area: string | null;
  severity: string;
  observation: string;
  instance_id?: number | null;
  confidence?: number;
  evidence_frames?: { index: number; timestamp_s: number }[];
  extra?: Record<string, unknown>;
}): CoachFinding => ({
  component: o.component,
  area: o.area,
  severity: o.severity,
  observation: o.observation,
  instance_id: o.instance_id ?? null,
  confidence: o.confidence ?? 0.8,
  available: true,
  evidence_frames: o.evidence_frames ?? [],
  extra: o.extra ?? {},
});

export const DEMO_DETAIL: PublicAnalysisJobDetail = {
  job_id: "demo",
  status: "completed",
  stroke_type: "freestyle",
  discipline: "sprint",
  drilldown_unlocked: true,
  timeline_unlocked: false,
  error_message: null,
  created_at: STAMP,
  started_at: STAMP,
  completed_at: STAMP,
  original_video_url: null,
  annotated_video_url: null,
  result: {
    detected_stroke: "freestyle",
    pose_detection_rate: 0.92,
    frames_total: 210,
    frames_with_pose: 193,
    summary_text: null,
    observations: [],
    tracking_gaps: [],
    instances: [0, 1, 2, 3, 4, 5].map((i) => rec(i, 1.4 + i * 1.1)),
    coach_evidence_urls: null,
    coach_share_urls: null,
    coach_result: {
      input_profile: "side_on_above_water",
      gate_tier: "clean",
      refused: false,
      total_cost_usd: 0.052,
      meta: {},
      results: [
        {
          component: "recovery_coach",
          cost_usd: 0.03,
          error: null,
          meta: {},
          findings: [
            f({
              component: "recovery_coach",
              area: "recovery_elbow",
              severity: "strength",
              observation: "High, leading elbow — textbook recovery.",
              instance_id: 0,
              evidence_frames: [{ index: 5, timestamp_s: 1.4 }],
              extra: { elbow: "high", t: 1.4 },
            }),
            f({
              component: "recovery_coach",
              area: "recovery_elbow",
              severity: "strength",
              observation: "Still a clean high elbow here.",
              instance_id: 2,
              evidence_frames: [{ index: 13, timestamp_s: 3.6 }],
              extra: { elbow: "high", t: 3.6 },
            }),
            f({
              component: "recovery_coach",
              area: "recovery_elbow",
              severity: "fix",
              observation: "The elbow starts dropping below the hand on this stroke.",
              instance_id: 5,
              evidence_frames: [{ index: 25, timestamp_s: 6.9 }],
              extra: {
                elbow: "dropped",
                t: 6.9,
                why_it_matters:
                  "A dropped elbow late in a sprint signals fatigue and a weaker catch.",
                drill: "Fingertip-drag drill — keep the elbow high even when tired.",
              },
            }),
            f({
              component: "recovery_coach",
              area: "consistency",
              severity: "fix",
              observation:
                "Your recovery is cleaner early on — the elbow drops on your later strokes. That's fatigue creeping in; train holding the high-elbow shape when tired.",
              confidence: 0.5,
              extra: { aggregate: true, trend: "declining" },
            }),
          ],
        },
        {
          component: "body_line",
          cost_usd: 0.005,
          error: null,
          meta: {},
          findings: [
            f({
              component: "body_line",
              area: "body_line",
              severity: "fix",
              observation: "Your hips ride a little low through the glide.",
              evidence_frames: [{ index: 9, timestamp_s: 2.6 }],
              extra: {
                verdict: "hips_low",
                why_it_matters:
                  "Low hips drag — even in a sprint it costs you speed.",
                drill: "Side-kick with a long lead arm, eyes down.",
              },
            }),
          ],
        },
        {
          component: "head_breathing",
          cost_usd: 0.005,
          error: null,
          meta: {},
          findings: [
            f({
              component: "head_breathing",
              area: "head_breath",
              severity: "fix",
              observation: "You lift your head forward to breathe.",
              evidence_frames: [{ index: 11, timestamp_s: 3.0 }],
              extra: {
                kind: "head",
                rank: 1,
                why_it_matters: "Lifting the head sinks the legs and adds drag.",
                drill: "Breathe to the side, keep one goggle in the water.",
              },
            }),
            f({
              component: "head_breathing",
              area: "head_breath",
              severity: "info",
              observation: "You breathe to your right in this clip.",
              extra: { kind: "breath_side" },
            }),
          ],
        },
        {
          component: "entry_reach",
          cost_usd: 0.005,
          error: null,
          meta: {},
          findings: [
            f({
              component: "entry_reach",
              area: "entry_reach",
              severity: "info",
              observation:
                "Lovely long reach out front. For a sprint, make sure it isn't a dead-spot — start your catch a touch sooner.",
              confidence: 0.5,
              evidence_frames: [{ index: 7, timestamp_s: 2.1 }],
              extra: { verdict: "clean_extended" },
            }),
          ],
        },
        {
          component: "collate",
          cost_usd: 0,
          error: null,
          meta: {},
          findings: [
            f({
              component: "collate",
              area: "recovery_elbow",
              severity: "info",
              observation: "Detected ~6 recoveries (approximate).",
              confidence: 0.5,
              extra: {
                recovery_count_hedged: 6,
                recovery_windows: [
                  [1.1, 1.7],
                  [2.2, 2.8],
                  [3.3, 3.9],
                  [4.4, 5.0],
                  [5.5, 6.1],
                  [6.6, 7.2],
                ],
              },
            }),
          ],
        },
      ],
    },
  },
};
