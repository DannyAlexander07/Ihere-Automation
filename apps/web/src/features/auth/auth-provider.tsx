"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, apiRequestRaw, ApiError } from "@/lib/api/api-client";

export type AuthUser = {
  id: string;
  displayName: string;
  email: string | null;
  permissions: string[];
  tenantPermissions: string[];
  clientPermissions: Record<string, string[]>;
  clientIds: string[];
};

type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser>;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  apiFetchResponse: (path: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_MARKER = "ihere.auth.v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const applySession = useCallback((response: AuthResponse) => {
    accessTokenRef.current = response.accessToken;
    window.localStorage.setItem(SESSION_MARKER, "active");
    setUser(response.user);
    setStatus("authenticated");
    return response.accessToken;
  }, []);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    window.localStorage.removeItem(SESSION_MARKER);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refreshAccess = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const refresh = apiRequest<AuthResponse>("auth/refresh", {
      method: "POST",
      body: "{}",
    })
      .then(applySession)
      .catch(() => {
        clearSession();
        return null;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = refresh;
    return refresh;
  }, [applySession, clearSession]);

  useEffect(() => {
    if (window.localStorage.getItem(SESSION_MARKER) === "active") {
      void refreshAccess();
      return;
    }

    const timerId = window.setTimeout(clearSession, 0);
    return () => window.clearTimeout(timerId);
  }, [clearSession, refreshAccess]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<AuthResponse>("auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      applySession(response);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ success: boolean }>("auth/logout", {
        method: "POST",
        body: "{}",
      });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    let token = accessTokenRef.current;
    if (!token) token = await refreshAccess();
    if (!token)
      throw new ApiError("Tu sesión terminó. Ingresa nuevamente.", 401);
    const refreshed = await apiRequest<AuthUser>("auth/me", {}, token);
    setUser(refreshed);
    return refreshed;
  }, [refreshAccess]);

  const apiFetch = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      let token = accessTokenRef.current;
      if (!token) token = await refreshAccess();
      if (!token)
        throw new ApiError("Tu sesión terminó. Ingresa nuevamente.", 401);
      try {
        return await apiRequest<T>(path, init, token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        token = await refreshAccess();
        if (!token) throw error;
        return apiRequest<T>(path, init, token);
      }
    },
    [refreshAccess],
  );

  const apiFetchResponse = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      let token = accessTokenRef.current;
      if (!token) token = await refreshAccess();
      if (!token)
        throw new ApiError("Tu sesión terminó. Ingresa nuevamente.", 401);
      try {
        return await apiRequestRaw(path, init, token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        token = await refreshAccess();
        if (!token) throw error;
        return apiRequestRaw(path, init, token);
      }
    },
    [refreshAccess],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      refreshUser,
      apiFetch,
      apiFetchResponse,
    }),
    [apiFetch, apiFetchResponse, login, logout, refreshUser, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
