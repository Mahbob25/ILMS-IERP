"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";
import { GraduationCap, ArrowRight, Sparkles } from "lucide-react";

const t = {
  ar: {
    badge: "بوابة الطلاب وأولياء الأمور",
    title: "بوابة Al-Drasat",
    subtitle:
      "تابع درجات أبنائك وحضورهم ورسومهم الدراسية من مكان واحد، مع مساعد تعليمي ذكي قادم قريبًا.",
    cta: "تسجيل الدخول",
    features: ["الدرجات", "الحضور", "الرسوم الدراسية"],
    aiTeaser: "مساعد الذكاء الاصطناعي قريبًا",
  },
  en: {
    badge: "Student & Parent Portal",
    title: "Al-Drasat Portal",
    subtitle:
      "Track your children's grades, attendance, and tuition from one place — with a smart AI tutor coming soon.",
    cta: "Sign In",
    features: ["Grades", "Attendance", "Tuition Fees"],
    aiTeaser: "AI Tutor Coming Soon",
  },
};

export default function LandingPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const s = t[locale === "en" ? "en" : "ar"];

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 p-4 md:p-8">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-brand-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-ai-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 md:p-8 relative z-10 transition-all duration-300 animate-slide-up">
        <div className="flex justify-between items-center mb-8">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 border border-brand-200">
            {s.badge}
          </span>
          <button
            onClick={() => {
              const target = locale === "ar" ? "en" : "ar";
              router.push(`/${target}`);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors duration-150 py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200"
          >
            <GraduationCap size={13} />
            <span>{locale === "ar" ? "English" : "العربية"}</span>
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white border border-slate-200 shadow-lg shadow-brand-500/20 flex items-center justify-center mx-auto mb-4 p-2 overflow-hidden">
            <GraduationCap className="w-full h-full text-brand-600" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            {s.title}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-2 leading-relaxed">
            {s.subtitle}
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-6">
          {s.features.map((f) => (
            <span
              key={f}
              className="badge badge-success px-3 py-1.5 text-xs font-semibold"
            >
              {f}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-ai-50 border border-ai-100 mb-6">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-ai-600" />
            <span className="text-xs font-semibold text-ai-700">{s.aiTeaser}</span>
          </div>
        </div>

        <button
          onClick={() => router.push(`/${locale}/login`)}
          className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-brand-500 hover:bg-brand-600 shadow-lg shadow-brand-500/25 transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <span>{s.cta}</span>
          <ArrowRight size={16} className={locale === "ar" ? "rotate-180" : ""} />
        </button>
      </div>
    </div>
  );
}
