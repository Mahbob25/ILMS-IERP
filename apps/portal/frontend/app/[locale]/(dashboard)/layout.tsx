"use client";

import React, { useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import { LastUpdatedProvider } from "@/components/LastUpdatedContext";
import MobileTabBar from "@/components/MobileTabBar";
import OverflowSheet from "@/components/OverflowSheet";
import DashboardHeader from "@/components/DashboardHeader";
import {
  LayoutDashboard,
  Award,
  CalendarCheck,
  Wallet,
  Sparkles,
  LogOut,
  User as UserIcon,
  GraduationCap,
  BookOpen,
  CalendarRange,
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
  const portalLocale: "ar" | "en" = isRtl ? "ar" : "en";

  // The avatar shows the student being viewed. Held until the session is
  // confirmed — this layout mounts before /auth/me resolves, and an
  // unauthenticated /me here would trigger a refresh-then-redirect cycle.
  const { selectedStudent } = useLinkedStudents(portalLocale, !loading && !!user);

  const t = {
    ar: {
      logout: "تسجيل الخروج",
      dashboard: "نظرة عامة",
      courses: "مقرراتي",
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
      courses: "My Courses",
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
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 p-4">
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
      const marketingBase = process.env.NEXT_PUBLIC_MARKETING_URL || "https://aldirasat.vercel.app";
      window.location.href = `${marketingBase}/${locale}/login`;
    }
    return null;
  }

  const navigationItems = [
    { name: t.dashboard, href: `/${locale}/dashboard`, icon: LayoutDashboard },
    { name: t.courses, href: `/${locale}/dashboard/courses`, icon: BookOpen },
    { name: t.grades, href: `/${locale}/dashboard/grades`, icon: Award },
    { name: t.attendance, href: `/${locale}/dashboard/attendance`, icon: CalendarCheck },
    { name: t.fees, href: `/${locale}/dashboard/fees`, icon: Wallet },
    { name: t.aiExplain, href: `/${locale}/dashboard/ai/explain`, icon: Sparkles },
    { name: t.aiRevision, href: `/${locale}/dashboard/ai/revision`, icon: CalendarRange },
    { name: t.settings, href: `/${locale}/dashboard/settings`, icon: UserIcon },
  ];

  return (
    <LastUpdatedProvider>
      <div className="min-h-screen bg-canvas">
        {/* Side navigation — pinned to the inline-start edge (the right in
            Arabic), so it stays put while the document scrolls. */}
        <aside className="hidden lg:flex fixed inset-y-0 start-0 z-40 w-72 flex-col bg-white/85 backdrop-blur-xl border-e border-slate-200/70">
          <div className="h-[72px] flex items-center gap-3 px-6 shrink-0 border-b border-slate-200/70">
            <div className="gradient-accent w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-hero shrink-0">
              <GraduationCap size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 leading-none truncate">
                {isRtl ? "الدراسات" : "Al-Drasat"}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 truncate">{t.portalLabel}</p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-brand-50 text-brand-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="gradient-accent absolute inset-y-1.5 start-0 w-1 rounded-full"
                    />
                  )}
                  <Icon size={19} className="shrink-0" />
                  <span className="truncate">{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200/70 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="gradient-accent w-10 h-10 rounded-2xl text-white font-bold text-sm flex items-center justify-center shrink-0">
                {(user.full_name || "؟").trim().charAt(0).toUpperCase()}
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
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold border border-rose-100 transition-all duration-150"
            >
              <LogOut size={14} />
              <span>{t.logout}</span>
            </button>
          </div>
        </aside>

        {/* Content column — offset by the sidebar width and the fixed header. */}
        <div className="lg:ps-72">
          <DashboardHeader
            locale={portalLocale}
            user={user}
            onOpenOverflow={() => setOverflowOpen(true)}
            avatarUrl={selectedStudent?.photo_url}
          />

          {/* pb-28 keeps the last card clear of the floating bottom nav and its
              overhanging centre button; lg+ has no bottom nav. */}
          <main className="pt-[72px] pb-28 lg:pb-12">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </main>
        </div>

        <MobileTabBar locale={isRtl ? "ar" : "en"} />

        <OverflowSheet
          open={overflowOpen}
          onClose={() => setOverflowOpen(false)}
          user={user}
          onLogout={logout}
        />
      </div>
    </LastUpdatedProvider>
  );
}
