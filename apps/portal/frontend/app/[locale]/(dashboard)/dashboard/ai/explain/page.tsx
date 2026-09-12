"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import StudentSelector from "@/components/StudentSelector";
import { Sparkles, Loader2, Send } from "lucide-react";

interface Section {
  id: string;
  course_name: string;
  status: string;
  withdrawn: boolean;
}

const t = {
  ar: {
    title: "اسأل الذكاء الاصطناعي",
    subtitle: "اطرح سؤالًا عن أي مقرر واحصل على إجابة مدعومة بالمصادر (قيد التجهيز — المرحلة 3)",
    course: "المقرر",
    coursePlaceholder: "اختر المقرر",
    noCourses: "لا توجد مقررات متاحة لطرح سؤال عنها.",
    loadingCourses: "جاري تحميل المقررات...",
    question: "سؤالك",
    questionPlaceholder: "مثال: اشرح لي قواعد اللغة الإنجليزية...",
    submit: "إرسال",
    queued: "تم إرسال سؤالك إلى قائمة الانتظار",
    comingSoon: "سيتم تفعيل الإجابات عند تشغيل ai-service (المرحلة 3).",
    failed: "تعذر إرسال السؤال. حاول مرة أخرى.",
  },
  en: {
    title: "Ask AI",
    subtitle: "Ask a question about any course and get a sourced answer (Phase 3)",
    course: "Course",
    coursePlaceholder: "Choose a course",
    noCourses: "No courses available to ask about.",
    loadingCourses: "Loading courses...",
    question: "Your question",
    questionPlaceholder: "e.g. Explain English grammar rules...",
    submit: "Send",
    queued: "Your question was queued",
    comingSoon: "Answers will be enabled once ai-service ships (Phase 3).",
    failed: "Could not send your question. Please try again.",
  },
};

export default function AiExplainPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];

  const { students, selectedId, loading: identityLoading, select } = useLinkedStudents(locale);

  const [sections, setSections] = useState<Section[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The backend rejects a request without a section_id, so the course has to be
  // chosen here rather than sent as undefined (which is what this page used to
  // do — every submit came back 400 into an empty catch).
  useEffect(() => {
    if (!selectedId) {
      setSections([]);
      return;
    }
    let cancelled = false;
    setCoursesLoading(true);
    apiClient
      .get<Section[]>("/me/sections", { params: { student_id: selectedId } })
      .then((res) => {
        if (cancelled) return;
        const all = res.data || [];
        const active = all.filter((section) => section.status === "active" && !section.withdrawn);
        const usable = active.length ? active : all.filter((section) => !section.withdrawn);
        setSections(usable);
        setSectionId((prev) =>
          prev && usable.some((section) => section.id === prev) ? prev : usable[0]?.id || ""
        );
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionId || !question.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ job_id: string }>("/ai/explain", {
        section_id: sectionId,
        question: question.trim(),
      });
      setJobId(res.data.job_id);
    } catch {
      setError(s.failed);
    } finally {
      setSubmitting(false);
    }
  };

  const coursesBusy = identityLoading || coursesLoading;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl md:text-2xl font-bold tracking-tight text-slate-900">
          <Sparkles className="text-ai-600" size={24} />
          {s.title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        {students.length > 1 && (
          <StudentSelector
            locale={locale}
            students={students}
            selectedId={selectedId}
            onSelect={select}
            disabled={coursesBusy}
          />
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            {s.course}
          </label>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={coursesBusy || sections.length === 0}
            className="input-field"
          >
            {sections.length === 0 && <option value="">{s.coursePlaceholder}</option>}
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.course_name}
              </option>
            ))}
          </select>
          {coursesBusy && (
            <p className="text-[11px] text-slate-400 mt-1.5">{s.loadingCourses}</p>
          )}
          {!coursesBusy && sections.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-1.5">{s.noCourses}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            {s.question}
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={s.questionPlaceholder}
            rows={4}
            className="input-field resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !sectionId || !question.trim()}
          className="btn-primary flex items-center gap-2"
        >
          {submitting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          <span>{s.submit}</span>
        </button>

        {error && <p className="text-xs text-rose-600">{error}</p>}
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
