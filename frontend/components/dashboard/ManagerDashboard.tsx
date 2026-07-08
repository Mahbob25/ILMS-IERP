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

interface PendingAmendment {
  id: string;
  contract_id: string;
  section_name: string;
  course_name: string;
  teacher_name: string;
  compensation_model: string | null;
  current_amount: number | null;
  requested_amount: number | null;
  reason: string;
  requested_by_name: string;
  requested_at: string;
}

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
  const currencySymbol = locale === "ar" ? "ريال" : "YER";
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [amendments, setAmendments] = useState<PendingAmendment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get<ManagerDashboardData>("/dashboard/manager").then((res) => setData(res.data)).catch(() => {}),
      apiClient.get<PendingAmendment[]>("/lms/amendments/pending").then((res) => setAmendments(res.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
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
          className="card p-5 flex items-center gap-4 group hover:ring-2 hover:ring-brand-200 transition-all text-end"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-slate-900">{data.monthly_revenue.toFixed(2)} {currencySymbol}</p>
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
            <p className="text-2xl font-bold text-slate-900">{data.monthly_expenses.toFixed(2)} {currencySymbol}</p>
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
          {data.pending_unlock_requests.length === 0 && data.pending_withdrawals_count === 0 && amendments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <CheckCircle size={40} className="mb-3 text-emerald-300" />
              <p className="text-sm">{t.noApprovals}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {amendments.map((am) => (
                <div key={am.id} className="py-2 px-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <DollarSign size={14} className="text-amber-500" />
                      <span className="text-sm font-medium text-slate-900">
                        {am.teacher_name} — {am.course_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          try {
                            await apiClient.put(`/lms/amendments/${am.id}/approve`);
                            setAmendments((prev) => prev.filter((a) => a.id !== am.id));
                          } catch { /* ignore */ }
                        }}
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-100"
                        title="Approve"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await apiClient.put(`/lms/amendments/${am.id}/reject`);
                            setAmendments((prev) => prev.filter((a) => a.id !== am.id));
                          } catch { /* ignore */ }
                        }}
                        className="p-1 rounded text-red-500 hover:bg-red-100"
                        title="Reject"
                      >
                        <AlertCircle size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 ms-6">
                    {am.compensation_model === "fixed"
                      ? `SAR ${am.current_amount ?? "—"} → SAR ${am.requested_amount ?? "—"}`
                      : `${am.current_amount ?? "—"}% → ${am.requested_amount ?? "—"}%`
                    }
                    <span className="mx-1">·</span>
                    {am.reason}
                  </div>
                </div>
              ))}
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
