"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Sparkles, Loader2, Send } from "lucide-react";

const t = {
  ar: {
    title: "اسأل الذكاء الاصطناعي",
    subtitle: "اطرح سؤالًا عن أي مقرر واحصل على إجابة مدعومة بالمصادر (قيد التجهيز — المرحلة 3)",
    question: "سؤالك",
    questionPlaceholder: "مثال: اشرح لي قواعد اللغة الإنجليزية...",
    submit: "إرسال",
    queued: "تم إرسال سؤالك إلى قائمة الانتظار",
    comingSoon: "سيتم تفعيل الإجابات عند تشغيل ai-service (المرحلة 3).",
  },
  en: {
    title: "Ask AI",
    subtitle: "Ask a question about any course and get a sourced answer (Phase 3)",
    question: "Your question",
    questionPlaceholder: "e.g. Explain English grammar rules...",
    submit: "Send",
    queued: "Your question was queued",
    comingSoon: "Answers will be enabled once ai-service ships (Phase 3).",
  },
};

export default function AiExplainPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const s = t[locale === "en" ? "en" : "ar"];

  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ job_id: string }>("/ai/explain", {
        section_id: undefined,
        question,
      });
      setJobId(res.data.job_id);
    } catch {
      // surface via console for skeleton; Phase 3 adds a toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Sparkles className="text-ai-600" size={24} />
          {s.title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <label className="block text-xs font-medium text-slate-700">
          {s.question}
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={s.questionPlaceholder}
          rows={4}
          className="input-field resize-none"
        />
        <button
          type="submit"
          disabled={submitting || !question.trim()}
          className="btn-primary flex items-center gap-2"
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Send size={14} />
          )}
          <span>{s.submit}</span>
        </button>
      </form>

      {jobId && (
        <div className="card p-5">
          <p className="text-sm font-semibold text-ai-700">{s.queued}</p>
          <p className="text-xs text-slate-500 mt-1" dir="ltr">
            job_id: {jobId}
          </p>
          <p className="text-xs text-slate-400 mt-2">{s.comingSoon}</p>
        </div>
      )}
    </div>
  );
}
