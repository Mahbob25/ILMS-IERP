"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { apiClient } from "@/lib/api";

export interface PortalUser {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  locale_pref: string;
  is_active: boolean;
}

interface AuthContextType {
  user: PortalUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PortalUser>;
  ssoLogin: (ticket: string) => Promise<PortalUser>;
  logout: () => Promise<void>;
  checkSession: () => Promise<PortalUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isLoggingOut = useRef(false);
  const isSsoInProgress = useRef(false);
  const pendingCheckSession = useRef<Promise<PortalUser | null> | null>(null);

  const checkSession = useCallback(async (): Promise<PortalUser | null> => {
    if (isLoggingOut.current) {
      setLoading(false);
      return null;
    }
    const pending = pendingCheckSession.current;
    if (pending) return pending;
    const promise = (async () => {
      try {
        const response = await apiClient.get<PortalUser>("/auth/me");
        if (!isLoggingOut.current) {
          setUser(response.data);
        }
        return response.data;
      } catch {
        // Don't clear the user if an SSO exchange is mid-flight — the
        // mount-time /auth/me (no cookies yet) would otherwise race the SSO
        // POST, wipe the just-authenticated user, and bounce back to login.
        if (!isLoggingOut.current && !isSsoInProgress.current) {
          setUser(null);
        }
        return null;
      } finally {
        setLoading(false);
        pendingCheckSession.current = null;
      }
    })();
    pendingCheckSession.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<PortalUser> => {
      setLoading(true);
      try {
        const response = await apiClient.post<PortalUser>("/auth/login", {
          email,
          password,
        });
        setUser(response.data);
        return response.data;
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const ssoLogin = useCallback(
    async (ticket: string): Promise<PortalUser> => {
      isSsoInProgress.current = true;
      setLoading(true);
      try {
        const response = await apiClient.post<PortalUser>("/auth/sso", { ticket });
        setUser(response.data);
        return response.data;
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        isSsoInProgress.current = false;
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    isLoggingOut.current = true;
    pendingCheckSession.current = null;
    setLoading(true);
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Intentionally swallow — clear local state even if the API call fails
    } finally {
      setUser(null);
      setLoading(false);
      // After logout, send students/parents back to the public landing page.
      const marketingBase = process.env.NEXT_PUBLIC_MARKETING_URL || "https://aldirasat.vercel.app";
      const locale = (typeof window !== "undefined" ? window.location.pathname.match(/^\/(en|ar)/)?.[1] : null) || "ar";
      window.location.href = `${marketingBase}/${locale}`;
    }
  }, []);

  const contextValue = useMemo(
    () => ({ user, loading, login, ssoLogin, logout, checkSession }),
    [user, loading, login, ssoLogin, logout, checkSession]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
