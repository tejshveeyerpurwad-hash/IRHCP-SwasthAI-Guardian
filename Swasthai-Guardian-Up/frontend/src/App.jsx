import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import DiSHAConsentModal, { useConsentGiven } from './components/DiSHAConsentModal';

// Pages
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import VillagerDashboard from './Villager/VillagerDashboard';
import NGODashboard from './NGO/NGODashboard';
import AdminDashboard from './Admin/AdminDashboard';
import IntroFlow from './pages/IntroFlow';
import RegisterPage from './pages/RegisterPage';
import SymptomCheckerPage from './pages/SymptomCheckerPage';
import SkinDiseaseCheckerPage from './pages/SkinDiseaseCheckerPage';
import AmbulancePage from './pages/AmbulancePage';
import UserProfile from './pages/UserProfile';
import MenstrualHealth from './pages/MenstrualHealth';
import MaternalHealthPage from './pages/MaternalHealthPage';
import ChildNutritionPage from './pages/ChildNutritionPage';

// Components
import Footer from './components/Footer';
import OfflineToast from './components/OfflineToast';

// Protected Route wrapper to ensure only authorized users access roles
const ProtectedRoute = ({ children, allowedRole }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRole && user.role !== allowedRole) return <Navigate to="/" replace />;
  return children;
};

// Shows DISHA consent modal once per device after first login
function ConsentGate({ children }) {
  const { user } = useAuth();
  const [consented, setConsented] = useState(useConsentGiven);
  const needsConsent = user && !consented;
  return (
    <>
      {children}
      <AnimatePresence>
        {needsConsent && (
          <DiSHAConsentModal onConsent={() => setConsented(true)} />
        )}
      </AnimatePresence>
    </>
  );
}

// Layout wrapper to include footer on all pages
const LayoutWrapper = ({ children }) => (
  <>
    {children}
    <Footer />
  </>
);

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ConsentGate>
        <Router>
          <div className="font-inter">
            <Routes>
              {/* MANDATORY INTRO FLOW SEQUENCE */}
              <Route path="/" element={<IntroFlow />} />
              <Route path="/intro" element={<IntroFlow />} />
              
              {/* AUTHENTICATION AXIS */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* CORE DOMAINS - Role Specific Dashboards */}
              <Route path="/home" element={
                <ProtectedRoute>
                  <LayoutWrapper><LandingPage /></LayoutWrapper>
                 </ProtectedRoute>
              } />

              <Route path="/villager" element={
                <ProtectedRoute allowedRole="villager">
                   <LayoutWrapper><VillagerDashboard /></LayoutWrapper>
                </ProtectedRoute>
              } />

              {/* FEATURE PAGES (STANDALONE) */}
              <Route path="/symptoms" element={
                <ProtectedRoute allowedRole="villager">
                   <LayoutWrapper><SymptomCheckerPage /></LayoutWrapper>
                </ProtectedRoute>
              } />
              
              <Route path="/skin-disease" element={
                <ProtectedRoute allowedRole="villager">
                   <LayoutWrapper><SkinDiseaseCheckerPage /></LayoutWrapper>
                </ProtectedRoute>
              } />

              <Route path="/ambulance" element={
                <ProtectedRoute allowedRole="villager">
                   <LayoutWrapper><AmbulancePage /></LayoutWrapper>
                </ProtectedRoute>
              } />

              <Route path="/profile" element={
                <ProtectedRoute>
                   <LayoutWrapper><UserProfile /></LayoutWrapper>
                </ProtectedRoute>
              } />

              <Route path="/menstrual-health" element={
                <ProtectedRoute allowedRole="villager">
                   <LayoutWrapper><MenstrualHealth /></LayoutWrapper>
                </ProtectedRoute>
              } />

              {/* NGO/ADMIN DOMAINS */}
              <Route path="/ngo" element={
                <ProtectedRoute allowedRole="ngo">
                   <NGODashboard />
                </ProtectedRoute>
              } />
              <Route path="/ngo/maternal" element={
                <ProtectedRoute allowedRole="ngo">
                   <MaternalHealthPage />
                </ProtectedRoute>
              } />
              <Route path="/ngo/child-nutrition" element={
                <ProtectedRoute allowedRole="ngo">
                   <ChildNutritionPage />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute allowedRole="admin">
                   <AdminDashboard />
                </ProtectedRoute>
              } />
            </Routes>
            {/* YouTube-style offline toast — appears on every page when data cuts */}
            <OfflineToast />
          </div>
        </Router>
        </ConsentGate>
      </AuthProvider>
    </LanguageProvider>
  );
}
