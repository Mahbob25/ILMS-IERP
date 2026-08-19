"use client";

import React from "react";
import { useParams } from "next/navigation";
import { CalendarRange } from "lucide-react";

const t = {
  ar: {
    title: "خطة المذاكرة",
    subtitle: "ميزة قادمة — نفس نمط مساعد الذكاء الاصطناعي عبر قائمة الانتظار HIGH.",
  },
  en: {
    title: "Revision Plan",
    subtitle: "Coming soon — same HIGH-queue AI pattern as the tutor.",
  },
};

export default function AiRevisionPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const s = t[locale === "en" ? "en" : "ar"];

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
        <CalendarRange className="text-ai-600" size={24} />
        {s.title}
      </h1>
      <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
    </div>
  );
}
