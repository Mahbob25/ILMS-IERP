"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, Users, UserCheck, UserX } from "lucide-react";

interface StudentRow {
  student_id: string;
  student_code: string;
  full_name: string;
  email?: string | null;
  is_enrolled: boolean;
}

interface StudentRegisterData {
  total_students: number;
  active_count: number;
  unenrolled_count: number;
  status: string;
  students: StudentRow[];
}

export default function StudentRegisterView() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalStudents: "إجمالي الطلاب",
      active: "مسجلون",
      unenrolled: "غير مسجلين",
      code: "الرمز",
      name: "الاسم",
      email: "البريد الإلكتروني",
      status: "الحالة",
      enrolled: "مسجل",
      unenrolledLabel: "غير مسجل",
      error: "فشل تحميل سجل الطلاب",
      empty: "لا يوجد طلاب",
    },
    en: {
      totalStudents: "Total Students",
      active: "Enrolled",
      unenrolled: "Unenrolled",
      code: "Code",
      name: "Name",
      email: "Email",
      status: "Status",
      enrolled: "Enrolled",
      unenrolledLabel: "Unenrolled",
      error: "Failed to load student register",
      empty: "No students",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<StudentRegisterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<StudentRegisterData>("/reports/students");
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
    { label: t.totalStudents, value: data.total_students, color: "text-slate-800", icon: Users },
    { label: t.active, value: data.active_count, color: "text-emerald-600", icon: UserCheck },
    { label: t.unenrolled, value: data.unenrolled_count, color: "text-amber-600", icon: UserX },
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
        {data.students.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="text-start py-2 font-semibold">{t.code}</th>
                  <th className="text-start py-2 font-semibold">{t.name}</th>
                  <th className="text-start py-2 font-semibold">{t.email}</th>
                  <th className="text-start py-2 font-semibold">{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((row) => (
                  <tr key={row.student_id} className="border-b border-slate-50">
                    <td className="py-2 text-slate-500">{row.student_code}</td>
                    <td className="py-2 font-medium text-slate-800">{row.full_name}</td>
                    <td className="py-2 text-slate-600">{row.email || "\u2014"}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.is_enrolled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.is_enrolled ? t.enrolled : t.unenrolledLabel}
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