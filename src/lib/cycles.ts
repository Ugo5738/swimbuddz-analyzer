// Derive stroke CYCLES (the page's spine) from a completed analysis. A cycle is a
// time-window anchored to a detected near-arm recovery and identified by its
// TIMESTAMP (never an ordinal we can't trust). Each cycle carries its visible
// above-water sub-reads — entry, recovery/elbow, head/breathing, body line —
// assembled from the coach findings localised to that window. Underwater aspects
// (catch/pull, kick) are global "can't see" and never live on a cycle.
//
// This is the seam Phase 2's real per-cycle coaching flows through: the same
// buildCycles() runs on real instances + findings; for now the demo mock supplies
// enough to populate it.

import type { CoachFinding, PublicAnalysisJobDetail } from "./publicAnalyzer";

export const ABOVE_WATER = [
  { key: "entry_reach", label: "Entry & reach" },
  { key: "recovery_elbow", label: "Recovery & elbow" },
  { key: "body_rotation", label: "Body rotation" },
  { key: "head_breath", label: "Head & breathing" },
  { key: "body_line", label: "Body line" },
] as const;

export type CycleSubRead = {
  aspect: string;
  label: string;
  finding: CoachFinding | null;
};

export type Cycle = {
  id: number;
  t: number; // peak time of the anchoring recovery (seconds)
  subReads: CycleSubRead[];
  coachedCount: number;
};

export function buildCycles(detail: PublicAnalysisJobDetail): Cycle[] {
  const r = detail.result;
  const recoveries = (r?.instances ?? [])
    .filter((i) => i.phase === "recovery" && i.arm === "near")
    .sort((a, b) => a.peak_s - b.peak_s);
  if (!recoveries.length) return [];

  const cycles: Cycle[] = recoveries.map((rec) => ({
    id: rec.instance_id,
    t: rec.peak_s,
    subReads: ABOVE_WATER.map((a) => ({
      aspect: a.key,
      label: a.label,
      finding: null,
    })),
    coachedCount: 0,
  }));

  // The chunk coach reads EVERY visible aspect of a coached stroke (recovery,
  // rotation, head, body line) and tags each finding with its instance_id, so a
  // cycle can carry a full per-aspect read. Pin each aspect finding to its exact
  // instance + slot (never guessed by nearest-timestamp). Uncoached cycles keep
  // null sub-reads → "not coached yet" + the on-demand button.
  const slotOf = new Map(ABOVE_WATER.map((a, i) => [a.key as string, i]));
  const findings = (r?.coach_result?.results ?? []).flatMap((c) => c.findings);
  for (const f of findings) {
    if (typeof f.instance_id !== "number" || !f.area || isNoiseFinding(f)) continue;
    const slot = slotOf.get(f.area);
    if (slot === undefined) continue;
    const ci = cycles.findIndex((c) => c.id === f.instance_id);
    if (ci < 0) continue;
    if (!cycles[ci].subReads[slot].finding) {
      cycles[ci].subReads[slot].finding = f;
    }
  }

  for (const c of cycles) {
    c.coachedCount = c.subReads.filter((s) => s.finding).length;
  }
  return cycles;
}

// The representative thumbnail for a cycle tile: prefer a coached sub-read's frame,
// then fall back to the per-recovery thumbnail the backend uploads for EVERY detected
// recovery (keyed by instance id) — so an uncoached tile still shows its moment.
// Undefined only when neither exists → the tile shows a water placeholder.
export function cycleThumb(
  cycle: Cycle,
  evidenceUrls: Record<string, string> | null,
): string | undefined {
  if (!evidenceUrls) return undefined;
  const order = ["recovery_elbow", "entry_reach", "head_breath", "body_line"];
  for (const key of order) {
    const sr = cycle.subReads.find((s) => s.aspect === key && s.finding);
    const fr = sr?.finding?.evidence_frames?.[0];
    if (sr?.finding && fr) {
      const url = evidenceUrls[`${sr.finding.component}:${fr.index}`];
      if (url) return url;
    }
  }
  // Fallback: the always-uploaded per-recovery thumbnail (coached or not).
  return evidenceUrls[`recovery_thumbnail:${cycle.id}`];
}

