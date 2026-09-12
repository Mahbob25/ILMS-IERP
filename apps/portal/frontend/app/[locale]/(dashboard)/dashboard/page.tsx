"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import { useLastUpdated } from "@/components/LastUpdatedContext";
import RefreshButton from "@/components/RefreshButton";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import HeroProfileCard from "@/components/HeroProfileCard";
import {
  AttendanceMetricCard,
  BalanceMetricCard,
  GradeAverageMetricCard,
} from "@/components/MetricCards";
import AttendanceLog, { type AttendanceLogRow } from "@/components/AttendanceLog";
import AttendanceRibbon from "@/components/AttendanceRibbon";
import ChildGlanceRow from "@/components/ChildGlanceRow";
import TranscriptRow from "@/components/TranscriptRow";
import PaymentsList from "@/components/PaymentsList";
import AiEntryRow from "@/components/AiEntryRow";
import { attendanceStats, attendanceBySectionId } from "@/lib/utils/attendance";
import {
  arCount,
  chronological,
  dateRange,
  enCount,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatScore,
  scheduleLabel,
} from "@/lib/utils/register";
import { ChevronLeft, Users } from "lucide-react";

interface AttendanceRecord {
  section_id?: string;
  date: string;
  status: string;
  course_name: string;
}

interface SectionRow {
  id: string;
  course_name: string;
  status: string;
  class_time: string | null;
  class_duration_minutes: number | null;
  classroom: string | null;
  teacher_name: string | null;
  withdrawn: boolean;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
}

interface GradeRow {
  section_id: string;
  course_name: string;
  final_score: number | null;
  grade_label: string | null;
  graded_at: string | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  date: string;
  receipt_number: string;
  payment_method: string;
  course_name: string;
}

interface FeesSummary {
  total_net_price: number;
  total_paid: number;
  balance: number;
  sections: {
    section_id: string;
    course_name: string;
    net_price: number | null;
    total_paid: number;
    balance: number | null;
  }[];
}

interface Announcement {
  id: string;
  text_ar: string;
  text_en: string;
  sort_order: number;
  created_at: string | null;
}

interface ChildData {
  attendance: AttendanceRecord[];
  grades: GradeRow[];
  sections: SectionRow[];
  payments: PaymentRow[];
  fees: FeesSummary | null;
  asOf: string | null;
}

/**
 * Each child costs 5 proxied reads. Fine for the realistic 1–3, but a guardian
 * with a large family must not turn one page load into dozens of requests —
 * beyond this, a child's data is fetched when they are focused.
 */
const EAGER_LIMIT = 4;

/** How many of the most recent sessions the log shows before "view all". */
const LOG_LIMIT = 6;

