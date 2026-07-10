"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Loader2, RefreshCw } from "lucide-react";

interface RefundRecord {
  id: string;
  pending_refund_id: string;
  receipt_number: string;
  amount: number;
  disbursed_at: string;
  disbursed_by: string;
  notes: string | null;
  student_name?: string;
  student_code?: string;
}

interface DisbursementHistoryProps {
  isRtl?: boolean;
  locale?: string;
  refreshKey?: number;
}

export default function DisbursementHistory({
  isRtl = false,
  locale = "ar",
  refreshKey = 0,
}: DisbursementHistoryProps) {
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const t = {
    ar: {
      title: "سجل الصرف",
      receiptNumber: "رقم الإيصال",
      student: "الطالب",
      amount: "المبلغ",
      dateTime: "التاريخ والوقت",
      notes: "ملاحظات",
      loading: "جاري التحميل...",
      noData: "لا توجد سجلات صرف",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      refresh: "تحديث",
    },
    en: {
      title: "Disbursement History",
      receiptNumber: "Receipt No.",
      student: "Student",
      amount: "Amount",
      dateTime: "Date/Time",
      notes: "Notes",
      loading: "Loading...",
      noData: "No disbursement records",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      refresh: "Refresh",
    },
  }[locale === "en" ? "en" : "ar"];

  const fetchHistory = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const res = await apiClient.get<{
        data: RefundRecord[];
        meta: { total: number; page: number; per_page: number };
      }>(`/lms/cashier/refunds?page=${pageNum}&per_page=${limit}`);
      setRefunds(res.data.data);
      setTotal(res.data.meta.total);
    } catch {
      setRefunds([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [refreshKey, page]);

  const formatDateTime = (d: string) => {
    try {
      return new Date(d).toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="card" dir={isRtl ? "rtl" : "ltr"}>
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{t.title}</h3>
        <button
          onClick={() => fetchHistory(page)}
          className="btn-icon"
          title={t.refresh}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="animate-spin text-slate-400" size={20} />
        </div>
      ) : refunds.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">{t.noData}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.receiptNumber}</th>
                  <th>{t.student}</th>
                  <th>{t.amount}</th>
                  <th>{t.dateTime}</th>
                  <th>{t.notes}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-mono text-xs font-medium">
                        {r.receipt_number}
                      </span>
                    </td>
                    <td className="text-slate-700">
                      {r.student_name || "—"}
                      {r.student_code && (
                        <span className="text-xs text-slate-400 ms-1">
                          ({r.student_code})
                        </span>
                      )}
                    </td>
                    <td className="font-semibold text-slate-900">
                      {r.amount.toFixed(2)}
                    </td>
                    <td className="text-xs text-slate-500">
                      {formatDateTime(r.disbursed_at)}
                    </td>
                    <td className="text-xs text-slate-500 max-w-[200px] truncate">
                      {r.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>
              {t.showing} {Math.min((page - 1) * limit + 1, total)}–
              {Math.min(page * limit, total)} {t.of} {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.prev}
              </button>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.next}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
