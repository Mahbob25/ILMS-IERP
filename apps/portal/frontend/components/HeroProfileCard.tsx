"use client";

import React from "react";
import { CalendarDays, Sparkles } from "lucide-react";
import { formatDate } from "@/lib/utils/register";

interface Props {
  name: string;
  code?: string | null;
  /** e.g. "٣ مقررات نشطة" — the standing of the student being viewed. */
  coursesLabel: string;
  statusLabel: string;
  registeredLabel: string;
  registeredAt?: string | null;
  locale: "ar" | "en";
  /** Guardian rail — rendered inside the card, under the identity line. */
  children?: React.ReactNode;
}

/**
 * The dashboard standfirst: who the sheet belongs to, on the accent gradient.
 *
 * Everything here is identity, not analytics — the numbers live in the metric
 * cards below. The only figures carried are the ones that qualify the student
 * (how many courses are running, when they first enrolled).
 */
export default function HeroProfileCard({
  name,
  code,
  coursesLabel,
  statusLabel,
  registeredLabel,
  registeredAt,
  locale,
  children,
}: Props) {
  const initials = (() => {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "؟";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  return (
    <section className="gradient-accent relative overflow-hidden rounded-2xl text-white shadow-hero">
      {/* Two soft light blooms so the flat gradient reads as a surface. */}
      <div
        aria-hidden="true"
        className="absolute -top-20 -end-12 w-56 h-56 rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -start-16 w-64 h-64 rounded-full bg-indigo-300/25 blur-3xl"
      />

      <div className="relative p-5 md:p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/15 border border-white/25 backdrop-blur-sm flex items-center justify-center text-lg md:text-xl font-bold shrink-0">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-bold truncate">{name}</h2>
            {code && (
              <p className="font-mono text-[11px] text-white/70 mt-1" dir="ltr">
                {code}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* Active status — a live state, so it carries the emerald dot. */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-400/20 border border-emerald-200/30 text-emerald-50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
            {statusLabel}
          </span>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 border border-white/20">
            <Sparkles size={12} />
            {coursesLabel}
          </span>

          {registeredAt && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/10 border border-white/15 text-white/90">
              <CalendarDays size={12} />
              <span className="text-white/60">{registeredLabel}</span>
              <span className="tabular">{formatDate(registeredAt, locale)}</span>
            </span>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}
