// In PRODUCTION the browser talks directly to the API origin (api.swimbuddz.com),
// NOT the same-origin /api/* Netlify proxy. Netlify's rewrite proxy caps request
// bodies at ~10MB and returns an empty-body 400 on larger uploads — which silently
// broke video submission (a compressed clip can be 10–50MB). The gateway CORS
// allow-list includes https://analyzer.swimbuddz.com, so cross-origin works.
// In DEV the value is "" so next.config's /api/* rewrite proxies to localhost:8000.
// Override with NEXT_PUBLIC_API_BASE_URL if ever needed.
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production" ? "https://api.swimbuddz.com" : "")
).replace(/\/$/, "");
