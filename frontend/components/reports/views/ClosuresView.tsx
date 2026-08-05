"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { formatDisplayDate } from "@/lib/dates";
import { AlertCircle } from "lucide-react";

interface ClosureRow {
  date: string;
  status: string;
  closed_by_manager_id?: string | null;
  total_payments_in: number;
  total_expenses_out: number;
  total_refunds_out: number;
  net_cash_flow: number;
}

const fmt = (val: number) => val.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ClosuresView({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      date: "التاريخ",
      status: "الحالة",
      paymentsIn: "المدفوعات",
      expensesOut: "المصروفات",
      refundsOut: "المردودات",
      netCash: "صافي التدفق",
      closed: "مقفل",
      pending: "غير مقفل",
      unlockRequested: "طلب فتح",
      error: "فشل تحميل سجل الإغلاقات",
      empty: "لا توجد إقفالات في هذه الفترة",
      sar: "ريال",
    },
    en: {
      date: "Date",
      status: "Status",
      paymentsIn: "Payments In",
      expensesOut: "Expenses Out",
      refundsOut: "Refunds Out",
      netCash: "Net Cash Flow",
      closed: "Closed",
      pending: "Unclosed",
      unlockRequested: "Unlock Requested",
      error: "Failed to load closures register",
      empty: "No closures in this period",
      sar: "YER",
    },
  }[locale === "en" ? "en" : "ar"];

  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiClient.get<ClosureRow[]>("/reports/financial/closures", { params });
      setRows(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="card p-5 h-40 animate-pulse" />;
  }

  if (error) {
    return (
      <div className="card p-10 text-center text-sm text-red-600">
        <AlertCircle size={24} className="mx-auto mb-2 opacity-60" />
        {error}
      </div>
    );
  }

  return (
    <div className="card p-5" dir={isRtl ? "rtl" : "ltr"}>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="text-start py-2 font-semibold">{t.date}</th>
                <th className="text-start py-2 font-semibold">{t.status}</th>
                <th className="text-end py-2 font-semibold">{t.paymentsIn}</th>
                <th className="text-end py-2 font-semibold">{t.expensesOut}</th>
                <th className="text-end py-2 font-semibold">{t.refundsOut}</th>
                <th className="text-end py-2 font-semibold">{t.netCash}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isClosed = row.status === "closed";
                const statusLabel =
                  isClosed ? t.closed : row.status === "unlock_requested" ? t.unlockRequested : t.pending;
                return (
                  <tr key={row.date} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{formatDisplayDate(row.date, locale)}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isClosed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="py-2 text-end text-emerald-600">{fmt(row.total_payments_in)}</td>
                    <td className="py-2 text-end text-red-600">{fmt(row.total_expenses_out)}</td>
                    <td className="py-2 text-end text-amber-600">{fmt(row.total_refunds_out)}</td>
                    <td className="py-2 text-end font-semibold text-slate-800">{fmt(row.net_cash_flow)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}