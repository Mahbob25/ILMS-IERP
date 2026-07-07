"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Search, Loader2, RefreshCw, X, Plus, Check } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";

interface Student {
  id: string;
  student_code: string;
  full_name: string;
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

interface PaymentSummary {
  total_paid: number;
  agreed_price: number | null;
  admin_discount: number | null;
  net_price: number | null;
  balance_remaining: number | null;
}

interface PaymentResult {
  id: string;
  receipt_number: string;
  amount: number;
  enrollment_id: string;
  date: string;
}

export default function POSPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const searchRef = useRef<HTMLInputElement>(null);

  const t = {
    ar: {
      title: "نقطة البيع",
      subtitle: "تسجيل مدفوعات سريع",
      searchStudent: "ابحث عن طالب...",
      noStudents: "لا يوجد طلاب",
      enrolledCourses: "المقررات المسجلة",
      noEnrollments: "هذا الطالب غير مسجل في أي مقرر",
      amount: "المبلغ",
      enterAmount: "أدخل المبلغ",
      printReceipt: "طباعة الإيصال",
      record: "تسجيل الدفعة",
      recording: "جاري التسجيل...",
      success: "تم تسجيل الدفعة بنجاح",
      receiptNumber: "رقم الإيصال",
      close: "إغلاق",
      newPayment: "دفعة جديدة",
      course: "المقرر",
      agreedPrice: "السعر المتفق عليه",
      sar: "ريال",
      receiptPreview: "معاينة الإيصال",
      paid: "مدفوع",
      date: "التاريخ",
      student: "الطالب",
      receiptTitle: "إيصال دفع",
      instituteName: "Al-Drasat ERP",
      signature: "التوقيع",
      cashier: "أمين الصندوق",
      studentSignature: "توقيع الطالب",
      print: "طباعة",
      noAccess: "ليس لديك صلاحية الوصول إلى نقطة البيع",
      selectEnrolledCourse: "اختر مقرر الطالب",
      remaining: "المتبقي",
      netPrice: "صافي السعر",
      totalPaid: "المدفوع",
      positiveAmount: "يجب أن يكون المبلغ أكبر من صفر",
      exceedsBalance: "المبلغ يتجاوز الرصيد المتبقي",
      paymentFailed: "فشل تسجيل الدفعة",
      cash: "نقداً",
      online: "تحويل بنكي",
      paymentMethod: "طريقة الدفع",
      transactionNumber: "رقم العملية",
      enterTransactionNumber: "أدخل رقم العملية",
    },
    en: {
      title: "Point of Sale",
      subtitle: "Quick payment recording",
      searchStudent: "Search student...",
      noStudents: "No students found",
      enrolledCourses: "Enrolled Courses",
      noEnrollments: "This student is not enrolled in any course",
      amount: "Amount",
      enterAmount: "Enter amount",
      printReceipt: "Print Receipt",
      record: "Record Payment",
      recording: "Recording...",
      success: "Payment recorded successfully",
      receiptNumber: "Receipt No.",
      close: "Close",
      newPayment: "New Payment",
      course: "Course",
      agreedPrice: "Agreed Price",
      sar: "YER",
      receiptPreview: "Receipt Preview",
      paid: "Paid",
      date: "Date",
      student: "Student",
      receiptTitle: "Payment Receipt",
      instituteName: "Al-Drasat ERP",
      signature: "Signature",
      cashier: "Cashier",
      studentSignature: "Student Signature",
      print: "Print",
      noAccess: "You do not have access to Point of Sale",
      selectEnrolledCourse: "Select student's course",
      remaining: "Remaining",
      netPrice: "Net Price",
      totalPaid: "Total Paid",
      positiveAmount: "Amount must be positive",
      exceedsBalance: "Amount exceeds remaining balance",
      paymentFailed: "Payment failed",
      cash: "Cash",
      online: "Bank Transfer",
      paymentMethod: "Payment Method",
      transactionNumber: "Transaction Number",
      enterTransactionNumber: "Enter transaction number",
    },
  }[locale === "en" ? "en" : "ar"];

  const canAccess = user?.role?.name === "superadmin" || user?.role?.name === "manager" || user?.role?.name === "secretary";