// The aggregator's collated headline read (chunk engine), or null on the legacy
// engine (which had no summary component).
export function coachSummary(detail: PublicAnalysisJobDetail): string | null {
  const agg = (detail.result?.coach_result?.results ?? []).find(
    (c) => c.component === "aggregator",
  );
  const s = (agg?.meta as { summary?: unknown } | undefined)?.summary;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

// Open the richest cycle by default so the cycle lens lands on a full read.
export function defaultOpenCycle(cycles: Cycle[]): number | null {
  if (!cycles.length) return null;
  let best = cycles[0];
  for (const c of cycles) if (c.coachedCount > best.coachedCount) best = c;
  return best.coachedCount > 0 ? best.id : null;
}

export const rankOf = (f: CoachFinding): number =>
  typeof f.extra?.rank === "number" ? (f.extra.rank as number) : 9;

// Placeholder / raw-debug findings that must never surface to a user: an
// uncoached instance label ("Recovery #3"), a raw aspect verdict echoed back
// ("entry_reach: unclear"), or an empty observation. These leak from
// low-confidence or unvalidated coaches and read as meaningless noise.
const NOISE_RE = /^\s*$|^recovery\s*#\d+\s*$|^[a-z_]+:\s*(unclear|none|n\/?a)\s*$/i;
export function isNoiseFinding(f: CoachFinding): boolean {
  return NOISE_RE.test(f.observation ?? "");
}

// A per-cycle recovery fix belongs in the stroke-by-stroke lens, never the top
// verdict — it's one stroke, not a stroke-wide habit. Everything else the coach
// flags as a "fix" — including the holistic read, whose findings carry NO area —
// is a top-line fault and must surface.
const isPerCycleRecovery = (f: CoachFinding): boolean =>
  f.area === "recovery_elbow" && typeof f.instance_id === "number";

export type Verdict = {
  fixes: CoachFinding[]; // ranked top fixes — the page's spine
  strengths: CoachFinding[]; // what's working
  notes: CoachFinding[]; // info-level observations
  cantSee: CoachFinding[]; // the camera couldn't show it — NOT a fault
};

// A "can't-see" read: the model is reporting a VISIBILITY limit, not technique.
// These must never sit next to real strengths (it reads as if not-seeing is a fault).
// Signal order: explicit backend flags first, then the model's own phrasing.
const CANT_SEE_RE =
  /(not (clearly )?visible|isn'?t (clearly )?visible|not clearly show|does(n'?t| not) (clearly )?show|can'?t (be )?seen?|cannot be seen|couldn'?t (see|tell|make out)|out of (the )?frame|obscured|too (dark|blurry|far)|hard to (see|tell)|unclear)/i;

function isCantSee(f: CoachFinding): boolean {
  return (
    f.severity === "unavailable" ||
    f.available === false ||
    CANT_SEE_RE.test(f.observation)
  );
}

// The coach's VERDICT: lead with ranked faults+fixes, not cycles. One finding per
// aspect (continuous habits stated once); the elbow story comes in as the fatigue
// read. Per-cycle recovery fixes stay in the stroke-by-stroke evidence lens.
export function buildVerdict(detail: PublicAnalysisJobDetail): Verdict {
  const raw = (detail.result?.coach_result?.results ?? [])
    .flatMap((c) => c.findings)
    .filter((f) => f.component !== "gate" && f.component !== "collate")
    .filter((f) => !isNoiseFinding(f));

  // The top-line read = the AGGREGATOR's synthesis when it ran (chunk engine); the
  // per-chunk findings stay the stroke-by-stroke detail, never the top fixes. With
  // no aggregator (legacy holistic engine) fall back to everything-but-chunk.
  const hasAgg = raw.some((f) => f.component === "aggregator");
  const findings = hasAgg
    ? raw.filter((f) => f.component === "aggregator")
    : raw.filter((f) => f.component !== "chunk_coach");

  // Dedupe: aspect findings collapse by their area (one entry/head/body-line
  // read). The holistic coach emits SEVERAL distinct points with no area, so
  // those key on their own text and are never collapsed into a single entry.
  const dedupe = (list: CoachFinding[]): CoachFinding[] => {
    const seen = new Set<string>();
    const out: CoachFinding[] = [];
    for (const f of list) {
      const k = f.area ?? f.observation;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(f);
    }
    return out;
  };

  const sorted = [...findings].sort((a, b) => rankOf(a) - rankOf(b));
  // Top fixes = every coached fault EXCEPT per-cycle recovery (which lives in the
  // stroke-by-stroke lens below). The holistic coach's fixes carry no area, so an
  // area-gated filter silently drops them — select by severity alone.
  const fixes = dedupe(
    sorted.filter((f) => f.severity === "fix" && !isPerCycleRecovery(f)),
  );
  // Pull can't-see reads OUT of strengths/notes into their own bucket so the UI can
  // show them apart from real coaching (a camera limit isn't a strength OR a fault).
  const strengths = dedupe(
    sorted.filter((f) => f.severity === "strength" && !isCantSee(f)),
  );
  const notes = dedupe(
    sorted.filter(
      (f) =>
        f.severity === "info" &&
        f.area !== "consistency" &&
        !isCantSee(f) &&
        !isPerCycleRecovery(f),
    ),
  );
  const cantSee = dedupe(
    sorted.filter((f) => f.severity !== "fix" && isCantSee(f)),
  );
  return { fixes, strengths, notes, cantSee };
}
