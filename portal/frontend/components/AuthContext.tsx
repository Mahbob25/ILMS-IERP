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
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<PortalUser>;
  logout: () => Promise<void>;
  checkSession: () => Promise<PortalUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isLoggingOut = useRef(false);
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
        if (!isLoggingOut.current) {
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

  const requestOtp = useCallback(async (phone: string): Promise<void> => {
    await apiClient.post("/auth/request-otp", { phone });
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, code: string): Promise<PortalUser> => {
      setLoading(true);
      try {
        const response = await apiClient.post<PortalUser>("/auth/verify-otp", {
          phone,
          code,
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
      window.location.href = "/login";
    }
  }, []);

  const contextValue = useMemo(
    () => ({ user, loading, requestOtp, verifyOtp, logout, checkSession }),
    [user, loading, requestOtp, verifyOtp, logout, checkSession]
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
