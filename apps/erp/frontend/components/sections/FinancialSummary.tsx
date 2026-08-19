"use client";

import React, { useMemo } from "react";

interface StudentSummary {
  id: string;
  student_name: string;
  agreed_price: number | null;
  admin_discount: number | null;
  total_paid: number;
  balance_remaining: number | null;
}

interface FinancialSummaryProps {
  students: StudentSummary[];
  sectionPrice: number | null;
  t: any;
  isRtl: boolean;
}

export default function FinancialSummary({
  students,
  sectionPrice,
  t,
  isRtl,
}: FinancialSummaryProps) {
  const summary = useMemo(() => {
    const fullAmount = students.reduce((sum, s) => {
      const price = s.agreed_price ?? sectionPrice ?? 0;
      const discount = s.admin_discount ?? 0;
      return sum + price - (price * discount) / 100;
    }, 0);
    const totalPaid = students.reduce((sum, s) => sum + (s.total_paid || 0), 0);
    const remaining = students.reduce((sum, s) => sum + (s.balance_remaining ?? 0), 0);
    const percentage = fullAmount > 0 ? (totalPaid / fullAmount) * 100 : 0;
    return { fullAmount, totalPaid, remaining, percentage };
  }, [students, sectionPrice]);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-3">
        {t.financialSummary}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">{t.sectionFullAmount}</p>
          <p className="text-lg font-bold text-slate-900">
            {summary.fullAmount.toFixed(2)} {t.sar}
          </p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3">
          <p className="text-xs text-emerald-600 mb-1">{t.totalPaidSummary}</p>
          <p className="text-lg font-bold text-emerald-700">
            {summary.totalPaid.toFixed(2)} {t.sar}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <p className="text-xs text-amber-600 mb-1">{t.remaining}</p>
          <p
            className={`text-lg font-bold ${
              summary.remaining > 0 ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {summary.remaining.toFixed(2)} {t.sar}
          </p>
        </div>
      </div>
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>{summary.totalPaid.toFixed(2)} {t.sar}</span>
          <span>{summary.fullAmount.toFixed(2)} {t.sar}</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              summary.percentage >= 100 ? "bg-emerald-500" : summary.percentage > 0 ? "bg-amber-500" : "bg-slate-300"
            }`}
            style={{
              [isRtl ? "marginRight" : "marginLeft"]: 0,
              width: `${Math.min(summary.percentage, 100)}%`,
              marginInlineStart: 0,
            }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {summary.percentage.toFixed(1)}% {t.of} {summary.fullAmount.toFixed(2)} {t.sar}
        </p>
      </div>
      <details className="group">
        <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800 select-none">
          {isRtl ? "تفاصيل الأسعار المتفق عليها لكل طالب" : "Per-Student Agreed Prices"}
        </summary>
        <div className="mt-2 space-y-1">
          {students.map((enr) => (
            <div
              key={enr.id}
              className="flex items-center justify-between text-xs text-slate-600 py-1 px-2 rounded hover:bg-slate-50"
            >
              <span className="truncate">{enr.student_name}</span>
              <span className="font-medium whitespace-nowrap ms-2">
                {enr.agreed_price != null ? `${enr.agreed_price.toFixed(2)} ${t.sar}` : "—"}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
