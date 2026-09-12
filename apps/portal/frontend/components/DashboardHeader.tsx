"use client";

import React, { useEffect, useRef, useState } from "react";
import { GraduationCap, Bell } from "lucide-react";
import { useLastUpdated } from "@/components/LastUpdatedContext";
import { relativeTime } from "@/lib/utils/time";
import type { PortalUser } from "@/components/AuthContext";

interface Props {
  locale: "ar" | "en";
  user: PortalUser | null;
  onOpenOverflow: () => void;
  /** Scroll container to watch. Falls back to window when omitted. */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

const HEADER_HEIGHT = 72;

/**
 * Top app header — the fixed roof of the portal.
 *
 * Reading order follows the document direction: on the start side (right in
 * Arabic) the portal identity and the welcome line, which carries the subtle
 * "آخر تحديث" indicator published by whichever page is mounted. On the end side
 * the notification bell and the avatar, which opens the overflow sheet.
 *
 * Below lg the identity mark is shown here; from lg the sidebar carries it and
 * this header starts after the sidebar so the two never overlap.
 *
 * The greeting uses the given name only — the full name already sits in the
 * sidebar's user card, and repeating it there would be noise.
 */
export default function DashboardHeader({
  locale,
  user,
  onOpenOverflow,
  scrollRef,
}: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const { asOf } = useLastUpdated();

  // Smart hide-on-scroll is the small-screen behaviour; from lg the header and
  // sidebar both stay pinned.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = (e: MediaQueryListEvent) => setIsCompact(e.matches);
    setIsCompact(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isCompact) {
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
  }, [isCompact, scrollRef]);

  const s =
    locale === "ar"
      ? {
          institute: "الدراسات",
          welcome: "مرحبًا",
          notifications: "الإشعارات",
          profile: "القائمة",
          asOf: "آخر تحديث",
        }
      : {
          institute: "Al-Drasat",
          welcome: "Welcome",
          notifications: "Notifications",
          profile: "Menu",
          asOf: "Last updated",
        };

  const givenName = (user?.full_name || "").trim().split(/\s+/)[0] || "";

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
      className={`glass-panel fixed top-0 inset-x-0 lg:start-72 z-40 h-[72px] border-x-0 border-t-0 border-b border-slate-200/70 shadow-sm transition-transform duration-300 ease-in-out lg:translate-y-0 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        {/* Start side — identity + welcome + freshness */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="gradient-accent lg:hidden w-10 h-10 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-hero">
            <GraduationCap size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-none truncate">
              {s.institute}
            </h1>
            <div className="flex items-center gap-1.5 mt-1.5 min-w-0 text-[11px] text-slate-500">
              {givenName && (
                <span className="truncate">
                  {s.welcome}،{" "}
                  <span className="font-semibold text-slate-700">{givenName}</span>
                </span>
              )}
              {asOf && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-slate-400">{s.asOf}</span>
                    <span className="tabular text-slate-600">
                      {relativeTime(asOf, locale)}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* End side — actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            aria-label={s.notifications}
            className="relative w-10 h-10 rounded-full text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors duration-150 flex items-center justify-center"
          >
            <Bell size={19} />
            <span className="absolute top-2 end-2.5 w-2 h-2 rounded-full bg-brand-600 ring-2 ring-white" />
          </button>

          <button
            type="button"
            onClick={onOpenOverflow}
            aria-label={s.profile}
            className="gradient-accent w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center shadow-hero transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
}
