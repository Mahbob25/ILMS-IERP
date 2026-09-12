"use client";

import React from "react";
import { Receipt } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils/register";

interface Props {
  payments: {
    id: string;
    date: string;
    amount: number;
    receipt_number: string;
    payment_method: string;
    course_name: string;
  }[];
  locale: "ar" | "en";
  labels: {
    noReceipts: string;
    /** Shown when at least one enrollment has no derivable price. */
    unpriced: string;
  };
  hasUnpriced: boolean;
}

const METHOD_LABELS: Record<"ar" | "en", Record<string, string>> = {
  ar: { cash: "نقدًا", online: "إلكتروني" },
  en: { cash: "Cash", online: "Online" },
};

/**
 * Receipts behind the balance shown in the fee metric card — read-only by
 * design. There is no payment gateway, no invoice and no amount-due model
 * anywhere in the codebase, so there is nothing to pay here.
 */
export default function PaymentsList({ payments, locale, labels, hasUnpriced }: Props) {
  return (
    <div>
      {hasUnpriced && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">
          {labels.unpriced}
        </p>
      )}

      {payments.length === 0 ? (
        <p className="text-xs text-slate-400">{labels.noReceipts}</p>
      ) : (
        <ul className="space-y-2">
          {payments.slice(0, 4).map((payment) => (
            <li
              key={payment.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 transition-all duration-150 hover:bg-white hover:border-brand-100 hover:shadow-sm"
            >
              <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Receipt size={17} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {payment.course_name}
                  </p>
                  <span className="tabular text-sm font-semibold text-slate-900 shrink-0">
                    {formatMoney(payment.amount, locale)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="tabular inline-flex items-center rounded-full bg-white border border-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {formatDate(payment.date, locale)}
                  </span>
                  <span
                    className="font-mono inline-flex items-center rounded-full bg-white border border-slate-200/80 px-2 py-0.5 text-[10px] text-slate-400"
                    dir="ltr"
                  >
                    {payment.receipt_number}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-white border border-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {METHOD_LABELS[locale][payment.payment_method] || payment.payment_method}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
