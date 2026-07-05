"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Loader2, RefreshCw, Lock, Unlock, Eye } from "lucide-react";

interface DailyClosure {
  date: string;
  status: string;
  closed_by_manager_id: string | null;
  total_payments_in: number;
  total_expenses_out: number;
  net_cash_flow: number;
}

export default function DailyClosuresPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الإغلاق اليومي",
      subtitle: "إدارة إقفال اليومية المالية والتدقيق",
      date: "التاريخ",
      status: "الحالة",
      paymentsIn: "المدفوعات",
      expensesOut: "المصروفات",
      netCash: "صافي التدفق",
      actions: "الإجراءات",
      close: "إقفال",
      unlockRequest: "طلب فتح",
      approveUnlock: "الموافقة على الفتح",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      empty: "لا توجد إقفالات بعد",
      closed: "مقفل",
      pending: "معلق",
      unlockRequested: "طلب فتح",
      ledger: "عرض كشف الحساب",
      closeConfirm: "هل أنت متأكد من إقفال هذا اليوم؟",
      yes: "نعم",
      no: "لا",
      sar: "ريال",
      filterDateFrom: "من تاريخ",
      filterDateTo: "إلى تاريخ",
      receiptNumber: "رقم الإيصال",
      cash: "نقداً",
      online: "تحويل بنكي",
      transactionNumber: "رقم العملية",
      paymentMethod: "طريقة الدفع",
      amount: "المبلغ",
      cashPayments: "المدفوعات النقدية",
      onlinePayments: "المدفوعات البنكية",
      ledgerError: "فشل تحميل كشف الحساب",
    },
    en: {
      title: "Daily Closures",
      subtitle: "Manage daily financial closing and auditing",
      date: "Date",
      status: "Status",
      paymentsIn: "Payments In",
      expensesOut: "Expenses Out",
      netCash: "Net Cash Flow",
      actions: "Actions",
      close: "Close",
      unlockRequest: "Request Unlock",
      approveUnlock: "Approve Unlock",
      loading: "Loading...",
      refresh: "Refresh",
      empty: "No closures yet",
      closed: "Closed",
      pending: "Pending",
      unlockRequested: "Unlock Requested",
      ledger: "View Ledger",
      closeConfirm: "Are you sure you want to close this day?",
      yes: "Yes",
      no: "No",
      sar: "SAR",
      filterDateFrom: "From Date",
      filterDateTo: "To Date",
      receiptNumber: "Receipt No.",
      cash: "Cash",
      online: "Bank Transfer",
      transactionNumber: "Transaction No.",
      paymentMethod: "Method",
      amount: "Amount",
      cashPayments: "Cash Payments",
      onlinePayments: "Bank Transfer Payments",
      ledgerError: "Failed to load ledger",
    },
  }[locale === "en" ? "en" : "ar"];

  const [closures, setClosures] = useState<DailyClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isManager = user?.is_superadmin || user?.role?.name === "manager";
  const isSecretary = user?.role?.name === "secretary";
  const canClose = isManager;
  const canRequestUnlock = isManager || isSecretary;
  const canApproveUnlock = isManager;

  const fetchClosures = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiClient.get<DailyClosure[]>("/lms/daily-closures", { params });
      setClosures(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [dateFrom, dateTo]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await fetchClosures();
    setLoading(false);
  }, [fetchClosures]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchClosures();
    setRefreshing(false);
  };

  const handleClose = async (date: string) => {
    try {
      await apiClient.post(`/lms/daily-closures/${date}/close`);
      setCloseConfirm(null);
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlockRequest = async (date: string) => {
    try {
      await apiClient.post(`/lms/daily-closures/${date}/unlock-request`);
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleApproveUnlock = async (date: string) => {
    try {
      await apiClient.post(`/lms/daily-closures/${date}/approve-unlock`);
      handleRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      closed: "bg-red-50 text-red-600 border-red-200",
      pending: "bg-amber-50 text-amber-600 border-amber-200",
      unlock_requested: "bg-blue-50 text-blue-600 border-blue-200",
    };
    const labels: Record<string, string> = {
      closed: t.closed,
      pending: t.pending,
      unlock_requested: t.unlockRequested,
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return d; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-xs w-32" title={t.filterDateFrom} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-xs w-32" title={t.filterDateTo} />
          <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {closures.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.status}</th>
                <th>{t.paymentsIn}</th>
                <th>{t.expensesOut}</th>
                <th>{t.netCash}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {closures.map((closure) => (
                <tr key={closure.date}>
                  <td className="font-medium text-slate-900">{formatDate(closure.date)}</td>
                  <td>{statusBadge(closure.status)}</td>
                  <td className="font-semibold text-emerald-600">{closure.total_payments_in.toFixed(2)} {t.sar}</td>
                  <td className="font-semibold text-red-600">{closure.total_expenses_out.toFixed(2)} {t.sar}</td>
                  <td className={`font-semibold ${closure.net_cash_flow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {closure.net_cash_flow.toFixed(2)} {t.sar}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => router.push(`/${locale}/dashboard/daily-closures/${closure.date}`)} className="btn-icon text-indigo-600" title={t.ledger}>
                        <Eye size={15} />
                      </button>
                      {canClose && closure.status !== "closed" && (
                        <>
                          {closeConfirm === closure.date ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleClose(closure.date)} className="text-xs px-2 py-1 rounded bg-red-500 text-white">{t.yes}</button>
                              <button onClick={() => setCloseConfirm(null)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{t.no}</button>
                            </div>
                          ) : (
                            <button onClick={() => setCloseConfirm(closure.date)} className="btn-icon text-red-600" title={t.close}>
                              <Lock size={14} />
                            </button>
                          )}
                        </>
                      )}
                      {canRequestUnlock && closure.status === "closed" && (
                        <button onClick={() => handleUnlockRequest(closure.date)} className="btn-icon text-amber-600" title={t.unlockRequest}>
                          <Unlock size={14} />
                        </button>
                      )}
                      {canApproveUnlock && closure.status === "unlock_requested" && (
                        <button onClick={() => handleApproveUnlock(closure.date)} className="btn-icon text-emerald-600" title={t.approveUnlock}>
                          <Lock size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
