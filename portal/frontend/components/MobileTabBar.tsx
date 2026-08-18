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
 * Floating pill bottom nav (mobile only, below md).
 *
 * Structure: two standard icon buttons on the left, an elevated circular FAB
 * in a true center cutout, two standard icon buttons on the right.
 *
 * The notch is REAL negative space, not an overlap: the pill's background is
 * clipped with `.navbar-notch` (a radial-gradient circle XOR'd out of the
 * solid pill via mask-composite), so the white bar curves inward around the
 * bottom half of the FAB. The FAB sits in the flow at the top center,
 * overflow-visible, so the bar's masked edge wraps it seamlessly.
 *
 * Theming is semantic only — bg-white / bg-primary / text-primary /
 * text-slate-400 — no hardcoded hex.
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
        className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-11"
      >
        <Icon
          size={22}
          className={`transition-colors duration-200 ${active ? "text-primary" : "text-slate-400"}`}
        />
        {/* Small circular active dot — keyed on pathname so it re-pops on route change */}
        {active && (
          <span
            key={pathname}
            className="w-1 h-1 rounded-full bg-primary animate-dot-pop"
          />
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label={locale === "ar" ? "التنقل السفلي" : "Bottom navigation"}
      className="fixed bottom-0 inset-x-0 z-40 md:hidden pb-[env(safe-area-inset-bottom)] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto mb-4 w-[calc(100%-2rem)] max-w-md">
        <div className="relative overflow-visible animate-slide-up">
          {/* Masked pill — the notch is carved out of this background */}
          <div className="navbar-notch relative rounded-full bg-white border border-slate-200 shadow-lg shadow-slate-900/5 px-4 pt-4 pb-2 flex items-center">
            {/* Left group */}
            <div className="flex flex-1 items-center">
              {leftItems.map((item) => renderItem(item, isActive(item.href)))}
            </div>

            {/* Center FAB — in flow at the top center; the mask curves around it */}
            <div className="relative w-14 h-0 shrink-0 flex justify-center">
              <button
                onClick={() => router.push(fabHref)}
                aria-label={s.ai}
                aria-current={isFabActive ? "page" : undefined}
                className={`absolute top-0 -translate-y-1/2 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 transition-transform duration-150 active:scale-90 ${
                  isFabActive ? "ring-4 ring-primary/20" : ""
                }`}
              >
                <Sparkles size={24} />
              </button>
            </div>

            {/* Right group */}
            <div className="flex flex-1 items-center">
              {rightItems.map((item) => renderItem(item, isActive(item.href)))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
