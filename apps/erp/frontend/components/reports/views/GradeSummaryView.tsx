"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, BookOpen, Users, TrendingUp, GraduationCap } from "lucide-react";

interface SectionGradeRow {
  section_id: string;
  course_name: string;
  teacher_name: string;
  status: string;
  graded_count: number;
  average_score: number;
  distribution: Record<string, number>;
}

interface GradeSummaryData {
  total_sections: number;
  total_graded_students: number;
  overall_average: number;
  sections: SectionGradeRow[];
}

const GRADE_LABEL_KEYS = ["Excellent", "Very Good", "Good", "Pass", "Fail"] as const;

export default function GradeSummaryView() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const gradeLabel = {
    ar: { Excellent: "ممتاز", "Very Good": "جيد جداً", Good: "جيد", Pass: "ناجح", Fail: "راسب" },
    en: { Excellent: "Excellent", "Very Good": "Very Good", Good: "Good", Pass: "Pass", Fail: "Fail" },
  }[locale === "en" ? "en" : "ar"];

  const t = {
    ar: {
      totalSections: "عدد الشعب",
      totalGraded: "الطلاب المقيّمون",
      overallAvg: "المعدل العام",
      course: "المقرر",
      teacher: "المعلم",
      graded: "المقيّمون",
      avg: "المعدل",
      distribution: "توزيع الدرجات",
      error: "فشل تحميل ملخص الدرجات",
      empty: "لا توجد درجات مسجلة",
    },
    en: {
      totalSections: "Sections",
      totalGraded: "Graded Students",
      overallAvg: "Overall Average",
      course: "Course",
      teacher: "Teacher",
      graded: "Graded",
      avg: "Average",
      distribution: "Grade Distribution",
      error: "Failed to load grade summary",
      empty: "No grades recorded",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<GradeSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<GradeSummaryData>("/reports/grades");
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

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
    { label: t.totalSections, value: data.total_sections, color: "text-slate-800", icon: BookOpen },
    { label: t.totalGraded, value: data.total_graded_students, color: "text-brand-600", icon: Users },
    { label: t.overallAvg, value: data.overall_average, color: "text-emerald-600", icon: TrendingUp },
  ];

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
          <div className="space-y-4">
            {data.sections.map((section) => (
              <div key={section.section_id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap size={16} className="text-brand-600" />
                    <p className="text-sm font-bold text-slate-900">{section.course_name}</p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        section.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {section.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      {t.teacher}: <b className="text-slate-700">{section.teacher_name || "\u2014"}</b>
                    </span>
                    <span>
                      {t.graded}: <b className="text-slate-700">{section.graded_count}</b>
                    </span>
                    <span>
                      {t.avg}: <b className="text-emerald-600">{section.average_score}</b>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {GRADE_LABEL_KEYS.map((key) => {
                    const count = section.distribution[key] ?? 0;
                    return (
                      <span
                        key={key}
                        className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-semibold text-slate-600"
                      >
                        {gradeLabel[key]}: <b className="text-slate-900">{count}</b>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
