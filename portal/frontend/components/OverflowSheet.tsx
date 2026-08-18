"use client";

import React, { useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Wallet, CalendarRange, LogOut, Bell, User as UserIcon, X } from "lucide-react";
import type { PortalUser } from "@/components/AuthContext";

interface Props {
  open: boolean;
  onClose: () => void;
  user: PortalUser | null;
  onLogout: () => void;
}

/**
 * Header overflow: a bottom sheet on mobile, a dropdown on desktop. Holds the
 * items that don't fit the floating tab bar (Fees, Revision Plan) plus the
 * user card and logout. Closes on backdrop click, Escape, or route push.
 */
export default function OverflowSheet({ open, onClose, user, onLogout }: Props) {
  const router = useRouter();
  const params = useParams();
  const locale = ((params?.locale as string) === "en" ? "en" : "ar") as "ar" | "en";
  const sheetRef = useRef<HTMLDivElement>(null);

  const s =
    locale === "ar"
      ? {
          fees: "الرسوم الدراسية",
          revision: "خطة المذاكرة (قريبًا)",
          logout: "تسجيل الخروج",
          notifications: "الإشعارات",
          more: "القائمة",
        }
      : {
          fees: "Tuition Fees",
          revision: "Revision Plan (soon)",
          logout: "Log Out",
          notifications: "Notifications",
          more: "Menu",
        };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  const items = [
    { name: s.fees, href: `/${locale}/dashboard/fees`, icon: Wallet },
    { name: s.revision, href: `/${locale}/dashboard/ai/revision`, icon: CalendarRange },
  ];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={s.more}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet (mobile) — anchored bottom, full-width rounded top; dropdown (md+) — anchored top-right */}
      <div
        ref={sheetRef}
        className={`absolute bg-white shadow-xl border-slate-200 overflow-hidden flex flex-col ${
          "bottom-0 inset-x-0 rounded-t-2xl border-t md:bottom-auto md:top-16 md:start-auto md:end-4 md:w-72 md:rounded-2xl md:border"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100 md:hidden">
          <span className="text-sm font-semibold text-slate-900">{s.more}</span>
          <button
            onClick={onClose}
            aria-label={locale === "ar" ? "إغلاق" : "Close"}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* User card */}
        {user && (
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
              <UserIcon size={18} className="text-slate-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">{user.full_name}</p>
              <p className="text-xs text-slate-500 truncate" dir="ltr">
                {user.phone || user.email}
              </p>
            </div>
          </div>
        )}

        {/* Overflow nav */}
        <div className="p-2 flex flex-col gap-0.5">
          <button
            onClick={onClose}
            className="btn-touch w-full gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors duration-150 text-start md:hidden"
          >
            <Bell size={18} className="text-slate-400 shrink-0" />
            <span>{s.notifications}</span>
          </button>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                onClick={() => go(item.href)}
                className="btn-touch w-full gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors duration-150 text-start"
              >
                <Icon size={18} className="text-slate-400 shrink-0" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* Logout */}
        <div className="p-2 pt-0 border-t border-slate-100">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="btn-touch w-full gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors duration-150 text-start"
          >
            <LogOut size={18} className="shrink-0" />
            <span>{s.logout}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
