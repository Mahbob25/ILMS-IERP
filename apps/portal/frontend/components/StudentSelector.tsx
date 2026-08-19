"use client";

import React from "react";
import { ChevronDown, Users } from "lucide-react";
import type { LinkedStudent } from "@/components/useLinkedStudents";

interface Props {
  locale: "ar" | "en";
  students: LinkedStudent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

/**
 * Student picker for multi-child guardians. Single-child parents see a plain
 * read-only chip (no pointless dropdown); multi-child gets a native select —
 * accessible, keyboard-friendly, RTL-safe (dir="rtl" from the layout).
 */
export default function StudentSelector({
  locale,
  students,
  selectedId,
  onSelect,
  disabled,
}: Props) {
  if (students.length <= 1) {
    const only = students[0];
    if (!only) return null;
    return (
      <span className="btn-touch inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
        <Users size={14} className="text-brand-600" />
        {only.full_name}
        <span className="text-slate-400 text-[10px]" dir="ltr">
          {only.student_code}
        </span>
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <Users size={14} className="text-brand-600 shrink-0" />
      <span className="relative">
        <select
          value={selectedId || ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
          className="btn-touch appearance-none bg-white border border-slate-200 rounded-full pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 cursor-pointer"
        >
          {students.map((s) => (
            <option key={s.student_id} value={s.student_id}>
              {s.full_name} · {s.student_code}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
          style={{ insetInlineEnd: 8 }}
        />
      </span>
    </label>
  );
}
