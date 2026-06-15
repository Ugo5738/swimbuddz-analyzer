import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SwimBuddz Stroke Lab",
};

export default function PrivacyPage() {
  return (
    <article className="legal">
      <h1>Privacy Policy</h1>
      <p className="text-xs text-slate-400">Last updated: 15 June 2026</p>

      <p>
        SwimBuddz Stroke Lab (&quot;we&quot;, &quot;us&quot;) is operated by
        SwimBuddz Limited. This policy explains what we collect when you use the
        freestyle analyzer at analyzer.swimbuddz.com and what we do with it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>The video you upload</strong> — to run your analysis.
        </li>
        <li>
          <strong>Your email address</strong> — to send you the result link and
          service messages about your analysis.
        </li>
        <li>
          <strong>Basic technical data</strong> — such as your IP address and
          request logs, used to run the service and prevent abuse.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        We use your video and email solely to produce your analysis and deliver
        it to you. We do not sell your data, and we do not use your video for
        anything other than your own analysis.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your uploaded video and the analysis we generate are{" "}
        <strong>automatically deleted 30 days</strong> after they&apos;re
        created. We keep your email address and a record of any purchase for as
        long as we need it for support and our financial records.
      </p>

      <h2>Who we share it with</h2>
      <p>We rely on a small number of providers to run the service:</p>
      <ul>
        <li>
          <strong>Gumroad</strong> processes payments — we never see or store
          your card details.
        </li>
        <li>
          <strong>Email and hosting providers</strong> deliver your result email
          and securely store your file while it&apos;s being analyzed.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can ask us to delete your data at any time. Email{" "}
        <a href="mailto:swimbuddz@gmail.com">swimbuddz@gmail.com</a> and
        we&apos;ll remove your video, analysis, and email from our records.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Email{" "}
        <a href="mailto:swimbuddz@gmail.com">swimbuddz@gmail.com</a>.
      </p>

      <p className="pt-4">
        <a href="/">← Back to the analyzer</a>
      </p>
    </article>
  );
}
