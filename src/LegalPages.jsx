/**
 * Legal pages: /terms and /privacy
 * Styled with Vestra cream / charcoal / gold + Fraunces + Inter.
 */
const LEGAL_UPDATED = "July 21, 2026";

function LegalShell({ title, children }) {
  if (typeof document !== "undefined") {
    document.title = `${title} — Vestra`;
  }
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a className="legal-brand" href="/">Vestra</a>
        <nav className="legal-nav" aria-label="Legal">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
      </header>
      <main className="legal-main">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated: {LEGAL_UPDATED}</p>
        <div className="legal-body">{children}</div>
      </main>
      <footer className="legal-footer">
        <a href="/">← Back to Vestra</a>
        <span className="legal-footer-sep">·</span>
        <a href="/terms">Terms</a>
        <span className="legal-footer-sep">·</span>
        <a href="/privacy">Privacy</a>
      </footer>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Vestra Terms of Service">
      <p>
        Welcome to Vestra (&quot;Vestra,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), an AI-powered personal styling
        service accessible at wearvestra.com (the &quot;Service&quot;). These Terms of Service (&quot;Terms&quot;)
        govern your access to and use of the Service. By creating an account or using Vestra, you agree to these Terms.
      </p>

      <h2>1. What Vestra Is</h2>
      <p>
        Vestra generates personalized clothing outfit suggestions based on information you provide (your &quot;Style DNA&quot;)
        and displays links to purchase individual items from third-party retailers. <strong>Vestra does not sell clothing,
        process retail purchases, or take possession of any goods.</strong> All product purchases happen directly on the
        retailer&apos;s own website, under that retailer&apos;s own terms, pricing, and policies.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information when creating an account. You are responsible for maintaining the security
        of your account credentials and for all activity under your account. You must be at least 18 years old to use Vestra.
      </p>

      <h2>3. Subscriptions and Billing</h2>
      <p>
        Vestra offers a free tier (limited monthly stylist requests) and a paid &quot;Pro&quot; tier billed monthly or annually
        through our payment processor, Stripe.
      </p>
      <ul>
        <li>By subscribing to Pro, you authorize us to charge your chosen payment method on a recurring basis until you cancel.</li>
        <li>Subscriptions automatically renew at the then-current price unless canceled before the renewal date.</li>
        <li>
          Cancellation and refunds: You may cancel your subscription at any time through your account settings.
          If you cancel a <strong>monthly</strong> Pro plan, you will receive a full refund of your most recent
          monthly payment. If you cancel an <strong>annual</strong> Pro plan, you will receive a prorated refund
          for the unused portion of the paid year only (based on days remaining in the current billing period).
          You will not be charged again after cancellation.
        </li>
      </ul>

      <h2>4. Third-Party Retailers and Purchases</h2>
      <p>Any purchase you make by clicking a product link on Vestra is a transaction solely between you and that retailer. Vestra:</p>
      <ul>
        <li>Does not guarantee the availability, price, quality, or accuracy of any product listed</li>
        <li>Is not responsible for order fulfillment, shipping, returns, refunds, or customer service related to retailer purchases</li>
        <li>May receive a commission or affiliate fee from retailers when you make a purchase through a Vestra link, at no additional cost to you</li>
        <li>Is not liable for any loss or damage arising from your dealings with any third-party retailer</li>
      </ul>
      <p>You should review each retailer&apos;s own terms, return policy, and privacy practices before purchasing.</p>

      <h2>5. No Guarantee of Styling Outcomes</h2>
      <p>
        Outfit suggestions are generated using AI and are provided for informational and inspirational purposes only.
        Vestra makes no guarantee that suggested items will fit, suit your taste, match in person as shown, or be
        appropriate for any particular occasion. You are solely responsible for your purchasing decisions.
      </p>

      <h2>6. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose</li>
        <li>Attempt to access another user&apos;s account or data</li>
        <li>Reverse-engineer, scrape, or resell the Service or its outputs at scale</li>
        <li>Interfere with the security or normal operation of the Service</li>
      </ul>

      <h2>7. Intellectual Property</h2>
      <p>
        Vestra&apos;s brand, design, software, and AI-generated styling logic are our property or licensed to us.
        Product images, names, and brand names belong to their respective retailers/owners.
      </p>

      <h2>8. Disclaimer of Warranties</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, express or implied,
        including merchantability, fitness for a particular purpose, or non-infringement.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, Vestra and its owner(s) shall not be liable for any indirect, incidental,
        special, consequential, or punitive damages, or any loss of profits or revenues, arising from your use of the Service
        or any third-party retailer transaction. Our total liability for any claim relating to the Service shall not exceed
        the amount you paid us in the 12 months preceding the claim.
      </p>

      <h2>10. Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time for violation of these Terms or for any other
        reason, with or without notice.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes
        acceptance of the revised Terms.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the Province of Quebec and the federal laws of Canada applicable therein,
        without regard to conflict of law principles.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{" "}
        <a href="mailto:support@wearvestra.com">support@wearvestra.com</a>.
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Vestra Privacy Policy">
      <p>
        This Privacy Policy explains how Vestra (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) collects, uses, and protects your
        information when you use wearvestra.com (the &quot;Service&quot;).
      </p>

      <h2>1. Information We Collect</h2>
      <p>
        <strong>Account information:</strong> Name, email address, and password (securely hashed) when you create an account.
      </p>
      <p>
        <strong>Style DNA:</strong> Your styling preferences, including archetype, fit preferences, lifestyle, and color palette,
        which you provide to personalize your outfit recommendations.
      </p>
      <p>
        <strong>Billing information:</strong> If you subscribe to Vestra Pro, our payment processor, Stripe, collects and processes
        your payment card details. Vestra does not store your full card number — only a subscription status and a Stripe customer
        reference ID.
      </p>
      <p>
        <strong>Usage data:</strong> Your stylist requests (e.g. &quot;wedding,&quot; &quot;casual weekend&quot;) and saved outfits,
        used to generate and improve your recommendations.
      </p>
      <p>
        <strong>Automatically collected information:</strong> Standard technical data such as IP address, browser type, and device
        information, collected for security and basic analytics.
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Generate personalized outfit recommendations</li>
        <li>Maintain your account and saved outfits</li>
        <li>Process subscription payments and manage billing</li>
        <li>Improve and troubleshoot the Service</li>
        <li>Communicate with you about your account or changes to the Service</li>
      </ul>

      <h2>3. How We Store Your Information</h2>
      <p>
        Your account and Style DNA data are stored securely using Supabase, with row-level security ensuring you can only access
        your own data. Payment information is handled entirely by Stripe, a PCI-compliant payment processor — we do not store
        your raw card details on our servers.
      </p>

      <h2>4. Third-Party Retailers</h2>
      <p>
        When you click a product link on Vestra, you leave our Service and go to the retailer&apos;s own website. We do not share
        your Style DNA, account information, or personal data with these retailers. Any information you provide directly to a
        retailer (e.g. during checkout) is governed by that retailer&apos;s own privacy policy, not this one.
      </p>
      <p>
        We may earn an affiliate commission when you purchase through a Vestra link. This does not affect the price you pay, and
        does not involve sharing your personal data with the retailer.
      </p>

      <h2>5. Data Sharing</h2>
      <p>We do not sell your personal information. We share data only with:</p>
      <ul>
        <li><strong>Supabase</strong> (database hosting)</li>
        <li><strong>Stripe</strong> (payment processing)</li>
        <li>
          <strong>Anthropic</strong> (AI provider used to generate outfit recommendations — your stylist requests may be sent to
          generate a response, but this is not used to identify you personally)
        </li>
        <li>Law enforcement or regulators, if legally required</li>
      </ul>

      <h2>6. Your Rights</h2>
      <p>You may:</p>
      <ul>
        <li>Access, update, or delete your Style DNA and account information at any time through your account settings</li>
        <li>Request a copy of the personal data we hold about you</li>
        <li>
          Request deletion of your account and associated data by contacting us at{" "}
          <a href="mailto:support@wearvestra.com">support@wearvestra.com</a>
        </li>
        <li>Cancel your subscription at any time</li>
      </ul>
      <p>
        If you are in the EU/UK, you have additional rights under GDPR (e.g. data portability, right to object). If you are a
        California resident, you have rights under the CCPA/CPRA.
      </p>

      <h2>7. Data Retention</h2>
      <p>
        We retain your account data for as long as your account is active. If you delete your account, we will delete your
        personal data within 30 days, except where retention is required for legal, tax, or billing record purposes.
      </p>

      <h2>8. Children&apos;s Privacy</h2>
      <p>
        Vestra is not directed at individuals under 18, and we do not knowingly collect information from anyone under 18.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated
        policy with a new &quot;Last updated&quot; date.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about this Privacy Policy or your data? Contact us at{" "}
        <a href="mailto:support@wearvestra.com">support@wearvestra.com</a>.
      </p>
    </LegalShell>
  );
}

export function resolveLegalPath(pathname = "/") {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/terms") return "terms";
  if (p === "/privacy") return "privacy";
  return null;
}

export default function LegalRouter() {
  const kind = resolveLegalPath(typeof window !== "undefined" ? window.location.pathname : "/");
  if (kind === "terms") return <TermsPage />;
  if (kind === "privacy") return <PrivacyPage />;
  return null;
}
