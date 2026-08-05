"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, BookOpen, User, Users, Activity } from "lucide-react";

interface SectionRow {
  section_id: string;
  course_name: string;
  teacher_name: string;
  status: string;
  enrolled_count: number;
  capacity: number;
  occupancy_rate: number;
}

interface OccupancyData {
  total_sections: number;
  total_capacity: number;
  total_enrolled: number;
  overall_occupancy_rate: number;
  sections: SectionRow[];
}

export default function SectionOccupancyView() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalSections: "عدد الشعب",
      totalCapacity: "الطاقة الاستيعابية",
      totalEnrolled: "إجمالي المسجلين",
      overallRate: "نسبة الإشغال الكلية",
      course: "المقرر",
      teacher: "المعلم",
      enrolled: "المسجل",
      capacity: "السعة",
      rate: "نسبة الإشغال",
      active: "نشطة",
      pending: "قيد الانتظار",
      completed: "مكتملة",
      cancelled: "ملغاة",
      ready: "جاهزة للإكمال",
      error: "فشل تحميل تقرير إشغال الشعب",
      empty: "لا توجد شعب",
    },
    en: {
      totalSections: "Sections",
      totalCapacity: "Total Capacity",
      totalEnrolled: "Total Enrolled",
      overallRate: "Overall Occupancy",
      course: "Course",
      teacher: "Teacher",
      enrolled: "Enrolled",
      capacity: "Capacity",
      rate: "Occupancy",
      active: "Active",
      pending: "Pending",
      completed: "Completed",
      cancelled: "Cancelled",
      ready: "Ready for Completion",
      error: "Failed to load section occupancy",
      empty: "No sections",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<OccupancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<OccupancyData>("/reports/sections/occupancy");
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
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

  const statusLabel = (s: string) =>
    s === "active" ? t.active
      : s === "pending" ? t.pending
      : s === "completed" ? t.completed
      : s === "cancelled" ? t.cancelled
      : s === "ready_for_completion" ? t.ready
      : s;

  const cards = [
    { label: t.totalSections, value: data.total_sections, color: "text-slate-800", icon: BookOpen },
    { label: t.totalCapacity, value: data.total_capacity, color: "text-blue-600", icon: Users },
    { label: t.totalEnrolled, value: data.total_enrolled, color: "text-emerald-600", icon: User },
    { label: t.overallRate, value: `${data.overall_occupancy_rate}%`, color: "text-violet-600", icon: Activity },
  ];

  const rateColor = (rate: number) =>
    rate >= 90 ? "text-red-600" : rate >= 70 ? "text-amber-600" : "text-emerald-600";

  const barColor = (rate: number) =>
    rate >= 90 ? "bg-red-500" : rate >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
        <h3 className="text-sm font-bold text-slate-900 mb-3">{t.overallRate}</h3>
        {data.sections.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">{t.empty}</p>
        ) : (
          <div className="space-y-4">
            {data.sections.map((row) => (
              <div key={row.section_id} className="flex items-center gap-3">
                <div className="w-48 shrink-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{row.course_name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{row.teacher_name || "\u2014"}</p>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>{row.enrolled_count} / {row.capacity}</span>
                    <span className={rateColor(row.occupancy_rate)}>{row.occupancy_rate}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(row.occupancy_rate)}`}
                      style={{ width: `${Math.min(row.occupancy_rate, 100)}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                    row.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : row.status === "pending"
                      ? "bg-slate-100 text-slate-600"
                      : row.status === "cancelled"
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {statusLabel(row.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}