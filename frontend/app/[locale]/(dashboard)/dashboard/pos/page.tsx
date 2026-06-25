"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Search, Loader2, RefreshCw, Receipt, X, Plus, Check } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";

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

interface PaymentResult {
  id: string;
  receipt_number: string;
  amount: number;
  student_id: string;
  course_id: string;
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
      instituteName: "معهد التعليم المتطور",
      signature: "التوقيع",
      cashier: "أمين الصندوق",
      studentSignature: "توقيع الطالب",
      print: "طباعة",
      noAccess: "ليس لديك صلاحية الوصول إلى نقطة البيع",
      selectEnrolledCourse: "اختر مقرر الطالب",
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
      sar: "SAR",
      receiptPreview: "Receipt Preview",
      paid: "Paid",
      date: "Date",
      student: "Student",
      receiptTitle: "Payment Receipt",
      instituteName: "Advanced Learning Institute",
      signature: "Signature",
      cashier: "Cashier",
      studentSignature: "Student Signature",
      print: "Print",
      noAccess: "You do not have access to Point of Sale",
      selectEnrolledCourse: "Select student's course",
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
  const [amount, setAmount] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [error, setError] = useState("");
  const [showReceipt, setShowReceipt] = useState<PaymentResult | null>(null);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiClient.get<Student[]>("/academic/students");
      setStudents(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await apiClient.get<Course[]>("/academic/courses");
      setCourses(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchCourseSections = useCallback(async () => {
    try {
      const res = await apiClient.get<CourseSection[]>("/academic/course-sections");
      setCourseSections(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchEnrollments = useCallback(async (studentId: string) => {
    setLoadingEnrollments(true);
    try {
      const res = await apiClient.get<Enrollment[]>(`/academic/enrollments?student_id=${studentId}`);
      setEnrollments(res.data);
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
    setAmount("");
    setResult(null);
    setError("");
    fetchEnrollments(student.id);
  };

  const handleClear = () => {
    setSelectedStudent(null);
    setStudentQuery("");
    setShowDropdown(false);
    setSelectedSectionId("");
    setAmount("");
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

  const getCourseIdForSection = (sectionId: string): string | null => {
    const section = courseSections.find((cs) => cs.id === sectionId);
    return section ? section.course_id : null;
  };

  const quickAmounts = [50, 100, 200, 500];

  const handleQuickAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !selectedSectionId || !amount) return;
    const courseId = getCourseIdForSection(selectedSectionId);
    if (!courseId) {
      setError("Could not determine course for selected section");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        student_id: selectedStudent.id,
        course_id: courseId,
        amount: parseFloat(amount),
      };
      const res = await apiClient.post<PaymentResult>("/lms/payments", payload);
      setResult(res.data);
      if (printReceipt) {
        setShowReceipt(res.data);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      setError(msg);
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

  const handlePrint = () => {
    window.print();
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

      {result && !showReceipt && (
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
            <button onClick={() => setShowReceipt(result)} className="btn-primary text-xs flex items-center gap-1">
              <Receipt size={14} />
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
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
              className="input-field pl-10"
            />
            {selectedStudent && (
              <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
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
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                      selectedStudent?.id === s.id ? "bg-slate-50 font-medium" : ""
                    }`}
                  >
                    <span className="text-slate-900">{s.full_name}</span>
                    <span className="text-slate-400 text-xs mr-2">({s.student_code})</span>
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
                      onClick={() => {
                        setSelectedSectionId(enr.section_id);
                        setAmount(enr.agreed_price ? enr.agreed_price.toString() : "");
                        setResult(null);
                        setError("");
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t.enterAmount}
                className="input-field text-lg font-bold"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{t.sar}</span>
            </div>
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
        <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 text-[11px] font-mono mr-2">Esc</kbd>
        <span>{isRtl ? "للحذف" : "to clear"}</span>
      </div>

      {/* Receipt Modal */}
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
                  <span className="font-semibold text-slate-900 font-mono">{showReceipt.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.date}</span>
                  <span className="text-slate-900">{formatDate(showReceipt.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.student}</span>
                  <span className="font-medium text-slate-900">{selectedStudent?.full_name || ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.course}</span>
                  <span className="text-slate-900">
                    {getCourseNameForEnrollment(selectedSectionId)}
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
