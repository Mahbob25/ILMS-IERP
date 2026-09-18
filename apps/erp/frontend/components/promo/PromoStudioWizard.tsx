"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Clock, Copy, Check, Download, Film, Sparkles, Ban } from "lucide-react";
import WizardStepper from "@/components/wizards/WizardStepper";
import WizardNavigationBar from "@/components/wizards/WizardNavigationBar";
import { useWizardDirtyGuard } from "@/components/wizards/WizardDirtyGuard";
import { apiClient } from "@/lib/api";
import { eventStream } from "@/lib/events";
import {
  LIMITS, PromoLocale, PromoTone, PromoQuality, PromoPayload, PromoProject, PromoRender,
  blankPayload, countChars, createPromoProject, defaultPayloadForProgram, getPromoProject,
  getPromoQuota, getPromoRender, listPromoProjects, overLimit, requestPromoRender,
  updatePromoProject, validatePayload,
} from "@/lib/promo";

interface Props {
  locale: string;
  initialProjectId?: string;
}

const STEPS = (isAr: boolean) => [
  { label: isAr ? "النوع" : "Type" },
  { label: isAr ? "المحتوى" : "Content" },
  { label: isAr ? "الأسلوب" : "Style" },
  { label: isAr ? "المعاينة" : "Preview" },
  { label: isAr ? "التسليم" : "Deliver" },
];

