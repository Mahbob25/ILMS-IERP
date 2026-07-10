"use client";

import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import Modal from "@/components/Modal";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeactivateSectionModalProps {
  open: boolean;
  onClose: () => void;
  sectionId: string;
  sectionName: string;
  hasPayments: boolean;
  isRtl?: boolean;
  locale?: string;
  onSuccess: () => void;
}

export default function DeactivateSectionModal({
  open,
  onClose,
  sectionId,
  sectionName,
  hasPayments,
  isRtl = false,
  locale = "ar",
  onSuccess,
}: DeactivateSectionModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = {
    ar: {
      title: "إلغاء تنشيط الشعبة",
      sectionLabel: "اسم الشعبة",
      contractStatus: "حالة العقد",
      paymentStatus: "حالة المدفوعات",
      reasonLabel: "سبب إلغاء التنشيط",
      reasonPlaceholder: "يرجى توضيح سبب إلغاء تنشيط هذه الشعبة...",
      confirm: "تأكيد إلغاء التنشيط",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      error: "حدث خطأ أثناء إلغاء التنشيط",
      success: "تم إلغاء تنشيط الشعبة بنجاح",
      paymentsExist: "توجد مدفوعات - يجب تقديم سبب",
    },
    en: {
      title: "Deactivate Section",
      sectionLabel: "Section Name",
      contractStatus: "Contract Status",
      paymentStatus: "Payment Status",
      reasonLabel: "Deactivation Reason",
      reasonPlaceholder: "Explain why this section is being deactivated...",
      confirm: "Confirm Deactivation",
      cancel: "Cancel",
      loading: "Loading...",
      error: "Failed to deactivate section",
      success: "Section deactivated successfully",
      paymentsExist: "Payments exist — reason is required",
    },
  }[locale === "en" ? "en" : "ar"];

  const handleConfirm = async () => {
    if (hasPayments && !reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (reason.trim()) body.reason = reason.trim();
      await apiClient.post(`/academic/course-sections/${sectionId}/deactivate`, body);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="lg" isRtl={isRtl}>
      <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle size={16} />
            <p className="text-sm font-semibold">{t.title}</p>
          </div>
          <div className="text-xs text-slate-600 space-y-1">
            <p><span className="font-medium">{t.sectionLabel}:</span> {sectionName}</p>
            <p><span className="font-medium">{t.paymentStatus}:</span> {hasPayments ? (isRtl ? "توجد مدفوعات" : "Has payments") : (isRtl ? "لا توجد مدفوعات" : "No payments")}</p>
          </div>
        </div>

        {hasPayments && (
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
            <p className="text-xs text-amber-600 mt-1">{t.paymentsExist}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleConfirm}
            disabled={loading || (hasPayments && !reason.trim())}
            className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
