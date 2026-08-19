"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, Users } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface CourseRow {
  course_name: string;
  enrollments: number;
}

interface SectionRow {
  section_id: string;
  course_name: string;
  enrollments: number;
}

interface EnrollmentData {
  start_date?: string | null;
  end_date?: string | null;
  total_enrollments: number;
  by_course: CourseRow[];
  by_section: SectionRow[];
}

export default function EnrollmentSummaryView({ start, end }: { start: string; end: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalEnrollments: "إجمالي التسجيلات",
      byCourse: "التسجيلات حسب المقرر",
      bySection: "التسجيلات حسب الشعبة",
      course: "المقرر",
      section: "الشعبة",
      count: "العدد",
      period: "الفترة",
      error: "فشل تحميل ملخص التسجيلات",
      empty: "لا توجد تسجيلات في هذه الفترة",
    },
    en: {
      totalEnrollments: "Total Enrollments",
      byCourse: "Enrollments by Course",
      bySection: "Enrollments by Section",
      course: "Course",
      section: "Section",
      count: "Count",
      period: "Period",
      error: "Failed to load enrollment summary",
      empty: "No enrollments in this period",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<EnrollmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<EnrollmentData>("/reports/enrollments", {
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

  const renderTable = (
    title: string,
    headers: [string, string],
    rows: { id: string; cells: [React.ReactNode, React.ReactNode] }[]
  ) => (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="text-start py-2 font-semibold">{headers[0]}</th>
                <th className="text-end py-2 font-semibold">{headers[1]}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700">{row.cells[0]}</td>
                  <td className="py-2 text-end font-semibold text-slate-800">{row.cells[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">{t.totalEnrollments}</p>
            <Users size={16} className="text-brand-600" />
          </div>
          <p className="text-xl font-bold mt-2 text-slate-800">{data.total_enrollments}</p>
        </div>
        {data.start_date && data.end_date && (
          <div className="card p-5 col-span-2 flex items-center">
            <p className="text-xs font-semibold text-slate-500 me-3">{t.period}:</p>
            <p className="text-sm font-medium text-slate-700">
              {data.start_date} {"\u2192"} {data.end_date}
            </p>
          </div>
        )}
      </div>

      {data.by_course.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{t.byCourse}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.by_course}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="course_name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="enrollments" name={t.count} fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {renderTable(
          t.byCourse,
          [t.course, t.count],
          data.by_course.map((r) => ({
            id: r.course_name,
            cells: [r.course_name, r.enrollments],
          }))
        )}
        {renderTable(
          t.bySection,
          [t.section, t.count],
          data.by_section.map((r) => ({
            id: r.section_id,
            cells: [r.course_name, r.enrollments],
          }))
        )}
      </div>
    </div>
  );
}