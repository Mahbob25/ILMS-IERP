"use client";

import React, { useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Loader2, Search, RefreshCw } from "lucide-react";

interface PendingRefundItem {
  id: string;
  enrollment_id: string;
  section_cancellation_id: string;
  amount: number;
  status: "UNCLAIMED" | "CLAIMED" | "FORFEITED";
  created_at: string;
  expires_at: string | null;
  student_name?: string;
  student_code?: string;
  section_name?: string;
}

interface PendingRefundsTableProps {
  isRtl?: boolean;
  locale?: string;
  onDisburse: (refund: PendingRefundItem) => void;
  refreshKey?: number;
}

const statusColors: Record<string, string> = {
  UNCLAIMED: "bg-blue-50 text-blue-600 border-blue-200",
  CLAIMED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  FORFEITED: "bg-slate-100 text-slate-400 border-slate-200",
};

const statusLabels: Record<string, Record<string, string>> = {
  ar: { UNCLAIMED: "غير مطالب به", CLAIMED: "تم الصرف", FORFEITED: "منتهي" },
  en: { UNCLAIMED: "Unclaimed", CLAIMED: "Claimed", FORFEITED: "Forfeited" },
};

export default function PendingRefundsTable({
  isRtl = false,
  locale = "ar",
  onDisburse,
  refreshKey = 0,
}: PendingRefundsTableProps) {
  const [refunds, setRefunds] = useState<PendingRefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const t = {
    ar: {
      title: "المبالغ المستردة المعلقة",
      search: "بحث باسم الطالب أو الكود...",
      studentName: "اسم الطالب",
      studentCode: "الرمز",
      amount: "المبلغ",
      cancelDate: "تاريخ الإلغاء",
      section: "الشعبة",
      status: "الحالة",
      action: "الإجراء",
      disburse: "صرف",
      loading: "جاري التحميل...",
      noData: "لا توجد مبالغ مستردة معلقة",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      refresh: "تحديث",
    },
    en: {
      title: "Pending Refunds",
      search: "Search by student name or code...",
      studentName: "Student Name",
      studentCode: "Code",
      amount: "Amount",
      cancelDate: "Cancellation Date",
      section: "Section",
      status: "Status",
      action: "Action",
      disburse: "Disburse",
      loading: "Loading...",
      noData: "No pending refunds",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      refresh: "Refresh",
    },
  }[locale === "en" ? "en" : "ar"];

  const fetchRefunds = useCallback(
    async (searchTerm = "", pageNum = 1) => {
      setLoading(true);
      try {
        let url = `/lms/cashier/pending-refunds?page=${pageNum}&per_page=${limit}`;
        if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
        const res = await apiClient.get<{
          data: PendingRefundItem[];
          meta: { total: number; page: number; per_page: number };
        }>(url);
        setRefunds(res.data.data);
        setTotal(res.data.meta.total);
      } catch {
        setRefunds([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchRefunds(search, page);
  }, [refreshKey, page]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    fetchRefunds(value, 1);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(
        locale === "ar" ? "ar-SA" : "en-US",
        { year: "numeric", month: "short", day: "numeric" }
      );
    } catch {
      return d;
    }
  };

  return (
    <div className="card" dir={isRtl ? "rtl" : "ltr"}>
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{t.title}</h3>
        <button
          onClick={() => fetchRefunds(search, page)}
          className="btn-icon"
          title={t.refresh}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-slate-200">
        <div className="relative max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t.search}
            className="input-field ps-9 text-sm"
          />
          <Search
            size={14}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
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
                  <th>{t.studentName}</th>
                  <th>{t.studentCode}</th>
                  <th>{t.amount}</th>
                  <th>{t.cancelDate}</th>
                  <th>{t.section}</th>
                  <th>{t.status}</th>
                  <th>{t.action}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-slate-900">
                      {r.student_name || "—"}
                    </td>
                    <td className="text-slate-600">{r.student_code || "—"}</td>
                    <td className="font-semibold text-slate-900">
                      {r.amount.toFixed(2)}
                    </td>
                    <td className="text-xs text-slate-500">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="text-slate-600 text-xs">
                      {r.section_name || "—"}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          statusColors[r.status] || statusColors.FORFEITED
                        }`}
                      >
                        {(statusLabels[locale] || statusLabels.en)[r.status] || r.status}
                      </span>
                    </td>
                    <td>
                      {r.status === "UNCLAIMED" && (
                        <button
                          onClick={() => onDisburse(r)}
                          className="bg-brand-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-brand-600 transition-colors"
                        >
                          {t.disburse}
                        </button>
                      )}
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
                onClick={() => {
                  setPage((p) => p - 1);
                }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.prev}
              </button>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => {
                  setPage((p) => p + 1);
                }}
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
