"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Loader2, RefreshCw, Wallet, ArrowUpRight } from "lucide-react";

interface TeacherWallet {
  teacher_id: string;
  balance: number;
  last_updated: string;
}

interface Expense {
  id: string;
  amount: number;
  description: string | null;
  recipient_name: string;
  date: string;
  receipt_number: string;
  type: string;
}

export default function TeacherWalletPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "محفظة المعلم",
      subtitle: "الرصيد الحالي وسجل السحوبات",
      currentBalance: "الرصيد الحالي",
      lastUpdated: "آخر تحديث",
      withdraw: "سحب",
      amount: "المبلغ",
      description: "الوصف",
      save: "تأكيد السحب",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      enterAmount: "أدخل المبلغ",
      enterDescription: "وصف (اختياري)",
      noWallet: "لا توجد محفظة لهذا المعلم",
      withdrawSuccess: "تم السحب بنجاح",
      withdrawFailed: "فشل السحب - رصيد غير كاف",
      history: "سجل السحوبات",
      emptyHistory: "لا توجد سحوبات بعد",
      sar: "ريال",
      receiptNumber: "رقم السند",
      date: "التاريخ",
    },
    en: {
      title: "Teacher Wallet",
      subtitle: "Current balance and withdrawal history",
      currentBalance: "Current Balance",
      lastUpdated: "Last Updated",
      withdraw: "Withdraw",
      amount: "Amount",
      description: "Description",
      save: "Confirm Withdrawal",
      cancel: "Cancel",
      loading: "Loading...",
      refresh: "Refresh",
      enterAmount: "Enter Amount",
      enterDescription: "Description (optional)",
      noWallet: "No wallet found for this teacher",
      withdrawSuccess: "Withdrawal successful",
      withdrawFailed: "Withdrawal failed - insufficient balance",
      history: "Withdrawal History",
      emptyHistory: "No withdrawals yet",
      sar: "SAR",
      receiptNumber: "Voucher No.",
      date: "Date",
    },
  }[locale === "en" ? "en" : "ar"];

  const [wallet, setWallet] = useState<TeacherWallet | null>(null);
  const [withdrawals, setWithdrawals] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", description: "" });
  const [message, setMessage] = useState("");

  const isTeacher = user?.role?.name === "teacher";
  const teacherId = isTeacher ? user?.id : null;

  const fetchWallet = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await apiClient.get<TeacherWallet>(`/lms/teacher-wallets/${teacherId}`);
      if (res.status === 200) setWallet(res.data);
    } catch { setWallet(null); }
  }, [teacherId]);

  const fetchWithdrawals = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await apiClient.get<Expense[]>("/lms/expenses", {
        params: { type: "teacher_withdrawal" },
      });
      setWithdrawals(res.data);
    } catch { setWithdrawals([]); }
  }, [teacherId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchWallet(), fetchWithdrawals()]);
    setLoading(false);
  }, [fetchWallet, fetchWithdrawals]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchWallet(), fetchWithdrawals()]);
    setRefreshing(false);
  };

  const handleWithdraw = async () => {
    if (!form.amount || !teacherId) return;
    setMessage("");
    try {
      const res = await apiClient.post("/lms/teacher-wallets/withdraw", {
        teacher_id: teacherId,
        amount: parseFloat(form.amount),
        description: form.description || undefined,
      });
      if (res.status === 200) {
        setShowForm(false);
        setForm({ amount: "", description: "" });
        setMessage(t.withdrawSuccess);
        handleRefresh();
      }
    } catch {
      setMessage(t.withdrawFailed);
    }
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
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          {wallet && (
            <button onClick={() => { setShowForm(true); setMessage(""); }} className="btn-primary flex items-center gap-2">
              <ArrowUpRight size={16} />
              <span>{t.withdraw}</span>
            </button>
          )}
        </div>
      </div>

      {!wallet ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.noWallet}</div>
      ) : (
        <>
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <Wallet size={28} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{t.currentBalance}</p>
                <p className="text-3xl font-bold text-slate-900">{wallet.balance.toFixed(2)} {t.sar}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {t.lastUpdated}: {formatDate(wallet.last_updated.split("T")[0])}
                </p>
              </div>
            </div>
          </div>

          {message && (
            <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
              message === t.withdrawSuccess
                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              {message}
            </div>
          )}

          {showForm && (
            <div className="card p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterAmount}</label>
                  <input type="number" step="0.01" min="0" max={wallet.balance}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="input-field" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.enterDescription}</label>
                  <input type="text" value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleWithdraw} className="btn-primary">{t.save}</button>
                <button onClick={() => setShowForm(false)} className="btn-secondary">{t.cancel}</button>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">{t.history}</h3>
            {withdrawals.length === 0 ? (
              <div className="card p-6 text-center text-sm text-slate-500">{t.emptyHistory}</div>
            ) : (
              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.receiptNumber}</th>
                      <th>{t.amount}</th>
                      <th>{t.description}</th>
                      <th>{t.date}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td><span className="badge badge-warning">{w.receipt_number}</span></td>
                        <td className="font-semibold text-red-600">{w.amount.toFixed(2)} {t.sar}</td>
                        <td className="text-slate-600">{w.description || "—"}</td>
                        <td className="text-slate-500">{formatDate(w.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
