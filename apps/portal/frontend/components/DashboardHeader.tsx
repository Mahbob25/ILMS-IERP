"use client";

import React, { useEffect, useRef, useState } from "react";
import { GraduationCap, Bell } from "lucide-react";
import type { PortalUser } from "@/components/AuthContext";

interface Props {
  locale: "ar" | "en";
  user: PortalUser | null;
  onOpenOverflow: () => void;
  /** Scroll container to watch (the dashboard <main>). Falls back to window. */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

const HEADER_HEIGHT = 64;

/**
 * Top app header — the fixed "roof" of the portal with a smart
 * hide-on-scroll behavior.
 *
 * Left: institute identity (logo icon + short name). Right: notification
 * bell with an unread dot + circular user avatar with initials fallback.
 *
 * The avatar opens the overflow sheet (Fees / Revision Plan / logout) so the
 * generic "..." button is gone; the bell is a visual placeholder for now.
 */
export default function DashboardHeader({ locale, user, onOpenOverflow, scrollRef }: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Smart hide-on-scroll is mobile-only; on md+ the header stays pinned.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setHidden(false);
      return;
    }

    let lastY = 0;
    const MIN_DELTA = 6;

    const onScroll = () => {
      const currentY = scrollRef?.current ? scrollRef.current.scrollTop : window.scrollY;
      if (Math.abs(currentY - lastY) < MIN_DELTA) return;

      if (currentY > lastY && currentY > HEADER_HEIGHT) {
        setHidden(true);
      } else if (currentY < lastY) {
        setHidden(false);
      }
      lastY = currentY;
    };

    onScroll();
    const target = (scrollRef?.current ?? window) as HTMLElement | Window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [isMobile, scrollRef]);

  const s =
    locale === "ar"
      ? {
          institute: "الدراسات",
          notifications: "الإشعارات",
          profile: "القائمة",
        }
      : {
          institute: "Al-Drasat",
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
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 w-full z-50 h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 md:px-6 transition-transform duration-300 ease-in-out md:translate-y-0 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Left — institute identity (swap-able icon for an image/SVG logo) */}
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
          <GraduationCap size={18} className="text-brand-600" />
        </div>
        <span className="text-lg font-semibold text-slate-800 leading-none">
          {s.institute}
        </span>
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
