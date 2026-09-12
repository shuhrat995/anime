"use client";

import {
  apiFetch,
  ApiError,
  type AuthResult,
  type Tokens,
  type User,
} from "@/lib/api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Session = { user: User; tokens: Tokens };

type AuthContextValue = {
  ready: boolean;
  user: User | null;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string) => Promise<User>;
  uploadAvatar: (file: File) => Promise<User>;
};

const STORAGE_KEY = "zenith.user.session";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  const saveSession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    // One-time client hydration of the persisted session. localStorage is unavailable during SSR,
    // so this must run in an effect — a lazy useState initializer would cause a hydration mismatch.
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only session restore
      if (saved) saveSession(JSON.parse(saved) as Session);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setReady(true);
    }
  }, [saveSession]);

  const setAuthenticated = useCallback(
    (result: AuthResult) => saveSession({ user: result.user, tokens: result.tokens }),
    [saveSession],
  );

  const refresh = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) throw new ApiError("Kirish talab qilinadi.", 401, "UNAUTHORIZED");
    const tokens = await apiFetch<Tokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: active.tokens.refreshToken }),
    });
    const next = { ...active, tokens };
    saveSession(next);
    return next;
  }, [saveSession]);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const active = sessionRef.current;
      try {
        return await apiFetch<T>(path, init, active?.tokens.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || !active) throw error;
        try {
          const renewed = await refresh();
          return await apiFetch<T>(path, init, renewed.tokens.accessToken);
        } catch (refreshError) {
          saveSession(null);
          throw refreshError;
        }
      }
    },
    [refresh, saveSession],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      setAuthenticated(
        await apiFetch<AuthResult>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
    },
    [setAuthenticated],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      setAuthenticated(
        await apiFetch<AuthResult>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, displayName }),
        }),
      );
    },
    [setAuthenticated],
  );

  const verifyEmail = useCallback(
    async (token: string) => {
      await apiFetch("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      const active = sessionRef.current;
      if (active) saveSession({ ...active, user: { ...active.user, emailVerified: true } });
    },
    [saveSession],
  );

  const resendVerification = useCallback(async () => {
    await apiFetch("/auth/resend-verification", { method: "POST", body: "{}" }, sessionRef.current?.tokens.accessToken);
  }, []);

  const logout = useCallback(async () => {
    const active = sessionRef.current;
    try {
      if (active) await apiFetch("/auth/logout", { method: "POST", body: "{}" }, active.tokens.accessToken);
    } finally {
      saveSession(null);
    }
  }, [saveSession]);

  const updateProfile = useCallback(
    async (displayName: string) => {
      const user = await request<User>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      const active = sessionRef.current;
      if (active) saveSession({ ...active, user });
      return user;
    },
    [request, saveSession],
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const user = await request<User>("/users/me/avatar", { method: "POST", body: formData });
      const active = sessionRef.current;
      if (active) saveSession({ ...active, user });
      return user;
    },
    [request, saveSession],
  );

  return (
    <AuthContext.Provider
      value={{
        ready,
        user: session?.user ?? null,
        request,
        login,
        register,
        verifyEmail,
        resendVerification,
        logout,
        updateProfile,
        uploadAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
