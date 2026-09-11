"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export interface AttendanceSlice {
  key: string;
  label: string;
  value: number;
  /** Recharts needs a real colour — Tailwind classes do not work here. */
  color: string;
}

interface Props {
  slices: AttendanceSlice[];
  centerLabel: string;
  centerCaption: string;
  emptyLabel: string;
  size?: number;
}

/**
 * Attendance breakdown donut with the rate in the middle.
 *
 * Recharts is already a dependency but was unused — this is its first use.
 * Renders the empty message instead of a zero-slice chart when there are no
 * records, so a new student never sees a broken ring.
 */
export default function AttendanceDonut({
  slices,
  centerLabel,
  centerCaption,
  emptyLabel,
  size = 168,
}: Props) {
  const data = slices.filter((s) => s.value > 0);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-center text-xs text-slate-400 px-4"
        style={{ height: size }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="64%"
            outerRadius="96%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xl font-bold text-slate-900">{centerLabel}</span>
        <span className="text-[10px] text-slate-400 mt-0.5">{centerCaption}</span>
      </div>
    </div>
  );
}
