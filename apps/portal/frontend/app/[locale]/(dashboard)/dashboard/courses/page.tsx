"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import StudentSelector from "@/components/StudentSelector";
import RefreshButton from "@/components/RefreshButton";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import {
  BookOpen,
  Clock,
  MapPin,
  User as UserIcon,
  CalendarRange,
} from "lucide-react";
import {
  attendanceStats,
  attendanceBySectionId,
  type AttendanceRecordLike,
} from "@/lib/utils/attendance";

interface Section {
  id: string;
  course_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  class_time: string | null;
  class_duration_minutes: number | null;
  classroom: string | null;
  teacher_name: string | null;
  withdrawn: boolean;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
}

interface GradeRow {
  section_id: string;
  course_name: string;
  final_score: number | null;
  grade_label: string | null;
  graded_at: string | null;
}

interface AttendanceRow extends AttendanceRecordLike {
  section_id: string;
  date: string;
  status: string;
  course_name: string;
}

interface CourseRow {
  section: Section;
  grade: GradeRow | null;
  attendance: ReturnType<typeof attendanceStats>;
}

const t = {
  ar: {
    title: "مقرراتي",
    subtitle: "جميع الشعب التي درستها في المعهد",
    current: "الحالية",
    upcoming: "القادمة",
    completed: "المكتملة",
    withdrawn: "المنسحبة والملغاة",
    teacher: "المعلم",
    schedule: "الجدول",
    room: "القاعة",
    duration: "دقيقة",
    from: "من",
    to: "إلى",
    finalGrade: "الدرجة النهائية",
    notGraded: "لم يتم التقييم بعد",
    attendance: "الحضور",
    sessions: "جلسة",
    noAttendance: "لا توجد سجلات حضور",
    noCourses: "لا توجد مقررات مسجلة بعد.",
    withdrawnAt: "تاريخ الانسحاب",
    reason: "السبب",
    statusActive: "نشطة",
    statusPending: "قيد الانتظار",
    statusCompleted: "مكتملة",
    statusCancelled: "ملغاة",
    statusWithdrawn: "منسحب",
    loading: "جاري تحميل المقررات...",
  },
  en: {
    title: "My Courses",
    subtitle: "Every section you have studied at the institute",
    current: "Current",
    upcoming: "Upcoming",
    completed: "Completed",
    withdrawn: "Withdrawn & cancelled",
    teacher: "Teacher",
    schedule: "Schedule",
    room: "Room",
    duration: "min",
    from: "From",
    to: "To",
    finalGrade: "Final grade",
    notGraded: "Not graded yet",
    attendance: "Attendance",
    sessions: "sessions",
    noAttendance: "No attendance records",
    noCourses: "No courses enrolled yet.",
    withdrawnAt: "Withdrawn on",
    reason: "Reason",
    statusActive: "Active",
    statusPending: "Pending",
    statusCompleted: "Completed",
    statusCancelled: "Cancelled",
    statusWithdrawn: "Withdrawn",
    loading: "Loading courses...",
  },
};