export default function PromoStudioWizard({ locale, initialProjectId }: Props) {
  const isAr = locale !== "en";
  const { setDirty } = useWizardDirtyGuard();
  const [step, setStep] = useState(1);
  const [adType, setAdType] = useState<"course" | "activity" | "general">("course");
  const [adLocale, setAdLocale] = useState<PromoLocale>(isAr ? "ar" : "en");
  const [tone, setTone] = useState<PromoTone>("cinematic");
  const [payload, setPayload] = useState<PromoPayload>(() => blankPayload(isAr ? "ar" : "en"));
  const [customCourse, setCustomCourse] = useState(false);
  const [programs, setPrograms] = useState<any[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [project, setProject] = useState<PromoProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState<PromoQuality | null>(null);
  const [draftRender, setDraftRender] = useState<PromoRender | null>(null);
  const [finalRender, setFinalRender] = useState<PromoRender | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number; reset_at: string } | null>(null);
  const [history, setHistory] = useState<PromoProject[]>([]);
  const [historyRenders, setHistoryRenders] = useState<PromoRender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const errors = useMemo(() => validatePayload(payload), [payload]);
  const canProceedFromContent = Object.keys(errors).length === 0;

  // ── Load: landing programs, quota, history, optional resume ──
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get("/content/landing");
        const val = res.data?.value;
        const loc = val?.[adLocale] || val?.ar || val?.en;
        if (loc?.programs && Array.isArray(loc.programs)) setPrograms(loc.programs);
      } catch {}
      try { setQuota(await getPromoQuota()); } catch {}
      try {
        const h = await listPromoProjects(1, 10);
        setHistory(h.items || []);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!initialProjectId) return;
      try {
        const { project: p, renders } = await getPromoProject(initialProjectId);
        setProject(p);
        setAdLocale(p.locale as PromoLocale);
        setTone(p.tone as PromoTone);
        setPayload({ ...blankPayload(p.locale as PromoLocale), ...(p.payload as PromoPayload) });
        setHistoryRenders(renders || []);
        const draft = (renders || []).find((r) => r.quality === "draft");
        const high = (renders || []).find((r) => r.quality === "high");
        if (draft) setDraftRender(draft);
        if (high) setFinalRender(high);
        setStep(4);
      } catch {}
    })();
  }, [initialProjectId]);

  // Reload programs when the ad locale changes
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get("/content/landing");
        const loc = res.data?.value?.[adLocale];
        if (loc?.programs && Array.isArray(loc.programs)) setPrograms(loc.programs);
      } catch {}
    })();
  }, [adLocale]);

  const touch = useCallback(() => setDirty(true), [setDirty]);

  function setField<K extends keyof PromoPayload>(key: K, value: PromoPayload[K]) {
    setPayload((prev) => ({ ...prev, [key]: value }));
    touch();
  }

  async function ensureProject(): Promise<PromoProject> {
    if (project) {
      const updated = await updatePromoProject(project.id, { locale: adLocale, tone, payload });
      setProject(updated);
      setDirty(false);
      return updated;
    }
    const created = await createPromoProject({ locale: adLocale, tone, payload });
    setProject(created);
    setDirty(false);
    try {
      const h = await listPromoProjects(1, 10);
      setHistory(h.items || []);
    } catch {}
    return created;
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  async function pollRender(renderId: string, onDone: (r: PromoRender) => void) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await getPromoRender(renderId);
        if (r.progress != null) setProgress(r.progress);
        if (r.status === "done" || r.status === "failed") {
          stopPolling();
          setRendering(null);
          onDone(r);
          try { setQuota(await getPromoQuota()); } catch {}
          if (project) {
            try {
              const { renders } = await getPromoProject(project.id);
              setHistoryRenders(renders || []);
            } catch {}
          }
        }
      } catch {}
    }, 3000);
  }

  // SSE progress (reuses the shared per-user event stream; polling is the fallback)
  useEffect(() => {
    const types = ["promo.render.started", "promo.render.progress", "promo.render.done", "promo.render.failed"];
    const unsubs = types.map((t) =>
      eventStream.on(t, (ev) => {
        const data = ev.data as any;
        const activeId = draftRender?.id || finalRender?.id;
        // Ignore events for other renders (e.g. a second tab/project) — without
        // this, a foreign done/progress would overwrite this wizard's bar.
        if (data?.render_id && activeId && data.render_id !== activeId) return;
        if (t === "promo.render.progress" && typeof data?.progress === "number") setProgress(data.progress);
        if (t === "promo.render.done" && data?.render_id) {
          getPromoRender(data.render_id).then((r) => {
            if (r.quality === "high") setFinalRender(r); else setDraftRender(r);
            setRendering(null);
            stopPolling();
            setProgress(100);
          }).catch(() => {});
        }
        if (t === "promo.render.failed") {
          setRendering(null);
          stopPolling();
          setError(isAr ? "فشل التصيير — تحقق من المحتوى وحاول مجددًا" : "Render failed — check content and retry");
        }
      })
    );
    return () => { unsubs.forEach((u) => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRender?.id, finalRender?.id]);

  async function handleRender(quality: PromoQuality) {
    setError(null);
    if (!canProceedFromContent) {
      setError(isAr ? "راجع الحقول المحددة بالأحمر (تجاوز الحد الأقصى)" : "Fix highlighted fields (over max length)");
      return;
    }
    setRendering(quality);
    setProgress(0);
    try {
      const p = await ensureProject();
      const { render_id } = await requestPromoRender(p.id, quality);
      try { setQuota(await getPromoQuota()); } catch {}
      const onDone = (r: PromoRender) => {
        if (r.quality === "high") { setFinalRender(r); setStep(5); }
        else { setDraftRender(r); setStep(4); }
        if (r.progress != null) setProgress(r.progress);
        if (r.status === "failed") setError(r.error || (isAr ? "فشل التصيير" : "Render failed"));
      };
      // Immediate fetch to seed state, then poll.
      try {
        const seeded = await getPromoRender(render_id);
        onDone(seeded.status === "done" || seeded.status === "failed" ? seeded : { ...seeded, status: "queued" });
      } catch {}
      pollRender(render_id, onDone);
    } catch (e: any) {
      setRendering(null);
      const status = e?.response?.status;
      if (status === 429) setError(isAr ? "الحصة الشهرية مستنفدة — عُد بداية الشهر" : "Monthly quota exhausted — back at reset");
      else setError(e?.response?.data?.detail || e?.message || (isAr ? "تعذر بدء التصيير" : "Could not start render"));
    }
  }

  function prefillFromProgram(id: string) {
    const prog = programs.find((p) => (p.id || p.k) === id);
    if (!prog) return;
    setSelectedProgram(id);
    setPayload((prev) => ({ ...prev, ...defaultPayloadForProgram(prog, adLocale), custom_course: false }));
    setCustomCourse(false);
    touch();
  }

  const quotaPct = quota ? Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100)) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3">
        <Clapperboard size={22} className="text-brand-600" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">{isAr ? "استوديو البرومو" : "Promo Studio"}</h1>
          <p className="text-sm text-slate-500">{isAr ? "إعلان كورس جاهز في أقل من ١٠ دقائق — بدون مطور" : "Ship a course ad in under 10 minutes — no dev needed"}</p>
        </div>
        <div className="flex-1" />
        {quota && (
          <div className="text-xs text-slate-500 text-end" title={quota.reset_at}>
            <div className="font-bold text-slate-700">{quota.used}/{quota.limit}</div>
            <div className="w-28 h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1">
              <div className="h-full bg-brand-500" style={{ width: `${quotaPct}%` }} />
            </div>
          </div>
        )}
      </div>

      <WizardStepper steps={STEPS(isAr)} currentStep={step} locale={isAr ? "ar" : "en"} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {/* STEP 1 — Type */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => setAdType("course")} className={`card p-5 text-start border-2 ${adType === "course" ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200"}`}>
            <Film size={20} className="text-brand-600 mb-2" />
            <div className="font-bold">{isAr ? "إعلان كورس" : "Course ad"}</div>
            <div className="text-xs text-slate-500 mt-1">{isAr ? "قالب جاهز · ٢١ ثانية · أفقي" : "Ready template · 21s · landscape"}</div>
          </button>
          {(["activity", "general"] as const).map((t) => (
            <div key={t} className="card p-5 border-2 border-slate-200 opacity-60 relative">
              <span className="absolute top-3 end-3 text-[10px] font-bold bg-slate-900 text-white rounded-full px-2 py-0.5">{isAr ? "قريبًا" : "Soon"}</span>
              <Ban size={20} className="text-slate-400 mb-2" />
              <div className="font-bold text-slate-500">{t === "activity" ? (isAr ? "إعلان نشاط" : "Activity ad") : (isAr ? "إعلان عام" : "General ad")}</div>
              <div className="text-xs text-slate-400 mt-1">v1.1</div>
            </div>
          ))}
        </div>
      )}

      {/* STEP 2 — Content */}
      {step === 2 && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "البرنامج (من الموقع)" : "Program (from CMS)"}</span>
              <select value={selectedProgram} disabled={customCourse} onChange={(e) => prefillFromProgram(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm disabled:opacity-50">
                <option value="">{isAr ? "اختر برنامجًا للتعبئة…" : "Pick a program to prefill…"}</option>
                {programs.map((p: any) => (
                  <option key={p.id || p.k} value={p.id || p.k}>{p.k} — {p.meta}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 pt-6">
              <input type="checkbox" checked={customCourse} onChange={(e) => { setCustomCourse(e.target.checked); setPayload((p) => ({ ...p, custom_course: e.target.checked })); touch(); }} />
              {isAr ? "كورس مخصص (خارج الموقع)" : "Custom course (off-CMS)"}
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CharField label="heroL1" value={payload.heroL1} max={LIMITS.heroL1} onChange={(v) => setField("heroL1", v)} error={errors.heroL1} />
            <CharField label="heroL2" value={payload.heroL2} max={LIMITS.heroL2} onChange={(v) => setField("heroL2", v)} error={errors.heroL2} />
            <CharField label="heroL3" value={payload.heroL3} max={LIMITS.heroL3} onChange={(v) => setField("heroL3", v)} error={errors.heroL3} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CharField label="cta" value={payload.cta} max={LIMITS.cta} onChange={(v) => setField("cta", v)} error={errors.cta} />
            <CharField label="kicker" value={payload.kicker} max={LIMITS.kicker} onChange={(v) => setField("kicker", v)} error={errors.kicker} />
            <CharField label="micro" value={payload.micro} max={LIMITS.micro} onChange={(v) => setField("micro", v)} error={errors.micro} />
          </div>
          <RowsEditor rows={payload.rows} onChange={(rows) => setField("rows", rows)} isAr={isAr} errors={errors} />
          <CardsEditor cards={payload.cards} onChange={(cards) => setField("cards", cards)} isAr={isAr} errors={errors} />
          <StatsEditor stats={payload.stats} onChange={(stats) => setField("stats", stats)} isAr={isAr} />
        </div>
      )}

      {/* STEP 3 — Style (brand-locked: no color/font/layout controls) */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["cinematic", "clean"] as PromoTone[]).map((t) => (
              <button key={t} onClick={() => { setTone(t); touch(); }} className={`card p-5 text-start border-2 ${tone === t ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200"}`}>
                <Sparkles size={18} className="text-brand-600 mb-2" />
                <div className="font-bold">{t === "cinematic" ? (isAr ? "سينمائي" : "Cinematic") : (isAr ? "نظيف" : "Clean")}</div>
                <div className="text-xs text-slate-500 mt-1">{t === "cinematic" ? (isAr ? "كشف بطيء · تلاشي ناعم · نغمة هادئة" : "Slow reveals · soft crossfades · sparse bells") : (isAr ? "مسحات · ظهور متتابع · إيقاع نشط" : "Wipes · catalogue pops · brisk accents")}</div>
              </button>
            ))}
          </div>
          <div className="card p-5 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-500">{isAr ? "اللغة" : "Locale"}</span>
            {(["ar", "en"] as PromoLocale[]).map((l) => (
              <button key={l} onClick={() => { setAdLocale(l); touch(); }} className={`px-4 py-1.5 rounded-full text-xs font-bold ${adLocale === l ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{l.toUpperCase()}</button>
            ))}
            <span className="text-xs text-slate-400">· {isAr ? "الاتجاه RTL/LTR تلقائي" : "RTL/LTR automatic"}</span>
          </div>
          <div className="card p-5 flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500">{isAr ? "المقاس" : "Format"}</span>
            <span className="px-3 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs font-bold border border-brand-100">Landscape 1920×1080</span>
            <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold">Vertical · v1.1</span>
          </div>
        </div>
      )}

      {/* STEP 4 — Preview (draft render + SSE progress + player) */}
      {step === 4 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => handleRender("draft")} disabled={rendering !== null} className="btn-primary disabled:opacity-50">
              {rendering === "draft" ? (isAr ? "جاري التصيير…" : "Rendering…") : (isAr ? "تصيير مسودة" : "Render draft")}
            </button>
            {rendering && (
              <div className="flex-1">
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress ?? 5}%` }} />
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><Clock size={12} />{progress ?? 5}%</div>
              </div>
            )}
          </div>
          {draftRender?.mp4_url ? (
            <video controls poster={draftRender.poster_url || undefined} src={draftRender.mp4_url} className="w-full rounded-xl bg-slate-900" />
          ) : (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              {isAr ? "صيّر مسودة لمعاينة الإعلان هنا" : "Render a draft to preview the ad here"}
            </div>
          )}
          {draftRender && (
            <div className="text-xs text-slate-500">draft · {draftRender.template_version} · brand v{draftRender.brand_kit_version} · {draftRender.duration_s}s {draftRender.render_ms ? `· ${Math.round(draftRender.render_ms / 1000)}s render` : ""}</div>
          )}
        </div>
      )}

      {/* STEP 5 — Deliver (final + downloads + share copy + history) */}
      {step === 5 && (
        <div className="space-y-3">
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <button onClick={() => handleRender("high")} disabled={rendering !== null} className="btn-primary disabled:opacity-50">
                {rendering === "high" ? (isAr ? "جاري التصيير النهائي…" : "Rendering final…") : (isAr ? "تصيير نهائي" : "Render final")}
              </button>
              {quota && <span className="text-xs text-slate-500">{isAr ? "الحصة" : "Quota"} {quota.used}/{quota.limit}</span>}
            </div>
            {finalRender?.mp4_url && (
              <div className="flex flex-wrap gap-2">
                <a href={finalRender.mp4_url} download className="btn-secondary flex items-center gap-1 text-sm"><Download size={14} /> MP4</a>
                {finalRender.poster_url && <a href={finalRender.poster_url} download className="btn-secondary flex items-center gap-1 text-sm"><Download size={14} /> Poster</a>}
              </div>
            )}
            {finalRender?.share_copy && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-500">{isAr ? "نص المشاركة" : "Share copy"}</span>
                  <button onClick={() => { navigator.clipboard?.writeText(finalRender.share_copy || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs flex items-center gap-1 text-slate-600 hover:text-slate-900">
                    {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
                  </button>
                </div>
                <p className="text-sm whitespace-pre-wrap" dir="auto">{finalRender.share_copy}</p>
              </div>
            )}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-2">{isAr ? "سجل التصيير" : "Render history"}</h3>
            {historyRenders.length === 0 ? (
              <p className="text-xs text-slate-400">{isAr ? "لا تصييرات بعد" : "No renders yet"}</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 text-start"><th className="py-1 text-start">{isAr ? "الجودة" : "Quality"}</th><th className="text-start">{isAr ? "الحالة" : "Status"}</th><th className="text-start">{isAr ? "المدة" : "Duration"}</th><th className="text-start">{isAr ? "التاريخ" : "Created"}</th><th></th></tr></thead>
                <tbody>
                  {historyRenders.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1.5 font-bold">{r.quality}</td>
                      <td>{r.status}</td>
                      <td>{r.duration_s}s</td>
                      <td className="text-slate-400">{r.created_at?.slice(0, 16).replace("T", " ")}</td>
                      <td className="text-end">{r.mp4_url && <a href={r.mp4_url} download className="text-brand-600 font-bold">MP4</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {history.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 mb-1">{isAr ? "مشاريع سابقة" : "Past projects"}</h4>
                <div className="flex flex-wrap gap-2">
                  {history.slice(0, 6).map((h) => (
                    <span key={h.id} className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">{String(h.payload?.heroL2 || h.id).slice(0, 24)} · {h.locale}/{h.tone}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <WizardNavigationBar
        currentStep={step}
        totalSteps={5}
        locale={isAr ? "ar" : "en"}
        onBack={() => setStep((s) => Math.max(1, s - 1))}
        onNext={async () => {
          if (step === 2 && !canProceedFromContent) {
            setError(isAr ? "راجع الحقول المحددة (تجاوز الحد)" : "Fix highlighted fields first");
            return;
          }
          if (step === 2 || step === 3) {
            setSaving(true);
            try { await ensureProject(); setError(null); } catch (e: any) {
              setError(e?.response?.data?.detail || (isAr ? "تعذر الحفظ" : "Could not save"));
              setSaving(false);
              return;
            }
            setSaving(false);
          }
          setStep((s) => Math.min(5, s + 1));
        }}
        onFinish={() => { setDirty(false); }}
        canNext={step === 1 ? adType === "course" : true}
        submitting={saving || rendering !== null}
      />
    </div>
  );
}

function CharField({ label, value, max, onChange, error }: { label: string; value: string; max: number; onChange: (v: string) => void; error?: string }) {
  const count = countChars(value);
  const bad = overLimit(value, max) || !!error;
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold tracking-wide text-slate-500 flex justify-between">
        <span>{label}</span>
        <span className={bad ? "text-red-500" : "text-slate-400"}>{count}/{max}</span>
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`w-full h-10 rounded-xl border px-3 text-sm outline-none ${bad ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:bg-white"}`} />
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </label>
  );
}

function RowsEditor({ rows, onChange, isAr, errors }: { rows: { time: string; title: string; meta: string }[]; onChange: (r: any) => void; isAr: boolean; errors: Record<string, string> }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-500">{isAr ? "صفوف الجدول (≤٣)" : "Schedule rows (≤3)"}</div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[70px_1fr_1fr] gap-2">
          <input value={r.time} onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], time: e.target.value }; onChange(n); }} placeholder="08" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm" />
          <input value={r.title} onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], title: e.target.value }; onChange(n); }} placeholder={isAr ? "العنوان" : "Title"} className={`h-10 rounded-xl border px-3 text-sm ${errors[`rows.${i}.title`] ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`} />
          <input value={r.meta} onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], meta: e.target.value }; onChange(n); }} placeholder="meta" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
        </div>
      ))}
    </div>
  );
}

