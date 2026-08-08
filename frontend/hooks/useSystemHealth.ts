"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

export interface HealthData {
  db_status: string;
  api_uptime: string;
  disk_usage_percent: number;
  disk_total_gb: number;
  disk_used_gb: number;
  memory_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  cpu_percent: number;
  total_users: number;
  total_students: number;
  total_courses: number;
  total_enrollments: number;
  service: string;
  version: string;
  last_backup: string | null;
}

export function percentColor(pct: number): string {
  if (pct > 90) return "text-red-600";
  if (pct > 70) return "text-amber-600";
  return "text-emerald-600";
}

export function percentBg(pct: number): string {
  if (pct > 90) return "bg-red-50 text-red-600";
  if (pct > 70) return "bg-amber-50 text-amber-600";
  return "bg-emerald-50 text-emerald-600";
}

export function formatGB(gb: number): string {
  return `${gb.toFixed(1)} GB`;
}

export default function useSystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiClient.get<HealthData>("/dashboard/health");
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return { data, loading, error, refetch: fetchHealth };
}
