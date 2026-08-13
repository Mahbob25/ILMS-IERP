"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { landingDefaults } from "@/lib/landingDefaults";

type LocaleData = typeof landingDefaults.ar;
type FullValue = { ar: LocaleData; en: LocaleData };

function mergeWithDefaults(v: any): FullValue {
  const out: any = { ar: { ...landingDefaults.ar }, en: { ...landingDefaults.en } };
  for (const loc of ["ar", "en"] as const) {
    if (v?.[loc] && typeof v[loc] === "object") {
      out[loc] = { ...out[loc], ...v[loc] };
      if (Array.isArray(v[loc].programs)) out[loc].programs = v[loc].programs;
      if (Array.isArray(v[loc].ateliers)) out[loc].ateliers = v[loc].ateliers;
      if (Array.isArray(v[loc].stats)) out[loc].stats = v[loc].stats;
      if (Array.isArray(v[loc].testimonials)) out[loc].testimonials = v[loc].testimonials;
      if (Array.isArray(v[loc].faqs)) out[loc].faqs = v[loc].faqs;
    }
  }
  return out;
}

export default function ContentPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const [tab, setTab] = useState<"ar" | "en">(isAr ? "ar" : "en");
  const [data, setData] = useState<FullValue>({ ar: { ...landingDefaults.ar } as any, en: { ...landingDefaults.en } as any });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/content/landing");
      const val = res.data?.value;
      if (val && (val.ar || val.en)) setData(mergeWithDefaults(val));
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await apiClient.put("/content/landing", { value: data });
      setMsg(isAr ? "تم الحفظ" : "Saved");
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || (isAr ? "فشل الحفظ" : "Save failed"));
    }
    setSaving(false);
  }

  function update(path: string, value: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let cur: any = next[tab];
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }
  function updateProg(idx: number, field: string, value: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      (next[tab].programs[idx] as any)[field] = value;
      return next;
    });
  }
  function updateAtelier(idx: number, field: string, value: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      (next[tab].ateliers[idx] as any)[field] = value;
      return next;
    });
  }
  function updateStat(idx: number, field: string, value: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      (next[tab].stats[idx] as any)[field] = value;
      return next;
    });
  }
  function updateTestimonial(idx: number, field: string, value: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      (next[tab].testimonials[idx] as any)[field] = value;
      return next;
    });
  }
  function updateFaq(idx: number, field: string, value: string) {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      (next[tab].faqs[idx] as any)[field] = value;
      return next;
    });
  }

  const d: any = (data as any)[tab];
  if (loading) return <div className="max-w-5xl mx-auto p-8 text-sm text-slate-400">{isAr ? "جاري التحميل..." : "Loading..."}</div>;

  const label = (ar: string, en: string) => (tab === "ar" ? ar : en);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{isAr ? "محتوى الموقع" : "Landing Content"}</h1>
          <p className="text-sm text-slate-500">{isAr ? "تحكم كامل بمحتوى صفحة الهبوط — يحفظ كـ JSON (يشمل الثقة، البرامج، والأسئلة الشائعة)" : "Full CMS for landing page — saved as JSON (incl. social proof, program outcomes & FAQ)"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-full bg-slate-100 border border-slate-200">
            {(["ar", "en"] as const).map((l) => (
              <button key={l} onClick={() => setTab(l)} className={`px-4 py-1.5 rounded-full text-xs font-bold ${tab === l ? "bg-slate-900 text-white" : "text-slate-600"}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold disabled:opacity-50">{saving ? "..." : isAr ? "حفظ" : "Save"}</button>
        </div>
      </div>
      {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2 text-sm">{msg}</div>}

      <Section title={label("البطل", "Hero")}>
        <Field label="heroKicker" value={d.heroKicker} onChange={(v) => update("heroKicker", v)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="heroLine1" value={d.heroLine1} onChange={(v) => update("heroLine1", v)} />
          <Field label="heroLine2" value={d.heroLine2} onChange={(v) => update("heroLine2", v)} />
          <Field label="heroLine3" value={d.heroLine3} onChange={(v) => update("heroLine3", v)} />
        </div>
        <Field label="heroDesc" multiline value={d.heroDesc} onChange={(v) => update("heroDesc", v)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="ctaPrimary (should be book link text)" value={d.ctaPrimary} onChange={(v) => update("ctaPrimary", v)} />
          <Field label="ctaGhost" value={d.ctaGhost} onChange={(v) => update("ctaGhost", v)} />
          <Field label="micro" value={d.micro} onChange={(v) => update("micro", v)} />
        </div>
      </Section>

      <Section title={label("الثقة — إحصائيات وآراء", "Social Proof — Stats & Testimonials")}>
        <p className="text-xs text-slate-500">{label("تظهر مباشرة تحت البطل — تبني الثقة", "Shown right under hero — builds trust")}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {d.stats.map((s: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-500">#{i + 1}</div>
              <Field label="value (e.g. 12k+)" value={s.value} onChange={(v) => updateStat(i, "value", v)} />
              <Field label="label" value={s.label} onChange={(v) => updateStat(i, "label", v)} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {d.testimonials.map((tm: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-500">#{i + 1}</div>
              <Field label="name" value={tm.name} onChange={(v) => updateTestimonial(i, "name", v)} />
              <Field label="track" value={tm.track} onChange={(v) => updateTestimonial(i, "track", v)} />
              <Field label="quote" multiline value={tm.quote} onChange={(v) => updateTestimonial(i, "quote", v)} />
              <Field label="rating (1-5)" value={String(tm.rating)} onChange={(v) => updateTestimonial(i, "rating", v)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={label("البرامج", "Programs")}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="programsEyebrow" value={d.programsEyebrow} onChange={(v) => update("programsEyebrow", v)} />
          <Field label="programsTitle" value={d.programsTitle} onChange={(v) => update("programsTitle", v)} />
        </div>
        <Field label="programsSub" multiline value={d.programsSub} onChange={(v) => update("programsSub", v)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {d.programs.map((p: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-500">#{i + 1} — {p.id || ""}</div>
              <Field label="k (title)" value={p.k} onChange={(v) => updateProg(i, "k", v)} />
              <Field label="d (desc)" multiline value={p.d} onChange={(v) => updateProg(i, "d", v)} />
              <Field label="meta" value={p.meta} onChange={(v) => updateProg(i, "meta", v)} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="outcome" value={p.outcome || ""} onChange={(v) => updateProg(i, "outcome", v)} />
                <Field label="duration" value={p.duration || ""} onChange={(v) => updateProg(i, "duration", v)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="intake" value={p.intake || ""} onChange={(v) => updateProg(i, "intake", v)} />
                <Field label="seats" value={p.seats || ""} onChange={(v) => updateProg(i, "seats", v)} />
              </div>
              <Field label="priceHint" value={p.priceHint || ""} onChange={(v) => updateProg(i, "priceHint", v)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={label("الورش", "Ateliers")}>
        <Field label="ateliersTitle" value={d.ateliersTitle} onChange={(v) => update("ateliersTitle", v)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {d.ateliers.map((a: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <Field label="k" value={a.k} onChange={(v) => updateAtelier(i, "k", v)} />
              <Field label="v" value={a.v} onChange={(v) => updateAtelier(i, "v", v)} />
              <Field label="p" multiline value={a.p} onChange={(v) => updateAtelier(i, "p", v)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={label("الأسئلة الشائعة", "FAQ")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="faqTitle" value={d.faqTitle} onChange={(v) => update("faqTitle", v)} />
          <Field label="faqSub" value={d.faqSub} onChange={(v) => update("faqSub", v)} />
        </div>
        <div className="space-y-3">
          {d.faqs.map((f: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-500">#{i + 1}</div>
              <Field label="q" value={f.q} onChange={(v) => updateFaq(i, "q", v)} />
              <Field label="a" multiline value={f.a} onChange={(v) => updateFaq(i, "a", v)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={label("التواصل والفوتر", "Contact & Footer")}>
        <Field label="contactTitle" value={d.contactTitle} onChange={(v) => update("contactTitle", v)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="address" value={d.address} onChange={(v) => update("address", v)} />
          <Field label="hours" value={d.hours} onChange={(v) => update("hours", v)} />
          <Field label="phone (used for WhatsApp link)" value={d.phone} onChange={(v) => update("phone", v)} />
        </div>
        <Field label="footer" value={d.footer} onChange={(v) => update("footer", v)} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"><h2 className="text-sm font-bold">{title}</h2>{children}</div>;
}
function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold tracking-wide text-slate-500">{label}</span>
      {multiline ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300" /> : <input value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:bg-white focus:border-slate-300" />}
    </label>
  );
}
