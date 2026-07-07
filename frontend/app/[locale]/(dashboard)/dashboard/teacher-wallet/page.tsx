"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import Modal from "@/components/Modal";
import {
  Loader2, RefreshCw, Wallet, ChevronDown, ChevronUp,
  DollarSign, Users, X, Plus,
} from "lucide-react";
import { getLocalDateString, formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

// ─── Shared Types ───────────────────────────────────────────────────────────

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

interface TeacherWithWallet {
  id: string;
  full_name: string;
  wallet_balance: number;
  wallet_last_updated: string | null;
  sections_count: number;
  is_active: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDate = formatDisplayDate;
const formatDateTime = formatDisplayDateTime;

// ─── Teacher View (unchanged from original) ─────────────────────────────────

function TeacherWalletView({ locale, employeeId }: { locale: string; employeeId: string | null }) {
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "محفظة المعلم",
      subtitle: "الرصيد الحالي وسجل السحوبات",
      currentBalance: "الرصيد الحالي",
      lastUpdated: "آخر تحديث",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      noWallet: "لا توجد محفظة لهذا المعلم",
      amount: "المبلغ",
      description: "الوصف",
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
      loading: "Loading...",
      refresh: "Refresh",
      noWallet: "No wallet found for this teacher",
      amount: "Amount",
      description: "Description",
      history: "Withdrawal History",
      emptyHistory: "No withdrawals yet",
      sar: "YER",
      receiptNumber: "Voucher No.",
      date: "Date",
    },
  }[locale === "en" ? "en" : "ar"];

  const [wallet, setWallet] = useState<TeacherWallet | null>(null);
  const [withdrawals, setWithdrawals] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const teacherId = employeeId;

  const fetchWallet = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await apiClient.get<TeacherWallet>(`/lms/teacher-wallets/${teacherId}`);
      if (res.status === 200) setWallet(res.data);
    } catch {
      setWallet(null);
    }
  }, [teacherId]);

  const fetchWithdrawals = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await apiClient.get<Expense[]>(`/lms/teacher-wallets/${teacherId}/withdrawals`);
      setWithdrawals(res.data);
    } catch {
      setWithdrawals([]);
    }
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
                  {t.lastUpdated}: {formatDate(wallet.last_updated.split("T")[0], locale)}
                </p>
              </div>
            </div>
          </div>
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
                        <td className="text-slate-500">{formatDate(w.date, locale)}</td>
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

// ─── Admin / Manager View ───────────────────────────────────────────────────

