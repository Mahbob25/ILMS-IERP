"use client";

import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import Modal from "@/components/Modal";
import { Loader2, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react";

interface BypassItem {
  student_name?: string;
  student_code?: string;
  amount?: number;
}

interface CompleteSectionModalProps {
  open: boolean;
  onClose: () => void;
  sectionId: string;
  bypassGradeCheck?: boolean;
  bypassPaymentCheck?: boolean;
  ungradedStudents?: BypassItem[];
  unpaidStudents?: BypassItem[];
  isRtl?: boolean;
  locale?: string;
  onSuccess: () => void;
}

export default function CompleteSectionModal({
  open,
  onClose,
  sectionId,
  bypassGradeCheck = false,
  bypassPaymentCheck = false,
  ungradedStudents = [],
  unpaidStudents = [],
  isRtl = false,
  locale = "ar",
  onSuccess,
}: CompleteSectionModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = {
    ar: {
      title: "إكمال الشعبة مع تجاوز",
      bypassWarning: "سيتم تجاوز الفحوصات التالية",
      gradeCheck: "فحص الدرجات",
      paymentCheck: "فحص الدفع",
      students: "طالب",
      reasonLabel: "سبب التجاوز",
      reasonPlaceholder: "يرجى توضيح سبب تجاوز فحوصات الإكمال...",
      confirm: "إكمال على أي حال",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      error: "فشل إكمال الشعبة",
      completeAnyway: "إكمال الشعبة مع تجاوز التحقق",
    },
    en: {
      title: "Complete Section with Override",
      bypassWarning: "The following checks will be bypassed",
      gradeCheck: "Grade Check",
      paymentCheck: "Payment Check",
      students: "students",
      reasonLabel: "Override Reason",
      reasonPlaceholder: "Explain why you are overriding the completion checks...",
      confirm: "Complete Anyway",
      cancel: "Cancel",
      loading: "Loading...",
      error: "Failed to complete section",
      completeAnyway: "Complete Section with Override",
    },
  }[locale === "en" ? "en" : "ar"];

  const hasBypassItems = bypassGradeCheck || bypassPaymentCheck;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/academic/course-sections/${sectionId}/complete`, {
        force: true,
        reason: reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="lg" isRtl={isRtl}>
      <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
        {hasBypassItems && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
              <AlertTriangle size={14} />
              {t.bypassWarning}
            </p>
            <div className="space-y-1.5">
              {bypassGradeCheck && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-100/50 rounded px-2 py-1.5">
                  <CheckCircle2 size={14} className="text-amber-500" />
                  <span className="font-medium">{t.gradeCheck}</span>
                  {ungradedStudents.length > 0 && (
                    <span className="ms-auto text-amber-600">
                      {ungradedStudents.length} {ungradedStudents.length === 1 && locale === "en" ? "student" : t.students}
                    </span>
                  )}
                </div>
              )}
              {bypassPaymentCheck && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-100/50 rounded px-2 py-1.5">
                  <DollarSign size={14} className="text-amber-500" />
                  <span className="font-medium">{t.paymentCheck}</span>
                  {unpaidStudents.length > 0 && (
                    <span className="ms-auto text-amber-600">
                      {unpaidStudents.length} {unpaidStudents.length === 1 && locale === "en" ? "student" : t.students}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {t.reasonLabel} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input-field"
            rows={3}
            maxLength={500}
            placeholder={t.reasonPlaceholder}
          />
          {reason.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">{reason.length}/500</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
            className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {t.confirm}
          </button>
          <button onClick={onClose} className="btn-secondary">
            {t.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
