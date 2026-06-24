"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Term {
  id: string;
  name: string;
  code: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function TermsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الفصول الدراسية",
      subtitle: "إدارة الفصول والفترات الأكاديمية",
      name: "الاسم",
      code: "الرمز",
      startDate: "تاريخ البداية",
      endDate: "تاريخ النهاية",
      active: "نشط",
      inactive: "غير نشط",
      actions: "الإجراءات",
      add: "إضافة فصل",
      edit: "تعديل",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد فصول دراسية بعد",
      confirmDelete: "هل أنت متأكد من حذف هذا الفصل؟",
      yes: "نعم",
      no: "لا",
    },
    en: {
      title: "Academic Terms",
      subtitle: "Manage semesters and academic periods",
      name: "Name",
      code: "Code",
      startDate: "Start Date",
      endDate: "End Date",
      active: "Active",
      inactive: "Inactive",
      actions: "Actions",
      add: "Add Term",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No academic terms yet",
      confirmDelete: "Are you sure you want to delete this term?",
      yes: "Yes",
      no: "No",
    },
  }[locale === "en" ? "en" : "ar"];

  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", start_date: "", end_date: "", is_active: true });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchTerms = async () => {
    try {
      const res = await apiClient.get<Term[]>("/academic/terms");
      setTerms(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTerms(); }, []);

  const canEdit = user?.is_superadmin || user?.role?.name === "admin";
  const canDelete = user?.is_superadmin;

  const openCreate = () => {
    setForm({ name: "", code: "", start_date: "", end_date: "", is_active: true });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (term: Term) => {
    setForm({
      name: term.name,
      code: term.code,
      start_date: term.start_date,
      end_date: term.end_date,
      is_active: term.is_active,
    });
    setEditingId(term.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        const cleaned: Record<string, unknown> = {};
        Object.entries(form).forEach(([k, v]) => { if (v !== "" && v !== null) cleaned[k] = v; });
        await apiClient.put(`/academic/terms/${editingId}`, cleaned);
      } else {
        await apiClient.post("/academic/terms", form);
      }
      setShowForm(false);
      setEditingId(null);
      fetchTerms();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/terms/${id}`);
      setDeleteConfirm(null);
      fetchTerms();
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.startDate}</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.endDate}</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="input-field" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded border-slate-300" />
            <label htmlFor="is_active" className="text-sm text-slate-700">{t.active}</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {terms.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.code}</th>
                <th>{t.startDate}</th>
                <th>{t.endDate}</th>
                <th>{t.active}</th>
                {(canEdit || canDelete) && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {terms.map((term) => (
                <tr key={term.id}>
                  <td className="font-medium text-slate-900">{term.name}</td>
                  <td><span className="badge">{term.code}</span></td>
                  <td className="text-slate-600">{term.start_date}</td>
                  <td className="text-slate-600">{term.end_date}</td>
                  <td>
                    <span className={`badge ${term.is_active ? "badge-success" : "badge-muted"}`}>
                      {term.is_active ? t.active : t.inactive}
                    </span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td>
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <button onClick={() => openEdit(term)} className="btn-icon" title={t.edit}>
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <>
                            {deleteConfirm === term.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleDelete(term.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">{t.yes}</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{t.no}</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(term.id)} className="btn-icon text-red-500" title={t.delete}>
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
