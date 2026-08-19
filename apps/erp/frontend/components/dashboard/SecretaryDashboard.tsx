"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import {
  DollarSign,
  Wallet,
  Users,
  CalendarCheck,
  ShoppingCart,
  UserPlus,
  Workflow,
  FileText,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

interface DailyTransaction {
  id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  time: string;
}

interface SecretaryDashboardData {
  today_payments_count: number;
  today_payments_total: number;
  today_expenses_count: number;
  today_expenses_total: number;
  today_refunds_count: number;
  today_refunds_total: number;
  pending_students: number;
  daily_closure_status: string;
  recent_enrollments_count: number;
  today_transactions: DailyTransaction[];
}

export default function SecretaryDashboard() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const currencySymbol = locale === "ar" ? "ريال" : "YER";
  const [data, setData] = useState<SecretaryDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchDashboardData = useCallback(() => {
    apiClient
      .get<SecretaryDashboardData>("/dashboard/secretary")
      .then((res) => setData(res.data))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const t = {
    ar: {
      payments: "المدفوعات",
      expenses: "المصروفات",
      refunds: "المردودات",
      pending: "طلاب بدون تسجيل",
      closure: "الإغلاق اليومي",
      open: "مفتوح",
      closed: "مغلق",
      unlockReq: "طلب فتح",
      todayTransactions: "تعاملات اليوم",
      quickActions: "إجراءات سريعة",
      newPayment: "دفعة جديدة",
      newStudent: "طالب جديد",
      pos: "نقطة البيع",
      payment: "دفعة",
      expense: "مصروف",
      enrollments: "تسجيلات اليوم",
      noTransactions: "لا توجد تعاملات اليوم",
      quickRegistration: "تسجيل سريع",
    },
    en: {
      payments: "Payments",
      expenses: "Expenses",
      refunds: "Refunds",
      pending: "Students w/o Enrollment",
      closure: "Daily Closure",
      open: "Open",
      closed: "Closed",
      unlockReq: "Unlock Requested",
      todayTransactions: "Today's Transactions",
      quickActions: "Quick Actions",
      newPayment: "New Payment",
      newStudent: "New Student",
      pos: "POS",
      payment: "Payment",
      expense: "Expense",
      enrollments: "Today's Enrollments",
      noTransactions: "No transactions today",
      quickRegistration: "Quick Registration",
    },
  }[locale === "en" ? "en" : "ar"];

  const closureBadge = (status: string) => {
    if (status === "closed") return "badge badge-success";
    if (status === "unlock_requested") return "badge badge-warning";
    return "badge badge-muted";
  };

  const closureLabel = (status: string) => {
    if (status === "closed") return t.closed;
    if (status === "unlock_requested") return t.unlockReq;
    return t.open;
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 h-48" />
          <div className="card p-5 h-48" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium">Failed to load dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.today_payments_total.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.payments} ({data.today_payments_count})</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.today_expenses_total.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.expenses} ({data.today_expenses_count})</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <RotateCcw size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.today_refunds_total.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.refunds} ({data.today_refunds_count})</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            data.pending_students > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
          }`}>
            <Users size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.pending_students}</p>
            <p className="text-xs text-slate-500">{t.pending}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CalendarCheck size={20} />
          </div>
          <div>
            <span className={closureBadge(data.daily_closure_status)}>
              {closureLabel(data.daily_closure_status)}
            </span>
            <p className="text-xs text-slate-500 mt-1">{t.closure}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{t.quickActions}</h3>
          <div className="space-y-3">
            <button
              onClick={() => router.push(`/${locale}/dashboard/payments`)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-all text-sm font-medium"
            >
              <DollarSign size={18} />
              <span>{t.newPayment}</span>
            </button>
            <button
              onClick={() => router.push(`/${locale}/dashboard/students`)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-all text-sm font-medium"
            >
              <UserPlus size={18} />
              <span>{t.newStudent}</span>
            </button>
            <button
              onClick={() => router.push(`/${locale}/dashboard/pos`)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100 transition-all text-sm font-medium"
            >
              <ShoppingCart size={18} />
              <span>{t.pos}</span>
            </button>
            <button
              onClick={() => router.push(`/${locale}/dashboard/wizards/student-enrollment`)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 transition-all text-sm font-medium"
            >
              <Workflow size={18} />
              <span>{t.quickRegistration}</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText size={16} className="text-slate-500" />
            <span>{t.todayTransactions}</span>
          </h3>
          {data.today_transactions.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t.noTransactions}</p>
          ) : (
            <div className="space-y-1">
              {data.today_transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      tx.type === "payment" ? "bg-emerald-50 text-emerald-600" : tx.type === "refund" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                    }`}>
                      {tx.type === "payment" ? <DollarSign size={16} /> : tx.type === "refund" ? <RotateCcw size={16} /> : <Wallet size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{tx.description}</p>
                      <p className="text-xs text-slate-400">{tx.type === "payment" ? t.payment : tx.type === "refund" ? t.refunds : t.expense}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${
                    tx.amount >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}>
                    {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