const t = {
  ar: {
    greeting: "مرحبًا",
    noStudents: "لا يوجد طلاب مرتبطون بحسابك بعد. يرجى التواصل مع الإدارة.",
    children: "الأبناء",
    overview: "نظرة عامة",
    // metrics
    attendance: "الحضور",
    courseAverage: "متوسط الدرجات",
    outstanding: "المتبقي",
    averageShort: "المتوسط",
    activeStatus: "طالب نشط",
    registered: "مسجل منذ",
    sessions: (n: number) => arCount(n, "جلسة واحدة", "جلستان", "جلسات", "جلسة"),
    coursesGraded: (n: number) => arCount(n, "مقرر مصحح واحد", "مقرران مصححان", "مقررات مصححة", "مقررًا مصححًا"),
    activeCourses: (n: number) => arCount(n, "مقرر واحد نشط", "مقرران نشطان", "مقررات نشطة", "مقررًا نشطًا"),
    session: (n: number) => `الجلسة ${formatNumber(n, "ar")}`,
    noGrades: "لا توجد درجات مسجلة",
    noAttendance: "لا توجد سجلات حضور بعد.",
    settled: "مسدد",
    remaining: "متبقٍ",
    feesUnavailable: "تعذر تحميل الرسوم",
    // sections
    register: "سجل الحضور",
    viewAllRegister: "عرض السجل كاملًا",
    courses: "المقررات",
    viewAllCourses: "عرض كل المقررات",
    noCurrentCourses: "لا توجد مقررات حالية.",
    fees: "الرسوم",
    announcements: "الإعلانات",
    noAnnouncements: "لا توجد إعلانات حاليًا.",
    teacher: "المعلم",
    finalGrade: "الدرجة النهائية",
    notGraded: "لم يتم التقييم",
    withdrawnOn: "انسحب في",
    reason: "السبب",
    // ledger
    paid: "المدفوع",
    total: "الإجمالي",
    receipts: "أحدث الإيصالات",
    noReceipts: "لا توجد إيصالات بعد.",
    unpriced: "بعض المقررات بدون رسوم محددة، وهي غير محتسبة في الإجمالي.",
    // ai
    aiTitle: "مدرّس الذكاء الاصطناعي",
    aiBody: "اطرح سؤالًا عن أي مقرر واحصل على إجابة مدعومة بالمصادر.",
    aiCta: "فتح",
    aiSoon: "قيد التجهيز",
  },
  en: {
    greeting: "Welcome",
    noStudents: "No linked students yet. Please contact the administration.",
    children: "Children",
    overview: "Overview",
    attendance: "Attendance",
    courseAverage: "Course average",
    outstanding: "Outstanding",
    averageShort: "Average",
    activeStatus: "Active student",
    registered: "Registered",
    sessions: (n: number) => enCount(n, "session", "sessions"),
    coursesGraded: (n: number) => enCount(n, "course graded", "courses graded"),
    activeCourses: (n: number) => enCount(n, "active course", "active courses"),
    session: (n: number) => `Session ${n}`,
    noGrades: "No grades recorded",
    noAttendance: "No attendance records yet.",
    settled: "Settled",
    remaining: "Remaining",
    feesUnavailable: "Fees unavailable",
    register: "Attendance register",
    viewAllRegister: "View the full register",
    courses: "Courses",
    viewAllCourses: "View all courses",
    noCurrentCourses: "No current courses.",
    fees: "Fees",
    announcements: "Announcements",
    noAnnouncements: "No announcements right now.",
    teacher: "Teacher",
    finalGrade: "Final grade",
    notGraded: "Not graded",
    withdrawnOn: "Withdrawn on",
    reason: "Reason",
    paid: "Paid",
    total: "Total",
    receipts: "Recent receipts",
    noReceipts: "No receipts yet.",
    unpriced: "Some courses have no set fee — they are not counted in the total.",
    aiTitle: "AI tutor",
    aiBody: "Ask a question about any course and get a sourced answer.",
    aiCta: "Open",
    aiSoon: "Coming soon",
  },
};

const mean = (values: number[]): number | null =>
  values.length
    ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
    : null;

