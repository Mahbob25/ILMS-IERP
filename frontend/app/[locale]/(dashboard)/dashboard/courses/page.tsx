"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

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
      confirmDelete: "هل أنت متأكد من حذف هذا المقرر؟",
      yes: "نعم",
      no: "لا",
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
      confirmDelete: "Are you sure you want to delete this course?",
      yes: "Yes",
      no: "No",
    },
  }[locale === "en" ? "en" : "ar"];

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", credits: 3 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchCourses = async () => {
    try {
      const res = await apiClient.get<Course[]>("/academic/courses");
      setCourses(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCourses(); }, []);

  const canEdit = user?.is_superadmin || user?.role?.name === "admin";
  const canDelete = user?.is_superadmin;

  const openCreate = () => {
    setForm({ name: "", code: "", description: "", credits: 3 });
    setEditingId(null);
    setShowForm(true);
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
      const payload: Record<string, unknown> = { ...form };
      if (!payload.description) delete payload.description;
      if (editingId) {
        const cleaned: Record<string, unknown> = {};
        Object.entries(payload).forEach(([k, v]) => { if (v !== "" && v !== null) cleaned[k] = v; });
        await apiClient.put(`/academic/courses/${editingId}`, cleaned);
      } else {
        await apiClient.post("/academic/courses", payload);
      }
      setShowForm(false);
      setEditingId(null);
      fetchCourses();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/courses/${id}`);
      setDeleteConfirm(null);
      fetchCourses();
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
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>{t.add}</span>
          </button>
        )}
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
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <button onClick={() => openEdit(course)} className="btn-icon" title={t.edit}>
                            <Pencil size={15} />
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
                                <Trash2 size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
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
