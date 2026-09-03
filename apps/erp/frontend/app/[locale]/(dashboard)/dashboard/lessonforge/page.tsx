"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import EmptyState from "@/components/EmptyState";
import TableContainer from "@/components/ui/TableContainer";
import { sanitizeInput } from "@/lib/utils/input";
import { formatDisplayDateTime } from "@/lib/dates";
import {
  Loader2, RefreshCw, Wand2, Eye, Trash2, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";

interface LessonForgeResource {
  id: string;
  title: string | null;
  output_mode: string;
  status: string; // queued | processing | completed | failed
  format: string;
  created_at: string;
}

interface JobStatus {
  job_id: string;
  status: string;
  resource_id?: string | null;
  error?: string | null;
}

const OUTPUT_MODES = [
  { value: "auto", ar: "تلقائي", en: "Auto" },
  { value: "cheat_sheet", ar: "ملخص سريع", en: "Cheat Sheet" },
  { value: "revision_guide", ar: "دليل مراجعة", en: "Revision Guide" },
  { value: "worksheet", ar: "ورقة عمل", en: "Worksheet" },
  { value: "quiz", ar: "اختبار قصير", en: "Quiz" },
  { value: "poster", ar: "ملصق صفي", en: "Poster" },
  { value: "practice", ar: "تمارين تدريبية", en: "Practice" },
  { value: "exit_ticket", ar: "بطاقة خروج", en: "Exit Ticket" },
  { value: "learning_pack", ar: "حزمة تعلم", en: "Learning Pack" },
  { value: "flashcards", ar: "بطاقات تعليمية", en: "Flashcards" },
];

const STYLES = [
  { value: "colorful", ar: "ملوّن", en: "Colorful" },
  { value: "minimalist", ar: "بسيط", en: "Minimalist" },
  { value: "playful", ar: "مرح", en: "Playful" },
  { value: "academic", ar: "أكاديمي", en: "Academic" },
  { value: "professional", ar: "احترافي", en: "Professional" },
  { value: "dark", ar: "داكن", en: "Dark" },
  { value: "pastel", ar: "باستيل", en: "Pastel" },
  { value: "modern", ar: "حديث", en: "Modern" },
  { value: "classroom-friendly", ar: "مناسب للصف", en: "Classroom-friendly" },
  { value: "custom", ar: "وصف مخصص", en: "Custom" },
];

const LEVELS = [
  { value: "auto", ar: "تلقائي", en: "Auto" },
  { value: "beginner", ar: "مبتدئ", en: "Beginner" },
  { value: "elementary", ar: "ابتدائي", en: "Elementary" },
  { value: "middle_school", ar: "متوسط", en: "Middle School" },
  { value: "high_school", ar: "ثانوي", en: "High School" },
  { value: "university", ar: "جامعي", en: "University" },
  { value: "adult", ar: "بالغ", en: "Adult" },
];

const DIFFICULTIES = [
  { value: "auto", ar: "تلقائي", en: "Auto" },
  { value: "easy", ar: "سهل", en: "Easy" },
  { value: "medium", ar: "متوسط", en: "Medium" },
  { value: "hard", ar: "صعب", en: "Hard" },
  { value: "advanced", ar: "متقدم", en: "Advanced" },
];

const LANGUAGES = [
  { value: "english", ar: "الإنجليزية فقط", en: "English" },
  { value: "bilingual", ar: "ثنائي اللغة", en: "Bilingual" },
  { value: "arabic", ar: "العربية", en: "Arabic" },
  { value: "auto", ar: "تلقائي", en: "Auto" },
];

const CONTENT_MODES = [
  { value: "strict_source", ar: "المصدر فقط", en: "Strict Source" },
  { value: "source_plus_examples", ar: "المصدر + أمثلة", en: "Source + Examples" },
  { value: "teacher_creative", ar: "إثراء تربوي", en: "Teacher Creative" },
];

const PRACTICE_TYPES = [
  { value: "auto", ar: "تلقائي", en: "Auto" },
  { value: "multiple_choice", ar: "اختيار من متعدد", en: "Multiple Choice" },
  { value: "fill_in_the_blank", ar: "ملء الفراغ", en: "Fill in the Blank" },
  { value: "correct_the_sentence", ar: "تصحيح الجملة", en: "Correct the Sentence" },
  { value: "matching", ar: "مطابقة", en: "Matching" },
  { value: "true_false", ar: "صح / خطأ", en: "True / False" },
  { value: "short_answer", ar: "إجابة قصيرة", en: "Short Answer" },
  { value: "mixed", ar: "متنوعة", en: "Mixed" },
];

const statusBadge = (status: string, t: any) => {
  if (status === "completed") return <span className="badge badge-success">{t.completed}</span>;
  if (status === "failed") return <span className="badge badge-warning">{t.failed}</span>;
  return <span className="badge badge-muted">{status === "queued" ? t.queued : t.processing}</span>;
};

function LessonForgeView({ locale }: { locale: string }) {
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "منشئ الموارد التعليمية",
      subtitle: "حوّل محتوى الدرس إلى موارد صفية جاهزة للاستخدام",
      generate: "إنشاء المورد",
      generating: "جارٍ الإنشاء...",
      topicText: "نص الدرس (مطلوب)",
      topicPlaceholder: "الصق محتوى الدرس أو الملاحظات أو القواعد والأمثلة هنا...",
      style: "النمط البصري (مطلوب)",
      styleCustom: "وصف النمط المخصص",
      stylePlaceholder: "مثال: ألوان صحراوية دافئة مع خطوط واضحة وكبيرة...",
      language: "لغة الشرح",
      learnerLevel: "مستوى المتعلم",
      subject: "المادة",
      gradeLevel: "الصف الدراسي",
      learningObjective: "الهدف التعليمي",
      difficulty: "الصعوبة",
      lessonDuration: "مدة الدرس",
      outputMode: "نوع المورد",
      contentMode: "وضع المحتوى",
      includeExceptions: "تشمل الاستثناءات",
      includeCommonMistakes: "تشمل الأخطاء الشائعة",
      includePractice: "تشمل تمارين",
      includeAnswerKey: "تشمل نموذج الإجابة",
      includeTeacherNotes: "تشمل ملاحظات المعلم",
      practiceType: "نوع التمارين",
      practiceCount: "عدد الأسئلة",
      supportingNotes: "ملاحظات داعمة (اختياري)",
      supportingPlaceholder: "شروحات إضافية، نصائح صفية، ترجمات، أخطاء شائعة...",
      history: "الموارد السابقة",
      emptyHistory: "لا توجد موارد بعد",
      emptyHistoryMsg: "أنشئ أول مورد لك من النموذج أعلاه",
      refresh: "تحديث",
      loading: "جارٍ التحميل...",
      titleCol: "العنوان",
      typeCol: "النوع",
      statusCol: "الحالة",
      dateCol: "التاريخ",
      actionsCol: "إجراءات",
      view: "عرض",
      delete: "حذف",
      deleteConfirm: "هل تريد حذف هذا المورد؟",
      failed: "فشل",
      completed: "مكتمل",
      queued: "في الانتظار",
      processing: "قيد الإنشاء",
      requiredFields: "يرجى إدخال نص الدرس واختيار النمط البصري",
      generateError: "تعذر بدء الإنشاء. حاول مرة أخرى.",
      jobError: "فشل إنشاء المورد: ",
      retry: "إعادة المحاولة",
      success: "تم إنشاء المورد بنجاح",
      accessDenied: "ليس لديك صلاحية الوصول",
    },
    en: {
      title: "LessonForge",
      subtitle: "Turn lesson content into classroom-ready resources",
      generate: "Generate Resource",
      generating: "Generating...",
      topicText: "Topic text (required)",
      topicPlaceholder: "Paste the lesson content, notes, rules, examples, or study material here...",
      style: "Visual style (required)",
      styleCustom: "Custom style description",
      stylePlaceholder: "e.g. warm desert colors with large clear typography...",
      language: "Explanation language",
      learnerLevel: "Learner level",
      subject: "Subject",
      gradeLevel: "Grade level",
      learningObjective: "Learning objective",
      difficulty: "Difficulty",
      lessonDuration: "Lesson duration",
      outputMode: "Resource type",
      contentMode: "Content mode",
      includeExceptions: "Include exceptions",
      includeCommonMistakes: "Include common mistakes",
      includePractice: "Include practice",
      includeAnswerKey: "Include answer key",
      includeTeacherNotes: "Include teacher notes",
      practiceType: "Practice type",
      practiceCount: "Question count",
      supportingNotes: "Supporting notes (optional)",
      supportingPlaceholder: "Teacher explanations, classroom tips, translations, common misconceptions...",
      history: "My Resources",
      emptyHistory: "No resources yet",
      emptyHistoryMsg: "Generate your first resource from the form above",
      refresh: "Refresh",
      loading: "Loading...",
      titleCol: "Title",
      typeCol: "Type",
      statusCol: "Status",
      dateCol: "Date",
      actionsCol: "Actions",
      view: "View",
      delete: "Delete",
      deleteConfirm: "Delete this resource?",
      failed: "Failed",
      completed: "Completed",
      queued: "Queued",
      processing: "Processing",
      requiredFields: "Please provide the topic text and a visual style",
      generateError: "Could not start generation. Try again.",
      jobError: "Resource generation failed: ",
      retry: "Retry",
      success: "Resource generated successfully",
      accessDenied: "Access denied",
    },
  }[locale === "en" ? "en" : "ar"];

  const [form, setForm] = useState({
    topic_text: "",
    style: "colorful",
    custom_style: "",
    explanation_language: "auto",
    learner_level: "auto",
    subject: "",
    grade_level: "",
    learning_objective: "",
    difficulty: "auto",
    lesson_duration: "",
    output_mode: "auto",
    content_mode: "strict_source",
    include_exceptions: true,
    include_common_mistakes: true,
    include_practice: false,
    include_answer_key: false,
    include_teacher_notes: false,
    practice_type: "auto",
    practice_question_count: "",
    supporting_notes: "",
  });

  const [resources, setResources] = useState<LessonForgeResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingJob, setGeneratingJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    try {
      const res = await apiClient.get<LessonForgeResource[]>("/lessonforge/resources");
      setResources(res.data);
    } catch {
      setResources([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchResources();
      setLoading(false);
    })();
  }, [fetchResources]);

  // Poll the worker result while a job is in flight.
  useEffect(() => {
    if (!generatingJob || generatingJob.status === "completed" || generatingJob.status === "failed") return;
    const timer = setInterval(async () => {
      try {
        const res = await apiClient.get<JobStatus>(`/lessonforge/jobs/${generatingJob.job_id}`);
        const st = res.data.status;
        setGeneratingJob(res.data);
        if (st === "completed") {
          setNotice(t.success);
          setError(null);
          setSubmitting(false);
          await fetchResources();
        } else if (st === "failed") {
          setError(t.jobError + (res.data.error || ""));
          setSubmitting(false);
          await fetchResources();
        }
      } catch {
        // transient — keep polling
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [generatingJob, t.success, t.jobError, fetchResources]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchResources();
    setRefreshing(false);
  };

  const handleGenerate = async () => {
    setError(null);
    setNotice(null);
    if (!form.topic_text.trim() || !form.style.trim()) {
      setError(t.requiredFields);
      return;
    }
    const payload: Record<string, unknown> = {
      topic_text: sanitizeInput(form.topic_text),
      style: form.style === "custom" ? sanitizeInput(form.custom_style || "custom") : form.style,
      explanation_language: form.explanation_language,
      learner_level: form.learner_level,
      difficulty: form.difficulty,
      output_mode: form.output_mode,
      content_mode: form.content_mode,
      include_exceptions: form.include_exceptions,
      include_common_mistakes: form.include_common_mistakes,
      include_practice: form.include_practice,
      include_answer_key: form.include_answer_key,
      include_teacher_notes: form.include_teacher_notes,
      practice_type: form.practice_type,
    };
    if (form.subject.trim()) payload.subject = sanitizeInput(form.subject);
    if (form.grade_level.trim()) payload.grade_level = sanitizeInput(form.grade_level);
    if (form.learning_objective.trim()) payload.learning_objective = sanitizeInput(form.learning_objective);
    if (form.lesson_duration.trim()) payload.lesson_duration = sanitizeInput(form.lesson_duration);
    if (form.practice_question_count.trim()) payload.practice_question_count = Number(form.practice_question_count);
    if (form.supporting_notes.trim()) payload.supporting_notes = sanitizeInput(form.supporting_notes);

    setSubmitting(true);
    try {
      const res = await apiClient.post<JobStatus>("/lessonforge/resources", payload);
      setGeneratingJob(res.data);
    } catch {
      setError(t.generateError);
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await apiClient.delete(`/lessonforge/resources/${id}`);
      await fetchResources();
    } catch {
      // ignore
    }
  };

  const inputCls = "input-field";
  const selectCls = "select-field";

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <Wand2 size={22} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="btn-icon" title={t.refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ms-auto">&times;</button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={16} />
          {notice}
          <button onClick={() => setNotice(null)} className="ms-auto">&times;</button>
        </div>
      )}

      <div className="card p-5 space-y-5">
        {/* Required: topic + style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.topicText}</label>
            <textarea
              value={form.topic_text}
              onChange={(e) => setForm({ ...form, topic_text: e.target.value })}
              rows={8}
              className={inputCls + " min-h-[120px]"}
              placeholder={t.topicPlaceholder}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.style}</label>
              <select
                value={form.style}
                onChange={(e) => setForm({ ...form, style: e.target.value })}
                className={selectCls}
              >
                {STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{locale === "ar" ? s.ar : s.en}</option>
                ))}
              </select>
            </div>
            {form.style === "custom" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.styleCustom}</label>
                <textarea
                  value={form.custom_style}
                  onChange={(e) => setForm({ ...form, custom_style: e.target.value })}
                  rows={3}
                  className={inputCls}
                  placeholder={t.stylePlaceholder}
                />
              </div>
            )}
          </div>
        </div>

        {/* Context */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.language}</label>
            <select value={form.explanation_language} onChange={(e) => setForm({ ...form, explanation_language: e.target.value })} className={selectCls}>
              {LANGUAGES.map((o) => <option key={o.value} value={o.value}>{locale === "ar" ? o.ar : o.en}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.learnerLevel}</label>
            <select value={form.learner_level} onChange={(e) => setForm({ ...form, learner_level: e.target.value })} className={selectCls}>
              {LEVELS.map((o) => <option key={o.value} value={o.value}>{locale === "ar" ? o.ar : o.en}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.subject}</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.gradeLevel}</label>
            <input value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.learningObjective}</label>
            <input value={form.learning_objective} onChange={(e) => setForm({ ...form, learning_objective: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.difficulty}</label>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className={selectCls}>
              {DIFFICULTIES.map((o) => <option key={o.value} value={o.value}>{locale === "ar" ? o.ar : o.en}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.lessonDuration}</label>
            <input value={form.lesson_duration} onChange={(e) => setForm({ ...form, lesson_duration: e.target.value })} className={inputCls} placeholder="45 minutes" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.outputMode}</label>
            <select value={form.output_mode} onChange={(e) => setForm({ ...form, output_mode: e.target.value })} className={selectCls}>
              {OUTPUT_MODES.map((o) => <option key={o.value} value={o.value}>{locale === "ar" ? o.ar : o.en}</option>)}
            </select>
          </div>
        </div>

        {/* Content mode + toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.contentMode}</label>
            <select value={form.content_mode} onChange={(e) => setForm({ ...form, content_mode: e.target.value })} className={selectCls}>
              {CONTENT_MODES.map((o) => <option key={o.value} value={o.value}>{locale === "ar" ? o.ar : o.en}</option>)}
            </select>
          </div>
          {form.include_practice && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.practiceType}</label>
                <select value={form.practice_type} onChange={(e) => setForm({ ...form, practice_type: e.target.value })} className={selectCls}>
                  {PRACTICE_TYPES.map((o) => <option key={o.value} value={o.value}>{locale === "ar" ? o.ar : o.en}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.practiceCount}</label>
                <input type="number" min={1} value={form.practice_question_count} onChange={(e) => setForm({ ...form, practice_question_count: e.target.value })} className={inputCls} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.include_exceptions} onChange={(e) => setForm({ ...form, include_exceptions: e.target.checked })} className="accent-brand-600" />
            {t.includeExceptions}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.include_common_mistakes} onChange={(e) => setForm({ ...form, include_common_mistakes: e.target.checked })} className="accent-brand-600" />
            {t.includeCommonMistakes}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.include_practice} onChange={(e) => setForm({ ...form, include_practice: e.target.checked })} className="accent-brand-600" />
            {t.includePractice}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.include_answer_key} onChange={(e) => setForm({ ...form, include_answer_key: e.target.checked })} className="accent-brand-600" />
            {t.includeAnswerKey}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.include_teacher_notes} onChange={(e) => setForm({ ...form, include_teacher_notes: e.target.checked })} className="accent-brand-600" />
            {t.includeTeacherNotes}
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.supportingNotes}</label>
          <textarea
            value={form.supporting_notes}
            onChange={(e) => setForm({ ...form, supporting_notes: e.target.value })}
            rows={3}
            className={inputCls}
            placeholder={t.supportingPlaceholder}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleGenerate} disabled={submitting} className="btn-primary inline-flex items-center gap-2">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {submitting ? t.generating : t.generate}
          </button>
          {submitting && (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Clock size={14} className="text-amber-500" />
              {generatingJob?.status === "queued" ? t.queued : t.processing}
            </span>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">{t.history}</h3>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : resources.length === 0 ? (
          <EmptyState title={t.emptyHistory} message={t.emptyHistoryMsg} />
        ) : (
          <div className="card overflow-hidden">
            <TableContainer>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.titleCol}</th>
                    <th>{t.typeCol}</th>
                    <th>{t.statusCol}</th>
                    <th>{t.dateCol}</th>
                    <th>{t.actionsCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium text-slate-900 max-w-xs truncate">{r.title || "—"}</td>
                      <td className="text-slate-600">
                        <span className="badge">{OUTPUT_MODES.find((o) => o.value === r.output_mode)?.en || r.output_mode}</span>
                      </td>
                      <td>{statusBadge(r.status, t)}</td>
                      <td className="text-slate-500">{formatDisplayDateTime(r.created_at, locale)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {r.status === "completed" && (
                            <a
                              href={`/api/v1/lessonforge/resources/${r.id}/html`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-icon"
                              title={t.view}
                            >
                              <Eye size={16} />
                            </a>
                          )}
                          <button onClick={() => handleDelete(r.id)} className="btn-icon text-red-500" title={t.delete}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LessonForgePage() {
  const params = useParams();
  const { user, loading } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const role = user?.role?.name;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }
  if (role !== "teacher" && role !== "superadmin") {
    return <div className="text-center text-slate-400 py-12 text-sm">Access denied</div>;
  }
  return <LessonForgeView locale={locale} />;
}
