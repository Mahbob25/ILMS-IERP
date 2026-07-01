"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import {
  Users,
  BookOpen,
  DollarSign,
  Wallet,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UnlockRequest {
  date: string;
  requested_by: string | null;
}

interface ManagerDashboardData {
  total_students: number;
  total_courses: number;
  total_teachers: number;
  monthly_revenue: number;
  monthly_expenses: number;
  pending_unlock_requests: UnlockRequest[];
  pending_withdrawals_count: number;
  recent_activity_count: number;
}

export default function ManagerDashboard() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<ManagerDashboardData>("/dashboard/manager")
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const t = {
    ar: {
      students: "إجمالي الطلاب",
      courses: "المقررات النشطة",
      revenue: "الإيرادات الشهرية",
      expenses: "المصروفات الشهرية",
      pendingApprovals: "طلبات الموافقة",
      unlockRequests: "طلب فتح إغلاق",
      withdrawals: "سحوبات معلقة",
      recentActivity: "نشاطات هذا الشهر",
      noApprovals: "لا توجد طلبات معلقة",
      revVsExp: "الإيرادات vs المصروفات",
    },
    en: {
      students: "Total Students",
      courses: "Active Courses",
      revenue: "Monthly Revenue",
      expenses: "Monthly Expenses",
      pendingApprovals: "Pending Approvals",
      unlockRequests: "Unlock Requests",
      withdrawals: "Pending Withdrawals",
      recentActivity: "This Month's Activity",
      noApprovals: "No pending requests",
      revVsExp: "Revenue vs Expenses",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 h-64" />
          <div className="card p-5 h-64" />
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

  const chartData = [
    { name: locale === "ar" ? "الإيرادات" : "Revenue", value: data.monthly_revenue },
    { name: locale === "ar" ? "المصروفات" : "Expenses", value: data.monthly_expenses },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.total_students}</p>
            <p className="text-xs text-slate-500">{t.students}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.total_courses}</p>
            <p className="text-xs text-slate-500">{t.courses}</p>
          </div>
        </div>
        <button
          onClick={() => router.push(`/${locale}/dashboard/revenue`)}
          className="card p-5 flex items-center gap-4 group hover:ring-2 hover:ring-brand-200 transition-all text-right"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-slate-900">{data.monthly_revenue.toFixed(2)}</p>
            <p className="text-xs text-slate-500">{t.revenue}</p>
          </div>
          <span className="text-[10px] text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {locale === "ar" ? "عرض التفاصيل ←" : "View Details →"}
          </span>
        </button>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Wallet size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.monthly_expenses.toFixed(2)}</p>
            <p className="text-xs text-slate-500">{t.expenses}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{t.revVsExp}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            <span>{t.pendingApprovals}</span>
          </h3>
          {data.pending_unlock_requests.length === 0 && data.pending_withdrawals_count === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <CheckCircle size={40} className="mb-3 text-emerald-300" />
              <p className="text-sm">{t.noApprovals}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.pending_unlock_requests.map((req) => (
                <div key={req.date} className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" />
                    <span className="text-sm font-medium text-slate-900">{t.unlockRequests}: {req.date}</span>
                  </div>
                </div>
              ))}
              {data.pending_withdrawals_count > 0 && (
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Wallet size={16} className="text-amber-500" />
                    <span className="text-sm font-medium text-slate-900">{t.withdrawals}: {data.pending_withdrawals_count}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.recent_activity_count}</p>
            <p className="text-xs text-slate-500">{t.recentActivity}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