function CardsEditor({ cards, onChange, isAr, errors }: { cards: { tag: string; name: string; badge: string; desc: string; seats: string }[]; onChange: (c: any) => void; isAr: boolean; errors: Record<string, string> }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-500">{isAr ? "بطاقات البرامج (≤٤)" : "Program cards (≤4)"}</div>
      {cards.map((c, i) => (
        <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
          <input value={c.tag} onChange={(e) => { const n = [...cards]; n[i] = { ...n[i], tag: e.target.value }; onChange(n); }} placeholder="TAG" className="h-9 rounded-lg border border-slate-200 px-2 text-xs" />
          <input value={c.name} onChange={(e) => { const n = [...cards]; n[i] = { ...n[i], name: e.target.value }; onChange(n); }} placeholder={isAr ? "الاسم" : "Name"} className={`h-9 rounded-lg border px-2 text-xs ${errors[`cards.${i}.name`] ? "border-red-300 bg-red-50" : "border-slate-200"}`} />
          <input value={c.badge} onChange={(e) => { const n = [...cards]; n[i] = { ...n[i], badge: e.target.value }; onChange(n); }} placeholder="badge" className="h-9 rounded-lg border border-slate-200 px-2 text-xs" />
          <input value={c.desc} onChange={(e) => { const n = [...cards]; n[i] = { ...n[i], desc: e.target.value }; onChange(n); }} placeholder={isAr ? "الوصف" : "Desc"} className={`h-9 rounded-lg border px-2 text-xs ${errors[`cards.${i}.desc`] ? "border-red-300 bg-red-50" : "border-slate-200"}`} />
          <input value={c.seats} onChange={(e) => { const n = [...cards]; n[i] = { ...n[i], seats: e.target.value }; onChange(n); }} placeholder="seats" className="h-9 rounded-lg border border-slate-200 px-2 text-xs" />
        </div>
      ))}
    </div>
  );
}

function StatsEditor({ stats, onChange, isAr }: { stats: { value: string; label: string }[]; onChange: (s: any) => void; isAr: boolean }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-500">{isAr ? "الإحصائيات (≤٣)" : "Stats (≤3)"}</div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="flex gap-2">
            <input value={s.value} onChange={(e) => { const n = [...stats]; n[i] = { ...n[i], value: e.target.value }; onChange(n); }} placeholder="12k+" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" />
            <input value={s.label} onChange={(e) => { const n = [...stats]; n[i] = { ...n[i], label: e.target.value }; onChange(n); }} placeholder="label" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" />
          </div>
        ))}
      </div>
    </div>
  );
}
