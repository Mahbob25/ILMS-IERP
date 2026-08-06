"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

type ClosureStatus = "closed" | "pending" | "unlock_requested" | null;

export function useClosureStatus(date: string | null): ClosureStatus {
  const [status, setStatus] = useState<ClosureStatus>(null);

  useEffect(() => {
    if (!date) {
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
  }, [date]);

  return status;
}