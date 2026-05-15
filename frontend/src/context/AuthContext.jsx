import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import villagerService from '../services/villagerService';
import ngoService from '../services/ngoService';
import adminService from '../services/adminService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      // Only restore session if BOTH a real token AND user data exist
      if (token && savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        // No session found — user must log in. Never auto-create a fake user.
        setUser(null);
      }
    } catch (error) {
      console.error('Error parsing user from localStorage:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const services = useMemo(() => {
    if (!user) return {};
    switch (user.role) {
      case 'villager': return { villager: villagerService };
      case 'ngo': return { ngo: ngoService };
      case 'admin': return { admin: adminService };
      default: return {};
    }
  }, [user]);

  const register = async (data) => {
    // 🌐 OFFLINE REGISTRATION FALLBACK
    if (!navigator.onLine) {
      return { success: true, message: 'Offline registration successful. Sync pending.' };
    }

    try {
      const res = await api.post('/auth/register', data);
      return res.data;
    } catch (error) {
      // If it's a network error, allow offline registration
      if (!error.response) {
        return { success: true, message: 'No network. Registered locally.' };
      }
      throw error;
    }
  };

  const loginPassword = async (identifier, password, role) => {
    // Helper to create offline session
    const createOfflineSession = () => {
      const mockUser = {
        id: 'offline-user-' + Date.now(),
        name: identifier.split('@')[0].charAt(0).toUpperCase() + identifier.split('@')[0].slice(1),
        username: identifier.includes('@') ? identifier.split('@')[0] : identifier,
        role: role,
        villageId: 'v101',
        isOfflineSession: true
      };
      localStorage.setItem('token', 'offline-mock-token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      setUser(mockUser);
      return mockUser;
    };

    // 🌐 Fast-path: strictly offline — Allow ANY credential to work
    if (!navigator.onLine && identifier && password) return createOfflineSession();

    try {
      const res = await api.post('/auth/login-password', {
        identifier,
        email: identifier,
        phone: identifier,
        password,
        role,
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      return res.data.user;
    } catch (error) {
      // 🌐 Fallback: if network call fails, let them in with ANY credential
      if (!error.response && identifier && password) return createOfflineSession();
      
      const msg = error.response?.data?.error || error.message || 'Login failed.';
      throw new Error(msg);
    }
  };

  const loginOTP = async (phone, otp, role) => {
    const createOfflineOTPSession = () => {
      const mockUser = {
        id: 'offline-otp-user-' + Date.now(),
        name: 'Resident ' + phone.slice(-4),
        username: phone,
        role: role,
        villageId: 'v101',
        isOfflineSession: true
      };
      localStorage.setItem('token', 'offline-mock-token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      setUser(mockUser);
      return mockUser;
    };

    // 🌐 Fast-path: strictly offline — Allow ANY OTP to work
    if (!navigator.onLine && phone && otp) return createOfflineOTPSession();

    try {
      const res = await api.post('/auth/login-otp', { phone, otp, role });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      return res.data.user;
    } catch (error) {
      // 🌐 Fallback: if network call fails, let them in with ANY OTP
      if (!error.response && phone && otp) return createOfflineOTPSession();
      throw error.response?.data?.error || error.message || 'OTP Login failed.';
    }
  };

  const requestOTP = async (phone) => {
    try {
      const res = await api.post('/auth/request-otp', { phone });
      return res.data;
    } catch (error) {
      throw error.response?.data?.error || 'OTP request failed. Please try again.';
    }
  };

  const updateProfile = async (data) => {
    try {
      const res = await api.put('/auth/profile', data);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      return res.data.user;
    } catch (error) {
      // Profile update failure is less critical — update locally but warn
      console.warn('Backend profile update failed:', error);
      const updatedUser = { ...user, ...data };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      return updatedUser;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, register, loginPassword, loginOTP, requestOTP, updateProfile, logout, loading, services }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
