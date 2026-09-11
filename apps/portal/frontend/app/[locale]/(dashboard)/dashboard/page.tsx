"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import StudentSelector from "@/components/StudentSelector";
import RefreshButton from "@/components/RefreshButton";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import type { AttendanceSlice } from "@/components/AttendanceDonut";
import {
  Award,
  CalendarCheck,
  Wallet,
  Sparkles,
  Users,
  ChevronRight,
} from "lucide-react";

// recharts is heavy (~100 kB) — keep it out of the dashboard's initial JS and
// load it with the tile. Type-only import above costs nothing at runtime.
const AttendanceDonut = dynamic(() => import("@/components/AttendanceDonut"), {
  ssr: false,
  loading: () => <div className="h-[168px]" />,
});

interface AttendanceRecord {
  date: string;
  status: string;
  course_name: string;
}

interface GradeRow {
  section_id: string;
  course_name: string;
  final_score: number | null;
  graded_at: string | null;
}

interface SectionFee {
  section_id: string;
  course_name: string;
  net_price: number | null;
  total_paid: number;
  balance: number | null;
}

interface FeesSummary {
  total_net_price: number;
  total_paid: number;
  balance: number;
  sections: SectionFee[];
}

interface DashboardData {
  attendance: AttendanceRecord[];
  grades: GradeRow[];
  fees: FeesSummary | null;
  asOf: string | null;
}

const ATTENDANCE_COLORS = {
  present: "#10b981",
  partial: "#8b5cf6",
  absent: "#ef4444",
  late: "#f59e0b",
  excused: "#94a3b8",
};

const t = {
  ar: {
    welcome: "مرحبًا",
    overview: "نظرة عامة على الحضور والدرجات والرسوم",
    noStudents: "لا يوجد طلاب مرتبطون بحسابك بعد. يرجى التواصل مع الإدارة.",
    // attendance
    attendance: "الحضور",
    rateCaption: "نسبة الحضور",
    sessions: "جلسة",
    present: "حاضر",
    absent: "غائب",
    late: "متأخر",
    partial: "حضور جزئي",
    excused: "بعذر",
    noAttendance: "لا توجد سجلات حضور بعد.",
    // grades
    grades: "الدرجات",
    avgScore: "المعدل العام",
    gradedCourses: "مقرر مصحح",
    recentGrades: "أحدث الدرجات",
    noGrades: "لا توجد درجات مسجلة بعد.",
    // fees
    fees: "الرسوم الدراسية",
    outstanding: "المبلغ المتبقي",
    paidOf: "المدفوع",
    of: "من",
    noOutstanding: "لا يوجد رصيد مستحق",
    feesUnavailable: "تعذر تحميل بيانات الرسوم",
    // misc
    quickLinks: "روابط سريعة",
    aiTeaser: "مساعد الذكاء الاصطناعي",
    aiTeaserDesc: "اطرح سؤالًا عن أي مقرر واحصل على إجابة مدعومة بالمصادر.",
  },
  en: {
    welcome: "Welcome",
    overview: "An overview of attendance, grades and fees",
    noStudents: "No linked students yet. Please contact the administration.",
    attendance: "Attendance",
    rateCaption: "Attendance rate",
    sessions: "sessions",
    present: "Present",
    absent: "Absent",
    late: "Late",
    partial: "Partial",
    excused: "Excused",
    noAttendance: "No attendance records yet.",
    grades: "Grades",
    avgScore: "Overall average",
    gradedCourses: "courses graded",
    recentGrades: "Recent grades",
    noGrades: "No grades recorded yet.",
    fees: "Tuition Fees",
    outstanding: "Outstanding",
    paidOf: "Paid",
    of: "of",
    noOutstanding: "No outstanding balance",
    feesUnavailable: "Fees unavailable",
    quickLinks: "Quick links",
    aiTeaser: "AI Tutor",
    aiTeaserDesc: "Ask a question about any course and get a sourced answer.",
  },
};

