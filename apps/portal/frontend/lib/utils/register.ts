// The register's visual vocabulary — glyphs, colours, grouping and formatting.
//
// PRESENTATION ONLY. The attendance-rate rule (a "partial" mark counts as
// attended) lives once in `lib/utils/attendance.ts` and once in the ERP's
// `reports/service.py::attendance_totals()`. It is never re-derived here — this
// module calls `attendanceStats()` instead, so the portal can only ever have one
// answer for a student's rate.

import { attendanceStats, type AttendanceRecordLike } from "@/lib/utils/attendance";

export type AttendanceStatus = "present" | "partial" | "late" | "absent" | "excused";

/** Legend and summary order — most-attended first. */
export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "partial",
  "late",
  "absent",
  "excused",
];

export const STATUS_LABELS: Record<"ar" | "en", Record<AttendanceStatus, string>> = {
  ar: { present: "حاضر", partial: "حضور جزئي", late: "متأخر", absent: "غائب", excused: "بعذر" },
  en: { present: "Present", partial: "Partial", late: "Late", absent: "Absent", excused: "Excused" },
};

// `ar-SA` defaults to the Umm al-Qura (Hijri) calendar, which would label a
// Gregorian September bucket with a Hijri month name. The DB stores Gregorian
// dates, so the calendar is pinned explicitly. Note: the pre-existing
// grades/attendance pages still format with plain `ar-SA` and therefore render
// Hijri dates — unifying the whole portal is a separate change.
const DATE_LOCALE: Record<"ar" | "en", string> = {
  ar: "ar-SA-u-ca-gregory",
  en: "en-GB",
};
const NUMBER_LOCALE: Record<"ar" | "en", string> = { ar: "ar-SA", en: "en-GB" };

export function formatNumber(value: number, locale: "ar" | "en"): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Arabic counts need the dual and two plural bands — "مقرران" is not "٢ مقررات".
 * `one` and `two` carry their own wording; `few` (3–10) and `many` (11+) are
 * suffixed to the numeral.
 */
export function arCount(
  n: number,
  one: string,
  two: string,
  few: string,
  many: string
): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${formatNumber(n, "ar")} ${n >= 3 && n <= 10 ? few : many}`;
}

export function enCount(n: number, one: string, other: string): string {
  return `${formatNumber(n, "en")} ${n === 1 ? one : other}`;
}

/**
 * Class time + duration + room as one line, e.g. "16:00 · ٤٥ دقيقة · قاعة ٣".
 * Shared by the dashboard rows and the course history so a section reads the
 * same wherever it appears.
 */
export function scheduleLabel(
  section: {
    class_time?: string | null;
    class_duration_minutes?: number | null;
    classroom?: string | null;
  },
  locale: "ar" | "en"
): string | null {
  const parts: string[] = [];
  if (section.class_time) parts.push(section.class_time);
  if (section.class_duration_minutes) {
    parts.push(
      locale === "ar"
        ? `${formatNumber(section.class_duration_minutes, "ar")} دقيقة`
        : `${section.class_duration_minutes} min`
    );
  }
  if (section.classroom) parts.push(section.classroom);
  return parts.length ? parts.join(" · ") : null;
}

/** Plain date — "١٢ سبتمبر ٢٠٢٦" / "12 Sep 2026". */
export function formatDate(value: string | null | undefined, locale: "ar" | "en"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(DATE_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Short date for dense rows and receipt lines. */
export function formatDayMonth(value: string | null | undefined, locale: "ar" | "en"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(DATE_LOCALE[locale], { day: "numeric", month: "short" });
}

export function formatMoney(value: number, locale: "ar" | "en"): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/** `null` means "not known" and must never be dressed up as 0. */
export function formatPercent(value: number | null, locale: "ar" | "en"): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${formatNumber(value, locale)}${locale === "ar" ? "٪" : "%"}`;
}

export function formatScore(value: number | null, locale: "ar" | "en"): string {
  return value === null || Number.isNaN(value) ? "—" : formatPercent(value, locale);
}

