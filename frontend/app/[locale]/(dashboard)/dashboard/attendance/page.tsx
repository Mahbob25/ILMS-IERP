"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/EmptyState";
import { sanitizeInput } from "@/lib/utils/input";
import { Loader2, Check, X, Clock, AlertCircle } from "lucide-react";
import { getLocalDateString } from "@/lib/dates";

interface CourseSection { id: string; course_id: string; teacher_id: string; }
interface Course { id: string; name: string; code: string; }
interface Student { id: string; student_code: string; full_name: string; }
interface Enrollment { id: string; student_id: string; section_id: string; }
interface AttendanceSession { id: string; section_id: string; date: string; }
interface AttendanceRecord { id: string; session_id: string; student_id: string; status: string; }

const STATUS_OPTIONS = ["present", "absent", "late", "excused"];

export default function AttendancePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const readOnly = user?.role?.name !== "teacher";
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "سجل الحضور",
      subtitle: "تسجيل حضور الطلاب اليومي",
      selectSection: "اختر الشعبة",
      date: "التاريخ",
      today: "اليوم",
      createSession: "بدء جلسة حضور",
      student: "الطالب",
      status: "الحالة",
      present: "حاضر",
      absent: "غائب",
      late: "متأخر",
      excused: "معذور",
      save: "حفظ",
      loading: "جاري التحميل...",
      noStudents: "لا يوجد طلاب مسجلين في هذه الشعبة",
      noSection: "اختر شعبة لعرض سجل الحضور",
      saved: "تم الحفظ",
      existingSession: "توجد جلسة حضور لهذا التاريخ",
    },
    en: {
      title: "Attendance",
      subtitle: "Record daily student attendance",
      selectSection: "Select Section",
      date: "Date",
      today: "Today",
      createSession: "Start Attendance Session",
      student: "Student",
      status: "Status",
      present: "Present",
      absent: "Absent",
      late: "Late",
      excused: "Excused",
      save: "Save",
      loading: "Loading...",
      noStudents: "No students enrolled in this section",
      noSection: "Select a section to view attendance",
      saved: "Saved",
      existingSession: "Session already exists for this date",
    },
  }[locale === "en" ? "en" : "ar"];

  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [sessionDate, setSessionDate] = useState(getLocalDateString());
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sectRes, courseRes] = await Promise.all([
        apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000&status=active"),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000"),
      ]);
      setSections(sectRes.data.items);
      setCourses(courseRes.data.items);
    } catch (e: any) {
      setFetchError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getCourseName = (id: string) => courses.find((c) => c.id === id)?.name || id;

  useEffect(() => {
    if (!selectedSectionId) return;
    (async () => {
      try {
        const [enrRes, sessRes] = await Promise.all([
          apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments?section_id=${selectedSectionId}&limit=1000`),
          apiClient.get<AttendanceSession[]>(`/lms/attendance/sessions?section_id=${selectedSectionId}`),
        ]);
        setEnrollments(enrRes.data.items);

        const studentIds = enrRes.data.items.map((e) => e.student_id);
        if (studentIds.length > 0) {
          const studRes = await apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000").catch(() => null);
          setStudents(studRes ? studRes.data.items.filter((s) => studentIds.includes(s.id)) : []);
        } else {
          setStudents([]);
        }

        const existing = sessRes.data.find((s) => s.date === sessionDate);
        setCurrentSession(existing || null);

        if (existing) {
          const recRes = await apiClient.get<AttendanceRecord[]>(`/lms/attendance/sessions/${existing.id}`);
          const recordMap: Record<string, string> = {};
          recRes.data.forEach((r) => { recordMap[r.student_id] = r.status; });
          setRecords(recordMap);
        }
      } catch (e: any) { setFetchError(e?.message || "Failed to load attendance data"); }
    })();
  }, [selectedSectionId, sessionDate]);

  const handleCreateOrSave = async () => {
    setSaving(true);
    setSubmitting(true);
    setSavedMsg(false);
    setFetchError(null);
    try {
      let session = currentSession;
      if (!session) {
        const res = await apiClient.post("/lms/attendance/sessions", {
          section_id: selectedSectionId,
          date: sessionDate,
        });
        session = res.data;
        setCurrentSession(session);
      }
      if (!session) return;
      const recordsPayload = Object.entries(records).map(([student_id, status]) => ({
        student_id,
        status: status || "present",
      }));
      await apiClient.post(`/lms/attendance/sessions/${session.id}/records`, { records: recordsPayload });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (e: any) {
      setFetchError(e?.message || "Failed to save attendance");
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const setStatus = (studentId: string, status: string) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "present": return <Check size={14} className="text-emerald-500" />;
      case "absent": return <X size={14} className="text-red-500" />;
      case "late": return <Clock size={14} className="text-amber-500" />;
      case "excused": return <AlertCircle size={14} className="text-blue-500" />;
      default: return null;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-slate-400" size={24} /></div>;
  }

  const enrolledStudents = enrollments
    .map((e) => students.find((s) => s.id === e.student_id))
    .filter(Boolean) as Student[];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} />
          {selectedSectionId && (
            <button
              onClick={() => router.push(`/${locale}/dashboard/attendance/print?sectionId=${selectedSectionId}&date=${encodeURIComponent(sessionDate)}`)}
              className="btn-secondary text-xs"
            >
              {locale === "ar" ? "طباعة الكشف" : "Print Sheet"}
            </button>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
            <Select
              value={selectedSectionId}
              onChange={setSelectedSectionId}
              options={sections.map((sec) => ({ value: sec.id, label: getCourseName(sec.course_id) }))}
              placeholder="--"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.date}</label>
            <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="input-field" />
          </div>
          <div className="flex items-end">
            {selectedSectionId && !readOnly && (
              <button onClick={handleCreateOrSave} disabled={saving || submitting} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                <span>{currentSession ? t.save : t.createSession}</span>
              </button>
            )}
          </div>
        </div>
        {fetchError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={16} />
            {fetchError}
            <button onClick={() => setFetchError(null)} className="ms-auto">&times;</button>
          </div>
        )}
        {savedMsg && <p className="text-sm text-emerald-600 font-medium">{t.saved} ✓</p>}
      </div>

      {!selectedSectionId && (
        <EmptyState title={t.noSection} message="" />
      )}

      {selectedSectionId && enrolledStudents.length === 0 && (
        <EmptyState title={t.noStudents} message="" />
      )}

      {selectedSectionId && enrolledStudents.length > 0 && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.student}</th>
                <th>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {enrolledStudents.map((student, idx) => (
                <tr key={student.id}>
                  <td className="text-slate-400 text-xs">{idx + 1}</td>
                  <td className="font-medium text-slate-900">{student.full_name}</td>
                  <td>
                    <div className="flex items-center gap-2 flex-wrap">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatus(student.id, status)}
                          disabled={readOnly}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
                            readOnly ? "opacity-60 cursor-not-allowed" : ""
                          } ${
                            (records[student.id] || "present") === status
                              ? "bg-brand-50 border-brand-300 text-brand-700"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {statusIcon(status)}
                          <span>{t[status as keyof typeof t] || status}</span>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
