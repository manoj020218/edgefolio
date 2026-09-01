import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiPost, getToken, setToken as persistToken } from './api';

export type AppRole = 'owner' | 'hr-admin' | 'employee';

export interface AuthUser {
  empId: number;
  empCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  role: AppRole;
  passwordMustChange: boolean;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (empCode: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'edgefolio.user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const raw = localStorage.getItem(USER_KEY);
      if (token && raw) {
        try {
          setUser(JSON.parse(raw) as AuthUser);
        } catch {
          localStorage.removeItem(USER_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(empCode: string, password: string): Promise<AuthUser> {
    const res = await apiPost<LoginResponse>('/auth/login', { empCode, password });
    await persistToken(res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }

  async function logout(): Promise<void> {
    await persistToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
