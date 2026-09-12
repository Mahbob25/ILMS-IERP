"use client";

import React from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Hash,
  MinusCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { formatDate, markFor, normalizeStatus, statusLabel } from "@/lib/utils/register";

export interface AttendanceLogRow {
  id: string;
  date: string;
  courseName: string;
  /** Position of the session inside its own course, oldest first. */
  sessionNumber: number | null;
  status: string;
}

interface Props {
  rows: AttendanceLogRow[];
  locale: "ar" | "en";
  /** e.g. (n) => "الجلسة ٣" — the session pill. */
  sessionLabel: (session: number) => string;
  emptyLabel?: string;
  footer?: React.ReactNode;
}

const STATUS_ICON: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  present: CheckCircle2,
  partial: MinusCircle,
  late: Clock,
  absent: XCircle,
  excused: ShieldCheck,
};

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
      <span className="text-slate-400 flex items-center">{icon}</span>
      {children}
    </span>
  );
}

/**
 * The session-by-session log: one rounded row per recorded session, newest
 * first, each carrying its own status, date, course and session number.
 *
 * The ribbon above states the shape of the term at a glance; this states the
 * detail, which is what a guardian actually checks after an absence alert.
 */
export default function AttendanceLog({ rows, locale, sessionLabel, emptyLabel, footer }: Props) {
  if (rows.length === 0) {
    return emptyLabel ? <p className="text-xs text-slate-400">{emptyLabel}</p> : null;
  }

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const key = normalizeStatus(row.status);
          const mark = markFor(row.status);
          const Icon = (key && STATUS_ICON[key]) || MinusCircle;

          return (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 transition-all duration-150 hover:bg-white hover:border-brand-100 hover:shadow-sm"
            >
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${mark.chip}`}
              >
                <Icon size={17} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {row.courseName}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <Pill icon={<CalendarDays size={11} />}>
                    <span className="tabular">{formatDate(row.date, locale)}</span>
                  </Pill>
                  {row.sessionNumber !== null && (
                    <Pill icon={<Hash size={11} />}>
                      <span className="tabular">{sessionLabel(row.sessionNumber)}</span>
                    </Pill>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${mark.chip}`}
                  >
                    {statusLabel(row.status, locale)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
