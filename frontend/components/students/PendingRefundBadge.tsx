"use client";

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { DollarSign, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

interface PendingRefund {
  id: string;
  enrollment_id: string;
  section_cancellation_id: string;
  amount: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  section_name?: string;
  cancelled_at?: string;
}

interface PendingRefundBadgeProps {
  studentId: string;
  isRtl?: boolean;
  locale?: string;
}

export default function PendingRefundBadge({
  studentId,
  isRtl = false,
  locale = "ar",
}: PendingRefundBadgeProps) {
  const [refunds, setRefunds] = useState<PendingRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const t = {
    ar: {
      title: "مبلغ مسترد غير مطالب به",
      description: (amount: number, section: string) =>
        `هذا الطالب لديه مبلغ مسترد بقيمة ${amount.toFixed(2)} من الشعبة الملغاة ${section}`,
      sectionCancelled: "الشعبة الملغاة",
      amount: "المبلغ",
      cancelledAt: "تاريخ الإلغاء",
      expiresAt: "تاريخ الانتهاء",
      noRefunds: "لا توجد مبالغ مستردة",
    },
    en: {
      title: "Unclaimed Refund",
      description: (amount: number, section: string) =>
        `This student has an unclaimed refund of ${amount.toFixed(2)} from cancelled section ${section}`,
      sectionCancelled: "Cancelled Section",
      amount: "Amount",
      cancelledAt: "Cancelled At",
      expiresAt: "Expires At",
      noRefunds: "No pending refunds",
    },
  }[locale === "en" ? "en" : "ar"];

  useEffect(() => {
    if (!studentId) return;
    const fetchRefunds = async () => {
      try {
        const res = await apiClient.get<PendingRefund[]>(
          `/lms/students/${studentId}/pending-refunds`
        );
        const unclaimed = res.data.filter((r) => r.status === "UNCLAIMED");
        setRefunds(unclaimed);
      } catch {
        setRefunds([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRefunds();
  }, [studentId]);

  if (loading || refunds.length === 0) return null;

  const totalAmount = refunds.reduce((sum, r) => sum + r.amount, 0);
  const primary = refunds[0];

  return (
    <div
      className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-start"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <DollarSign size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">{t.title}</p>
            <p className="text-xs text-amber-600">
              {t.description(totalAmount, primary.section_name || "")}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-amber-400" />
        ) : (
          <ChevronDown size={16} className="text-amber-400" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {refunds.map((refund) => (
            <div
              key={refund.id}
              className="bg-white border border-amber-100 rounded-lg p-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {t.sectionCancelled}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {refund.section_name || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t.amount}</span>
                <span className="text-sm font-bold text-amber-700">
                  {refund.amount.toFixed(2)}
                </span>
              </div>
              {refund.cancelled_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {t.cancelledAt}
                  </span>
                  <span className="text-xs text-slate-600">
                    {new Date(refund.cancelled_at).toLocaleDateString(
                      locale === "ar" ? "ar-SA" : "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }
                    )}
                  </span>
                </div>
              )}
              {refund.expires_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {t.expiresAt}
                  </span>
                  <span className="text-xs text-amber-600">
                    {new Date(refund.expires_at).toLocaleDateString(
                      locale === "ar" ? "ar-SA" : "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }
                    )}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
