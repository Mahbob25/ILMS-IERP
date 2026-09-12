"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, CalendarCheck, Award, Settings, Sparkles } from "lucide-react";

interface TabItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

interface Props {
  locale: "ar" | "en";
}

/**
 * Floating bottom navigation for small screens (below lg, where the sidebar
 * takes over).
 *
 * A translucent, blurred bar so the page keeps showing through it, two labelled
 * tabs on each side of a centre slot, and a gradient action button overhanging
 * the bar's top edge. Icons alone are ambiguous in a portal with this many
 * sections, so every tab carries its label.
 */
export default function MobileTabBar({ locale }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const s =
    locale === "ar"
      ? {
          dashboard: "الرئيسية",
          attendance: "الحضور",
          grades: "الدرجات",
          settings: "الإعدادات",
          ai: "اسأل الذكاء الاصطناعي",
        }
      : {
          dashboard: "Home",
          attendance: "Attendance",
          grades: "Grades",
          settings: "Settings",
          ai: "Ask AI",
        };

  const leftItems: TabItem[] = [
    { name: s.dashboard, href: `/${locale}/dashboard`, icon: LayoutDashboard },
    { name: s.attendance, href: `/${locale}/dashboard/attendance`, icon: CalendarCheck },
  ];
  const rightItems: TabItem[] = [
    { name: s.grades, href: `/${locale}/dashboard/grades`, icon: Award },
    { name: s.settings, href: `/${locale}/dashboard/settings`, icon: Settings },
  ];
  const fabHref = `/${locale}/dashboard/ai/explain`;

  const isActive = (href: string) => pathname === href;
  const isFabActive = pathname.startsWith("/dashboard/ai");

  const renderItem = (item: TabItem, active: boolean) => {
    const Icon = item.icon;
    return (
      <button
        key={item.name}
        onClick={() => router.push(item.href)}
        aria-label={item.name}
        aria-current={active ? "page" : undefined}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 py-1.5 min-h-11 rounded-2xl transition-colors duration-200"
      >
        <span
          className={`flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200 ${
            active ? "bg-brand-50 text-brand-600" : "text-slate-400"
          }`}
        >
          <Icon size={20} />
        </span>
        <span
          className={`text-[10px] leading-none font-medium transition-colors duration-200 ${
            active ? "text-brand-700" : "text-slate-400"
          }`}
        >
          {item.name}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label={locale === "ar" ? "التنقل السفلي" : "Bottom navigation"}
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden pb-[env(safe-area-inset-bottom)] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto mb-4 w-[calc(100%-1.5rem)] max-w-md">
        <div className="relative">
          {/* Glass bar. The centre slot stays empty so the FAB can sit above it. */}
          <div className="glass-panel flex items-center rounded-[26px] px-1.5 py-1.5 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)]">
            <div className="flex flex-1 items-center">
              {leftItems.map((item) => renderItem(item, isActive(item.href)))}
            </div>
            <div className="w-16 shrink-0" />
            <div className="flex flex-1 items-center">
              {rightItems.map((item) => renderItem(item, isActive(item.href)))}
            </div>
          </div>

          {/* Action button — centred on the bar and overhanging its top edge. */}
          <button
            onClick={() => router.push(fabHref)}
            aria-label={s.ai}
            aria-current={isFabActive ? "page" : undefined}
            className={`gradient-accent absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full text-white flex items-center justify-center ring-4 ring-white/80 shadow-hero transition-transform duration-150 active:scale-90 ${
              isFabActive ? "scale-105" : ""
            }`}
          >
            <Sparkles size={23} />
          </button>
        </div>
      </div>
    </nav>
  );
}
