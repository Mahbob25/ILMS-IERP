"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import { Plus, Pencil, Trash2, Loader2, Eye } from "lucide-react";

interface Student {
  id: string;
  student_code: string;
  full_name: string;
  email: string | null;
}

export default function StudentsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الطلاب",
      subtitle: "إدارة سجل الطلاب",
      studentCode: "رقم الطالب",
      fullName: "الاسم الكامل",
      email: "البريد الإلكتروني",
      actions: "الإجراءات",
      add: "إضافة طالب",
      edit: "تعديل",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا يوجد طلاب بعد",
      confirmDelete: "هل أنت متأكد من حذف هذا الطالب؟",
      yes: "نعم",
      no: "لا",
    },
    en: {
      title: "Students",
      subtitle: "Manage student records",
      studentCode: "Student Code",
      fullName: "Full Name",
      email: "Email",
      actions: "Actions",
      add: "Add Student",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No students yet",
      confirmDelete: "Are you sure you want to delete this student?",
      yes: "Yes",
      no: "No",
    },
  }[locale === "en" ? "en" : "ar"];

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ student_code: "", full_name: "", email: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiClient.get<Student[]>("/academic/students");
      setStudents(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const canEdit = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";
  const canDelete = user?.is_superadmin;

  const openCreate = () => {
    setForm({ student_code: "", full_name: "", email: "" });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (student: Student) => {
    setForm({
      student_code: student.student_code,
      full_name: student.full_name,
      email: student.email || "",
    });
    setEditingId(student.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.email) delete payload.email;
      if (editingId) {
        const cleaned: Record<string, unknown> = {};
        Object.entries(payload).forEach(([k, v]) => { if (v !== "" && v !== null) cleaned[k] = v; });
        await apiClient.put(`/academic/students/${editingId}`, cleaned);
      } else {
        await apiClient.post("/academic/students", payload);
      }
      setShowForm(false);
      setEditingId(null);
      fetchStudents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/students/${id}`);
      setDeleteConfirm(null);
      fetchStudents();
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
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchStudents} />
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
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.studentCode}</label>
              <input type="text" value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.fullName}</label>
              <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.email}</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.studentCode}</th>
                <th>{t.fullName}</th>
                <th>{t.email}</th>
                {(canEdit || canDelete) && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                  <tr key={student.id}>
                    <td><span className="badge">{student.student_code}</span></td>
                    <td>
                      <button
                        onClick={() => router.push(`/${locale}/dashboard/students/${student.id}`)}
                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline text-left"
                      >
                        {student.full_name}
                      </button>
                    </td>
                    <td className="text-slate-600">{student.email || "—"}</td>
                    {(canEdit || canDelete) && (
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/${locale}/dashboard/students/${student.id}`)}
                            className="btn-icon"
                            title="View Details"
                          >
                            <Eye size={15} />
                          </button>
                          {canEdit && (
                            <button onClick={() => openEdit(student)} className="btn-icon" title={t.edit}>
                              <Pencil size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <>
                              {deleteConfirm === student.id ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleDelete(student.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">{t.yes}</button>
                                  <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{t.no}</button>
                                </div>
                              ) : (
                                <button onClick={() => setDeleteConfirm(student.id)} className="btn-icon text-red-500" title={t.delete}>
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
