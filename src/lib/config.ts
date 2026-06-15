// Browser fetches use relative /api/* URLs (the Netlify rewrite → api.swimbuddz.com,
// or the dev rewrite → localhost:8000). Only set NEXT_PUBLIC_API_BASE_URL if a
// Server Component needs an absolute URL.
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
).replace(/\/$/, "");
