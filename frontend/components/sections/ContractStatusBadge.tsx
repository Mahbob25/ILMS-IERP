"use client";

import React from "react";
import { Clock, Bookmark, CheckCircle2, FileCheck, Check, Ban } from "lucide-react";

interface ContractStatusBadgeProps {
  status: string;
  isRtl?: boolean;
  labels?: Record<string, string>;
}

const contractStatusColors: Record<string, string> = {
  draft: "bg-amber-50 text-amber-600 border-amber-200",
  assigned: "bg-blue-50 text-blue-600 border-blue-200",
  active: "bg-emerald-50 text-emerald-600 border-emerald-200",
  grades_submitted: "bg-violet-50 text-violet-600 border-violet-200",
  settled: "bg-slate-100 text-slate-500 border-slate-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

const contractStatusIcons: Record<string, React.ReactNode> = {
  draft: <Clock size={12} />,
  assigned: <Bookmark size={12} />,
  active: <CheckCircle2 size={12} />,
  grades_submitted: <FileCheck size={12} />,
  settled: <Check size={12} />,
  cancelled: <Ban size={12} />,
};

export default function ContractStatusBadge({
  status,
  isRtl = false,
  labels = {},
}: ContractStatusBadgeProps) {
  const colorClass = contractStatusColors[status] || "bg-slate-50 text-slate-400 border-slate-200";
  const icon = contractStatusIcons[status] || null;
  const labelText = labels[status] || status;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {icon}
      {labelText}
    </span>
  );
}
