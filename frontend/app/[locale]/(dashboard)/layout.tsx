"use client";

import React, { useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import {
  Users,
  BookOpen,
  Settings,
  Database,
  FileText,
  Activity,
  LogOut,
  Globe,
  Menu,
  X,
  User as UserIcon,
  ShieldCheck,
  Calendar,
  BookMarked,
  GraduationCap,
  ClipboardList,
  ClipboardCheck,
  Award
} from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  // Simple translations for shell components
  const t = {
    ar: {
      logout: "تسجيل الخروج",
      roles: {
        superadmin: "مدير خارق",
        admin: "مسؤول النظام",
        teacher: "معلم"
      },
      menu: {
        dashboard: "لوحة التحكم",
        users: "المستخدمين",
        terms: "الفصول الدراسية",
        courses: "المقررات",
        sections: "الشعب الدراسية",
        students: "الطلاب",
        enrollments: "التسجيلات",
        attendance: "الحضور",
        gradebook: "سجل الدرجات",
        ingestion: "استيراد المناهج",
        systemHealth: "صحة النظام",
        backups: "النسخ الاحتياطي",
        settings: "الإعدادات"
      },
      loading: "جاري تحميل بيانات الجلسة...",
      langToggle: "English"
    },
    en: {
      logout: "Log Out",
      roles: {
        superadmin: "Super Admin",
        admin: "Administrator",
        teacher: "Teacher"
      },
      menu: {
        dashboard: "Dashboard",
        users: "User Management",
        terms: "Academic Terms",
        courses: "Courses",
        sections: "Course Sections",
        students: "Students",
        enrollments: "Enrollments",
        attendance: "Attendance",
        gradebook: "Gradebook",
        ingestion: "Curriculum Ingestion",
        systemHealth: "System Health",
        backups: "Database Backups",
        settings: "Settings"
      },
      loading: "Loading session data...",
      langToggle: "العربية"
    }
  }[locale === "en" ? "en" : "ar"];

  const handleLanguageToggle = () => {
    const targetLocale = locale === "ar" ? "en" : "ar";
    // Replace current locale prefix in pathname
    const newPath = pathname.replace(`/${locale}`, `/${targetLocale}`);
    router.push(newPath);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 p-4">
        <svg className="animate-spin h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm text-slate-500 font-medium">{t.loading}</span>
      </div>
    );
  }

  // Redirect to login if user not authenticated
  if (!user) {
    if (typeof window !== "undefined") {
      router.push(`/${locale}/login`);
    }
    return null;
  }

  // Sidebar navigation items based on User Role
  const navigationItems = [
    {
      name: t.menu.dashboard,
      href: `/${locale}/dashboard`,
      icon: Activity,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.users,
      href: `/${locale}/dashboard/users`,
      icon: Users,
      roles: ["superadmin", "admin"]
    },
    {
      name: t.menu.terms,
      href: `/${locale}/dashboard/terms`,
      icon: Calendar,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.courses,
      href: `/${locale}/dashboard/courses`,
      icon: BookOpen,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.sections,
      href: `/${locale}/dashboard/sections`,
      icon: BookMarked,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.students,
      href: `/${locale}/dashboard/students`,
      icon: GraduationCap,
      roles: ["superadmin", "admin"]
    },
    {
      name: t.menu.enrollments,
      href: `/${locale}/dashboard/enrollments`,
      icon: ClipboardList,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.attendance,
      href: `/${locale}/dashboard/attendance`,
      icon: ClipboardCheck,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.gradebook,
      href: `/${locale}/dashboard/gradebook`,
      icon: Award,
      roles: ["superadmin", "admin", "teacher"]
    },
    {
      name: t.menu.ingestion,
      href: `/${locale}/dashboard/ingestion`,
      icon: FileText,
      roles: ["superadmin", "teacher"]
    },
    {
      name: t.menu.systemHealth,
      href: `/${locale}/dashboard/health`,
      icon: Activity,
      roles: ["superadmin"]
    },
    {
      name: t.menu.backups,
      href: `/${locale}/dashboard/backups`,
      icon: Database,
      roles: ["superadmin"]
    },
    {
      name: t.menu.settings,
      href: `/${locale}/dashboard/settings`,
      icon: Settings,
      roles: ["superadmin", "admin", "teacher"]
    }
  ].filter(item => item.roles.includes(user.role?.name ?? "") || (user.is_superadmin && item.roles.includes("superadmin")));

  const currentRoleLabel = user.is_superadmin
    ? t.roles.superadmin
    : t.roles[user.role?.name as keyof typeof t.roles] || user.role?.name || "N/A";

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:flex-shrink-0">
        <div className="w-64 bg-white border-y-0 border-x border-slate-200 flex flex-col">
          {/* Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-slate-200">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              LIMS Core Portal
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-brand-50 text-brand-600 border border-brand-100"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          {/* User profile footer */}
          <div className="p-4 border-t border-slate-200 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
                <UserIcon size={18} className="text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold border border-red-100 transition-all duration-150"
            >
              <LogOut size={14} />
              <span>{t.logout}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white shadow-sm border-x-0 border-b border-slate-200 flex items-center justify-between px-4 md:px-6 relative z-10 shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
            >
              <Menu size={20} />
            </button>

            {/* Quick Status / Role Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs font-semibold">
              <ShieldCheck size={14} />
              <span>{currentRoleLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switch */}
            <button
              onClick={handleLanguageToggle}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors duration-150 py-1.5 px-3 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-200"
            >
              <Globe size={13} />
              <span>{t.langToggle}</span>
            </button>
          </div>
        </header>

        {/* Dynamic Route Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative z-0">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop overlay */}
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />

          {/* Drawer content panel */}
          <div className={`relative w-64 max-w-xs bg-white border-slate-200 shadow-xl flex flex-col z-10 h-full ${
            isRtl ? "mr-0 ml-auto border-l" : "ml-0 mr-auto border-r"
          } transition-transform duration-300`}>
            {/* Close button */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
              <span className="text-lg font-bold tracking-tight text-slate-900">LIMS Core Portal</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-500 hover:text-slate-900">
                <X size={20} />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      router.push(item.href);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-brand-50 text-brand-600 border border-brand-100"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>

            {/* Mobile Footer */}
            <div className="p-4 border-t border-slate-200 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
                  <UserIcon size={18} className="text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold border border-red-100 transition-all duration-150"
              >
                <LogOut size={14} />
                <span>{t.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
