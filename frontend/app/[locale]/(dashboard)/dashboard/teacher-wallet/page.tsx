"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import Modal from "@/components/Modal";
import GuidedConfirmSection from "@/components/GuidedConfirmSection";
import UndoToast from "@/components/UndoToast";
import EmptyState from "@/components/EmptyState";
import { sanitizeInput } from "@/lib/utils/input";
import { useClosureStatus } from "@/hooks/useClosureStatus";
import { useUndoableAction } from "@/hooks/useUndoableAction";
import {
  Loader2, RefreshCw, Wallet, ChevronDown, ChevronUp,
  DollarSign, Users, X, Plus, AlertCircle,
} from "lucide-react";
import { getLocalDateString, formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";
import ContractStatusBadge from "@/components/sections/ContractStatusBadge";

// ─── Shared Types ───────────────────────────────────────────────────────────

interface WalletDetail {
  total_balance: number;
  total_frozen: number;
  total_available: number;
  sections: WalletSection[];
}

interface WalletSection {
  contract_id: string;
  section_name: string;
  course_name: string | null;
  model: string | null;
  status: string | null;
  credited: number;
  frozen: number;
  available: number;
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
      availableBalance: "الرصيد المتاح",
      frozenBalance: "الرصيد المجمد",
      sectionBreakdown: "تفصيل الإيرادات حسب الشعبة",
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
      course: "المادة",
      contract: "العقد",
      model: "النموذج",
      credited: "المدين",
      statusActive: "نشط",
      statusAssigned: "مسند",
      statusSettled: "مسوى",
    },
    en: {
      title: "Teacher Wallet",
      subtitle: "Current balance and withdrawal history",
      currentBalance: "Current Balance",
      availableBalance: "Available Balance",
      frozenBalance: "Frozen Balance",
      sectionBreakdown: "Revenue Breakdown by Section",
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
      course: "Course",
      contract: "Contract",
      model: "Model",
      credited: "Credited",
      statusActive: "Active",
      statusAssigned: "Assigned",
      statusSettled: "Settled",
    },
  }[locale === "en" ? "en" : "ar"];

  const [walletDetail, setWalletDetail] = useState<WalletDetail | null>(null);
  const [withdrawals, setWithdrawals] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const teacherId = employeeId;

  const fetchWallet = useCallback(async () => {
    if (!teacherId) return;
    try {
      const res = await apiClient.get<WalletDetail>(`/lms/teacher-wallets/${teacherId}/detail`);
      if (res.status === 200) setWalletDetail(res.data);
    } catch {
      setWalletDetail(null);
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

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {fetchError}
          <button onClick={() => setFetchError(null)} className="ms-auto">&times;</button>
        </div>
      )}

      {!walletDetail ? (
        <EmptyState title={t.noWallet} message="" />
      ) : (
        <>
          <div className="card p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <Wallet size={28} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{t.currentBalance}</p>
                <p className="text-3xl font-bold text-slate-900">{walletDetail.total_balance.toFixed(2)} {t.sar}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-emerald-600">{t.availableBalance}</p>
                <p className="text-lg font-bold text-emerald-700">
                  {walletDetail.total_available.toFixed(2)} {t.sar}
                </p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600">{t.frozenBalance}</p>
                <p className="text-lg font-bold text-amber-700">
                  {walletDetail.total_frozen.toFixed(2)} {t.sar}
                </p>
              </div>
            </div>
          </div>

          {walletDetail.sections.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">{t.sectionBreakdown}</h3>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.course}</th>
                    <th>{t.contract}</th>
                    <th>{t.model}</th>
                    <th>{t.credited}</th>
                    <th>{t.availableBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  {walletDetail.sections.map((sec) => (
                    <tr key={sec.contract_id}>
                      <td className="font-medium text-slate-900">{sec.course_name || sec.section_name}</td>
                      <td>
                        <ContractStatusBadge
                          status={sec.status || ""}
                          isRtl={isRtl}
                          labels={{
                            assigned: t.statusAssigned,
                            active: t.statusActive,
                            settled: t.statusSettled,
                          }}
                        />
                      </td>
                      <td className="text-slate-600">{sec.model || "—"}</td>
                      <td className="font-semibold text-emerald-600">{sec.credited.toFixed(2)} {t.sar}</td>
                      <td className="font-semibold">{sec.available.toFixed(2)} {t.sar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">{t.history}</h3>
            {withdrawals.length === 0 ? (
              <EmptyState title={t.emptyHistory} message="" />
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
      availableBalance: "الرصيد المتاح",
      frozenBalance: "الرصيد المجمد",
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
      undoMessage: "تم السحب — يمكنك التراجع",
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
      availableBalance: "Available Balance",
      frozenBalance: "Frozen Balance",
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
      undoMessage: "Withdrawal processed — undo available",
    },
  }[locale === "en" ? "en" : "ar"];

  const [teachers, setTeachers] = useState<TeacherWithWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedWithdrawals, setExpandedWithdrawals] = useState<Expense[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [modalTeacher, setModalTeacher] = useState<TeacherWithWallet | null>(null);
  const [modalWalletDetail, setModalWalletDetail] = useState<WalletDetail | null>(null);
  const [modalAmount, setModalAmount] = useState("");
  const [modalDesc, setModalDesc] = useState("");
  const [modalDate, setModalDate] = useState(getLocalDateString());
  const [modalError, setModalError] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalSuccess, setModalSuccess] = useState(false);
  const [modalPreviewAvailable, setModalPreviewAvailable] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalReason, setModalReason] = useState("");
  const closureStatus = useClosureStatus(modalDate);
  const { undoConfig, showUndo, dismissUndo } = useUndoableAction();

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiClient.get<TeacherWithWallet[]>("/users/teachers");
      setTeachers(res.data);
    } catch (e: any) {
      setFetchError(e?.message || "Failed to load teachers");
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

  const openWithdrawModal = async (teacher: TeacherWithWallet) => {
    setModalTeacher(teacher);
    setModalAmount("");
    setModalDesc("");
    setModalDate(getLocalDateString());
    setModalError("");
    setModalSuccess(false);
    setModalPreviewAvailable(null);
    setModalWalletDetail(null);
    try {
      const res = await apiClient.get<WalletDetail>(`/lms/teacher-wallets/${teacher.id}/detail`);
      if (res.status === 200) setModalWalletDetail(res.data);
    } catch {
      setModalWalletDetail(null);
    }
  };

  const closeWithdrawModal = () => {
    setModalTeacher(null);
    setModalWalletDetail(null);
    setModalAmount("");
    setModalDesc("");
    setModalDate(getLocalDateString());
    setModalError("");
    setModalSuccess(false);
    setModalPreviewAvailable(null);
    setModalReason("");
  };

  const handleSubmitWithdrawal = async () => {
    if (!modalTeacher) return;
    if (!modalReason.trim()) return;
    const amount = parseFloat(modalAmount);
    if (isNaN(amount) || amount <= 0) {
      setModalError("Invalid amount");
      return;
    }
    const maxAvailable = modalWalletDetail ? modalWalletDetail.total_available : modalTeacher.wallet_balance;
    if (amount > maxAvailable) {
      setModalError(t.insufficientBalance);
      return;
    }

    setModalSubmitting(true);
    setModalError("");
    try {
      const res = await apiClient.post("/lms/expenses", {
        type: "teacher_withdrawal",
        recipient_id: modalTeacher.id,
        amount,
        description: modalDesc ? sanitizeInput(modalDesc) : null,
        date: modalDate,
      });
      const expenseId = res.data.id;
      setModalSuccess(true);
      closeWithdrawModal();
      await fetchAll();
      if (expandedId === modalTeacher.id) {
        try {
          const withdrawalRes = await apiClient.get<Expense[]>(`/lms/teacher-wallets/${modalTeacher.id}/withdrawals`);
          setExpandedWithdrawals(withdrawalRes.data);
        } catch { /* ignore */ }
      }
      showUndo({
        undoEndpoint: `/lms/expenses/${expenseId}/void`,
        undoBody: { void_reason: sanitizeInput(modalReason) },
        toastMessage: (typeof t.undoMessage === "function"
          ? t.undoMessage(amount, modalTeacher.full_name)
          : `${amount.toFixed(2)} ${t.sar} — undo available`),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t.withdrawalError;
      setModalError(msg);
      setModalSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!undoConfig) return;
    try {
      await apiClient.post(undoConfig.undoEndpoint, undoConfig.undoBody || {});
      dismissUndo();
      await fetchAll();
    } catch {
      dismissUndo();
    }
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

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {fetchError}
          <button onClick={() => setFetchError(null)} className="ms-auto">&times;</button>
        </div>
      )}

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
        <EmptyState title={t.noTeachers} message="" />
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
                              <EmptyState title={t.emptyHistory} message="" />
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

            {modalWalletDetail && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-slate-500">{t.balance}</p>
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(modalWalletDetail.total_balance)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-amber-600">{t.frozenBalance}</p>
                  <p className="text-sm font-bold text-amber-700">{formatCurrency(modalWalletDetail.total_frozen)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-emerald-600">{t.availableBalance}</p>
                  <p className="text-sm font-bold text-emerald-700">{formatCurrency(modalWalletDetail.total_available)}</p>
                </div>
              </div>
            )}

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
                  max={modalWalletDetail ? modalWalletDetail.total_available : modalTeacher?.wallet_balance}
                  value={modalAmount}
                  onChange={(e) => {
                    setModalAmount(e.target.value);
                    const v = parseFloat(e.target.value);
                    const avail = modalWalletDetail ? modalWalletDetail.total_available : (modalTeacher?.wallet_balance ?? 0);
                    setModalPreviewAvailable(isNaN(v) ? null : (avail - v));
                  }}
                  className="input-field"
                  placeholder="0.00"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-slate-400">
                    {t.availableBalance}: {modalWalletDetail ? `${formatCurrency(modalWalletDetail.total_available)} ${t.sar}` : modalTeacher ? `${formatCurrency(modalTeacher.wallet_balance)} ${t.sar}` : ""}
                  </p>
                  {modalPreviewAvailable !== null && modalPreviewAvailable >= 0 && (
                    <p className="text-xs text-slate-500">
                      {t.balanceAfter}: {formatCurrency(modalPreviewAvailable)} {t.sar}
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

              <GuidedConfirmSection
                reason={modalReason}
                onReasonChange={setModalReason}
                isRtl={isRtl}
                locale={locale}
                closureStatus={closureStatus}
              />

              {modalError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeWithdrawModal} className="btn-secondary text-xs px-4 py-2">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting || submitting || !modalReason.trim() || closureStatus === "closed" || closureStatus === "unlock_requested"}
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

      {undoConfig && (
        <UndoToast
          message={undoConfig.toastMessage}
          durationSeconds={30}
          isRtl={isRtl}
          onUndo={handleUndo}
          onDismiss={dismissUndo}
        />
      )}
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
