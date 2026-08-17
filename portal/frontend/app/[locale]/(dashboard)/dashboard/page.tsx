"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Award, CalendarCheck, Wallet, Sparkles, Users, Loader2 } from "lucide-react";

interface LinkedStudent {
  student_id: string;
  full_name: string;
  student_code: string;
}

interface MeResponse {
  actor_id: string;
  linked_students: LinkedStudent[];
}

const t = {
  ar: {
    welcome: "مرحبًا",
    noStudents: "لا يوجد طلاب مرتبطون بحسابك بعد. يرجى التواصل مع الإدارة.",
    overview: "نظرة عامة",
    grades: "الدرجات",
    attendance: "الحضور",
    fees: "الرسوم الدراسية",
    aiTeaser: "مساعد الذكاء الاصطناعي",
    aiTeaserDesc: "اطرح سؤالًا عن أي مقرر واحصل على إجابة مدعومة بالمصادر. قريبًا.",
    loading: "جاري التحميل...",
    code: "الرقم",
  },
  en: {
    welcome: "Welcome",
    noStudents: "No linked students yet. Please contact the administration.",
    overview: "Overview",
    grades: "Grades",
    attendance: "Attendance",
    fees: "Tuition Fees",
    aiTeaser: "AI Tutor",
    aiTeaserDesc: "Ask a question about any course and get a sourced answer. Coming soon.",
    loading: "Loading...",
    code: "Code",
  },
};

export default function DashboardHome() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const { user } = useAuth();
  const s = t[locale === "en" ? "en" : "ar"];

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<MeResponse>("/me")
      .then((res) => {
        if (!cancelled) setMe(res.data);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const students = me?.linked_students || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
          {s.welcome}، {user?.full_name}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{s.overview}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={20} />
          <span className="text-sm">{s.loading}</span>
        </div>
      ) : students.length === 0 ? (
        <div className="card p-8 text-center">
          <Users className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-sm text-slate-500">{s.noStudents}</p>
        </div>
      ) : (
        <>
          {/* Linked students */}
          <div className="grid gap-4 md:grid-cols-2">
            {students.map((st) => (
              <div key={st.student_id} className="card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{st.full_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5" dir="ltr">
                      {s.code}: {st.student_code}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                    <Users size={18} className="text-brand-600" />
                  </div>
                </div>
              </div>
            ))}
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
