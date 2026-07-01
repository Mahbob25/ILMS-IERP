"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import ConfirmModal from "@/components/ConfirmModal";
import { Plus, Trash2, Loader2, RefreshCw } from "lucide-react";

interface Enrollment {
  id: string;
  student_id: string;
  section_id: string;
  enrolled_at: string;
  agreed_price: number | null;
  admin_discount: number | null;
}

interface Student { id: string; student_code: string; full_name: string; }
interface CourseSection { id: string; course_id: string; }
interface Course { id: string; name: string; code: string; }

export default function EnrollmentsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "التسجيلات",
      subtitle: "إدارة تسجيل الطلاب في الشعب",
      student: "الطالب",
      section: "الشعبة",
      enrolledAt: "تاريخ التسجيل",
      price: "السعر",
      discount: "الخصم",
      actions: "الإجراءات",
      add: "تسجيل طالب",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد تسجيلات بعد",
      confirmTitle: "تأكيد الحذف",
      deleted: "تم حذف التسجيل بنجاح",
      deleteFailed: "لا يمكن حذف التسجيل لوجود مدفوعات مرتبطة به",
      confirmDelete: "هل أنت متأكد من حذف هذا التسجيل؟",
      yes: "نعم",
      no: "لا",
      selectStudent: "اختر الطالب",
      selectSection: "اختر الشعبة",
      search: "بحث باسم الطالب...",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      refresh: "تحديث",
    },
    en: {
      title: "Enrollments",
      subtitle: "Manage student enrollments in sections",
      student: "Student",
      section: "Section",
      enrolledAt: "Enrolled At",
      price: "Price",
      discount: "Discount",
      actions: "Actions",
      add: "Enroll Student",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No enrollments yet",
      confirmTitle: "Confirm Deletion",
      deleted: "Enrollment deleted successfully",
      deleteFailed: "Cannot delete enrollment with existing payments",
      confirmDelete: "Are you sure you want to delete this enrollment?",
      yes: "Yes",
      no: "No",
      selectStudent: "Select Student",
      selectSection: "Select Section",
      search: "Search by student name...",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      refresh: "Refresh",
    },
  }[locale === "en" ? "en" : "ar"];

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ student_id: "", section_id: "", admin_discount: "" });
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 15;

  const fetchLookups = useCallback(async () => {
    const [studentRes, sectionRes, courseRes] = await Promise.all([
      apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000").catch(() => null),
      apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000").catch(() => null),
      apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000").catch(() => null),
    ]);
    if (studentRes) setStudents(studentRes.data.items);
    if (sectionRes) setSections(sectionRes.data.items);
    if (courseRes) setCourses(courseRes.data.items);
  }, []);

  const fetchEnrollments = useCallback(async (searchTerm = "", pageNum = 1) => {
    setMessage(null);
    try {
      const skip = (pageNum - 1) * limit;
      const params = `?search=${encodeURIComponent(searchTerm)}&skip=${skip}&limit=${limit}&sort_by=enrolled_at&sort_order=desc`;
      const res = await apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments${params}`);
      setEnrollments(res.data.items);
      setTotalCount(res.data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {
      setPage(1);
      fetchEnrollments(value, 1);
    }, 400));
  };

  useEffect(() => {
    setLoading(true);
    fetchLookups();
    fetchEnrollments();
    return () => { if (searchTimeout) clearTimeout(searchTimeout); };
  }, []);

  const canEdit = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const getStudentName = (id: string) => students.find((s) => s.id === id)?.full_name || id;
  const getStudentCode = (id: string) => students.find((s) => s.id === id)?.student_code || "";
  const getSectionCourse = (sectionId: string) => {
    const sect = sections.find((s) => s.id === sectionId);
    if (!sect) return sectionId;
    const course = courses.find((c) => c.id === sect.course_id);
    return course ? `${course.name} (${course.code})` : sectionId;
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const openCreate = () => {
    setMessage(null);
    setForm({ student_id: "", section_id: "", admin_discount: "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.student_id || !form.section_id) return;
    try {
      const payload: Record<string, unknown> = {
        student_id: form.student_id,
        section_id: form.section_id,
      };
      if (form.admin_discount) payload.admin_discount = parseFloat(form.admin_discount);
      await apiClient.post("/academic/enrollments", payload);
      setShowForm(false);
      fetchEnrollments(search, page);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/enrollments/${id}`);
      setDeleteTarget(null);
      setMessage({ type: "success", text: t.deleted });
      fetchEnrollments(search, page);
    } catch (e: any) {
      setDeleteTarget(null);
      const detail = e?.response?.data?.detail || e?.message || "";
      setMessage({ type: "error", text: detail || t.deleteFailed });
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
          <button onClick={() => fetchEnrollments(search, page)} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} />
          </button>
          {canEdit && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              <span>{t.add}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t.search}
            className="input-field pl-9"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setPage(1); fetchEnrollments("", 1); }} className="text-xs text-slate-500 hover:text-slate-700">
            {t.cancel}
          </button>
        )}
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {showForm && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectStudent}</label>
              <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                className="input-field">
                <option value="">—</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
              <select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                className="input-field">
                <option value="">—</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{getSectionCourse(s.id)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.discount}</label>
              <input type="number" value={form.admin_discount} onChange={(e) => setForm({ ...form, admin_discount: e.target.value })}
                className="input-field" min={0} />
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
                <th>{t.section}</th>
                <th>{t.price}</th>
                <th>{t.discount}</th>
                <th>{t.enrolledAt}</th>
                {canEdit && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enrollment) => (
                <tr key={enrollment.id}>
                  <td className="font-medium text-slate-900">
                    {getStudentName(enrollment.student_id)}
                    <span className="text-xs text-slate-400 mr-1">({getStudentCode(enrollment.student_id)})</span>
                  </td>
                  <td className="text-slate-600">{getSectionCourse(enrollment.section_id)}</td>
                  <td className="text-slate-600">{enrollment.agreed_price != null ? `${enrollment.agreed_price}` : "—"}</td>
                  <td className="text-slate-600">{enrollment.admin_discount != null ? `${enrollment.admin_discount}` : "—"}</td>
                  <td className="text-slate-500 text-xs">
                    {new Date(enrollment.enrolled_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}
                  </td>
                  {canEdit && (
                    <td>
                      <button onClick={() => setDeleteTarget(enrollment)} className="btn-icon text-red-500" title={t.delete}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>{t.showing} {Math.min((page - 1) * limit + 1, totalCount)}–{Math.min(page * limit, totalCount)} {t.of} {totalCount}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => { const p = page - 1; setPage(p); fetchEnrollments(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.prev}</button>
              <button
                disabled={page >= Math.ceil(totalCount / limit)}
                onClick={() => { const p = page + 1; setPage(p); fetchEnrollments(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.next}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={t.confirmTitle}
        message={deleteTarget ? `${t.confirmDelete} (${getStudentName(deleteTarget.student_id)})` : ""}
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
