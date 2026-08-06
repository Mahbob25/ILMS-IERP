"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import { sanitizeInput, escapeLikeWildcards } from "@/lib/utils/input";
import {
  Loader2,
  ArrowLeft,
  Users,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Ban,
  UserX,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import SectionWarningBanner from "@/components/sections/SectionWarningBanner";
import SectionStatusBadge from "@/components/sections/SectionStatusBadge";
import FinancialSummary from "@/components/sections/FinancialSummary";
import CancelSectionModal from "@/components/sections/CancelSectionModal";
import DeactivateSectionModal from "@/components/sections/DeactivateSectionModal";
import CompleteSectionModal from "@/components/sections/CompleteSectionModal";
import ContractStatusBadge from "@/components/sections/ContractStatusBadge";
import UnenrollModal from "@/components/students/UnenrollModal";
import { useSectionActivation } from "@/components/sections/useSectionActivation";

interface SectionEnrollmentDetail {
  id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  student_email: string | null;
  section_id: string;
  enrolled_at: string;
  agreed_price: number | null;
  admin_discount: number | null;
  total_paid: number;
  balance_remaining: number | null;
  final_score: number | null;
  grade_label: string | null;
}

interface SectionInfo {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
  status: string;
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

interface ContractInfo {
  id: string;
  section_id: string;
  teacher_id: string;
  status: string;
  fixed_amount: number | null;
  percentage: number | null;
  total_earned: number;
  total_paid: number;
  created_at: string;
}

interface Course {
  id: string;
  name: string;
  code: string;
}
interface Employee {
  id: string;
  full_name: string;
}

export default function SectionStudentsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const sectionId = params?.id as string;

  const t = {
    ar: {
      title: "طلاب الشعبة",
      back: "عودة",
      course: "المقرر",
      teacher: "المدرس",
      status: "الحالة",
      capacity: "السعة",
      enrolled: "المسجلون",
      price: "السعر",
      schedule: "الجدول",
      studentName: "اسم الطالب",
      studentCode: "الرمز",
      email: "البريد الإلكتروني",
      enrollDate: "تاريخ التسجيل",
      agreedPrice: "السعر المتفق عليه",
      discount: "الخصم",
      totalPaid: "المدفوع",
      balance: "المتبقي",
      finalScore: "الدرجة النهائية",
      grade: "التقدير",
      loading: "جاري التحميل...",
      empty: "لا يوجد طلاب مسجلون في هذه الشعبة",
      sar: "ريال",
      gradesRequired: "يجب إكمال جميع الدرجات النهائية قبل إتمام الشعبة",
      pending: "قيد الانتظار",
      active: "نشط",
      completed: "مكتمل",
      notFound: "الشعبة غير موجودة",
      financialSummary: "الملخص المالي",
      sectionFullAmount: "إجمالي المبلغ المستحق",
      totalPaidSummary: "إجمالي المدفوع",
      remaining: "المتبقي",
      of: "من",
      activationFailed: "فشل التفعيل",
      completionFailed: "فشل الإكمال",
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
      ready_for_completion: "جاهز للإكمال",
      cancelled: "ملغى",
      activate: "تفعيل",
      activating: "جاري التفعيل...",
      activated: "تم التفعيل بنجاح",
      contractAssigned: "معيّن",
      contractActive: "نشط",
      contractGraded: "تم التقييم",
      contractSettled: "تم التسوية",
      contractCancelled: "ملغى",
      cancelSection: "إلغاء الشعبة",
      deactivateSection: "إلغاء التنشيط",
      completeSection: "إكمال الشعبة",
      overdueBanner: "مضت أيام على تاريخ النهاية",
      approachingBanner: "يقترب موعد النهاية",
      readyBanner: "جاهز للإكمال",
      daysPast: "أيام مضت",
      ungradedStudents: "طلاب بدون درجات",
      unpaidStudents: "طلاب عليهم مدفوعات",
      cancelSuccess: "تم إلغاء الشعبة بنجاح",
      deactivateSuccess: "تم إلغاء التنشيط بنجاح",
      completeSuccess: "تم إكمال الشعبة بنجاح",
      missingGradesCount: (n: number, t: number) => `${n} من ${t} طالب مكتمل`,
      outstandingPayments: (n: number, a: number) =>
        `${n} طالب عليهم ${a.toFixed(2)}`,
      unenroll: "إلغاء تسجيل",
      unenrollHistory: "سجل إلغاء التسجيل",
      unenrollSuccess: "تم إلغاء التسجيل بنجاح",
      showHistory: "عرض السجل",
      hideHistory: "إخفاء السجل",
      noUnenrollHistory: "لا توجد سجلات إلغاء تسجيل",
      unenrolledAt: "تاريخ الإلغاء",
      unenrolledBy: "تم بواسطة",
      reason: "السبب",
      refundPolicy: "سياسة الاسترداد",
      refundAmountLabel: "قيمة الاسترداد",
      refundAuthorizeRefund: "استرداد كامل",
      refundNoRefund: "بدون استرداد",
    },
    en: {
      title: "Section Students",
      back: "Back",
      course: "Course",
      teacher: "Teacher",
      status: "Status",
      capacity: "Capacity",
      enrolled: "Enrolled",
      price: "Price",
      schedule: "Schedule",
      studentName: "Student Name",
      studentCode: "Code",
      email: "Email",
      enrollDate: "Enroll Date",
      agreedPrice: "Agreed Price",
      discount: "Discount",
      totalPaid: "Total Paid",
      balance: "Balance",
      finalScore: "Final Score",
      grade: "Grade",
      loading: "Loading...",
      empty: "No students enrolled in this section",
      sar: "YER",
      gradesRequired:
        "Please fill final scores for all students before completing",
      pending: "Pending",
      active: "Active",
      completed: "Completed",
      notFound: "Section not found",
      financialSummary: "Financial Summary",
      sectionFullAmount: "Total Amount Due",
      totalPaidSummary: "Total Paid",
      remaining: "Remaining",
      of: "of",
      activationFailed: "Activation failed",
      completionFailed: "Completion failed",
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
      errActivateMissingFields:
        "Please fill in all required fields before activating:",
      ready_for_completion: "Ready for Completion",
      cancelled: "Cancelled",
      activate: "Activate",
      activating: "Activating...",
      activated: "Activated successfully",
      contractAssigned: "Assigned",
      contractActive: "Active",
      contractGraded: "Graded",
      contractSettled: "Settled",
      contractCancelled: "Cancelled",
      cancelSection: "Cancel Section",
      deactivateSection: "Deactivate",
      completeSection: "Complete Section",
      overdueBanner: "days past end date",
      approachingBanner: "Approaching end date",
      readyBanner: "Ready for Completion",
      daysPast: "days past",
      ungradedStudents: "Ungraded Students",
      unpaidStudents: "Unpaid Students",
      cancelSuccess: "Section cancelled successfully",
      deactivateSuccess: "Section deactivated successfully",
      completeSuccess: "Section completed successfully",
      missingGradesCount: (n: number, t: number) => `${n}/${t} students graded`,
      outstandingPayments: (n: number, a: number) =>
        `${n} students owe ${a.toFixed(2)}`,
      unenroll: "Unenroll",
      unenrollHistory: "Unenrollment History",
      unenrollSuccess: "Unenrolled successfully",
      showHistory: "Show History",
      hideHistory: "Hide History",
      noUnenrollHistory: "No unenrollment records",
      unenrolledAt: "Unenrolled At",
      unenrolledBy: "By",
      reason: "Reason",
      refundPolicy: "Refund Policy",
      refundAmountLabel: "Refund Amount",
      refundAuthorizeRefund: "Full Refund",
      refundNoRefund: "No Refund",
    },
  }[locale === "en" ? "en" : "ar"];

  const [section, setSection] = useState<SectionInfo | null>(null);
  const [students, setStudents] = useState<SectionEnrollmentDetail[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showCompleteOverride, setShowCompleteOverride] = useState(false);
  const [overrideData, setOverrideData] = useState<{
    ungraded: any[];
    unpaid: any[];
  }>({ ungraded: [], unpaid: [] });
  const [unenrollTarget, setUnenrollTarget] = useState<SectionEnrollmentDetail | null>(null);
  const [unenrollHistory, setUnenrollHistory] = useState<any[]>([]);
  const [showUnenrollHistory, setShowUnenrollHistory] = useState(false);
  const [loadingUnenrollHistory, setLoadingUnenrollHistory] = useState(false);

  const { activate, activating, error: activationError, setError: setActivationError } = useSectionActivation({
    sectionId,
    locale,
    t,
    onSuccess: (updatedSection, updatedContract) => {
      setSection(updatedSection);
      if (updatedContract) setContract(updatedContract);
    },
  });

  const canActivate =
    user?.is_superadmin ||
    user?.role?.name === "manager" ||
    user?.role?.name === "secretary";

  const fetchData = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const [sectRes, enrollRes, courseRes, teachersRes, contractRes] =
        await Promise.all([
          apiClient
            .get<{ items: SectionInfo[]; total: number }>(
              `/academic/course-sections?limit=1000`,
            )
            .catch(() => null),
          apiClient
            .get<SectionEnrollmentDetail[]>(
              `/academic/sections/${sectionId}/enrollments/detailed`,
            )
            .catch(() => null),
          apiClient
            .get<{ items: Course[]; total: number }>(
              "/academic/courses?limit=1000",
            )
            .catch(() => null),
          apiClient.get<any[]>("/users/teachers").catch(() => null),
          apiClient
            .get<ContractInfo>(`/lms/sections/${sectionId}/contract`)
            .catch(() => null),
        ]);

      if (courseRes) setCourses(courseRes.data.items);
      if (teachersRes) setTeachers(teachersRes.data);
      if (enrollRes) setStudents(enrollRes.data);
      if (contractRes) setContract(contractRes.data);

      if (sectRes) {
        const found = sectRes.data.items.find((s) => s.id === sectionId);
        if (found) {
          setSection(found);
        } else {
          setNotFound(true);
        }
      } else {
        setNotFound(true);
      }
    } catch (e) {
      setFetchError(t.loading || "Failed to load section data");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  const handleCompleteClick = async () => {
    if (submitting) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await apiClient.post(`/academic/course-sections/${sectionId}/complete`, {});
      setSuccessMsg(t.completeSuccess);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: any } } };
      const detailRaw = err?.response?.data?.detail;
      const detail = typeof detailRaw === "string" ? detailRaw : detailRaw?.message || "";
      if (typeof detail === "string" && (detail.includes("missing") || detail.includes("grades") || detail.includes("payment") || detail.includes("unpaid") || detail.includes("ungraded"))) {
        setOverrideData({
          ungraded: (detailRaw?.ungraded_students || []).map((name: string) => ({ student_name: name })),
          unpaid: (detailRaw?.unpaid_students || []).map((s: any) => ({ student_name: s.student_name, amount: s.balance })),
        });
        setShowCompleteOverride(true);
      } else {
        setError(detail || t.completionFailed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const loadUnenrollHistory = async () => {
    setLoadingUnenrollHistory(true);
    try {
      const res = await apiClient.get<{ items: any[]; total: number }>(
        `/academic/sections/${sectionId}/unenrollment-history?per_page=50`
      );
      setUnenrollHistory(res.data.items);
    } catch { /* */ }
    finally { setLoadingUnenrollHistory(false); }
  };

  const canUnenroll = section && (section.status === "active" || section.status === "pending");

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(
        locale === "ar" ? "ar-SA" : "en-US",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
        },
      );
    } catch {
      return d;
    }
  };

  const allGradesFilled = useMemo(() => {
    return students.length > 0 && students.every((s) => s.final_score != null);
  }, [students]);

  const getCourseName = (courseId: string) =>
    courses.find((c) => c.id === courseId)?.name || courseId;
  const getTeacherName = (teacherId: string) =>
    teachers.find((u) => u.id === teacherId)?.full_name || teacherId;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>{t.notFound}</p>
        <button onClick={() => router.back()} className="btn-primary mt-4">
          {t.back}
        </button>
      </div>
    );
  }

  return (
    <div
      className="space-y-6 max-w-6xl mx-auto animate-fade-in"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="btn-icon"
            title={t.back}
          >
            <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
            {section && (
              <p className="text-sm text-slate-500 mt-1">
                {getCourseName(section.course_id)} &middot; {t.teacher}:{" "}
                {getTeacherName(section.teacher_id)}
              </p>
            )}
          </div>
        </div>
        <RefreshButton onRefresh={fetchData} />
      </div>

      {section && (
        <div className="card p-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t.course}:</span>
            <span className="font-semibold text-slate-900">
              {getCourseName(section.course_id)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t.teacher}:</span>
            <span className="font-semibold text-slate-900">
              {getTeacherName(section.teacher_id)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SectionStatusBadge
              status={section.status}
              labels={{ pending: t.pending, active: t.active, completed: t.completed, ready_for_completion: t.ready_for_completion, cancelled: t.cancelled }}
              isRtl={isRtl}
            />
            {contract && (
              <ContractStatusBadge
                status={contract.status}
                isRtl={isRtl}
                labels={{
                  assigned: t.contractAssigned,
                  active: t.contractActive,
                  grades_submitted: t.contractGraded,
                  settled: t.contractSettled,
                  cancelled: t.contractCancelled,
                }}
              />
            )}
          </div>
          {(section.status === "pending" ||
            section.status === "active" ||
            section.status === "ready_for_completion") &&
            canActivate && (
              <div className="flex items-center gap-2">
                {section.status === "pending" &&
                  contract?.status === "assigned" && (
                    <button
                      onClick={() => activate(section)}
                      disabled={activating || section.price == null || !section.teacher_id || !section.start_date || !section.class_time}
                      className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
                      title={
                        section.price == null ? `${t.errMissingPrice}`
                        : !section.teacher_id ? `${t.errMissingTeacher}`
                        : !section.start_date ? `${t.errMissingStartDate}`
                        : !section.class_time ? `${t.errMissingClassTime}`
                        : undefined
                      }
                    >
                      <Play size={12} />
                      {activating ? t.activating : t.activate}
                    </button>
                  )}
                {(section.status === "active" ||
                  section.status === "ready_for_completion") && (
                  <button
                    onClick={handleCompleteClick}
                    disabled={submitting}
                    className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={12} />
                    {submitting ? "..." : t.completeSection || "Complete"}
                  </button>
                )}
                {(user?.is_superadmin || user?.role?.name === "manager") &&
                  (section.status === "pending" || section.status === "active") && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="px-3 py-1.5 text-xs flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-medium"
                    >
                      <XCircle size={12} /> {t.cancelSection}
                    </button>
                  )}
                {user?.is_superadmin && section.status === "active" && (
                  <button
                    onClick={() => setShowDeactivateModal(true)}
                    className="px-3 py-1.5 text-xs flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium"
                  >
                    <Ban size={12} /> {t.deactivateSection}
                  </button>
                )}
              </div>
            )}
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t.capacity}:</span>
            <span className="font-semibold text-slate-900">
              {section.enrolled_count}/{section.capacity}
            </span>
          </div>
          {section.price != null && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t.price}:</span>
              <span className="font-semibold text-slate-900">
                {section.price} {t.sar}
              </span>
            </div>
          )}
          {(section.start_date || section.class_time || section.classroom) && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t.schedule}:</span>
              <span className="font-semibold text-slate-900 text-xs">
                {section.start_date && (
                  <span>
                    {section.start_date}
                    {section.end_date ? ` → ${section.end_date}` : ""}
                  </span>
                )}
                {section.class_time && (
                  <span className="ms-1">{section.class_time}</span>
                )}
                {section.classroom && (
                  <span className="ms-1">({section.classroom})</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {section &&
        section.end_date &&
        (() => {
          const endDate = new Date(section.end_date + "T00:00:00");
          const now = new Date();
          const diffDays = Math.floor(
            (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (section.status === "cancelled" || section.status === "completed") return null;
          if (diffDays > 0) {
            return (
              <SectionWarningBanner
                type="overdue"
                daysPastEnd={diffDays}
                endDate={section.end_date}
                missingGradeCount={students.filter((s) => s.final_score == null).length}
                totalStudentCount={students.length}
                outstandingPaymentCount={students.filter((s) => (s.balance_remaining || 0) > 0).length}
                outstandingPaymentTotal={students.reduce((sum, s) => sum + (s.balance_remaining || 0), 0)}
                isRtl={isRtl}
                locale={locale}
              />
            );
          }
          if (diffDays >= -7) {
            return (
              <SectionWarningBanner
                type="approaching"
                endDate={section.end_date}
                missingGradeCount={students.filter((s) => s.final_score == null).length}
                totalStudentCount={students.length}
                outstandingPaymentCount={students.filter((s) => (s.balance_remaining || 0) > 0).length}
                outstandingPaymentTotal={students.reduce((sum, s) => sum + (s.balance_remaining || 0), 0)}
                isRtl={isRtl}
                locale={locale}
              />
            );
          }
          return null;
        })()}

      {section?.status === "ready_for_completion" && (
        <SectionWarningBanner
          type="ready"
          missingGradeCount={students.filter((s) => s.final_score != null).length}
          totalStudentCount={students.length}
          isRtl={isRtl}
          locale={locale}
        />
      )}

      {fetchError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md text-sm bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
          <button
            onClick={() => setFetchError(null)}
            className="ms-auto font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold ms-2"
          >
            &times;
          </button>
        </div>
      )}

      {(error || activationError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <span>{error || activationError}</span>
          <button
            onClick={() => { setError(null); setActivationError(null); }}
            className="text-red-500 hover:text-red-700 font-bold ms-2"
          >
            &times;
          </button>
        </div>
      )}

      {students.length > 0 && (
        <FinancialSummary
          students={students}
          sectionPrice={section?.price ?? null}
          t={t}
          isRtl={isRtl}
        />
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users size={16} className="text-slate-400" />
          {t.enrolled} ({students.length})
        </div>
        {students.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.studentName}</th>
                  <th>{t.studentCode}</th>
                  <th className="hidden md:table-cell">{t.email}</th>
                  <th>{t.enrollDate}</th>
                  <th>{t.agreedPrice}</th>
                  <th className="hidden md:table-cell">{t.discount}</th>
                  <th>{t.totalPaid}</th>
                  <th>{t.balance}</th>
                  <th className="hidden md:table-cell">{t.finalScore}</th>
                  <th className="hidden md:table-cell">{t.grade}</th>
                  {canUnenroll && canActivate && <th>{isRtl ? "إجراء" : "Actions"}</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((enr) => (
                  <tr key={enr.id}>
                    <td className="font-medium text-slate-900">
                      <button
                        onClick={() =>
                          router.push(
                            `/${locale}/dashboard/students/${enr.student_id}`,
                          )
                        }
                        className="text-blue-600 hover:underline text-start"
                      >
                        {enr.student_name}
                      </button>
                    </td>
                    <td className="text-slate-600">{enr.student_code}</td>
                    <td className="hidden md:table-cell text-slate-500 text-xs">
                      {enr.student_email || "—"}
                    </td>
                    <td className="text-slate-600 text-xs">
                      {formatDate(enr.enrolled_at)}
                    </td>
                    <td className="text-slate-600">
                      {enr.agreed_price != null
                        ? `${enr.agreed_price.toFixed(2)} ${t.sar}`
                        : "—"}
                    </td>
                    <td className="hidden md:table-cell text-slate-600">
                      {enr.admin_discount != null
                        ? `${enr.admin_discount}%`
                        : "—"}
                    </td>
                    <td className="font-semibold text-emerald-600">
                      {enr.total_paid > 0
                        ? `${enr.total_paid.toFixed(2)} ${t.sar}`
                        : "—"}
                    </td>
                    <td>
                      {enr.balance_remaining != null ? (
                        <span
                          className={`font-semibold ${enr.balance_remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}
                        >
                          {enr.balance_remaining > 0
                            ? `${enr.balance_remaining.toFixed(2)} ${t.sar}`
                            : "0"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="hidden md:table-cell text-slate-700 font-semibold">
                      {enr.final_score != null ? `${enr.final_score}%` : "—"}
                    </td>
                    <td className="hidden md:table-cell">
                      {enr.grade_label ? (
                        <span className="badge badge-success">{enr.grade_label}</span>
                      ) : "—"}
                    </td>
                    {canUnenroll && canActivate && (
                      <td>
                        <button
                          onClick={() => setUnenrollTarget(enr)}
                          className="btn-icon text-amber-600"
                          title={t.unenroll}
                        >
                          <UserX size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CancelSectionModal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        sectionId={sectionId}
        sectionName={section ? getCourseName(section.course_id) : ""}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { setError(null); fetchData(); }}
      />

      <DeactivateSectionModal
        open={showDeactivateModal}
        onClose={() => setShowDeactivateModal(false)}
        sectionId={sectionId}
        sectionName={section ? getCourseName(section.course_id) : ""}
        hasPayments={students.some((s) => (s.total_paid || 0) > 0)}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { setError(null); fetchData(); }}
      />

      <CompleteSectionModal
        open={showCompleteOverride}
        onClose={() => setShowCompleteOverride(false)}
        sectionId={sectionId}
        bypassGradeCheck={overrideData.ungraded.length > 0}
        bypassPaymentCheck={overrideData.unpaid.length > 0}
        ungradedStudents={overrideData.ungraded}
        unpaidStudents={overrideData.unpaid}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { setError(null); setShowCompleteOverride(false); setOverrideData({ ungraded: [], unpaid: [] }); setSuccessMsg(t.completeSuccess); fetchData(); }}
      />

      {/* Unenrollment History Section */}
      <div className="card overflow-hidden">
        <button
          onClick={() => { setShowUnenrollHistory(!showUnenrollHistory); if (!showUnenrollHistory && unenrollHistory.length === 0) loadUnenrollHistory(); }}
          className="w-full px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <Users size={16} className="text-slate-400" />
          <span>{t.unenrollHistory}</span>
          <span className="text-xs text-slate-400 font-normal ms-1">({unenrollHistory.length})</span>
          <div className="flex-1" />
          {showUnenrollHistory ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {showUnenrollHistory && (
          <div className="p-4">
            {loadingUnenrollHistory ? (
              <div className="flex items-center justify-center h-16">
                <Loader2 className="animate-spin text-slate-400" size={20} />
              </div>
            ) : unenrollHistory.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">{t.noUnenrollHistory}</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {unenrollHistory.map((rec: any) => (
                  <div key={rec.id} className="border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900">{rec.student_name}</span>
                      <span className="text-xs text-slate-500">
                        {rec.unenrolled_at ? new Date(rec.unenrolled_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric" }) : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>{isRtl ? "السبب" : "Reason"}: {rec.reason}</span>
                      <span>{isRtl ? "تم بواسطة" : "By"}: {rec.unenrolled_by_name || rec.unenrolled_by}</span>
                      <span>{isRtl ? "المدفوع" : "Paid"}: {rec.total_paid.toFixed(2)}</span>
                      <span>{isRtl ? "السياسة" : "Policy"}: {rec.refund_policy === "authorize_refund" ? t.refundAuthorizeRefund : t.refundNoRefund}</span>
                      {rec.refund_authorized_amount > 0 && (
                        <span className="text-amber-600">{isRtl ? "قيمة الاسترداد" : "Refund"}: {rec.refund_authorized_amount.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <UnenrollModal
        open={unenrollTarget !== null}
        enrollmentId={unenrollTarget?.id || ""}
        studentName={unenrollTarget?.student_name || ""}
        sectionName={unenrollTarget ? getCourseName(section?.course_id || "") : ""}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { setUnenrollTarget(null); setSuccessMsg(t.unenrollSuccess); fetchData(); }}
        onClose={() => setUnenrollTarget(null)}
      />
    </div>
  );
}
