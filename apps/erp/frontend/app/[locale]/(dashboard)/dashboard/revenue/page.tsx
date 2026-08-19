"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { sanitizeInput } from "@/lib/utils/input";
import EmptyState from "@/components/EmptyState";
import { Loader2, RefreshCw, TrendingUp, DollarSign, Target, Users, RotateCcw, AlertCircle } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

interface MonthlyTrend {
  month: string;
  revenue: number;
  expenses: number;
  refunds: number;
}

interface CourseRevenue {
  course_name: string;
  revenue: number;
  pct: number;
}

interface TeacherRevenue {
  teacher_name: string;
  revenue: number;
  pct: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;
  expenses: number;
  refunds: number;
}

interface RevenueComparison {
  current_period: number;
  previous_period: number;
  change_pct: number;
}

interface RevenueData {
  total_revenue: number;
  total_expenses: number;
  total_refunds: number;
  net_revenue: number;
  transaction_count: number;
  avg_per_student: number;
  comparison: RevenueComparison;
  monthly_trend: MonthlyTrend[];
  by_course: CourseRevenue[];
  by_teacher: TeacherRevenue[];
  daily_breakdown: DailyRevenue[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export default function RevenuePage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الإيرادات",
      subtitle: "تحليل مفصل للإيرادات والمصروفات",
      totalRevenue: "إجمالي الإيرادات",
      totalExpenses: "إجمالي المصروفات",
      totalRefunds: "إجمالي المردودات",
      netRevenue: "صافي الإيرادات",
      avgPerStudent: "متوسط الإيراد لكل طالب",
      transactionCount: "عدد المعاملات",
      change: "التغير عن الفترة السابقة",
      revenueByCourse: "الإيرادات حسب المقرر",
      revenueByTeacher: "الإيرادات حسب المعلم",
      monthlyTrend: "الاتجاه الشهري",
      dailyBreakdown: "التفاصيل اليومية",
      revenue: "الإيرادات",
      expenses: "المصروفات",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      days7: "7 أيام",
      days30: "30 يوم",
      days90: "90 يوم",
      thisYear: "هذه السنة",
      custom: "مخصص",
      from: "من",
      to: "إلى",
      apply: "تطبيق",
      noData: "لا توجد بيانات متاحة",
      sar: "ريال",
      course: "المقرر",
      teacher: "المعلم",
      amount: "المبلغ",
    },
    en: {
      title: "Revenue",
      subtitle: "Detailed revenue and expense analysis",
      totalRevenue: "Total Revenue",
      totalExpenses: "Total Expenses",
      totalRefunds: "Total Refunds",
      netRevenue: "Net Revenue",
      avgPerStudent: "Avg Revenue per Student",
      transactionCount: "Transactions",
      change: "Change from Previous Period",
      revenueByCourse: "Revenue by Course",
      revenueByTeacher: "Revenue by Teacher",
      monthlyTrend: "Monthly Trend",
      dailyBreakdown: "Daily Breakdown",
      revenue: "Revenue",
      expenses: "Expenses",
      loading: "Loading...",
      refresh: "Refresh",
      days7: "7 Days",
      days30: "30 Days",
      days90: "90 Days",
      thisYear: "This Year",
      custom: "Custom",
      from: "From",
      to: "To",
      apply: "Apply",
      noData: "No data available",
      sar: "YER",
      course: "Course",
      teacher: "Teacher",
      amount: "Amount",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "year" | "custom">("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [fetchKey, setFetchKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const getDateRange = useCallback(() => {
    const now = new Date();
    const toLocal = (d: Date) => d.toLocaleDateString("sv-SE");
    const end = toLocal(now);
    let start: string;
    switch (period) {
      case "7d":
        start = toLocal(new Date(now.getTime() - 7 * 86400000));
        break;
      case "30d":
        start = toLocal(new Date(now.getTime() - 30 * 86400000));
        break;
      case "90d":
        start = toLocal(new Date(now.getTime() - 90 * 86400000));
        break;
      case "year":
        start = `${now.getFullYear()}-01-01`;
        break;
      default:
        start = customFrom || toLocal(new Date(now.getTime() - 30 * 86400000));
    }
    return { start_date: start, end_date: customTo || end };
  }, [period, customFrom, customTo, fetchKey]);

