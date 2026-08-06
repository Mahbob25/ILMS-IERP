"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import UnenrollModal from "@/components/students/UnenrollModal";
import { Plus, Trash2, Loader2, RefreshCw, UserX, AlertCircle } from "lucide-react";
import { sanitizeInput, escapeLikeWildcards, validateName } from "@/lib/utils/input";

interface Enrollment {
  id: string;
  student_id: string;
  section_id: string;
  enrolled_at: string;
  agreed_price: number | null;
  admin_discount: number | null;
}

interface Student { id: string; student_code: string; full_name: string; }
interface CourseSection { id: string; course_id: string; status: string; }
interface Course { id: string; name: string; code: string; }

export default function EnrollmentsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const router = useRouter();

  const t = {
    ar: {
      title: "التسجيلات",
      subtitle: "إدارة تسجيل الطلاب في الشعب",
      student: "الطالب",
      section: "الشعبة",
      enrolledAt: "تاريخ التسجيل",
      price: "السعر",
      discount: "الخصم (%)",
      actions: "الإجراءات",
      add: "تسجيل طالب",
      delete: "حذف",
      unenroll: "إلغاء تسجيل",
      unenrollConfirmTitle: "إلغاء تسجيل طالب",
      unenrollConfirmMsg: "هل أنت متأكد من إلغاء تسجيل هذا الطالب؟",
      unenrollSuccess: "تم إلغاء التسجيل بنجاح",
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
      searchStudent: "ابحث عن طالب بالاسم أو الرقم...",
      newStudent: "طالب جديد",
      orNewStudent: "+ إضافة طالب جديد",
      studentCodeLabel: "رقم الطالب",
      fullNameLabel: "الاسم الكامل",
      emailLabel: "البريد الإلكتروني",
      noResults: "لا توجد نتائج",
      createStudentTitle: "إضافة طالب جديد",
      nameInvalid: "الاسم يحتوي على أحرف غير صالحة",
    },
    en: {
      title: "Enrollments",
      subtitle: "Manage student enrollments in sections",
      student: "Student",
      section: "Section",
      enrolledAt: "Enrolled At",
      price: "Price",
      discount: "Discount (%)",
      actions: "Actions",
      add: "Enroll Student",
      delete: "Delete",
      unenroll: "Unenroll",
      unenrollConfirmTitle: "Unenroll Student",
      unenrollConfirmMsg: "Are you sure you want to unenroll this student?",
      unenrollSuccess: "Unenrolled successfully",
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
      searchStudent: "Search student by name or code...",
      newStudent: "New Student",
      orNewStudent: "+ Add new student",
      studentCodeLabel: "Student Code",
      fullNameLabel: "Full Name",
      emailLabel: "Email",
      noResults: "No results",
      createStudentTitle: "Add New Student",
      nameInvalid: "Name contains invalid characters",
    },
  }[locale === "en" ? "en" : "ar"];

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showCreateStudentModal, setShowCreateStudentModal] = useState(false);
  const [form, setForm] = useState({ student_id: "", section_id: "", admin_discount: "" });
  const [createStudentForm, setCreateStudentForm] = useState({ student_code: "", full_name: "", email: "" });
  const [nameError, setNameError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [studentSearchResults, setStudentSearchResults] = useState<Student[]>([]);
  const [unenrollTarget, setUnenrollTarget] = useState<Enrollment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
    setFetchError(null);
    try {
      const skip = (pageNum - 1) * limit;
      const safeSearch = escapeLikeWildcards(searchTerm);
      const params = `?search=${encodeURIComponent(safeSearch)}&skip=${skip}&limit=${limit}&sort_by=enrolled_at&sort_order=desc`;
      const res = await apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments${params}`);
      setEnrollments(res.data.items);
      setTotalCount(res.data.total);
    } catch (e) {
      setFetchError("Failed to load enrollments");
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
    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const canEdit = user?.role?.name === "superadmin" || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const getStudentName = (id: string) => students.find((s) => s.id === id)?.full_name || id;
  const getStudentCode = (id: string) => students.find((s) => s.id === id)?.student_code || "";
  const getSectionCourse = (sectionId: string) => {
    const sect = sections.find((s) => s.id === sectionId);
    if (!sect) return sectionId;
    const course = courses.find((c) => c.id === sect.course_id);
    return course ? `${course.name} (${course.code})` : sectionId;
  };
  const getSectionName = (sectionId: string) => {
    const sect = sections.find((s) => s.id === sectionId);
    if (!sect) return sectionId;
    const course = courses.find((c) => c.id === sect.course_id);
    return course ? course.name : sectionId;
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const openEnrollModal = () => {
    setMessage(null);
    setForm({ student_id: "", section_id: "", admin_discount: "" });
    setStudentSearch("");
    setShowStudentDropdown(false);
    setShowEnrollModal(true);
  };

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStudentSearch = (query: string) => {
    setStudentSearch(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setStudentSearchResults(students);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ items: Student[]; total: number }>(
          `/academic/students?search=${encodeURIComponent(escapeLikeWildcards(query))}&limit=20`
        );
        setStudentSearchResults(res.data.items);
      } catch {
        setStudentSearchResults([]);
      }
    }, 300);
  };

  const handleSave = async () => {
    if (!form.section_id || !form.student_id || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        student_id: sanitizeInput(form.student_id),
        section_id: sanitizeInput(form.section_id),
      };
      if (form.admin_discount) payload.admin_discount = parseFloat(form.admin_discount);
      await apiClient.post("/academic/enrollments", payload);
      setShowEnrollModal(false);
      fetchLookups();
      fetchEnrollments(search, page);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "Failed to save enrollment";
      setMessage({ type: "error", text: detail });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCreateStudent = async () => {
    if (!createStudentForm.student_code || !createStudentForm.full_name || submittingRef.current) return;
    setNameError("");
    if (!validateName(createStudentForm.full_name, locale as "ar" | "en")) {
      setNameError(t.nameInvalid);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        student_code: sanitizeInput(createStudentForm.student_code),
        full_name: sanitizeInput(createStudentForm.full_name),
      };
      if (createStudentForm.email) payload.email = sanitizeInput(createStudentForm.email);
      const res = await apiClient.post<Student>("/academic/students", payload);
      const newStud = res.data;
      setStudents(prev => [...prev, newStud]);
      setForm(prev => ({ ...prev, student_id: newStud.id }));
      setStudentSearch(`${newStud.full_name} (${newStud.student_code})`);
      setShowCreateStudentModal(false);
      setCreateStudentForm({ student_code: "", full_name: "", email: "" });
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "Failed to create student";
      setMessage({ type: "error", text: detail });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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
            <button onClick={openEnrollModal} className="btn-primary flex items-center gap-2">
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
            className="input-field ps-9"
          />
          <svg className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setPage(1); fetchEnrollments("", 1); }} className="text-xs text-slate-500 hover:text-slate-700">
            {t.cancel}
          </button>
        )}
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          <AlertCircle size={16} />
          {fetchError}
        </div>
      )}

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {/* Enrollment Modal */}
      <Modal open={showEnrollModal} onClose={() => setShowEnrollModal(false)} title={t.add} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectStudent}</label>
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => handleStudentSearch(e.target.value)}
                onFocus={() => {
                  setShowStudentDropdown(true);
                  setStudentSearchResults(students);
                }}
                onBlur={() => setTimeout(() => setShowStudentDropdown(false), 200)}
                placeholder={t.searchStudent}
                className="input-field"
              />
              {showStudentDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {studentSearchResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">{t.noResults}</div>
                  ) : (
                    studentSearchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={() => {
                          setForm({ ...form, student_id: s.id });
                          setStudentSearch(`${s.full_name} (${s.student_code})`);
                          setShowStudentDropdown(false);
                        }}
                        className="w-full text-start px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium">{s.full_name}</span>
                        <span className="text-slate-400 ms-2">{s.student_code}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowStudentDropdown(false);
                  setCreateStudentForm({ student_code: "", full_name: "", email: "" });
                  setNameError("");
                  setShowCreateStudentModal(true);
                }}
                className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                {t.orNewStudent}
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
              <Select
                value={form.section_id}
                onChange={(value) => setForm({ ...form, section_id: value })}
                options={sections.filter((s) => s.status !== "completed" && s.status !== "cancelled").map((s) => ({ value: s.id, label: getSectionCourse(s.id) }))}
                placeholder="—"
              />
            </div>
            {user?.role?.name !== "secretary" && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.discount}</label>
                <input type="number" value={form.admin_discount} onChange={(e) => setForm({ ...form, admin_discount: e.target.value })}
                  className="input-field" min={0} max={100} />
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.save}
            </button>
            <button onClick={() => setShowEnrollModal(false)} disabled={submitting} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      {/* Create Student Modal */}
      <Modal open={showCreateStudentModal} onClose={() => setShowCreateStudentModal(false)} title={t.createStudentTitle} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.studentCodeLabel}</label>
              <input type="text" value={createStudentForm.student_code} onChange={(e) => setCreateStudentForm({ ...createStudentForm, student_code: e.target.value })}
                className="input-field" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.fullNameLabel}</label>
              <input type="text" value={createStudentForm.full_name} onChange={(e) => { setNameError(""); setCreateStudentForm({ ...createStudentForm, full_name: e.target.value }); }}
                className="input-field" />
              {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.emailLabel}</label>
              <input type="email" value={createStudentForm.email} onChange={(e) => setCreateStudentForm({ ...createStudentForm, email: e.target.value })}
                className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreateStudent} disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {t.save}
            </button>
            <button onClick={() => setShowCreateStudentModal(false)} disabled={submitting} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

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
                    <button
                      onClick={() => router.push(`/${locale}/dashboard/students/${enrollment.student_id}`)}
                      className="text-blue-600 hover:underline text-start"
                    >
                      {getStudentName(enrollment.student_id)}
                    </button>
                    <span className="text-xs text-slate-400 ms-1">({getStudentCode(enrollment.student_id)})</span>
                  </td>
                  <td className="text-slate-600">
                    <button
                      onClick={() => router.push(`/${locale}/dashboard/sections/${enrollment.section_id}`)}
                      className="text-blue-600 hover:underline text-start"
                    >
                      {getSectionCourse(enrollment.section_id)}
                    </button>
                  </td>
                  <td className="text-slate-600">{enrollment.agreed_price != null ? `${enrollment.agreed_price}` : "—"}</td>
                  <td className="text-slate-600">{enrollment.admin_discount != null ? `${enrollment.admin_discount}%` : "—"}</td>
                  <td className="text-slate-500 text-xs">
                    {new Date(enrollment.enrolled_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setUnenrollTarget(enrollment)}
                          className="btn-icon text-amber-600"
                          title={t.unenroll}
                        >
                          <UserX size={14} />
                        </button>
                        {user?.role?.name === "superadmin" && (
                          <button onClick={() => setDeleteTarget(enrollment)} className="btn-icon text-red-500" title={t.delete}>
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

      <UnenrollModal
        open={unenrollTarget !== null}
        enrollmentId={unenrollTarget?.id || ""}
        studentName={unenrollTarget ? getStudentName(unenrollTarget.student_id) : ""}
        sectionName={unenrollTarget ? getSectionName(unenrollTarget.section_id) : ""}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { setUnenrollTarget(null); setMessage({ type: "success", text: t.unenrollSuccess }); fetchEnrollments(search, page); }}
        onClose={() => setUnenrollTarget(null)}
      />

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
