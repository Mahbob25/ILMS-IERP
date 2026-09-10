"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";

type ClosureStatus = "closed" | "pending" | "unlock_requested" | null;

// Must match the roles accepted by GET /lms/daily-closures on the backend.
const CLOSURE_ROLES = ["superadmin", "manager", "secretary"];

export function useClosureStatus(date: string | null): ClosureStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<ClosureStatus>(null);
  const allowed =
    !!user?.is_superadmin || CLOSURE_ROLES.includes(user?.role?.name ?? "");

  useEffect(() => {
    if (!date || !allowed) {
      setStatus(null);
      return;
    }

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await apiClient.get<Array<{ date: string; status: string }>>(
          "/lms/daily-closures",
          { params: { date_from: date, date_to: date } }
        );
        if (cancelled) return;
        const entry = res.data.find((d) => d.date === date);
        setStatus(entry ? (entry.status as ClosureStatus) : null);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [date, allowed]);

  return status;
}