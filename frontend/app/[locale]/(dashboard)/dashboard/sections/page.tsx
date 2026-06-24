"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface CourseSection {
  id: string;
  course_id: string;
  term_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
}

interface Term { id: string; name: string; }
interface Course { id: string; name: string; code: string; }
interface User { id: string; full_name: string; email: string; }

export default function SectionsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الشعب الدراسية",
      subtitle: "إدارة شعب المقررات وربطها بالمدرسين",
      course: "المقرر",
      term: "الفصل",
      teacher: "المدرس",
      capacity: "السعة",
      enrolled: "المسجلون",
      actions: "الإجراءات",
      add: "إضافة شعبة",
      edit: "تعديل",
      delete: "حذف",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد شعب دراسية بعد",
      confirmDelete: "هل أنت متأكد من حذف هذه الشعبة؟",
      yes: "نعم",
      no: "لا",
    },
    en: {
      title: "Course Sections",
      subtitle: "Manage course sections and teacher assignments",
      course: "Course",
      term: "Term",
      teacher: "Teacher",
      capacity: "Capacity",
      enrolled: "Enrolled",
      actions: "Actions",
      add: "Add Section",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No course sections yet",
      confirmDelete: "Are you sure you want to delete this section?",
      yes: "Yes",
      no: "No",
    },
  }[locale === "en" ? "en" : "ar"];

  const [sections, setSections] = useState<CourseSection[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ course_id: "", term_id: "", teacher_id: "", capacity: 30 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [sectionsRes, termsRes, coursesRes, teachersRes] = await Promise.all([
        apiClient.get<CourseSection[]>("/academic/course-sections"),
        apiClient.get<Term[]>("/academic/terms"),
        apiClient.get<Course[]>("/academic/courses"),
        apiClient.get<User[]>("/users"),
      ]);
      setSections(sectionsRes.data);
      setTerms(termsRes.data);
      setCourses(coursesRes.data);
      setTeachers(teachersRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const canEdit = user?.is_superadmin || user?.role?.name === "admin";
  const canDelete = user?.is_superadmin;

  const getTermName = (id: string) => terms.find((t) => t.id === id)?.name || id;
  const getCourseName = (id: string) => courses.find((c) => c.id === id)?.name || id;
  const getTeacherName = (id: string) => teachers.find((u) => u.id === id)?.full_name || id;

  const openCreate = () => {
    setForm({ course_id: "", term_id: "", teacher_id: "", capacity: 30 });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (section: CourseSection) => {
    setForm({
      course_id: section.course_id,
      term_id: section.term_id,
      teacher_id: section.teacher_id,
      capacity: section.capacity,
    });
    setEditingId(section.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        const cleaned: Record<string, unknown> = {};
        Object.entries(form).forEach(([k, v]) => { if (v !== "" && v !== null) cleaned[k] = v; });
        await apiClient.put(`/academic/course-sections/${editingId}`, cleaned);
      } else {
        await apiClient.post("/academic/course-sections", form);
      }
      setShowForm(false);
      setEditingId(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/course-sections/${id}`);
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
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.course}</label>
              <select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                className="input-field">
                <option value="">--</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.term}</label>
              <select value={form.term_id} onChange={(e) => setForm({ ...form, term_id: e.target.value })}
                className="input-field">
                <option value="">--</option>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.teacher}</label>
              <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                className="input-field">
                <option value="">--</option>
                {teachers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.capacity}</label>
              <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
                className="input-field" min={1} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.course}</th>
                <th>{t.term}</th>
                <th>{t.teacher}</th>
                <th>{t.capacity}</th>
                <th>{t.enrolled}</th>
                {(canEdit || canDelete) && <th>{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id}>
                  <td className="font-medium text-slate-900">{getCourseName(section.course_id)}</td>
                  <td className="text-slate-600">{getTermName(section.term_id)}</td>
                  <td className="text-slate-600">{getTeacherName(section.teacher_id)}</td>
                  <td className="text-slate-600">{section.capacity}</td>
                  <td>
                    <span className={`badge ${section.enrolled_count >= section.capacity ? "badge-warning" : "badge-success"}`}>
                      {section.enrolled_count}/{section.capacity}
                    </span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td>
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <button onClick={() => openEdit(section)} className="btn-icon" title={t.edit}>
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <>
                            {deleteConfirm === section.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleDelete(section.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">{t.yes}</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{t.no}</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(section.id)} className="btn-icon text-red-500" title={t.delete}>
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
