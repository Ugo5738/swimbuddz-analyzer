import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwimBuddz Stroke Lab — free AI freestyle analysis",
  description:
    "Upload a freestyle clip and get an instant AI breakdown — stroke rate, body roll, breathing balance, and drills. Your first analysis is free.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8 sm:py-12">
          <header className="mb-8 flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-brand-700">
              SwimBuddz
            </span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              Stroke Lab
            </span>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400">
            <p>
              Freestyle analysis only. A measurement tool, not a coach. ·{" "}
              <a href="/privacy" className="underline hover:text-slate-600">
                Privacy
              </a>{" "}
              ·{" "}
              <a href="/terms" className="underline hover:text-slate-600">
                Terms
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
