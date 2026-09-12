"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { CalendarCheck } from "lucide-react";
import StudentSelector from "@/components/StudentSelector";
import RefreshButton from "@/components/RefreshButton";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import DataCards from "@/components/DataCards";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

interface AttendanceRecord {
  date: string;
  status: string;
  course_name: string;
}

const t = {
  ar: {
    title: "الحضور",
    subtitle: "سجل الحضور لكل مقرر",
    course: "المقرر",
    date: "التاريخ",
    status: "الحالة",
    present: "حاضر",
    absent: "غائب",
    late: "متأخر",
    none: "لا توجد سجلات حضور بعد.",
    loading: "جاري تحميل الحضور...",
  },
  en: {
    title: "Attendance",
    subtitle: "Attendance records per course",
    course: "Course",
    date: "Date",
    status: "Status",
    present: "Present",
    absent: "Absent",
    late: "Late",
    none: "No attendance records yet.",
    loading: "Loading attendance...",
  },
};

const STATUS_LABEL: Record<string, { ar: string; en: string; cls: string }> = {
  present: { ar: "حاضر", en: "Present", cls: "badge-success" },
  absent: { ar: "غائب", en: "Absent", cls: "badge-warning" },
  late: { ar: "متأخر", en: "Late", cls: "badge-muted" },
};

export default function AttendancePage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];

  const { students, selectedId, selectedStudent, loading, refreshing, select, refresh } =
    useLinkedStudents(locale);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDataLoading(true);
    apiClient
      .get<AttendanceRecord[]>("/me/attendance", { params: { student_id: selectedId } })
      .then((res) => {
        if (cancelled) return;
        setRecords(res.data || []);
        setAsOf(res.headers?.["x-data-as-of"] || null);
      })
      .catch(() => {
        if (!cancelled) {
          setRecords([]);
          setAsOf(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleRefresh = async () => {
    await refresh();
    if (!selectedId) return;
    const res = await apiClient.get<AttendanceRecord[]>("/me/attendance", {
      params: { student_id: selectedId, refresh: "1" },
    });
    setRecords(res.data || []);
    setAsOf(res.headers?.["x-data-as-of"] || null);
  };

  const busy = loading || dataLoading;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <CalendarCheck className="text-brand-600" size={24} />
            {s.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StudentSelector
            locale={locale}
            students={students}
            selectedId={selectedId}
            onSelect={select}
            disabled={busy}
          />
          <RefreshButton
            locale={locale}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            asOf={asOf}
          />
        </div>
      </div>

      {busy ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={s.none} />
      ) : (
        <>
          <div className="hidden md:block card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{s.course}</th>
                  <th>{s.date}</th>
                  <th>{s.status}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const label =
                    STATUS_LABEL[r.status] ||
                    STATUS_LABEL[r.status?.toLowerCase()] || {
                      ar: r.status,
                      en: r.status,
                      cls: "badge-muted",
                    };
                  return (
                    <tr key={i}>
                      <td className="font-medium text-slate-900">{r.course_name}</td>
                      <td className="text-slate-500 text-xs">
                        {new Date(r.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB")}
                      </td>
                      <td>
                        <span className={`badge ${label.cls}`}>
                          {locale === "ar" ? label.ar : label.en}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DataCards
            items={records}
            keyOf={(r) => `${r.date}-${r.course_name}`}
            renderRow={(r) => {
              const label =
                STATUS_LABEL[r.status] ||
                STATUS_LABEL[r.status?.toLowerCase()] || {
                  ar: r.status,
                  en: r.status,
                  cls: "badge-muted",
                };
              return (
                <div className="space-y-3">
                  <p className="font-semibold text-slate-900 text-sm">{r.course_name}</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">{s.date}</p>
                      <p className="mt-0.5 text-slate-700">
                        {new Date(r.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB")}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">{s.status}</p>
                      <p className="mt-0.5">
                        <span className={`badge ${label.cls}`}>
                          {locale === "ar" ? label.ar : label.en}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </>
      )}
    </div>
  );
}
