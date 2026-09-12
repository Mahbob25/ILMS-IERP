"use client";

import React from "react";
import { formatDate } from "@/lib/utils/register";

export interface BandFigure {
  label: string;
  value: string;
  hint?: string;
}

interface Props {
  name: string;
  code?: string | null;
  asOf: string | null;
  meta?: string;
  figures: BandFigure[];
  locale: "ar" | "en";
  /** Under the name — a single-student badge, or the guardian's child rail. */
  children?: React.ReactNode;
}

/**
 * The standfirst band: identity and the three standing figures, printed on ink
 * and divided by hairlines.
 *
 * This is a ledger line, not a KPI card row — no gradient, no icon tiles, no
 * shadows. The only bold thing on the sheet is the ribbon below it.
 */
export default function RegisterBand({
  name,
  code,
  asOf,
  meta,
  figures,
  locale,
  children,
}: Props) {
  return (
    <section className="rounded-xl bg-ink text-white overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-xl font-bold truncate">{name}</h1>
            {code && (
              <p className="font-mono text-[11px] text-ink-200 mt-1" dir="ltr">
                {code}
              </p>
            )}
          </div>
          <div className="text-end">
            <p className="eyebrow text-ink-200">{locale === "ar" ? "حتى" : "As of"}</p>
            <p className="tabular text-xs text-ink-100 mt-1">{formatDate(asOf, locale)}</p>
            {meta && <p className="text-[11px] text-ink-200 mt-1">{meta}</p>}
          </div>
        </div>
        {children}
      </div>

      {/* Three across on desktop; stacked as statement lines on mobile, where a
          third of 375px cannot hold "٣٬٠٠٠ ر.س.‏" plus its label. */}
      <dl className="grid grid-cols-1 sm:grid-cols-3 border-t border-white/15">
        {figures.map((figure, i) => (
          <div
            key={figure.label}
            className={`flex items-baseline justify-between gap-3 px-4 md:px-5 py-3 sm:py-4 sm:flex-col-reverse sm:items-stretch sm:justify-start ${
              i === 0 ? "" : "border-t border-white/15 sm:border-t-0 sm:border-s"
            }`}
          >
            {/* dt before dd in the DOM (valid), value shown first via col-reverse. */}
            <dt className="min-w-0 font-display text-[11px] font-semibold text-ink-200 sm:mt-2">
              <span className="block">{figure.label}</span>
              {figure.hint && (
                <span className="block text-[10px] font-normal text-ink-200/70 mt-0.5 sm:mt-1">
                  {figure.hint}
                </span>
              )}
            </dt>
            <dd className="standing-figure shrink-0 whitespace-nowrap text-xl lg:text-3xl text-white">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
