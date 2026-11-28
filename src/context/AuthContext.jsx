import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import * as session from '../lib/auth.js';

const AuthContext = createContext(null);

function noticeFor(reason) {
  if (reason === 'session-expired') return 'Session expired or revoked. Sign in again.';
  return '';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.getUser());
  const [status, setStatus] = useState(() => session.getToken() ? 'restoring' : 'anonymous');
  const [notice, setNotice] = useState(() => noticeFor(session.getReason()));

  useEffect(() => session.subscribe((next, reason) => {
    setUser(next.user);
    setNotice(noticeFor(reason));
    setStatus(next.token ? 'authenticated' : 'anonymous');
  }), []);

  useEffect(() => {
    let active = true;
    async function restore() {
      if (!session.getToken()) {
        setStatus('anonymous');
        return;
      }
      setStatus('restoring');
      try {
        const current = await api.getCurrentUser();
        if (active) {
          session.setUser(current);
          setStatus('authenticated');
        }
      } catch (error) {
        if (!active) return;
        if (api.isOfflineError(error)) {
          setStatus(session.getToken() ? 'authenticated' : 'anonymous');
          setNotice('Backend unavailable — cached session kept until connectivity returns.');
        } else {
          session.clearSession('session-expired');
          setStatus('anonymous');
        }
      }
    }
    restore();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (username, password) => {
    const issued = await api.login({ username, password });
    session.setSession({ token: issued.access_token, user: null });
    try {
      const current = await api.getCurrentUser();
      session.setUser(current);
      setStatus('authenticated');
      return current;
    } catch (error) {
      session.clearSession('session-expired');
      setStatus('anonymous');
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      session.clearSession('signed-out');
      setStatus('anonymous');
      return;
    }
    session.clearSession('signed-out');
    setStatus('anonymous');
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const result = await api.changePassword({
      current_password: currentPassword,
      new_password: newPassword,
    });
    try {
      const current = await api.getCurrentUser();
      session.setUser(current);
    } catch (error) {
      if (!api.isOfflineError(error)) throw error;
      const cached = session.getUser() || {};
      session.setUser({ ...cached, must_change_password: false });
    }
    setStatus('authenticated');
    return result;
  }, []);

  const refreshUser = useCallback(async () => {
    const current = await api.getCurrentUser();
    session.setUser(current);
    return current;
  }, []);

  const dismissNotice = useCallback(() => setNotice(''), []);

  return (
    <AuthContext.Provider value={{
      user, status, notice, login, logout, changePassword, refreshUser, dismissNotice,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
