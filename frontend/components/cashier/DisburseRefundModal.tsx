"use client";

import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import { sanitizeInput } from "@/lib/utils/input";
import Modal from "@/components/Modal";
import { Loader2, DollarSign, User } from "lucide-react";

interface DisburseRefundItem {
  id: string;
  enrollment_id: string;
  section_cancellation_id: string;
  amount: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  student_name?: string;
  student_code?: string;
  section_name?: string;
}

interface DisburseRefundModalProps {
  open: boolean;
  onClose: () => void;
  refund: DisburseRefundItem | null;
  cancellationDate?: string;
  cancellationReference?: string;
  isRtl?: boolean;
  locale?: string;
  currency?: string;
  onSuccess: (receiptNumber: string, refundId: string) => void;
}

export default function DisburseRefundModal({
  open,
  onClose,
  refund,
  cancellationDate,
  cancellationReference,
  isRtl = false,
  locale = "ar",
  currency = "YER",
  onSuccess,
}: DisburseRefundModalProps) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = {
    ar: {
      title: "صرف المبلغ المسترد",
      studentInfo: "معلومات الطالب",
      name: "الاسم",
      code: "الكود",
      amount: "المبلغ",
      cancelRef: "مرجع الإلغاء",
      cancelDate: "تاريخ الإلغاء",
      notes: "ملاحظات",
      notesPlaceholder: "ملاحظات اختيارية...",
      confirmLabel: (amount: number, name: string) =>
        `صرف ${amount.toFixed(2)} ${currency} إلى ${name}`,
      cancel: "إلغاء",
      error: "فشل عملية الصرف",
      success: "تم الصرف بنجاح",
    },
    en: {
      title: "Disburse Refund",
      studentInfo: "Student Information",
      name: "Name",
      code: "Code",
      amount: "Amount",
      cancelRef: "Cancellation Reference",
      cancelDate: "Cancellation Date",
      notes: "Notes",
      notesPlaceholder: "Optional notes...",
      confirmLabel: (amount: number, name: string) =>
        `Disburse ${amount.toFixed(2)} ${currency} to ${name}`,
      cancel: "Cancel",
      error: "Disbursement failed",
      success: "Disbursement successful",
    },
  }[locale === "en" ? "en" : "ar"];

  const handleConfirm = async () => {
    if (!refund) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (notes.trim()) body.notes = sanitizeInput(notes.trim());
      const res = await apiClient.post<{
        success: boolean;
        receipt_number: string;
        refund_id: string;
      }>(`/lms/cashier/pending-refunds/${refund.id}/disburse`, body);
      onSuccess(res.data.receipt_number, res.data.refund_id);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || t.error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(
        locale === "ar" ? "ar-SA" : "en-US",
        { year: "numeric", month: "short", day: "numeric" }
      );
    } catch {
      return d;
    }
  };

  if (!refund) return null;

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="lg" isRtl={isRtl}>
      <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
        {/* Student Info */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <User size={12} /> {t.studentInfo}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-500">{t.name}: </span>
              <span className="font-semibold text-slate-900">
                {refund.student_name || "—"}
              </span>
            </div>
            <div>
              <span className="text-slate-500">{t.code}: </span>
              <span className="font-semibold text-slate-900">
                {refund.student_code || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
          <p className="text-xs text-emerald-600 mb-1">{t.amount}</p>
          <p className="text-2xl font-bold text-emerald-700">
            {refund.amount.toFixed(2)} {currency}
          </p>
        </div>

        {/* Cancellation Details */}
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          {cancellationReference && (
            <div>
              <span className="text-slate-400">{t.cancelRef}: </span>
              <span className="font-medium">{cancellationReference}</span>
            </div>
          )}
          <div>
            <span className="text-slate-400">{t.cancelDate}: </span>
            <span className="font-medium">
              {formatDate(refund.created_at)}
            </span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {t.notes}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field"
            rows={2}
            placeholder={t.notesPlaceholder}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            <DollarSign size={14} />
            {typeof t.confirmLabel === "function"
              ? t.confirmLabel(refund.amount, refund.student_name || "")
              : t.confirmLabel}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            {t.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
