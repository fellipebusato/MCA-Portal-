"use client";

import { useState } from "react";
import { CONTACT, PORTAL } from "@/lib/config";

type ConsentPageProps = {
  userEmail: string;
  onAgree: () => void;
  onDecline: () => void;
};

export default function ConsentPage({ userEmail, onAgree, onDecline }: ConsentPageProps) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleAgree() {
    if (!checked) return;
    setLoading(true);
    onAgree();
  }

  return (
    <main className="min-h-screen bg-[#f4f4f0] flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{PORTAL.name} — Terms of Access</h1>
          <p className="text-sm text-gray-400 mt-1">Please read and agree before accessing your account</p>
        </div>

        {/* Terms card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden mb-4">

          {/* Notice banner */}
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0">
              <path d="M8 5v4M8 11v.5" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="6.5" stroke="#92400e" strokeWidth="1"/>
            </svg>
            <p className="text-xs text-amber-800">
              This portal is an independent personal service operated by <strong>{CONTACT.name}</strong>. 
              It is not an official system of, affiliated with, or endorsed by CFG Merchant Solutions 
              or any lender. Official account records are maintained by your lender directly.
            </p>
          </div>

          {/* Terms content */}
          <div className="px-6 py-5 space-y-5 text-sm text-gray-600 leading-relaxed max-h-96 overflow-y-auto">

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">1. Nature of this portal</h2>
              <p>
                The {PORTAL.name} (&quot;Portal&quot;) is a personal organizational tool operated independently 
                by {CONTACT.name} as a courtesy service to clients he personally works with. This Portal 
                is <strong>not affiliated with, endorsed by, operated on behalf of, or an official system 
                of CFG Merchant Solutions, any lender, or any other financial institution.</strong> It is 
                solely a personal service provided by {CONTACT.name} in his individual capacity.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">2. Informational purposes only</h2>
              <p>
                All information displayed — including funded amounts, payback amounts, payment history, 
                running balances, and account standing — is provided for <strong>informational and 
                organizational purposes only</strong>. This Portal does not constitute a legal or financial 
                document, a binding statement of account, or an official record of any kind. 
                For official account information, contact your lender directly.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">3. No affiliation with any lender</h2>
              <p>
                {CONTACT.name} operates this Portal entirely independently. Any references to financing 
                products, payment schedules, or account balances reflect information maintained by 
                {CONTACT.name} for personal organizational purposes only and do not represent 
                official communications from any lender or financial institution.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">4. Data accuracy</h2>
              <p>
                While reasonable efforts are made to keep information current, {CONTACT.name} makes 
                no warranties regarding the completeness, accuracy, or timeliness of data shown. 
                Payment records may reflect processing delays. Always verify account details 
                directly with your lender for any financial decisions.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">5. Privacy and data use</h2>
              <p>
                This Portal stores your business name, invoice number, email address, and payment 
                activity records solely to display your account information to you. This data is 
                not sold, shared with third parties, or used for any purpose other than operating 
                this Portal. Access is restricted to your individual account only.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">6. No financial or legal advice</h2>
              <p>
                Nothing in this Portal constitutes financial advice, legal advice, or a recommendation 
                of any kind. {CONTACT.name} is not a licensed financial advisor or attorney. 
                For questions regarding your financing agreement or legal rights, consult a 
                qualified professional.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">7. Limitation of liability</h2>
              <p>
                To the fullest extent permitted by applicable law, {CONTACT.name} shall not be liable 
                for any damages arising from your use of this Portal, including reliance on 
                information displayed herein. Use of this Portal is at your own risk.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">8. Disputes and discrepancies</h2>
              <p>
                If you believe any information is incorrect, contact your lender directly to resolve 
                discrepancies. This Portal is not the appropriate channel for formal disputes 
                regarding any financing agreement.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">9. Governing law</h2>
              <p>
                These terms are governed by the laws of the State of Florida. Any disputes arising 
                from your use of this Portal shall be subject to the exclusive jurisdiction of the 
                courts of the State of Florida.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">10. Contact</h2>
              <p>
                For questions regarding this Portal: <strong>{CONTACT.email}</strong> · <strong>{CONTACT.phone}</strong>
              </p>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Last updated: May 4, 2026 · {PORTAL.version} · Governing jurisdiction: State of Florida
              </p>
            </div>
          </div>
        </div>

        {/* Consent checkbox */}
        <div className="rounded-xl bg-white border border-gray-100 px-5 py-4 mb-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 flex-shrink-0 cursor-pointer"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              I, the authorized representative of the account associated with{" "}
              <strong>{userEmail}</strong>, have read and understood the terms above. 
              I acknowledge that this Portal is an independent personal service operated 
              by {CONTACT.name} and is <strong>not an official system of any lender or 
              financial institution</strong>. I agree to these terms and consent to access this Portal.
            </span>
          </label>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleAgree}
            disabled={!checked || loading}
            className={`flex-1 rounded-xl py-3 text-sm font-medium transition-colors ${
              checked
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {loading ? "Recording your consent..." : "I agree — access my account"}
          </button>

          <button
            onClick={onDecline}
            className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Decline
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Your agreement is recorded with a timestamp for your protection.
        </p>

        {/* Footer disclaimer */}
        <p className="text-center text-[10px] text-gray-300 mt-3 leading-relaxed">
          {PORTAL.disclaimer}
        </p>
      </div>
    </main>
  );
}