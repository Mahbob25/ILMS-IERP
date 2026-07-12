"use client";

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import Modal from "@/components/Modal";
import { Loader2, AlertTriangle, DollarSign, Ban, FileText, Users, Info } from "lucide-react";

interface UnenrollPreview {
  enrollment_id: string;
  student_name: string;
  student_code: string;
  section_name: string;
  course_name: string;
  agreed_price: number | null;
  admin_discount: number | null;
  net_price: number | null;
  total_paid: number;
  remaining_balance: number | null;
  teacher_share_reversal_amount: number;
  teacher_wallet_balance: number;
  teacher_wallet_available_balance: number;
  teacher_name: string | null;
  has_attendance_records: boolean;
  has_grades: boolean;
  has_certificates: boolean;
  can_unenroll: boolean;
  warnings: string[];
}

interface UnenrollModalProps {
  open: boolean;
  onClose: () => void;
  enrollmentId: string;
  studentName: string;
  sectionName: string;
  isRtl?: boolean;
  locale?: string;
  onSuccess: () => void;
}

export default function UnenrollModal({
  open,
  onClose,
  enrollmentId,
  studentName,
  sectionName,
  isRtl = false,
  locale = "ar",
  onSuccess,
}: UnenrollModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<UnenrollPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundPolicy, setRefundPolicy] = useState<"authorize_refund" | "no_refund">("authorize_refund");
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [customRefund, setCustomRefund] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState("");

  const t = {
    ar: {
      title: "إلغاء تسجيل الطالب",
      step1Title: "معاينة تأثير الإلغاء",
      studentInfo: "معلومات الطالب",
      sectionInfo: "معلومات الشعبة",
      studentName: "اسم الطالب",
      studentCode: "الرمز",
      section: "الشعبة",
      course: "المقرر",
      teacher: "المدرس",
      agreedPrice: "السعر المتفق عليه",
      discount: "الخصم",
      netPrice: "السعر الصافي",
      totalPaid: "إجمالي المدفوع",
      remainingBalance: "الرصيد المتبقي",
      teacherReversal: "مبلغ استرداد المعلم",
      teacherWalletBalance: "رصيد محفظة المعلم",
      teacherWalletAvailable: "الرصيد المتاح للمعلم",
      attendWarning: "توجد سجلات حضور",
      gradesWarning: "توجد درجات نهائية",
      certWarning: "توجد شهادات",
      cantUnenroll: "لا يمكن إلغاء التسجيل",
      errors: {
        certificates: "تم إصدار شهادات لهذا التسجيل. يرجى إلغاء الشهادات أولاً.",
        completed: "لا يمكن إلغاء تسجيل طالب من شعبة مكتملة.",
        cancelled: "لا يمكن إلغاء تسجيل طالب من شعبة ملغاة.",
        deleted: "هذا التسجيل ملغي بالفعل.",
      },
      step2Title: "قرار استرداد المبلغ",
      authorizeRefund: "تفويض استرداد المبلغ",
      noRefund: "لا يوجد استرداد",
      refundFull: "استرداد كامل المبلغ",
      refundCustom: "مبلغ مخصص",
      refundAmountLabel: "قيمة الاسترداد",
      step3Title: "السبب والتأكيد",
      reasonLabel: "سبب الإلغاء",
      reasonPlaceholder: "يرجى توضيح سبب إلغاء تسجيل هذا الطالب...",
      notesLabel: "ملاحظات",
      notesPlaceholder: "ملاحظات إضافية (اختياري)...",
      forceLabel: "فرض الإلغاء رغم وجود درجات",
      forceHint: "سيتابع إلغاء التسجيل رغم وجود درجات تم إدخالها لهذا الطالب",
      forceReasonLabel: "سبب الفرض",
      forceReasonPlaceholder: "يرجى توضيح سبب فرض الإلغاء...",
      summary: "ملخص الإجراءات",
      unenrollAction: "إلغاء تسجيل الطالب",
      refundAction: "استرداد المبلغ",
      teacherReversalAction: "استرداد حصة المعلم",
      confirm: "تأكيد الإلغاء",
      cancel: "إلغاء",
      back: "رجوع",
      next: "التالي",
      loading: "جاري التحميل...",
      error: "حدث خطأ",
      refundSuccess: "سيتم إنشاء مستحقات استرداد للطالب",
      teacherShareLabel: "حصة المعلم",
    },
    en: {
      title: "Unenroll Student",
      step1Title: "Unenrollment Impact Preview",
      studentInfo: "Student Information",
      sectionInfo: "Section Information",
      studentName: "Student Name",
      studentCode: "Code",
      section: "Section",
      course: "Course",
      teacher: "Teacher",
      agreedPrice: "Agreed Price",
      discount: "Discount",
      netPrice: "Net Price",
      totalPaid: "Total Paid",
      remainingBalance: "Remaining Balance",
      teacherReversal: "Teacher Reversal Amount",
      teacherWalletBalance: "Teacher Wallet Balance",
      teacherWalletAvailable: "Available Balance",
      attendWarning: "Attendance records exist",
      gradesWarning: "Final grades exist",
      certWarning: "Certificates exist",
      cantUnenroll: "Cannot Unenroll",
      errors: {
        certificates: "Certificates have been issued for this enrollment. Please revoke certificates first.",
        completed: "Cannot unenroll from a completed section.",
        cancelled: "Cannot unenroll from a cancelled section.",
        deleted: "This enrollment is already deleted.",
      },
      step2Title: "Refund Decision",
      authorizeRefund: "Authorize Refund",
      noRefund: "No Refund",
      refundFull: "Full Refund",
      refundCustom: "Custom Amount",
      refundAmountLabel: "Refund Amount",
      step3Title: "Reason & Confirm",
      reasonLabel: "Unenrollment Reason",
      reasonPlaceholder: "Explain why this student is being unenrolled...",
      notesLabel: "Notes",
      notesPlaceholder: "Additional notes (optional)...",
      forceLabel: "Force unenrollment despite grades",
      forceHint: "Unenrollment will proceed even though grades exist for this student",
      forceReasonLabel: "Force Reason",
      forceReasonPlaceholder: "Explain why force unenrollment is needed...",
      summary: "Actions Summary",
      unenrollAction: "Unenroll Student",
      refundAction: "Refund Amount",
      teacherReversalAction: "Teacher Share Reversal",
      confirm: "Confirm Unenrollment",
      cancel: "Cancel",
      back: "Back",
      next: "Next",
      loading: "Loading...",
      error: "An error occurred",
      refundSuccess: "A refund liability will be created for the student",
      teacherShareLabel: "Teacher Share",
    },
  }[locale === "en" ? "en" : "ar"];

  useEffect(() => {
    if (open && enrollmentId) {
      setStep(1);
      setReason("");
      setNotes("");
      setForce(false);
      setForceReason("");
      setError(null);
      setPreview(null);
      setRefundPolicy("authorize_refund");
      setRefundAmount("");
      setCustomRefund(false);
      loadPreview();
    }
  }, [open, enrollmentId]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<UnenrollPreview>(
        `/academic/enrollments/${enrollmentId}/unenroll-preview`
      );
      setPreview(res.data);
      setRefundAmount(res.data.total_paid.toFixed(2));
    } catch (e: any) {
      setError(e?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    if (force && !forceReason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        reason: reason.trim(),
        refund_policy: refundPolicy,
        force,
      };
      if (refundPolicy === "authorize_refund" && customRefund && refundAmount) {
        payload.refund_amount = parseFloat(refundAmount);
      }
      if (force) {
        payload.force_reason = forceReason.trim();
      }
      if (notes.trim()) {
        payload.notes = notes.trim();
      }
      await apiClient.post(`/academic/enrollments/${enrollmentId}/unenroll`, payload);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
  };

  const getErrorText = (key: string) => {
    const errors = t.errors as Record<string, string>;
    return errors[key] || key;
  };

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="2xl" isRtl={isRtl}>
      {loading && !preview && step === 1 ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      ) : error && !preview ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs font-medium" dir={isRtl ? "rtl" : "ltr"}>
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s
                      ? "bg-brand-500 text-white"
                      : step > s
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step > s ? "✓" : s}
                </span>
                {s < 3 && <div className="flex-1 h-px bg-slate-200" />}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Impact Preview */}
          {step === 1 && preview && (
            <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
              {!preview.can_unenroll ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1">
                    <Ban size={16} /> {t.cantUnenroll}
                  </p>
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-red-600">{getErrorText(w)}</p>
                  ))}
                </div>
              ) : (
                <>
                  {/* Student Info */}
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Info size={12} /> {t.studentInfo}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">{t.studentName}:</span>
                        <span className="font-semibold text-slate-900 me-1"> {preview.student_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t.studentCode}:</span>
                        <span className="font-semibold text-slate-900 me-1"> {preview.student_code}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section Info */}
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">{t.sectionInfo}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">{t.section}:</span>
                        <span className="font-semibold text-slate-900 me-1"> {preview.section_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t.course}:</span>
                        <span className="font-semibold text-slate-900 me-1"> {preview.course_name}</span>
                      </div>
                      {preview.teacher_name && (
                        <div>
                          <span className="text-slate-500">{t.teacher}:</span>
                          <span className="font-semibold text-slate-900 me-1"> {preview.teacher_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Snapshot */}
                  <div className="text-sm font-semibold text-slate-800">{t.step1Title}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.agreedPrice}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {preview.agreed_price != null ? preview.agreed_price.toFixed(2) : "—"}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.discount}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {preview.admin_discount != null ? `${preview.admin_discount}%` : "—"}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.netPrice}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {preview.net_price != null ? preview.net_price.toFixed(2) : "—"}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.totalPaid}</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {preview.total_paid.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.remainingBalance}</p>
                      <p className={`text-lg font-bold ${preview.remaining_balance && preview.remaining_balance > 0 ? "text-amber-600" : "text-slate-900"}`}>
                        {preview.remaining_balance != null ? preview.remaining_balance.toFixed(2) : "—"}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.teacherShareLabel}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {preview.teacher_share_reversal_amount.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Teacher Wallet */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.teacherWalletBalance}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {preview.teacher_wallet_balance.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500">{t.teacherWalletAvailable}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {preview.teacher_wallet_available_balance.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {(preview.has_attendance_records || preview.has_grades || preview.has_certificates) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {isRtl ? "تحذيرات" : "Warnings"}
                      </p>
                      {preview.has_attendance_records && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Users size={12} /> {t.attendWarning}
                        </p>
                      )}
                      {preview.has_grades && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <FileText size={12} /> {t.gradesWarning}
                        </p>
                      )}
                      {preview.has_certificates && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Ban size={12} /> {t.certWarning}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Refund Decision */}
          {step === 2 && preview && (
            <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
              <p className="text-sm font-semibold text-slate-800">{t.step2Title}</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input
                    type="radio"
                    name="refundPolicy"
                    value="authorize_refund"
                    checked={refundPolicy === "authorize_refund"}
                    onChange={() => setRefundPolicy("authorize_refund")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{t.authorizeRefund}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <DollarSign size={12} /> {t.totalPaid}: {preview.total_paid.toFixed(2)}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      {t.refundSuccess}
                    </p>
                  </div>
                </label>

                {refundPolicy === "authorize_refund" && (
                  <div className="ms-6 space-y-3">
                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input
                        type="radio"
                        name="refundType"
                        checked={!customRefund}
                        onChange={() => { setCustomRefund(false); setRefundAmount(preview.total_paid.toFixed(2)); }}
                        className="mt-0.5"
                      />
                      <p className="text-sm text-slate-700">{t.refundFull} ({preview.total_paid.toFixed(2)})</p>
                    </label>
                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input
                        type="radio"
                        name="refundType"
                        checked={customRefund}
                        onChange={() => setCustomRefund(true)}
                        className="mt-0.5"
                      />
                      <p className="text-sm text-slate-700">{t.refundCustom}</p>
                    </label>
                    {customRefund && (
                      <input
                        type="number"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="input-field ms-6"
                        min={0}
                        max={preview.total_paid}
                        step={0.01}
                        placeholder={t.refundAmountLabel}
                      />
                    )}
                  </div>
                )}

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input
                    type="radio"
                    name="refundPolicy"
                    value="no_refund"
                    checked={refundPolicy === "no_refund"}
                    onChange={() => setRefundPolicy("no_refund")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.noRefund}</p>
                    <p className="text-xs text-slate-500">
                      {isRtl ? "لن يتم استرداد أي مبالغ للطالب" : "No refund will be issued to the student"}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Reason & Confirm */}
          {step === 3 && (
            <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
              <p className="text-sm font-semibold text-slate-800">{t.step3Title}</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.reasonLabel} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder={t.reasonPlaceholder}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.notesLabel}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-field"
                  rows={2}
                  placeholder={t.notesPlaceholder}
                />
              </div>

              {/* Force override */}
              {preview?.has_grades && (
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 border border-amber-200 rounded-lg cursor-pointer has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{t.forceLabel}</p>
                      <p className="text-xs text-slate-500">{t.forceHint}</p>
                    </div>
                  </label>
                  {force && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {t.forceReasonLabel} <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={forceReason}
                        onChange={(e) => setForceReason(e.target.value)}
                        className="input-field"
                        rows={2}
                        placeholder={t.forceReasonPlaceholder}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-semibold text-slate-800">{t.summary}</p>
                <p className="text-slate-600">{t.unenrollAction}: {studentName} — {sectionName}</p>
                <p className="text-slate-600">
                  {t.refundAction}: {refundPolicy === "authorize_refund"
                    ? `${t.authorizeRefund} (${refundAmount || "—"})`
                    : t.noRefund}
                </p>
                {preview && preview.teacher_share_reversal_amount > 0 && (
                  <p className="text-slate-600">
                    {t.teacherReversalAction}: {preview.teacher_share_reversal_amount.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3 pt-2" dir={isRtl ? "rtl" : "ltr"}>
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="btn-secondary" disabled={loading}>
                {t.back}
              </button>
            )}
            <div className="flex-1" />
            {step < 3 && !(step === 1 && preview && !preview.can_unenroll) ? (
              <button
                onClick={() => setStep(step + 1)}
                className="btn-primary"
                disabled={loading || (!preview && step === 1)}
              >
                {t.next}
              </button>
            ) : step === 3 ? (
              <button
                onClick={handleConfirm}
                className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !reason.trim() || (force && !forceReason.trim())}
              >
                {loading && <Loader2 size={14} className="animate-spin inline me-1" />}
                {t.confirm}
              </button>
            ) : null}
            {(step === 1) && (
              <button onClick={onClose} className="btn-secondary">
                {t.cancel}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
