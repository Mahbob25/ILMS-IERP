"use client";

import React from "react";
import { GraduationCap, Bell } from "lucide-react";
import type { PortalUser } from "@/components/AuthContext";

interface Props {
  locale: "ar" | "en";
  user: PortalUser | null;
  onOpenOverflow: () => void;
}

/**
 * Top app header — the fixed "roof" of the portal.
 *
 * Left: identity badge (structured so it can be swapped for an image/SVG logo
 * without affecting vertical alignment). Right: notification bell with an
 * unread dot + circular user avatar with initials fallback.
 *
 * The avatar opens the overflow sheet (Fees / Revision Plan / logout) so the
 * generic "..." button is gone; the bell is a visual placeholder for now.
 */
export default function DashboardHeader({ locale, user, onOpenOverflow }: Props) {
  const s =
    locale === "ar"
      ? {
          portalLabel: "بوابة الطلاب",
          notifications: "الإشعارات",
          profile: "القائمة",
        }
      : {
          portalLabel: "Student Portal",
          notifications: "Notifications",
          profile: "Menu",
        };

  const initials = (() => {
    if (!user?.full_name) return "؟";
    const parts = user.full_name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "؟";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  return (
    <header className="h-16 bg-white border-x-0 border-b border-slate-200 shadow-sm flex items-center justify-between px-4 md:px-6 relative z-10 shrink-0">
      {/* Left — identity badge (swap-able for an image/SVG logo) */}
      <div className="flex items-center">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 border border-brand-100 text-xs font-semibold">
          <GraduationCap size={14} className="shrink-0" />
          <span className="leading-none">{s.portalLabel}</span>
        </div>
      </div>

      {/* Right — user context & actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Notification bell — dot simulates unread; panel ships with Phase 4 */}
        <button
          type="button"
          aria-label={s.notifications}
          className="relative p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-150"
        >
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white" />
        </button>

        {/* User avatar — initials fallback; opens the overflow sheet */}
        <button
          type="button"
          onClick={onOpenOverflow}
          aria-label={s.profile}
          className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 text-brand-600 font-bold text-sm flex items-center justify-center hover:bg-brand-100 transition-colors duration-150"
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
