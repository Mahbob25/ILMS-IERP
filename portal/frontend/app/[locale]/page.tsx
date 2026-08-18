"use client";

import { useParams, useRouter } from "next/navigation";
import { GraduationCap, ExternalLink } from "lucide-react";

const t = {
  ar: {
    title: "بوابة الطلاب تعمل",
    desc: "هذه الصفحة تؤكد أن الواجهة الأمامية للبوابة تعمل بشكل صحيح.",
    login: "تسجيل الدخول",
    lang: "English",
  },
  en: {
    title: "Portal frontend is running",
    desc: "This page confirms the portal frontend is running correctly.",
    login: "Sign In",
    lang: "العربية",
  },
};

export default function PortalStatusPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];
  const erpBase = process.env.NEXT_PUBLIC_ERP_URL || (typeof window !== "undefined" ? window.location.origin : "");

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 p-4 md:p-8">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-brand-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-indigo-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 md:p-8 relative z-10 text-center">
        <div className="flex justify-between items-center mb-8">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
          <button
            onClick={() => {
              const target = locale === "ar" ? "en" : "ar";
              router.push(`/${target}`);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors duration-150 py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200"
          >
            <GraduationCap size={13} />
            <span>{s.lang}</span>
          </button>
        </div>

        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white border border-slate-200 shadow-lg shadow-brand-500/20 flex items-center justify-center mx-auto mb-4 p-2 overflow-hidden">
          <GraduationCap className="w-full h-full text-brand-600" />
        </div>

        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
          {s.title}
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-2 leading-relaxed">
          {s.desc}
        </p>

        <a
          href={`${erpBase}/${locale}/login`}
          className="mt-6 inline-flex items-center gap-2 w-full justify-center py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-brand-500 hover:bg-brand-600 shadow-lg shadow-brand-500/25 transition-all duration-150"
        >
          {s.login}
          <ExternalLink size={15} />
        </a>
      </div>
    </div>
  );
}