interface MarkStyle {
  /** A stamped glyph, not a bullet — a full-size mark has to read on its own. */
  glyph: string;
  /** Full-size mark chip (glyph + tint). */
  chip: string;
  /** Micro mark: 10px, where a glyph would be an unreadable smudge, so the
   *  status is carried by a solid fill (and a hollow ring for "excused").
   *  Colour-only encoding is acceptable here because the micro ribbon is
   *  decorative — the rate and session count sit in text beside it. */
  micro: string;
}

const MARKS: Record<AttendanceStatus, MarkStyle> = {
  present: {
    glyph: "✓",
    chip: "bg-mark-present/10 text-mark-present",
    micro: "bg-mark-present",
  },
  partial: {
    glyph: "½",
    chip: "bg-mark-partial/15 text-mark-partial",
    micro: "bg-mark-partial",
  },
  late: {
    glyph: "●",
    chip: "bg-mark-late/10 text-mark-late",
    micro: "bg-mark-late",
  },
  absent: {
    glyph: "✗",
    chip: "bg-mark-absent/10 text-mark-absent",
    micro: "bg-mark-absent",
  },
  excused: {
    glyph: "○",
    chip: "bg-slate-100 text-mark-excused",
    micro: "border border-slate-300 bg-transparent",
  },
};

export function normalizeStatus(status: string): AttendanceStatus | null {
  const key = (status || "").toLowerCase() as AttendanceStatus;
  return key in MARKS ? key : null;
}

export function statusLabel(status: string, locale: "ar" | "en"): string {
  const key = normalizeStatus(status);
  return key ? STATUS_LABELS[locale][key] : status;
}

export function markFor(status: string): MarkStyle {
  const key = normalizeStatus(status);
  return key ? MARKS[key] : { glyph: "?", chip: "bg-slate-100 text-slate-400", micro: "bg-slate-200" };
}

/** Oldest first. The BFF returns newest-first; a register reads forwards. */
export function chronological<T extends { date: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The `n` most recent sessions, kept oldest-first so the lane still reads forwards. */
export function sliceLast<T extends { date: string }>(records: T[], n: number): T[] {
  return chronological(records).slice(-n);
}

export function spansMultipleYears(records: { date: string }[]): boolean {
  return new Set(records.map((r) => r.date.slice(0, 4))).size > 1;
}

export interface MonthGroup<T> {
  key: string;
  label: string;
  records: T[];
}

/** One lane per calendar month, in reading order. */
export function groupByMonth<T extends { date: string }>(
  records: T[],
  locale: "ar" | "en",
  withYear: boolean
): MonthGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const record of chronological(records)) {
    const key = record.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(record);
    else buckets.set(key, [record]);
  }
  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    key,
    label: monthLabel(key, locale, withYear),
    records: bucket,
  }));
}

function monthLabel(key: string, locale: "ar" | "en", withYear: boolean): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, 1));
  return date.toLocaleDateString(DATE_LOCALE[locale], {
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
}

/** Earliest and latest session dates — the covered range for a section header. */
export function dateRange(
  records: { date: string }[],
  locale: "ar" | "en"
): string | null {
  if (records.length === 0) return null;
  const ordered = chronological(records);
  const first = formatDayMonth(ordered[0].date, locale);
  const last = formatDayMonth(ordered[ordered.length - 1].date, locale);
  return first === last ? first : `${first} – ${last}`;
}

/**
 * The ribbon's accessible summary.
 *
 * The marks themselves are `aria-hidden` — they are a redundant visual encoding
 * of the same data, and announcing 22 glyphs one by one is worse than saying
 * the numbers once.
 */
export function ribbonSummary(records: AttendanceRecordLike[], locale: "ar" | "en"): string {
  const stats = attendanceStats(records);
  if (!stats.total) {
    return locale === "ar" ? "لا توجد جلسات مسجلة." : "No sessions recorded.";
  }
  const labels = STATUS_LABELS[locale];
  const parts = ATTENDANCE_STATUSES.filter((status) => stats.counts[status] > 0).map(
    (status) => `${labels[status]} ${formatNumber(stats.counts[status], locale)}`
  );
  const rate = formatPercent(stats.rate, locale);
  return locale === "ar"
    ? `${formatNumber(stats.total, locale)} جلسة · نسبة الحضور ${rate} · ${parts.join("، ")}`
    : `${formatNumber(stats.total, locale)} sessions · ${rate} attendance · ${parts.join(", ")}`;
}
