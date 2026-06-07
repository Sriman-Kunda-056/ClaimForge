import { createContext, useContext, useState, type ReactNode } from 'react';

export interface AuthUser {
  username: string;
  name: string;
  role: 'employee' | 'reviewer' | 'admin' | 'ai_agent';
  member_id: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('opd_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('opd_token')
  );

  function login(u: AuthUser, t: string) {
    setUser(u);
    setToken(t);
    localStorage.setItem('opd_user', JSON.stringify(u));
    localStorage.setItem('opd_token', t);
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('opd_user');
    localStorage.removeItem('opd_token');
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
