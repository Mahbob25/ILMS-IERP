"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Award } from "lucide-react";
import StudentSelector from "@/components/StudentSelector";
import RefreshButton from "@/components/RefreshButton";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import DataCards from "@/components/DataCards";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

interface Grade {
  section_id: string;
  course_name: string;
  final_score: number | null;
  graded_at: string | null;
}

const t = {
  ar: {
    title: "الدرجات",
    subtitle: "الدرجات النهائية لكل مقرر",
    course: "المقرر",
    score: "الدرجة",
    date: "التاريخ",
    none: "لا توجد درجات مسجلة بعد.",
    loading: "جاري تحميل الدرجات...",
  },
  en: {
    title: "Grades",
    subtitle: "Final grades per course",
    course: "Course",
    score: "Score",
    date: "Date",
    none: "No grades recorded yet.",
    loading: "Loading grades...",
  },
};

export default function GradesPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];

  const { students, selectedId, selectedStudent, loading, refreshing, select, refresh } =
    useLinkedStudents(locale);

  const [grades, setGrades] = useState<Grade[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDataLoading(true);
    apiClient
      .get<Grade[]>("/me/grades", { params: { student_id: selectedId } })
      .then((res) => {
        if (cancelled) return;
        setGrades(res.data || []);
        setAsOf(res.headers?.["x-data-as-of"] || null);
      })
      .catch(() => {
        if (!cancelled) {
          setGrades([]);
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
    await refresh(); // refetch /me with ?refresh=1
    if (!selectedId) return;
    const res = await apiClient.get<Grade[]>("/me/grades", {
      params: { student_id: selectedId, refresh: "1" },
    });
    setGrades(res.data || []);
    setAsOf(res.headers?.["x-data-as-of"] || null);
  };

  const busy = loading || dataLoading;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Award className="text-brand-600" size={24} />
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

      {selectedStudent && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium">{s.title}</span>
          <span>·</span>
          <span>{selectedStudent.full_name}</span>
        </div>
      )}

      {busy ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : grades.length === 0 ? (
        <EmptyState icon={Award} title={s.none} />
      ) : (
        <>
          <div className="hidden md:block card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{s.course}</th>
                  <th>{s.score}</th>
                  <th>{s.date}</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.section_id}>
                    <td className="font-medium text-slate-900">{g.course_name}</td>
                    <td>
                      {g.final_score !== null ? (
                        <span className="badge badge-success">{g.final_score}</span>
                      ) : (
                        <span className="badge badge-muted">—</span>
                      )}
                    </td>
                    <td className="text-slate-500 text-xs">
                      {g.graded_at
                        ? new Date(g.graded_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DataCards
            items={grades}
            keyOf={(g) => g.section_id}
            renderRow={(g) => (
              <div className="space-y-3">
                <p className="font-semibold text-slate-900 text-sm">{g.course_name}</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400">{s.score}</p>
                    <p className="mt-0.5 font-medium text-slate-700">
                      {g.final_score !== null ? (
                        <span className="badge badge-success">{g.final_score}</span>
                      ) : (
                        <span className="badge badge-muted">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">{s.date}</p>
                    <p className="mt-0.5 text-slate-700">
                      {g.graded_at
                        ? new Date(g.graded_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB")
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
