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

const frameTime = (f: CoachFinding): number | null =>
  f.evidence_frames?.[0]?.timestamp_s ?? null;

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

  const findings = (r?.coach_result?.results ?? [])
    .flatMap((c) => c.findings)
    .filter(
      (f) =>
        f.component !== "gate" &&
        f.component !== "collate" &&
        f.area !== "consistency",
    );

  const nearestByTime = (t: number | null): number => {
    if (t == null) return -1;
    let best = 0;
    let bd = Infinity;
    cycles.forEach((c, i) => {
      const d = Math.abs(c.t - t);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  for (const f of findings) {
    if (!f.area) continue;
    const slot = ABOVE_WATER.findIndex((a) => a.key === f.area);
    if (slot < 0) continue; // underwater / not a per-cycle aspect
    // Recovery findings carry the exact instance; everything else lands on the
    // nearest cycle by timestamp.
    let ci = -1;
    if (f.area === "recovery_elbow" && typeof f.instance_id === "number") {
      ci = cycles.findIndex((c) => c.id === f.instance_id);
    }
    if (ci < 0) ci = nearestByTime(frameTime(f));
    if (ci < 0) continue;
    if (!cycles[ci].subReads[slot].finding) cycles[ci].subReads[slot].finding = f;
  }

  for (const c of cycles) {
    c.coachedCount = c.subReads.filter((s) => s.finding).length;
  }
  return cycles;
}

// The representative thumbnail for a cycle tile: prefer its recovery frame, then
// any coached sub-read's frame. Undefined → the tile shows a water placeholder.
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
  return undefined;
}

// Open the richest cycle by default so the page lands on a full read.
export function defaultOpenCycle(cycles: Cycle[]): number | null {
  if (!cycles.length) return null;
  let best = cycles[0];
  for (const c of cycles) if (c.coachedCount > best.coachedCount) best = c;
  return best.coachedCount > 0 ? best.id : null;
}
