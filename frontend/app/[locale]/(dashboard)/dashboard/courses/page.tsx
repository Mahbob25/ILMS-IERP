"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import ConfirmModal from "@/components/ConfirmModal";
import { Plus, Pencil, Trash2, Loader2, RefreshCw } from "lucide-react";

interface Course {
  id: string;
  name: string;
  code: string;
  description: string | null;
  credits: number;
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
      actions: "الإجراءات",
      add: "إضافة مقرر",
      edit: "تعديل",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد مقررات دراسية بعد",
      confirmTitle: "تأكيد الحذف",
      confirmDelete: "هل أنت متأكد من حذف هذا المقرر؟",
      yes: "نعم",
      no: "لا",
      refresh: "تحديث",
      search: "بحث باسم أو رمز المقرر...",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      deleted: "تم حذف المقرر بنجاح",
      paymentsExist: "لا يمكن حذف المقرر: يوجد شعب تحتوي على تسجيلات عليها مدفوعات",
    },
    en: {
      title: "Courses",
      subtitle: "Manage courses and subjects",
      name: "Name",
      code: "Code",
      description: "Description",
      credits: "Credits",
      actions: "Actions",
      add: "Add Course",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No courses yet",
      confirmTitle: "Confirm Deletion",
      confirmDelete: "Are you sure you want to delete this course?",
      yes: "Yes",
      no: "No",
      refresh: "Refresh",
      search: "Search by name or code...",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      deleted: "Course deleted successfully",
      paymentsExist: "Cannot delete course: one or more sections have enrollments with payments",
    },
  }[locale === "en" ? "en" : "ar"];

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", credits: 3 });
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 15;

  const fetchCourses = useCallback(async (searchTerm = "", pageNum = 1) => {
    try {
      const skip = (pageNum - 1) * limit;
      const params = `?search=${encodeURIComponent(searchTerm)}&skip=${skip}&limit=${limit}&sort_by=name&sort_order=asc`;
      const res = await apiClient.get<{ items: Course[]; total: number }>(`/academic/courses${params}`);
      setCourses(res.data.items);
      setTotalCount(res.data.total);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {
      setPage(1);
      fetchCourses(value, 1);
    }, 400));
  };

  useEffect(() => {
    setLoading(true);
    fetchCourses().finally(() => setLoading(false));
    return () => { if (searchTimeout) clearTimeout(searchTimeout); };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCourses(search, page);
    setRefreshing(false);
  };

  const totalPages = Math.ceil(totalCount / limit);

  const canEdit = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";
  const canDelete = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const openCreate = () => {
    setForm({ name: "", code: "", description: "", credits: 3 });
    setEditingId(null);
    setShowForm(true);
    setMessage(null);
  };

  const openEdit = (course: Course) => {
    setForm({
      name: course.name,
      code: course.code,
      description: course.description || "",
      credits: course.credits,
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
      setDeleteTarget(null);
      setMessage({ type: "success", text: t.deleted });
      handleRefresh();
    } catch (e: unknown) {
      setDeleteTarget(null);
      const err = e as { response?: { data?: { detail?: string } } };
      const detail = err?.response?.data?.detail || "Delete failed";
      const known: Record<string, string> = {
        "Cannot delete course: one or more sections have enrollments with payments": t.paymentsExist,
        "Course not found": t.empty,
      };
      setMessage({ type: "error", text: known[detail] || detail });
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
          <button onClick={() => { setSearch(""); setPage(1); fetchCourses("", 1); }} className="text-xs text-slate-500 hover:text-slate-700">
            {t.cancel}
          </button>
        )}
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="mr-2 float-end">&times;</button>
        </div>
      )}

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
                <th>{t.credits}</th>
                {(canEdit || canDelete) && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td className="font-medium text-slate-900">{course.name}</td>
                  <td><span className="badge">{course.code}</span></td>
                  <td className="text-slate-600">{course.credits}</td>
                  {(canEdit || canDelete) && (
                    <td>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button onClick={() => openEdit(course)} className="btn-icon" title={t.edit}>
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteTarget(course)} className="btn-icon text-red-500" title={t.delete}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
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
                onClick={() => { const p = page - 1; setPage(p); fetchCourses(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.prev}</button>
              <button
                disabled={page >= totalPages}
                onClick={() => { const p = page + 1; setPage(p); fetchCourses(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.next}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={t.confirmTitle}
        message={deleteTarget ? `${t.confirmDelete} (${deleteTarget.name})` : ""}
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
