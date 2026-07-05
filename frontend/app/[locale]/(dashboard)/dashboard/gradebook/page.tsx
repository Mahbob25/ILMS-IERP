"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import { Loader2, Plus, Pencil, Trash2, FileText } from "lucide-react";

interface CourseSection { id: string; course_id: string; teacher_id: string; }
interface Course { id: string; name: string; code: string; }
interface Student { id: string; student_code: string; full_name: string; }
interface Enrollment { id: string; student_id: string; section_id: string; }
interface Assignment { id: string; section_id: string; title: string; description: string | null; due_date: string | null; max_score: number; created_at: string; }
interface Submission { id: string; assignment_id: string; student_id: string; submitted_at: string; file_path: string | null; status: string; grade?: Grade | null; }
interface Grade { id: string; submission_id: string; score: number; feedback: string | null; graded_by: string; graded_at: string; }

export default function GradebookPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "سجل الدرجات",
      subtitle: "إدارة الواجبات وتقييم الطلاب",
      selectSection: "اختر الشعبة",
      assignments: "الواجبات",
      addAssignment: "إضافة واجب",
      editAssignment: "تعديل واجب",
      deleteAssignment: "حذف",
      titleLabel: "العنوان",
      description: "الوصف",
      maxScore: "الدرجة القصوى",
      dueDate: "تاريخ التسليم",
      save: "حفظ",
      cancel: "إلغاء",
      students: "الطلاب",
      submission: "التسليم",
      grade: "الدرجة",
      feedback: "ملاحظات",
      submitGrade: "تقييم",
      noSection: "اختر شعبة لعرض سجل الدرجات",
      noAssignments: "لا توجد واجبات لهذه الشعبة",
      noStudents: "لا يوجد طلاب مسجلين",
      loading: "جاري التحميل...",
      yes: "نعم",
      confirmTitle: "تأكيد الحذف",
      confirmDelete: "هل أنت متأكد من حذف هذا الواجب؟",
      no: "لا",
      notSubmitted: "لم يسلم",
      graded: "مقيم",
    },
    en: {
      title: "Gradebook",
      subtitle: "Manage assignments and grade students",
      selectSection: "Select Section",
      assignments: "Assignments",
      addAssignment: "Add Assignment",
      editAssignment: "Edit Assignment",
      deleteAssignment: "Delete",
      titleLabel: "Title",
      description: "Description",
      maxScore: "Max Score",
      dueDate: "Due Date",
      save: "Save",
      cancel: "Cancel",
      students: "Students",
      submission: "Submission",
      grade: "Grade",
      feedback: "Feedback",
      submitGrade: "Grade",
      noSection: "Select a section to view gradebook",
      noAssignments: "No assignments for this section",
      noStudents: "No students enrolled",
      loading: "Loading...",
      yes: "Yes",
      confirmTitle: "Confirm Deletion",
      confirmDelete: "Are you sure you want to delete this assignment?",
      no: "No",
      notSubmitted: "Not submitted",
      graded: "Graded",
    },
  }[locale === "en" ? "en" : "ar"];

  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollment] = useState<Enrollment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment form
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({ title: "", description: "", max_score: 100, due_date: "" });
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  // Grade modal
  const [gradeModal, setGradeModal] = useState<{ submissionId: string; score: number; feedback: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sectRes, courseRes] = await Promise.all([
        apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000"),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000"),
      ]);
      setSections(sectRes.data.items);
      setCourses(courseRes.data.items);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getCourseName = (id: string) => courses.find((c) => c.id === id)?.name || id;

  useEffect(() => {
    if (!selectedSectionId) return;
    (async () => {
      try {
        const [assignRes, enrRes] = await Promise.all([
          apiClient.get<Assignment[]>(`/lms/assignments?section_id=${selectedSectionId}`),
          apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments?section_id=${selectedSectionId}&limit=1000`),
        ]);
        setAssignments(assignRes.data);
        setEnrollment(enrRes.data.items);

        const studentIds = enrRes.data.items.map((e) => e.student_id);
        if (studentIds.length > 0) {
          const studRes = await apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000").catch(() => null);
          setStudents(studRes ? studRes.data.items.filter((s) => studentIds.includes(s.id)) : []);
        } else {
          setStudents([]);
        }
      } catch (e) { console.error(e); }
    })();
  }, [selectedSectionId]);

  useEffect(() => {
    if (!selectedAssignmentId) { setSubmissions([]); return; }
    (async () => {
      try {
        const res = await apiClient.get<Submission[]>(`/lms/assignments/${selectedAssignmentId}/submissions`);
        setSubmissions(res.data);
      } catch (e) { console.error(e); }
    })();
  }, [selectedAssignmentId]);

  const handleSaveAssignment = async () => {
    try {
      const payload: Record<string, unknown> = {
        section_id: selectedSectionId,
        title: assignmentForm.title,
        max_score: assignmentForm.max_score,
      };
      if (assignmentForm.description) payload.description = assignmentForm.description;
      if (assignmentForm.due_date) payload.due_date = new Date(assignmentForm.due_date).toISOString();

      if (editingAssignment) {
        await apiClient.put(`/lms/assignments/${editingAssignment}`, payload);
      } else {
        await apiClient.post("/lms/assignments", payload);
      }
      setShowAssignmentForm(false);
      setEditingAssignment(null);
      setAssignmentForm({ title: "", description: "", max_score: 100, due_date: "" });

      const res = await apiClient.get<Assignment[]>(`/lms/assignments?section_id=${selectedSectionId}`);
      setAssignments(res.data);
    } catch (e) { console.error(e); }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await apiClient.delete(`/lms/assignments/${id}`);
      setDeleteTarget(null);
      const res = await apiClient.get<Assignment[]>(`/lms/assignments?section_id=${selectedSectionId}`);
      setAssignments(res.data);
      if (selectedAssignmentId === id) setSelectedAssignmentId("");
    } catch (e) { setDeleteTarget(null); console.error(e); }
  };

  const handleGrade = async () => {
    if (!gradeModal) return;
    try {
      await apiClient.post(`/lms/submissions/${gradeModal.submissionId}/grade`, {
        score: gradeModal.score,
        feedback: gradeModal.feedback || null,
      });
      setGradeModal(null);
      const res = await apiClient.get<Submission[]>(`/lms/assignments/${selectedAssignmentId}/submissions`);
      setSubmissions(res.data);
    } catch (e) { console.error(e); }
  };

  const getSubmissionForStudent = (studentId: string) => submissions.find((s) => s.student_id === studentId);
  const getStudentName = (id: string) => students.find((s) => s.id === id)?.full_name || id;

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-slate-400" size={24} /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} />
        </div>
      </div>

      {/* Section Selector */}
      <div className="card p-5">
        <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
        <Select
          value={selectedSectionId}
          onChange={setSelectedSectionId}
          options={sections.map((sec) => ({ value: sec.id, label: getCourseName(sec.course_id) }))}
          placeholder="--"
          className="max-w-md"
        />
      </div>

      {!selectedSectionId && (
        <div className="card p-8 text-center text-sm text-slate-500">{t.noSection}</div>
      )}

      {selectedSectionId && (
        <>
          {/* Assignments List */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">{t.assignments}</h3>
              <button onClick={() => { setAssignmentForm({ title: "", description: "", max_score: 100, due_date: "" }); setEditingAssignment(null); setShowAssignmentForm(true); }}
                className="btn-primary flex items-center gap-2 text-xs">
                <Plus size={14} /><span>{t.addAssignment}</span>
              </button>
            </div>

            {showAssignmentForm && (
              <div className="mb-4 p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.titleLabel}</label>
                    <input type="text" value={assignmentForm.title} onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.maxScore}</label>
                    <input type="number" value={assignmentForm.max_score} onChange={(e) => setAssignmentForm({ ...assignmentForm, max_score: parseInt(e.target.value) || 0 })} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.dueDate}</label>
                    <input type="datetime-local" value={assignmentForm.due_date} onChange={(e) => setAssignmentForm({ ...assignmentForm, due_date: e.target.value })} className="input-field" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.description}</label>
                    <textarea value={assignmentForm.description} onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })} className="input-field" rows={2} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveAssignment} className="btn-primary">{t.save}</button>
                  <button onClick={() => setShowAssignmentForm(false)} className="btn-secondary">{t.cancel}</button>
                </div>
              </div>
            )}

            {assignments.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">{t.noAssignments}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAssignmentId(a.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      selectedAssignmentId === a.id
                        ? "bg-brand-50 border-brand-300 text-brand-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <FileText size={14} />
                    <span>{a.title}</span>
                    <span className="text-slate-400">({a.max_score})</span>
                    {user?.is_superadmin && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setAssignmentForm({ title: a.title, description: a.description || "", max_score: a.max_score, due_date: a.due_date ? new Date(a.due_date).toISOString().slice(0, 16) : "" }); setEditingAssignment(a.id); setShowAssignmentForm(true); }}
                          className="p-1 text-slate-400 hover:text-slate-600"><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                          className="p-1 text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grade Table */}
          {selectedAssignmentId && (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.students}</th>
                    <th>{t.submission}</th>
                    <th>{t.grade}</th>
                    <th>{t.feedback}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-sm text-slate-500 py-8">{t.noStudents}</td></tr>
                  )}
                  {students.map((student) => {
                    const sub = getSubmissionForStudent(student.id);
                    const hasGrade = sub?.grade;
                    return (
                      <tr key={student.id}>
                        <td className="font-medium text-slate-900">{student.full_name}</td>
                        <td>
                          {sub ? (
                            <span className="badge badge-success">{t.graded}</span>
                          ) : (
                            <span className="badge badge-muted">{t.notSubmitted}</span>
                          )}
                        </td>
                        <td className="text-slate-700 font-semibold">
                          {hasGrade ? `${sub!.grade!.score}` : "—"}
                        </td>
                        <td className="text-slate-500 text-xs max-w-[200px] truncate">
                          {hasGrade ? sub!.grade!.feedback || "—" : "—"}
                        </td>
                        <td>
                          {sub && (
                            <button onClick={() => setGradeModal({ submissionId: sub.id, score: sub.grade?.score || 0, feedback: sub.grade?.feedback || "" })}
                              className="btn-primary text-xs px-3 py-1.5">
                              {t.submitGrade}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal open={gradeModal !== null} onClose={() => setGradeModal(null)} title={t.submitGrade} size="xl">
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.grade}</label>
            <input type="number" value={gradeModal?.score ?? ""} onChange={(e) => setGradeModal(gradeModal ? { ...gradeModal, score: parseFloat(e.target.value) || 0 } : null)}
              className="input-field" step="0.5" min="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.feedback}</label>
            <textarea value={gradeModal?.feedback ?? ""} onChange={(e) => setGradeModal(gradeModal ? { ...gradeModal, feedback: e.target.value } : null)}
              className="input-field" rows={3} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleGrade} className="btn-primary">{t.save}</button>
            <button onClick={() => setGradeModal(null)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title={t.confirmTitle}
        message={deleteTarget ? `${t.confirmDelete} (${deleteTarget.title})` : ""}
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={() => deleteTarget && handleDeleteAssignment(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
