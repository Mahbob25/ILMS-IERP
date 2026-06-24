"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Pencil, Trash2, Loader2, RefreshCw, Play, CheckCircle2, UserPlus } from "lucide-react";

interface Course {
  id: string;
  name: string;
  code: string;
  description: string | null;
  credits: number;
  status: string;
  teacher_percentage: number | null;
  min_students_required: number | null;
}

interface Section {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
}

interface Student {
  id: string;
  student_code: string;
  full_name: string;
}

export default function CoursesPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "المقررات الدراسية",
      subtitle: "إدارة المقررات والمواد التعليمية",
      name: "الاسم",
      code: "الرمز",
      description: "الوصف",
      credits: "الوحدات",
      status: "الحالة",
      quota: "الحصة",
      teacherPct: "نسبة المعلم",
      actions: "الإجراءات",
      add: "إضافة مقرر",
      edit: "تعديل",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد مقررات دراسية بعد",
      confirmDelete: "هل أنت متأكد من حذف هذا المقرر؟",
      yes: "نعم",
      no: "لا",
      activate: "تفعيل",
      complete: "إكمال",
      pending: "قيد الانتظار",
      active: "نشط",
      completed: "مكتمل",
      registerStudent: "تسجيل طالب",
      minStudents: "الحد الأدنى للطلاب",
      enrolled: "مسجل",
      refresh: "تحديث",
      teacherPctLabel: "نسبة المعلم (%)",
      selectStudent: "اختر الطالب",
      selectSection: "اختر الشعبة",
      register: "تسجيل",
    },
    en: {
      title: "Courses",
      subtitle: "Manage courses and subjects",
      name: "Name",
      code: "Code",
      description: "Description",
      credits: "Credits",
      status: "Status",
      quota: "Quota",
      teacherPct: "Teacher %",
      actions: "Actions",
      add: "Add Course",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No courses yet",
      confirmDelete: "Are you sure you want to delete this course?",
      yes: "Yes",
      no: "No",
      activate: "Activate",
      complete: "Complete",
      pending: "Pending",
      active: "Active",
      completed: "Completed",
      registerStudent: "Register Student",
      minStudents: "Min Students",
      enrolled: "Enrolled",
      refresh: "Refresh",
      teacherPctLabel: "Teacher Percentage (%)",
      selectStudent: "Select Student",
      selectSection: "Select Section",
      register: "Register",
    },
  }[locale === "en" ? "en" : "ar"];

  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", credits: 3, min_students_required: 0, teacher_percentage: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activatePct, setActivatePct] = useState<Record<string, string>>({});
  const [showRegister, setShowRegister] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState({ student_id: "", section_id: "" });
  const [registerMsg, setRegisterMsg] = useState("");

  const fetchCourses = useCallback(async () => {
    try {
      const res = await apiClient.get<Course[]>("/academic/courses");
      setCourses(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSections = useCallback(async () => {
    try {
      const res = await apiClient.get<Section[]>("/academic/course-sections");
      setSections(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiClient.get<Student[]>("/academic/students");
      setStudents(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchCourses(), fetchSections(), fetchStudents()]);
    setLoading(false);
  }, [fetchCourses, fetchSections, fetchStudents]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCourses(), fetchSections()]);
    setRefreshing(false);
  };

  const canEdit = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";
  const canDelete = user?.is_superadmin;
  const canActivate = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";
  const canRegister = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const getEnrolledCount = (courseId: string) =>
    sections.filter(s => s.course_id === courseId).reduce((sum, s) => sum + s.enrolled_count, 0);

  const getMinRequired = (course: Course) => course.min_students_required || 1;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-50 text-amber-600 border-amber-200",
      active: "bg-emerald-50 text-emerald-600 border-emerald-200",
      completed: "bg-slate-100 text-slate-500 border-slate-200",
    };
    const labels: Record<string, string> = {
      pending: t.pending,
      active: t.active,
      completed: t.completed,
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  const openCreate = () => {
    setForm({ name: "", code: "", description: "", credits: 3, min_students_required: 0, teacher_percentage: "" });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (course: Course) => {
    setForm({
      name: course.name,
      code: course.code,
      description: course.description || "",
      credits: course.credits,
      min_students_required: course.min_students_required || 0,
      teacher_percentage: course.teacher_percentage?.toString() || "",
    });
    setEditingId(course.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        code: form.code,
        credits: form.credits,
      };
      if (form.description) payload.description = form.description;
      if (form.min_students_required > 0) payload.min_students_required = form.min_students_required;
      if (form.teacher_percentage) payload.teacher_percentage = parseFloat(form.teacher_percentage);
      if (editingId) {
        const cleaned: Record<string, unknown> = {};
        Object.entries(payload).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) cleaned[k] = v; });
        await apiClient.put(`/academic/courses/${editingId}`, cleaned);
      } else {
        await apiClient.post("/academic/courses", payload);
      }
      setShowForm(false);
      setEditingId(null);
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/courses/${id}`);
      setDeleteConfirm(null);
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleActivate = async (courseId: string) => {
    const pct = parseFloat(activatePct[courseId] || "0");
    if (!pct || pct <= 0 || pct > 100) return;
    try {
      await apiClient.post(`/academic/courses/${courseId}/activate`, { teacher_percentage: pct });
      setActivatePct(prev => ({ ...prev, [courseId]: "" }));
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleComplete = async (courseId: string) => {
    try {
      await apiClient.post(`/academic/courses/${courseId}/complete`);
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.student_id || !registerForm.section_id) return;
    try {
      await apiClient.post("/academic/enrollments", {
        student_id: registerForm.student_id,
        section_id: registerForm.section_id,
      });
      setRegisterForm({ student_id: "", section_id: "" });
      setRegisterMsg("");
      setShowRegister(null);
      handleRefresh();
    } catch (e) {
      setRegisterMsg("Registration failed");
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
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          {canEdit && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              <span>{t.add}</span>
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.name}</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.code}</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.description}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field" rows={3} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.credits}</label>
              <input type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value) || 0 })}
                className="input-field" min={0} max={20} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.minStudents}</label>
              <input type="number" value={form.min_students_required} onChange={(e) => setForm({ ...form, min_students_required: parseInt(e.target.value) || 0 })}
                className="input-field" min={0} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.code}</th>
                <th>{t.status}</th>
                <th>{t.quota}</th>
                <th>{t.teacherPct}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const enrolled = getEnrolledCount(course.id);
                const minReq = getMinRequired(course);
                const quotaMet = enrolled >= minReq;
                const courseSections = sections.filter(s => s.course_id === course.id);
                return (
                  <tr key={course.id}>
                    <td className="font-medium text-slate-900">{course.name}</td>
                    <td><span className="badge">{course.code}</span></td>
                    <td>{statusBadge(course.status)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 w-24">
                          <div
                            className={`h-2 rounded-full transition-all ${quotaMet ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{ width: `${Math.min(100, (enrolled / minReq) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {enrolled}/{minReq}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-600">
                      {course.teacher_percentage != null ? `${course.teacher_percentage}%` : "—"}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {canEdit && course.status !== "completed" && (
                          <button onClick={() => openEdit(course)} className="btn-icon" title={t.edit}>
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <>
                            {deleteConfirm === course.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleDelete(course.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">{t.yes}</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{t.no}</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(course.id)} className="btn-icon text-red-500" title={t.delete}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </>
                        )}
                        {canActivate && course.status === "pending" && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              placeholder="%"
                              value={activatePct[course.id] || ""}
                              onChange={(e) => setActivatePct(prev => ({ ...prev, [course.id]: e.target.value }))}
                              className="w-14 text-xs px-1 py-1 border border-slate-200 rounded"
                              min={1} max={100}
                            />
                            <button
                              onClick={() => handleActivate(course.id)}
                              disabled={!quotaMet || !activatePct[course.id]}
                              className={`btn-icon ${quotaMet ? "text-emerald-600" : "text-slate-300"}`}
                              title={t.activate}
                            >
                              <Play size={14} />
                            </button>
                          </div>
                        )}
                        {canActivate && course.status === "active" && (
                          <button onClick={() => handleComplete(course.id)} className="btn-icon text-blue-600" title={t.complete}>
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        {canRegister && course.status === "pending" && courseSections.length > 0 && (
                          <button onClick={() => { setShowRegister(course.id); setRegisterForm({ student_id: "", section_id: courseSections[0]?.id || "" }); }} className="btn-icon text-indigo-600" title={t.registerStudent}>
                            <UserPlus size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{t.registerStudent}</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectStudent}</label>
              <select
                value={registerForm.student_id}
                onChange={(e) => setRegisterForm(prev => ({ ...prev, student_id: e.target.value }))}
                className="input-field"
              >
                <option value="">—</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
              <select
                value={registerForm.section_id}
                onChange={(e) => setRegisterForm(prev => ({ ...prev, section_id: e.target.value }))}
                className="input-field"
              >
                {sections.filter(s => s.course_id === showRegister).map(s => (
                  <option key={s.id} value={s.id}>{s.enrolled_count}/{s.capacity}</option>
                ))}
              </select>
            </div>
            {registerMsg && <p className="text-xs text-red-500">{registerMsg}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={handleRegister} className="btn-primary">{t.register}</button>
              <button onClick={() => { setShowRegister(null); setRegisterMsg(""); }} className="btn-secondary">{t.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
