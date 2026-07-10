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
  Pencil,
  Trash2,
  Loader2,
  Play,
  CheckCircle2,
  UserPlus,
  Eye,
} from "lucide-react";

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

  const t = {
    ar: {
      title: "الشعب الدراسية",
      subtitle: "إدارة شعب المقررات وربطها بالمدرسين",
      course: "المقرر",
      teacher: "المدرس",
      capacity: "السعة",
      enrolled: "المسجلون",
      status: "الحالة",
      teacherPct: "نسبة المعلم",
      minStudents: "الحد الأدنى",
      quota: "الحصة",
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
      activate: "تفعيل",
      complete: "إكمال",
      pending: "قيد الانتظار",
      active: "نشط",
      completed: "مكتمل",
      registerStudent: "تسجيل طالب",
      selectStudent: "اختر الطالب",
      register: "تسجيل",
      refresh: "تحديث",
      search: "بحث باسم المقرر...",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      allStatuses: "جميع الحالات",
      teacherPctLabel: "نسبة المعلم (%)",
      deleted: "تم حذف الشعبة بنجاح",
      activated: "تم تفعيل الشعبة بنجاح",
      completedMsg: "تم إكمال الشعبة بنجاح",
      confirmTitle: "تأكيد الحذف",
      paymentsExist: "لا يمكن حذف الشعبة لوجود تسجيلات عليها مدفوعات",
      startDate: "تاريخ البداية",
      endDate: "تاريخ النهاية",
      classTime: "وقت المحاضرة",
      classDuration: "مدة المحاضرة (دقيقة)",
      classroom: "القاعة الدراسية",
      price: "السعر",
      schedule: "الجدول الزمني",
      validationRequired: "يرجى ملء جميع الحقول المطلوبة",
      validationSelectCourse: "يرجى اختيار المقرر",
      validationSelectTeacher: "يرجى اختيار المدرس",
      compModel: "نموذج التعويض",
      comp: "التعويض",
      fixedAmount: "المبلغ الثابت (ريال)",
      requestIncrease: "طلب زيادة",
      currentTerms: "الشروط الحالية",
      newAmount: "المبلغ الجديد",
      newPercentage: "النسبة الجديدة",
      reason: "السبب",
      reasonPlaceholder: "اشرح سبب الزيادة المطلوبة...",
      requestSubmitted: "تم تقديم طلب الزيادة",
      submit: "إرسال",
      errorGeneric: "حدث خطأ أثناء حفظ الشعبة",
      activationFailed: "فشل التفعيل",
      completionFailed: "فشل الإكمال",
      deleteFailed: "فشل الحذف",
      registrationFailed: "فشل تسجيل الطالب",
      studentRegistered: "تم تسجيل الطالب بنجاح",
      errCannotFinalize: "لا يمكن إنهاء التقييمات: ",
      errNoTeacher: "لا يمكن تسوية العقد بدون مدرس",
      errNoTeacherActivate: "لا يمكن تفعيل العقد بدون مدرس",
      errNoCompModel: "لا يمكن تفعيل العقد بدون نموذج تعويض",
      errOnlyActive: "يمكن إنهاء العقود النشطة فقط",
      errOnlyGraded: "يمكن تسوية العقود المُقيّمة فقط",
      errOnlyAssigned: "يمكن تفعيل العقود المُعيّنة فقط",
      errMissingPrice: "السعر",
      errMissingTeacher: "المدرس",
      errMissingStartDate: "تاريخ البداية",
      errMissingClassTime: "وقت المحاضرة",
      errActivateMissingFields: "يرجى ملء جميع الحقول المطلوبة قبل التفعيل:",
    },
    en: {
      title: "Course Sections",
      subtitle: "Manage course sections and teacher assignments",
      course: "Course",
      teacher: "Teacher",
      capacity: "Capacity",
      enrolled: "Enrolled",
      status: "Status",
      teacherPct: "Teacher %",
      minStudents: "Min Students",
      quota: "Quota",
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
      activate: "Activate",
      complete: "Complete",
      pending: "Pending",
      active: "Active",
      completed: "Completed",
      registerStudent: "Register Student",
      selectStudent: "Select Student",
      register: "Register",
      refresh: "Refresh",
      search: "Search by course name...",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      allStatuses: "All statuses",
      teacherPctLabel: "Teacher Percentage (%)",
      confirmTitle: "Confirm Deletion",
      deleted: "Section deleted successfully",
      activated: "Section activated successfully",
      completedMsg: "Section completed successfully",
      paymentsExist:
        "Cannot delete section with existing enrollments or payments",
      startDate: "Start Date",
      endDate: "End Date",
      classTime: "Class Time",
      classDuration: "Duration (min)",
      classroom: "Classroom",
      price: "Price",
      schedule: "Schedule",
      validationRequired: "Please fill in all required fields",
      validationSelectCourse: "Please select a course",
      validationSelectTeacher: "Please select a teacher",
      compModel: "Compensation Model",
      comp: "Comp",
      fixedAmount: "Fixed Amount (SAR)",
      requestIncrease: "Request Increase",
      currentTerms: "Current Terms",
      newAmount: "New Amount",
      newPercentage: "New Percentage",
      reason: "Reason",
      reasonPlaceholder: "Explain why the increase is needed...",
      requestSubmitted: "Increase request submitted",
      submit: "Submit",
      errorGeneric: "An error occurred while saving the section",
      activationFailed: "Activation failed",
      completionFailed: "Completion failed",
      deleteFailed: "Delete failed",
      registrationFailed: "Registration failed",
      studentRegistered: "Student registered",
      errCannotFinalize: "Cannot finalize grades: ",
      errNoTeacher: "Cannot settle a contract without a teacher",
      errNoTeacherActivate: "Cannot activate a contract without a teacher",
      errNoCompModel: "Cannot activate a contract without a compensation model",
      errOnlyActive: "Only ACTIVE contracts can be finalized",
      errOnlyGraded: "Only GRADES_SUBMITTED contracts can be settled",
      errOnlyAssigned: "Only ASSIGNED contracts can be activated",
      errMissingPrice: "Price",
      errMissingTeacher: "Teacher",
      errMissingStartDate: "Start Date",
      errMissingClassTime: "Class Time",
      errActivateMissingFields: "Please fill in all required fields before activating:",
    },
  }[locale === "en" ? "en" : "ar"];

  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  const [increaseReason, setIncreaseReason] = useState("");
  const [increaseAmount, setIncreaseAmount] = useState("");
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
          completed: 2,
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
  const canDelete =
    user?.is_superadmin ||
    user?.role?.name === "manager" ||
    user?.role?.name === "secretary";
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

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-50 text-amber-600 border-amber-200",
      active: "bg-emerald-50 text-emerald-600 border-emerald-200",
      completed: "bg-slate-100 text-slate-500 border-slate-200",
    };
    const labels: Record<string, string> = {
      pending: t.pending,
      active: t.active,
      completed: t.completed,
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.pending}`}
      >
        {labels[status] || status}
      </span>
    );
  };

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

  const handleComplete = async (sectionId: string) => {
    try {
      await apiClient.post(`/lms/sections/${sectionId}/contract/complete`);
      setActionMessage({ type: "success", text: t.completedMsg });
      fetchSections(search, statusFilter, page);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setActionMessage({
        type: "error",
        text: translateError(err?.response?.data?.detail, t.completionFailed),
      });
    }
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
            { value: "completed", label: t.completed },
          ]}
          placeholder={t.allStatuses}
          className="w-44"
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

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? t.edit : t.add}
        size="xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.course}
              </label>
              <Select
                value={form.course_id}
                onChange={(value) => setForm({ ...form, course_id: value })}
                options={courses.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.code})`,
                }))}
                placeholder="--"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.teacher}
              </label>
              <Select
                value={form.teacher_id}
                onChange={(value) => {
                  const def = teacherDefaultMap[value];
                  const defaultPct = def?.default_percentage?.toString() || "";
                  const defaultSal = def?.default_salary?.toString() || "";
                  setForm({
                    ...form,
                    teacher_id: value,
                    teacher_percentage: defaultPct,
                    teacher_salary: defaultSal,
                  });
                }}
                options={teachers.map((u) => ({
                  value: u.id,
                  label: u.full_name,
                }))}
                placeholder="--"
              />
            </div>
            {form.teacher_id && (
              <div className="col-span-2 bg-blue-50 p-3 rounded border border-blue-200">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t.compModel || "Compensation"}
                    </label>
                    <Select
                      value={form.comp_model}
                      onChange={(value) =>
                        setForm({ ...form, comp_model: value })
                      }
                      options={[
                        { value: "fixed", label: "Fixed Amount" },
                        { value: "percentage", label: "Percentage" },
                      ]}
                      placeholder="--"
                    />
                  </div>
                  {form.comp_model === "fixed" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {t.fixedAmount || "Fixed Amount (SAR)"}
                      </label>
                      <input
                        type="number"
                        value={form.teacher_salary}
                        onChange={(e) =>
                          setForm({ ...form, teacher_salary: e.target.value })
                        }
                        className="input-field"
                        min={0}
                        readOnly={user?.role?.name === "secretary"}
                      />
                    </div>
                  )}
                  {form.comp_model === "percentage" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {t.teacherPctLabel}
                      </label>
                      <input
                        type="number"
                        value={form.teacher_percentage}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            teacher_percentage: e.target.value,
                          })
                        }
                        className="input-field"
                        min={0}
                        max={100}
                        readOnly={user?.role?.name === "secretary"}
                      />
                    </div>
                  )}
                  {editingId && (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => setShowIncreaseModal(true)}
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100"
                      >
                        {t.requestIncrease || "Request Increase"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.capacity}
              </label>
              <input
                type="number"
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: parseInt(e.target.value) || 0 })
                }
                className="input-field"
                min={1}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.minStudents}
              </label>
              <input
                type="number"
                value={form.min_students_required}
                onChange={(e) =>
                  setForm({
                    ...form,
                    min_students_required: parseInt(e.target.value) || 0,
                  })
                }
                className="input-field"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.startDate}
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.endDate}
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.classTime}
              </label>
              <input
                type="time"
                value={form.class_time}
                onChange={(e) =>
                  setForm({ ...form, class_time: e.target.value })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.classDuration}
              </label>
              <input
                type="number"
                value={form.class_duration_minutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    class_duration_minutes: parseInt(e.target.value) || 0,
                  })
                }
                className="input-field"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.classroom}
              </label>
              <input
                type="text"
                value={form.classroom}
                onChange={(e) =>
                  setForm({ ...form, classroom: e.target.value })
                }
                className="input-field"
                placeholder="A101"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.price}
              </label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="input-field"
                min={0}
                placeholder="0"
              />
            </div>
          </div>
          {message && (
            <div
              className={`px-4 py-3 rounded-lg text-sm font-medium ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {message.text}
              <button
                onClick={() => setMessage(null)}
                className="ms-2 float-end"
              >
                &times;
              </button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">
              {t.save}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-secondary"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </Modal>

      {sections.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {t.empty}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.course}</th>
                {user?.role?.name !== "teacher" && <th>{t.teacher}</th>}
                <th>{t.status}</th>
                <th>{t.quota}</th>
                <th>{t.comp || "Comp"}</th>
                <th>{t.price}</th>
                <th>{t.schedule}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const enrolled = section.enrolled_count;
                const minReq = section.min_students_required || 1;
                const quotaMet = enrolled >= minReq;
                return (
                  <tr key={section.id}>
                    <td className="font-medium text-slate-900">
                      {getCourseName(section.course_id)}
                    </td>
                    {user?.role?.name !== "teacher" && (
                      <td className="text-slate-600">
                        {getTeacherName(section.teacher_id)}
                      </td>
                    )}
                    <td>{statusBadge(section.status)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 w-24">
                          <div
                            className={`h-2 rounded-full transition-all ${quotaMet ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{
                              width: `${Math.min(100, (enrolled / minReq) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {enrolled}/{minReq}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-600">
                      {section.teacher_id ? "Assigned" : "—"}
                    </td>
                    <td className="text-slate-600">
                      {section.price != null ? `${section.price}` : "—"}
                    </td>
                    <td className="text-xs text-slate-500">
                      {section.start_date ||
                      section.class_time ||
                      section.classroom ? (
                        <span className="space-y-0.5 block">
                          {section.start_date && (
                            <span className="block">
                              {section.start_date}
                              {section.end_date ? ` → ${section.end_date}` : ""}
                            </span>
                          )}
                          {section.class_time && (
                            <span className="block">
                              {section.class_time}
                              {section.class_duration_minutes
                                ? ` (${section.class_duration_minutes}min)`
                                : ""}
                            </span>
                          )}
                          {section.classroom && (
                            <span className="block">{section.classroom}</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            router.push(
                              `/${locale}/dashboard/sections/${section.id}`,
                            )
                          }
                          className="btn-icon"
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        {canEdit && section.status !== "completed" && (
                          <button
                            onClick={() => openEdit(section)}
                            className="btn-icon"
                            title={t.edit}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(section)}
                            className="btn-icon text-red-500"
                            title={t.delete}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {canActivate &&
                          section.status === "pending" &&
                          section.contract_status === "assigned" && (
                            <button
                              onClick={() => handleActivate(section.id)}
                              disabled={!quotaMet || section.price == null || !section.teacher_id || !section.start_date || !section.class_time}
                              className={`btn-icon ${quotaMet && section.price != null && section.teacher_id && section.start_date && section.class_time ? "text-emerald-600" : "text-slate-300"}`}
                              title={
                                !quotaMet
                                  ? `${t.activate} (${t.quota}: ${section.enrolled_count}/${section.min_students_required || 1})`
                                  : section.price == null
                                    ? `${t.activate} (${t.errMissingPrice})`
                                    : !section.teacher_id
                                      ? `${t.activate} (${t.errMissingTeacher})`
                                      : !section.start_date
                                        ? `${t.activate} (${t.errMissingStartDate})`
                                        : !section.class_time
                                          ? `${t.activate} (${t.errMissingClassTime})`
                                          : t.activate
                              }
                            >
                              <Play size={14} />
                            </button>
                          )}
                        {canActivate && section.status === "active" && (
                          <button
                            onClick={() => handleComplete(section.id)}
                            className="btn-icon text-blue-600"
                            title={t.complete}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        {canRegister && section.status === "pending" && (
                          <button
                            onClick={() => {
                              setShowRegister(section.id);
                              setRegisterForm({
                                student_id: "",
                                admin_discount: "",
                              });
                            }}
                            className="btn-icon text-indigo-600"
                            title={t.registerStudent}
                          >
                            <UserPlus size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>
              {t.showing} {Math.min((page - 1) * limit + 1, totalCount)}–
              {Math.min(page * limit, totalCount)} {t.of} {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => {
                  const p = page - 1;
                  setPage(p);
                  fetchSections(search, statusFilter, p);
                }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.prev}
              </button>
              <button
                disabled={page >= Math.ceil(totalCount / limit)}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  fetchSections(search, statusFilter, p);
                }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.next}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <Modal
        open={showIncreaseModal}
        onClose={() => setShowIncreaseModal(false)}
        title={t.requestIncrease || "Request Compensation Increase"}
        size="md"
      >
        <div className="space-y-6">
          {form.teacher_id && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.currentTerms || "Current Terms"}
                </label>
                <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                  {form.comp_model === "fixed"
                    ? `Fixed: SAR ${form.teacher_salary || "—"}`
                    : form.comp_model === "percentage"
                      ? `Percentage: ${form.teacher_percentage || "—"}%`
                      : "Not set"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {form.comp_model === "percentage"
                    ? t.newPercentage || "New Percentage"
                    : t.newAmount || "New Amount"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={increaseAmount}
                  onChange={(e) => setIncreaseAmount(e.target.value)}
                  className="input-field"
                  min={0}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.reason || "Reason"} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={increaseReason}
                  onChange={(e) => setIncreaseReason(e.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder={
                    t.reasonPlaceholder ||
                    "Explain why the increase is needed..."
                  }
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={async () => {
                    if (!increaseAmount || !increaseReason || !editingId)
                      return;
                    try {
                      await apiClient.post(
                        `/lms/sections/${editingId}/contract/amend`,
                        {
                          requested_amount: parseFloat(increaseAmount),
                          reason: increaseReason,
                        },
                      );
                      setShowIncreaseModal(false);
                      setIncreaseAmount("");
                      setIncreaseReason("");
                      setMessage({
                        type: "success",
                        text:
                          t.requestSubmitted || "Increase request submitted",
                      });
                    } catch (e) {
                      const err = e as {
                        response?: { data?: { detail?: string } };
                      };
                      setMessage({
                        type: "error",
                        text:
                          err?.response?.data?.detail ||
                          "Failed to submit increase request",
                      });
                    }
                  }}
                  className="btn-primary"
                >
                  {t.submit || "Submit"}
                </button>
                <button
                  onClick={() => setShowIncreaseModal(false)}
                  className="btn-secondary"
                >
                  {t.cancel}
                </button>
              </div>
            </>
          )}
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
