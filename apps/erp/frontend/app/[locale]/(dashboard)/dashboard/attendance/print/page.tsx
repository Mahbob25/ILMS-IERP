"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import AttendancePrintSheet from "@/components/attendance/AttendancePrintSheet";
import { getAttendancePrintTranslations } from "@/components/attendance/attendancePrintTranslations";

interface Course { id: string; name: string; code: string; }
interface CourseSection { id: string; course_id: string; teacher_id: string; classroom: string | null; class_time: string | null; class_duration_minutes: number | null; start_date: string | null; end_date: string | null; }
interface Enrollment { id: string; student_id: string; section_id: string; }
interface Student { id: string; student_code: string; full_name: string; }

export default function AttendancePrintPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const t = getAttendancePrintTranslations(locale);
  const sectionId = searchParams.get("sectionId") || "";
  const dateStr = searchParams.get("date") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [sectionMeta, setSectionMeta] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [instituteName, setInstituteName] = useState("");

  const fetchData = useCallback(async () => {
    if (!sectionId) {
      setLoading(false);
      return;
    }
    try {
      const [sectRes, courseRes, enrRes, teachersRes, settingsRes] = await Promise.all([
        apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000").catch(() => null),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000").catch(() => null),
        apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments?section_id=${sectionId}&limit=1000`).catch(() => null),
        apiClient.get<any[]>("/users/teachers").catch(() => null),
        apiClient.get<{ institute_name?: string }>("/settings").catch(() => null),
      ]);

      const section = sectRes?.data.items.find((s) => s.id === sectionId) || null;
      const course = section && courseRes ? courseRes.data.items.find((c) => c.id === section.course_id) : null;
      if (course) setCourseName(`${course.name} (${course.code})`);
      if (section) {
        const parts = [section.classroom, section.class_time].filter(Boolean).join(" · ");
        const dates = [section.start_date, section.end_date].filter(Boolean).join(" → ");
        setSectionMeta([parts, dates].filter(Boolean).join(" | ") || section.id.slice(0, 8));
        if (section.teacher_id && teachersRes?.data) {
          const teacher = (teachersRes.data as any[]).find((u: any) => u.id === section.teacher_id);
          if (teacher) setTeacherName(teacher.full_name);
        }
      }
      if (settingsRes?.data?.institute_name) setInstituteName(settingsRes.data.institute_name);

      const enrollments = enrRes?.data.items || [];
      const studentIds = enrollments.map((e) => e.student_id);
      if (studentIds.length > 0) {
        const studRes = await apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000").catch(() => null);
        if (studRes) {
          const filtered = studRes.data.items.filter((s) => studentIds.includes(s.id));
          filtered.sort((a, b) => a.full_name.localeCompare(b.full_name, locale === "ar" ? "ar" : "en"));
          setStudents(filtered);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load print data");
    } finally {
      setLoading(false);
    }
  }, [sectionId, locale]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (!sectionId) {
    return (
      <div className="max-w-5xl mx-auto p-6 text-center">
        <p className="text-sm text-slate-600">{t.noSection}</p>
        <button onClick={() => router.push(`/${locale}/dashboard/attendance`)} className="btn-secondary mt-4">
          {t.back}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="no-print flex items-center justify-between gap-3">
        <button onClick={() => router.push(`/${locale}/dashboard/attendance`)} className="btn-secondary flex items-center gap-2">
          <ArrowLeft size={16} className={isRtl ? "rotate-180" : ""} />
          {t.back}
        </button>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={16} />
          {t.print}
        </button>
      </div>

      {error && <div className="no-print text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <AttendancePrintSheet
        t={t}
        isRtl={isRtl}
        instituteName={instituteName}
        courseName={courseName}
        sectionMeta={sectionMeta}
        teacherName={teacherName}
        dateStr={dateStr}
        students={students}
      />
    </div>
  );
}