  const fetchData = useCallback(async () => {
    const range = getDateRange();
    setFetchError(null);
    try {
      const res = await apiClient.get<RevenueData>("/lms/revenue", { params: range });
      setData(res.data);
    } catch {
      setData(null);
      setFetchError("Failed to fetch revenue data");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSubmitting(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchKey]);

  const handleRefresh = () => {
    if (submitting) return;
    setSubmitting(true);
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 h-80" />
          <div className="card p-5 h-80" />
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-medium text-slate-900 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-semibold">
            {p.name}: {Number(p.value).toFixed(2)} {t.sar}
          </p>
        ))}
      </div>
    );
  };

  const periodButtons = [
    { key: "7d", label: t.days7 },
    { key: "30d", label: t.days30 },
    { key: "90d", label: t.days90 },
    { key: "year", label: t.thisYear },
    { key: "custom", label: t.custom },
  ] as const;

  const dir = isRtl ? "rtl" : "ltr";

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.title}</h1>
          <p className="text-sm text-slate-500">{t.subtitle}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      {/* Period Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {periodButtons.map((btn) => (
          <button
            key={btn.key}
            disabled={submitting}
            onClick={() => { if (!submitting) { setPeriod(btn.key); setFetchKey((k) => k + 1); } }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              period === btn.key
                ? "bg-brand-50 text-brand-600 border-brand-200"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {btn.label}
          </button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2 ms-2">
            <input
              type="date"
              value={customFrom}
               onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomFrom(sanitizeInput(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <span className="text-xs text-slate-500">{t.to}</span>
            <input
              type="date"
              value={customTo}
               onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomTo(sanitizeInput(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <button
              onClick={() => { if (!submitting) { setSubmitting(true); setFetchKey((k) => k + 1); } }}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-semibold border border-brand-200"
            >
              {t.apply}
            </button>
          </div>
        )}
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="ms-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {!data ? (
        <EmptyState title={t.noData} message="" />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {data.total_revenue.toFixed(2)} {t.sar}
                </p>
                <p className="text-xs text-slate-500">{t.totalRevenue}</p>
                <p className="text-[10px] text-slate-400">{data.transaction_count} {t.transactionCount}</p>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {data.total_expenses.toFixed(2)} {t.sar}
                </p>
                <p className="text-xs text-slate-500">{t.totalExpenses}</p>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <RotateCcw size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {data.total_refunds.toFixed(2)} {t.sar}
                </p>
                <p className="text-xs text-slate-500">{t.totalRefunds}</p>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                data.net_revenue >= 0 ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
              }`}>
                <Target size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {data.net_revenue.toFixed(2)} {t.sar}
                </p>
                <p className="text-xs text-slate-500">{t.netRevenue}</p>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Users size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {data.avg_per_student.toFixed(2)} {t.sar}
                </p>
                <p className="text-xs text-slate-500">{t.avgPerStudent}</p>
                <p className={`text-[10px] ${data.comparison.change_pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {data.comparison.change_pct >= 0 ? "+" : ""}{data.comparison.change_pct}% {t.change}
                </p>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Monthly Trend */}
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t.monthlyTrend}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name={t.revenue} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name={t.expenses} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="refunds" stroke="#f59e0b" strokeWidth={2} name={t.totalRefunds} dot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by Course */}
            <div className="card p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t.revenueByCourse}</h3>
              {data.by_course.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">{t.noData}</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.by_course} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="course_name" width={120} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} name={t.amount} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by Teacher */}
            <div className="card p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t.revenueByTeacher}</h3>
              {data.by_teacher.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">{t.noData}</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={data.by_teacher}
                      dataKey="revenue"
                      nameKey="teacher_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ teacher_name, pct }: any) => `${teacher_name} (${pct}%)`}
                      labelLine={true}
                    >
                      {data.by_teacher.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Daily Breakdown */}
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t.dailyBreakdown}</h3>
              {data.daily_breakdown.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">{t.noData}</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.daily_breakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name={t.revenue} />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name={t.expenses} />
                    <Bar dataKey="refunds" fill="#f59e0b" radius={[4, 4, 0, 0]} name={t.totalRefunds} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
