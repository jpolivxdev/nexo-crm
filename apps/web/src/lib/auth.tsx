import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setCsrfToken } from './api';
import type { Me } from './types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  login(email: string, password: string, totp?: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const accept = useCallback((user: Me | null) => {
    setCsrfToken(user?.csrfToken ?? null);
    setMe(user);
  }, []);

  useEffect(() => {
    api<Me>('/auth/me')
      .then(accept)
      .catch(() => accept(null))
      .finally(() => setLoading(false));
  }, [accept]);

  const login = useCallback(
    async (email: string, password: string, totp?: string) => {
      accept(await api<Me>('/auth/login', { method: 'POST', body: { email, password, totp } }));
    },
    [accept],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    accept(null);
  }, [accept]);

  return <AuthContext value={{ me, loading, login, logout }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider.');
  return ctx;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
