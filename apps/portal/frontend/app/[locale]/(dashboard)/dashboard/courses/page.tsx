"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import StudentSelector from "@/components/StudentSelector";
import RefreshButton from "@/components/RefreshButton";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import TranscriptRow from "@/components/TranscriptRow";
import { BookOpen } from "lucide-react";
import { attendanceStats, attendanceBySectionId } from "@/lib/utils/attendance";
import { arCount, enCount, formatDate, formatNumber, scheduleLabel } from "@/lib/utils/register";

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

interface AttendanceRow {
  section_id: string;
  date: string;
  status: string;
  course_name: string;
}

interface CourseData {
  sections: Section[];
  grades: GradeRow[];
  attendance: AttendanceRow[];
  asOf: string | null;
}

const t = {
  ar: {
    title: "مقرراتي",
    subtitle: "كل الشعبة التي درستها في المعهد، مرتّبة حسب الحالة",
    current: "الحالية",
    upcoming: "القادمة",
    completed: "المكتملة",
    withdrawn: "المنسحبة والملغاة",
    teacher: "المعلم",
    finalGrade: "الدرجة النهائية",
    notGraded: "لم يتم التقييم",
    attendance: "الحضور",
    sessions: (n: number) => arCount(n, "جلسة واحدة", "جلستان", "جلسات", "جلسة"),
    noAttendance: "لا توجد سجلات حضور",
    noCourses: "لا توجد مقررات مسجلة بعد.",
    withdrawnOn: "انسحب في",
    reason: "السبب",
  },
  en: {
    title: "My Courses",
    subtitle: "Every section you have studied, grouped by status",
    current: "Current",
    upcoming: "Upcoming",
    completed: "Completed",
    withdrawn: "Withdrawn & cancelled",
    teacher: "Teacher",
    finalGrade: "Final grade",
    notGraded: "Not graded",
    attendance: "Attendance",
    sessions: (n: number) => enCount(n, "session", "sessions"),
    noAttendance: "No attendance records",
    noCourses: "No courses enrolled yet.",
    withdrawnOn: "Withdrawn on",
    reason: "Reason",
  },
};

export default function CoursesPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];

  const { students, selectedId, loading, refreshing, select, refresh } =
    useLinkedStudents(locale);

  const [data, setData] = useState<CourseData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Settled so one failing call degrades to a hint rather than blanking the page.
  const loadCourses = useCallback(
    async (studentId: string, force = false): Promise<CourseData> => {
      const reqParams = force
        ? { student_id: studentId, refresh: "1" }
        : { student_id: studentId };

      const [sec, grd, att] = await Promise.allSettled([
        apiClient.get<Section[]>("/me/sections", { params: reqParams }),
        apiClient.get<GradeRow[]>("/me/grades", { params: reqParams }),
        apiClient.get<AttendanceRow[]>("/me/attendance", { params: reqParams }),
      ]);

      const settled = [sec, grd, att].find((r) => r.status === "fulfilled");
      const asOfHeader =
        settled && settled.status === "fulfilled"
          ? settled.value.headers?.["x-data-as-of"]
          : undefined;

      return {
        sections: sec.status === "fulfilled" ? sec.value.data || [] : [],
        grades: grd.status === "fulfilled" ? grd.value.data || [] : [],
        attendance: att.status === "fulfilled" ? att.value.data || [] : [],
        asOf: typeof asOfHeader === "string" ? asOfHeader : null,
      };
    },
    []
  );

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDataLoading(true);
    loadCourses(selectedId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadCourses]);

  const handleRefresh = async () => {
    await refresh();
    if (!selectedId) return;
    setDataLoading(true);
    try {
      setData(await loadCourses(selectedId, true));
    } finally {
      setDataLoading(false);
    }
  };

  const attendanceBySection = useMemo(
    () => attendanceBySectionId(data?.attendance || []),
    [data]
  );
  const gradesBySection = useMemo(
    () => new Map((data?.grades || []).map((g) => [g.section_id, g])),
    [data]
  );

  const groups = useMemo(() => {
    const sections = data?.sections || [];
    return {
      current: sections.filter((sec) => sec.status === "active" && !sec.withdrawn),
      upcoming: sections.filter((sec) => sec.status === "pending" && !sec.withdrawn),
      completed: sections.filter(
        (sec) =>
          (sec.status === "completed" || sec.status === "ready_for_completion") &&
          !sec.withdrawn
      ),
      withdrawn: sections.filter((sec) => sec.withdrawn || sec.status === "cancelled"),
    };
  }, [data]);

  const periodLabel = (section: Section): string | null => {
    const start = section.start_date ? formatDate(section.start_date, locale) : null;
    const end = section.end_date ? formatDate(section.end_date, locale) : null;
    if (start && end) return `${start} → ${end}`;
    return start || end || null;
  };

  const busy = loading || dataLoading;
  const total = data?.sections.length || 0;

  const renderGroup = (key: string, title: string, items: Section[]) => {
    if (items.length === 0) return null;
    return (
      <section key={key} className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="eyebrow">{title}</h2>
          <span className="tabular text-[11px] text-slate-400">
            ({formatNumber(items.length, locale)})
          </span>
        </div>
        <div>
          {items.map((section) => {
            const sectionAttendance = attendanceBySection[section.id] || [];
            const sectionStats = attendanceStats(sectionAttendance);
            const grade = gradesBySection.get(section.id) || null;
            return (
              <TranscriptRow
                key={section.id}
                courseName={section.course_name}
                teacherName={section.teacher_name}
                schedule={scheduleLabel(section, locale)}
                period={periodLabel(section)}
                attendance={sectionAttendance}
                rate={sectionStats.total ? sectionStats.rate : null}
                sessions={sectionStats.total}
                score={grade && grade.final_score !== null ? Number(grade.final_score) : null}
                gradeLabel={grade?.grade_label ?? null}
                withdrawn={section.withdrawn}
                withdrawnAt={section.withdrawn_at}
                withdrawalReason={section.withdrawal_reason}
                locale={locale}
                labels={{
                  teacher: s.teacher,
                  attendance: s.attendance,
                  sessions: s.sessions,
                  finalGrade: s.finalGrade,
                  notGraded: s.notGraded,
                  noAttendance: s.noAttendance,
                  withdrawnOn: s.withdrawnOn,
                  reason: s.reason,
                }}
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl md:text-2xl font-bold tracking-tight text-slate-900">
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
            onSelect={select}
            disabled={busy}
          />
          <RefreshButton
            locale={locale}
            refreshing={refreshing || dataLoading}
            onRefresh={handleRefresh}
            asOf={data?.asOf ?? null}
          />
        </div>
      </div>

      {busy ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : total === 0 ? (
        <EmptyState icon={BookOpen} title={s.noCourses} />
      ) : (
        <>
          {renderGroup("current", s.current, groups.current)}
          {renderGroup("upcoming", s.upcoming, groups.upcoming)}
          {renderGroup("completed", s.completed, groups.completed)}
          {renderGroup("withdrawn", s.withdrawn, groups.withdrawn)}
        </>
      )}
    </div>
  );
}
