import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import {
  Package, MessageCircle, HeartPulse, BookOpen,
  Mic, AlertTriangle, CheckCircle, Send, X,
  Droplets, Zap, PhoneCall, MapPin, ShieldCheck,
  Bot, User, Loader, WifiOff, BookMarked, CheckCircle2, Calendar
} from 'lucide-react';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

/* ── Pad Request ── */
function PadRequest() {
  const { t } = useLanguage();
  const [village, setVillage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/villager/pad-request', { village });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No Internet? Please tell your ASHA worker directly if you need pads immediately.');
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-center text-center py-12">
      <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-200">
        <CheckCircle className="w-10 h-10 text-white" />
      </div>
      <h3 className="text-2xl font-black text-slate-900 mb-2">{t.menstrual?.request_sent || 'Request Sent!'}</h3>
      <p className="text-slate-500 font-medium mb-6 max-w-sm">{t.menstrual?.request_sent_desc || 'Your ASHA worker has been notified and will contact you shortly. Your request is completely private.'}</p>
      <button onClick={() => { setSuccess(false); setVillage(''); }}
        className="px-6 py-3 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-rose-50 hover:text-rose-700 transition-colors">
        {t.menstrual?.send_another || 'Send Another Request'}
      </button>
    </motion.div>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t.menstrual?.request_pads_title || 'Request Sanitary Pads'}</h2>
        <p className="text-slate-500 font-medium text-sm">{t.menstrual?.request_pads_desc || 'Your ASHA worker will deliver pads privately to your location. This request is completely confidential.'}</p>
      </div>
      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl mb-6 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-emerald-800">{t.menstrual?.private_note || '100% Private — Only your assigned ASHA worker can see this request. No one else will know.'}</p>
      </div>
      {error && <p className="mb-4 text-sm text-rose-600 font-bold bg-rose-50 p-3 rounded-xl">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.menstrual?.your_village || 'Your Village / Area'}</label>
          <div className="relative group">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-rose-500 transition-colors" />
            <input value={village} onChange={e => setVillage(e.target.value)} required
              placeholder={t.menstrual?.village_placeholder || 'e.g. Rampur, Sector 4'}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-500/5 outline-none transition-all placeholder:text-slate-300" />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-4 bg-rose-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <><Loader className="w-4 h-4 animate-spin" /> {t.services.analyzing}</> : <><Package className="w-4 h-4" /> {t.menstrual?.request_btn || 'Request Pads from ASHA Worker'}</>}
        </button>
      </form>
    </div>
  );
}

/* ── Groq RAG-Grounded Health Assistant ──────────────────────────────────── */
// IEEE Tristha Track: Grounded Q&A — every reply shows clinical source citations
const OFFLINE_TIPS = [
  { q: 'Heavy bleeding?',         a: 'Change pad every hour → Go to hospital now.',   src: 'FOGSI Guidelines 2020',   urgency: 'P1' },
  { q: 'Severe period pain?',     a: 'Take paracetamol. If pain is unbearable, see a doctor.', src: 'WHO Reproductive Health', urgency: 'P3' },
  { q: 'How often change pads?',  a: 'Every 4-6 hours. Even light flow, change regularly.', src: 'MoHFW MHM Scheme 2023',   urgency: 'P4' },
  { q: 'Iron-rich foods?',        a: 'Jaggery, spinach, lentils, dates, sesame seeds.',  src: 'ICMR Dietary Guidelines', urgency: 'P4' },
];

const URGENCY_COLORS = {
  P1: 'bg-red-50 border-red-200 text-red-700',
  P2: 'bg-orange-50 border-orange-200 text-orange-700',
  P3: 'bg-amber-50 border-amber-200 text-amber-700',
  P4: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};


