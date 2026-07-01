"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Plus, Loader2, RefreshCw, Receipt, X, Eye } from "lucide-react";

interface Payment {
  id: string;
  enrollment_id: string;
  amount: number;
  date: string;
  receipt_number: string;
}

interface Student { id: string; student_code: string; full_name: string; }
interface Course { id: string; name: string; code: string; }
interface CourseSection { id: string; course_id: string; }
interface Enrollment { id: string; student_id: string; section_id: string; agreed_price: number | null; admin_discount: number | null; }

interface PaymentSummary {
  total_paid: number;
  agreed_price: number | null;
  admin_discount: number | null;
  net_price: number | null;
  balance_remaining: number | null;
}

export default function PaymentsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "المدفوعات",
      subtitle: "إدارة المدفوعات والإيصالات",
      receiptNumber: "رقم الإيصال",
      student: "الطالب",
      course: "المقرر",
      amount: "المبلغ",
      date: "التاريخ",
      actions: "الإجراءات",
      add: "تسجيل دفعة",
      save: "حفظ",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      empty: "لا توجد مدفوعات بعد",
      refresh: "تحديث",
      selectEnrollment: "اختر التسجيل",
      selectStudent: "اختر الطالب",
      enterAmount: "أدخل المبلغ",
      receiptPreview: "معاينة الإيصال",
      paymentDate: "تاريخ الدفع",
      print: "طباعة",
      close: "إغلاق",
      receiptTitle: "إيصال دفع",
      instituteName: "معهد التعليم المتطور",
      signature: "التوقيع",
      cashier: "أمين الصندوق",
      studentSignature: "توقيع الطالب",
      paid: "مدفوع",
      remaining: "المتبقي",
      netPrice: "صافي السعر",
      totalPaid: "المدفوع",
      positiveAmount: "يجب أن يكون المبلغ أكبر من صفر",
      exceedsBalance: "المبلغ يتجاوز الرصيد المتبقي",
      paymentFailed: "فشل تسجيل الدفعة",
      sar: "ريال",
    },
    en: {
      title: "Payments",
      subtitle: "Manage payments and receipts",
      receiptNumber: "Receipt No.",
      student: "Student",
      course: "Course",
      amount: "Amount",
      date: "Date",
      actions: "Actions",
      add: "Record Payment",
      save: "Save",
      cancel: "Cancel",
      loading: "Loading...",
      empty: "No payments yet",
      refresh: "Refresh",
      selectEnrollment: "Select Enrollment",
      selectStudent: "Select Student",
      enterAmount: "Enter Amount",
      receiptPreview: "Receipt Preview",
      paymentDate: "Payment Date",
      print: "Print",
      close: "Close",
      receiptTitle: "Payment Receipt",
      instituteName: "Advanced Learning Institute",
      signature: "Signature",
      cashier: "Cashier",
      studentSignature: "Student Signature",
      paid: "Paid",
      remaining: "Remaining",
      netPrice: "Net Price",
      totalPaid: "Total Paid",
      positiveAmount: "Amount must be positive",
      exceedsBalance: "Amount exceeds remaining balance",
      paymentFailed: "Payment failed",
      sar: "SAR",
    },
  }[locale === "en" ? "en" : "ar"];

  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showReceipt, setShowReceipt] = useState<Payment | null>(null);
  const [form, setForm] = useState<{
    enrollment_id: string;
    amount: string;
    date: string;
  }>({ enrollment_id: "", amount: "", date: new Date().toISOString().split("T")[0] });

  const canCreate = user?.is_superadmin || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const fetchPayments = useCallback(async () => {
    try {
      const res = await apiClient.get<Payment[]>("/lms/payments");
      setPayments(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchLookups = useCallback(async () => {
    try {
      const [studentsRes, coursesRes, sectionsRes, enrollmentsRes] = await Promise.all([
        apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000"),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000"),
        apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000"),
        apiClient.get<{ items: Enrollment[]; total: number }>("/academic/enrollments?limit=1000"),
      ]);
      setStudents(studentsRes.data.items);
      setCourses(coursesRes.data.items);
      setSections(sectionsRes.data.items);
      setEnrollments(enrollmentsRes.data.items);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPayments(), fetchLookups()]);
    setLoading(false);
  }, [fetchPayments, fetchLookups]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPayments(), fetchLookups()]);
    setRefreshing(false);
  };

  const openCreate = async () => {
    await fetchLookups();
    setForm({ enrollment_id: "", amount: "", date: new Date().toISOString().split("T")[0] });
    setSummary(null);
    setFormError("");
    setShowForm(true);
  };

  const resolveEnrollment = (enrollmentId: string) => {
    const enrollment = enrollments.find((e) => e.id === enrollmentId);
    if (!enrollment) return null;
    const student = students.find((s) => s.id === enrollment.student_id);
    const section = sections.find((s) => s.id === enrollment.section_id);
    const course = section ? courses.find((c) => c.id === section.course_id) : null;
    return { enrollment, student, section, course };
  };

  const getStudentName = (id: string) => {
    const s = students.find((s) => s.id === id);
    return s ? s.full_name : id.slice(0, 8);
  };

  const getCourseName = (id: string) => {
    const c = courses.find((c) => c.id === id);
    return c ? c.name : id.slice(0, 8);
  };

  const enrollmentLabel = (enrollmentId: string) => {
    const resolved = resolveEnrollment(enrollmentId);
    if (!resolved) return enrollmentId.slice(0, 8);
    return `${resolved.student?.full_name || "?"} - ${resolved.course?.name || "?"}`;
  };

  const handleSave = async () => {
    if (!form.enrollment_id || !form.amount) return;
    const parsedAmount = parseFloat(form.amount);
    if (parsedAmount <= 0) {
      setFormError(t.positiveAmount);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        enrollment_id: form.enrollment_id,
        amount: parsedAmount,
      };
      if (form.date) payload.date = form.date;
      const res = await apiClient.post("/lms/payments", payload);
      setShowForm(false);
      setFormError("");
      setShowReceipt(res.data);
      fetchPayments();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      const detail = err?.response?.data?.detail || "";
      if (detail.includes("exceeds remaining balance")) {
        setFormError(t.exceedsBalance);
      } else if (detail.includes("must be positive")) {
        setFormError(t.positiveAmount);
      } else {
        setFormError(detail || t.paymentFailed);
      }
    }
  };

  const handlePrint = () => {
    window.print();
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          {canCreate && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              <span>{t.add}</span>
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.selectEnrollment}</label>
              <select
                value={form.enrollment_id}
                onChange={async (e) => {
                  setForm({ ...form, enrollment_id: e.target.value, amount: "" });
                  setSummary(null);
                  setFormError("");
                  if (!e.target.value) return;
                  try {
                    const res = await apiClient.get<PaymentSummary>(`/lms/payments/summary/${e.target.value}`);
                    setSummary(res.data);
                    if (res.data.balance_remaining != null) {
                      setForm(prev => ({ ...prev, enrollment_id: e.target.value, amount: res.data!.balance_remaining!.toString() }));
                    }
                  } catch {
                    // fallback
                  }
                }}
                className="input-field"
              >
                <option value="">--</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>{enrollmentLabel(e.id)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterAmount}</label>
              {summary && (
                <div className="text-xs text-slate-600 space-y-0.5 mb-2 p-2 bg-slate-50 rounded-lg">
                  <div className="flex justify-between">
                    <span>{t.netPrice}:</span>
                    <span className="font-medium">{summary.net_price?.toFixed(2)} {t.sar}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.totalPaid}:</span>
                    <span className="font-medium">{summary.total_paid.toFixed(2)} {t.sar}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>{t.remaining}:</span>
                    <span>{summary.balance_remaining != null ? summary.balance_remaining.toFixed(2) : "—"} {t.sar}</span>
                  </div>
                </div>
              )}
              <input type="number" step="0.01" min="0" max={summary?.balance_remaining ?? ""} value={form.amount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (summary?.balance_remaining != null && parseFloat(val) > summary.balance_remaining) {
                    setForm({ ...form, amount: summary.balance_remaining.toString() });
                  } else {
                    setForm({ ...form, amount: val });
                  }
                }}
                className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.paymentDate}</label>
              <input type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input-field" />
            </div>
          </div>
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{formError}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary">{t.save}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.receiptNumber}</th>
                <th>{t.student}</th>
                <th>{t.course}</th>
                <th>{t.amount}</th>
                <th>{t.date}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const resolved = resolveEnrollment(payment.enrollment_id);
                const studentName = resolved?.student?.full_name || payment.enrollment_id.slice(0, 8);
                const courseName = resolved?.course?.name || payment.enrollment_id.slice(0, 8);
                return (
                  <tr key={payment.id}>
                    <td><span className="badge badge-success">{payment.receipt_number}</span></td>
                    <td className="font-medium text-slate-900">{studentName}</td>
                    <td className="text-slate-600">{courseName}</td>
                    <td className="font-semibold text-slate-900">{payment.amount.toFixed(2)} {t.sar}</td>
                    <td className="text-slate-500">{formatDate(payment.date)}</td>
                    <td>
                      <button onClick={() => setShowReceipt(payment)} className="btn-icon" title={t.receiptPreview}>
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{t.receiptTitle}</h3>
                <button onClick={() => setShowReceipt(null)} className="btn-icon">
                  <X size={18} />
                </button>
              </div>
              <div className="border-t border-slate-200 pt-4 space-y-3 text-sm">
                <div className="text-center pb-4 border-b border-slate-100">
                  <h4 className="text-base font-bold text-slate-900">{t.instituteName}</h4>
                  <p className="text-slate-500 mt-1">{t.receiptTitle}</p>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.receiptNumber}</span>
                  <span className="font-semibold text-slate-900">{showReceipt.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.date}</span>
                  <span className="text-slate-900">{formatDate(showReceipt.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.student}</span>
                  <span className="font-medium text-slate-900">
                    {(() => {
                      const r = resolveEnrollment(showReceipt.enrollment_id);
                      return r?.student?.full_name || showReceipt.enrollment_id.slice(0, 8);
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.course}</span>
                  <span className="text-slate-900">
                    {(() => {
                      const r = resolveEnrollment(showReceipt.enrollment_id);
                      return r?.course?.name || showReceipt.enrollment_id.slice(0, 8);
                    })()}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                  <span className="font-bold text-slate-900">{t.paid}</span>
                  <span className="font-bold text-emerald-600">
                    {showReceipt.amount.toFixed(2)} {t.sar}
                  </span>
                </div>
                <div className="flex justify-between pt-8 text-xs text-slate-400">
                  <span>{t.cashier}: _________________</span>
                  <span>{t.studentSignature}: _________________</span>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 flex gap-3 justify-end">
              <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
                <Receipt size={16} />
                <span>{t.print}</span>
              </button>
              <button onClick={() => setShowReceipt(null)} className="btn-secondary">{t.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
