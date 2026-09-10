"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

export interface HealthResources {
  source: string;
  memory_used_mb: number | null;
  memory_limit_mb: number | null;
  memory_percent: number | null;
  cpu_percent: number | null;
  host_disk_percent: number;
  host_disk_total_gb: number;
  host_disk_used_gb: number;
}

export interface HealthDatabase {
  status: string;
  size_pretty: string | null;
  connections: number | null;
  max_connections: number | null;
  connections_percent: number | null;
  active: number | null;
  idle_in_transaction: number | null;
  longest_transaction_seconds: number | null;
  blocking_locks: number | null;
  table_count: number | null;
  detail: string | null;
}

export interface HealthMigrations {
  status: string;
  db_revision: string | null;
  code_head: string | null;
  pending: number | null;
  detail: string | null;
}

export interface HealthRedis {
  status: string;
  latency_ms: number | null;
  version: string | null;
  used_memory_human: string | null;
  maxmemory_human: string | null;
  maxmemory_bytes: number | null;
  memory_percent: number | null;
  policy: string | null;
  connected_clients: number | null;
  evicted_keys: number | null;
  hit_rate: number | null;
  aof_enabled: boolean | null;
  aof_last_write_status: string | null;
  rdb_last_bgsave_status: string | null;
  streams: Record<string, number | null>;
  stream_pending: Record<string, number | null>;
  warnings: string[];
  detail: string | null;
}

export interface HealthService {
  name: string;
  status: string;
  latency_ms: number | null;
  detail: string | null;
}

export interface HealthJob {
  name: string;
  last_run_date: string | null;
  healthy: boolean;
}

export interface HealthBackups {
  status: string;
  last_backup: string | null;
  age_hours: number | null;
  count: number;
  total_size_bytes: number;
  disk_free_gb: number | null;
  detail: string | null;
}

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
  resources: HealthResources | null;
  database: HealthDatabase | null;
  migrations: HealthMigrations | null;
  redis: HealthRedis | null;
  services: HealthService[];
  jobs: HealthJob[];
  backups: HealthBackups | null;
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
