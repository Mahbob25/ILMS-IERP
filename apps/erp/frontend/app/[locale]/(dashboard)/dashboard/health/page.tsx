"use client";

import React from "react";
import { useParams } from "next/navigation";
import {
  Database,
  Activity,
  HardDrive,
  Cpu,
  Gauge,
  Users,
  GraduationCap,
  BookOpen,
  AlertCircle,
  Info,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import useSystemHealth, {
  percentColor,
  percentBg,
  formatGB,
} from "@/hooks/useSystemHealth";

export default function HealthPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";

  const { data, loading, error, refetch: fetchHealth } = useSystemHealth();

  const t = {
    ar: {
      title: "صحة النظام",
      dbStatus: "قاعدة البيانات",
      apiUptime: "وقت تشغيل API",
      storage: "مساحة التخزين",
      memory: "الذاكرة",
      cpu: "المعالج",
      totalUsers: "إجمالي المستخدمين",
      totalStudents: "إجمالي الطلاب",
      totalCourses: "إجمالي المقررات",
      totalEnrollments: "إجمالي التسجيلات",
      serviceInfo: "معلومات الخدمة",
      version: "الإصدار",
      uptime: "وقت التشغيل",
      lastBackup: "آخر نسخة احتياطية",
      connected: "متصل",
      disconnected: "غير متصل",
      na: "غير متاح",
      retry: "إعادة المحاولة",
      error: "فشل تحميل بيانات صحة النظام",
    },
    en: {
      title: "System Health",
      dbStatus: "Database",
      apiUptime: "API Uptime",
      storage: "Storage",
      memory: "Memory",
      cpu: "CPU",
      totalUsers: "Total Users",
      totalStudents: "Total Students",
      totalCourses: "Total Courses",
      totalEnrollments: "Total Enrollments",
      serviceInfo: "Service Info",
      version: "Version",
      uptime: "Uptime",
      lastBackup: "Last Backup",
      connected: "Connected",
      disconnected: "Disconnected",
      na: "N/A",
      retry: "Retry",
      error: "Failed to load system health data",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 w-40 bg-slate-200 rounded" />
          <div className="h-8 w-8 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-20" />
          ))}
        </div>
        <div className="card p-5 h-32" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium mb-4">{t.error}</p>
        <button
          onClick={fetchHealth}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const dbConnected = data.db_status === "connected";

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t.title}</h1>
        </div>
        <RefreshButton onRefresh={fetchHealth} />
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${
              dbConnected ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            } flex items-center justify-center shrink-0`}
          >
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.dbStatus}</p>
            <p
              className={`text-sm font-semibold flex items-center gap-1 ${
                dbConnected ? "text-emerald-600" : "text-red-600"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  dbConnected ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {dbConnected ? t.connected : t.disconnected}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.apiUptime}</p>
            <p className="text-sm font-semibold text-blue-600">{data.api_uptime}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${percentBg(data.disk_usage_percent)} flex items-center justify-center shrink-0`}
          >
            <HardDrive size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.storage}</p>
            <p className={`text-sm font-bold ${percentColor(data.disk_usage_percent)}`}>
              {data.disk_usage_percent}%
            </p>
            <p className="text-xs text-slate-400">
              {formatGB(data.disk_used_gb)} / {formatGB(data.disk_total_gb)}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${percentBg(data.memory_percent)} flex items-center justify-center shrink-0`}
          >
            <Cpu size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.memory}</p>
            <p className={`text-sm font-bold ${percentColor(data.memory_percent)}`}>
              {data.memory_percent}%
            </p>
            <p className="text-xs text-slate-400">
              {formatGB(data.memory_used_gb)} / {formatGB(data.memory_total_gb)}
            </p>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${percentBg(data.cpu_percent)} flex items-center justify-center shrink-0`}
          >
            <Gauge size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.cpu}</p>
            <p className={`text-sm font-bold ${percentColor(data.cpu_percent)}`}>
              {data.cpu_percent}%
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_users}</p>
            <p className="text-xs text-slate-500">{t.totalUsers}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <GraduationCap size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_students}</p>
            <p className="text-xs text-slate-500">{t.totalStudents}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.total_courses + data.total_enrollments}</p>
            <p className="text-xs text-slate-500">{t.totalCourses} + {t.totalEnrollments}</p>
          </div>
        </div>
      </div>

      {/* Service info */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Info size={16} className="text-slate-500" />
          <span>{t.serviceInfo}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">{t.version}</p>
            <p className="text-sm font-semibold text-slate-900">{data.service} v{data.version}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.uptime}</p>
            <p className="text-sm font-semibold text-blue-600">{data.api_uptime}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.lastBackup}</p>
            <p className="text-sm font-semibold text-slate-900">
              {data.last_backup
                ? new Date(data.last_backup).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")
                : t.na}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t.dbStatus}</p>
            <p
              className={`text-sm font-semibold flex items-center gap-1 ${
                dbConnected ? "text-emerald-600" : "text-red-600"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  dbConnected ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {dbConnected ? t.connected : t.disconnected}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
