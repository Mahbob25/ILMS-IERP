"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Wallet,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

interface SectionInfo {
  id: string;
  name: string;
  course_name: string;
  enrolled_count: number;
  capacity: number;
}

interface TodaySession {
  id: string;
  section_name: string;
  course_name: string;
  date: string;
}

interface RecentPayment {
  id: string;
  student_name: string;
  course_name: string;
  amount: number;
  date: string;
  receipt_number: string;
}

interface TeacherDashboardData {
  sections_count: number;
  sections: SectionInfo[];
  today_sessions_count: number;
  today_sessions: TodaySession[];
  pending_grading: number;
  wallet_balance: number;
  recent_payments: RecentPayment[];
}

export default function TeacherDashboard() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const currencySymbol = locale === "ar" ? "ريال" : "YER";
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<TeacherDashboardData>("/dashboard/teacher")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  const t = {
    ar: {
      sections: "شعبي",
      todaySessions: "جلسات اليوم",
      pendingGrading: "بانتظار التصحيح",
      wallet: "محفظتي",
      noSessions: "لا توجد جلسات اليوم",
      noPayments: "لا توجد مدفوعات حديثة",
      student: "طالب",
      course: "مقرر",
      amount: "المبلغ",
      receipt: "رقم السند",
      recentPayments: "آخر المدفوعات",
      mySections: "شعبي الدراسية",
    },
    en: {
      sections: "My Sections",
      todaySessions: "Today's Sessions",
      pendingGrading: "Pending Grading",
      wallet: "My Wallet",
      noSessions: "No sessions today",
      noPayments: "No recent payments",
      student: "Student",
      course: "Course",
      amount: "Amount",
      receipt: "Receipt",
      recentPayments: "Recent Payments",
      mySections: "My Sections",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 h-48" />
          <div className="card p-5 h-48" />
        </div>
        <div className="card p-5 h-48" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <p className="text-red-500 font-medium">{error || "No data"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.sections_count}</p>
            <p className="text-xs text-slate-500">{t.sections}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.today_sessions_count}</p>
            <p className="text-xs text-slate-500">{t.todaySessions}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            data.pending_grading > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
          }`}>
            <ClipboardCheck size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.pending_grading}</p>
            <p className="text-xs text-slate-500">{t.pendingGrading}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Wallet size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.wallet_balance.toFixed(2)} {currencySymbol}</p>
            <p className="text-xs text-slate-500">{t.wallet}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-emerald-500" />
            <span>{t.todaySessions}</span>
          </h3>
          {data.today_sessions.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t.noSessions}</p>
          ) : (
            <div className="space-y-2">
              {data.today_sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.section_name}</p>
                    <p className="text-xs text-slate-500">{s.date}</p>
                  </div>
                  <ExternalLink size={14} className="text-emerald-500" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <BookOpen size={16} className="text-blue-500" />
            <span>{t.mySections}</span>
          </h3>
          {data.sections.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">-</p>
          ) : (
            <div className="space-y-2">
              {data.sections.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-sm font-medium text-slate-900">{s.course_name}</p>
                  <span className="text-xs text-slate-500">{s.enrolled_count}/{s.capacity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4">{t.recentPayments}</h3>
        {data.recent_payments.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">{t.noPayments}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.student}</th>
                <th>{t.course}</th>
                <th>{t.amount}</th>
                <th>{t.receipt}</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-slate-900">{p.student_name}</td>
                  <td className="text-slate-600">{p.course_name}</td>
                  <td className="font-semibold text-emerald-600">{p.amount.toFixed(2)} {currencySymbol}</td>
                  <td className="text-slate-500 text-xs font-mono">{p.receipt_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