export default function CoursesPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];

  const [students, setStudents] = useState<
    { student_id: string; full_name: string; student_code: string }[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sections, setSections] = useState<Section[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  const loadIdentity = useCallback(
    async (force = false) => {
      try {
        if (force) setRefreshing(true);
        else setIdentityLoading(true);
        const res = await apiClient.get<{
          linked_students: { student_id: string; full_name: string; student_code: string }[];
        }>("/me", { params: force ? { refresh: "1" } : undefined });
        const linked = res.data.linked_students || [];
        setStudents(linked);
        setSelectedId((prev) =>
          prev && linked.some((x) => x.student_id === prev)
            ? prev
            : linked[0]?.student_id || null
        );
      } catch {
        setStudents([]);
      } finally {
        setIdentityLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  // Settled so one failing call degrades to a hint rather than blanking the page.
  const loadCourses = useCallback(async (studentId: string, force = false) => {
    const reqParams = force
      ? { student_id: studentId, refresh: "1" }
      : { student_id: studentId };

    const [sec, grd, att] = await Promise.allSettled([
      apiClient.get<Section[]>("/me/sections", { params: reqParams }),
      apiClient.get<GradeRow[]>("/me/grades", { params: reqParams }),
      apiClient.get<AttendanceRow[]>("/me/attendance", { params: reqParams }),
    ]);

    const fulfilled = [sec, grd, att].find((r) => r.status === "fulfilled");
    const asOfHeader =
      fulfilled && fulfilled.status === "fulfilled"
        ? fulfilled.value.headers?.["x-data-as-of"]
        : undefined;

    return {
      sections: sec.status === "fulfilled" ? sec.value.data || [] : [],
      grades: grd.status === "fulfilled" ? grd.value.data || [] : [],
      attendance: att.status === "fulfilled" ? att.value.data || [] : [],
      asOf: typeof asOfHeader === "string" ? asOfHeader : null,
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDataLoading(true);
    loadCourses(selectedId)
      .then((data) => {
        if (cancelled) return;
        setSections(data.sections);
        setGrades(data.grades);
        setAttendance(data.attendance);
        setAsOf(data.asOf);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadCourses]);

  const handleRefresh = async () => {
    await loadIdentity(true);
    if (!selectedId) return;
    setDataLoading(true);
    try {
      const data = await loadCourses(selectedId, true);
      setSections(data.sections);
      setGrades(data.grades);
      setAttendance(data.attendance);
      setAsOf(data.asOf);
    } finally {
      setDataLoading(false);
    }
  };

  const rows: CourseRow[] = useMemo(() => {
    const gradesBySection = new Map(grades.map((g) => [g.section_id, g]));
    const attendanceBySection = attendanceBySectionId(attendance);

    return sections.map((section) => ({
      section,
      grade: gradesBySection.get(section.id) || null,
      attendance: attendanceStats(attendanceBySection[section.id] || []),
    }));
  }, [sections, grades, attendance]);

  const groups = useMemo(
    () => ({
      current: rows.filter((r) => r.section.status === "active" && !r.section.withdrawn),
      upcoming: rows.filter((r) => r.section.status === "pending" && !r.section.withdrawn),
      completed: rows.filter(
        (r) =>
          (r.section.status === "completed" || r.section.status === "ready_for_completion") &&
          !r.section.withdrawn
      ),
      withdrawn: rows.filter(
        (r) => r.section.withdrawn || r.section.status === "cancelled"
      ),
    }),
    [rows]
  );

  const busy = identityLoading || dataLoading;

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB") : "—";

  const statusBadge = (section: Section) => {
    if (section.withdrawn) {
      return <span className="badge badge-warning">{s.statusWithdrawn}</span>;
    }
    switch (section.status) {
      case "active":
        return <span className="badge badge-success">{s.statusActive}</span>;
      case "completed":
      case "ready_for_completion":
        return <span className="badge badge-partial">{s.statusCompleted}</span>;
      case "cancelled":
        return <span className="badge badge-warning">{s.statusCancelled}</span>;
      default:
        return <span className="badge badge-muted">{s.statusPending}</span>;
    }
  };

  const renderCard = ({ section, grade, attendance: att }: CourseRow) => (
    <div key={section.id} className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{section.course_name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(section.start_date)} → {fmtDate(section.end_date)}
          </p>
        </div>
        <span className="shrink-0">{statusBadge(section)}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <UserIcon size={13} className="text-slate-400 shrink-0" />
          <span className="text-slate-400">{s.teacher}:</span>
          <span className="text-slate-700 truncate">{section.teacher_name || "—"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-slate-400 shrink-0" />
          <span className="text-slate-400">{s.schedule}:</span>
          <span className="text-slate-700" dir="ltr">
            {section.class_time
              ? `${section.class_time}${
                  section.class_duration_minutes
                    ? ` · ${section.class_duration_minutes} ${s.duration}`
                    : ""
                }`
              : "—"}
          </span>
        </div>
        {section.classroom && (
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-slate-400 shrink-0" />
            <span className="text-slate-400">{s.room}:</span>
            <span className="text-slate-700">{section.classroom}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <CalendarRange size={13} className="text-slate-400 shrink-0" />
          <span className="text-slate-400">{s.attendance}:</span>
          <span className="text-slate-700">
            {att.total ? `${att.rate}% · ${att.total} ${s.sessions}` : s.noAttendance}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-400">{s.finalGrade}</span>
        {grade && grade.final_score !== null ? (
          <span className="flex items-center gap-2">
            <span className="badge badge-success">{grade.final_score}%</span>
            {grade.grade_label && (
              <span className="text-xs text-slate-600">{grade.grade_label}</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-slate-400">{s.notGraded}</span>
        )}
      </div>

      {section.withdrawn && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs space-y-0.5">
          <p className="text-amber-700">
            {s.withdrawnAt}: {fmtDate(section.withdrawn_at)}
          </p>
          {section.withdrawal_reason && (
            <p className="text-slate-600">
              {s.reason}: {section.withdrawal_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderGroup = (title: string, items: CourseRow[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900">
          {title} <span className="text-slate-400 font-normal">({items.length})</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">{items.map(renderCard)}</div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="text-brand-600" size={24} />
            {s.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StudentSelector
            locale={locale}
            students={students}
            selectedId={selectedId}
            onSelect={setSelectedId}
            disabled={busy}
          />
          <RefreshButton
            locale={locale}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            asOf={asOf}
          />
        </div>
      </div>

      {busy ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={BookOpen} title={s.noCourses} />
      ) : (
        <div className="space-y-8">
          {renderGroup(s.current, groups.current)}
          {renderGroup(s.upcoming, groups.upcoming)}
          {renderGroup(s.completed, groups.completed)}
          {renderGroup(s.withdrawn, groups.withdrawn)}
        </div>
      )}
    </div>
  );
}