function AdminWalletOverview({ locale }: { locale: string }) {
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "محفظة المعلم",
      subtitle: "نظرة عامة على جميع محافظ المعلمين",
      refresh: "تحديث",
      loading: "جاري التحميل...",
      totalBalance: "إجمالي الأرصدة",
      teachersWithWallet: "معلم لديهم محفظة",
      teacher: "المعلم",
      balance: "الرصيد",
      sections: "الشعب",
      lastUpdated: "آخر تحديث",
      actions: "إجراءات",
      noTeachers: "لا يوجد معلمون بعد",
      withdraw: "سحب",
      sar: "ريال",
      history: "سجل السحوبات",
      emptyHistory: "لا توجد سحوبات",
      receiptNumber: "رقم السند",
      amount: "المبلغ",
      description: "الوصف",
      date: "التاريخ",
      processWithdrawal: "سحب رصيد",
      withdrawalAmount: "المبلغ",
      withdrawalDesc: "الوصف",
      withdrawalDate: "التاريخ",
      cancel: "إلغاء",
      confirm: "تأكيد السحب",
      insufficientBalance: "الرصيد غير كافٍ",
      balanceAfter: "الرصيد بعد الخصم",
      withdrawalSuccess: "تم السحب بنجاح",
      withdrawalError: "فشل السحب",
    },
    en: {
      title: "Teacher Wallet",
      subtitle: "Overview of all teacher wallets",
      refresh: "Refresh",
      loading: "Loading...",
      totalBalance: "Total Balance",
      teachersWithWallet: "Teachers with Wallet",
      teacher: "Teacher",
      balance: "Balance",
      sections: "Sections",
      lastUpdated: "Last Updated",
      actions: "Actions",
      noTeachers: "No teachers yet",
      withdraw: "Withdraw",
      sar: "YER",
      history: "Withdrawal History",
      emptyHistory: "No withdrawals",
      receiptNumber: "Voucher No.",
      amount: "Amount",
      description: "Description",
      date: "Date",
      processWithdrawal: "Process Withdrawal",
      withdrawalAmount: "Amount",
      withdrawalDesc: "Description",
      withdrawalDate: "Date",
      cancel: "Cancel",
      confirm: "Confirm Withdrawal",
      insufficientBalance: "Insufficient balance",
      balanceAfter: "Balance after",
      withdrawalSuccess: "Withdrawal successful",
      withdrawalError: "Withdrawal failed",
    },
  }[locale === "en" ? "en" : "ar"];

  const [teachers, setTeachers] = useState<TeacherWithWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedWithdrawals, setExpandedWithdrawals] = useState<Expense[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [modalTeacher, setModalTeacher] = useState<TeacherWithWallet | null>(null);
  const [modalAmount, setModalAmount] = useState("");
  const [modalDesc, setModalDesc] = useState("");
  const [modalDate, setModalDate] = useState(getLocalDateString());
  const [modalError, setModalError] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalSuccess, setModalSuccess] = useState(false);
  const [modalPreviewBalance, setModalPreviewBalance] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiClient.get<TeacherWithWallet[]>("/users/teachers");
      setTeachers(res.data);
    } catch {
      setTeachers([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await fetchAll();
    setLoading(false);
  }, [fetchAll]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handleToggleExpand = async (teacherId: string) => {
    if (expandedId === teacherId) {
      setExpandedId(null);
      setExpandedWithdrawals([]);
      return;
    }
    setExpandedId(teacherId);
    setLoadingWithdrawals(true);
    setExpandedWithdrawals([]);
    try {
      const res = await apiClient.get<Expense[]>(`/lms/teacher-wallets/${teacherId}/withdrawals`);
      setExpandedWithdrawals(res.data);
    } catch {
      setExpandedWithdrawals([]);
    }
    setLoadingWithdrawals(false);
  };

  const openWithdrawModal = (teacher: TeacherWithWallet) => {
    setModalTeacher(teacher);
    setModalAmount("");
    setModalDesc("");
    setModalDate(getLocalDateString());
    setModalError("");
    setModalSuccess(false);
    setModalPreviewBalance(null);
  };

  const closeWithdrawModal = () => {
    setModalTeacher(null);
    setModalAmount("");
    setModalDesc("");
    setModalDate(getLocalDateString());
    setModalError("");
    setModalSuccess(false);
    setModalPreviewBalance(null);
  };

  const handleSubmitWithdrawal = async () => {
    if (!modalTeacher) return;
    const amount = parseFloat(modalAmount);
    if (isNaN(amount) || amount <= 0) {
      setModalError("Invalid amount");
      return;
    }
    if (amount > modalTeacher.wallet_balance) {
      setModalError(t.insufficientBalance);
      return;
    }

    setModalSubmitting(true);
    setModalError("");
    try {
      await apiClient.post("/lms/expenses", {
        type: "teacher_withdrawal",
        recipient_id: modalTeacher.id,
        amount,
        description: modalDesc || null,
        date: modalDate,
      });
      setModalSuccess(true);
      setTimeout(async () => {
        const teacherId = modalTeacher.id;
        closeWithdrawModal();
        await fetchAll();
        if (expandedId === teacherId) {
          const res = await apiClient.get<Expense[]>(`/lms/teacher-wallets/${teacherId}/withdrawals`);
          setExpandedWithdrawals(res.data);
        }
      }, 1200);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t.withdrawalError;
      setModalError(msg);
    }
    setModalSubmitting(false);
  };

  const stats = React.useMemo(() => {
    const totalBalance = teachers.reduce((sum, t) => sum + t.wallet_balance, 0);
    const withWallet = teachers.filter((t) => t.wallet_balance > 0).length;
    return { totalBalance, withWallet };
  }, [teachers]);

  const formatCurrency = (val: number) => val.toFixed(2);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <DollarSign size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.totalBalance}</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(stats.totalBalance)} {t.sar}</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.teachersWithWallet}</p>
              <p className="text-xl font-bold text-slate-900">{stats.withWallet} / {teachers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Teacher Wallet Table */}
      {teachers.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.noTeachers}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>{t.teacher}</th>
                <th>{t.balance}</th>
                <th>{t.sections}</th>
                <th>{t.lastUpdated}</th>
                <th className="w-24">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => {
                const isExpanded = expandedId === teacher.id;
                return (
                  <React.Fragment key={teacher.id}>
                    <tr
                      className={`cursor-pointer ${isExpanded ? "bg-slate-50" : "hover:bg-slate-50"}`}
                      onClick={() => handleToggleExpand(teacher.id)}
                    >
                      <td>
                        {isExpanded
                          ? <ChevronUp size={16} className="text-slate-400" />
                          : <ChevronDown size={16} className="text-slate-400" />}
                      </td>
                      <td className="font-medium text-slate-900">{teacher.full_name}</td>
                      <td className={`font-semibold ${teacher.wallet_balance > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                        {formatCurrency(teacher.wallet_balance)} {t.sar}
                      </td>
                      <td className="text-slate-500">{teacher.sections_count}</td>
                      <td className="text-slate-500 text-xs">
                        {formatDateTime(teacher.wallet_last_updated, locale)}
                      </td>
                      <td>
                        <button
                          onClick={(e) => { e.stopPropagation(); openWithdrawModal(teacher); }}
                          className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1"
                          title={t.withdraw}
                        >
                          <Plus size={12} />
                          {t.withdraw}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
                            <h4 className="text-xs font-bold text-slate-700 mb-2">{t.history}</h4>
                            {loadingWithdrawals ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="animate-spin text-slate-400" size={16} />
                              </div>
                            ) : expandedWithdrawals.length === 0 ? (
                              <p className="text-xs text-slate-400">{t.emptyHistory}</p>
                            ) : (
                              <table className="data-table text-xs">
                                <thead>
                                  <tr>
                                    <th>{t.receiptNumber}</th>
                                    <th>{t.amount}</th>
                                    <th>{t.description}</th>
                                    <th>{t.date}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedWithdrawals.map((w) => (
                                    <tr key={w.id}>
                                      <td><span className="badge badge-warning">{w.receipt_number}</span></td>
                                      <td className="font-semibold text-red-600">{w.amount.toFixed(2)} {t.sar}</td>
                                      <td className="text-slate-500">{w.description || "—"}</td>
                                      <td className="text-slate-500">{formatDate(w.date, locale)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalTeacher !== null} onClose={closeWithdrawModal} title={modalSuccess ? t.withdrawalSuccess : t.processWithdrawal}>
        {modalSuccess ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-900">{t.withdrawalSuccess}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">{modalTeacher?.full_name}</p>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSubmitWithdrawal(); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.withdrawalAmount}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={modalTeacher?.wallet_balance}
                  value={modalAmount}
                  onChange={(e) => {
                    setModalAmount(e.target.value);
                    const v = parseFloat(e.target.value);
                    setModalPreviewBalance(isNaN(v) ? null : (modalTeacher ? modalTeacher.wallet_balance - v : null));
                  }}
                  className="input-field"
                  placeholder="0.00"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-slate-400">
                    {t.balance}: {modalTeacher ? `${formatCurrency(modalTeacher.wallet_balance)} ${t.sar}` : ""}
                  </p>
                  {modalPreviewBalance !== null && modalPreviewBalance >= 0 && (
                    <p className="text-xs text-slate-500">
                      {t.balanceAfter}: {formatCurrency(modalPreviewBalance)} {t.sar}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.withdrawalDesc}</label>
                <textarea
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                  className="input-field min-h-[60px] resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">{t.withdrawalDate}</label>
                <input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="input-field"
                />
              </div>

              {modalError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeWithdrawModal} className="btn-secondary text-xs px-4 py-2">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-1"
                >
                  {modalSubmitting && <Loader2 size={12} className="animate-spin" />}
                  {t.confirm}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Root Page ──────────────────────────────────────────────────────────────

export default function TeacherWalletPage() {
  const params = useParams();
  const { user, loading } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const role = user?.role?.name;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (role === "teacher") {
    return <TeacherWalletView locale={locale} employeeId={user?.employee_id ?? null} />;
  }

  if (role === "superadmin" || role === "manager") {
    return <AdminWalletOverview locale={locale} />;
  }

  return <div className="text-center text-slate-400 py-12 text-sm">Access denied</div>;
}
