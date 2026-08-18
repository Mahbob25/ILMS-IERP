"use client";

import React, { useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import MobileTabBar from "@/components/MobileTabBar";
import OverflowSheet, { MoreHorizontal } from "@/components/OverflowSheet";
import {
  LayoutDashboard,
  Award,
  CalendarCheck,
  Wallet,
  Sparkles,
  LogOut,
  User as UserIcon,
  GraduationCap,
} from "lucide-react";

export default function PortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      logout: "تسجيل الخروج",
      dashboard: "نظرة عامة",
      grades: "الدرجات",
      attendance: "الحضور",
      fees: "الرسوم الدراسية",
      aiExplain: "اسأل الذكاء الاصطناعي",
      aiRevision: "خطة المذاكرة (قريبًا)",
      settings: "الإعدادات",
      loading: "جاري تحميل بيانات الجلسة...",
      portalLabel: "بوابة الطلاب",
    },
    en: {
      logout: "Log Out",
      dashboard: "Overview",
      grades: "Grades",
      attendance: "Attendance",
      fees: "Tuition Fees",
      aiExplain: "Ask AI",
      aiRevision: "Revision Plan (soon)",
      settings: "Settings",
      loading: "Loading session data...",
      portalLabel: "Student Portal",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 p-4">
        <svg
          className="animate-spin h-8 w-8 text-brand-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm text-slate-500 font-medium">{t.loading}</span>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = `${process.env.NEXT_PUBLIC_ERP_URL || window.location.origin}/${locale}/login`;
    }
    return null;
  }

  const navigationItems = [
    {
      name: t.dashboard,
      href: `/${locale}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      name: t.grades,
      href: `/${locale}/dashboard/grades`,
      icon: Award,
    },
    {
      name: t.attendance,
      href: `/${locale}/dashboard/attendance`,
      icon: CalendarCheck,
    },
    {
      name: t.fees,
      href: `/${locale}/dashboard/fees`,
      icon: Wallet,
    },
    {
      name: t.aiExplain,
      href: `/${locale}/dashboard/ai/explain`,
      icon: Sparkles,
    },
    {
      name: t.aiRevision,
      href: `/${locale}/dashboard/ai/revision`,
      icon: CalendarRangeIcon,
    },
    {
      name: t.settings,
      href: `/${locale}/dashboard/settings`,
      icon: UserIcon,
    },
  ];

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-shrink-0">
        <div className="w-64 bg-white border-y-0 border-x border-slate-200 flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-slate-200 gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
              <GraduationCap size={18} className="text-brand-600" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              Al-Drasat
            </span>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-brand-50 text-brand-600 border border-brand-100"
                      : "text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
                <UserIcon size={18} className="text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {user.full_name}
                </p>
                <p className="text-xs text-slate-500 truncate" dir="ltr">
                  {user.phone || user.email}
                </p>
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
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-white shadow-sm border-x-0 border-b border-slate-200 flex items-center justify-between px-4 md:px-6 relative z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 border border-brand-100 text-xs font-semibold">
              <GraduationCap size={14} />
              <span>{t.portalLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Overflow trigger — mobile only; desktop uses the sidebar footer */}
            <button
              onClick={() => setOverflowOpen(true)}
              aria-label={t.fees}
              className="md:hidden btn-touch justify-center p-2 rounded-lg bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 min-w-0">{children}</main>
      </div>

      {/* Floating bottom nav (mobile only) */}
      <MobileTabBar locale={isRtl ? "ar" : "en"} />

      {/* Header overflow sheet/dropdown */}
      <OverflowSheet
        open={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        user={user}
        onLogout={logout}
      />
    </div>
  );
}

// Revision Plan uses the CalendarRange icon (matches the page itself).
import { CalendarRange as CalendarRangeIcon } from "lucide-react";
