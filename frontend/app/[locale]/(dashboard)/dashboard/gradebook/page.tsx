"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import Select from "@/components/ui/Select";
import { Loader2, Save } from "lucide-react";

interface CourseSection { id: string; course_id: string; teacher_id: string; status: string; }
interface Course { id: string; name: string; code: string; }
interface Student { id: string; student_code: string; full_name: string; }
interface Enrollment { id: string; student_id: string; section_id: string; }

interface FinalGrade {
  id: string;
  student_id: string;
  student_name: string;
  final_score: number;
  notes: string | null;
}

export default function GradebookPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "سجل الدرجات",
      subtitle: "إدخال الدرجات النهائية للطلاب",
      selectSection: "اختر الشعبة",
      noSection: "اختر شعبة لعرض سجل الدرجات",
      noStudents: "لا يوجد طلاب مسجلين",
      loading: "جاري التحميل...",
      studentName: "اسم الطالب",
      studentCode: "رمز الطالب",
      finalScore: "الدرجة النهائية",
      notes: "ملاحظات",
      saveAll: "حفظ الكل",
      saved: "تم الحفظ بنجاح",
      saveError: "فشل الحفظ",
      saving: "جاري الحفظ...",
    },
    en: {
      title: "Gradebook",
      subtitle: "Enter final student grades",
      selectSection: "Select Section",
      noSection: "Select a section to view gradebook",
      noStudents: "No students enrolled",
      loading: "Loading...",
      studentName: "Student Name",
      studentCode: "Student Code",
      finalScore: "Final Score",
      notes: "Notes",
      saveAll: "Save All",
      saved: "Saved successfully",
      saveError: "Save failed",
      saving: "Saving...",
    },
  }[locale === "en" ? "en" : "ar"];

  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedSection, setSelectedSection] = useState<CourseSection | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [grades, setGrades] = useState<Record<string, { score: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sectRes, courseRes] = await Promise.all([
        apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000"),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000"),
      ]);
      setSections(sectRes.data.items);
      setCourses(courseRes.data.items);
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getCourseName = (id: string) => courses.find((c) => c.id === id)?.name || id;

  const isCompleted = selectedSection?.status === "completed";

  useEffect(() => {
    if (!selectedSectionId) return;
    (async () => {
      try {
        const [enrRes, gradeRes] = await Promise.all([
          apiClient.get<{ items: Enrollment[]; total: number }>(
            `/academic/enrollments?section_id=${selectedSectionId}&limit=1000`
          ),
          apiClient.get<FinalGrade[]>(`/academic/sections/${selectedSectionId}/final-grades`).catch(() => [] as FinalGrade[]),
        ]);
        setEnrollments(enrRes.data.items);

        const studentIds = enrRes.data.items.map((e) => e.student_id);
        if (studentIds.length > 0) {
          const studRes = await apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000").catch(() => null);
          setStudents(studRes ? studRes.data.items.filter((s) => studentIds.includes(s.id)) : []);
        } else {
          setStudents([]);
        }

        const gradeMap: Record<string, { score: string; notes: string }> = {};
        const gradesData = Array.isArray(gradeRes) ? gradeRes : [];
        for (const g of gradesData) {
          gradeMap[g.student_id] = {
            score: String(g.final_score),
            notes: g.notes || "",
          };
        }
        setGrades(gradeMap);
      } catch { /* */ }
    })();
  }, [selectedSectionId]);

  const handleScoreChange = (studentId: string, value: string) => {
    const num = parseFloat(value);
    if (value !== "" && (isNaN(num) || num < 0)) return;
    if (num > 100) return;
    setGrades((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], score: value },
    }));
  };

  const handleNotesChange = (studentId: string, value: string) => {
    setGrades((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], notes: value },
    }));
  };

  const handleSaveAll = async () => {
    if (!selectedSectionId) return;
    const sectionStudents = enrollments.filter((e) => e.section_id === selectedSectionId);
    const gradesPayload: { student_id: string; final_score: number; notes?: string }[] = [];
    for (const enr of sectionStudents) {
      const g = grades[enr.student_id];
      if (g && g.score !== "") {
        gradesPayload.push({
          student_id: enr.student_id,
          final_score: parseFloat(g.score),
          notes: g.notes || undefined,
        });
      }
    }
    if (gradesPayload.length === 0) return;

    setSaving(true);
    setMessage(null);
    try {
      await apiClient.put(`/academic/sections/${selectedSectionId}/final-grades`, {
        grades: gradesPayload,
      });
      setMessage({ type: "success", text: t.saved });
    } catch {
      setMessage({ type: "error", text: t.saveError });
    } finally {
      setSaving(false);
    }
  };

  const getStudentName = (id: string) => students.find((s) => s.id === id)?.full_name || id;
  const getStudentCode = (id: string) => students.find((s) => s.id === id)?.student_code || "";
  const sectionStudents = selectedSectionId
    ? enrollments.filter((e) => e.section_id === selectedSectionId)
    : [];

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-slate-400" size={24} /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} />
        </div>
      </div>

      <div className="card p-5">
        <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
        <Select
          value={selectedSectionId}
          onChange={(val) => {
            setSelectedSectionId(val);
            setSelectedSection(sections.find((s) => s.id === val) || null);
          }}
          options={sections.map((sec) => ({ value: sec.id, label: getCourseName(sec.course_id) }))}
          placeholder="--"
          className="max-w-md"
        />
      </div>

      {!selectedSectionId && (
        <div className="card p-8 text-center text-sm text-slate-500">{t.noSection}</div>
      )}

      {selectedSectionId && (
        <div className="card overflow-hidden">
          {message && (
            <div className={`mx-4 mt-4 px-4 py-3 rounded-lg text-sm font-medium ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {message.text}
              <button onClick={() => setMessage(null)} className="float-end">&times;</button>
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>{t.studentName}</th>
                <th className="hidden md:table-cell">{t.studentCode}</th>
                <th className="w-32">{t.finalScore} (0-100)</th>
                <th className="w-48 hidden md:table-cell">{t.notes}</th>
              </tr>
            </thead>
            <tbody>
              {sectionStudents.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-slate-500 py-8">{t.noStudents}</td></tr>
              )}
              {sectionStudents.map((enr, idx) => (
                <tr key={enr.student_id}>
                  <td className="text-slate-400 text-xs">{idx + 1}</td>
                  <td className="font-medium text-slate-900">{getStudentName(enr.student_id)}</td>
                  <td className="hidden md:table-cell text-slate-500 text-xs">{getStudentCode(enr.student_id)}</td>
                  <td>
                    <input
                      type="number"
                      value={grades[enr.student_id]?.score ?? ""}
                      onChange={(e) => handleScoreChange(enr.student_id, e.target.value)}
                      readOnly={isCompleted}
                      className={`input-field w-24 text-center ${isCompleted ? "bg-slate-100 cursor-not-allowed" : ""}`}
                      min={0}
                      max={100}
                      step={0.5}
                      placeholder="0"
                    />
                  </td>
                  <td className="hidden md:table-cell">
                    <input
                      type="text"
                      value={grades[enr.student_id]?.notes ?? ""}
                      onChange={(e) => handleNotesChange(enr.student_id, e.target.value)}
                      readOnly={isCompleted}
                      className={`input-field w-full ${isCompleted ? "bg-slate-100 cursor-not-allowed" : ""}`}
                      placeholder="—"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sectionStudents.length > 0 && !isCompleted && (
            <div className="flex justify-end px-4 py-3 border-t border-slate-200">
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                <span>{saving ? t.saving : t.saveAll}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
