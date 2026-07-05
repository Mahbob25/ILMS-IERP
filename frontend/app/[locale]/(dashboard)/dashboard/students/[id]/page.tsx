"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import { Loader2, ArrowLeft, Wallet, DollarSign, Plus, X } from "lucide-react";

interface Student {
  id: string;
  student_code: string;
  full_name: string;
  email: string | null;
}

interface Course {
  id: string;
  name: string;
  code: string;
}

interface CourseSection {
  id: string;
  course_id: string;
}

interface Enrollment {
  id: string;
  student_id: string;
  section_id: string;
  enrolled_at: string;
  agreed_price: number | null;
  admin_discount: number | null;
}

interface Payment {
  id: string;
  enrollment_id: string;
  amount: number;
  date: string;
  receipt_number: string;
}

interface PaymentSummary {
  total_paid: number;
  agreed_price: number | null;
  balance_remaining: number | null;
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const studentId = params?.id as string;

  const t = {
    ar: {
      title: "الطالب",
      back: "عودة",
      studentCode: "رقم الطالب",
      email: "البريد الإلكتروني",
      enrollments: "التسجيلات",
      payments: "المدفوعات",
      course: "المقرر",
      agreedPrice: "السعر المتفق عليه",
      adminDiscount: "خصم إداري",
      totalPaid: "المدفوع",
      balance: "المتبقي",
      receiptNumber: "رقم الإيصال",
      amount: "المبلغ",
      date: "التاريخ",
      loading: "جاري التحميل...",
      noEnrollments: "لا توجد تسجيلات",
      noPayments: "لا توجد مدفوعات",
      sar: "ريال",
      paid: "مدفوع",
      overpaid: "زيادة",
      remaining: "متبقي",
      quickEnroll: "تسجيل سريع",
      selectSection: "اختر الشعبة",
      discount: "الخصم (%)",
      enroll: "تسجيل",
      enrollSuccess: "تم التسجيل بنجاح",
      enrollError: "فشل التسجيل",
      cancel: "إلغاء",
    },
    en: {
      title: "Student",
      back: "Back",
      studentCode: "Student Code",
      email: "Email",
      enrollments: "Enrollments",
      payments: "Payments",
      course: "Course",
      agreedPrice: "Agreed Price",
      adminDiscount: "Admin Discount",
      totalPaid: "Total Paid",
      balance: "Balance",
      receiptNumber: "Receipt No.",
      amount: "Amount",
      date: "Date",
      loading: "Loading...",
      noEnrollments: "No enrollments",
      noPayments: "No payments",
      sar: "SAR",
      paid: "Paid",
      overpaid: "Overpaid",
      remaining: "Remaining",
      quickEnroll: "Quick Enroll",
      selectSection: "Select Section",
      discount: "Discount (%)",
      enroll: "Enroll",
      enrollSuccess: "Enrolled successfully",
      enrollError: "Enrollment failed",
      cancel: "Cancel",
    },
  }[locale === "en" ? "en" : "ar"];

  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PaymentSummary>>({});
  const [loading, setLoading] = useState(true);
  const [showQuickEnroll, setShowQuickEnroll] = useState(false);
  const [quickEnrollSectionId, setQuickEnrollSectionId] = useState("");
  const [quickEnrollDiscount, setQuickEnrollDiscount] = useState("");
  const [quickEnrollMsg, setQuickEnrollMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStudent = useCallback(async () => {
    if (!studentId) return;
    try {
      const [studRes, enrollRes, sectRes, courseRes, payRes] = await Promise.all([
        apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000"),
        apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments?student_id=${studentId}&limit=1000`),
        apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000"),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000"),
        apiClient.get<Payment[]>(`/lms/payments?student_id=${studentId}`),
      ]);

      const found = studRes.data.items.find((s) => s.id === studentId) || null;
      setStudent(found);
      setAllStudents(studRes.data.items);
      setEnrollments(enrollRes.data.items);
      setSections(sectRes.data.items);
      setCourses(courseRes.data.items);
      setPayments(payRes.data);
      setLoading(false);

      const summaryMap: Record<string, PaymentSummary> = {};
      for (const enrollment of enrollRes.data.items) {
        try {
          const sumRes = await apiClient.get<PaymentSummary>(
            `/lms/payments/summary/${enrollment.id}`
          );
          summaryMap[enrollment.id] = sumRes.data;
        } catch {
          // skip
        }
      }
      setSummaries(summaryMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { fetchStudent(); }, [fetchStudent]);

  const handleQuickEnroll = async () => {
    if (!quickEnrollSectionId) return;
    try {
      const payload: Record<string, unknown> = {
        student_id: studentId,
        section_id: quickEnrollSectionId,
      };
      if (quickEnrollDiscount) payload.admin_discount = parseFloat(quickEnrollDiscount);
      await apiClient.post("/academic/enrollments", payload);
      setQuickEnrollMsg({ type: "success", text: t.enrollSuccess });
      setShowQuickEnroll(false);
      setQuickEnrollSectionId("");
      setQuickEnrollDiscount("");
      fetchStudent();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t.enrollError;
      setQuickEnrollMsg({ type: "error", text: detail });
    }
  };

  const getSectionCourse = (sectionId: string) => {
    const sect = sections.find((s) => s.id === sectionId);
    if (!sect) return { name: sectionId, courseId: "" };
    const course = courses.find((c) => c.id === sect.course_id);
    return { name: course ? course.name : sectionId, courseId: sect.course_id };
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return d; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>Student not found</p>
        <button onClick={() => router.back()} className="btn-primary mt-4">{t.back}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-icon" title={t.back}>
            <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t.title}: {student.full_name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {t.studentCode}: {student.student_code}
              {student.email && <> &middot; {student.email}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchStudent} />
          {(user?.role?.name === "superadmin" || user?.role?.name === "manager" || user?.role?.name === "secretary") && (
            <button onClick={() => { setShowQuickEnroll(true); setQuickEnrollMsg(null); }} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              <span>{t.quickEnroll}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Wallet size={16} className="text-slate-400" />
            {t.enrollments}
          </h3>
          {enrollments.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">{t.noEnrollments}</p>
          ) : (
            <div className="space-y-3">
              {enrollments.map((enr) => {
                const sectionInfo = getSectionCourse(enr.section_id);
                const summary = summaries[enr.id];
                return (
                  <div key={enr.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <p className="font-medium text-slate-900 text-sm">{sectionInfo.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">{t.agreedPrice}: </span>
                        <span className="font-semibold text-slate-900">
                          {enr.agreed_price != null ? `${enr.agreed_price.toFixed(2)} ${t.sar}` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t.adminDiscount}: </span>
                        <span className="font-semibold text-slate-900">
                          {enr.admin_discount != null ? `${enr.admin_discount.toFixed(2)} ${t.sar}` : "—"}
                        </span>
                      </div>
                      {summary && (
                        <>
                          <div>
                            <span className="text-slate-500">{t.totalPaid}: </span>
                            <span className="font-semibold text-emerald-600">
                              {summary.total_paid.toFixed(2)} {t.sar}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">{t.balance}: </span>
                            <span className={`font-semibold ${
                              summary.balance_remaining != null
                                ? summary.balance_remaining > 0
                                  ? "text-amber-600"
                                  : "text-emerald-600"
                                : "text-slate-600"
                            }`}>
                              {summary.balance_remaining != null
                                ? summary.balance_remaining > 0
                                  ? `${summary.balance_remaining.toFixed(2)} ${t.sar} ${t.remaining}`
                                  : summary.balance_remaining < 0
                                    ? `${Math.abs(summary.balance_remaining).toFixed(2)} ${t.sar} ${t.overpaid}`
                                    : `${t.paid}`
                                : "—"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-slate-400" />
            {t.payments}
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">{t.noPayments}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>{t.receiptNumber}</th>
                    <th>{t.course}</th>
                    <th>{t.amount}</th>
                    <th>{t.date}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pay) => {
                    const enrollment = enrollments.find((e) => e.id === pay.enrollment_id);
                    const section = enrollment ? sections.find((s) => s.id === enrollment.section_id) : null;
                    const course = section ? courses.find((c) => c.id === section.course_id) : null;
                    return (
                      <tr key={pay.id}>
                        <td><span className="badge badge-success">{pay.receipt_number}</span></td>
                        <td className="text-slate-700">{course?.name || pay.enrollment_id.slice(0, 8)}</td>
                        <td className="font-semibold text-slate-900">{pay.amount.toFixed(2)} {t.sar}</td>
                        <td className="text-slate-500">{formatDate(pay.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={showQuickEnroll} onClose={() => setShowQuickEnroll(false)} title={t.quickEnroll} size="xl">
        <div className="space-y-6">
          {quickEnrollMsg && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
              quickEnrollMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {quickEnrollMsg.text}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectSection}</label>
            <Select
              value={quickEnrollSectionId}
              onChange={setQuickEnrollSectionId}
              options={sections.map((s) => ({ value: s.id, label: getSectionCourse(s.id).name }))}
              placeholder="—"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{t.discount}</label>
            <input type="number" value={quickEnrollDiscount} onChange={(e) => setQuickEnrollDiscount(e.target.value)}
              className="input-field" min={0} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleQuickEnroll} disabled={!quickEnrollSectionId} className="btn-primary flex-1">
              {t.enroll}
            </button>
            <button onClick={() => setShowQuickEnroll(false)} className="btn-secondary flex-1">
              {t.cancel}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


