"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import {
  Shield,
  Clock,
  Sparkles,
  BookOpen,
  Users,
  CheckCircle,
  HelpCircle
} from "lucide-react";

export default function DashboardPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";

  const t = {
    ar: {
      welcome: "مرحباً بك،",
      subheading: "لوحة التحكم الرئيسية لنظام LIMS التعليمي الموحد.",
      stats: {
        usersTitle: "إدارة المستخدمين",
        usersDesc: "تعديل وإضافة الطواقم التعليمية والمسؤولين",
        coursesTitle: "المقررات والمواد",
        coursesDesc: "استعراض الهيكل الدراسي والمقررات المفعلة",
        ingestionTitle: "معالجة المناهج",
        ingestionDesc: "تحميل واستيراد ملفات المقررات الدراسية",
        backupsTitle: "النسخ الاحتياطية",
        backupsDesc: "النسخ التلقائي لقاعدة البيانات (RPO = ساعتان)"
      },
      cards: {
        profileTitle: "تفاصيل الحساب الحالي",
        role: "الدور الوظيفي",
        email: "البريد الإلكتروني",
        status: "حالة الحساب",
        active: "نشط",
        setupInfo: "مستندات تهيئة النظام",
        setupDesc: "يمكنك التحقق من ملفات التوثيق مثل build_plan.md و memory.md لتتبع مراحل التطوير الحالية."
      },
      auditTitle: "مستكشف الأحداث الأخيرة",
      auditPlaceholder: "سوف تظهر سجلات التدقيق (Audit Logs) المفصلة هنا عند بدء عمليات النظام."
    },
    en: {
      welcome: "Welcome back,",
      subheading: "LIMS unified education management console.",
      stats: {
        usersTitle: "User Accounts",
        usersDesc: "Manage system administrators, teachers, and student rosters.",
        coursesTitle: "Courses & Curriculums",
        coursesDesc: "Review academic courses, semesters, and active schedules.",
        ingestionTitle: "Curriculum Ingestion",
        ingestionDesc: "Upload core books to extract course structures via AI.",
        backupsTitle: "Database Backups",
        backupsDesc: "High-frequency DB backup logs (RPO = 2 hours)."
      },
      cards: {
        profileTitle: "User Profile Details",
        role: "Job Role",
        email: "Email Address",
        status: "Account Status",
        active: "Active",
        setupInfo: "System Configuration Specs",
        setupDesc: "Review documentation files build_plan.md and memory.md under the docs/ folder to check construction steps."
      },
      auditTitle: "Recent Security Audit Logs",
      auditPlaceholder: "Detailed action audit trails will populate here as system operations proceed."
    }
  }[locale === "en" ? "en" : "ar"];

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-50 to-white p-6 md:p-8 border border-brand-100 shadow-sm">
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 rounded-full bg-brand-100/50 blur-[80px]" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-brand-700 bg-brand-100 w-fit px-3 py-1 rounded-full text-xs font-semibold mb-4">
            <Sparkles size={14} className="animate-pulse" />
            <span>Phase 1 Verified System Ready</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            {t.welcome} {user.full_name}
          </h2>
          <p className="text-sm md:text-base text-slate-600 mt-2 max-w-xl">
            {t.subheading}
          </p>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 transition-all duration-200 hover:border-blue-200 hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <Users size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">{t.stats.usersTitle}</h3>
            <p className="text-xs text-slate-500 mt-1.5">{t.stats.usersDesc}</p>
          </div>
        </div>

        <div className="card p-5 transition-all duration-200 hover:border-emerald-200 hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <BookOpen size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">{t.stats.coursesTitle}</h3>
            <p className="text-xs text-slate-500 mt-1.5">{t.stats.coursesDesc}</p>
          </div>
        </div>

        <div className="card p-5 transition-all duration-200 hover:border-ai-200 hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-ai-50 text-ai-600 flex items-center justify-center mb-4">
              <Clock size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">{t.stats.ingestionTitle}</h3>
            <p className="text-xs text-slate-500 mt-1.5">{t.stats.ingestionDesc}</p>
          </div>
        </div>

        <div className="card p-5 transition-all duration-200 hover:border-brand-200 hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
              <Shield size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">{t.stats.backupsTitle}</h3>
            <p className="text-xs text-slate-500 mt-1.5">{t.stats.backupsDesc}</p>
          </div>
        </div>
      </div>

      {/* Profile & Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-2 card p-5 md:p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <CheckCircle className="text-brand-500" size={20} />
              <span>{t.cards.profileTitle}</span>
            </h3>
            
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-4 py-3 border-b border-slate-100">
                <span className="text-sm text-slate-500 font-medium">{t.cards.role}</span>
                <span className="text-sm text-slate-900 col-span-2 font-semibold capitalize">{user.role.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-3 border-b border-slate-100">
                <span className="text-sm text-slate-500 font-medium">{t.cards.email}</span>
                <span className="text-sm text-slate-900 col-span-2 font-semibold truncate">{user.email}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-3">
                <span className="text-sm text-slate-500 font-medium">{t.cards.status}</span>
                <div className="col-span-2">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold flex items-center gap-1.5 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t.cards.active}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation / Info Card */}
        <div className="card p-5 md:p-6 flex flex-col justify-between border-brand-200 bg-brand-50/30">
          <div>
            <h3 className="text-base font-bold text-brand-700 mb-3 flex items-center gap-2">
              <HelpCircle size={20} />
              <span>{t.cards.setupInfo}</span>
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t.cards.setupDesc}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-brand-100 text-xs text-slate-500">
            PostgreSQL: <span className="text-slate-700 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">Running (pgvector enabled)</span>
          </div>
        </div>
      </div>

      {/* Audit Log Placeholder */}
      <div className="card p-5 md:p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">{t.auditTitle}</h3>
        <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 border-dashed text-center">
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {t.auditPlaceholder}
          </p>
        </div>
      </div>
    </div>
  );
}
