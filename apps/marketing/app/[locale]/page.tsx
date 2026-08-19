"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Space_Grotesk, IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from "next/font/google";
import { landingDefaults } from "@/lib/landingDefaults";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const ibmArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"] });

export default function LandingPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const goLogin = () => router.push(`/${locale}/login`);
  const goLang = () => router.push(`/${isAr ? "en" : "ar"}`);

  const defaults = landingDefaults[isAr ? "ar" : "en"] as any;
  const [override, setOverride] = useState<any>(null);
  const [landingReady, setLandingReady] = useState(false);
  const [announcements, setAnnouncements] = useState<{ text_ar: string; text_en: string }[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [contactDone, setContactDone] = useState(false);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  useEffect(() => {
    // Strip the legacy pre-unified-login key so a stale cache/CMS override
    // can never render "Staff login" — the button is unified via defaults.
    const sanitize = (o: any) => {
      if (!o || typeof o !== "object" || Array.isArray(o) || "detail" in o) return null;
      if (typeof o.staffLogin === "string") {
        const clean = { ...o };
        delete clean.staffLogin;
        return clean;
      }
      return o;
    };

    let hasCache = false;
    let cachedParsed: any = null;
    try {
      const cached = localStorage.getItem(`landing:${locale}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const clean = sanitize(parsed);
        if (clean && (clean.programs || clean.heroKicker || clean.heroLine1)) {
          cachedParsed = clean;
          hasCache = true;
        }
      }
    } catch {}
    if (hasCache) {
      setOverride(cachedParsed);
      setLandingReady(true);
    } else {
      setOverride(null);
      setLandingReady(false);
    }
    fetch(`/api/v1/public/landing?locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const clean = d && typeof d === "object" && !Array.isArray(d) ? sanitize(d) : null;
        if (clean && (clean.programs || clean.heroKicker || clean.heroLine1)) {
          setOverride(clean);
          try { localStorage.setItem(`landing:${locale}`, JSON.stringify(clean)); } catch {}
        } else if (!d || (typeof d === "object" && Object.keys(d).length === 0)) {
          try { localStorage.removeItem(`landing:${locale}`); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { if (!hasCache) setLandingReady(true); });
    fetch(`/api/v1/public/announcements`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setAnnouncements(d); })
      .catch(() => {});
  }, [locale]);

  const t: any = (() => {
    if (!override || typeof override !== "object" || Array.isArray(override) || "detail" in override) return defaults;
    const base: any = { ...defaults };
    for (const k of Object.keys(override)) {
      const v = (override as any)[k];
      if (v == null) continue;
      if (k === "programs" || k === "ateliers" || k === "levels") {
        if (Array.isArray(v) && v.length) base[k] = v;
      } else if (typeof v === "string") {
        if (v.trim() !== "") base[k] = v;
      } else {
        base[k] = v;
      }
    }
    if (!Array.isArray(base.programs) || !base.programs.length) base.programs = defaults.programs;
    if (!Array.isArray(base.ateliers) || !base.ateliers.length) base.ateliers = defaults.ateliers;
    if (!Array.isArray(base.levels) || !base.levels.length) base.levels = defaults.levels;
    base.liveLabel = defaults.liveLabel;
    base.liveCardTitle = defaults.liveCardTitle;
    base.lang = defaults.lang;
    if (!base.stats) base.stats = defaults.stats;
    if (!base.testimonials) base.testimonials = defaults.testimonials;
    if (!base.faqs) base.faqs = defaults.faqs;
    if (!base.faqTitle) base.faqTitle = defaults.faqTitle;
    if (!base.faqSub) base.faqSub = defaults.faqSub;
    return base;
  })();

  const waDigits = (t.phone as string).replace(/\D/g, "");
  const waNumber = waDigits.length >= 9 ? (waDigits.startsWith("967") ? waDigits : waDigits.startsWith("0") ? `967${waDigits.slice(1)}` : `967${waDigits}`) : "967777123456";
  const waText = isAr ? "مرحبا، أريد حجز مقعد تجريبي في معهد الدراسات" : "Hi, I want to book a free trial at Al-Drasat";
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    setContactErr(null);
    const digits = contactPhone.replace(/\D/g, "");
    if (contactName.trim().length < 2 || digits.length < 7) { setContactErr(isAr ? "الاسم أو الهاتف غير كافٍ" : "Name or phone too short"); return; }
    try {
      const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1];
      if (!csrf) await fetch("/api/v1/auth/csrf", { credentials: "include" });
      const csrf2 = document.cookie.match(/csrf_token=([^;]+)/)?.[1];
      const res = await fetch("/api/v1/public/contacts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(csrf2 ? { "X-CSRF-Token": decodeURIComponent(csrf2) } : {}) }, body: JSON.stringify({ name: contactName.trim(), phone: contactPhone.trim(), message: contactMsg.trim() || null, locale }) });
      if (!res.ok) throw new Error((await res.json()).detail || "failed");
      setContactDone(true);
    } catch (err: any) { setContactErr(err?.message || "failed"); }
  }

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: isAr ? "معهد الدراسات — تعز" : "Al-Drasat Institute — Taiz",
    url: `https://aldirasat.com/${locale}`,
    foundingDate: "1998",
    address: { "@type": "PostalAddress", addressLocality: "Taiz", addressCountry: "YE" },
    description: t.heroDesc,
  };
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: (t.programs as any[]).slice(0, 4).map((p: any, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "Course", name: p.k, description: p.d, provider: { "@type": "Organization", name: "Al-Drasat" } },
    })),
  };

  if (!landingReady) {
    return (
      <div dir={isAr ? "rtl" : "ltr"} className={`${inter.className} min-h-screen bg-[#FFFBF0] text-[#0A0A0A]`}>
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-5 md:pt-7">
          <div className="h-[420px] rounded-[28px] bg-white border border-[#0A0A0A]/10 animate-pulse" />
          <div className="mt-6 h-[88px] rounded-[22px] bg-white border border-[#0A0A0A]/10 animate-pulse" />
          <div className="mt-6 h-[96px] rounded-2xl bg-[#0A0A0A]/90 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className={`${inter.className} min-h-screen bg-[#FFFBF0] text-[#0A0A0A] selection:bg-[#FF3B30] selection:text-white`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }} />

      <header className="sticky top-0 z-40 bg-[#FFFBF0]/85 backdrop-blur-xl border-b border-[#0A0A0A]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[64px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] bg-white border border-[#0A0A0A]/10 grid place-items-center overflow-hidden shrink-0 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="Al-Drasat" className="h-full w-full object-contain" />
            </div>
            <div className="leading-none">
              <div className="font-bold tracking-[-0.04em] text-[14px]" style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : spaceGrotesk.style.fontFamily }}>
                {isAr ? "الدراسات" : "AL-DRASAT"}
              </div>
              <div className="text-[10px] tracking-[0.14em] opacity-60 hidden sm:block" style={{ fontFamily: jetbrains.style.fontFamily }}>
                {isAr ? "تعز · اليمن — ١٩٩٨" : "TAIZ · YEMEN — 1998"}
              </div>
            </div>
            <nav className="hidden lg:flex items-center gap-1 ms-2 p-1 rounded-full bg-white border border-[#0A0A0A]/10 shadow-sm">
              {[
                [t.navPrograms, "#programs"],
                [(t as any).navAI, "#ai"],
                [t.navAteliers, "#ateliers"],
                [t.navContact, "#contact"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold hover:bg-[#0A0A0A] hover:text-white transition"
                  style={{ fontFamily: inter.style.fontFamily }}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goLang}
              className="text-[12px] font-semibold px-3.5 py-2 rounded-full bg-white border border-[#0A0A0A]/12 hover:border-[#0A0A0A]/20 transition"
            >
              {t.lang}
            </button>
            <button
              onClick={goLogin}
              className="text-[12px] font-bold px-4 py-2 rounded-full bg-[#0A0A0A] text-white hover:bg-black transition"
            >
              {t.staffLogin} →
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1280px] px-4 md:px-6 pt-5 md:pt-7">
        <div className="grid grid-cols-12 gap-4 md:gap-6 items-stretch">
          <div className="col-span-12 lg:col-span-7 relative rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-[0_16px_50px_rgba(10,10,10,0.08)]">
            <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: "radial-gradient(#0A0A0A 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            <div className="absolute -top-20 -end-20 h-[320px] w-[320px] rounded-full bg-[#FFD60A]/25 blur-[40px]" />
            <div className="absolute -bottom-20 -start-20 h-[380px] w-[380px] rounded-full bg-[#0EA5E9]/15 blur-[50px]" />

            <div className="absolute inset-0 grid place-items-center pointer-events-none select-none overflow-hidden">
              <span
                className="text-[86px] md:text-[132px] font-black tracking-[-0.06em] leading-none opacity-[0.04]"
                style={{ fontFamily: spaceGrotesk.style.fontFamily, WebkitTextStroke: "1px #0A0A0A" as any }}
              >
                {isAr ? "الدراسات" : "AL-DRASAT"}
              </span>
            </div>

            <div className="relative p-6 md:p-8 lg:p-10">
              <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] font-bold px-3 py-1.5 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10" style={{ fontFamily: jetbrains.style.fontFamily }}>
                {t.heroKicker.toUpperCase()}
              </div>

              <h1 className="mt-4 font-black tracking-[-0.05em] leading-[0.88] text-[38px] md:text-[58px]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
                <span className="block">{t.heroLine1}</span>
                <span className="block">
                  <span className="inline-block px-2 -mx-1 rounded-[10px] bg-[#FFD60A] rotate-[-0.8deg]">{t.heroLine2}</span>
                </span>
                <span className="block opacity-80">{t.heroLine3}</span>
              </h1>

              <p className="mt-4 max-w-[46ch] text-[13.5px] leading-7 opacity-70" style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : inter.style.fontFamily }}>
                {t.heroDesc}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a href={`/${locale}/book`} className="rounded-full bg-[#FF3B30] text-white px-6 py-3 text-[13px] font-bold hover:bg-[#E3342B] transition shadow-[0_10px_30px_rgba(255,59,48,0.25)]">
                  {t.ctaPrimary}
                </a>
                <a href="#programs" className="rounded-full bg-white border border-[#0A0A0A]/12 px-6 py-3 text-[13px] font-bold hover:bg-[#FFFBF0] transition">
                  {t.ctaGhost}
                </a>
              </div>

              <div className="mt-4 text-[11px] opacity-60 flex items-center gap-2" style={{ fontFamily: jetbrains.style.fontFamily }}>
                <span className="h-px w-8 bg-[#0A0A0A]/15 hidden md:block" />
                {t.micro}
              </div>
            </div>

            <div className="relative border-t border-[#0A0A0A]/10 bg-[#FFFBF0]/60 px-6 md:px-10 py-3 flex items-center gap-2 overflow-hidden">
              <span className="text-[11px] font-bold" style={{ fontFamily: jetbrains.style.fontFamily }}>
                LEVELS
              </span>
              <div className="flex items-center gap-1.5">
                {(t.levels as string[]).map((lv: string, i: number) => (
                  <span
                    key={lv}
                    className="h-6 px-2 rounded-full border text-[11px] font-bold grid place-items-center"
                    style={{
                      fontFamily: jetbrains.style.fontFamily,
                      background: i === 2 ? "#0A0A0A" : "white",
                      color: i === 2 ? "white" : "#0A0A0A",
                      borderColor: "rgba(10,10,10,0.12)",
                    }}
                  >
                    {lv}
                  </span>
                ))}
              </div>
              <span className="ms-auto hidden md:inline text-[11px] opacity-50" style={{ fontFamily: jetbrains.style.fontFamily }}>
                A1 → C2 · placement in 20′
              </span>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
            <div className="rounded-[28px] bg-[#0A0A0A] text-white overflow-hidden border border-black shadow-[0_16px_50px_rgba(10,10,10,0.18)]">
              <div className="h-[44px] flex items-center justify-between px-5 border-b border-white/10">
                <span className="text-[11px] tracking-[0.16em] font-bold opacity-70" style={{ fontFamily: jetbrains.style.fontFamily }}>
                  {t.liveLabel.toUpperCase()} · {t.liveCardTitle.toUpperCase()}
                </span>
                <span className="h-2 w-2 rounded-full bg-[#FF3B30] animate-pulse" />
              </div>
              <div className="p-4 grid gap-3">
                {[
                  { t: "08:30", title: isAr ? "إنجليزية B1 — قاعة A" : "English B1 — Room A", who: isAr ? "أ. ليلى · 8 طلاب" : "Ms. Layla · 8 students", accent: "#FF3B30" },
                  { t: "11:00", title: isAr ? "بايثون أساسيات — مخبر 2" : "Python Basics — Lab 2", who: isAr ? "م. كرم · Live code" : "Eng. Karam · Live code", accent: "#0EA5E9" },
                  { t: "15:30", title: isAr ? "محاسبة 1 — قاعة C" : "Accounting I — Room C", who: isAr ? "أ. سارة · دفتر عملي" : "Ms. Sara · hands-on", accent: "#FFD60A" },
                ].map((row) => (
                  <div key={row.t} className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 flex items-center gap-3">
                    <span className="shrink-0 h-9 w-9 rounded-xl bg-white text-[#0A0A0A] grid place-items-center text-[12px] font-black" style={{ fontFamily: jetbrains.style.fontFamily }}>
                      {row.t.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold leading-4 truncate">{row.title}</div>
                      <div className="text-[11px] opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>
                        {row.who}
                      </div>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: row.accent }} />
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <a href={`/${locale}/book`} className="w-full rounded-full bg-white text-[#0A0A0A] py-3 text-[13px] font-bold grid place-items-center hover:bg-[#FFFBF0] transition">
                  {isAr ? "احجز مقعد تجربة مجاني" : "Save a free trial seat"} →
                </a>
              </div>
            </div>

            <div className="rounded-[28px] bg-white border border-[#0A0A0A]/10 p-5 flex-1 shadow-sm">
              <div className="text-[11px] tracking-[0.16em] font-bold opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>
                ATELIER PREVIEW
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { k: isAr ? "صوت" : "VOICE", v: "A1→C2", c: "#FF3B30" },
                  { k: isAr ? "كود" : "CODE", v: "</>", c: "#0EA5E9" },
                  { k: isAr ? "عمل" : "BIZ", v: "QR", c: "#FFD60A" },
                ].map((b) => (
                  <div key={b.k} className="rounded-2xl border border-[#0A0A0A]/10 p-3 text-center" style={{ background: b.c + "14" }}>
                    <div className="text-[11px] font-black" style={{ fontFamily: jetbrains.style.fontFamily }}>
                      {b.k}
                    </div>
                    <div className="mt-1 text-[16px] font-black" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
                      {b.v}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12.5px] leading-5 opacity-60">
                {isAr ? "ثلاث ورش مفتوحة يوميًا — تدخل وتجرّب قبل أن تسجّل." : "Three ateliers open daily — try before you enrol."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6" aria-label={isAr ? "إحصائيات" : "Social proof"}>
        <div className="rounded-[22px] bg-white border border-[#0A0A0A]/10 px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-6 md:gap-8">
            {(t.stats as any[]).map((s: any) => (
              <div key={s.label} className="flex items-baseline gap-2">
                <span className="text-[20px] md:text-[22px] font-black tracking-[-0.04em]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>{s.value}</span>
                <span className="text-[11px] font-bold opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold" style={{ fontFamily: jetbrains.style.fontFamily }}>
            <span className="hidden sm:inline opacity-40">{isAr ? "موثوق منذ" : "Trusted since"} 1998</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0A0A0A] text-white">
              <span className="text-[#FFD60A]">★★★★★</span> 4.8/5
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10">
              <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" /> QR CERT
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(t.testimonials as any[]).map((tm: any) => (
            <div key={tm.name} className="rounded-[20px] bg-white border border-[#0A0A0A]/10 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-black tracking-[0.12em]" style={{ fontFamily: jetbrains.style.fontFamily }}>{tm.track}</div>
                <span className="text-[11px] text-[#FFD60A]">{"★".repeat(tm.rating)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-6 opacity-70" style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : inter.style.fontFamily }}>“{tm.quote}”</p>
              <div className="mt-3 text-[12px] font-bold" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>{tm.name}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-2xl border border-[#0A0A0A]/10 bg-[#0A0A0A] text-white overflow-hidden">
          <div className="overflow-hidden">
            <div className="flex w-max animate-[tape2_20s_linear_infinite] will-change-transform whitespace-nowrap">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} aria-hidden={i !== 0} className="flex items-center gap-3 py-3 ps-3 shrink-0" style={{ fontFamily: jetbrains.style.fontFamily }}>
                  {(announcements.length ? announcements.map((a) => (isAr ? a.text_ar : a.text_en)) : isAr ? ["تعز", "لغات", "برمجة", "شبكات", "دبلومات", "اختبار تحديد مستوى"] : ["Taiz", "Languages", "Coding", "Networks", "Diplomas", "Placement Test"]).map((w) => (
                    <span key={`${w}-${i}`} className="inline-flex items-center gap-3">
                      <span className="text-[12px] tracking-[0.14em] font-bold opacity-90">{w.toUpperCase()}</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#FFD60A]" />
                    </span>
                  ))}
                  <span className="text-[12px] tracking-[0.14em] font-bold opacity-40">{isAr ? "— تعز — ١٩٩٨ → الآن —" : "— TAIZ — 1998 → NOW —"}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF3B30]" />
                </div>
              ))}
            </div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: "@keyframes tape2 { from { transform: translateX(0)} to { transform: translateX(-25%) } }" }} />
        </div>
      </div>

      <section id="ai" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-[28px] bg-[#0A0A0A] text-white overflow-hidden border border-black">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-span-5 p-6 md:p-8">
              <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/15" style={{ fontFamily: jetbrains.style.fontFamily }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFD60A] animate-pulse" /> {isAr ? "AI · مساعدك في التعلّم" : "AI · YOUR LEARNING COMPANION"}
              </div>
              <h2 className="mt-3 text-[24px] md:text-[28px] font-black tracking-[-0.05em]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
                {isAr ? "ذكاء يساعدك تتعلّم أسرع" : "AI that helps you learn faster"}
              </h2>
              <p className="mt-2 text-[13px] leading-6 opacity-70">
                {isAr ? "ليس بديلًا عن المعلّم — بل مساعد يومي يرافقك بعد الحصة. يصحح، يراجع، ويذكّرك بما تحتاج." : "Not replacing the teacher — a daily companion after class. It corrects, reviews, and reminds you what matters."}
              </p>
              <div className="mt-4 text-[11px] opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>
                {isAr ? "يعمل على هاتفك · مجاني لطلاب المعهد" : "On your phone · Free for students"}
              </div>
            </div>
            <div className="col-span-12 lg:col-span-7 p-4 md:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/[0.04]">
              {[
                { k: isAr ? "مدرّب النطق" : "Pronunciation coach", p: isAr ? "سجّل جملة، يصحح نطقك فورًا ويعطيك تمارين قصيرة." : "Record a sentence — instant correction + micro-drills." },
                { k: isAr ? "مراجع الكود" : "Code reviewer", p: isAr ? "الصق كودك، يكشف الخطأ ويقترح تحسينًا — تتعلم لماذا." : "Paste code — finds bugs and suggests better patterns." },
                { k: isAr ? "خطة المراجعة" : "Revision plan", p: isAr ? "يبني لك خطة يومية حسب أخطائك ويذكّرك بها." : "Builds a daily plan from your mistakes and nudges you." },
              ].map((c) => (
                <div key={c.k} className="rounded-2xl bg-white text-[#0A0A0A] border border-white/10 p-4">
                  <div className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>{c.k.toUpperCase()}</div>
                  <p className="mt-2 text-[12.5px] leading-5 opacity-70">{c.p}</p>
                </div>
              ))}
              <div className="sm:col-span-3 rounded-2xl bg-[#FFD60A] text-[#0A0A0A] px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold" style={{ fontFamily: jetbrains.style.fontFamily }}>{isAr ? "قريبًا: مساعد دراسة بالعربية" : "Soon: Arabic study assistant"}</span>
                <span className="text-[11px] opacity-70">{isAr ? "اسأل بلغتك" : "Ask in your language"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="programs" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8 md:mt-10">
        <div className="rounded-[32px] bg-[#0A0A0A] p-[1.5px] shadow-[0_20px_60px_rgba(10,10,10,0.12)]">
          <div className="rounded-[30px] bg-[#FFFBF0] overflow-hidden">
            <div className="px-6 md:px-8 pt-8 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
              <div>
                <div className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF3B30] animate-pulse" />
                  <span className="text-[11px] tracking-[0.18em] font-black opacity-40" style={{ fontFamily: jetbrains.style.fontFamily }}>
                    {(t as any).programsEyebrow.toUpperCase()} — 04 TRACKS
                  </span>
                  <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFD60A] border border-[#0A0A0A]/10" style={{ fontFamily: jetbrains.style.fontFamily }}>
                    {isAr ? "التسجيل مفتوح" : "OPEN ENROLMENT"}
                  </span>
                </div>
                <h2 className="mt-3 text-[26px] md:text-[34px] font-black tracking-[-0.05em] leading-[0.9]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
                  {t.programsTitle}
                </h2>
              </div>
              <p className="max-w-[42ch] text-[13.5px] leading-6 opacity-60 lg:text-end lg:pb-1" style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : inter.style.fontFamily }}>
                {t.programsSub}
              </p>
            </div>

            <div className="px-3 md:px-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {(t as any).programs.map((p: any, i: number) => {
                  const styles = [
                    { accent: "#FF3B30", tint: "#FFF1F0", iconBg: "bg-[#FF3B30]", label: isAr ? "لغة" : "LINGUA" },
                    { accent: "#0EA5E9", tint: "#EFF6FF", iconBg: "bg-[#0EA5E9]", label: isAr ? "كود" : "CODE" },
                    { accent: "#7C3AED", tint: "#F5F0FF", iconBg: "bg-[#7C3AED]", label: "AI" },
                    { accent: "#0A0A0A", tint: "#F5F5F0", iconBg: "bg-[#0A0A0A]", label: isAr ? "مهني" : "PRO" },
                  ][i];
                  const icons = [
                    <svg key="i0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="8.2" /><ellipse cx="12" cy="12" rx="4.1" ry="8.2" /><path d="M3.8 12H20.2M5.6 8.2H18.4M5.6 15.8H18.4" /></svg>,
                    <svg key="i1" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 8 5 12 9 16" /><path d="M15 8 19 12 15 16" /><path d="M14.5 5 9.5 19" /></svg>,
                    <svg key="i2" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3.2 13.1 8 18 9.2 13.1 10.4 12 15.2 10.9 10.4 6 9.2 10.9 8 12 3.2Z" /><path d="M18.6 13.2 19.1 14.8 20.7 15.3 19.1 15.8 18.6 17.4 18.1 15.8 16.5 15.3 18.1 14.8 18.6 13.2Z" /><path d="M6.8 13.6 7.2 14.9 8.5 15.3 7.2 15.7 6.8 17 6.4 15.7 5.1 15.3 6.4 14.9 6.8 13.6Z" /></svg>,
                    <svg key="i3" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="6.5" y="3.5" width="11" height="14.5" rx="1.6" /><path d="M8.8 7.5H15.2M8.8 10.5H15.2M8.8 13.5H13.2" /><circle cx="14.8" cy="16.2" r="2.7" /><path d="M13.2 18.6 14.8 17 16.4 18.6" /></svg>,
                  ][i];
                  return (
                    <a
                      key={p.k}
                      href={`/${locale}/programs#${p.id}`}
                      className="group relative rounded-[24px] bg-white border border-[#0A0A0A]/10 overflow-hidden hover:shadow-[0_18px_48px_rgba(10,10,10,0.10)] hover:-translate-y-[3px] hover:border-[#0A0A0A]/15 transition-all duration-300 flex flex-col"
                    >
                      <div className="h-[4px] w-full" style={{ background: styles.accent }} />
                      <span
                        className="absolute -top-1 -end-2 text-[84px] font-black leading-none select-none pointer-events-none opacity-[0.04] group-hover:opacity-[0.07] transition"
                        style={{ fontFamily: spaceGrotesk.style.fontFamily }}
                      >
                        0{i + 1}
                      </span>
                      <div className="p-6 md:p-7 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className={`h-11 w-11 rounded-[14px] ${styles.iconBg} text-white grid place-items-center shrink-0 shadow-sm`}>
                            {icons}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[62%]">
                            <span className="hidden sm:inline text-[10px] tracking-[0.14em] font-black px-2.5 py-1 rounded-full bg-[#0A0A0A] text-white" style={{ fontFamily: jetbrains.style.fontFamily }}>
                              {styles.label}
                            </span>
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-white" style={{ fontFamily: jetbrains.style.fontFamily, borderColor: styles.accent + "22", background: styles.tint }}>
                              {p.meta}
                            </span>
                            {p.seats && (
                              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#FF3B30] text-white" style={{ fontFamily: jetbrains.style.fontFamily }}>
                                {p.seats}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-5">
                          <h3 className="text-[19px] md:text-[20px] font-black tracking-[-0.04em] leading-none flex items-center gap-2" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
                            {p.k}
                            <span className="h-6 w-6 rounded-full bg-[#0A0A0A] text-white grid place-items-center text-[12px] opacity-0 group-hover:opacity-100 translate-x-[-4px] group-hover:translate-x-0 transition-all duration-300">
                              →
                            </span>
                          </h3>
                          <p className="mt-2.5 text-[13.5px] leading-6 opacity-60 line-clamp-2" style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : inter.style.fontFamily }}>{p.d}</p>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-1.5">
                          {[
                            { k: isAr ? "المخرج" : "Outcome", v: p.outcome || "—" },
                            { k: isAr ? "المدة" : "Duration", v: p.duration || "—" },
                            { k: isAr ? "البداية" : "Intake", v: p.intake || "—" },
                          ].map((x) => (
                            <div key={x.k} className="rounded-xl bg-[#FFFBF0] border border-[#0A0A0A]/10 px-2.5 py-2">
                              <div className="text-[9px] tracking-[0.12em] font-black opacity-40" style={{ fontFamily: jetbrains.style.fontFamily }}>{x.k.toUpperCase()}</div>
                              <div className="mt-0.5 text-[11px] font-bold leading-tight truncate">{x.v}</div>
                            </div>
                          ))}
                        </div>
                        {p.priceHint && (
                          <div className="mt-2 text-[11px] opacity-50" style={{ fontFamily: jetbrains.style.fontFamily }}>{p.priceHint} · {isAr ? "شهادة QR" : "QR cert"}</div>
                        )}

                        <div className="mt-4 flex items-center gap-2 text-[11px] font-bold" style={{ fontFamily: jetbrains.style.fontFamily }}>
                          <span className="h-px flex-1 bg-[#0A0A0A]/10 group-hover:bg-[#0A0A0A]/15 transition" />
                          <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10 group-hover:bg-[#0A0A0A] group-hover:text-white group-hover:border-[#0A0A0A] transition">
                            {isAr ? "استكشف" : "Explore"} <span className="group-hover:translate-x-0.5 transition">→</span>
                          </span>
                        </div>

                        <div className="mt-3 flex items-center gap-1.5 text-[10px] tracking-[0.08em] font-bold opacity-30" style={{ fontFamily: jetbrains.style.fontFamily }}>
                          <span className="h-1 w-1 rounded-full" style={{ background: styles.accent }} /> {isAr ? "ورشة · مشروع · شهادة QR" : "ATELIER · PROJECT · QR CERT"}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="mx-3 md:mx-4 mb-3 md:mb-4 rounded-2xl bg-white border border-[#0A0A0A]/10 px-4 md:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <span className="inline-flex items-center gap-2 font-bold" style={{ fontFamily: jetbrains.style.fontFamily }}>
                <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" /> {isAr ? "نضيف مسارات جديدة كل فصل — اسأل عن القادم" : "New tracks each term — ask about next intake"}
              </span>
              <span className="opacity-40 hidden sm:inline" style={{ fontFamily: jetbrains.style.fontFamily }}>
                {isAr ? "التسجيل حضوري · اختبار مستوى مجاني" : "On-campus enrolment · Free placement test"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="ateliers" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8">
        <div className="rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-sm">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-span-4 p-6 md:p-8 bg-[#FFD60A]/20 border-b lg:border-b-0 lg:border-e border-[#0A0A0A]/10">
              <div className="text-[11px] tracking-[0.18em] font-black opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>
                ATELIERS
              </div>
              <h2 className="mt-2 text-[24px] font-black tracking-[-0.04em]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
                {t.ateliersTitle}
              </h2>
              <p className="mt-2 text-[13px] leading-6 opacity-60">
                {isAr ? "لا محاضرات طويلة. 60 دقيقة تركيز، ثم تطبّق." : "No long lectures. 60 minutes focus, then you build."}
              </p>
            </div>
            <div className="col-span-12 lg:col-span-8 p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#FFFBF0]/40">
              {(t.ateliers as any[]).map((a: any) => (
                <div key={a.k} className="rounded-2xl bg-white border border-[#0A0A0A]/10 p-5">
                  <div className="text-[11px] tracking-[0.16em] font-black opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>
                    {a.k.toUpperCase()}
                  </div>
                  <div className="mt-1 text-[12px] font-bold px-2 py-1 rounded-full bg-[#0A0A0A] text-white inline-block" style={{ fontFamily: jetbrains.style.fontFamily }}>
                    {a.v}
                  </div>
                  <p className="mt-3 text-[12.5px] leading-5 opacity-60">{a.p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8">
        <div className="rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-sm">
          <div className="px-6 md:px-8 pt-7 pb-2">
            <div className="text-[11px] tracking-[0.18em] font-black opacity-40" style={{ fontFamily: jetbrains.style.fontFamily }}>FAQ</div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-[22px] md:text-[26px] font-black tracking-[-0.04em]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>{t.faqTitle}</h2>
              <p className="text-[12.5px] opacity-60 max-w-[36ch]">{t.faqSub}</p>
            </div>
          </div>
          <div className="p-3 md:p-4 grid gap-2">
            {(t.faqs as any[]).map((f: any, idx: number) => {
              const open = faqOpen === idx;
              return (
                <div key={f.q} className={`rounded-2xl border ${open ? "bg-[#FFFBF0] border-[#0A0A0A]/15" : "bg-white border-[#0A0A0A]/10"} overflow-hidden`}>
                  <button
                    onClick={() => setFaqOpen(open ? null : idx)}
                    className="w-full text-start px-4 md:px-5 py-4 flex items-center justify-between gap-4"
                    aria-expanded={open}
                  >
                    <span className="text-[13px] md:text-[14px] font-bold leading-5">{f.q}</span>
                    <span className={`shrink-0 h-7 w-7 rounded-full grid place-items-center text-[14px] font-bold border transition ${open ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "bg-white border-[#0A0A0A]/10"}`}>{open ? "−" : "+"}</span>
                  </button>
                  {open && (
                    <div className="px-4 md:px-5 pb-4 text-[13px] leading-6 opacity-70">
                      {f.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-4 md:px-6 pb-4">
            <div className="rounded-2xl bg-[#0A0A0A] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px] opacity-80" style={{ fontFamily: jetbrains.style.fontFamily }}>{isAr ? "ما لقيت جوابك؟" : "Still not sure?"}</span>
              <div className="flex gap-2">
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#25D366] text-white px-4 py-1.5 text-[12px] font-bold hover:brightness-105 transition">WhatsApp →</a>
                <a href={`/${locale}/book`} className="rounded-full bg-white text-[#0A0A0A] px-4 py-1.5 text-[12px] font-bold hover:bg-[#FFFBF0] transition">{isAr ? "احجز مجانًا" : "Book free"}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-[28px] bg-[#0A0A0A] text-white p-6 md:p-8 grid grid-cols-12 gap-6 border border-black">
          <div className="col-span-12 lg:col-span-7">
            <div className="text-[11px] tracking-[0.16em] font-bold opacity-60" style={{ fontFamily: jetbrains.style.fontFamily }}>
              VISIT
            </div>
            <h2 className="mt-2 text-[22px] md:text-[26px] font-black tracking-[-0.04em]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>
              {t.contactTitle}
            </h2>
            <div className="mt-4 grid gap-2 text-[13px] leading-6 opacity-80">
              <div>📍 {t.address}</div>
              <div>🕘 {t.hours}</div>
              <div style={{ fontFamily: jetbrains.style.fontFamily }}>☎ {t.phone}</div>
            </div>
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-5 py-2.5 text-[13px] font-bold hover:brightness-105 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden><path d="M19.05 4.94A9.82 9.82 0 0 0 12.04 2 9.9 9.9 0 0 0 3.6 14.9L2 22l7.3-1.92A9.9 9.9 0 0 0 22 12.05 9.81 9.81 0 0 0 19.05 4.94Zm-7.01 14.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-4.33 1.14 1.15-4.22-.2-.32A8.2 8.2 0 0 1 12.04 3.7a8.14 8.14 0 0 1 8.16 8.16 8.2 8.2 0 0 1-8.16 7.28Zm4.5-6.14c-.25-.12-1.47-.73-1.7-.81-.23-.09-.4-.12-.56.12-.17.25-.65.81-.8.98-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.24-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.4 1.02 2.57.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z"/></svg>
              {isAr ? "تواصل واتساب" : "Chat on WhatsApp"}
            </a>
          </div>
          <div className="col-span-12 lg:col-span-5 rounded-2xl bg-white text-[#0A0A0A] p-5 overflow-hidden">
            {!contactDone ? (
              <form onSubmit={submitContact} className="space-y-3">
                <div className="text-[12px] font-black" style={{ fontFamily: jetbrains.style.fontFamily }}>{isAr ? "راسلنا" : "Contact us"}</div>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={isAr ? "الاسم" : "Name"} className="w-full h-10 rounded-xl border border-[#0A0A0A]/10 bg-[#FFFBF0] px-3 text-sm outline-none focus:border-[#0A0A0A]/20" />
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={isAr ? "الهاتف" : "Phone"} dir="ltr" className="w-full h-10 rounded-xl border border-[#0A0A0A]/10 bg-[#FFFBF0] px-3 text-sm outline-none focus:border-[#0A0A0A]/20" />
                <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} placeholder={isAr ? "رسالتك (اختياري)" : "Message (optional)"} rows={2} className="w-full rounded-xl border border-[#0A0A0A]/10 bg-[#FFFBF0] px-3 py-2 text-sm outline-none focus:border-[#0A0A0A]/20" />
                {contactErr && <div className="text-xs text-red-600">{contactErr}</div>}
                <button type="submit" className="w-full rounded-full bg-[#0A0A0A] text-white py-2.5 text-[13px] font-bold hover:bg-black transition">{isAr ? "إرسال" : "Send"} →</button>
                <a href={`/${locale}/book`} className="block text-center text-xs opacity-60 hover:opacity-100">{isAr ? "أو احجز حصة تجريبية →" : "Or book a trial →"}</a>
              </form>
            ) : (
              <div className="relative text-center py-7 px-2 overflow-hidden">
                <style dangerouslySetInnerHTML={{ __html: "@keyframes contactCheckDraw{0%{stroke-dashoffset:36}100%{stroke-dashoffset:0}}@keyframes contactRing{0%{transform:scale(0.9);opacity:0.5}100%{transform:scale(1.45);opacity:0}}@keyframes contactIn{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}" }} />
                <div className="animate-[contactIn_0.45s_cubic-bezier(0.16,1,0.3,1)]">
                  <div className="relative mx-auto h-[52px] w-[52px]">
                    <span className="absolute inset-0 rounded-full bg-[#10B981]/20 animate-[contactRing_1.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
                    <span className="relative grid place-items-center h-[52px] w-[52px] rounded-full bg-[#0A0A0A] text-white">
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                        <circle cx="13" cy="13" r="10" stroke="white" strokeOpacity="0.18" strokeWidth="1.4" />
                        <path d="M7.5 13.2L11 16.7L18.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="36" strokeDashoffset="36" style={{ animation: "contactCheckDraw 0.55s 0.3s cubic-bezier(0.16,1,0.3,1) forwards" }} />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] tracking-[0.14em] font-black px-2.5 py-1 rounded-full bg-[#10B981] text-white" style={{ fontFamily: jetbrains.style.fontFamily }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> {isAr ? "وصلت رسالتك" : "MESSAGE RECEIVED"}
                  </div>
                  <div className="mt-2 text-[15px] font-black tracking-[-0.02em]" style={{ fontFamily: spaceGrotesk.style.fontFamily }}>{isAr ? "تم — نكلمك قريبًا" : "Sent — we'll be in touch"}</div>
                  <div className="mt-1 text-[12px] leading-5 opacity-60">{isAr ? "نرد على نفس الرقم خلال ساعات." : "We reply on the same number within hours."}</div>
                  <button onClick={() => { setContactDone(false); setContactName(""); setContactPhone(""); setContactMsg(""); }} className="mt-4 text-xs font-bold underline opacity-60 hover:opacity-100">{isAr ? "إرسال رسالة أخرى" : "Send another"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-4 md:px-6 py-8 pb-[84px] md:pb-8">
        <div className="rounded-2xl bg-white border border-[#0A0A0A]/10 px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-[12px] opacity-70">{t.footer}</span>
          <span className="text-[11px] opacity-50" style={{ fontFamily: jetbrains.style.fontFamily }}>
            Taiz — Voice · Code · Work
          </span>
        </div>
      </footer>

      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 backdrop-blur border-t border-[#0A0A0A]/10 px-3 py-2.5 flex gap-2">
        <a href={`/${locale}/book`} className="flex-1 rounded-full bg-[#FF3B30] text-white h-11 grid place-items-center text-[13px] font-black shadow-[0_8px_24px_rgba(255,59,48,0.35)]">
          {isAr ? "احجز مجانًا" : "Book free trial"}
        </a>
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#0A0A0A] text-white h-11 px-5 grid place-items-center text-[13px] font-bold">
          WhatsApp
        </a>
      </div>

      <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="hidden md:grid fixed bottom-5 end-5 z-40 h-14 w-14 rounded-full bg-[#25D366] text-white place-items-center shadow-[0_12px_32px_rgba(0,0,0,0.22)] hover:brightness-105 transition">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden><path d="M19.05 4.94A9.82 9.82 0 0 0 12.04 2 9.9 9.9 0 0 0 3.6 14.9L2 22l7.3-1.92A9.9 9.9 0 0 0 22 12.05 9.81 9.81 0 0 0 19.05 4.94Zm-7.01 14.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-4.33 1.14 1.15-4.22-.2-.32A8.2 8.2 0 0 1 12.04 3.7a8.14 8.14 0 0 1 8.16 8.16 8.2 8.2 0 0 1-8.16 7.28Zm4.5-6.14c-.25-.12-1.47-.73-1.7-.81-.23-.09-.4-.12-.56.12-.17.25-.65.81-.8.98-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.24-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.4 1.02 2.57.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z"/></svg>
      </a>
    </div>
  );
}