  const [students, setStudents] = useState<Student[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courseSections, setCourseSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [error, setError] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: Student[]; total: number }>("/academic/students?limit=1000");
      setStudents(res.data.items);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000");
      setCourses(res.data.items);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchCourseSections = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: CourseSection[]; total: number }>("/academic/course-sections?limit=1000");
      setCourseSections(res.data.items);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchEnrollments = useCallback(async (studentId: string) => {
    setLoadingEnrollments(true);
    try {
      const res = await apiClient.get<{ items: Enrollment[]; total: number }>(`/academic/enrollments?student_id=${studentId}&limit=1000`);
      setEnrollments(res.data.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEnrollments(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
    fetchCourses();
    fetchCourseSections();
  }, [fetchStudents, fetchCourses, fetchCourseSections]);

  useEffect(() => {
    if (searchRef.current) {
      searchRef.current.focus();
    }
  }, []);

  const filteredStudents = studentQuery.trim()
    ? students.filter((s) =>
        s.full_name.toLowerCase().includes(studentQuery.toLowerCase()) ||
        s.student_code.toLowerCase().includes(studentQuery.toLowerCase())
      )
    : students;

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setStudentQuery(student.full_name);
    setShowDropdown(false);
    setSelectedSectionId("");
    setSelectedEnrollmentId("");
    setAmount("");
    setSummary(null);
    setResult(null);
    setError("");
    fetchEnrollments(student.id);
  };

  const handleClear = () => {
    setShowReceipt(false);
    setSelectedStudent(null);
    setStudentQuery("");
    setShowDropdown(false);
    setSelectedSectionId("");
    setSelectedEnrollmentId("");
    setAmount("");
    setPaymentMethod("cash");
    setTransactionNumber("");
    setSummary(null);
    setResult(null);
    setError("");
    setEnrollments([]);
    if (searchRef.current) {
      searchRef.current.focus();
    }
  };

  const getCourseNameForEnrollment = (sectionId: string): string => {
    const section = courseSections.find((cs) => cs.id === sectionId);
    if (!section) return sectionId.slice(0, 8);
    const course = courses.find((c) => c.id === section.course_id);
    return course ? course.name : sectionId.slice(0, 8);
  };

  const quickAmounts = [50, 100, 200, 500];

  const handleQuickAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !selectedEnrollmentId || !amount) return;
    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0) {
      setError(t.positiveAmount);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        enrollment_id: selectedEnrollmentId,
        amount: parsedAmount,
        payment_method: paymentMethod,
      };
      if (paymentMethod === "online") {
        payload.transaction_number = transactionNumber;
      }
      const res = await apiClient.post<PaymentResult>("/lms/payments", payload);
      const updatedSummaryRes = await apiClient.get<PaymentSummary>(`/lms/payments/summary/${selectedEnrollmentId}`);
      const updatedSummary = updatedSummaryRes.data;
      const rd: ReceiptData = {
        id: res.data.id,
        type: "payment",
        receipt_number: res.data.receipt_number,
        date: res.data.date,
        amount: res.data.amount,
        student_name: selectedStudent?.full_name || "",
        course_name: getCourseNameForEnrollment(selectedSectionId),
        payment_method: paymentMethod,
        transaction_number: transactionNumber,
        agreed_price: updatedSummary?.agreed_price ?? null,
        admin_discount: updatedSummary?.admin_discount ?? null,
        total_paid: updatedSummary?.total_paid ?? null,
        balance_remaining: updatedSummary?.balance_remaining ?? null,
      };
      setReceiptData(rd);
      setResult(res.data);
      if (printReceipt) {
        setShowReceipt(true);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      const detail = err?.response?.data?.detail || "";
      if (detail.includes("exceeds remaining balance")) {
        setError(t.exceedsBalance);
      } else if (detail.includes("must be positive")) {
        setError(t.positiveAmount);
      } else {
        setError(detail || t.paymentFailed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStudents(), fetchCourses(), fetchCourseSections()]);
    if (selectedStudent) {
      await fetchEnrollments(selectedStudent.id);
    }
    setRefreshing(false);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !submitting && selectedStudent && selectedSectionId && amount) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      handleClear();
    }
  };

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate-500">{t.noAccess}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"} onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <RefreshButton onRefresh={handleRefresh} tooltip={isRtl ? "تحديث" : "Refresh"} />
      </div>

      {result && receiptData && (
        <div className="card p-4 border-emerald-200 bg-emerald-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check size={20} className="text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">{t.success}</p>
              <p className="text-xs text-emerald-600">
                {t.receiptNumber}: <span className="font-mono font-bold">{result.receipt_number}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowReceipt(true)} className="btn-primary text-xs flex items-center gap-1">
              <span>{t.receiptPreview}</span>
            </button>
            <button onClick={handleClear} className="btn-secondary text-xs">{t.newPayment}</button>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-5">
        {/* Student Search */}
        <div className="relative">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.student}</label>
          <div className="relative">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={studentQuery}
              onChange={(e) => {
                setStudentQuery(e.target.value);
                setShowDropdown(true);
                if (!e.target.value) {
                  setSelectedStudent(null);
                  setEnrollments([]);
                  setSelectedSectionId("");
                  setAmount("");
                }
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder={t.searchStudent}
              className="input-field ps-10"
            />
            {selectedStudent && (
              <button onClick={handleClear} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            )}
          </div>
          {showDropdown && studentQuery.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">{t.noStudents}</div>
              ) : (
                filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    onMouseDown={() => handleSelectStudent(s)}
                    className={`w-full text-start px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                      selectedStudent?.id === s.id ? "bg-slate-50 font-medium" : ""
                    }`}
                  >
                    <span className="text-slate-900">{s.full_name}</span>
                    <span className="text-slate-400 text-xs ms-2">({s.student_code})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Enrolled Courses */}
        {selectedStudent && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.selectEnrolledCourse}</label>
            {loadingEnrollments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : enrollments.length === 0 ? (
              <div className="text-sm text-slate-500 py-3">{t.noEnrollments}</div>
            ) : (
              <div className="space-y-2">
                {enrollments.map((enr) => {
                  const isSelected = selectedSectionId === enr.section_id;
                  const courseName = getCourseNameForEnrollment(enr.section_id);
                  return (
                    <button
                      key={enr.id}
                      onClick={async () => {
                        setSelectedSectionId(enr.section_id);
                        setSelectedEnrollmentId(enr.id);
                        setResult(null);
                        setError("");
                        try {
                          const res = await apiClient.get<PaymentSummary>(`/lms/payments/summary/${enr.id}`);
                          setSummary(res.data);
                          setAmount(res.data.balance_remaining != null ? res.data.balance_remaining.toString() : "");
                        } catch {
                          setSummary(null);
                          setAmount(enr.agreed_price ? Math.max(0, enr.agreed_price - (enr.admin_discount || 0)).toString() : "");
                        }
                      }}
                      className={`w-full text-start p-3 rounded-xl border transition-colors ${
                        isSelected
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isSelected && <Check size={16} className="text-emerald-600" />}
                          <span className={`text-sm font-medium ${isSelected ? "text-emerald-800" : "text-slate-900"}`}>
                            {courseName}
                          </span>
                        </div>
                        {enr.agreed_price != null && (
                          <span className="text-xs text-slate-500">
                            {t.agreedPrice}: {enr.agreed_price.toFixed(2)} {t.sar}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Amount + Quick Amounts */}
        {selectedSectionId && (
          <div>
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
            <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.amount}</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {quickAmounts.map((val) => (
                <button
                  key={val}
                  onClick={() => handleQuickAmount(val)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    amount === val.toString()
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  +{val}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max={summary?.balance_remaining ?? ""}
                value={amount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (summary?.balance_remaining != null && parseFloat(val) > summary.balance_remaining) {
                    setAmount(summary.balance_remaining.toString());
                  } else {
                    setAmount(val);
                  }
                }}
                placeholder={t.enterAmount}
                className="input-field text-lg font-bold"
              />
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{t.sar}</span>
            </div>
          </div>
        )}

        {/* Payment Method */}
        {selectedSectionId && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.paymentMethod}</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setPaymentMethod("cash"); setTransactionNumber(""); }}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-colors ${
                  paymentMethod === "cash"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {t.cash}
              </button>
              <button
                onClick={() => setPaymentMethod("online")}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-colors ${
                  paymentMethod === "online"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {t.online}
              </button>
            </div>
            {paymentMethod === "online" && (
              <div className="mt-4">
                <input
                  type="text"
                  value={transactionNumber}
                  onChange={(e) => setTransactionNumber(e.target.value)}
                  placeholder={t.enterTransactionNumber}
                  className="input-field"
                  required
                />
              </div>
            )}
          </div>
        )}

        {/* Print Receipt Toggle */}
        {selectedSectionId && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="printReceipt"
              checked={printReceipt}
              onChange={(e) => setPrintReceipt(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="printReceipt" className="text-sm text-slate-700 cursor-pointer">{t.printReceipt}</label>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>
        )}

        {/* Submit */}
        {selectedSectionId && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{t.recording}</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>{t.record}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="text-center text-xs text-slate-400 space-x-2">
        <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 text-[11px] font-mono">Enter</kbd>
        <span>{isRtl ? "للتسجيل" : "to submit"}</span>
        <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 text-[11px] font-mono ms-2">Esc</kbd>
        <span>{isRtl ? "للحذف" : "to clear"}</span>
      </div>

      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        data={receiptData}
        locale={locale}
        isRtl={isRtl}
        instituteName={t.instituteName}
      />
    </div>
  );
}
