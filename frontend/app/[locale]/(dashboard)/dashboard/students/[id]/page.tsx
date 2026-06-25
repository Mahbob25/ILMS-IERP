"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import { Loader2, ArrowLeft, Wallet, DollarSign } from "lucide-react";

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
  student_id: string;
  course_id: string;
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

  const fetchStudent = useCallback(async () => {
    if (!studentId) return;
    try {
      const [studRes, enrollRes, sectRes, courseRes, payRes] = await Promise.all([
        apiClient.get<Student[]>("/academic/students"),
        apiClient.get<Enrollment[]>(`/academic/enrollments?student_id=${studentId}`),
        apiClient.get<CourseSection[]>("/academic/course-sections"),
        apiClient.get<Course[]>("/academic/courses"),
        apiClient.get<Payment[]>(`/lms/payments?student_id=${studentId}`),
      ]);

      const found = studRes.data.find((s) => s.id === studentId) || null;
      setStudent(found);
      setAllStudents(studRes.data);
      setEnrollments(enrollRes.data);
      setSections(sectRes.data);
      setCourses(courseRes.data);
      setPayments(payRes.data);

      const summaryMap: Record<string, PaymentSummary> = {};
      for (const enrollment of enrollRes.data) {
        const section = sectRes.data.find((s) => s.id === enrollment.section_id);
        if (section) {
          try {
            const sumRes = await apiClient.get<PaymentSummary>(
              `/lms/payments/summary/${studentId}/${section.course_id}`
            );
            summaryMap[section.course_id] = sumRes.data;
          } catch {
            // skip
          }
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
        <RefreshButton onRefresh={fetchStudent} />
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
                const summary = summaries[sectionInfo.courseId];
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
                    const course = courses.find((c) => c.id === pay.course_id);
                    return (
                      <tr key={pay.id}>
                        <td><span className="badge badge-success">{pay.receipt_number}</span></td>
                        <td className="text-slate-700">{course?.name || pay.course_id.slice(0, 8)}</td>
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
    </div>
  );
}


