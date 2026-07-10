"use client";

import React from "react";
import { AlertTriangle, Clock, Users, DollarSign, CheckCircle2 } from "lucide-react";

interface SectionWarningBannerProps {
  type: "overdue" | "approaching" | "ready";
  daysPastEnd?: number;
  endDate?: string;
  missingGradeCount?: number;
  totalStudentCount?: number;
  outstandingPaymentCount?: number;
  outstandingPaymentTotal?: number;
  isRtl?: boolean;
  locale?: string;
}

export default function SectionWarningBanner({
  type,
  daysPastEnd = 0,
  endDate,
  missingGradeCount = 0,
  totalStudentCount = 0,
  outstandingPaymentCount = 0,
  outstandingPaymentTotal = 0,
  isRtl = false,
  locale = "ar",
}: SectionWarningBannerProps) {
  const formatDate = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(
        locale === "ar" ? "ar-SA" : "en-US",
        { year: "numeric", month: "short", day: "numeric" }
      );
    } catch {
      return d;
    }
  };

  if (type === "overdue") {
    return (
      <div
        className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
          <AlertTriangle size={16} />
          <span>
            {isRtl
              ? `مضى ${daysPastEnd} يومًا على تاريخ النهاية`
              : `${daysPastEnd} days past end date (${endDate ? formatDate(endDate) : "—"})`}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-red-600">
          {missingGradeCount > 0 && (
            <span className="flex items-center gap-1">
              <Users size={12} />
              {isRtl
                ? `${missingGradeCount} طالب بدون درجات`
                : `${missingGradeCount} students ungraded`}
            </span>
          )}
          {outstandingPaymentCount > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign size={12} />
              {isRtl
                ? `${outstandingPaymentCount} طالب عليهم مدفوعات (${outstandingPaymentTotal.toFixed(2)})`
                : `${outstandingPaymentCount} students unpaid (${outstandingPaymentTotal.toFixed(2)})`}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (type === "approaching") {
    return (
      <div
        className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-1"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-2 text-yellow-700 font-semibold text-sm">
          <Clock size={16} />
          <span>
            {isRtl
              ? "يقترب موعد النهاية"
              : `Approaching end date (${endDate ? formatDate(endDate) : "—"})`}
          </span>
        </div>
        {missingGradeCount > 0 && (
          <p className="text-xs text-yellow-600 flex items-center gap-1">
            <Users size={12} />
            {isRtl
              ? `${missingGradeCount} طالب بحاجة للدرجات`
              : `${missingGradeCount} students need grades`}
          </p>
        )}
        {outstandingPaymentCount > 0 && (
          <p className="text-xs text-yellow-600 flex items-center gap-1">
            <DollarSign size={12} />
            {isRtl
              ? `${outstandingPaymentCount} طالب عليهم مدفوعات مستحقة (${outstandingPaymentTotal.toFixed(2)})`
              : `${outstandingPaymentCount} students with outstanding payments (${outstandingPaymentTotal.toFixed(2)})`}
          </p>
        )}
      </div>
    );
  }

  if (type === "ready") {
    return (
      <div
        className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
          <CheckCircle2 size={16} />
          <span>
            {isRtl ? "جاهز للإكمال" : "Ready for Completion"}
          </span>
        </div>
        <p className="text-xs text-emerald-600">
          {isRtl
            ? `${missingGradeCount}/${totalStudentCount} طالب مكتمل الدرجات`
            : `${missingGradeCount}/${totalStudentCount} students graded`}
        </p>
      </div>
    );
  }

  return null;
}
