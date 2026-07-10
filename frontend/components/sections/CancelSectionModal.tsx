"use client";

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import Modal from "@/components/Modal";
import { Loader2, AlertTriangle, DollarSign, Users, Ban, FileText } from "lucide-react";

interface CancelPreview {
  section_id: string;
  teacher_reversal_amount: number;
  enrolled_count: number;
  payments_collected: number;
  has_attendance_records: boolean;
  has_final_grades: boolean;
  has_certificates: boolean;
  warnings: string[];
}

interface CancelSectionModalProps {
  open: boolean;
  onClose: () => void;
  sectionId: string;
  sectionName: string;
  isRtl?: boolean;
  locale?: string;
  onSuccess: () => void;
}

export default function CancelSectionModal({
  open,
  onClose,
  sectionId,
  sectionName,
  isRtl = false,
  locale = "ar",
  onSuccess,
}: CancelSectionModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundPolicy, setRefundPolicy] = useState<"authorize_refunds" | "no_refund">("authorize_refunds");
  const [reason, setReason] = useState("");

  const t = {
    ar: {
      title: "إلغاء الشعبة",
      step1Title: "معاينة تأثير الإلغاء",
      teacherReversal: "مبلغ استرداد المعلم",
      enrolledCount: "عدد الطلاب المسجلين",
      paymentsCollected: "المدفوعات المحصلة",
      attendWarning: "توجد سجلات حضور",
      gradesWarning: "توجد درجات نهائية",
      certWarning: "توجد شهادات",
      step2Title: "قرار استرداد المبالغ",
      authorizeRefunds: "تفويض استرداد المبالغ",
      noRefund: "لا يوجد استرداد",
      estimatedRefund: "قيمة الاسترداد المقدرة",
      step3Title: "السبب والتأكيد",
      reasonLabel: "سبب الإلغاء",
      reasonPlaceholder: "يرجى توضيح سبب إلغاء هذه الشعبة...",
      summary: "ملخص الإجراءات",
      cancelAction: "إلغاء الشعبة",
      refundAction: "تفويض استرداد المبالغ",
      confirm: "تأكيد الإلغاء",
      cancel: "إلغاء",
      back: "رجوع",
      next: "التالي",
      loading: "جاري التحميل...",
      error: "حدث خطأ",
    },
    en: {
      title: "Cancel Section",
      step1Title: "Cancellation Impact Preview",
      teacherReversal: "Teacher Reversal Amount",
      enrolledCount: "Enrolled Students",
      paymentsCollected: "Payments Collected",
      attendWarning: "Attendance records exist",
      gradesWarning: "Final grades exist",
      certWarning: "Certificates exist",
      step2Title: "Refund Decision",
      authorizeRefunds: "Authorize Refunds",
      noRefund: "No Refund",
      estimatedRefund: "Estimated Refund Amount",
      step3Title: "Reason & Confirm",
      reasonLabel: "Cancellation Reason",
      reasonPlaceholder: "Explain why this section is being cancelled...",
      summary: "Actions Summary",
      cancelAction: "Cancel Section",
      refundAction: "Authorize Refunds",
      confirm: "Confirm Cancellation",
      cancel: "Cancel",
      back: "Back",
      next: "Next",
      loading: "Loading...",
      error: "An error occurred",
    },
  }[locale === "en" ? "en" : "ar"];

  useEffect(() => {
    if (open && sectionId) {
      setStep(1);
      setReason("");
      setRefundPolicy("authorize_refunds");
      setError(null);
      setPreview(null);
      loadPreview();
    }
  }, [open, sectionId]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CancelPreview>(
        `/academic/course-sections/${sectionId}/cancel-preview`
      );
      setPreview(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/academic/course-sections/${sectionId}/cancel`, {
        reason: reason.trim(),
        refund_policy: refundPolicy,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
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
              <p className="text-sm font-semibold text-slate-800">{t.step1Title}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">{t.teacherReversal}</p>
                  <p className="text-lg font-bold text-slate-900">
                    {preview.teacher_reversal_amount.toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">{t.enrolledCount}</p>
                  <p className="text-lg font-bold text-slate-900">{preview.enrolled_count}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">{t.paymentsCollected}</p>
                  <p className="text-lg font-bold text-slate-900">
                    {preview.payments_collected.toFixed(2)}
                  </p>
                </div>
              </div>
              {(preview.has_attendance_records || preview.has_final_grades || preview.has_certificates) && (
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
                  {preview.has_final_grades && (
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
              {preview.warnings.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-red-600">{w}</p>
                  ))}
                </div>
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
                    value="authorize_refunds"
                    checked={refundPolicy === "authorize_refunds"}
                    onChange={() => setRefundPolicy("authorize_refunds")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.authorizeRefunds}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <DollarSign size={12} /> {t.estimatedRefund}: {preview.payments_collected.toFixed(2)}
                    </p>
                  </div>
                </label>
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
                      {isRtl ? "لن يتم استرداد أي مبالغ" : "No refunds will be issued"}
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
                  rows={4}
                  placeholder={t.reasonPlaceholder}
                />
              </div>
              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-semibold text-slate-800">{t.summary}</p>
                <p className="text-slate-600">{t.cancelAction}: {sectionName}</p>
                <p className="text-slate-600">
                  {t.refundAction}: {refundPolicy === "authorize_refunds" ? t.authorizeRefunds : t.noRefund}
                </p>
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
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)} className="btn-primary" disabled={loading || (!preview && step === 1)}>
                {t.next}
              </button>
            ) : (
              <button onClick={handleConfirm} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors" disabled={loading || !reason.trim()}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {t.confirm}
              </button>
            )}
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
