"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import StudentFormFields from "@/components/students/StudentFormFields";
import { Plus, Pencil, Trash2, Loader2, Eye, AlertCircle, Workflow } from "lucide-react";
import { sanitizeInput, validateName } from "@/lib/utils/input";
import TableContainer from '@/components/ui/TableContainer';

interface Student {
  id: string;
  student_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
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
      phone: "رقم الهاتف",
      parentTitle: "بيانات ولي الأمر (اختياري)",
      parentFullName: "اسم ولي الأمر",
      parentPhone: "هاتف ولي الأمر",
      parentEmail: "بريد ولي الأمر",
      parentRelationship: "صلة القرابة",
      actions: "الإجراءات",
      add: "إضافة طالب",
      quickEnroll: "تسجيل سريع",
      edit: "تعديل",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا يوجد طلاب بعد",
      confirmTitle: "تأكيد الحذف",
      search: "بحث باسم أو رقم الطالب...",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      nameInvalid: "الاسم يحتوي على أحرف غير صالحة",
      deleted: "تم حذف الطالب بنجاح",
      deleteFailed: "لا يمكن حذف الطالب لوجود تسجيلات مرتبطة به",
      confirmDelete: "هل أنت متأكد من حذف هذا الطالب؟",
      yes: "نعم",
      no: "لا",
      credentialsTitle: "بيانات الدخول إلى البوابة",
      credentialsHint: "سجّل الدخول من aldirasat.com بهذه البيانات:",
      studentCreds: "حساب الطالب",
      parentCreds: "حساب ولي الأمر",
      copy: "نسخ",
      copied: "تم النسخ",
      close: "إغلاق",
    },
    en: {
      title: "Students",
      subtitle: "Manage student records",
      studentCode: "Student Code",
      fullName: "Full Name",
      email: "Email",
      phone: "Phone",
      parentTitle: "Parent Information (optional)",
      parentFullName: "Parent Full Name",
      parentPhone: "Parent Phone",
      parentEmail: "Parent Email",
      parentRelationship: "Relationship",
      actions: "Actions",
      add: "Add Student",
      quickEnroll: "Quick Enroll",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No students yet",
      confirmTitle: "Confirm Deletion",
      search: "Search by name or code...",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      nameInvalid: "Name contains invalid characters",
      deleted: "Student deleted successfully",
      deleteFailed: "Cannot delete student with existing enrollments",
      confirmDelete: "Are you sure you want to delete this student?",
      yes: "Yes",
      no: "No",
      credentialsTitle: "Portal Credentials",
      credentialsHint: "Sign in at aldirasat.com with these credentials:",
      studentCreds: "Student account",
      parentCreds: "Parent account",
      copy: "Copy",
      copied: "Copied",
      close: "Close",
    },
  }[locale === "en" ? "en" : "ar"];

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    student_code: "",
    full_name: "",
    email: "",
    phone: "",
    parent_full_name: "",
    parent_phone: "",
    parent_email: "",
    parent_relationship: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [portalCreds, setPortalCreds] = useState<any>(null);
  const limit = 15;

  const fetchStudents = useCallback(async (searchTerm = "", pageNum = 1) => {
    setMessage(null);
    setFetchError(null);
    try {
      const skip = (pageNum - 1) * limit;
      const params = `?search=${encodeURIComponent(searchTerm)}&skip=${skip}&limit=${limit}&sort_by=full_name&sort_order=asc`;
      const res = await apiClient.get<{ items: Student[]; total: number }>(`/academic/students${params}`);
      setStudents(res.data.items);
      setTotalCount(res.data.total);
    } catch (e: any) {
      setFetchError(e.message || "Failed to load students");
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
      fetchStudents(escapeLikeWildcards(value), 1);
    }, 400));
  };

  function escapeLikeWildcards(value: string): string {
    return value.replace(/[%_]/g, "\\$&");
  }

  useEffect(() => {
    setLoading(true);
    fetchStudents();
    return () => { if (searchTimeout) clearTimeout(searchTimeout); };
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const canEdit = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";
  const canDelete = user?.is_superadmin;

  const openCreate = () => {
    setForm({
      student_code: "",
      full_name: "",
      email: "",
      phone: "",
      parent_full_name: "",
      parent_phone: "",
      parent_email: "",
      parent_relationship: "",
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (student: Student) => {
    setForm({
      student_code: student.student_code,
      full_name: student.full_name,
      email: student.email || "",
      phone: student.phone || "",
      parent_full_name: "",
      parent_phone: "",
      parent_email: "",
      parent_relationship: "",
    });
    setEditingId(student.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!validateName(form.full_name, locale as "ar" | "en")) {
      setMessage({ type: "error", text: t.nameInvalid });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        student_code: sanitizeInput(form.student_code),
        full_name: sanitizeInput(form.full_name),
        email: form.email ? sanitizeInput(form.email) : undefined,
        phone: form.phone ? sanitizeInput(form.phone) : undefined,
        parent_full_name: form.parent_full_name ? sanitizeInput(form.parent_full_name) : undefined,
        parent_phone: form.parent_phone ? sanitizeInput(form.parent_phone) : undefined,
        parent_email: form.parent_email ? sanitizeInput(form.parent_email) : undefined,
        parent_relationship: form.parent_relationship ? sanitizeInput(form.parent_relationship) : undefined,
      };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined || payload[k] === "") delete payload[k];
      });
      if (editingId) {
        await apiClient.put(`/academic/students/${editingId}`, payload);
      } else {
        const res = await apiClient.post("/academic/students", payload);
        const created = res.data as any;
        if (created?.portal_credentials) {
          setPortalCreds(created.portal_credentials);
        }
      }
      setShowForm(false);
      setEditingId(null);
      fetchStudents(search, page);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const text = Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : (detail || e.message || "Failed to save student");
      setMessage({ type: "error", text });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/students/${id}`);
      setDeleteTarget(null);
      setMessage({ type: "success", text: t.deleted });
      fetchStudents(search, page);
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
          <RefreshButton onRefresh={() => fetchStudents(search, page)} />
          {canEdit && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              <span>{t.add}</span>
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => router.push(`/${locale}/dashboard/wizards/student-enrollment`)}
              className="btn-secondary flex items-center gap-2"
            >
              <Workflow size={16} />
              <span>{t.quickEnroll}</span>
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
            className="input-field ps-9"
          />
          <svg className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setPage(1); fetchStudents("", 1); }} className="text-xs text-slate-500 hover:text-slate-700">
            {t.cancel}
          </button>
        )}
      </div>

      {fetchError && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{fetchError}</span>
        </div>
      )}

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? t.edit : t.add} size="xl">
        <div className="space-y-6">
          <StudentFormFields
            values={form}
            onChange={setForm}
            labels={{
              studentCode: t.studentCode,
              fullName: t.fullName,
              email: t.email,
              phone: t.phone,
              parentTitle: t.parentTitle,
              parentFullName: t.parentFullName,
              parentPhone: t.parentPhone,
              parentEmail: t.parentEmail,
              parentRelationship: t.parentRelationship,
            }}
          />
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={submitting} className="btn-primary">{submitting ? "..." : t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      {students.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <TableContainer>
            <table className="data-table">
            <thead>
              <tr>
                <th>{t.studentCode}</th>
                <th>{t.fullName}</th>
                <th>{t.email}</th>
                <th>{t.phone}</th>
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
                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline text-start"
                      >
                        {student.full_name}
                      </button>
                    </td>
                    <td className="text-slate-600">{student.email || "—"}</td>
                    <td className="text-slate-600">{student.phone || "—"}</td>
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
                            <button onClick={() => setDeleteTarget(student)} className="btn-icon text-red-500" title={t.delete}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
              ))}
            </tbody>
          </table>
        </TableContainer>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>{t.showing} {Math.min((page - 1) * limit + 1, totalCount)}–{Math.min(page * limit, totalCount)} {t.of} {totalCount}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => { const p = page - 1; setPage(p); fetchStudents(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.prev}</button>
              <button
                disabled={page >= Math.ceil(totalCount / limit)}
                onClick={() => { const p = page + 1; setPage(p); fetchStudents(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.next}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={t.confirmTitle}
        message={deleteTarget ? `${t.confirmDelete} (${deleteTarget.full_name})` : ""}
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        open={portalCreds !== null}
        onClose={() => setPortalCreds(null)}
        title={t.credentialsTitle}
      >
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-500">{t.credentialsHint}</p>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-xs font-semibold text-slate-700">{t.studentCreds}</p>
            <p className="text-xs text-slate-600">Email: <span dir="ltr" className="font-mono">{portalCreds?.student_email}</span></p>
            <p className="text-xs text-slate-600">Password: <span dir="ltr" className="font-mono">{portalCreds?.student_password}</span></p>
          </div>

          {portalCreds?.parent_email && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-700">{t.parentCreds}</p>
              <p className="text-xs text-slate-600">Email: <span dir="ltr" className="font-mono">{portalCreds.parent_email}</span></p>
              <p className="text-xs text-slate-600">Password: <span dir="ltr" className="font-mono">{portalCreds.parent_password}</span></p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={() => setPortalCreds(null)} className="btn-primary">{t.close}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