/** A panel: a titled white card, with an optional caption and corner action. */
function Panel({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <div className="flex items-center gap-3">
          {meta && <span className="tabular text-[11px] text-slate-400">{meta}</span>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function DashboardHome() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];
  const { user } = useAuth();
  const { setAsOf } = useLastUpdated();

  const { students, selectedId, selectedStudent, loading, refreshing, select, refresh } =
    useLinkedStudents(locale);

  const [data, setData] = useState<Record<string, ChildData>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Guards against the same child being fetched twice (double effect run, or a
  // refresh landing while the first load is still in flight).
  const inFlight = useRef<Set<string>>(new Set());

  const fetchChild = useCallback(
    async (studentId: string, force: boolean): Promise<ChildData> => {
      const reqParams = force
        ? { student_id: studentId, refresh: "1" }
        : { student_id: studentId };

      // Settled, so one failing endpoint degrades its own panel rather than
      // blanking the whole dashboard.
      const [att, grd, sec, pay, fee] = await Promise.allSettled([
        apiClient.get<AttendanceRecord[]>("/me/attendance", { params: reqParams }),
        apiClient.get<GradeRow[]>("/me/grades", { params: reqParams }),
        apiClient.get<SectionRow[]>("/me/sections", { params: reqParams }),
        apiClient.get<PaymentRow[]>("/me/payments", { params: reqParams }),
        apiClient.get<FeesSummary>("/me/fees", { params: reqParams }),
      ]);

      const settled = [att, grd, sec, pay, fee].find((r) => r.status === "fulfilled");
      const asOfHeader =
        settled && settled.status === "fulfilled"
          ? settled.value.headers?.["x-data-as-of"]
          : undefined;

      return {
        attendance: att.status === "fulfilled" ? att.value.data || [] : [],
        grades: grd.status === "fulfilled" ? grd.value.data || [] : [],
        sections: sec.status === "fulfilled" ? sec.value.data || [] : [],
        payments: pay.status === "fulfilled" ? pay.value.data || [] : [],
        fees: fee.status === "fulfilled" ? fee.value.data : null,
        asOf: typeof asOfHeader === "string" ? asOfHeader : null,
      };
    },
    []
  );

  const loadChild = useCallback(
    async (studentId: string, force = false) => {
      if (inFlight.current.has(studentId)) return;
      inFlight.current.add(studentId);
      setLoadingIds((prev) => (prev.includes(studentId) ? prev : [...prev, studentId]));
      try {
        const result = await fetchChild(studentId, force);
        setData((prev) => ({ ...prev, [studentId]: result }));
      } finally {
        inFlight.current.delete(studentId);
        setLoadingIds((prev) => prev.filter((id) => id !== studentId));
      }
    },
    [fetchChild]
  );

  // Eager: the first few children (so the rail is populated) plus whoever is
  // focused. Anything beyond EAGER_LIMIT loads when it is selected.
  useEffect(() => {
    if (students.length === 0) return;
    const targets = new Set(students.slice(0, EAGER_LIMIT).map((st) => st.student_id));
    if (selectedId) targets.add(selectedId);
    targets.forEach((id) => void loadChild(id));
  }, [students, selectedId, loadChild]);

  // Institute-wide, so it is fetched once and rendered independently of which
  // child is focused.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Announcement[]>("/me/announcements")
      .then((res) => {
        if (!cancelled) setAnnouncements(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setAnnouncements([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
    await refresh();
    setDataRefreshing(true);
    try {
      await Promise.all(Object.keys(data).map((id) => loadChild(id, true)));
    } finally {
      setDataRefreshing(false);
    }
  };

  const selectedData = selectedId ? data[selectedId] : undefined;
  const attendance = useMemo(() => selectedData?.attendance || [], [selectedData]);
  const stats = useMemo(() => attendanceStats(attendance), [attendance]);

  const scoredGrades = useMemo(
    () => (selectedData?.grades || []).filter((g) => g.final_score !== null),
    [selectedData]
  );
  const average = useMemo(
    () => mean(scoredGrades.map((g) => Number(g.final_score))),
    [scoredGrades]
  );

  const currentSections = useMemo(
    () => (selectedData?.sections || []).filter((sec) => sec.status === "active" && !sec.withdrawn),
    [selectedData]
  );

  const attendanceBySection = useMemo(
    () => attendanceBySectionId(attendance),
    [attendance]
  );
  const gradesBySection = useMemo(
    () => new Map((selectedData?.grades || []).map((g) => [g.section_id, g])),
    [selectedData]
  );

  // The newest sessions, each stamped with its position inside its own course.
  const logRows = useMemo<AttendanceLogRow[]>(() => {
    const sequence = new Map<AttendanceRecord, number>();
    for (const list of Object.values(attendanceBySection)) {
      chronological(list).forEach((record, index) => sequence.set(record, index + 1));
    }
    return chronological(attendance)
      .slice(-LOG_LIMIT)
      .reverse()
      .map((record, index) => ({
        id: `${record.date}-${record.section_id ?? "none"}-${index}`,
        date: record.date,
        courseName: record.course_name,
        sessionNumber: sequence.get(record) ?? null,
        status: record.status,
      }));
  }, [attendance, attendanceBySection]);

  const fees = selectedData?.fees || null;
  const busy = loading || (selectedId !== null && !selectedData);

  // The header owns the "last updated" indicator, so the page publishes its
  // timestamp while it is mounted and clears it on the way out.
  const asOf = selectedData?.asOf ?? null;
  useEffect(() => {
    setAsOf(asOf);
    return () => setAsOf(null);
  }, [asOf, setAsOf]);

  const viewAllCourses = (
    <button
      type="button"
      onClick={() => router.push(`/${locale}/dashboard/courses`)}
      className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 transition-colors"
    >
      {s.viewAllCourses}
      <ChevronLeft size={13} className={locale === "ar" ? "" : "rotate-180"} />
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{s.overview}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {s.greeting}، {user?.full_name}
          </p>
        </div>
        {/* The caption is omitted here — the header carries the timestamp. */}
        <RefreshButton
          locale={locale}
          refreshing={refreshing || dataRefreshing}
          onRefresh={handleRefresh}
          asOf={null}
        />
      </div>

      {busy ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState icon={Users} title={s.noStudents} />
      ) : (
        <>
          <HeroProfileCard
            name={selectedStudent?.full_name || ""}
            code={selectedStudent?.student_code}
            photoUrl={selectedStudent?.photo_url}
            statusLabel={s.activeStatus}
            coursesLabel={s.activeCourses(currentSections.length)}
            registeredLabel={s.registered}
            registeredAt={selectedStudent?.registered_at ?? null}
            locale={locale}
          />

          {/* Metrics — one column on phones, two on tablets, three on desktop. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AttendanceMetricCard
              title={s.attendance}
              rate={stats.total ? stats.rate : null}
              sessionsLabel={s.sessions(stats.total)}
              rangeLabel={dateRange(attendance, locale)}
              emptyLabel={s.noAttendance}
              locale={locale}
            />

            <GradeAverageMetricCard
              title={s.courseAverage}
              average={average}
              gradedLabel={
                scoredGrades.length ? s.coursesGraded(scoredGrades.length) : s.noGrades
              }
              emptyLabel={s.noGrades}
              locale={locale}
            />

            <BalanceMetricCard
              title={s.outstanding}
              balance={fees ? fees.balance : 0}
              total={fees ? fees.total_net_price : 0}
              paid={fees ? fees.total_paid : 0}
              remainingLabel={s.remaining}
              settledLabel={s.settled}
              paidLabel={s.paid}
              totalLabel={s.total}
              emptyLabel={s.feesUnavailable}
              locale={locale}
            />
          </div>

          {/* Guardian with more than one child: the whole family at a glance,
              and the switcher — every row's data is already loaded. */}
          {students.length > 1 && (
            <section className="card overflow-hidden">
              <h2 className="text-sm font-semibold text-slate-900 px-4 pt-4 pb-2">
                {s.children}
              </h2>
              {students.map((student) => {
                const child = data[student.student_id];
                const childStats = child ? attendanceStats(child.attendance) : null;
                const childScores = (child?.grades || [])
                  .filter((g) => g.final_score !== null)
                  .map((g) => Number(g.final_score));
                return (
                  <ChildGlanceRow
                    key={student.student_id}
                    name={student.full_name}
                    code={student.student_code}
                    active={student.student_id === selectedId}
                    onSelect={() => select(student.student_id)}
                    figures={[
                      {
                        label: s.attendance,
                        value:
                          childStats && childStats.total
                            ? formatPercent(childStats.rate, locale)
                            : "—",
                      },
                      { label: s.averageShort, value: formatScore(mean(childScores), locale) },
                      {
                        label: s.outstanding,
                        value: child?.fees
                          ? formatMoney(Math.max(0, child.fees.balance), locale)
                          : "—",
                      },
                    ]}
                  />
                );
              })}
            </section>
          )}

          <Panel
            title={s.register}
            meta={[
              stats.total ? s.sessions(stats.total) : null,
              dateRange(attendance, locale),
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <AttendanceRibbon
              records={attendance}
              locale={locale}
              emptyLabel={s.noAttendance}
            />
            <div className="mt-4 pt-4 border-t border-slate-100">
              <AttendanceLog
                rows={logRows}
                locale={locale}
                sessionLabel={s.session}
                emptyLabel={attendance.length ? undefined : s.noAttendance}
                footer={
                  attendance.length > LOG_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/${locale}/dashboard/attendance`)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 hover:bg-brand-50 text-slate-600 hover:text-brand-700 py-2.5 text-xs font-semibold border border-slate-200/70 hover:border-brand-100 transition-colors"
                    >
                      {s.viewAllRegister}
                      <ChevronLeft
                        size={14}
                        className={locale === "ar" ? "" : "rotate-180"}
                      />
                    </button>
                  ) : undefined
                }
              />
            </div>
          </Panel>

          <Panel
            title={s.courses}
            meta={currentSections.length ? s.activeCourses(currentSections.length) : undefined}
            action={viewAllCourses}
          >
            {currentSections.length === 0 ? (
              <p className="text-xs text-slate-400">{s.noCurrentCourses}</p>
            ) : (
              <div>
                {currentSections.map((section) => {
                  const sectionAttendance = attendanceBySection[section.id] || [];
                  const sectionStats = attendanceStats(sectionAttendance);
                  const grade = gradesBySection.get(section.id) || null;
                  return (
                    <TranscriptRow
                      key={section.id}
                      courseName={section.course_name}
                      teacherName={section.teacher_name}
                      schedule={scheduleLabel(section, locale)}
                      attendance={sectionAttendance}
                      rate={sectionStats.total ? sectionStats.rate : null}
                      sessions={sectionStats.total}
                      score={grade && grade.final_score !== null ? Number(grade.final_score) : null}
                      gradeLabel={grade?.grade_label ?? null}
                      withdrawn={section.withdrawn}
                      withdrawnAt={section.withdrawn_at}
                      withdrawalReason={section.withdrawal_reason}
                      locale={locale}
                      labels={{
                        teacher: s.teacher,
                        attendance: s.attendance,
                        sessions: s.sessions,
                        finalGrade: s.finalGrade,
                        notGraded: s.notGraded,
                        noAttendance: s.noAttendance,
                        withdrawnOn: s.withdrawnOn,
                        reason: s.reason,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={s.fees}>
            <p className="eyebrow mb-3">{s.receipts}</p>
            <PaymentsList
              payments={selectedData?.payments || []}
              locale={locale}
              hasUnpriced={(fees?.sections || []).some((sec) => sec.net_price === null)}
              labels={{
                noReceipts: fees ? s.noReceipts : s.feesUnavailable,
                unpriced: s.unpriced,
              }}
            />
          </Panel>

          {/* Institute-wide, so it sits outside the child's own panels. */}
          {announcements.length > 0 && (
            <Panel title={s.announcements}>
              <ul>
                {announcements.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-b-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-600 mt-1.5 shrink-0" />
                    <p className="flex-1 text-xs leading-relaxed text-slate-700">
                      {locale === "ar" ? item.text_ar : item.text_en}
                    </p>
                    {item.created_at && (
                      <span className="tabular text-[10px] text-slate-400 shrink-0">
                        {formatDate(item.created_at, locale)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <section className="card px-5 py-2">
            <AiEntryRow
              onOpen={() => router.push(`/${locale}/dashboard/ai/explain`)}
              labels={{
                title: s.aiTitle,
                body: s.aiBody,
                cta: s.aiCta,
                soon: s.aiSoon,
              }}
            />
          </section>
        </>
      )}
    </div>
  );
}
