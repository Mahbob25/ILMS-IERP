"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Loader2, Printer, ArrowLeft, FileDown, Download } from "lucide-react";
import StudentSectionPrintSheet from "@/components/reports/StudentSectionPrintSheet";
import { generatePdfFromHtml } from "@/lib/generatePdfFromHtml";

type ReportPayload = {
  student: { id: string; student_code: string; full_name: string; email: string | null };
  section: {
    id: string;
    course_name: string;
    course_code: string;
    teacher_name: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    schedule_label: string;
    classroom: string | null;
    class_time: string | null;
    price: number | null;
  };
  enrollment: {
    id: string;
    enrolled_at: string | null;
    agreed_price: number | null;
    admin_discount: number | null;
    net_price: number | null;
    total_paid: number;
    balance_remaining: number | null;
    unenroll_record: { unenrolled_at: string | null; reason: string; refund_policy: string; refund_authorized_amount: number } | null;
    cancellation: { cancelled_at: string | null; reason: string; refund_policy: string } | null;
  };
  attendance: {
    summary: { total_sessions: number; present_count: number; absent_count: number; late_count: number; excused_count: number; attendance_rate: number };
    records: { date: string | null; status: string; session_id: string }[];
  };
  grade: { final_score: number; grade_label: string; notes: string | null; graded_at: string | null; graded_by: string | null } | null;
  payments: { id: string; receipt_number: string; amount: number; date: string | null; payment_method: string; created_by_name: string }[];
  certificate: { certificate_number: string; issued_at: string | null; final_score: number | null; grade_label: string | null } | null;
  ai_summary: string | null;
  ai_suggestions: string[];
  generated_at: string;
};

export default function StudentSectionReportPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const studentId = params?.id as string;
  const sectionId = params?.sectionId as string;

  const t: Record<string, string> = {
    reportTitle: isRtl ? "تقرير الطالب في الشعبة" : "Student Section Report",
    back: isRtl ? "رجوع" : "Back",
    print: isRtl ? "طباعة" : "Print",
    pdf: "PDF",
    csv: "CSV",
    student: isRtl ? "الطالب" : "Student",
    studentCode: isRtl ? "رقم الطالب" : "Student Code",
    email: isRtl ? "البريد" : "Email",
    course: isRtl ? "المقرر" : "Course",
    teacher: isRtl ? "المعلم" : "Teacher",
    status: isRtl ? "الحالة" : "Status",
    schedule: isRtl ? "الجدول" : "Schedule",
    enrolledAt: isRtl ? "تاريخ التسجيل" : "Enrolled",
    generatedAt: isRtl ? "تاريخ الإصدار" : "Generated",
    finance: isRtl ? "المالية" : "Finance",
    agreedPrice: isRtl ? "السعر المتفق عليه" : "Agreed Price",
    adminDiscount: isRtl ? "الخصم" : "Discount",
    netPrice: isRtl ? "صافي السعر" : "Net Price",
    totalPaid: isRtl ? "المدفوع" : "Total Paid",
    balance: isRtl ? "المتبقي" : "Balance",
    paid: isRtl ? "مدفوع" : "Paid",
    notApplicable: isRtl ? "لا توجد بيانات مالية" : "No financial data",
    attendance: isRtl ? "الحضور" : "Attendance",
    totalSessions: isRtl ? "الجلسات" : "Sessions",
    present: isRtl ? "حاضر" : "Present",
    absent: isRtl ? "غائب" : "Absent",
    late: isRtl ? "متأخر" : "Late",
    excused: isRtl ? "معذور" : "Excused",
    attendanceRate: isRtl ? "نسبة الحضور" : "Rate",
    date: isRtl ? "التاريخ" : "Date",
    noAttendance: isRtl ? "لا توجد سجلات حضور" : "No attendance records",
    grades: isRtl ? "الدرجات" : "Grades",
    finalScore: isRtl ? "الدرجة النهائية" : "Final Score",
    grade: isRtl ? "التقدير" : "Grade",
    notes: isRtl ? "ملاحظات" : "Notes",
    gradedAt: isRtl ? "تاريخ التقييم" : "Graded At",
    notGraded: isRtl ? "لم يتم التقييم بعد" : "Not graded yet",
    payments: isRtl ? "المدفوعات" : "Payments",
    receiptNumber: isRtl ? "رقم السند" : "Receipt No",
    amount: isRtl ? "المبلغ" : "Amount",
    paymentMethod: isRtl ? "طريقة الدفع" : "Method",
    noPayments: isRtl ? "لا توجد مدفوعات" : "No payments",
    certificate: isRtl ? "الشهادة" : "Certificate",
    certificateNumber: isRtl ? "رقم الشهادة" : "Certificate No",
    issueDate: isRtl ? "تاريخ الإصدار" : "Issued At",
    cancelled: isRtl ? "ملغاة" : "Cancelled",
    unenrolled: isRtl ? "أُلغي التسجيل" : "Unenrolled",
    aiInsights: isRtl ? "رؤى الذكاء الاصطناعي" : "AI Insights",
    page: isRtl ? "صفحة" : "Page",
    signatureTeacher: isRtl ? "توقيع المدرس" : "Teacher Signature",
    signatureAdmin: isRtl ? "توقيع الإدارة" : "Admin Signature",
    sar: isRtl ? "ريال" : "YER",
    error: isRtl ? "فشل تحميل التقرير" : "Failed to load report",
  };

  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [instituteName, setInstituteName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!studentId || !sectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [reportRes, settingsRes] = await Promise.all([
        apiClient.get<ReportPayload>(`/reports/student-section?student_id=${studentId}&section_id=${sectionId}`),
        apiClient.get<{ institute_name?: string }>("/settings").catch(() => null),
      ]);
      setPayload(reportRes.data);
      if (settingsRes?.data?.institute_name) setInstituteName(settingsRes.data.institute_name);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.error;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [studentId, sectionId, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => window.print();

  const handlePdf = async () => {
    if (!payload) return;
    try {
      const res = await apiClient.get(`/reports/student_section_report/print?student_id=${studentId}&section_id=${sectionId}&locale=${locale}`, { responseType: "text" });
      await generatePdfFromHtml(res.data as string, {
        filename: `student-${payload.student.student_code}-section-${sectionId.slice(0, 8)}.pdf`,
        width: 210,
        height: 297,
        orientation: "p",
        format: "a4",
      });
    } catch {
      setError(t.error);
    }
  };

  const handleCsv = () => {
    const url = `/api/v1/reports/student_section_report/export.csv?student_id=${studentId}&section_id=${sectionId}&locale=${locale}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-${studentId.slice(0, 8)}-section-${sectionId.slice(0, 8)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="max-w-5xl mx-auto p-6 text-center" dir={isRtl ? "rtl" : "ltr"}>
        <p className="text-sm text-red-600">{error || t.error}</p>
        <button onClick={() => router.back()} className="btn-secondary mt-4">{t.back}</button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="no-print flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => router.back()} className="btn-secondary flex items-center gap-2">
          <ArrowLeft size={16} className={isRtl ? "rotate-180" : ""} />
          {t.back}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleCsv} className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            {t.csv}
          </button>
          <button onClick={handlePdf} className="btn-secondary flex items-center gap-2">
            <FileDown size={16} />
            {t.pdf}
          </button>
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
            <Printer size={16} />
            {t.print}
          </button>
        </div>
      </div>

      <StudentSectionPrintSheet t={t} isRtl={isRtl} instituteName={instituteName} payload={payload} locale={locale} />
    </div>
  );
}
