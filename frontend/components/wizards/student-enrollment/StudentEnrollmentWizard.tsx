"use client";

import React, { useCallback, useEffect, useReducer, useState } from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import {
  sanitizeInput,
  validateName,
} from "@/lib/utils/input";
import { useWizardDirtyGuard } from "@/components/wizards/WizardDirtyGuard";
import WizardStepper, {
  WizardStepperStep,
} from "@/components/wizards/WizardStepper";
import WizardNavigationBar from "@/components/wizards/WizardNavigationBar";
import ReceiptModal, { ReceiptData } from "@/components/ReceiptModal";
import StudentStep, { StudentStepLabels } from "./steps/StudentStep";
import SectionEnrollmentStep, {
  SectionEnrollmentStepLabels,
} from "./steps/SectionEnrollmentStep";
import PaymentStep, { PaymentStepLabels } from "./steps/PaymentStep";
import CompletionScreen, {
  CompletionScreenLabels,
} from "./CompletionScreen";
import {
  createInitialWizard1State,
  wizard1Reducer,
  PaymentSummary,
} from "./wizard1Reducer";
import { Loader2 } from "lucide-react";

interface Student {
  id: string;
  student_code: string;
  full_name: string;
}

interface CourseSection {
  id: string;
  course_id: string;
  status: string;
  capacity: number;
  enrolled_count: number;
}

interface Course {
  id: string;
  name: string;
  code: string;
}

interface StudentEnrollmentWizardProps {
  locale: string;
  isRtl: boolean;
}

type ErrorCode =
  | ""
  | "data"
  | "no_student"
  | "no_section"
  | "bad_amount"
  | "bad_transaction"
  | "create_failed"
  | "enroll_failed"
  | "pay_failed";

