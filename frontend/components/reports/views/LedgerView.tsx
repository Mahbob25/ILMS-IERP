"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { formatDisplayDate } from "@/lib/dates";
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, RotateCcw } from "lucide-react";

interface LedgerRow {
  id: string;
  amount: number;
  receipt_number: string;
  payment_method?: string;
  transaction_number?: string | null;
  student_name?: string;
  course_name?: string;
  created_by_name?: string;
  type?: string;
  recipient_name?: string | null;
  description?: string | null;
  disbursed_by_name?: string;
  disbursed_at?: string;
  notes?: string | null;
}

interface LedgerData {
  date: string;
  total_payments_in: number;
  total_expenses_out: number;
  total_refunds_out: number;
  net_cash_flow: number;
  status: string;
  payments: LedgerRow[];
  expenses: LedgerRow[];
  refunds: LedgerRow[];
}

const fmt = (val: number) => val.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function LedgerView({ date }: { date: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      paymentsIn: "المدفوعات الواردة",
      expensesOut: "المصروفات",
      refundsOut: "المردودات",
      netCash: "صافي التدفق النقدي",
      status: "الحالة",
      closed: "مقفل",
      pending: "غير مقفل",
      unlockRequested: "طلب فتح",
      partialNote: "اليوم غير مقفل — الأرقام جزئية وقد تتغير",
      receipt: "رقم الإيصال",
      method: "طريقة الدفع",
      transaction: "رقم العملية",
      student: "الطالب",
      course: "المقرر",
      amount: "المبلغ",
      by: "بواسطة",
      recipient: "المستفيد",
      description: "الوصف",
      notes: "ملاحظات",
      cash: "نقداً",
      online: "تحويل بنكي",
      error: "فشل تحميل دفتر اليومية",
      empty: "لا توجد معاملات",
      sar: "ريال",
    },
    en: {
      paymentsIn: "Payments In",
      expensesOut: "Expenses Out",
      refundsOut: "Refunds Out",
      netCash: "Net Cash Flow",
      status: "Status",
      closed: "Closed",
      pending: "Unclosed",
      unlockRequested: "Unlock Requested",
      partialNote: "Day is not daily-closed — figures are partial and may change",
      receipt: "Receipt No.",
      method: "Method",
      transaction: "Transaction No.",
      student: "Student",
      course: "Course",
      amount: "Amount",
      by: "By",
      recipient: "Recipient",
      description: "Description",
      notes: "Notes",
      cash: "Cash",
      online: "Bank Transfer",
      error: "Failed to load daily ledger",
      empty: "No transactions",
      sar: "YER",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<LedgerData>(`/reports/financial/ledger/${date}`);
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [date, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 h-28" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-10 text-center text-sm text-red-600">
        <AlertCircle size={24} className="mx-auto mb-2 opacity-60" />
        {error ?? t.error}
      </div>
    );
  }

  const isClosed = data.status === "closed";
  const statusLabel = isClosed ? t.closed : data.status === "unlock_requested" ? t.unlockRequested : t.pending;

  const cards = [
    { label: t.paymentsIn, value: data.total_payments_in, color: "text-emerald-600", icon: ArrowDownCircle },
    { label: t.expensesOut, value: data.total_expenses_out, color: "text-red-600", icon: ArrowUpCircle },
    { label: t.refundsOut, value: data.total_refunds_out, color: "text-amber-600", icon: RotateCcw },
    { label: t.netCash, value: data.net_cash_flow, color: "text-blue-600", icon: ArrowDownCircle },
  ];

  const methodLabel = (m?: string) => (m === "cash" ? t.cash : m === "online" ? t.online : m ?? "");

  const rowValue = (row: LedgerRow, key: string) => {
    switch (key) {
      case "amount": return <span className="font-semibold">{fmt(row.amount)}</span>;
      case "method": return methodLabel(row.payment_method);
      case "date": return row.disbursed_at ? formatDisplayDate(row.disbursed_at, locale) : "";
      default: return (row as unknown as Record<string, unknown>)[key] ?? "";
    }
  };

  const renderDetailTable = (
    title: string,
    rows: LedgerRow[],
    columns: { label: string; key: string }[]
  ) => (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} className="text-start py-2 font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 text-slate-700">{rowValue(row, c.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900">
          {formatDisplayDate(data.date, locale)}
        </h3>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
            isClosed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      {!isClosed && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle size={14} />
          <span>{t.partialNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <Icon size={16} className={card.color} />
              </div>
              <p className={`text-xl font-bold mt-2 ${card.color}`}>
                {fmt(card.value)} <span className="text-xs font-medium text-slate-400">{t.sar}</span>
              </p>
            </div>
          );
        })}
      </div>

      {renderDetailTable(t.paymentsIn, data.payments, [
        { label: t.receipt, key: "receipt_number" },
        { label: t.student, key: "student_name" },
        { label: t.course, key: "course_name" },
        { label: t.method, key: "method" },
        { label: t.amount, key: "amount" },
        { label: t.by, key: "created_by_name" },
      ])}

      {renderDetailTable(t.expensesOut, data.expenses, [
        { label: t.receipt, key: "receipt_number" },
        { label: t.recipient, key: "recipient_name" },
        { label: t.description, key: "description" },
        { label: t.amount, key: "amount" },
        { label: t.by, key: "created_by_name" },
      ])}

      {renderDetailTable(t.refundsOut, data.refunds, [
        { label: t.receipt, key: "receipt_number" },
        { label: t.student, key: "student_name" },
        { label: t.course, key: "course_name" },
        { label: t.amount, key: "amount" },
        { label: t.by, key: "disbursed_by_name" },
      ])}
    </div>
  );
}