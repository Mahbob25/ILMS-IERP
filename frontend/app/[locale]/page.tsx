"use client";

import { useParams, useRouter } from "next/navigation";

export default function LandingV2Page() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const goLogin = () => router.push(`/${locale}/login`);
  const goLang = () => router.push(`/${isAr ? "en" : "ar"}`);

  const t = {
    ar: {
      pill: "معهد الدراسات · حلب — لغات وعلوم حاسب",
      navPrograms: "البرامج",
      navAteliers: "الورش",
      navCampus: "الحرم",
      navContact: "العنوان",
      staffLogin: "دخول الكادر",
      heroKicker: "مستوى واحد في كل مرة",
      heroLine1: "تتعلّم",
      heroLine2: "وتطبّق",
      heroLine3: "في نفس اليوم.",
      heroDesc: "فصول 8 طلاب كحد أقصى، مختبر يومي، وشهادة تُتحقّق برمز. إنجليزية وفرنسية وبرمجة وشبكات — نفس المبنى، نفس الجودة منذ 1998.",
      ctaPrimary: "شاهد البرامج",
      ctaGhost: "جولة في الحرم →",
      micro: "التسجيل حضوري فقط · اختبار تحديد مستوى مجاني",
      liveLabel: "مباشر من الحرم",
      liveCardTitle: "جدول اليوم",
      levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
      programsTitle: "ثلاث مسارات. نفس الانضباط.",
      programsSub: "كل مسار له ورشة، مشروع نهائي، وشهادة قابلة للتحقق.",
      cards: [
        { n: "01", k: "اللغات", d: "محادثة يومية، مختبر صوتي، وامتحان كل وحدتين. من الحروف إلى المناظرة.", meta: "A1 → C2", dot: "#FF3B30" },
        { n: "02", k: "علوم الحاسب", d: "بايثون، قواعد بيانات، شبكات وويب. تبني شيئًا يعمل كل أسبوع.", meta: "12 مساقًا", dot: "#0EA5E9" },
        { n: "03", k: "الدبلومات", d: "محاسبة وإدارة وسكرتارية. تدريب عملي وملف إنجاز تقدّمه لصاحب العمل.", meta: "180 ساعة", dot: "#FFD60A" },
      ],
      ateliersTitle: "الورش — حيث يحدث التعلّم",
      ateliers: [
        { k: "مختبر الصوت", v: "60 دقيقة يوميًا", p: "سماعات، تسجيل، وتصحيح نطق فوري. تتكلم أكثر مما تكتب." },
        { k: "مختبر الكود", v: "حاسوب لكل طالب", p: "بيئة حقيقية، سيرفر محلي، ومشروع يُرفع على رابط." },
        { k: "ورشة الأعمال", v: "حالات واقعية", p: "فواتير، ميزانيات، ومراسلات — كما في الشركة." },
      ],
      contactTitle: "تعال وشاهد حصة",
      address: "حلب — بناء الدراسات، الطابق الثاني — جانب مشفى الضبيط",
      hours: "السبت – الخميس · 08:30 — 19:30",
      phone: "021 — 123 4567",
      footer: "© معهد الدراسات — حلب. التسجيل حضوري.",
      lang: "English",
    },
    en: {
      pill: "Al-Drasat · Aleppo — Languages & Computing",
      navPrograms: "Programs",
      navAteliers: "Ateliers",
      navCampus: "Campus",
      navContact: "Visit",
      staffLogin: "Staff login",
      heroKicker: "One level at a time",
      heroLine1: "Learn it",
      heroLine2: "and ship it",
      heroLine3: "same day.",
      heroDesc:
        "8 max per section, daily lab, QR-verifiable certificate. English, French, Python, networks — same building, same rigor since 1998.",
      ctaPrimary: "See programs",
      ctaGhost: "Tour campus →",
      micro: "On-campus enrolment · Free placement test",
      liveLabel: "Live from campus",
      liveCardTitle: "Today",
      levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
      programsTitle: "Three tracks. Same discipline.",
      programsSub: "Each track has an atelier, a final project, and a certificate you can verify.",
      cards: [
        { n: "01", k: "Languages", d: "Daily conversation, audio lab, test every two units. Letters to debate.", meta: "A1 → C2", dot: "#FF3B30" },
        { n: "02", k: "Computing", d: "Python, DB, networks & web. You ship something that runs every week.", meta: "12 courses", dot: "#0EA5E9" },
        { n: "03", k: "Diplomas", d: "Accounting, management, secretarial. Real cases and a portfolio to show.", meta: "180 hrs", dot: "#FFD60A" },
      ],
      ateliersTitle: "Ateliers — where learning happens",
      ateliers: [
        { k: "Sound Lab", v: "60 min daily", p: "Headsets, recording, instant correction. You speak more than you write." },
        { k: "Code Lab", v: "1 machine per student", p: "Real env, local server, deploy link for your project." },
        { k: "Business Atelier", v: "Real cases", p: "Invoices, budgets, letters — as in a company." },
      ],
      contactTitle: "Come watch a class",
      address: "Aleppo — Al-Drasat Bldg, 2nd floor, near Al-Dabbit Hospital",
      hours: "Sat–Thu · 08:30 — 19:30",
      phone: "021 — 123 4567",
      footer: "© Al-Drasat Institute — Aleppo. On-campus enrolment.",
      lang: "العربية",
    },
  }[isAr ? "ar" : "en"];

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#FFFBF0] text-[#0A0A0A] selection:bg-[#FF3B30] selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`}</style>

      <header className="sticky top-0 z-40 bg-[#FFFBF0]/85 backdrop-blur-xl border-b border-[#0A0A0A]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[64px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#0A0A0A] text-white grid place-items-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="Al-Drasat" className="h-7 w-7 object-contain mix-blend-screen" />
            </div>
            <div className="leading-none hidden sm:block">
              <div className="font-bold tracking-[-0.04em] text-[14px]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                AL-DRASAT
              </div>
              <div className="text-[10px] tracking-[0.14em] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                INSTITUTE — 1998
              </div>
            </div>
            <nav className="hidden lg:flex items-center gap-1 ms-2 p-1 rounded-full bg-white border border-[#0A0A0A]/10 shadow-sm">
              {[
                [t.navPrograms, "#programs"],
                [t.navAteliers, "#ateliers"],
                [t.navCampus, "#campus"],
                [t.navContact, "#contact"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold hover:bg-[#0A0A0A] hover:text-white transition"
                  style={{ fontFamily: "Inter, sans-serif" }}
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
        <div
          className="inline-flex items-center gap-2 rounded-full bg-white border border-[#0A0A0A]/10 px-3 py-1.5 text-[11px] font-semibold shadow-sm"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <span className="h-2 w-2 rounded-full bg-[#FF3B30] animate-pulse" />
          {t.pill}
          <span className="hidden sm:inline opacity-40">·</span>
          <span className="hidden sm:inline opacity-60">{isAr ? "اختبار مجاني 20 دقيقة" : "Free 20-min test"}</span>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4 md:gap-6 items-stretch">
          <div className="col-span-12 lg:col-span-7 relative rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-[0_16px_50px_rgba(10,10,10,0.08)]">
            <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: "radial-gradient(#0A0A0A 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            <div className="absolute -top-20 -end-20 h-[320px] w-[320px] rounded-full bg-[#FFD60A]/25 blur-[40px]" />
            <div className="absolute -bottom-20 -start-20 h-[380px] w-[380px] rounded-full bg-[#0EA5E9]/15 blur-[50px]" />

            <div className="absolute inset-0 grid place-items-center pointer-events-none select-none overflow-hidden">
              <span
                className="text-[86px] md:text-[132px] font-black tracking-[-0.06em] leading-none opacity-[0.04]"
                style={{ fontFamily: "Space Grotesk, sans-serif", WebkitTextStroke: "1px #0A0A0A" as any }}
              >
                {isAr ? "الدراسات" : "AL-DRASAT"}
              </span>
            </div>

            <div className="relative p-6 md:p-8 lg:p-10">
              <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] font-bold px-3 py-1.5 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {t.heroKicker.toUpperCase()}
              </div>

              <h1 className="mt-4 font-black tracking-[-0.05em] leading-[0.88] text-[38px] md:text-[58px]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                <span className="block">{t.heroLine1}</span>
                <span className="block">
                  <span className="inline-block px-2 -mx-1 rounded-[10px] bg-[#FFD60A] rotate-[-0.8deg]">{t.heroLine2}</span>
                </span>
                <span className="block opacity-80">{t.heroLine3}</span>
              </h1>

              <p className="mt-4 max-w-[46ch] text-[13.5px] leading-7 opacity-70" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
                {t.heroDesc}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#programs" className="rounded-full bg-[#FF3B30] text-white px-6 py-3 text-[13px] font-bold hover:bg-[#E3342B] transition shadow-[0_10px_30px_rgba(255,59,48,0.25)]">
                  {t.ctaPrimary}
                </a>
                <a href="#campus" className="rounded-full bg-white border border-[#0A0A0A]/12 px-6 py-3 text-[13px] font-bold hover:bg-[#FFFBF0] transition">
                  {t.ctaGhost}
                </a>
              </div>

              <div className="mt-4 text-[11px] opacity-60 flex items-center gap-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="h-px w-8 bg-[#0A0A0A]/15 hidden md:block" />
                {t.micro}
              </div>
            </div>

            <div className="relative border-t border-[#0A0A0A]/10 bg-[#FFFBF0]/60 px-6 md:px-10 py-3 flex items-center gap-2 overflow-hidden">
              <span className="text-[11px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                LEVELS
              </span>
              <div className="flex items-center gap-1.5">
                {t.levels.map((lv, i) => (
                  <span
                    key={lv}
                    className="h-6 px-2 rounded-full border text-[11px] font-bold grid place-items-center"
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      background: i === 2 ? "#0A0A0A" : "white",
                      color: i === 2 ? "white" : "#0A0A0A",
                      borderColor: "rgba(10,10,10,0.12)",
                    }}
                  >
                    {lv}
                  </span>
                ))}
              </div>
              <span className="ms-auto hidden md:inline text-[11px] opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                A1 → C2 · placement in 20′
              </span>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
            <div className="rounded-[28px] bg-[#0A0A0A] text-white overflow-hidden border border-black shadow-[0_16px_50px_rgba(10,10,10,0.18)]">
              <div className="h-[44px] flex items-center justify-between px-5 border-b border-white/10">
                <span className="text-[11px] tracking-[0.16em] font-bold opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
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
                    <span className="shrink-0 h-9 w-9 rounded-xl bg-white text-[#0A0A0A] grid place-items-center text-[12px] font-black" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {row.t.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold leading-4 truncate">{row.title}</div>
                      <div className="text-[11px] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        {row.who}
                      </div>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: row.accent }} />
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <a href="#contact" className="w-full rounded-full bg-white text-[#0A0A0A] py-3 text-[13px] font-bold grid place-items-center hover:bg-[#FFFBF0] transition">
                  {isAr ? "احجز مقعد تجربة مجاني" : "Save a free trial seat"} →
                </a>
              </div>
            </div>

            <div className="rounded-[28px] bg-white border border-[#0A0A0A]/10 p-5 flex-1 shadow-sm">
              <div className="text-[11px] tracking-[0.16em] font-bold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                ATELIER PREVIEW
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { k: isAr ? "صوت" : "VOICE", v: "A1→C2", c: "#FF3B30" },
                  { k: isAr ? "كود" : "CODE", v: "</>", c: "#0EA5E9" },
                  { k: isAr ? "عمل" : "BIZ", v: "QR", c: "#FFD60A" },
                ].map((b) => (
                  <div key={b.k} className="rounded-2xl border border-[#0A0A0A]/10 p-3 text-center" style={{ background: b.c + "14" }}>
                    <div className="text-[11px] font-black" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {b.k}
                    </div>
                    <div className="mt-1 text-[16px] font-black" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
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

      <div className="mt-6 border-y border-[#0A0A0A]/10 bg-[#0A0A0A] text-white overflow-hidden">
        <div className="flex animate-[tape2_20s_linear_infinite] whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 ps-3" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {["Aleppo", "Languages", "Coding", "Networks", "Diplomas", "Placement Test"].map((w) => (
                <span key={w + i} className="inline-flex items-center gap-3">
                  <span className="text-[12px] tracking-[0.14em] font-bold opacity-90">{w.toUpperCase()}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FFD60A]" />
                </span>
              ))}
              <span className="text-[12px] tracking-[0.14em] font-bold opacity-40">— 1998 → NOW —</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF3B30]" />
            </div>
          ))}
        </div>
        <style>{`@keyframes tape2 { from { transform: translateX(0)} to { transform: translateX(-50%) } }`}</style>
      </div>

      <section id="programs" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8 md:mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[26px] md:text-[34px] font-black tracking-[-0.05em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {t.programsTitle}
          </h2>
          <p className="max-w-[44ch] text-[13px] leading-6 opacity-60">{t.programsSub}</p>
        </div>
        <div className="mt-6 grid grid-cols-12 gap-4 md:gap-6">
          {t.cards.map((c) => (
            <article key={c.k} className="col-span-12 md:col-span-4 rounded-[24px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-sm flex flex-col">
              <div className="h-2 w-full" style={{ background: c.dot }} />
              <div className="p-6 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-[#0A0A0A] text-white" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {c.n}
                  </span>
                  <span className="text-[11px] font-bold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {c.meta}
                  </span>
                </div>
                <h3 className="mt-3 text-[18px] font-black tracking-[-0.03em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  {c.k}
                </h3>
                <p className="mt-2 text-[13px] leading-6 opacity-70">{c.d}</p>
              </div>
              <div className="px-6 py-3 border-t border-[#0A0A0A]/10 bg-[#FFFBF0]/60 flex items-center justify-between">
                <span className="text-[11px] font-bold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {isAr ? "التسجيل حضوري" : "On-campus"}
                </span>
                <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="ateliers" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8">
        <div className="rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-sm">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-span-4 p-6 md:p-8 bg-[#FFD60A]/20 border-b lg:border-b-0 lg:border-e border-[#0A0A0A]/10">
              <div className="text-[11px] tracking-[0.18em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                ATELIERS
              </div>
              <h2 className="mt-2 text-[24px] font-black tracking-[-0.04em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {t.ateliersTitle}
              </h2>
              <p className="mt-2 text-[13px] leading-6 opacity-60">
                {isAr ? "لا محاضرات طويلة. 60 دقيقة تركيز، ثم تطبّق." : "No long lectures. 60 minutes focus, then you build."}
              </p>
            </div>
            <div className="col-span-12 lg:col-span-8 p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#FFFBF0]/40">
              {t.ateliers.map((a) => (
                <div key={a.k} className="rounded-2xl bg-white border border-[#0A0A0A]/10 p-5">
                  <div className="text-[11px] tracking-[0.16em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {a.k.toUpperCase()}
                  </div>
                  <div className="mt-1 text-[12px] font-bold px-2 py-1 rounded-full bg-[#0A0A0A] text-white inline-block" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {a.v}
                  </div>
                  <p className="mt-3 text-[12.5px] leading-5 opacity-60">{a.p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-[28px] bg-[#0A0A0A] text-white p-6 md:p-8 grid grid-cols-12 gap-6 border border-black">
          <div className="col-span-12 lg:col-span-7">
            <div className="text-[11px] tracking-[0.16em] font-bold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              VISIT
            </div>
            <h2 className="mt-2 text-[22px] md:text-[26px] font-black tracking-[-0.04em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              {t.contactTitle}
            </h2>
            <div className="mt-4 grid gap-2 text-[13px] leading-6 opacity-80">
              <div>📍 {t.address}</div>
              <div>🕘 {t.hours}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace" }}>☎ {t.phone}</div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-5 rounded-2xl bg-white text-[#0A0A0A] p-5">
            <div className="text-[12px] font-black" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {isAr ? "جرب حصة مجانًا" : "Try a class free"}
            </div>
            <p className="mt-1 text-[12.5px] leading-5 opacity-60">
              {isAr ? "احجز مقعدك — نرسل لك تأكيدًا بالوقت والقاعة." : "Save your seat — we send time & room confirmation."}
            </p>
            <a href="#contact" className="mt-4 w-full rounded-full bg-[#FF3B30] text-white py-3 text-[13px] font-bold grid place-items-center hover:bg-[#E3342B] transition">
              {isAr ? "احجز الآن" : "Book now"} →
            </a>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
        <div className="rounded-2xl bg-white border border-[#0A0A0A]/10 px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-[12px] opacity-70">{t.footer}</span>
          <span className="text-[11px] opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Aleppo — Voice · Code · Work
          </span>
        </div>
      </footer>
    </div>
  );
}
