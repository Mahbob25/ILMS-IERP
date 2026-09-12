"use client";

import React from "react";
import AttendanceRibbon, { type RibbonRecord } from "@/components/AttendanceRibbon";
import { formatDate, formatPercent, formatScore } from "@/lib/utils/register";

interface Props {
  courseName: string;
  teacherName?: string | null;
  /** Preformatted, e.g. "س ٤-٦ · ٤٥ دقيقة". */
  schedule?: string | null;
  /** Preformatted study period, e.g. "١ سبتمبر – ٢٠ ديسمبر ٢٠٢٦". */
  period?: string | null;
  classroom?: string | null;
  attendance: RibbonRecord[];
  rate: number | null;
  sessions: number;
  score: number | null;
  gradeLabel?: string | null;
  withdrawn?: boolean;
  withdrawnAt?: string | null;
  withdrawalReason?: string | null;
  locale: "ar" | "en";
  labels: {
    teacher: string;
    attendance: string;
    sessions: (count: number) => string;
    finalGrade: string;
    notGraded: string;
    noAttendance: string;
    withdrawnOn: string;
    reason: string;
  };
}

/**
 * One course as a transcript row — ruled, not carded, so a list of courses reads
 * as a document rather than as a grid of boxes. Carries the micro ribbon, which
 * is the same visual language as the sheet's signature at 1/6 the scale.
 */
export default function TranscriptRow({
  courseName,
  teacherName,
  schedule,
  period,
  classroom,
  attendance,
  rate,
  sessions,
  score,
  gradeLabel,
  withdrawn,
  withdrawnAt,
  withdrawalReason,
  locale,
  labels,
}: Props) {
  const meta = [teacherName, schedule, classroom].filter(Boolean) as string[];

  return (
    <div className="py-4 border-b border-slate-100 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`font-display text-sm font-semibold truncate ${
              withdrawn ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {courseName}
          </p>
          {period && <p className="tabular text-[11px] text-slate-400 mt-1">{period}</p>}
          {meta.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 mt-1">
              {teacherName && (
                <span className="flex items-center gap-1">
                  <span className="text-slate-400">{labels.teacher}:</span>
                  {teacherName}
                </span>
              )}
              {schedule && <span className="tabular">{schedule}</span>}
              {classroom && <span className="text-slate-400">{classroom}</span>}
            </p>
          )}
        </div>

        <div className="text-end shrink-0">
          <p
            className={
              score === null
                ? "text-[11px] text-slate-400 pt-1"
                : "standing-figure text-lg text-slate-900"
            }
          >
            {score === null ? labels.notGraded : formatScore(score, locale)}
          </p>
          {gradeLabel && <p className="text-[10px] text-slate-500 mt-1">{gradeLabel}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
        <AttendanceRibbon
          records={attendance}
          locale={locale}
          variant="micro"
          limit={6}
          emptyLabel={labels.noAttendance}
        />
        {sessions > 0 && (
          <span className="tabular text-[11px] text-slate-400">
            {labels.attendance} {formatPercent(rate, locale)} · {labels.sessions(sessions)}
          </span>
        )}
      </div>

      {withdrawn && (
        <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          {labels.withdrawnOn} {formatDate(withdrawnAt, locale)}
          {withdrawalReason && (
            <span className="text-slate-600">
              {" · "}
              {labels.reason}: {withdrawalReason}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
