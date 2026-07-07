"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import { Loader2, ArrowLeft, Users } from "lucide-react";

interface SectionEnrollmentDetail {
  id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  student_email: string | null;
  section_id: string;
  enrolled_at: string;
  agreed_price: number | null;
  admin_discount: number | null;
  total_paid: number;
  balance_remaining: number | null;
  final_score: number | null;
  grade_label: string | null;
}

interface SectionInfo {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
  status: string;
  teacher_percentage: number | null;
  min_students_required: number | null;
  start_date: string | null;
  end_date: string | null;
  class_time: string | null;
  class_duration_minutes: number | null;
  classroom: string | null;
  price: number | null;
}

interface Course { id: string; name: string; code: string; }
interface Employee { id: string; full_name: string; }

export default function SectionStudentsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";
  const sectionId = params?.sectionId as string;

  const t = {
    ar: {
      title: "طلاب الشعبة",
      back: "عودة",
      course: "المقرر",
      teacher: "المدرس",
      status: "الحالة",
      capacity: "السعة",
      enrolled: "المسجلون",
      price: "السعر",
      schedule: "الجدول",
      studentName: "اسم الطالب",
      studentCode: "الرمز",
      email: "البريد الإلكتروني",
      enrollDate: "تاريخ التسجيل",
      agreedPrice: "السعر المتفق عليه",
      discount: "الخصم",
      totalPaid: "المدفوع",
      balance: "المتبقي",
      finalScore: "الدرجة النهائية",
      grade: "التقدير",
      loading: "جاري التحميل...",
      empty: "لا يوجد طلاب مسجلون في هذه الشعبة",
      sar: "ريال",
      pending: "قيد الانتظار",
      active: "نشط",
      completed: "مكتمل",
      notFound: "الشعبة غير موجودة",
      financialSummary: "الملخص المالي",
      sectionFullAmount: "إجمالي المبلغ المستحق",
      totalPaidSummary: "إجمالي المدفوع",
      remaining: "المتبقي",
      of: "من",
    },
    en: {
      title: "Section Students",
      back: "Back",
      course: "Course",
      teacher: "Teacher",
      status: "Status",
      capacity: "Capacity",
      enrolled: "Enrolled",
      price: "Price",
      schedule: "Schedule",
      studentName: "Student Name",
      studentCode: "Code",
      email: "Email",
      enrollDate: "Enroll Date",
      agreedPrice: "Agreed Price",
      discount: "Discount",
      totalPaid: "Total Paid",
      balance: "Balance",
      finalScore: "Final Score",
      grade: "Grade",
      loading: "Loading...",
      empty: "No students enrolled in this section",
      sar: "YER",
      pending: "Pending",
      active: "Active",
      completed: "Completed",
      notFound: "Section not found",
      financialSummary: "Financial Summary",
      sectionFullAmount: "Total Amount Due",
      totalPaidSummary: "Total Paid",
      remaining: "Remaining",
      of: "of",
    },
  }[locale === "en" ? "en" : "ar"];

  const [section, setSection] = useState<SectionInfo | null>(null);
  const [students, setStudents] = useState<SectionEnrollmentDetail[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchData = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const [sectRes, enrollRes, courseRes, teachersRes] = await Promise.all([
        apiClient.get<{ items: SectionInfo[]; total: number }>(
          `/academic/course-sections?limit=1000`
        ).catch(() => null),
        apiClient.get<SectionEnrollmentDetail[]>(
          `/academic/sections/${sectionId}/enrollments/detailed`
        ).catch(() => null),
        apiClient.get<{ items: Course[]; total: number }>("/academic/courses?limit=1000").catch(() => null),
        apiClient.get<any[]>("/users/teachers").catch(() => null),
      ]);

      if (courseRes) setCourses(courseRes.data.items);
      if (teachersRes) setTeachers(teachersRes.data);
      if (enrollRes) setStudents(enrollRes.data);

      if (sectRes) {
        const found = sectRes.data.items.find(s => s.id === sectionId);
        if (found) {
          setSection(found);
        } else {
          setNotFound(true);
        }
      } else {
        setNotFound(true);
      }
    } catch (e) {
      console.error(e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return d; }
  };

  const financialSummary = useMemo(() => {
    const fullAmount = students.reduce((sum, s) => {
      const price = s.agreed_price ?? section?.price ?? 0;
      return sum + price;
    }, 0);
    const totalPaid = students.reduce((sum, s) => sum + (s.total_paid || 0), 0);
    const remaining = fullAmount - totalPaid;
    const percentage = fullAmount > 0 ? (totalPaid / fullAmount) * 100 : 0;
    return { fullAmount, totalPaid, remaining, percentage };
  }, [students, section]);

  const getCourseName = (courseId: string) => courses.find((c) => c.id === courseId)?.name || courseId;
  const getTeacherName = (teacherId: string) => teachers.find((u) => u.id === teacherId)?.full_name || teacherId;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-50 text-amber-600 border-amber-200",
      active: "bg-emerald-50 text-emerald-600 border-emerald-200",
      completed: "bg-slate-100 text-slate-500 border-slate-200",
    };
    const labels: Record<string, string> = {
      pending: t.pending,
      active: t.active,
      completed: t.completed,
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>{t.notFound}</p>
        <button onClick={() => router.back()} className="btn-primary mt-4">{t.back}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-icon" title={t.back}>
            <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
            {section && (
              <p className="text-sm text-slate-500 mt-1">
                {getCourseName(section.course_id)} &middot; {t.teacher}: {getTeacherName(section.teacher_id)}
              </p>
            )}
          </div>
        </div>
        <RefreshButton onRefresh={fetchData} />
      </div>

      {section && (
        <div className="card p-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t.course}:</span>
            <span className="font-semibold text-slate-900">{getCourseName(section.course_id)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t.teacher}:</span>
            <span className="font-semibold text-slate-900">{getTeacherName(section.teacher_id)}</span>
          </div>
          <div>{statusBadge(section.status)}</div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{t.capacity}:</span>
            <span className="font-semibold text-slate-900">{section.enrolled_count}/{section.capacity}</span>
          </div>
          {section.price != null && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t.price}:</span>
              <span className="font-semibold text-slate-900">{section.price} {t.sar}</span>
            </div>
          )}
          {(section.start_date || section.class_time || section.classroom) && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t.schedule}:</span>
              <span className="font-semibold text-slate-900 text-xs">
                {section.start_date && (
                  <span>{section.start_date}{section.end_date ? ` → ${section.end_date}` : ""}</span>
                )}
                {section.class_time && <span className="ms-1">{section.class_time}</span>}
                {section.classroom && <span className="ms-1">({section.classroom})</span>}
              </span>
            </div>
          )}
        </div>
      )}

      {students.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">{t.financialSummary}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">{t.sectionFullAmount}</p>
              <p className="text-lg font-bold text-slate-900">
                {financialSummary.fullAmount.toFixed(2)} {t.sar}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-emerald-600 mb-1">{t.totalPaidSummary}</p>
              <p className="text-lg font-bold text-emerald-700">
                {financialSummary.totalPaid.toFixed(2)} {t.sar}
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-amber-600 mb-1">{t.remaining}</p>
              <p className={`text-lg font-bold ${
                financialSummary.remaining > 0 ? "text-amber-700" : "text-emerald-700"
              }`}>
                {financialSummary.remaining.toFixed(2)} {t.sar}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>{financialSummary.totalPaid.toFixed(2)} {t.sar}</span>
              <span>{financialSummary.fullAmount.toFixed(2)} {t.sar}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  financialSummary.percentage >= 100
                    ? "bg-emerald-500"
                    : financialSummary.percentage > 0
                    ? "bg-amber-500"
                    : "bg-slate-300"
                }`}
                style={{
                  [isRtl ? "marginRight" : "marginLeft"]: 0,
                  width: `${Math.min(financialSummary.percentage, 100)}%`,
                  marginInlineStart: 0,
                }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {financialSummary.percentage.toFixed(1)}% {t.of} {financialSummary.fullAmount.toFixed(2)} {t.sar}
            </p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users size={16} className="text-slate-400" />
          {t.enrolled} ({students.length})
        </div>
        {students.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t.empty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.studentName}</th>
                  <th>{t.studentCode}</th>
                  <th className="hidden md:table-cell">{t.email}</th>
                  <th>{t.enrollDate}</th>
                  <th className="hidden md:table-cell">{t.agreedPrice}</th>
                  <th className="hidden md:table-cell">{t.discount}</th>
                  <th>{t.totalPaid}</th>
                  <th>{t.balance}</th>
                  <th className="hidden md:table-cell">{t.finalScore}</th>
                  <th className="hidden md:table-cell">{t.grade}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((enr) => (
                  <tr key={enr.id}>
                    <td className="font-medium text-slate-900">
                      <button
                        onClick={() => router.push(`/${locale}/dashboard/students/${enr.student_id}`)}
                        className="text-blue-600 hover:underline text-start"
                      >
                        {enr.student_name}
                      </button>
                    </td>
                    <td className="text-slate-600">{enr.student_code}</td>
                    <td className="hidden md:table-cell text-slate-500 text-xs">{enr.student_email || "—"}</td>
                    <td className="text-slate-600 text-xs">{formatDate(enr.enrolled_at)}</td>
                    <td className="hidden md:table-cell text-slate-600">
                      {enr.agreed_price != null ? `${enr.agreed_price.toFixed(2)} ${t.sar}` : "—"}
                    </td>
                    <td className="hidden md:table-cell text-slate-600">
                      {enr.admin_discount != null ? `${enr.admin_discount}%` : "—"}
                    </td>
                    <td className="font-semibold text-emerald-600">
                      {enr.total_paid > 0 ? `${enr.total_paid.toFixed(2)} ${t.sar}` : "—"}
                    </td>
                    <td>
                      {enr.balance_remaining != null ? (
                        <span className={`font-semibold ${
                          enr.balance_remaining > 0 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {enr.balance_remaining > 0
                            ? `${enr.balance_remaining.toFixed(2)} ${t.sar}`
                            : "0"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="hidden md:table-cell text-slate-700 font-semibold">
                      {enr.final_score != null ? `${enr.final_score}%` : "—"}
                    </td>
                    <td className="hidden md:table-cell">
                      {enr.grade_label ? (
                        <span className="badge badge-success">{enr.grade_label}</span>
                      ) : "—"}
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
