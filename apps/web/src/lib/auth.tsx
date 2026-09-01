import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  api,
  getStoredAccessToken,
  setStoredAuthTokens,
  clearStoredAuth,
  USER_STORAGE_KEY,
} from './api.ts';

const ENV_STORAGE_KEY = 'safero_env';

// ── Types ────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  merchantId?: string;
  isDemo?: boolean;
}

export type PlatformEnvironment = 'live' | 'demo';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  environment: PlatformEnvironment;
  setEnvironment: (env: PlatformEnvironment) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  loginDemo: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

// ── Context ──────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [environment, setEnvironmentState] = useState<PlatformEnvironment>('live');

  // Rehydrate auth state and environment on mount
  useEffect(() => {
    try {
      const token = getStoredAccessToken();
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);

      if (token && storedUser) {
        const parsedUser: AuthUser = JSON.parse(storedUser);
        if (!parsedUser.merchantId) {
          parsedUser.merchantId = parsedUser.id;
        }
        setUser(parsedUser);
        const lockedEnv: PlatformEnvironment = parsedUser.isDemo ? 'demo' : 'live';
        setEnvironmentState(lockedEnv);
        localStorage.setItem(ENV_STORAGE_KEY, lockedEnv);
      } else {
        clearStoredAuth();
        setUser(null);
      }
    } catch {
      clearStoredAuth();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setEnvironment = (env: PlatformEnvironment) => {
    // Only demo accounts can be in demo mode; real users are always locked to live
    const effectiveEnv: PlatformEnvironment = user?.isDemo ? 'demo' : 'live';
    setEnvironmentState(effectiveEnv);
    localStorage.setItem(ENV_STORAGE_KEY, effectiveEnv);
  };

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.login(email.trim(), password);
      const isDemoUser = res.user.email.includes('demo');
      const authUser: AuthUser = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.full_name || 'Risk Analyst',
        role: res.user.role || 'analyst',
        merchantId: res.user.merchant_id || res.user.id,
        isDemo: isDemoUser,
      };

      setStoredAuthTokens(res.access_token, res.refresh_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authUser));
      setUser(authUser);

      const targetEnv = isDemoUser ? 'demo' : 'live';
      setEnvironment(targetEnv);

      return { success: true };
    } catch (err: any) {
      console.error('Login authentication error:', err);
      return {
        success: false,
        error: err?.message || 'Invalid email or password. Please verify your credentials.',
      };
    }
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.register(email.trim(), password, fullName.trim());
      const authUser: AuthUser = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.full_name || fullName.trim(),
        role: res.user.role || 'analyst',
        merchantId: res.user.merchant_id || res.user.id,
        isDemo: false,
      };

      setStoredAuthTokens(res.access_token, res.refresh_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authUser));
      setUser(authUser);
      setEnvironment('live');

      return { success: true };
    } catch (err: any) {
      console.error('Registration error:', err);
      return {
        success: false,
        error: err?.message || 'Registration failed. Please try again.',
      };
    }
  };

  // Real authentication for Demo Account using seeded demo credentials against real login endpoint
  const loginDemo = async (): Promise<{ success: boolean; error?: string }> => {
    return login('demo@safero.internal', 'SafeRo#Demo2026!');
  };

  const logout = () => {
    api.logout().catch(() => {});
    clearStoredAuth();
    setUser(null);
  };

  const isAuthenticated = !!(user && getStoredAccessToken());

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        environment,
        setEnvironment,
        login,
        register,
        loginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
