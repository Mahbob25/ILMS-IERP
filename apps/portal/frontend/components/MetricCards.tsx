"use client";

import React, { useId } from "react";
import { CalendarCheck, GraduationCap, Wallet } from "lucide-react";
import { formatMoney, formatPercent, formatScore } from "@/lib/utils/register";

/* ────────────────────────────────────────────────────────────────────────────
   Shared shell — every metric is one white card: a label, an icon tile, the
   headline figure, one visual encoding of it, and a caption underneath.
   ──────────────────────────────────────────────────────────────────────────── */

function MetricCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          {icon}
        </span>
      </div>
      {children}
    </section>
  );
}

/** The blank state a metric falls back to when its endpoint gave us nothing. */
function MetricEmpty({ message }: { message: string }) {
  return <p className="text-xs text-slate-400 mt-4">{message}</p>;
}

/* ── Attendance — a ring, because a rate is a share of a whole ───────────── */

const RING_SIZE = 104;
const RING_STROKE = 11;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ percent, locale }: { percent: number; locale: "ar" | "en" }) {
  const gradientId = useId();
  const clamped = Math.max(0, Math.min(100, percent));
  const arc = (clamped / 100) * RING_CIRCUMFERENCE;

  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden="true"
        // Draw from 12 o'clock; in Arabic the arc fills counter-clockwise so it
        // travels with the reading direction.
        style={{
          transform: locale === "ar" ? "rotate(-90deg) scaleX(-1)" : "rotate(-90deg)",
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="#EEF2F9"
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${RING_CIRCUMFERENCE - arc}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="standing-figure text-xl text-slate-900">
          {formatPercent(clamped, locale)}
        </span>
      </span>
    </div>
  );
}

export function AttendanceMetricCard({
  title,
  rate,
  sessionsLabel,
  rangeLabel,
  emptyLabel,
  locale,
}: {
  title: string;
  /** 0–100, or null when the student has no sessions yet. */
  rate: number | null;
  sessionsLabel: string;
  rangeLabel?: string | null;
  emptyLabel: string;
  locale: "ar" | "en";
}) {
  return (
    <MetricCard title={title} icon={<CalendarCheck size={17} />}>
      {rate === null ? (
        <MetricEmpty message={emptyLabel} />
      ) : (
        <div className="flex items-center gap-4 mt-4">
          <ProgressRing percent={rate} locale={locale} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{sessionsLabel}</p>
            {rangeLabel && (
              <p className="tabular text-[11px] text-slate-400 mt-1">{rangeLabel}</p>
            )}
          </div>
        </div>
      )}
    </MetricCard>
  );
}

/* ── Grade average — a bar, because a score is a position on a scale ─────── */

export function GradeAverageMetricCard({
  title,
  average,
  gradedLabel,
  emptyLabel,
  locale,
}: {
  title: string;
  /** 0–100, or null when nothing has been graded. */
  average: number | null;
  gradedLabel: string;
  emptyLabel: string;
  locale: "ar" | "en";
}) {
  const clamped = average === null ? 0 : Math.max(0, Math.min(100, average));

  return (
    <MetricCard title={title} icon={<GraduationCap size={17} />}>
      {average === null ? (
        <MetricEmpty message={emptyLabel} />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 mt-4">
            <p className="standing-figure text-2xl text-slate-900">
              {formatScore(average, locale)}
            </p>
            <span className="text-[11px] text-slate-400">{gradedLabel}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mt-3">
            {/* A block child starts at the inline edge, so this fills from the
                right in Arabic without any direction-specific code. */}
            <div
              className="gradient-accent h-full rounded-full transition-[width] duration-500"
              style={{ width: `${clamped}%` }}
            />
          </div>
        </>
      )}
    </MetricCard>
  );
}

/* ── Balance — segmented, because it is paid vs. still owed ─────────────── */

export function BalanceMetricCard({
  title,
  balance,
  total,
  paid,
  remainingLabel,
  settledLabel,
  paidLabel,
  totalLabel,
  emptyLabel,
  locale,
}: {
  title: string;
  balance: number;
  total: number;
  paid: number;
  remainingLabel: string;
  settledLabel: string;
  paidLabel: string;
  totalLabel: string;
  emptyLabel: string;
  locale: "ar" | "en";
}) {
  const owed = Math.max(0, balance);
  const settled = total > 0 && owed <= 0;
  const paidPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const owedPercent = total > 0 ? Math.max(0, 100 - paidPercent) : 0;

  return (
    <MetricCard title={title} icon={<Wallet size={17} />}>
      {total <= 0 ? (
        <MetricEmpty message={emptyLabel} />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 mt-4">
            <p className="standing-figure text-2xl text-slate-900">
              {formatMoney(owed, locale)}
            </p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                settled
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                  : "bg-amber-50 text-amber-600 border border-amber-100"
              }`}
            >
              {settled ? settledLabel : remainingLabel}
            </span>
          </div>

          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 mt-3">
            {paidPercent > 0 && (
              <div
                className="gradient-accent h-full transition-[width] duration-500"
                style={{ width: `${paidPercent}%` }}
              />
            )}
            {owedPercent > 0 && (
              <div
                className="h-full bg-amber-300 transition-[width] duration-500"
                style={{ width: `${owedPercent}%` }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
              {paidLabel}
              <span className="tabular font-semibold text-slate-900">
                {formatMoney(paid, locale)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-amber-300 shrink-0" />
              {totalLabel}
              <span className="tabular font-semibold text-slate-900">
                {formatMoney(total, locale)}
              </span>
            </span>
          </div>
        </>
      )}
    </MetricCard>
  );
}