export default function StudentEnrollmentWizard({
  locale,
  isRtl,
}: StudentEnrollmentWizardProps) {
  const { user } = useAuth();
  const { setDirty } = useWizardDirtyGuard();

  const t = {
    ar: {
      header: "التسجيل السريع",
      subtitle: "سجّل طالباً جديداً أو قائماً، واختر شعبة، ثم تابع الدفع",
      step1: "بيانات الطالب",
      step2: "الشعبة والمقرر",
      step3: "الدفع",
      step4: "الاكتمال",
      errors: {
        data: "تعذر تحميل البيانات المرجعية",
        no_student: "يرجى اختيار طالب أو إنشاء طالب جديد",
        no_section: "يرجى اختيار شعبة",
        bad_amount: "يرجى إدخال مبلغ صحيح",
        bad_transaction: "يرجى إدخال رقم العملية للدفع الإلكتروني",
        create_failed: "فشل إنشاء الطالب",
        enroll_failed: "فشل تسجيل الطالب في الشعبة",
        pay_failed: "فشل تسجيل الدفعة",
      },
      studentLocked: "الطالب المختار",
      changeStudent: "تغيير الطالب",
      createStudentTitle: "إنشاء طالب جديد",
      createStudentSubtitle: "أدخل بيانات الطالب لإكمال التسجيل",
      selectStudent: "اختر الطالب",
      searchStudent: "ابحث عن طالب بالاسم أو الرقم...",
      orNewStudent: "+ إضافة طالب جديد",
      noResults: "لا توجد نتائج",
      studentCode: "رقم الطالب",
      fullName: "الاسم الكامل",
      email: "البريد الإلكتروني",
      nameInvalid: "الاسم يحتوي على أحرف غير صالحة",
      saveStudent: "حفظ الطالب",
      backToSearch: "رجوع للبحث",
      selectSection: "اختر الشعبة",
      discount: "الخصم (%)",
      selectEnrollment: "التسجيل",
      enterAmount: "أدخل المبلغ",
      paymentDate: "تاريخ الدفع",
      paymentMethod: "طريقة الدفع",
      cash: "نقداً",
      online: "تحويل بنكي",
      transactionNumber: "رقم العملية",
      enterTransactionNumber: "أدخل رقم العملية",
      agreedPrice: "السعر المتفق عليه",
      discountShort: "الخصم",
      netPrice: "صافي السعر",
      totalPaid: "المدفوع",
      remaining: "المتبقي",
      sar: "ريال",
      doneTitle: "اكتمل التسجيل",
      doneSubtitle: "تم إنشاء الطالب وتسجيله في الشعبة",
      student: "الطالب",
      courseLabel: "المقرر",
      receiptNumber: "رقم الإيصال",
      paidAmount: "المبلغ المدفوع",
      noPayment: "لم يتم تسجيل أي دفعة",
      viewReceipt: "عرض الإيصال",
      newRegistration: "تسجيل جديد",
      loading: "جاري التحميل...",
      instituteName: "Al-Drasat ERP",
    },
    en: {
      header: "Quick Registration",
      subtitle:
        "Register a new or existing student, pick a section, then record a payment",
      step1: "Student Details",
      step2: "Section & Course",
      step3: "Payment",
      step4: "Complete",
      errors: {
        data: "Failed to load reference data",
        no_student: "Please select or create a student first",
        no_section: "Please select a section",
        bad_amount: "Please enter a valid amount",
        bad_transaction: "Please enter the transaction number for bank transfer",
        create_failed: "Failed to create student",
        enroll_failed: "Failed to enroll the student",
        pay_failed: "Payment failed",
      },
      studentLocked: "Selected Student",
      changeStudent: "Change Student",
      createStudentTitle: "Create New Student",
      createStudentSubtitle: "Enter the student details to continue registration",
      selectStudent: "Select Student",
      searchStudent: "Search student by name or code...",
      orNewStudent: "+ Add new student",
      noResults: "No results",
      studentCode: "Student Code",
      fullName: "Full Name",
      email: "Email",
      nameInvalid: "Name contains invalid characters",
      saveStudent: "Save Student",
      backToSearch: "Back to Search",
      selectSection: "Select Section",
      discount: "Discount (%)",
      selectEnrollment: "Select Enrollment",
      enterAmount: "Enter Amount",
      paymentDate: "Payment Date",
      paymentMethod: "Payment Method",
      cash: "Cash",
      online: "Bank Transfer",
      transactionNumber: "Transaction No.",
      enterTransactionNumber: "Enter transaction number",
      agreedPrice: "Agreed Price",
      discountShort: "Discount",
      netPrice: "Net Price",
      totalPaid: "Total Paid",
      remaining: "Remaining",
      sar: "SAR",
      doneTitle: "Registration Complete",
      doneSubtitle: "The student has been created and enrolled",
      student: "Student",
      courseLabel: "Course",
      receiptNumber: "Receipt No.",
      paidAmount: "Paid Amount",
      noPayment: "No payment recorded",
      viewReceipt: "View Receipt",
      newRegistration: "New Registration",
      loading: "Loading...",
      instituteName: "Al-Drasat ERP",
    },
  }[locale === "en" ? "en" : "ar"];

  const [state, dispatch] = useReducer(
    wizard1Reducer,
    undefined,
    createInitialWizard1State
  );
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [serverDetail, setServerDetail] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledSectionIds, setEnrolledSectionIds] = useState<Set<string>>(
    new Set()
  );

  const markDirty = useCallback(() => setDirty(true), [setDirty]);
  const markClean = useCallback(() => {
    setDirty(false);
    setServerDetail("");
  }, [setDirty]);

  const detailOf = (err: unknown) =>
    (
      err as {
        response?: { data?: { detail?: string } };
      }
    )?.response?.data?.detail || "";

  const fetchLookups = useCallback(async () => {
    const [studentRes, sectionRes, courseRes] = await Promise.all([
      apiClient
        .get<{ items: Student[]; total: number }>(
          "/academic/students?limit=1000"
        )
        .catch(() => null),
      apiClient
        .get<{ items: CourseSection[]; total: number }>(
          "/academic/course-sections?limit=1000"
        )
        .catch(() => null),
      apiClient
        .get<{ items: Course[]; total: number }>(
          "/academic/courses?limit=1000"
        )
        .catch(() => null),
    ]);
    if (studentRes) setStudents(studentRes.data.items);
    if (sectionRes) setSections(sectionRes.data.items);
    if (courseRes) setCourses(courseRes.data.items);
    if (!studentRes || !sectionRes || !courseRes) {
      setDataError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

useEffect(() => {
    const student = state.student;
    if (!student) {
      setEnrolledSectionIds(new Set());
      return;
    }
    let cancelled = false;
    const fetchStudentEnrollments = async () => {
      try {
        const res = await apiClient.get<{
          items: { section_id: string }[];
          total: number;
        }>(
  `/academic/enrollments?student_id=${student.id}&limit=1000`
        );
        if (!cancelled) {
          setEnrolledSectionIds(
            new Set(res.data.items.map((e) => e.section_id))
          );
        }
      } catch {
        if (!cancelled) {
          setEnrolledSectionIds(new Set());
        }
      }
    };
    fetchStudentEnrollments();
    return () => {
      cancelled = true;
    };
  }, [state.student?.id]);

  const getSectionCourse = useCallback(
    (sectionId: string) => {
      const sect = sections.find((s) => s.id === sectionId);
      if (!sect) return sectionId;
      const course = courses.find((c) => c.id === sect.course_id);
      return course ? `${course.name} (${course.code})` : sectionId;
    },
    [sections, courses]
  );

  const errorText = (code: string) =>
    code ? t.errors[code as Exclude<ErrorCode, "">] || "" : "";

  const handleSelectStudent = (studentId: string) => {
    const found = students.find((s) => s.id === studentId);
    if (!found) return;
    markDirty();
    dispatch({
      type: "SELECT_STUDENT",
      student: {
        id: found.id,
        full_name: found.full_name,
        student_code: found.student_code,
        email: "",
      },
      isExisting: true,
    });
  };

  const handleCreateStudent = async () => {
    setServerDetail("");
    if (
      !state.createStudentForm.student_code.trim() ||
      !state.createStudentForm.full_name.trim()
    ) {
      dispatch({ type: "SET_ERROR", error: "no_student" });
      return;
    }
    if (!validateName(state.createStudentForm.full_name, locale as "ar" | "en")) {
      dispatch({ type: "SET_ERROR", error: "" });
      dispatch({ type: "SET_NAME_ERROR", nameError: t.nameInvalid });
      return;
    }
    dispatch({ type: "CREATE_STUDENT_START" });
    try {
      const payload: Record<string, unknown> = {
        student_code: sanitizeInput(state.createStudentForm.student_code),
        full_name: sanitizeInput(state.createStudentForm.full_name),
      };
      if (state.createStudentForm.email) {
        payload.email = sanitizeInput(state.createStudentForm.email);
      }
      const res = await apiClient.post<{
        id: string;
        full_name: string;
        student_code: string;
        email: string;
      }>("/academic/students", payload);
      markClean();
      dispatch({
        type: "CREATE_STUDENT_SUCCESS",
        student: {
          id: res.data.id,
          full_name: res.data.full_name,
          student_code: res.data.student_code,
          email: res.data.email || "",
        },
      });
    } catch (err) {
      setServerDetail(detailOf(err));
      dispatch({ type: "SET_ERROR", error: "create_failed" });
    }
  };

  const handleEnroll = async () => {
    setServerDetail("");
    if (!state.student) {
      dispatch({ type: "SET_ERROR", error: "no_student" });
      return;
    }
    if (!state.sectionId) {
      dispatch({ type: "SET_ERROR", error: "no_section" });
      return;
    }
    dispatch({ type: "ENROLL_START" });
    try {
      const payload: Record<string, unknown> = {
        student_id: state.student.id,
        section_id: state.sectionId,
      };
      if (state.discount) {
        payload.admin_discount = parseFloat(state.discount);
      }
      const res = await apiClient.post<{
        id: string;
        agreed_price: number | null;
        total_paid: number;
        balance_remaining: number | null;
      }>("/academic/enrollments", payload);
      const summaryRes = await apiClient.get<PaymentSummary>(
        `/lms/payments/summary/${res.data.id}`
      );
      markClean();
      dispatch({
        type: "ENROLL_SUCCESS",
        enrollment: {
          id: res.data.id,
          agreed_price: res.data.agreed_price,
          total_paid: res.data.total_paid,
          balance_remaining: res.data.balance_remaining,
        },
        summary: summaryRes.data,
      });
    } catch (err) {
      setServerDetail(detailOf(err));
      dispatch({ type: "SET_ERROR", error: "enroll_failed" });
    }
  };

  const handlePay = async () => {
    setServerDetail("");
    if (!state.enrollment) return;
    const amount = parseFloat(state.paymentForm.amount);
    if (!amount || amount <= 0) {
      dispatch({ type: "SET_ERROR", error: "bad_amount" });
      return;
    }
    if (
      state.paymentForm.payment_method === "online" &&
      !state.paymentForm.transaction_number.trim()
    ) {
      dispatch({ type: "SET_ERROR", error: "bad_transaction" });
      return;
    }
    dispatch({ type: "PAY_START" });
    try {
      const payload: Record<string, unknown> = {
        enrollment_id: state.enrollment.id,
        amount,
        payment_method: state.paymentForm.payment_method,
      };
      if (state.paymentForm.date) {
        payload.date = state.paymentForm.date;
      }
      if (state.paymentForm.payment_method === "online") {
        payload.transaction_number = state.paymentForm.transaction_number;
      }
      const res = await apiClient.post<{
        id: string;
        receipt_number: string;
        date: string;
        amount: number;
        payment_method: string;
        transaction_number: string | null;
      }>("/lms/payments", payload);
      const summaryRes = await apiClient.get<PaymentSummary>(
        `/lms/payments/summary/${state.enrollment.id}`
      );
      markClean();
      dispatch({
        type: "PAY_SUCCESS",
        payment: {
          id: res.data.id,
          receipt_number: res.data.receipt_number,
          date: res.data.date,
          amount: res.data.amount,
          payment_method: res.data.payment_method,
          transaction_number: res.data.transaction_number,
        },
        summary: summaryRes.data,
      });
    } catch (err) {
      setServerDetail(detailOf(err));
      dispatch({ type: "SET_ERROR", error: "pay_failed" });
    }
  };

  const handleNext = () => {
    if (state.step === 1) {
      if (!state.student) {
        dispatch({ type: "SET_ERROR", error: "no_student" });
        return;
      }
      dispatch({ type: "SET_STEP", step: 2 });
    } else if (state.step === 2) {
      handleEnroll();
    } else if (state.step === 3) {
      handlePay();
    }
  };

  const handleFinish = () => {
    markClean();
    dispatch({ type: "RESET" });
  };

  const steps: WizardStepperStep[] = [
    { label: t.step1 },
    { label: t.step2 },
    { label: t.step3, optional: true },
    { label: t.step4 },
  ];

  const enrollmentOption =
    state.enrollment && state.student
      ? {
          value: state.enrollment.id,
          label: `${state.student.full_name} - ${getSectionCourse(state.sectionId)}`,
        }
      : null;

  const availableSections = sections.filter(
    (s) =>
      s.status !== "completed" &&
      s.status !== "cancelled" &&
      !enrolledSectionIds.has(s.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  const receiptData: ReceiptData | null =
    state.payment && state.enrollment
      ? {
          id: state.payment.id,
          type: "payment",
          receipt_number: state.payment.receipt_number,
          date: state.payment.date,
          amount: state.payment.amount,
          student_name: state.student?.full_name,
          course_name: state.sectionId
            ? getSectionCourse(state.sectionId)
            : undefined,
          payment_method: state.payment.payment_method,
          transaction_number: state.payment.transaction_number,
          agreed_price: state.summary?.agreed_price ?? null,
          admin_discount: state.summary?.admin_discount ?? null,
          total_paid: state.summary?.total_paid ?? null,
          balance_remaining: state.summary?.balance_remaining ?? null,
        }
      : null;

  const stepError = serverDetail || errorText(state.error);

  const studentLabels: StudentStepLabels = {
    selectStudent: t.selectStudent,
    searchStudent: t.searchStudent,
    orNewStudent: t.orNewStudent,
    noResults: t.noResults,
    createStudentTitle: t.createStudentTitle,
    createStudentSubtitle: t.createStudentSubtitle,
    studentCode: t.studentCode,
    fullName: t.fullName,
    email: t.email,
    nameInvalid: t.nameInvalid,
    saveStudent: t.saveStudent,
    backToSearch: t.backToSearch,
    studentLockedHint: t.studentLocked,
    changeStudent: t.changeStudent,
  };

  const sectionLabels: SectionEnrollmentStepLabels = {
    selectStudent: t.studentLocked,
    selectSection: t.selectSection,
    discount: t.discount,
    sectionNotSelected: t.errors.no_section,
  };

  const paymentLabels: PaymentStepLabels = {
    selectEnrollment: t.selectEnrollment,
    enterAmount: t.enterAmount,
    paymentDate: t.paymentDate,
    paymentMethod: t.paymentMethod,
    cash: t.cash,
    online: t.online,
    transactionNumber: t.transactionNumber,
    enterTransactionNumber: t.enterTransactionNumber,
    agreedPrice: t.agreedPrice,
    discount: t.discountShort,
    netPrice: t.netPrice,
    totalPaid: t.totalPaid,
    remaining: t.remaining,
    sar: t.sar,
  };

  const completionLabels: CompletionScreenLabels = {
    doneTitle: t.doneTitle,
    doneSubtitle: t.doneSubtitle,
    student: t.student,
    studentCode: t.studentCode,
    course: t.courseLabel,
    agreedPrice: t.agreedPrice,
    discount: t.discountShort,
    netPrice: t.netPrice,
    totalPaid: t.totalPaid,
    remaining: t.remaining,
    receiptNumber: t.receiptNumber,
    paidAmount: t.paidAmount,
    noPayment: t.noPayment,
    viewReceipt: t.viewReceipt,
    newRegistration: t.newRegistration,
    sar: t.sar,
  };

  return (
    <div
      className="space-y-6 max-w-3xl mx-auto animate-fade-in"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t.header}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
      </div>

      {dataError && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          {t.errors.data}
        </div>
      )}

      <WizardStepper steps={steps} currentStep={state.step} locale={locale} />

      <div className="card p-6">
        {state.step === 1 && (
          <StudentStep
            mode={state.mode}
            onModeChange={(mode) => {
              markDirty();
              dispatch({ type: "SET_MODE", mode });
            }}
            students={students}
            selectedStudent={state.student}
            onSelectStudent={handleSelectStudent}
            createStudentForm={state.createStudentForm}
            onCreateStudentFormChange={(next) => {
              markDirty();
              dispatch({ type: "SET_CREATE_FORM", patch: next });
            }}
            nameError={state.nameError}
            onClearNameError={() =>
              dispatch({ type: "SET_NAME_ERROR", nameError: "" })
            }
            onCreateStudent={handleCreateStudent}
            onChangeSelectedStudent={() => {
              markDirty();
              dispatch({ type: "CLEAR_STUDENT" });
            }}
            submitting={state.submitting}
            error={state.step === 1 ? stepError : ""}
            labels={studentLabels}
          />
        )}

        {state.step === 2 && (
          <SectionEnrollmentStep
            studentName={state.student?.full_name || ""}
            sectionId={state.sectionId}
            onSectionChange={(sectionId) => {
              markDirty();
              dispatch({ type: "SET_SECTION", sectionId });
            }}
            sections={availableSections}
            getSectionLabel={getSectionCourse}
            showDiscount={user?.role?.name !== "secretary"}
            discount={state.discount}
            onDiscountChange={(discount) => {
              markDirty();
              dispatch({ type: "SET_DISCOUNT", discount });
            }}
            error={state.step === 2 ? stepError : ""}
            labels={sectionLabels}
          />
        )}

        {state.step === 3 && enrollmentOption && (
          <PaymentStep
            form={state.paymentForm}
            onFormChange={(patch) => {
              markDirty();
              dispatch({ type: "SET_PAYMENT_FORM", patch });
            }}
            summary={state.summary}
            enrollmentOptions={[enrollmentOption]}
            onEnrollmentSelect={() => {}}
            error={state.step === 3 ? stepError : ""}
            labels={paymentLabels}
          />
        )}

        {state.step === 4 && (
          <CompletionScreen
            student={{
              full_name: state.student?.full_name || "",
              student_code: state.student?.student_code || "",
            }}
            courseName={
              state.sectionId ? getSectionCourse(state.sectionId) : ""
            }
            summary={state.summary}
            payment={
              state.payment
                ? {
                    receipt_number: state.payment.receipt_number,
                    amount: state.payment.amount,
                  }
                : null
            }
            onViewReceipt={() =>
              dispatch({ type: "SET_RECEIPT_OPEN", open: true })
            }
            onNewRegistration={handleFinish}
            labels={completionLabels}
          />
        )}

        {state.step < 4 && (
          <WizardNavigationBar
            currentStep={state.step}
            totalSteps={4}
            onBack={() =>
              dispatch({
                type: "SET_STEP",
                step: Math.max(1, state.step - 1) as 1 | 2 | 3 | 4,
              })
            }
            onNext={handleNext}
            onSkip={() => dispatch({ type: "SKIP_PAYMENT" })}
            canNext={!state.submitting}
            showSkip={state.step === 3}
            submitting={state.submitting}
            locale={locale}
          />
        )}
      </div>

      <ReceiptModal
        open={state.receiptOpen}
        onClose={() => dispatch({ type: "SET_RECEIPT_OPEN", open: false })}
        data={receiptData}
        locale={locale}
        isRtl={isRtl}
        instituteName={t.instituteName}
        cashierName={user?.full_name || ""}
      />
    </div>
  );
}