"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

type Tone = "brand" | "ai" | "success" | "warning";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  /** Makes the whole card a button (e.g. navigate to the detail page). */
  onClick?: () => void;
  /** Slot below the header — a chart, a short list, a legend. */
  children?: React.ReactNode;
}

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 border-brand-100",
  ai: "bg-ai-50 text-ai-600 border-ai-100",
  success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  warning: "bg-amber-50 text-amber-600 border-amber-100",
};

/**
 * KPI card: icon tile + label + prominent value + optional hint and body slot.
 * There was no stat-card primitive in the portal — this is it, so the dashboard
 * (and later pages) share one shape instead of hand-rolling `.card p-5` each time.
 */
export default function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
  onClick,
  children,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
        </div>
        <div
          className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}
        >
          <Icon size={18} />
        </div>
      </div>
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="card p-5 text-start w-full hover:border-brand-300 transition-colors"
      >
        {body}
      </button>
    );
  }

  return <div className="card p-5">{body}</div>;
}
