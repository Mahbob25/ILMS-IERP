// Attendance maths shared by the dashboard and the course history page.
//
// The rate rule — a "partial" mark counts as attended — is the same policy the
// ERP applies in reports/service.py::attendance_totals(). It lives here so it
// exists once in the portal rather than being copy-pasted per page.

export interface AttendanceRecordLike {
  status: string;
  section_id?: string;
}

export interface AttendanceStats {
  counts: {
    present: number;
    absent: number;
    late: number;
    partial: number;
    excused: number;
  };
  total: number;
  /** 0-100, one decimal. 0 when there are no records. */
  rate: number;
}

const STATUS_KEYS = ["present", "absent", "late", "partial", "excused"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

export function attendanceStats(records: AttendanceRecordLike[]): AttendanceStats {
  const counts = { present: 0, absent: 0, late: 0, partial: 0, excused: 0 };

  for (const record of records) {
    const key = (record.status || "").toLowerCase() as StatusKey;
    if (key in counts) counts[key] += 1;
  }

  const total =
    counts.present + counts.absent + counts.late + counts.partial + counts.excused;
  const attended = counts.present + counts.partial;
  const rate = total ? Math.round((attended / total) * 1000) / 10 : 0;

  return { counts, total, rate };
}

/** Group records by section_id, ignoring rows without one. */
export function attendanceBySectionId<T extends AttendanceRecordLike>(
  records: T[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const record of records) {
    if (!record.section_id) continue;
    (grouped[record.section_id] ||= []).push(record);
  }
  return grouped;
}
