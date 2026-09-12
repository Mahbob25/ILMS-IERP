"use client";

import React from "react";
import {
  chronological,
  formatDayMonth,
  groupByMonth,
  markFor,
  ribbonSummary,
  sliceLast,
  spansMultipleYears,
  statusLabel,
} from "@/lib/utils/register";

export interface RibbonRecord {
  date: string;
  status: string;
}

interface Props {
  records: RibbonRecord[];
  locale: "ar" | "en";
  /** "full" = one labelled lane per month; "micro" = a single small lane. */
  variant?: "full" | "micro";
  /** micro only — how many of the most recent sessions to show. */
  limit?: number;
  emptyLabel?: string;
  className?: string;
}

/**
 * The signature element: one mark per real session, oldest first in the reading
 * direction, so a guardian can see the shape of a term at a glance and spot a
 * run of absences that a percentage would hide.
 *
 * The same component scales down to `variant="micro"` inside a course row —
 * 10px marks where a glyph would smudge, so status is carried by the fill.
 * Deliberately hand-built: recharts has no RTL axis handling anywhere in this
 * repo, and a chart library costs ~100 kB to draw what is really just a row.
 */
export default function AttendanceRibbon({
  records,
  locale,
  variant = "full",
  limit = 6,
  emptyLabel,
  className = "",
}: Props) {
  const micro = variant === "micro";
  const shown = micro ? sliceLast(records, limit) : chronological(records);

  if (shown.length === 0) {
    return emptyLabel ? (
      <p className={`text-xs text-slate-400 ${className}`}>{emptyLabel}</p>
    ) : null;
  }

  const lanes = micro
    ? [{ key: "micro", label: "", records: shown }]
    : groupByMonth(shown, locale, spansMultipleYears(shown));

  let stamp = 0;

  return (
    <div className={className}>
      {/* The marks are a visual encoding of this sentence. Announcing 22 glyphs
          one at a time is worse than stating the numbers once. */}
      <p className="sr-only">{ribbonSummary(records, locale)}</p>
      <div className={micro ? "flex flex-wrap items-center gap-1" : "space-y-1.5"}>
        {lanes.map((lane) => (
          <div
            key={lane.key}
            className={micro ? "flex flex-wrap items-center gap-1" : "flex items-center gap-2.5"}
          >
            {!micro && <span className="eyebrow w-16 shrink-0 text-end">{lane.label}</span>}
            <ul aria-hidden="true" className="flex flex-wrap items-center gap-1">
              {lane.records.map((record) => {
                const mark = markFor(record.status);
                const index = stamp++;
                return (
                  <li key={`${record.date}-${record.status}-${index}`}>
                    <span
                      title={`${formatDayMonth(record.date, locale)} · ${statusLabel(
                        record.status,
                        locale
                      )}`}
                      className={`${micro ? "mark-micro" : "mark"} ${
                        micro ? mark.micro : mark.chip
                      } animate-mark-stamp`}
                      // Cap the stagger so a long history still lands quickly.
                      style={{ animationDelay: `${Math.min(index, 24) * 14}ms` }}
                    >
                      {!micro && mark.glyph}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
