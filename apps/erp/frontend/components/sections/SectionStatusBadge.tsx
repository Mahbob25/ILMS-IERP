"use client";

import React from "react";
import { X, Clock, CheckCircle2, AlertTriangle, Ban } from "lucide-react";

interface SectionStatusBadgeProps {
  status: string;
  isRtl?: boolean;
  overdue?: boolean;
  labels?: Record<string, string>;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600 border-amber-200",
  active: "bg-emerald-50 text-emerald-600 border-emerald-200",
  completed: "bg-slate-100 text-slate-500 border-slate-200",
  ready_for_completion: "bg-yellow-50 text-yellow-600 border-yellow-300",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={12} />,
  active: <CheckCircle2 size={12} />,
  completed: <CheckCircle2 size={12} />,
  ready_for_completion: <AlertTriangle size={12} />,
  cancelled: <Ban size={12} />,
};

export default function SectionStatusBadge({
  status,
  isRtl = false,
  overdue = false,
  labels = {},
}: SectionStatusBadgeProps) {
  const colorClass = statusColors[status] || statusColors.pending;
  const icon = statusIcons[status] || null;
  const labelText = labels[status] || status;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {icon}
      {labelText}
      {overdue && status === "active" && (
        <span className="ms-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600">
          ({<AlertTriangle size={10} />} overdue)
        </span>
      )}
    </span>
  );
}
