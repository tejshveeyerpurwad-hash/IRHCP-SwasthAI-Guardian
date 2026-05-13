import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeartPulse, ArrowRight, BrainCircuit, Users, Truck,
  Globe, Shield, PhoneCall, Zap, MapPin, Droplets, Camera, Check,
  Activity, ShieldCheck, Database, Layout
} from 'lucide-react';

export default function IntroFlow() {
  const [step, setStep] = useState(0); // 0: Loading/Splash, 1: Language, 2: Services
  const navigate = useNavigate();
  const { lang, setLang, t } = useLanguage();

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      navigate('/register');
    }
  };

  const languages = [
    { code: 'hi', label: 'हिन्दी', sub: 'Hindi', icon: <Globe className="w-5 h-5" /> },
    { code: 'en', label: 'English', sub: 'English', icon: <Globe className="w-5 h-5" /> },
    { code: 'bn', label: 'বাংলা', sub: 'Bengali', icon: <Globe className="w-5 h-5" /> },
    { code: 'mr', label: 'मराठी', sub: 'Marathi', icon: <MapPin className="w-5 h-5" /> },
    { code: 'ta', label: 'தமிழ்', sub: 'Tamil', icon: <MapPin className="w-5 h-5" /> },
    { code: 'te', label: 'తెలుగు', sub: 'Telugu', icon: <MapPin className="w-5 h-5" /> },
  ];

  useEffect(() => {
    let timer;
    if (step === 0) timer = setTimeout(() => setStep(1), 3500);
    return () => clearTimeout(timer);
  }, [step]);

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.98 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { staggerChildren: 0.15, duration: 0.8, ease: "easeOut" }
    },
    exit: { opacity: 0, scale: 1.05, transition: { duration: 0.5 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <div className="flex bg-[#F8FAFC] min-h-screen items-center justify-center font-inter p-6 sm:p-12 overflow-hidden selection:bg-emerald-100 selection:text-emerald-900">

      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-emerald-50 rounded-full blur-[120px] opacity-60" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-50 rounded-full blur-[100px] opacity-40" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-[0.03]" />
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 0: Splash / Protocol Initialization */}
        {step === 0 && (
          <motion.div
            key="splash"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center text-center max-w-lg z-10 px-4"
          >
            <motion.div
              className="relative mb-10 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              {/* Soft Inner Glow */}
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute w-24 h-24 bg-emerald-400/30 rounded-full blur-xl pointer-events-none"
              />
              
              {/* Outer Pulse */}
              <motion.div
                animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                className="absolute w-16 h-16 border-2 border-emerald-400/50 rounded-full pointer-events-none"
              />

              {/* Central Logo Container */}
              <motion.div 
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-16 h-16 bg-[#0A2E24] rounded-[1.2rem] flex items-center justify-center shadow-2xl relative z-10 border-2 border-emerald-500/20"
              >
                <HeartPulse className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              </motion.div>
              
              {/* Orbiting Tech Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                className="absolute w-[180%] h-[180%] border border-emerald-400/20 rounded-full border-dashed pointer-events-none flex items-center justify-center"
              >
                 <div className="absolute top-0 w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              </motion.div>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter">
                {t.intro?.welcome_title || 'SwasthAI'}
              </h1>
              <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100 shadow-sm mx-auto">
                <Activity className="w-4 h-4 animate-pulse" />
                <span className="text-[11px] uppercase tracking-widest">{t.intro?.welcome_sub || 'Offline AI Healthcare'}</span>
              </div>

              <div className="flex items-center justify-center gap-6 pt-8">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Offline-First</span>
                </div>
                <div className="w-8 h-[1px] bg-slate-200" />
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Secure AI</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* STEP 1: Language Localization Selection */}
        {step === 1 && (
          <motion.div
            key="language"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center w-full max-w-4xl z-10"
          >
            <div className="mb-8 sm:mb-12 text-center space-y-3">
              <motion.div variants={itemVariants} className="w-16 h-16 sm:w-20 sm:h-20 bg-[#0A2E24] rounded-3xl flex items-center justify-center mb-4 sm:mb-6 mx-auto shadow-2xl">
                <Globe className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400 animate-pulse" />
              </motion.div>
              <motion.h2 variants={itemVariants} className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tighter leading-tight">
                {t.intro?.select_title || 'Choose Your Language'}
              </motion.h2>
              <motion.p variants={itemVariants} className="text-slate-500 font-bold text-xs sm:text-sm uppercase tracking-widest">
                {t.intro?.select_sub || 'Select the language you prefer.'}
              </motion.p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl mb-12 px-4">
              {languages.map((l) => (
                <motion.div
                  key={l.code}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setLang(l.code)}
                  className={`relative cursor-pointer p-4 sm:p-5 rounded-2xl border-2 transition-all duration-300 flex items-center text-left gap-4 ${lang === l.code ? 'bg-white border-emerald-500 shadow-[0_16px_32px_-8px_rgba(16,185,129,0.2)]' : 'bg-slate-50 border-slate-100 hover:border-emerald-200'}`}
                >
                  <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center transition-all ${lang === l.code ? 'bg-emerald-600 text-white rotate-6' : 'bg-white text-slate-300'}`}>
                    {l.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-xl font-black tracking-tighter ${lang === l.code ? 'text-slate-900' : 'text-slate-400'}`}>
                      {l.label}
                    </h3>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${lang === l.code ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {l.sub}
                    </p>
                  </div>
                  {lang === l.code && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 shrink-0 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white"
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05, boxShadow: "0_20px_40px_-10px_rgba(16,185,129,0.3)" }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              className="w-full sm:w-auto px-12 py-5 bg-slate-900 hover:bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-2xl mx-4 sm:mx-0"
            >
              {t.intro?.establish_sync || 'Continue'}
              <ArrowRight className="w-5 h-5 fill-current text-white" />
            </motion.button>
          </motion.div>
        )}

        {/* STEP 2: Strategic Services Brief */}
        {step === 2 && (
          <motion.div
            key="services"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-center w-full max-w-6xl z-10"
          >
            <div className="mb-8 sm:mb-12 flex flex-col items-center text-center space-y-3">
              <motion.span variants={itemVariants} className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black tracking-widest uppercase rounded-full">
                {t.intro?.assets_title || 'Our Key Services'}
              </motion.span>
              <motion.h2 variants={itemVariants} className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tighter max-w-4xl leading-tight">
                {t.intro?.strategic_title || 'Complete Health Support'}
              </motion.h2>
              <motion.p variants={itemVariants} className="text-slate-500 font-bold text-sm sm:text-base max-w-xl px-4">
                {t.intro?.strategic_desc || 'Fast doctor advice and emergency help for every village.'}
              </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full mb-16">
              {[
                {
                  title: t.intro?.service_1_t || 'Symptom AI',
                  desc: t.intro?.service_1_d || 'Offline-first AI symptom checker in local languages.',
                  icon: <BrainCircuit />,
                  color: 'emerald',
                  tag: 'VILLAGER'
                },
                {
                  title: t.intro?.service_2_t || 'Skin Scan',
                  desc: t.intro?.service_2_d || 'Private edge-AI skin disease analysis using device camera.',
                  icon: <Camera />,
                  color: 'teal',
                  tag: 'VILLAGER'
                },
                {
                  title: t.intro?.service_3_t || 'Ambulance',
                  desc: t.intro?.service_3_d || 'One-tap emergency ambulance dispatch to local district hub.',
                  icon: <Truck />,
                  color: 'rose',
                  tag: 'VILLAGER'
                },
                {
                  title: t.intro?.service_4_t || 'Maternal Care',
                  desc: t.intro?.service_4_d || 'Track pregnancies with WHO-aligned clinical risk scoring.',
                  icon: <HeartPulse />,
                  color: 'pink',
                  tag: 'NGO / ASHA'
                },
                {
                  title: t.intro?.service_5_t || 'Child Nutrition',
                  desc: t.intro?.service_5_d || 'Monitor malnutrition using automated WHO Z-Score criteria.',
                  icon: <Users />,
                  color: 'amber',
                  tag: 'NGO / ASHA'
                },
                {
                  title: t.intro?.service_6_t || 'District Hub',
                  desc: t.intro?.service_6_d || 'Live ambulance dispatch feed and regional health analytics.',
                  icon: <Layout />,
                  color: 'blue',
                  tag: 'ADMIN'
                },
              ].map((srv, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  whileHover={{ y: -8, boxShadow: "0 40px 80px -20px rgba(0,0,0,0.08)" }}
                  className="group bg-white p-5 sm:p-6 rounded-[2rem] border border-slate-100 transition-all flex flex-col gap-4 relative overflow-hidden shadow-sm"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none group-hover:scale-150 transition-transform duration-1000">
                    {srv.icon}
                  </div>
                  <div className={`w-14 h-14 rounded-2xl bg-slate-50 text-slate-900 flex items-center justify-center transition-all duration-700 group-hover:bg-[#0A2E24] group-hover:text-emerald-400 group-hover:rotate-12 clinical-neon-emerald`}>
                    <div className="w-6 h-6">{srv.icon}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[8px] font-black uppercase tracking-[0.2em] rounded-md transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-600 font-inter">
                        {srv.tag}
                      </span>
                    </div>
                    <h4 className="text-xl font-black text-slate-900 mb-2 tracking-tighter uppercase leading-tight">{srv.title}</h4>
                    <p className="text-slate-500 font-bold text-xs sm:text-sm leading-relaxed">{srv.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05, boxShadow: "0 20px 40px -10px rgba(16,185,129,0.3)" }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              className="group w-full sm:w-auto px-12 py-5 bg-slate-900 hover:bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-4 mx-4 sm:mx-0 shadow-xl"
            >
              {t.intro?.protocol_awareness || 'Get Started'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Strategic Progress Indicator */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-700 ${step === i ? 'w-12 bg-slate-900' : 'w-4 bg-slate-200'}`}
          />
        ))}
      </div>
    </div>
  );
}
