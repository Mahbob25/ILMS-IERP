"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Loader2, ChevronLeft, ChevronRight, Lock, ArrowLeft, RotateCcw } from "lucide-react";
import TableContainer from "@/components/ui/TableContainer";
import { formatDisplayDate } from "@/lib/dates";

interface PaymentDetail {
  id: string;
  amount: number;
  receipt_number: string;
  payment_method: string;
  transaction_number: string | null;
  enrollment_id: string;
  student_id: string;
  student_name: string;
  course_name: string;
}

interface RefundDetail {
  id: string;
  amount: number;
  receipt_number: string;
  student_name: string;
  course_name: string;
}

interface ExpenseDetail {
  id: string;
  amount: number;
  receipt_number: string;
  type: string;
  recipient_name: string | null;
  description: string | null;
  recipient_id: string | null;
}

interface DailyLedger {
  date: string;
  total_payments_in: number;
  total_expenses_out: number;
  total_refunds_out: number;
  net_cash_flow: number;
  status: string;
  closed_by_manager_id: string | null;
  payments: PaymentDetail[];
  expenses: ExpenseDetail[];
  refunds: RefundDetail[];
  prev_date: string;
  next_date: string;
}

export default function DailyLedgerPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const dateParam = params?.date as string;
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "كشف الحساب اليومي",
      back: "العودة للإغلاق اليومي",
      date: "التاريخ",
      status: "الحالة",
      paymentsIn: "المدفوعات",
      expensesOut: "المصروفات",
      refundsOut: "المردودات",
      netCash: "صافي التدفق",
      closed: "مقفل",
      pending: "معلق",
      unlockRequested: "طلب فتح",
      receiptNumber: "رقم الإيصال",
      voucherNumber: "رقم السند",
      student: "الطالب",
      course: "المقرر",
      amount: "المبلغ",
      paymentMethod: "طريقة الدفع",
      cash: "نقداً",
      online: "تحويل بنكي",
      transactionNumber: "رقم العملية",
      type: "النوع",
      recipient: "المستلم",
      description: "الوصف",
      generalExpense: "مصاريف عامة",
      teacherWithdrawal: "سحب معلم",
      salaryDraw: "راتب موظف",
      noPayments: "لا توجد مدفوعات في هذا اليوم",
      noExpenses: "لا توجد مصروفات في هذا اليوم",
      noRefunds: "لا توجد مردودات في هذا اليوم",
      closeDay: "إقفال اليوم",
      closeConfirm: "هل أنت متأكد من إقفال هذا اليوم؟",
      confirm: "تأكيد",
      cancel: "إلغاء",
      prevDay: "اليوم السابق",
      nextDay: "اليوم التالي",
      loading: "جاري التحميل...",
      sar: "ريال",
      yes: "نعم",
      no: "لا",
      error: "فشل تحميل كشف الحساب",
    },
    en: {
      title: "Daily Ledger",
      back: "Back to Daily Closures",
      date: "Date",
      status: "Status",
      paymentsIn: "Payments In",
      expensesOut: "Expenses Out",
      refundsOut: "Refunds Out",
      netCash: "Net Cash Flow",
      closed: "Closed",
      pending: "Pending",
      unlockRequested: "Unlock Requested",
      receiptNumber: "Receipt No.",
      voucherNumber: "Voucher No.",
      student: "Student",
      course: "Course",
      amount: "Amount",
      paymentMethod: "Method",
      cash: "Cash",
      online: "Bank Transfer",
      transactionNumber: "Transaction No.",
      type: "Type",
      recipient: "Recipient",
      description: "Description",
      generalExpense: "General Expense",
      teacherWithdrawal: "Teacher Withdrawal",
      salaryDraw: "Staff Salary",
      noPayments: "No payments on this date",
      noExpenses: "No expenses on this date",
      noRefunds: "No refunds on this date",
      closeDay: "Close Day",
      closeConfirm: "Are you sure you want to close this day?",
      confirm: "Confirm",
      cancel: "Cancel",
      prevDay: "Previous Day",
      nextDay: "Next Day",
      loading: "Loading...",
      sar: "YER",
      yes: "Yes",
      no: "No",
      error: "Failed to load ledger",
    },
  }[locale === "en" ? "en" : "ar"];

  const [ledger, setLedger] = useState<DailyLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);

  const isManager = user?.is_superadmin || user?.role?.name === "manager";

  const fetchLedger = useCallback(async (d: string) => {
    setLoading(true);
    setError("");
    setCloseConfirm(false);
    try {
      const res = await apiClient.get<DailyLedger>(`/lms/daily-closures/${d}/ledger`);
      setLedger(res.data);
    } catch {
      setError(t.error);
    }
    setLoading(false);
  }, [t.error]);

  useEffect(() => {
    if (dateParam) fetchLedger(dateParam);
  }, [dateParam, fetchLedger]);

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

  const expenseTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      general_expense: "bg-slate-50 text-slate-600 border-slate-200",
      teacher_withdrawal: "bg-purple-50 text-purple-600 border-purple-200",
      salary_draw: "bg-cyan-50 text-cyan-600 border-cyan-200",
    };
    const labels: Record<string, string> = {
      general_expense: t.generalExpense,
      teacher_withdrawal: t.teacherWithdrawal,
      salary_draw: t.salaryDraw,
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[type] || colors.general_expense}`}>
        {labels[type] || type}
      </span>
    );
  };

  const formatDate = (d: string) => formatDisplayDate(d, locale);

  const handleClose = async () => {
    if (!ledger) return;
    setClosing(true);
    try {
      await apiClient.post(`/lms/daily-closures/${ledger.date}/close`);
      await fetchLedger(ledger.date);
      setCloseConfirm(false);
    } catch {
      setError(t.error);
    }
    setClosing(false);
  };

  const navigateDate = (d: string) => {
    router.push(`/${locale}/dashboard/daily-closures/${d}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (error || !ledger) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto" dir={isRtl ? "rtl" : "ltr"}>
        <button onClick={() => router.push(`/${locale}/dashboard/daily-closures`)} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
          <ArrowLeft size={14} />
          <span>{t.back}</span>
        </button>
        <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">{error || t.error}</div>
      </div>
    );
  }

  const isClosed = ledger.status === "closed";

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      {/* Back + Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push(`/${locale}/dashboard/daily-closures`)} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
          <ArrowLeft size={14} />
          <span>{t.back}</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => navigateDate(ledger.prev_date)} className="btn-icon" title={t.prevDay}>
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">{formatDate(ledger.date)}</span>
          <button onClick={() => navigateDate(ledger.next_date)} className="btn-icon" title={t.nextDay}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{formatDate(ledger.date)}</h2>
            <div className="mt-1">{statusBadge(ledger.status)}</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <p className="text-xs text-emerald-600 font-medium">{t.paymentsIn}</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{ledger.total_payments_in.toFixed(2)} {t.sar}</p>
          </div>
          <div className="p-3 bg-red-50 rounded-xl border border-red-200">
            <p className="text-xs text-red-600 font-medium">{t.expensesOut}</p>
            <p className="text-lg font-bold text-red-700 mt-1">{ledger.total_expenses_out.toFixed(2)} {t.sar}</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-xs text-amber-600 font-medium">{t.refundsOut}</p>
            <p className="text-lg font-bold text-amber-700 mt-1">{ledger.total_refunds_out.toFixed(2)} {t.sar}</p>
          </div>
          <div className={`p-3 rounded-xl border ${ledger.net_cash_flow >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            <p className={`text-xs font-medium ${ledger.net_cash_flow >= 0 ? "text-emerald-600" : "text-red-600"}`}>{t.netCash}</p>
            <p className={`text-lg font-bold mt-1 ${ledger.net_cash_flow >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {ledger.net_cash_flow.toFixed(2)} {t.sar}
            </p>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{t.paymentsIn}</h3>
        </div>
        {ledger.payments.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">{t.noPayments}</div>
        ) : (
          <TableContainer>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.receiptNumber}</th>
                  <th>{t.student}</th>
                  <th>{t.course}</th>
                  <th>{t.amount}</th>
                  <th>{t.paymentMethod}</th>
                  <th>{t.transactionNumber}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.payments.map((p) => (
                  <tr key={p.id}>
                    <td><span className="badge badge-success">{p.receipt_number}</span></td>
                    <td className="font-medium text-slate-900">{p.student_name}</td>
                    <td className="text-slate-600">{p.course_name}</td>
                    <td className="font-semibold text-slate-900">{p.amount.toFixed(2)} {t.sar}</td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        p.payment_method === "online"
                          ? "bg-blue-50 text-blue-600 border-blue-200"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}>
                        {p.payment_method === "online" ? t.online : t.cash}
                      </span>
                    </td>
                    <td className="text-sm font-mono text-slate-500">
                      {p.transaction_number || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </div>

      {/* Expenses Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{t.expensesOut}</h3>
        </div>
        {ledger.expenses.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">{t.noExpenses}</div>
        ) : (
          <TableContainer>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.voucherNumber}</th>
                  <th>{t.type}</th>
                  <th>{t.amount}</th>
                  <th>{t.recipient}</th>
                  <th>{t.description}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.expenses.map((e) => (
                  <tr key={e.id}>
                    <td><span className="badge badge-warning">{e.receipt_number}</span></td>
                    <td>{expenseTypeBadge(e.type)}</td>
                    <td className="font-semibold text-slate-900">{e.amount.toFixed(2)} {t.sar}</td>
                    <td className="text-slate-600">{e.recipient_name || "—"}</td>
                    <td className="text-sm text-slate-500 max-w-[200px] truncate" title={e.description || ""}>{e.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </div>

      {/* Refunds Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{t.refundsOut}</h3>
        </div>
        {ledger.refunds.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">{t.noRefunds}</div>
        ) : (
          <TableContainer>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.receiptNumber}</th>
                  <th>{t.student}</th>
                  <th>{t.course}</th>
                  <th>{t.amount}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.refunds.map((r) => (
                  <tr key={r.id}>
                    <td><span className="badge badge-warning">{r.receipt_number}</span></td>
                    <td className="font-medium text-slate-900">{r.student_name}</td>
                    <td className="text-slate-600">{r.course_name}</td>
                    <td className="font-semibold text-amber-600">{r.amount.toFixed(2)} {t.sar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </div>

      {/* Action Bar */}
      {isManager && !isClosed && (
        <div className="card p-5 flex items-center justify-between">
          <p className="text-sm text-slate-600">{t.closeConfirm}</p>
          {closeConfirm ? (
            <div className="flex items-center gap-2">
              <button onClick={handleClose} disabled={closing} className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700">
                {closing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                <span>{t.yes}</span>
              </button>
              <button onClick={() => setCloseConfirm(false)} className="btn-secondary">{t.no}</button>
            </div>
          ) : (
            <button onClick={() => setCloseConfirm(true)} className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700">
              <Lock size={16} />
              <span>{t.closeDay}</span>
            </button>
          )}
        </div>
      )}

      {isClosed && (
        <div className="card p-5 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 text-red-600 border border-red-200 text-sm font-medium">
            <Lock size={16} />
            {t.closed}
          </span>
        </div>
      )}
    </div>
  );
}
