/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dev-only: proxy /api/v1/* to the local gateway. In production the Netlify
  // rewrite (netlify.toml) forwards /api/* to api.swimbuddz.com server-side, so
  // browser fetches stay same-origin (no CORS).
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