function HealthAssistant() {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [messages, setMessages] = useState([
    { role: 'ai', text: t.menstrual?.sakhi_welcome || "Hello! I'm Sakhi, your Women's Health Assistant. I'm here to answer any questions about menstrual health, hygiene, pain, or when to see a doctor. Everything you share is completely private. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Sakhi speaks back! Voice response for rural low-literacy users.
  const speakResponse = (text, lang = 'hi-IN') => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 300)); // Limit to 300 chars
    utterance.lang = lang;
    utterance.rate = 0.85; // Slightly slower for clarity
    utterance.pitch = 1.1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      // ── Call the grounded RAG endpoint ──────────────────────────────────
      const res = await api.post('/health-assistant', { message: userMsg });
      setMessages(prev => [...prev, {
        role:    'ai',
        text:    res.data.reply,
        sources: res.data.sources  || [],
        urgency: res.data.urgency  || 'P4',
      }]);
      // Auto-speak high-urgency responses (P1 and P2 are emergencies)
      if (res.data.urgency === 'P1' || res.data.urgency === 'P2') {
        speakResponse(res.data.reply);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        alert('Your session has expired. Please log in again.');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      setMessages(prev => [...prev, {
        role: 'ai',
        text: t.menstrual?.sakhi_error || 'I could not process your question right now. Please try again, or contact your ASHA worker for immediate help.',
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Voice input is not supported on this device. Please type your message.', isError: true }]);
      return;
    }
    const rec = new SR();
    // Use language context for better rural matching
    const { lang: currentLang } = useLanguage();
    const LANG_MAP = { hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN', mr: 'mr-IN', te: 'te-IN', bn: 'bn-IN' };
    rec.lang = LANG_MAP[currentLang] || 'hi-IN';
    
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => { 
      const text = e.results[0][0].transcript;
      setInput(text); 
      setIsListening(false); 
    };
    rec.onerror = (e) => {
      console.error('[Sakhi Voice Error]', e.error);
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const suggestions = t.menstrual?.sakhi_suggestions || ['How do I manage period pain?', 'What is heavy bleeding?', 'How often should I change pads?', 'My periods are irregular'];

  return (
    <div className="flex flex-col">

      {/* ── OFFLINE FALLBACK KNOWLEDGE CARD ──────────────────────────────── */}
      {/* Shows verified WHO/MoHFW tips even with zero internet */}
      {!isOnline && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl border-2 border-amber-200 bg-amber-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-black text-amber-800">No Internet — Using Offline Knowledge Base</p>
              <p className="text-[10px] text-amber-500 font-medium">Verified WHO/MoHFW guidelines loaded on your device</p>
            </div>
          </div>
          <div className="divide-y divide-amber-100">
            {OFFLINE_TIPS.map((tip, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-xs font-black text-amber-900 mb-0.5">{tip.q}</p>
                <p className="text-xs text-amber-700 font-medium leading-relaxed">{tip.a}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <BookMarked className="w-3 h-3 text-amber-400" />
                  <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">📚 {tip.src}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

        {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="mb-4 p-2.5 sm:p-3 bg-rose-50 border border-rose-100 rounded-xl sm:rounded-2xl flex items-center gap-2.5 sm:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-rose-600 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
        </div>
        <div>
          <p className="font-black text-rose-900 text-[10px] sm:text-xs uppercase tracking-widest leading-none sm:leading-normal">Sakhi-AI · Health Assistant</p>
          <p className="text-[8px] sm:text-[9px] text-rose-400 font-medium leading-none sm:leading-normal mt-0.5 sm:mt-0">Verified WHO/MoHFW guidelines</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isSpeaking && (
            <button onClick={() => window.speechSynthesis.cancel()}
              className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-amber-100 border border-amber-200 text-amber-700 rounded-md sm:rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-widest animate-pulse">
              🔊 Speaking
            </button>
          )}
          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse ${isOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <span className={`text-[8px] sm:text-[10px] font-black uppercase ${isOnline ? 'text-emerald-700' : 'text-amber-600'}`}>
            {isOnline ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── MESSAGES ─────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 max-h-[420px] min-h-[250px]">
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'ai' && (
              <div className="w-8 h-8 bg-rose-600 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md shadow-rose-100">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="max-w-[85%] sm:max-w-[80%] space-y-1.5">
              <div className={`px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[12px] sm:text-[13px] font-medium leading-relaxed relative ${
                m.role === 'user'
                  ? 'bg-slate-900 text-white rounded-tr-sm'
                  : m.isError
                  ? 'bg-red-50 border border-red-200 text-red-800 rounded-tl-sm'
                  : 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm'
              }`}>
                {m.text}
                {m.role === 'ai' && !m.isError && (
                  <div className="absolute -right-1.5 -top-1.5 w-4.5 h-4.5 sm:w-5 sm:h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm border-2 border-white">
                    <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </div>
                )}
              </div>
              {/* ── CITATION CHIPS (Tristha Grounded Q&A) ───────────────────────── */}
              {m.role === 'ai' && !m.isError && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[8px] font-black uppercase tracking-tighter border border-emerald-100">
                    Grounded Protocol Match
                  </span>
                  {m.urgency && m.urgency !== 'P4' && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      URGENCY_COLORS[m.urgency] || URGENCY_COLORS.P4
                    }`}>
                      <Zap className="w-2 h-2" />{m.urgency}
                    </span>
                  )}
                  {(m.sources || []).map((src, si) => (
                    <span key={si} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-full text-[8px] font-bold text-slate-400">
                      📚 {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center shrink-0 mt-1">
                <User className="w-3.5 h-3.5 text-slate-600" />
              </div>
            )}
            {/* Speaker button for AI messages — rural voice accessibility */}
            {m.role === 'ai' && !m.isError && (
              <button
                onClick={() => speakResponse(m.text)}
                title="Listen to this response"
                className="w-6 h-6 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center shrink-0 mt-1 hover:bg-rose-100 transition-colors opacity-60 hover:opacity-100"
              >
                <span className="text-[10px]">🔊</span>
              </button>
            )}
          </motion.div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 bg-rose-100 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="px-4 py-3 bg-white border border-slate-100 rounded-2xl rounded-tl-sm shadow-sm">
              <div className="flex gap-1">
                {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
              </div>
              <p className="text-[9px] text-slate-300 font-medium mt-1">Searching verified guidelines...</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick suggestions */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {suggestions.map(s => (
            <button key={s} onClick={() => setInput(s)}
              className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-full hover:bg-rose-100 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="mt-3 flex items-center gap-2 p-2 bg-white border-2 border-slate-100 rounded-2xl focus-within:border-rose-300 transition-colors">
        <button onClick={startVoice}
          className={`p-2.5 rounded-xl transition-all ${isListening ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500'}`}>
          <Mic className="w-4 h-4" />
        </button>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={isOnline ? 'Ask me anything about your health...' : 'No internet — see verified tips above ↑'}
          disabled={!isOnline}
          className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-300 disabled:opacity-50" />
        <button onClick={handleSend} disabled={loading || !input.trim() || !isOnline}
          className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-rose-600 transition-all disabled:opacity-30 active:scale-95">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

}

/* ── Symptom Checkup ── */

function MenstrualCheckup() {
  const { t } = useLanguage();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const questions = [
    { id: 'heavy',     label: 'Very heavy bleeding',            sub: 'Changing pad every 1-2 hours',     severe: true  },
    { id: 'pain',      label: 'Severe abdominal pain',          sub: 'Pain that stops daily activities',  severe: false },
    { id: 'dizzy',     label: 'Dizziness or fainting',          sub: 'Feeling lightheaded or weak',       severe: true  },
    { id: 'fever',     label: 'Fever with periods',             sub: 'Temperature above 38°C',            severe: true  },
    { id: 'irregular', label: 'Irregular or missed periods',    sub: 'Cycle shorter than 21 or longer than 35 days', severe: false },
    { id: 'clots',     label: 'Large blood clots',              sub: 'Clots larger than a coin',          severe: true  },
  ];

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const analyze = () => {
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      const hasSevere = selected.some(id => questions.find(q => q.id === id)?.severe);
      if (hasSevere) setResult({ 
        type: 'danger', 
        title: 'Immediate Action Needed', 
        msg: 'These symptoms could be serious. Please call 108 (Free Ambulance) or find your ASHA worker immediately.',
        show108: true 
      });
      else if (selected.length > 0) setResult({ type: 'warning', title: 'Seek Advice', msg: 'These symptoms should be discussed with your ASHA worker today.' });
      else setResult({ type: 'safe', title: 'Doing Well', msg: 'No urgent symptoms. Remember to rest and drink plenty of water.' });
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t.menstrual?.symptom_title || 'Symptom Check'}</h2>
        <p className="text-slate-500 font-medium text-sm">{t.menstrual?.symptom_desc || 'Select any symptoms you are currently experiencing. This is not a diagnosis - always consult a doctor for medical advice.'}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {questions.map(q => (
          <button key={q.id} onClick={() => toggle(q.id)}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${selected.includes(q.id) ? 'bg-rose-50 border-rose-400' : 'bg-white border-slate-100 hover:border-rose-200'}`}>
            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${selected.includes(q.id) ? 'bg-rose-600 border-rose-600' : 'border-slate-300'}`}>
              {selected.includes(q.id) && <CheckCircle className="w-3 h-3 text-white" />}
            </div>
            <div>
              <p className={`text-sm font-black leading-tight ${selected.includes(q.id) ? 'text-rose-900' : 'text-slate-700'}`}>{q.label}</p>
              <p className="text-[10px] font-medium text-slate-400 mt-0.5">{q.sub}</p>
            </div>
          </button>
        ))}
      </div>
      <button onClick={analyze} disabled={loading || selected.length === 0}
        className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg disabled:opacity-30 flex items-center justify-center gap-2">
        {loading ? <><Loader className="w-4 h-4 animate-spin" /> Analyzing...</> : (t.menstrual?.check_btn || 'Check My Symptoms')}
      </button>
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className={`p-6 rounded-2xl border-2 ${result.type === 'danger' ? 'bg-red-50 border-red-200' : result.type === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-3 mb-2">
              {result.type === 'danger' ? <AlertTriangle className="w-6 h-6 text-red-600" /> : result.type === 'warning' ? <AlertTriangle className="w-6 h-6 text-amber-600" /> : <CheckCircle className="w-6 h-6 text-emerald-600" />}
              <h3 className={`font-black text-lg ${result.type === 'danger' ? 'text-red-900' : result.type === 'warning' ? 'text-amber-900' : 'text-emerald-900'}`}>{result.title}</h3>
            </div>
            <p className={`font-medium text-sm leading-relaxed ${result.type === 'danger' ? 'text-red-700' : result.type === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`}>{result.msg}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Health Tips ── */
function HealthTips() {
  const { t } = useLanguage();
  const tips = [
    { icon: Droplets, color: 'bg-rose-50 text-rose-600', title: 'Change Pads Regularly', desc: 'Change your sanitary pad every 4–6 hours to prevent infections and odor, even if flow is light.' },
    { icon: HeartPulse, color: 'bg-emerald-50 text-emerald-600', title: 'Eat Iron-Rich Foods', desc: 'Include jaggery (gur), spinach, lentils, and dates in your diet to replenish iron lost during periods.' },
    { icon: Zap, color: 'bg-amber-50 text-amber-600', title: 'Stay Active & Rest', desc: 'Light walks can ease cramps. Rest is equally important — listen to your body and take breaks.' },
    { icon: ShieldCheck, color: 'bg-blue-50 text-blue-600', title: 'Wash Hands Often', desc: 'Always wash your hands with soap before and after changing pads to prevent bacterial infections.' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t.menstrual?.tips_title || 'Health Tips'}</h2>
        <p className="text-slate-500 font-medium text-sm">{t.menstrual?.tips_desc || 'Simple, proven advice for your health and wellbeing during your period.'}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tips.map(t => (
          <div key={t.title} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
            <div className={`w-10 h-10 ${t.color} rounded-xl flex items-center justify-center mb-4`}>
              <t.icon className="w-5 h-5" />
            </div>
            <h3 className="font-black text-slate-900 text-sm mb-1">{t.title}</h3>
            <p className="text-slate-400 font-medium text-xs leading-relaxed">{t.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Subcomponent: Period Cycle Tracker ── */
function PeriodTracker() {
  const { t } = useLanguage();
  const [lastPeriod, setLastPeriod] = useState(localStorage.getItem('swasthai_last_period') || '');
  const [cycleLength] = useState(28); // defaulting to 28 days for rural simplicity

  const calculateNext = () => {
    if (!lastPeriod) return null;
    const date = new Date(lastPeriod);
    date.setDate(date.getDate() + cycleLength);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleSave = (e) => {
    const val = e.target.value;
    setLastPeriod(val);
    localStorage.setItem('swasthai_last_period', val);
  };

  const nextPeriod = calculateNext();

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t.menstrual?.cycle_tracker || 'Cycle Tracker'}</h2>
        <p className="text-slate-500 font-medium text-sm">{t.menstrual?.cycle_desc || 'Track your periods to know when your next one is coming so you can be prepared.'}</p>
      </div>

      <div className="bg-rose-50 border-2 border-rose-100 rounded-[2rem] p-6 text-center">
        <label className="block text-xs font-black text-rose-400 uppercase tracking-widest mb-3">
          First day of your last period
        </label>
        <input 
          type="date" 
          value={lastPeriod} 
          onChange={handleSave}
          className="w-full max-w-xs mx-auto px-4 py-3 rounded-xl border border-rose-200 bg-white text-slate-700 font-bold focus:ring-4 focus:ring-rose-500/20 outline-none transition-all shadow-sm block"
        />
        
        {nextPeriod && (
          <div className="mt-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-rose-200/50 border border-rose-100 mb-4">
              <Calendar className="w-8 h-8 text-rose-500" />
            </div>
            <p className="text-rose-400 font-bold text-xs uppercase tracking-widest mb-1">Expected Next Period</p>
            <p className="text-3xl font-black text-rose-900">{nextPeriod}</p>
            <div className="mt-6 flex items-center justify-center gap-2 text-rose-500 text-sm font-medium">
              <span className="w-2 h-2 bg-rose-400 rounded-full animate-ping" />
              <span>Based on a standard 28-day cycle</span>
            </div>
          </div>
        )}

        {!nextPeriod && (
          <div className="mt-6 p-4 bg-white/60 rounded-xl border border-rose-100/50">
            <p className="text-rose-800/60 font-semibold text-sm">Select a date above to see your next expected period.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function MenstrualHealth() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('assistant');
  const [showEmergency, setShowEmergency] = useState(false);

  const tabs = [
    { id: 'assistant', label: t.menstrual?.ai_assistant || 'AI Assistant',    icon: MessageCircle },
    { id: 'tracker',   label: t.menstrual?.cycle_tracker || 'Cycle Tracker',   icon: Calendar      },
    { id: 'checkup',   label: t.menstrual?.symptom_check || 'Symptom Check',   icon: HeartPulse    },
    { id: 'pads',      label: t.menstrual?.request_pads || 'Request Pads',    icon: Package       },
    { id: 'tips',      label: t.menstrual?.health_tips || 'Health Tips',     icon: BookOpen      },
  ];

  return (
    <div className="min-h-screen bg-[#F7F9FB] font-inter antialiased">
      <Navbar role="villager" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-24">

        {/* Header */}
        <header className="mb-6 sm:mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-0">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-rose-500 rounded-full animate-pulse" />
                <p className="text-[8px] sm:text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] sm:tracking-[0.4em]">{t.menstrual?.safe_private || 'Safe & Private'}</p>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
                {t.menstrual?.title || "Women's Health"}
              </h1>
              <p className="text-slate-500 font-medium mt-1.5 sm:mt-2 text-xs sm:text-sm max-w-md leading-relaxed">
                {t.menstrual?.subtitle || 'AI health guidance, symptom checking, and free pad access - private and confidential.'}
              </p>
            </div>
            <button onClick={() => setShowEmergency(true)}
              className="flex items-center justify-center gap-2 px-5 py-3.5 sm:py-3 bg-rose-600 text-white rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all shrink-0">
              <PhoneCall className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {t.menstrual?.emergency_help || 'Emergency Help'}
            </button>
          </div>
        </header>

        {/* Tab Nav */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-5 sm:mb-6 p-1 sm:p-1.5 bg-white border border-slate-100 rounded-xl sm:rounded-2xl shadow-sm w-full sm:w-fit overflow-x-auto sm:overflow-x-visible no-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-black text-[9px] sm:text-[11px] uppercase tracking-widest transition-all shrink-0 ${activeTab === tab.id ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}>
              <tab.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 shadow-sm p-5 sm:p-8 md:p-10 min-h-[350px] md:min-h-[500px]">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {activeTab === 'assistant' && <HealthAssistant />}
              {activeTab === 'tracker'   && <PeriodTracker />}
              {activeTab === 'checkup'   && <MenstrualCheckup />}
              {activeTab === 'pads'      && <PadRequest />}
              {activeTab === 'tips'      && <HealthTips />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Emergency Modal — extracted to EmergencyModal component below */}
      <AnimatePresence>
        {showEmergency && (
          <EmergencyModal onClose={() => setShowEmergency(false)} t={t} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Emergency Modal (real ASHA alert — replaces fake window.alert) ─────────── */
function EmergencyModal({ onClose, t }) {
  const [alertState, setAlertState] = useState('idle'); // idle | sending | sent | error
  const [errorMsg,   setErrorMsg]   = useState('');

  const handleAlert = async () => {
    setAlertState('sending');
    setErrorMsg('');
    try {
      await api.post('/villager/emergency-alert', {
        alertType: 'menstrual_emergency',
        message:   "Villager pressed Emergency Help button in Women's Health section.",
      });
      setAlertState('sent');
      // Auto-close after 4 seconds on success
      setTimeout(() => { onClose(); setAlertState('idle'); }, 4000);
    } catch (err) {
      console.error('ASHA alert failed:', err);
      setAlertState('error');
      setErrorMsg(
        err.response?.data?.error ||
        'Could not reach server. Please call 108 directly — it is free.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
        className="w-full max-w-md bg-white rounded-[2rem] p-8 shadow-2xl border border-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-600 text-white rounded-2xl">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg">{t.menstrual?.emergency_title || 'Emergency Help'}</h3>
              <p className="text-xs text-slate-400 font-medium">Your ASHA worker will be notified immediately</p>
            </div>
          </div>
          {alertState !== 'sending' && (
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* SUCCESS STATE */}
        {alertState === 'sent' ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center py-6"
          >
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-200">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h4 className="font-black text-slate-900 text-xl mb-2">Alert Sent! ✅</h4>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-4">
              Your ASHA worker has been notified and will contact you shortly. Stay calm — help is coming.
            </p>
            <div className="flex items-center justify-center gap-2 text-emerald-600">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <span className="text-xs font-black uppercase tracking-widest">Closing automatically...</span>
            </div>
          </motion.div>
        ) : (
          <>
            {/* ASHA Worker Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                  <HeartPulse className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ASHA Worker</p>
                  <p className="font-black text-slate-900 text-sm">Your Village ASHA</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-emerald-700 uppercase">On Call</span>
              </div>
            </div>

            <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">
              {t.menstrual?.emergency_desc || 'Press the button below to immediately alert your ASHA worker. She will call you and come to help.'}
            </p>

            {/* ERROR BANNER — shown when API fails */}
            {alertState === 'error' && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-900 font-black text-sm">Alert Failed</p>
                  <p className="text-amber-700 font-medium text-xs mt-0.5 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* PRIMARY: Real backend ASHA alert */}
              <button
                onClick={handleAlert}
                disabled={alertState === 'sending'}
                className="w-full py-4 bg-rose-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg active:scale-95 disabled:opacity-70 flex items-center justify-center gap-3"
              >
                {alertState === 'sending' ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Sending Alert...</>
                ) : (
                  <>{t.menstrual?.alert_asha || 'Alert My ASHA Worker Now'}</>
                )}
              </button>

              {/* SECONDARY: 108 direct call — always visible as safety net */}
              <a
                href="tel:108"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-slate-700 transition-all"
              >
                <PhoneCall className="w-4 h-4" /> {t.menstrual?.call_ambulance || 'Call 108 — Free Ambulance'}
              </a>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
