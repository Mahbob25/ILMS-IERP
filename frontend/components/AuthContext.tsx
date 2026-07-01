"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api";

export interface Role {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  locale_pref: string;
  is_active: boolean;
  is_superadmin: boolean;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  permissions: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  checkSession: () => Promise<User | null>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshPermissions = useCallback(async () => {
    try {
      const res = await apiClient.get<{ permissions: string[] }>("/auth/me/permissions");
      setPermissions(res.data.permissions);
    } catch {
      setPermissions([]);
    }
  }, []);

  const checkSession = useCallback(async (): Promise<User | null> => {
    try {
      const response = await apiClient.get<User>("/users/me");
      setUser(response.data);
      return response.data;
    } catch (error) {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession().then(() => refreshPermissions());
  }, []);

  useEffect(() => {
    if (user) {
      refreshPermissions();
    }
  }, [user?.role?.name]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const response = await apiClient.post<User>("/auth/login", { email, password });
      setUser(response.data);
      return response.data;
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await apiClient.post("/auth/logout");
    } catch (error) {
    } finally {
      setUser(null);
      setPermissions([]);
      setLoading(false);
      window.location.href = "/login";
    }
  }, []);

  const contextValue = useMemo(
    () => ({ user, permissions, loading, login, logout, checkSession, refreshPermissions }),
    [user, permissions, loading, login, logout, checkSession, refreshPermissions]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
