"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { formatDisplayDate } from "@/lib/dates";
import { AlertCircle, TrendingUp, DollarSign, Target, RotateCcw } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Comparison {
  current_period: number;
  previous_period: number;
  change_pct: number;
}

interface DailyItem {
  date: string;
  revenue: number;
  expenses: number;
  refunds: number;
  closure_status?: string | null;
}

interface PnlData {
  total_revenue: number;
  total_expenses: number;
  total_refunds: number;
  net_revenue: number;
  transaction_count: number;
  avg_per_student: number;
  comparison: Comparison;
  monthly_trend: { month: string; revenue: number; expenses: number; refunds: number }[];
  by_course: { course_name: string; revenue: number; pct: number }[];
  by_teacher: { teacher_name: string; revenue: number; pct: number }[];
  daily_breakdown: DailyItem[];
  unclosed_days: string[];
}

const fmt = (val: number) => val.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PnlView({ start, end }: { start: string; end: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalRevenue: "إجمالي الإيرادات",
      totalExpenses: "إجمالي المصروفات",
      totalRefunds: "إجمالي المردودات",
      netRevenue: "صافي الإيرادات",
      change: "التغير عن الفترة السابقة",
      trend: "الاتجاه الشهري",
      byCourse: "الإيرادات حسب المقرر",
      byTeacher: "الإيرادات حسب المعلم",
      daily: "التفاصيل اليومية",
      date: "التاريخ",
      revenue: "الإيرادات",
      expenses: "المصروفات",
      refunds: "المردودات",
      closed: "مقفل",
      pending: "غير مقفل",
      unlockRequested: "طلب فتح",
      partialWarning: "تنبيه: الأيام التالية في الفترة غير مقفلة يومياً — أرقامها جزئية وقد تتغير",
      error: "فشل تحميل التقرير",
      empty: "لا توجد معاملات في هذه الفترة",
      sar: "ريال",
    },
    en: {
      totalRevenue: "Total Revenue",
      totalExpenses: "Total Expenses",
      totalRefunds: "Total Refunds",
      netRevenue: "Net Revenue",
      change: "Change vs Previous Period",
      trend: "Monthly Trend",
      byCourse: "Revenue by Course",
      byTeacher: "Revenue by Teacher",
      daily: "Daily Breakdown",
      date: "Date",
      revenue: "Revenue",
      expenses: "Expenses",
      refunds: "Refunds",
      closed: "Closed",
      pending: "Unclosed",
      unlockRequested: "Unlock Requested",
      partialWarning: "Warning: the following days in the period are not daily-closed — their figures are partial and may change",
      error: "Failed to load report",
      empty: "No transactions in this period",
      sar: "YER",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PnlData>("/reports/financial/pnl", {
        params: { start_date: start, end_date: end },
      });
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [start, end, t.error]);

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

  const statusLabel = (s?: string | null) =>
    s === "closed" ? t.closed : s === "unlock_requested" ? t.unlockRequested : t.pending;

  const summaryCards = [
    { label: t.totalRevenue, value: data.total_revenue, color: "text-emerald-600", icon: DollarSign },
    { label: t.totalExpenses, value: data.total_expenses, color: "text-red-600", icon: Target },
    { label: t.totalRefunds, value: data.total_refunds, color: "text-amber-600", icon: RotateCcw },
    { label: t.netRevenue, value: data.net_revenue, color: "text-blue-600", icon: TrendingUp },
  ];

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      {data.unclosed_days.length > 0 && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{t.partialWarning}</p>
            <p className="text-xs mt-1 flex flex-wrap gap-1.5">
              {data.unclosed_days.map((d) => (
                <span key={d} className="px-2 py-0.5 rounded bg-white border border-amber-200">
                  {formatDisplayDate(d, locale)}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
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
              <p className="text-[11px] text-slate-400 mt-1">
                {t.change}: {data.comparison.change_pct}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Monthly trend */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4">{t.trend}</h3>
        {data.monthly_trend.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">{t.empty}</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="revenue" name={t.revenue} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name={t.expenses} fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By course */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{t.byCourse}</h3>
          {data.by_course.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">{t.empty}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.by_course} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="course_name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" name={t.revenue} fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By teacher */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{t.byTeacher}</h3>
          {data.by_teacher.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">{t.empty}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.by_teacher} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="teacher_name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" name={t.revenue} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4">{t.daily}</h3>
        {data.daily_breakdown.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-start py-2 font-semibold">{t.date}</th>
                  <th className="text-end py-2 font-semibold">{t.revenue}</th>
                  <th className="text-end py-2 font-semibold">{t.expenses}</th>
                  <th className="text-end py-2 font-semibold">{t.refunds}</th>
                  <th className="text-end py-2 font-semibold">{t.closed}</th>
                </tr>
              </thead>
              <tbody>
                {data.daily_breakdown.map((row) => (
                  <tr key={row.date} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{formatDisplayDate(row.date, locale)}</td>
                    <td className="py-2 text-end text-emerald-600">{fmt(row.revenue)}</td>
                    <td className="py-2 text-end text-red-600">{fmt(row.expenses)}</td>
                    <td className="py-2 text-end text-amber-600">{fmt(row.refunds)}</td>
                    <td className="py-2 text-end">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.closure_status === "closed"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {statusLabel(row.closure_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}