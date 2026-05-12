/**
 * DiSHA Consent Modal — SwasthAI Guardian
 *
 * Shown once on first login. Persisted in localStorage so it never
 * appears again after consent is given.
 *
 * Aligns with:
 *   • Digital Information Security in Healthcare Act (DISHA) 2023 — India
 *   • IT (Amendment) Act 2008 — Sensitive Personal Data & Information Rules
 *   • WHO Data Privacy in Digital Health 2023
 *
 * IEEE Tristha Track: demonstrates clinical governance beyond the AI itself.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Lock, Eye, X, CheckCircle, FileText, Heart } from 'lucide-react';

const STORAGE_KEY = 'swasthai_disha_consent_v1';

export function useConsentGiven() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function markConsentGiven() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

const CONSENT_POINTS = [
  {
    icon: Lock,
    color: 'bg-emerald-50 text-emerald-600',
    title: 'Aapka Data Sirf Aapka Hai / Your Data Belongs to You',
    body: 'We store only the health information you choose to share. No data is sold or shared with any third party without your explicit permission.',
    hindi: 'आपका स्वास्थ्य डेटा बेचा नहीं जाता।',
  },
  {
    icon: Eye,
    color: 'bg-blue-50 text-blue-600',
    title: 'Kaun Dekh Sakta Hai? / Who Can See Your Data?',
    body: 'Only your assigned ASHA worker, your village NGO, and the government health system can view your records — no one else.',
    hindi: 'केवल आपकी ASHA दीदी और स्वास्थ्य विभाग।',
  },
  {
    icon: ShieldCheck,
    color: 'bg-rose-50 text-rose-600',
    title: 'DISHA Compliance / डेटा सुरक्षा कानून',
    body: 'SwasthAI follows India\'s Digital Information Security in Healthcare Act (DISHA 2023) and IT Act data protection rules.',
    hindi: 'भारत के डिजिटल स्वास्थ्य डेटा कानून के अनुसार।',
  },
  {
    icon: Heart,
    color: 'bg-pink-50 text-pink-600',
    title: 'Apni Marzi Se / You Are in Control',
    body: 'You can request deletion of all your data at any time by contacting your ASHA worker or visiting the nearest PHC.',
    hindi: 'कभी भी अपना डेटा हटवा सकते हैं।',
  },
];

export default function DiSHAConsentModal({ onConsent }) {
  const [checked, setChecked] = useState(false);
  const [animating, setAnimating] = useState(false);

  const handleAccept = () => {
    if (!checked) return;
    setAnimating(true);
    markConsentGiven();
    // Brief success pause before closing
    setTimeout(() => onConsent(), 800);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.88, y: 32 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 32 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8 my-6 relative"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 ring-4 ring-emerald-100">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <div className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-[0.3em] rounded-full border border-emerald-100 mb-3">
            DISHA 2023 · Data Privacy
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter">
            Aapka Data, Aapka Hak
          </h2>
          <p className="text-slate-400 font-bold text-sm mt-1">
            Your Health Data, Your Rights
          </p>
        </div>

        {/* Consent Points */}
        <div className="space-y-3 mb-7">
          {CONSENT_POINTS.map(({ icon: Icon, color, title, body, hindi }) => (
            <div key={title} className={`flex gap-4 p-4 rounded-2xl border border-slate-100`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-800 mb-0.5">{title}</p>
                <p className="text-[11px] text-slate-500 font-medium leading-snug">{body}</p>
                <p className="text-[10px] text-emerald-600 font-bold mt-1">{hindi}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Checkbox */}
        <label className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all mb-6 ${
          checked ? 'bg-emerald-50 border-emerald-400' : 'bg-slate-50 border-slate-200 hover:border-emerald-200'
        }`}>
          <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
            checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
          }`}>
            {checked && <CheckCircle className="w-4 h-4 text-white" />}
          </div>
          <input type="checkbox" className="hidden" checked={checked} onChange={e => setChecked(e.target.checked)} />
          <div>
            <p className="text-xs font-black text-slate-800">
              Main samjhta/samajhti hoon aur consent deta/deti hoon
            </p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
              I understand and consent to SwasthAI storing my health information
              as described above, in compliance with DISHA 2023 and the IT Act.
            </p>
          </div>
        </label>

        {/* CTA */}
        <button
          onClick={handleAccept}
          disabled={!checked || animating}
          className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg ${
            checked && !animating
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100 active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
        >
          {animating ? (
            <><CheckCircle className="w-4 h-4" /> Consent Recorded — Welcome!</>
          ) : (
            <><ShieldCheck className="w-4 h-4" /> Haan, Main Samjha/Samjhi — I Agree</>
          )}
        </button>

        <p className="text-center text-[9px] text-slate-300 font-medium mt-4">
          SwasthAI Guardian · DISHA 2023 Compliant · IT Act 2008 · WHO Digital Health Privacy 2023
        </p>
      </motion.div>
    </motion.div>
  );
}
