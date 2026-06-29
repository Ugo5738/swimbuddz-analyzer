/**
 * Google Analytics 4 helpers for Stroke Lab (analyzer.swimbuddz.com).
 *
 * The GA measurement ID is read from NEXT_PUBLIC_GA_ID. If it's unset, every call
 * is a silent no-op — safe for local dev and preview. Set NEXT_PUBLIC_GA_ID in the
 * analyzer's Netlify env to a GA4 measurement ID (ideally its OWN data stream, so
 * the Stroke Lab funnel stays separate from the main site's).
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

/** Whether GA is configured for this environment. */
export const isGAEnabled = (): boolean => GA_ID.length > 0;

/** Send a custom GA4 event with optional parameters. */
export function trackEvent(
  action: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!isGAEnabled()) return;
  window.gtag?.("event", action, params);
}

/** Manually send a page_view (App Router route changes). */
export function trackPageView(url: string) {
  if (!isGAEnabled()) return;
  window.gtag?.("config", GA_ID, { page_path: url });
}

// ── Stroke Lab funnel events ──────────────────────────────────────────────
/** A clip upload was submitted for analysis. */
export const trackAnalysisStarted = (params?: { discipline?: string }) =>
  trackEvent("analysis_started", params ?? {});

/** A finished analysis was viewed (the result page reached "completed"). */
export const trackAnalysisCompleted = (params?: {
  discipline?: string;
  gate_tier?: string;
}) => trackEvent("analysis_completed", params ?? {});

/** The "Coach this stroke" on-demand button was used. */
export const trackStrokeCoached = () => trackEvent("stroke_coached");

/** A credit pack was clicked through to checkout. */
export const trackBuyClicked = (params: {
  pack: string;
  credits: number;
  usd: number;
}) => trackEvent("buy_clicked", params);

/** The result was shared. */
export const trackShareClicked = () => trackEvent("share_clicked");
