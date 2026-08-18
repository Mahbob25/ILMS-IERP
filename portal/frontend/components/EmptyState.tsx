"use client";

import React from "react";

interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Friendly empty state: icon in a tinted circle + title + optional hint and
 * action button. Replaces the bare "no data" text cards.
 */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="card p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
        <Icon size={26} className="text-brand-600" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn-primary mt-4 inline-flex items-center gap-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
