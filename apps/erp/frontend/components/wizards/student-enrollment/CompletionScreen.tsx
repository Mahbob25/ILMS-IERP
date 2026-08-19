"use client";

import React, { useEffect } from "react";
import { CheckCircle2, Receipt, RotateCcw } from "lucide-react";

export interface CompletionScreenLabels {
  doneTitle: string;
  doneSubtitle: string;
  student: string;
  studentCode: string;
  course: string;
  agreedPrice: string;
  discount: string;
  netPrice: string;
  totalPaid: string;
  remaining: string;
  receiptNumber: string;
  paidAmount: string;
  noPayment: string;
  viewReceipt: string;
  newRegistration: string;
  sar: string;
}

interface CompletionScreenProps {
  student: { full_name: string; student_code: string };
  courseName: string;
  summary: {
    agreed_price: number | null;
    admin_discount: number | null;
    net_price: number | null;
    total_paid: number;
    balance_remaining: number | null;
  } | null;
  payment: { receipt_number: string; amount: number } | null;
  onViewReceipt: () => void;
  onNewRegistration: () => void;
  labels: CompletionScreenLabels;
}

export default function CompletionScreen({
  student,
  courseName,
  summary,
  payment,
  onViewReceipt,
  onNewRegistration,
  labels,
}: CompletionScreenProps) {
  const fmt = (v: number | null | undefined) =>
    v != null ? `${v.toFixed(2)} ${labels.sar}` : "—";

  // Optional telemetry: track how many times this wizard successfully completes.
  // Non-blocking, client-only localStorage counter for future dashboard stats.
  useEffect(() => {
    try {
      const stored = parseInt(
        localStorage.getItem("wizard1Completions") || "0",
        10
      );
      localStorage.setItem(
        "wizard1Completions",
        String(isNaN(stored) ? 1 : stored + 1)
      );
    } catch {}
  }, []);

  return (
    <div className="animate-fade-in text-center">
      <CheckCircle2
        size={56}
        className="mx-auto text-emerald-500 mb-3"
        strokeWidth={1.5}
      />
      <h3 className="text-lg font-bold text-slate-900">{labels.doneTitle}</h3>
      <p className="text-sm text-slate-500 mt-1">{labels.doneSubtitle}</p>

      <div className="mt-6 mx-auto max-w-md text-start">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 rounded-xl p-4">
          <span className="text-slate-500">{labels.student}</span>
          <span className="font-medium text-slate-900 text-end truncate">
            {student.full_name}
          </span>
          <span className="text-slate-500">{labels.studentCode}</span>
          <span className="font-medium text-slate-900 text-end">
            {student.student_code}
          </span>
          <span className="text-slate-500">{labels.course}</span>
          <span className="font-medium text-slate-900 text-end truncate">
            {courseName}
          </span>
          <span className="text-slate-500">{labels.agreedPrice}</span>
          <span className="font-medium text-slate-900 text-end">
            {fmt(summary?.agreed_price)}
          </span>
          <span className="text-slate-500">{labels.discount}</span>
          <span className="font-medium text-slate-900 text-end">
            {summary?.admin_discount != null
              ? `${summary.admin_discount}%`
              : "—"}
          </span>
          <span className="text-slate-500">{labels.netPrice}</span>
          <span className="font-medium text-slate-900 text-end">
            {fmt(summary?.net_price)}
          </span>
          <span className="text-slate-500">{labels.totalPaid}</span>
          <span className="font-medium text-slate-900 text-end">
            {fmt(summary?.total_paid)}
          </span>
          <span className="text-slate-500">{labels.remaining}</span>
          <span
            className={`font-medium text-end ${
              (summary?.balance_remaining ?? 0) > 0
                ? "text-amber-600"
                : "text-emerald-600"
            }`}
          >
            {fmt(summary?.balance_remaining)}
          </span>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-start">
          {payment ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">{labels.receiptNumber}</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {payment.receipt_number}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-slate-600">{labels.paidAmount}</span>
                <span className="font-semibold text-slate-900">
                  {payment.amount.toFixed(2)} {labels.sar}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{labels.noPayment}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {payment && (
          <button
            type="button"
            onClick={onViewReceipt}
            className="btn-primary flex items-center gap-2"
          >
            <Receipt size={15} />
            {labels.viewReceipt}
          </button>
        )}
        <button
          type="button"
          onClick={onNewRegistration}
          className="btn-secondary flex items-center gap-2"
        >
          <RotateCcw size={15} />
          {labels.newRegistration}
        </button>
      </div>
    </div>
  );
}