export default function DashboardHome() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];
  const { user } = useAuth();

  const { students, selectedId, loading, refreshing, select, refresh } =
    useLinkedStudents(locale);

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [fees, setFees] = useState<FeesSummary | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Settled, so one failing tile degrades to its empty state instead of
  // blanking the whole dashboard.
  const load = useCallback(
    async (studentId: string, force = false): Promise<DashboardData> => {
      const reqParams = force
        ? { student_id: studentId, refresh: "1" }
        : { student_id: studentId };

      const [att, grd, fee] = await Promise.allSettled([
        apiClient.get<AttendanceRecord[]>("/me/attendance", { params: reqParams }),
        apiClient.get<GradeRow[]>("/me/grades", { params: reqParams }),
        apiClient.get<FeesSummary>("/me/fees", { params: reqParams }),
      ]);

      const settled = [att, grd, fee].find((r) => r.status === "fulfilled");
      const asOfHeader =
        settled && settled.status === "fulfilled"
          ? settled.value.headers?.["x-data-as-of"]
          : undefined;

      return {
        attendance: att.status === "fulfilled" ? att.value.data || [] : [],
        grades: grd.status === "fulfilled" ? grd.value.data || [] : [],
        fees: fee.status === "fulfilled" ? fee.value.data : null,
        asOf: typeof asOfHeader === "string" ? asOfHeader : null,
      };
    },
    []
  );

  const apply = useCallback((data: DashboardData) => {
    setAttendance(data.attendance);
    setGrades(data.grades);
    setFees(data.fees);
    setAsOf(data.asOf);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDataLoading(true);
    load(selectedId)
      .then((data) => {
        if (!cancelled) apply(data);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, load, apply]);

  const handleRefresh = async () => {
    await refresh();
    if (!selectedId) return;
    setDataLoading(true);
    try {
      apply(await load(selectedId, true));
    } finally {
      setDataLoading(false);
    }
  };

  const stats = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, partial: 0, excused: 0 };
    for (const record of attendance) {
      const key = (record.status || "").toLowerCase() as keyof typeof counts;
      if (key in counts) counts[key] += 1;
    }
    const total = counts.present + counts.absent + counts.late + counts.partial + counts.excused;
    // Mirrors the ERP report: a partial attendance counts as attended.
    const attended = counts.present + counts.partial;
    const rate = total ? Math.round((attended / total) * 1000) / 10 : 0;
    return { counts, total, rate };
  }, [attendance]);

  const slices: AttendanceSlice[] = [
    { key: "present", label: s.present, value: stats.counts.present, color: ATTENDANCE_COLORS.present },
    { key: "partial", label: s.partial, value: stats.counts.partial, color: ATTENDANCE_COLORS.partial },
    { key: "absent", label: s.absent, value: stats.counts.absent, color: ATTENDANCE_COLORS.absent },
    { key: "late", label: s.late, value: stats.counts.late, color: ATTENDANCE_COLORS.late },
    { key: "excused", label: s.excused, value: stats.counts.excused, color: ATTENDANCE_COLORS.excused },
  ];

  const scored = grades.filter((g) => g.final_score !== null);
  const avgScore = scored.length
    ? Math.round((scored.reduce((sum, g) => sum + (g.final_score || 0), 0) / scored.length) * 10) / 10
    : null;
  const recentGrades = grades.slice(0, 3);

  const busy = loading || dataLoading;

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB", {
      style: "currency",
      currency: "SAR",
    }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            {s.welcome}، {user?.full_name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{s.overview}</p>
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
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState icon={Users} title={s.noStudents} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Attendance */}
            <StatCard
              icon={CalendarCheck}
              label={s.attendance}
              value={stats.total ? `${stats.rate}%` : "—"}
              hint={stats.total ? `${stats.total} ${s.sessions}` : undefined}
              tone="brand"
            >
              <AttendanceDonut
                slices={slices}
                centerLabel={stats.total ? `${stats.rate}%` : "—"}
                centerCaption={s.rateCaption}
                emptyLabel={s.noAttendance}
              />
              {stats.total > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2">
                  {slices.map((slice) => (
                    <div key={slice.key} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-slate-500">{slice.label}</span>
                      <span className="text-slate-900 font-medium ms-auto">
                        {slice.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </StatCard>

            {/* Grades */}
            <StatCard
              icon={Award}
              label={s.avgScore}
              value={avgScore !== null ? `${avgScore}%` : "—"}
              hint={`${grades.length} ${s.gradedCourses}`}
              tone="ai"
              onClick={() => router.push(`/${locale}/dashboard/grades`)}
            >
              <p className="text-xs text-slate-400 mt-4 mb-2">{s.recentGrades}</p>
              {recentGrades.length === 0 ? (
                <p className="text-xs text-slate-400">{s.noGrades}</p>
              ) : (
                <div className="space-y-2">
                  {recentGrades.map((g) => (
                    <div
                      key={g.section_id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-slate-600 truncate">{g.course_name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400">
                          {g.graded_at ? fmtDate(g.graded_at) : ""}
                        </span>
                        {g.final_score !== null ? (
                          <span className="badge badge-success">{g.final_score}%</span>
                        ) : (
                          <span className="badge badge-muted">—</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </StatCard>

            {/* Fees — no payment action: there is no gateway, so this is read-only. */}
            <StatCard
              icon={Wallet}
              label={s.outstanding}
              value={fees ? fmtMoney(fees.balance) : "—"}
              hint={
                fees
                  ? fees.balance <= 0
                    ? s.noOutstanding
                    : `${s.paidOf} ${fmtMoney(fees.total_paid)} ${s.of} ${fmtMoney(fees.total_net_price)}`
                  : s.feesUnavailable
              }
              tone={fees && fees.balance > 0 ? "warning" : "success"}
              onClick={() => router.push(`/${locale}/dashboard/fees`)}
            >
              <div className="mt-4 flex items-center justify-end text-xs text-brand-700">
                {s.fees}
                <ChevronRight size={14} />
              </div>
            </StatCard>
          </div>

          {/* Quick links */}
          <div className="grid gap-4 md:grid-cols-3">
            <button
              onClick={() => router.push(`/${locale}/dashboard/grades`)}
              className="card p-5 text-start hover:border-brand-300 transition-colors"
            >
              <Award className="text-brand-600 mb-3" size={24} />
              <p className="text-sm font-semibold text-slate-900">{s.grades}</p>
            </button>
            <button
              onClick={() => router.push(`/${locale}/dashboard/attendance`)}
              className="card p-5 text-start hover:border-brand-300 transition-colors"
            >
              <CalendarCheck className="text-brand-600 mb-3" size={24} />
              <p className="text-sm font-semibold text-slate-900">{s.attendance}</p>
            </button>
            <button
              onClick={() => router.push(`/${locale}/dashboard/fees`)}
              className="card p-5 text-start hover:border-brand-300 transition-colors"
            >
              <Wallet className="text-brand-600 mb-3" size={24} />
              <p className="text-sm font-semibold text-slate-900">{s.fees}</p>
            </button>
          </div>

          {/* AI teaser */}
          <div className="card p-5 bg-gradient-to-r from-ai-50 to-white border-ai-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="text-ai-600" size={24} />
                <div>
                  <p className="text-sm font-semibold text-ai-800">{s.aiTeaser}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.aiTeaserDesc}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
