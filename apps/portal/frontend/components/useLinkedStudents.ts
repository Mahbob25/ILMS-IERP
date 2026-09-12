"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

export interface LinkedStudent {
  student_id: string;
  full_name: string;
  student_code: string;
  /** "/uploads/avatars/…" (rewritten to the ERP host) — null until one is set. */
  photo_url: string | null;
  /** Earliest enrollment (ISO) — when the student joined. Null if never enrolled. */
  registered_at: string | null;
}

interface MeResponse {
  actor_id: string;
  linked_students: LinkedStudent[];
}

/**
 * Shared "who am I + which student am I viewing" state for the read pages.
 * Fetches /me once, keeps the selected student_id, and exposes a refetch that
 * bypasses the BFF cache (?refresh=1) — used by the force-refresh buttons.
 *
 * `enabled` lets a caller that renders before the session is confirmed (the
 * dashboard layout, which is mounted during the auth check) hold off — an
 * unauthenticated /me would 401 and start a refresh-then-redirect cycle.
 */
export function useLinkedStudents(locale: "ar" | "en", enabled = true) {
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      try {
        if (force) setRefreshing(true);
        else setLoading(true);
        const res = await apiClient.get<MeResponse>("/me", {
          params: force ? { refresh: "1" } : undefined,
        });
        const linked = res.data.linked_students || [];
        setStudents(linked);
        setSelectedId((prev) => {
          if (prev && linked.some((s) => s.student_id === prev)) return prev;
          return linked[0]?.student_id || null;
        });
        setError(null);
      } catch {
        setError(locale === "ar" ? "تعذر تحميل البيانات" : "Failed to load data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [locale, enabled]
  );

  useEffect(() => {
    load();
  }, [load]);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const refresh = useCallback(() => load(true), [load]);

  return {
    students,
    selectedId,
    selectedStudent: students.find((s) => s.student_id === selectedId) || null,
    loading,
    refreshing,
    error,
    select,
    refresh,
  };
}
