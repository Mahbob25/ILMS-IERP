"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
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
} from "lucide-react";
import SectionWarningBanner from "@/components/sections/SectionWarningBanner";
import SectionStatusBadge from "@/components/sections/SectionStatusBadge";
import FinancialSummary from "@/components/sections/FinancialSummary";
import CancelSectionModal from "@/components/sections/CancelSectionModal";
import DeactivateSectionModal from "@/components/sections/DeactivateSectionModal";
import CompleteSectionModal from "@/components/sections/CompleteSectionModal";
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
  const sectionId = params?.sectionId as string;

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
    },
  }[locale === "en" ? "en" : "ar"];

  const [section, setSection] = useState<SectionInfo | null>(null);
  const [students, setStudents] = useState<SectionEnrollmentDetail[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showCompleteOverride, setShowCompleteOverride] = useState(false);
  const [overrideData, setOverrideData] = useState<{
    ungraded: any[];
    unpaid: any[];
  }>({ ungraded: [], unpaid: [] });

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
      console.error(e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

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

  const contractStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-emerald-50 text-emerald-600 border-emerald-200",
      assigned: "bg-blue-50 text-blue-600 border-blue-200",
      grades_submitted: "bg-purple-50 text-purple-600 border-purple-200",
      settled: "bg-slate-100 text-slate-500 border-slate-200",
    };
    const labels: Record<string, string> = {
      assigned: t.contractAssigned,
      active: t.contractActive,
      grades_submitted: t.contractGraded,
      settled: t.contractSettled,
      cancelled: t.contractCancelled,
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || "bg-slate-50 text-slate-400 border-slate-200"}`}>
        {labels[status] || status}
      </span>
    );
  };

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
              contractStatusBadge(contract.status)
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
                    onClick={() => {
                      setError(null);
                      setOverrideData({
                        ungraded: students
                          .filter((s) => s.final_score == null)
                          .map((s) => ({ student_name: s.student_name, student_code: s.student_code })),
                        unpaid: students
                          .filter((s) => (s.balance_remaining || 0) > 0)
                          .map((s) => ({ student_name: s.student_name, student_code: s.student_code, amount: s.balance_remaining })),
                      });
                      setShowCompleteOverride(true);
                    }}
                    className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={12} />
                    {t.completeSection || "Complete"}
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
          if (section.status === "cancelled") return null;
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
        onSuccess={() => { setError(null); fetchData(); }}
      />
    </div>
  );
}
