"use client";

import React from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { relativeTime, formatDateTime } from "@/lib/utils/time";

interface Props {
  locale: "ar" | "en";
  refreshing: boolean;
  onRefresh: () => void;
  asOf: string | null; // X-Data-As-Of from the BFF
}

/**
 * "تحديث الآن / Refresh" button + "updated a minute ago" caption.
 * onRefresh must hit the BFF with ?refresh=1 to bypass the 60s cache.
 */
export default function RefreshButton({ locale, refreshing, onRefresh, asOf }: Props) {
  const s =
    locale === "ar"
      ? { refresh: "تحديث الآن", updated: "آخر تحديث" }
      : { refresh: "Refresh now", updated: "Last updated" };

  return (
    <div className="flex items-center gap-3">
      {asOf && (
        <span
          className="text-[10px] text-slate-400"
          title={formatDateTime(asOf, locale)}
        >
          {s.updated}: {relativeTime(asOf, locale)}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="btn-touch gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 transition-colors"
      >
        {refreshing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {s.refresh}
      </button>
    </div>
  );
}
