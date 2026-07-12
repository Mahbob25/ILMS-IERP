"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import {
  Activity,
  Database,
  HardDrive,
  Clock,
  Shield,
  Users,
  BookOpen,
  DollarSign,
  Wallet,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  user_name: string | null;
  action: string;
  timestamp: string;
}

interface SuperadminDashboardData {
  total_students: number;
  total_courses: number;
  total_teachers: number;
  monthly_revenue: number;
  monthly_expenses: number;
  monthly_refunds: number;
  pending_unlock_requests: { date: string; requested_by: string | null }[];
  pending_withdrawals_count: number;
  system_health: { db_status: string; api_uptime: string };
  backup_status: string;
  recent_audit_logs: AuditLogEntry[];
}

export default function SuperadminDashboard() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const currencySymbol = locale === "ar" ? "ريال" : "YER";
  const [data, setData] = useState<SuperadminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    apiClient
      .get<SuperadminDashboardData>("/dashboard/superadmin")
      .then((res) => setData(res.data))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  const t = {
    ar: {
      db: "قاعدة البيانات",
      api: "حالة API",
      storage: "مساحة التخزين",
      backup: "آخر نسخة احتياطية",
      healthy: "سليم",
      na: "غير متاح",
      students: "إجمالي الطلاب",
      courses: "المقررات",
      teachers: "المعلمين",
      revenue: "الإيرادات الشهرية",
      expenses: "المصروفات الشهرية",
      refunds: "المردودات الشهرية",
      auditLogs: "سجل التدقيق",
      user: "المستخدم",
      action: "الإجراء",
      time: "الوقت",
      noLogs: "لا توجد سجلات",
    },
    en: {
      db: "Database",
      api: "API Status",
      storage: "Storage",
      backup: "Last Backup",
      healthy: "Healthy",
      na: "N/A",
      students: "Total Students",
      courses: "Courses",
      teachers: "Teachers",
      revenue: "Monthly Revenue",
      expenses: "Monthly Expenses",
      refunds: "Monthly Refunds",
      auditLogs: "Audit Log",
      user: "User",
      action: "Action",
      time: "Time",
      noLogs: "No audit logs",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 h-20" />
          ))}
        </div>
        <div className="card p-5 h-64" />
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
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.db}</p>
            <p className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              {data.system_health.db_status === "healthy" ? t.healthy : data.system_health.db_status}
            </p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.api}</p>
            <p className="text-sm font-semibold text-blue-600">{data.system_health.api_uptime}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <HardDrive size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.storage}</p>
            <p className="text-sm font-semibold text-slate-900">-</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.backup}</p>
            <p className="text-sm font-semibold text-slate-900">{data.backup_status || t.na}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_students}</p>
            <p className="text-xs text-slate-500">{t.students}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_courses}</p>
            <p className="text-xs text-slate-500">{t.courses}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_teachers}</p>
            <p className="text-xs text-slate-500">{t.teachers}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.monthly_revenue.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.revenue}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <RotateCcw size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.monthly_refunds.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.refunds}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.monthly_expenses.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.expenses}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-slate-500" />
          <span>{t.auditLogs}</span>
        </h3>
        {data.recent_audit_logs.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">{t.noLogs}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.user}</th>
                <th>{t.action}</th>
                <th>{t.time}</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_audit_logs.map((log) => (
                <tr key={log.id}>
                  <td className="font-medium text-slate-900">{log.user_name || "-"}</td>
                  <td className="text-slate-600">{log.action}</td>
                  <td className="text-slate-500 text-xs">
                    {new Date(log.timestamp).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
