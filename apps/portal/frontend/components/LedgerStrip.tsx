"use client";

import React from "react";
import { formatDate, formatMoney } from "@/lib/utils/register";

interface Props {
  totalNet: number;
  totalPaid: number;
  balance: number;
  /** True when at least one enrollment has no derivable price. */
  hasUnpriced: boolean;
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
    paid: string;
    outstanding: string;
    total: string;
    settled: string;
    unpriced: string;
    receipts: string;
    noReceipts: string;
  };
}

const METHOD_LABELS: Record<"ar" | "en", Record<string, string>> = {
  ar: { cash: "نقدًا", online: "إلكتروني" },
  en: { cash: "Cash", online: "Online" },
};

/**
 * Fees as a ledger line: how much of the total is settled, and the receipts
 * behind it. Read-only by design — there is no payment gateway, no invoice and
 * no amount-due model anywhere in the codebase, so there is nothing to pay here.
 */
export default function LedgerStrip({
  totalNet,
  totalPaid,
  balance,
  hasUnpriced,
  payments,
  locale,
  labels,
}: Props) {
  const paidPercent = totalNet > 0 ? Math.min(100, Math.round((totalPaid / totalNet) * 100)) : 0;

  return (
    <div className="space-y-4">
      {totalNet > 0 ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-500">
              {labels.paid}{" "}
              <span className="tabular font-semibold text-slate-900">
                {formatMoney(totalPaid, locale)}
              </span>
            </span>
            <span className="text-slate-500">
              {balance > 0 ? labels.outstanding : labels.settled}{" "}
              <span className="tabular font-semibold text-slate-900">
                {formatMoney(Math.max(0, balance), locale)}
              </span>
            </span>
          </div>
          {/* A block child starts at the inline start, so this fills from the
              right in Arabic with no direction-specific code. */}
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${paidPercent}%` }} />
          </div>
          <p className="text-[11px] text-slate-400 mt-2 tabular">
            {labels.total} {formatMoney(totalNet, locale)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-400">{labels.noReceipts}</p>
      )}

      {hasUnpriced && <p className="text-[11px] text-amber-700">{labels.unpriced}</p>}

      <div className="border-t border-slate-100 pt-3">
        <p className="eyebrow">{labels.receipts}</p>
        {payments.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">{labels.noReceipts}</p>
        ) : (
          <ul className="mt-1">
            {payments.slice(0, 3).map((payment) => (
              <li
                key={payment.id}
                className="py-2.5 border-b border-slate-100 last:border-b-0"
              >
                {/* Two lines on mobile — date + amount, then course + receipt.
                    One row would squeeze the course name to a few pixels. */}
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="tabular text-slate-500">
                    {formatDate(payment.date, locale)}
                  </span>
                  <span className="tabular font-semibold text-slate-900">
                    {formatMoney(payment.amount, locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="flex-1 min-w-0 text-[11px] text-slate-600 truncate">
                    {payment.course_name}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                      {payment.receipt_number}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {METHOD_LABELS[locale][payment.payment_method] || payment.payment_method}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
