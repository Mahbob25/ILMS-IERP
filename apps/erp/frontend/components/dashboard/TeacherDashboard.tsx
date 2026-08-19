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

interface TeacherDashboardData {
  sections_count: number;
  sections: SectionInfo[];
  today_sessions_count: number;
  today_sessions: TodaySession[];
  pending_grading: number;
  wallet_balance: number;
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
      mySections: "شعبي الدراسية",
    },
    en: {
      sections: "My Sections",
      todaySessions: "Today's Sessions",
      pendingGrading: "Pending Grading",
      wallet: "My Wallet",
      noSessions: "No sessions today",
      mySections: "My Sections",
    },
  }[locale === "en" ? "en" : "ar"];

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-20" />
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
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.sections_count}</p>
            <p className="text-xs text-slate-500">{t.sections}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.today_sessions_count}</p>
            <p className="text-xs text-slate-500">{t.todaySessions}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            data.pending_grading > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
          }`}>
            <ClipboardCheck size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.pending_grading}</p>
            <p className="text-xs text-slate-500">{t.pendingGrading}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{data.wallet_balance.toFixed(2)} {currencySymbol}</p>
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

    </div>
  );
}
