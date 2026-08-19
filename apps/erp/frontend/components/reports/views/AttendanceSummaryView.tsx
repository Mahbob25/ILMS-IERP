"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, CalendarCheck, ClipboardCheck, Users } from "lucide-react";

interface SectionRow {
  section_id: string;
  course_name: string;
  teacher_name: string;
  status: string;
  enrolled_count: number;
  sessions_count: number;
  records_count: number;
  coverage_rate: number;
}

interface AttendanceData {
  start_date?: string | null;
  end_date?: string | null;
  total_sections: number;
  total_sessions: number;
  total_records: number;
  sections: SectionRow[];
}

export default function AttendanceSummaryView({ start, end }: { start: string; end: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalSections: "الشعب",
      totalSessions: "الجلسات",
      totalRecords: "السجلات",
      course: "المقرر",
      teacher: "المعلم",
      sessions: "الجلسات",
      records: "السجلات",
      enrolled: "المسجلون",
      coverage: "نسبة التغطية",
      error: "فشل تحميل ملخص الحضور",
      empty: "لا توجد جلسات حضور في هذه الفترة",
    },
    en: {
      totalSections: "Sections",
      totalSessions: "Sessions",
      totalRecords: "Records",
      course: "Course",
      teacher: "Teacher",
      sessions: "Sessions",
      records: "Records",
      enrolled: "Enrolled",
      coverage: "Coverage",
      error: "Failed to load attendance summary",
      empty: "No attendance sessions in this period",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<AttendanceData>("/reports/attendance", {
        params: { start_date: start, end_date: end },
      });
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [start, end, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-5 h-28" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-10 text-center text-sm text-red-600">
        <AlertCircle size={24} className="mx-auto mb-2 opacity-60" />
        {error ?? t.error}
      </div>
    );
  }

  const cards = [
    { label: t.totalSections, value: data.total_sections, color: "text-slate-800", icon: Users },
    { label: t.totalSessions, value: data.total_sessions, color: "text-blue-600", icon: CalendarCheck },
    { label: t.totalRecords, value: data.total_records, color: "text-emerald-600", icon: ClipboardCheck },
  ];

  const coverageColor = (rate: number) =>
    rate >= 90 ? "text-emerald-600" : rate >= 70 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <Icon size={16} className={card.color} />
              </div>
              <p className={`text-xl font-bold mt-2 ${card.color}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        {data.sections.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="text-start py-2 font-semibold">{t.course}</th>
                  <th className="text-start py-2 font-semibold">{t.teacher}</th>
                  <th className="text-end py-2 font-semibold">{t.enrolled}</th>
                  <th className="text-end py-2 font-semibold">{t.sessions}</th>
                  <th className="text-end py-2 font-semibold">{t.records}</th>
                  <th className="text-end py-2 font-semibold">{t.coverage}</th>
                </tr>
              </thead>
              <tbody>
                {data.sections.map((row) => (
                  <tr key={row.section_id} className="border-b border-slate-50">
                    <td className="py-2 font-medium text-slate-800">{row.course_name}</td>
                    <td className="py-2 text-slate-600">{row.teacher_name || "\u2014"}</td>
                    <td className="py-2 text-end text-slate-700">{row.enrolled_count}</td>
                    <td className="py-2 text-end text-slate-700">{row.sessions_count}</td>
                    <td className="py-2 text-end text-slate-700">{row.records_count}</td>
                    <td className="py-2 text-end">
                      <span className={`font-bold ${coverageColor(row.coverage_rate)}`}>
                        {row.coverage_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}