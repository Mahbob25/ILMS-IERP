"use client";

import React from "react";

interface Props {
  name: string;
  code: string;
  active: boolean;
  onSelect: () => void;
  /** Rate / average / balance, already formatted. */
  figures: { label: string; value: string }[];
  hint?: string;
}

/**
 * One child's standing, for a guardian with more than one.
 *
 * The row doubles as the switcher: a parent sees who needs attention without
 * opening each child, and tapping a row focuses that child's sheet. Data for
 * every row is already loaded, so focusing never refetches.
 */
export default function ChildGlanceRow({ name, code, active, onSelect, figures, hint }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`w-full text-start px-4 py-3 border-b border-slate-100 border-s-2 transition-colors last:border-b-0 ${
        active
          ? "bg-ink-50 border-s-brand-600"
          : "hover:bg-slate-50 border-s-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-slate-900 truncate">{name}</p>
          <p className="font-mono text-[10px] text-slate-400 mt-0.5" dir="ltr">
            {code}
          </p>
        </div>

        <dl className="flex items-center gap-4">
          {figures.map((figure, i) => (
            <div
              key={figure.label}
              className={`flex flex-col-reverse ${i === 0 ? "" : "border-s border-slate-200 ps-4"}`}
            >
              <dt className="text-[10px] text-slate-400 mt-0.5">{figure.label}</dt>
              <dd className="tabular text-sm font-semibold text-slate-900">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {hint && <p className="text-[11px] text-slate-400 mt-1.5">{hint}</p>}
    </button>
  );
}
