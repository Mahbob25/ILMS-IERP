"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import {
  Plus,
  Loader2,
} from "lucide-react";
import CancelSectionModal from "@/components/sections/CancelSectionModal";
import DeactivateSectionModal from "@/components/sections/DeactivateSectionModal";
import CompleteSectionModal from "@/components/sections/CompleteSectionModal";
import SectionFormModal from "@/components/sections/SectionFormModal";
import SectionsTable from "@/components/sections/SectionsTable";
import { getSectionsTranslations } from "@/lib/sections/sectionsTranslations";

interface CourseSection {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
  status: string;
  contract_status: string | null;
  contract_compensation_model: string | null;
  teacher_percentage: number | null;
  min_students_required: number | null;
  start_date: string | null;
  end_date: string | null;
  class_time: string | null;
  class_duration_minutes: number | null;
  classroom: string | null;
  price: number | null;
  flags?: Record<string, any>;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
}

interface Course {
  id: string;
  name: string;
  code: string;
}
interface Employee {
  id: string;
  full_name: string;
  employee_type: string;
}
interface Student {
  id: string;
  student_code: string;
  full_name: string;
}

export default function SectionsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const t = getSectionsTranslations(locale);

  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    course_id: "",
    teacher_id: "",
    capacity: 30,
    min_students_required: 0,
    start_date: "",
    end_date: "",
    class_time: "",
    class_duration_minutes: 0,
    classroom: "",
    price: "",
    teacher_percentage: "",
    comp_model: "",
    teacher_salary: "",
  });
  const [teacherDefaultMap, setTeacherDefaultMap] = useState<
    Record<
      string,
      { default_salary: number | null; default_percentage: number | null }
    >
  >({});
  const [deleteTarget, setDeleteTarget] = useState<CourseSection | null>(null);

  const [showRegister, setShowRegister] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState({
    student_id: "",
    admin_discount: "",
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 15;
  const [completingSection, setCompletingSection] = useState<string | null>(null);

  const fetchLookups = useCallback(async () => {
    const [coursesRes, teachersRes, studentsRes] = await Promise.all([
      apiClient
        .get<{ items: Course[]; total: number }>("/academic/courses?limit=1000")
        .catch(() => null),
      apiClient.get<any[]>("/users/teachers").catch(() => null),
      apiClient
        .get<{ items: Student[]; total: number }>(
          "/academic/students?limit=1000",
        )
        .catch(() => null),
    ]);
    if (coursesRes) setCourses(coursesRes.data.items);
    if (teachersRes) {
      setTeachers(teachersRes.data);
      const defMap: Record<
        string,
        { default_salary: number | null; default_percentage: number | null }
      > = {};
      teachersRes.data.forEach((t: any) => {
        defMap[t.id] = {
          default_salary: t.default_salary ?? null,
          default_percentage: t.default_percentage ?? null,
        };
      });
      setTeacherDefaultMap(defMap);
    }
    if (studentsRes) setStudents(studentsRes.data.items);
  }, []);

  const fetchSections = useCallback(
    async (searchTerm = "", statusVal = "", pageNum = 1) => {
      setMessage(null);
      setActionMessage(null);
      try {
        const skip = (pageNum - 1) * limit;
        let url = `/academic/course-sections?search=${encodeURIComponent(searchTerm)}&skip=${skip}&limit=${limit}&sort_by=id&sort_order=asc`;
        if (statusVal) url += `&status=${statusVal}`;
        const res = await apiClient.get<{
          items: CourseSection[];
          total: number;
        }>(url);
        const statusPriority: Record<string, number> = {
          pending: 0,
          active: 1,
          ready_for_completion: 2,
          completed: 3,
          cancelled: 4,
        };
        const sorted = [...res.data.items].sort(
          (a, b) => (statusPriority[a.status] ?? 3) - (statusPriority[b.status] ?? 3),
        );
        setSections(sorted);
        setTotalCount(res.data.total);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const [searchTimeout, setSearchTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(
      setTimeout(() => {
        setPage(1);
        fetchSections(value, statusFilter, 1);
      }, 400),
    );
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    fetchSections(search, value, 1);
  };

  useEffect(() => {
    setLoading(true);
    fetchLookups();
    fetchSections();
    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  }, []);

  const canEdit =
    user?.is_superadmin ||
    user?.role?.name === "manager" ||
    user?.role?.name === "secretary";
  const canDelete = user?.is_superadmin;
  const canActivate =
    user?.is_superadmin ||
    user?.role?.name === "manager" ||
    user?.role?.name === "secretary";
  const canRegister =
    user?.is_superadmin ||
    user?.role?.name === "manager" ||
    user?.role?.name === "secretary";

  const getCourseName = (id: string) =>
    courses.find((c) => c.id === id)?.name || id;
  const getTeacherName = (id: string) =>
    teachers.find((u) => u.id === id)?.full_name || id;

  const openCreate = () => {
    setForm({
      course_id: "",
      teacher_id: "",
      capacity: 30,
      min_students_required: 0,
      start_date: "",
      end_date: "",
      class_time: "",
      class_duration_minutes: 0,
      classroom: "",
      price: "",
      teacher_percentage: "",
      comp_model: "",
      teacher_salary: "",
    });
    setEditingId(null);
    setShowForm(true);
    setMessage(null);
  };

  const openEdit = (section: CourseSection) => {
    setMessage(null);
    const def = teacherDefaultMap[section.teacher_id];
    setForm({
      course_id: section.course_id,
      teacher_id: section.teacher_id,
      capacity: section.capacity,
      min_students_required: section.min_students_required || 0,
      start_date: section.start_date || "",
      end_date: section.end_date || "",
      class_time: section.class_time || "",
      class_duration_minutes: section.class_duration_minutes || 0,
      classroom: section.classroom || "",
      price: section.price != null ? section.price.toString() : "",
      teacher_percentage: section.teacher_percentage?.toString() || "",
      comp_model: section.contract_compensation_model || "",
      teacher_salary: def?.default_salary?.toString() || "",
    });
    setEditingId(section.id);
    setShowForm(true);
    if (section.contract_status) {
      apiClient
        .get(`/lms/sections/${section.id}/contract`)
        .then((res) => {
          if (res.data) {
            const c = res.data;
            setForm((prev) => ({
              ...prev,
              teacher_salary:
                c.fixed_amount?.toString() ||
                def?.default_salary?.toString() ||
                "",
              teacher_percentage:
                c.percentage?.toString() ||
                def?.default_percentage?.toString() ||
                "",
            }));
          }
        })
        .catch(() => {});
    }
  };

  const handleSave = async () => {
    if (!form.course_id) {
      setMessage({ type: "error", text: t.validationSelectCourse });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        course_id: form.course_id,
        teacher_id: form.teacher_id || null,
        capacity: form.capacity,
      };
      if (form.min_students_required > 0)
        payload.min_students_required = form.min_students_required;
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;
      if (form.class_time) payload.class_time = form.class_time;
      if (form.class_duration_minutes > 0)
        payload.class_duration_minutes = form.class_duration_minutes;
      if (form.classroom) payload.classroom = form.classroom;
      if (form.price) payload.price = parseFloat(form.price);
      let sectionId = editingId;
      if (editingId) {
        const cleaned: Record<string, unknown> = {};
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== "" && v !== null) cleaned[k] = v;
        });
        await apiClient.put(`/academic/course-sections/${editingId}`, cleaned);
      } else {
        const res = await apiClient.post("/academic/course-sections", payload);
        sectionId = res.data?.data?.id || res.data?.id;
      }
      if (form.teacher_id && form.comp_model && sectionId) {
        const contractAssign: Record<string, unknown> = {
          teacher_id: form.teacher_id,
          compensation_model: form.comp_model,
        };
        if (form.comp_model === "fixed" && form.teacher_salary) {
          contractAssign.fixed_amount = parseFloat(form.teacher_salary);
        } else if (
          form.comp_model === "percentage" &&
          form.teacher_percentage
        ) {
          contractAssign.percentage = parseFloat(form.teacher_percentage);
        }
        await apiClient.put(
          `/lms/sections/${sectionId}/contract/assign`,
          contractAssign,
        );
      }
      setShowForm(false);
      setEditingId(null);
      fetchSections(search, statusFilter, page);
    } catch (e: unknown) {
      const err = e as {
        response?: {
          data?: {
            detail?:
              string | Array<{ loc: string[]; msg: string; type: string }>;
          };
        };
      };
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        const msgs = detail.map((d) => d.msg).join("; ");
        setMessage({ type: "error", text: msgs || t.errorGeneric });
      } else {
        setMessage({ type: "error", text: detail || t.errorGeneric });
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/course-sections/${id}`);
      setDeleteTarget(null);
      setActionMessage({ type: "success", text: t.deleted });
      fetchSections(search, statusFilter, page);
    } catch (e: unknown) {
      setDeleteTarget(null);
      const err = e as { response?: { data?: { detail?: string } } };
      const detail = err?.response?.data?.detail;
      const known: Record<string, string> = {
        "Cannot delete section with existing enrollments or payments":
          t.paymentsExist,
      };
      setActionMessage({ type: "error", text: known[detail || ""] || detail || t.deleteFailed });
    }
  };

  const handleActivate = async (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (section) {
      const missing: string[] = [];
      if (section.price == null) missing.push(t.errMissingPrice);
      if (!section.teacher_id) missing.push(t.errMissingTeacher);
      if (!section.start_date) missing.push(t.errMissingStartDate);
      if (!section.class_time) missing.push(t.errMissingClassTime);
      if (missing.length > 0) {
        setActionMessage({
          type: "error",
          text: `${t.errActivateMissingFields} ${missing.join(", ")}`,
        });
        return;
      }
    }
    try {
      await apiClient.post(`/lms/sections/${sectionId}/contract/activate`);
      setActionMessage({ type: "success", text: t.activated });
      fetchSections(search, statusFilter, page);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionMessage({
        type: "error",
        text: translateError(err?.response?.data?.detail, t.activationFailed),
      });
    }
  };

  const translateError = (detail: string | undefined, fallback: string) => {
    if (!detail) return fallback;
    if (locale === "en") return detail;
    const patterns: [RegExp, (...m: string[]) => string][] = [
      [/^Cannot finalize grades: (\d+) of (\d+) students are missing final scores$/, (a, b) => `${t.errCannotFinalize}${a} من ${b} طالب يفتقدون للدرجات النهائية`],
      [/^Cannot settle a contract without a teacher$/, () => t.errNoTeacher],
      [/^Cannot activate a contract without a teacher$/, () => t.errNoTeacherActivate],
      [/^Cannot activate a contract without a compensation model$/, () => t.errNoCompModel],
      [/^Cannot activate a section without a price/, () => t.errMissingPrice],
      [/^Cannot activate a section without a start date/, () => t.errMissingStartDate],
      [/^Cannot activate a section without a class time/, () => t.errMissingClassTime],
      [/^Cannot activate section\. Missing required fields: (.+)$/, (fields) => `${t.errActivateMissingFields} ${fields}`],
      [/^Only ACTIVE contracts can be finalized, current: (.+)$/, (s) => `${t.errOnlyActive}، الحالة الحالية: ${s}`],
      [/^Only GRADES_SUBMITTED contracts can be settled, current: (.+)$/, (s) => `${t.errOnlyGraded}، الحالة الحالية: ${s}`],
      [/^Only ASSIGNED contracts can be activated, current: (.+)$/, (s) => `${t.errOnlyAssigned}، الحالة الحالية: ${s}`],
    ];
    for (const [regex, fn] of patterns) {
      const m = detail.match(regex);
      if (m) return fn(...m.slice(1));
    }
    return detail;
  };

  const handleRegister = async () => {
    if (!registerForm.student_id) return;
    if (!showRegister) return;
    try {
      await apiClient.post("/academic/enrollments", {
        student_id: registerForm.student_id,
        section_id: showRegister,
        admin_discount: registerForm.admin_discount
          ? parseFloat(registerForm.admin_discount)
          : null,
      });
      setRegisterForm({ student_id: "", admin_discount: "" });
      setShowRegister(null);
      setActionMessage({ type: "success", text: t.studentRegistered });
      fetchSections(search, statusFilter, page);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionMessage({
        type: "error",
        text: err?.response?.data?.detail || t.registrationFailed,
      });
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
    <div
      className="space-y-6 max-w-6xl mx-auto animate-fade-in"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton
            onRefresh={() => fetchSections(search, statusFilter, page)}
          />
          {canEdit && (
            <button
              onClick={openCreate}
              className="btn-primary flex items-center gap-2"
            >
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
          <svg
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <Select
          value={statusFilter}
          onChange={handleStatusFilterChange}
          options={[
            { value: "pending", label: t.pending },
            { value: "active", label: t.active },
            { value: "ready_for_completion", label: t.ready_for_completion },
            { value: "completed", label: t.completed },
            { value: "cancelled", label: t.cancelled },
          ]}
          placeholder={t.allStatuses}
          className="w-48"
        />
        {search && (
          <button
            onClick={() => {
              setSearch("");
              setPage(1);
              fetchSections("", statusFilter, 1);
            }}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {t.cancel}
          </button>
        )}
      </div>

      {actionMessage && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {actionMessage.text}
          <button
            onClick={() => setActionMessage(null)}
            className="ms-2 float-end"
          >
            &times;
          </button>
        </div>
      )}

      <SectionFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        sectionId={editingId}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
        t={t}
        courses={courses}
        teachers={teachers}
        teacherDefaultMap={teacherDefaultMap}
        user={user}
        message={message}
        onMessageClear={() => setMessage(null)}
        onShowMessage={(msg) => setMessage(msg)}
      />

      <SectionsTable
        sections={sections}
        totalCount={totalCount}
        page={page}
        limit={limit}
        search={search}
        statusFilter={statusFilter}
        getCourseName={getCourseName}
        getTeacherName={getTeacherName}
        canEdit={canEdit}
        canDelete={canDelete}
        canActivate={canActivate}
        canRegister={canRegister}
        user={user}
        t={t}
        isRtl={isRtl}
        locale={locale}
        completingSection={completingSection}
        onEdit={openEdit}
        onDelete={(section) => setDeleteTarget(section)}
        onActivate={handleActivate}
        onRegister={(sectionId) => {
          setShowRegister(sectionId);
          setRegisterForm({ student_id: "", admin_discount: "" });
        }}
        onPageChange={(p) => {
          setPage(p);
          fetchSections(search, statusFilter, p);
        }}
        onRefresh={() => fetchSections(search, statusFilter, page)}
        onActionMessage={setActionMessage}
      />

      <Modal
        open={showRegister !== null}
        onClose={() => setShowRegister(null)}
        title={t.registerStudent}
        size="xl"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t.selectStudent}
            </label>
            <Select
              value={registerForm.student_id}
              onChange={(value) =>
                setRegisterForm((prev) => ({ ...prev, student_id: value }))
              }
              options={students.map((s) => ({
                value: s.id,
                label: `${s.full_name} (${s.student_code})`,
              }))}
              placeholder="—"
            />
          </div>
          {user?.role?.name !== "secretary" && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Discount
              </label>
              <input
                type="number"
                value={registerForm.admin_discount}
                onChange={(e) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    admin_discount: e.target.value,
                  }))
                }
                className="input-field"
                min={0}
                max={100}
                placeholder="0"
              />
            </div>
          )}
          {(() => {
            const sec = sections.find((s) => s.id === showRegister);
            return sec?.price != null ? (
              <div className="text-sm text-slate-600">
                <span className="font-medium">Price: </span>
                {sec.price}
              </div>
            ) : null;
          })()}
          <div className="flex gap-3 pt-2">
            <button onClick={handleRegister} className="btn-primary">
              {t.register}
            </button>
            <button
              onClick={() => {
                setShowRegister(null);
              }}
              className="btn-secondary"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title={t.confirmTitle}
        message={
          deleteTarget
            ? `${t.confirmDelete} (${getCourseName(deleteTarget.course_id)})`
            : ""
        }
        confirmLabel={t.yes}
        cancelLabel={t.no}
        isRtl={isRtl}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
