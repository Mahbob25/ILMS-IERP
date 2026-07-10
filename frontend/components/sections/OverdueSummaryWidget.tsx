"use client";

import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { Loader2, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

interface SectionSummary {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  price: number | null;
  flags?: Record<string, any>;
  cancelled_at?: string | null;
}

interface OverdueSummaryData {
  ready_for_completion: SectionSummary[];
  overdue_sections: SectionSummary[];
  upcoming_deadlines: SectionSummary[];
}

interface OverdueSummaryWidgetProps {
  isRtl?: boolean;
  locale?: string;
  getCourseName: (id: string) => string;
  onSectionClick: (id: string) => void;
}

export default function OverdueSummaryWidget({
  isRtl = false,
  locale = "ar",
  getCourseName,
  onSectionClick,
}: OverdueSummaryWidgetProps) {
  const [data, setData] = useState<OverdueSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const t = {
    ar: {
      ready: "جاهز للإكمال",
      overdue: "متأخر",
      upcoming: "مواعيد وشيكة",
      daysPast: "أيام مضت",
      students: "طالب",
      noData: "لا توجد بيانات",
    },
    en: {
      ready: "Ready for Completion",
      overdue: "Overdue",
      upcoming: "Upcoming Deadlines",
      daysPast: "days past",
      students: "students",
      noData: "No data available",
    },
  }[locale === "en" ? "en" : "ar"];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiClient.get<OverdueSummaryData>(
          "/academic/sections/overdue-summary"
        );
        setData(res.data);
      } catch {
        setData({
          ready_for_completion: [],
          overdue_sections: [],
          upcoming_deadlines: [],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="card p-4 flex items-center justify-center h-24">
        <Loader2 className="animate-spin text-slate-400" size={20} />
      </div>
    );
  }

  if (!data) return null;

  const totalReady = data.ready_for_completion.length;
  const totalOverdue = data.overdue_sections.length;
  const totalUpcoming = data.upcoming_deadlines.length;

  return (
    <div className="card p-4 space-y-3" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          {isRtl ? "ملخص الشعب" : "Sections Overview"}
        </h3>
        <div className="flex gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 border border-yellow-200">
            {totalReady}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
            {totalOverdue}
          </span>
        </div>
      </div>

      {totalReady > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-yellow-600 flex items-center gap-1">
            <CheckCircle2 size={12} /> {t.ready} ({totalReady})
          </p>
          {data.ready_for_completion.map((s) => (
            <button
              key={s.id}
              onClick={() => onSectionClick(s.id)}
              className="w-full text-start text-xs text-slate-600 hover:text-brand-600 hover:bg-yellow-50 px-2 py-1 rounded"
            >
              {getCourseName(s.course_id)}
            </button>
          ))}
        </div>
      )}

      {totalOverdue > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
            <AlertTriangle size={12} /> {t.overdue} ({totalOverdue})
          </p>
          {data.overdue_sections.map((s) => {
            const daysPast = s.end_date
              ? Math.floor(
                  (Date.now() - new Date(s.end_date + "T00:00:00").getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : 0;
            return (
              <button
                key={s.id}
                onClick={() => onSectionClick(s.id)}
                className="w-full text-start text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded flex items-center justify-between"
              >
                <span>{getCourseName(s.course_id)}</span>
                <span className="font-medium">
                  +{daysPast} {t.daysPast}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {totalUpcoming > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
            <Clock size={12} /> {t.upcoming} ({totalUpcoming})
          </p>
          {data.upcoming_deadlines.map((s) => (
            <button
              key={s.id}
              onClick={() => onSectionClick(s.id)}
              className="w-full text-start text-xs text-slate-600 hover:text-brand-600 hover:bg-amber-50 px-2 py-1 rounded"
            >
              {getCourseName(s.course_id)} — {s.end_date || "—"}
            </button>
          ))}
        </div>
      )}

      {totalReady === 0 && totalOverdue === 0 && totalUpcoming === 0 && (
        <p className="text-xs text-slate-400 text-center py-2">{t.noData}</p>
      )}
    </div>
  );
}
