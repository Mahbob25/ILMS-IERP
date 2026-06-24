"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface Enrollment {
  id: string;
  student_id: string;
  section_id: string;
  enrolled_at: string;
}

interface Student { id: string; student_code: string; full_name: string; }
interface CourseSection { id: string; course_id: string; term_id: string; }
interface Course { id: string; name: string; code: string; }
interface Term { id: string; name: string; }

export default function EnrollmentsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "التسجيلات",
      subtitle: "إدارة تسجيل الطلاب في الشعب الدراسية",
      student: "الطالب",
      section: "الشعبة",
      course: "المقرر",
      term: "الفصل",
      enrolledAt: "تاريخ التسجيل",
      actions: "الإجراءات",
      add: "تسجيل طالب",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد تسجيلات بعد",
      confirmDelete: "هل أنت متأكد من حذف هذا التسجيل؟",
      yes: "نعم",
      no: "لا",
      selectStudent: "اختر الطالب",
      selectSection: "اختر الشعبة",
    },
    en: {
      title: "Enrollments",
      subtitle: "Manage student enrollments in course sections",
      student: "Student",
      section: "Section",
      course: "Course",
      term: "Term",
      enrolledAt: "Enrolled At",
      actions: "Actions",
      add: "Enroll Student",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No enrollments yet",
      confirmDelete: "Are you sure you want to delete this enrollment?",
      yes: "Yes",
      no: "No",
      selectStudent: "Select Student",
      selectSection: "Select Section",
    },
  }[locale === "en" ? "en" : "ar"];

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ student_id: "", section_id: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [enrollRes, studRes, sectRes, courseRes, termRes] = await Promise.all([
        apiClient.get<Enrollment[]>("/academic/enrollments"),
        apiClient.get<Student[]>("/academic/students"),
        apiClient.get<CourseSection[]>("/academic/course-sections"),
        apiClient.get<Course[]>("/academic/courses"),
        apiClient.get<Term[]>("/academic/terms"),
      ]);
      setEnrollments(enrollRes.data);
      setStudents(studRes.data);
      setSections(sectRes.data);
      setCourses(courseRes.data);
      setTerms(termRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const canEdit = user?.is_superadmin || user?.role?.name === "admin";

  const getStudentName = (id: string) => students.find((s) => s.id === id)?.full_name || id;
  const getStudentCode = (id: string) => students.find((s) => s.id === id)?.student_code || "";
  const getSectionCourse = (id: string) => {
    const sect = sections.find((s) => s.id === id);
    if (!sect) return id;
    const course = courses.find((c) => c.id === sect.course_id);
    return course ? `${course.name} (${course.code})` : id;
  };
  const getSectionTerm = (id: string) => {
    const sect = sections.find((s) => s.id === id);
    if (!sect) return "";
    const term = terms.find((t) => t.id === sect.term_id);
    return term?.name || "";
  };

  const handleSave = async () => {
    try {
      await apiClient.post("/academic/enrollments", form);
      setShowForm(false);
      setForm({ student_id: "", section_id: "" });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/enrollments/${id}`);
      setDeleteConfirm(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>{t.add}</span>
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectStudent}</label>
              <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                className="input-field">
                <option value="">--</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
              <select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                className="input-field">
                <option value="">--</option>
                {sections.map((sec) => {
                  const course = courses.find((c) => c.id === sec.course_id);
                  const term = terms.find((tm) => tm.id === sec.term_id);
                  return (
                    <option key={sec.id} value={sec.id}>
                      {course?.name} - {term?.name}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.student}</th>
                <th>{t.course}</th>
                <th>{t.term}</th>
                <th>{t.enrolledAt}</th>
                {canEdit && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enr) => (
                <tr key={enr.id}>
                  <td className="font-medium text-slate-900">
                    {getStudentName(enr.student_id)}
                    <span className="text-xs text-slate-400 block">{getStudentCode(enr.student_id)}</span>
                  </td>
                  <td className="text-slate-600">{getSectionCourse(enr.section_id)}</td>
                  <td className="text-slate-600">{getSectionTerm(enr.section_id)}</td>
                  <td className="text-slate-600 text-sm">{new Date(enr.enrolled_at).toLocaleDateString()}</td>
                  {canEdit && (
                    <td>
                      {deleteConfirm === enr.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(enr.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">{t.yes}</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{t.no}</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(enr.id)} className="btn-icon text-red-500" title={t.delete}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
