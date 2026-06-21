import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — SwimBuddz Stroke Lab",
};

export default function TermsPage() {
  return (
    <article className="legal">
      <h1>Terms of Use</h1>
      <p className="text-xs text-slate-400">Last updated: 15 June 2026</p>

      <p>
        By using SwimBuddz Stroke Lab (analyzer.swimbuddz.com), operated by
        SwimBuddz Limited, you agree to these terms.
      </p>

      <h2>What the service is</h2>
      <p>
        Stroke Lab is an <strong>automated technique-feedback tool</strong> for{" "}
        <strong>freestyle</strong> swimming. It gives a coach&apos;s-eye read of
        what it can see from your video — body line, recovery, head &amp;
        breathing, and entry — and suggests drills. It is not coaching, and it is
        not medical or training advice. Results are automated estimates and may be
        inaccurate, especially with poor camera angles or low video quality.
      </p>

      <h2>Credits and payment</h2>
      <ul>
        <li>Your first analysis per email address is free.</li>
        <li>
          After that, analyses are paid using credit packs purchased through
          Gumroad, which is the seller of record for those purchases.
        </li>
        <li>
          Credits are <strong>non-refundable once an analysis has run</strong>.
          If an analysis fails on our side, the credit for it is automatically
          refunded to your balance.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Only upload videos you have the right to use, and that don&apos;t show
          other people without their consent.
        </li>
        <li>
          Don&apos;t upload anything unlawful, and don&apos;t try to abuse,
          overload, or interfere with the service.
        </li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The service is provided &quot;as is&quot;, without warranties of any
        kind. To the maximum extent permitted by law, SwimBuddz Limited is not
        liable for any loss arising from your use of the analysis or the
        service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms or the service over time. Continued use after
        a change means you accept the updated terms. These terms are governed by
        the laws of Nigeria.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email{" "}
        <a href="mailto:swimbuddz@gmail.com">swimbuddz@gmail.com</a>.
      </p>

      <p className="pt-4">
        <a href="/">← Back to the analyzer</a>
      </p>
    </article>
  );
}
