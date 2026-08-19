"use client";

import React from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";

interface GuidedConfirmSectionProps {
  reason: string;
  onReasonChange: (value: string) => void;
  isRtl?: boolean;
  locale?: string;
  closureStatus?: "closed" | "pending" | "unlock_requested" | null;
  children?: React.ReactNode;
}

export default function GuidedConfirmSection({
  reason,
  onReasonChange,
  isRtl = false,
  locale = "ar",
  closureStatus,
  children,
}: GuidedConfirmSectionProps) {
  const t = {
    ar: {
      reasonLabel: "سبب الإجراء",
      reasonPlaceholder: "يرجى توضيح سبب هذا الإجراء...",
      closureBlocked: "هذا التاريخ مغلق مالياً — يجب فتح اليوم للمتابعة",
      closureUnlockRequested: "تم طلب فتح هذا اليوم — بانتظار موافقة المدير",
    },
    en: {
      reasonLabel: "Reason",
      reasonPlaceholder: "Please explain why this action is needed...",
      closureBlocked: "This date is closed — the day must be unlocked to proceed",
      closureUnlockRequested: "Unlock requested for this day — awaiting manager approval",
    },
  }[locale === "en" ? "en" : "ar"];

  const isDateBlocked =
    closureStatus === "closed" || closureStatus === "unlock_requested";

  return (
    <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
      {children}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {t.reasonLabel} <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          className="input-field"
          rows={3}
          placeholder={t.reasonPlaceholder}
        />
      </div>

      {isDateBlocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          {closureStatus === "unlock_requested" ? (
            <CalendarClock size={14} className="text-amber-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          )}
          <p className="text-xs text-amber-700">
            {closureStatus === "unlock_requested"
              ? t.closureUnlockRequested
              : t.closureBlocked}
          </p>
        </div>
      )}
    </div>
  );
}