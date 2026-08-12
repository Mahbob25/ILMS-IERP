"use client";

import { useParams, useRouter } from "next/navigation";

export default function LandingPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const goLogin = () => router.push(`/${locale}/login`);
  const goLang = () => router.push(`/${isAr ? "en" : "ar"}`);

  const t = {
    ar: {
      navAI: "الذكاء الاصطناعي",
      pill: "معهد الدراسات · حلب — لغات وعلوم حاسب وذكاء اصطناعي",
      navPrograms: "البرامج",
      navAteliers: "الورش",
      navCampus: "الحرم",
      navContact: "العنوان",
      staffLogin: "دخول الكادر",
      heroKicker: "مستوى واحد في كل مرة",
      heroLine1: "تتعلّم",
      heroLine2: "بمساعدة الذكاء الإصطناعي",
      heroLine3: "وتطبّق في نفس اليوم.",
      heroDesc: "فصول 8 طلاب، مختبر يومي، ومساعد ذكاء اصطناعي يرافقك — يصحح نطقك، يراجع كودك، ويبني لك خطة مراجعة. في تعز منذ 1998، بعقل جديد.",
      ctaPrimary: "شاهد البرامج",
      ctaGhost: "جولة في الحرم →",
      micro: "التسجيل حضوري فقط · اختبار تحديد مستوى مجاني",
      liveLabel: "مباشر من الحرم",
      liveCardTitle: "جدول اليوم",
      levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
      programsEyebrow: "البرامج",
      programsTitle: "اختر ما تريد أن تتقنه",
      programsSub: "قائمة مفتوحة — نضيف مسارات جديدة كل فصل. كل برنامج له ورشة، مشروع، وشهادة تُتحقّق.",
      programs: [
        { id: "languages", k: "اللغات", d: "محادثة يومية ومخبر صوتي — من الحروف إلى المناظرة.", meta: "A1 → C2" },
        { id: "computing", k: "علوم الحاسب", d: "بايثون، قواعد بيانات، شبكات وويب — تبني شيئًا يعمل كل أسبوع.", meta: "12 مساقًا" },
        { id: "ai", k: "الذكاء الاصطناعي", d: "أساسيات عملية — أدوات، بيانات، ومشاريع يمكنك عرضها.", meta: "جديد" },
        { id: "diplomas", k: "الدبلومات", d: "محاسبة وإدارة وسكرتارية — حالات واقعية وملف إنجاز.", meta: "180 ساعة" },
      ],
      ateliersTitle: "الورش — حيث يحدث التعلّم",
      ateliers: [
        { k: "مختبر الصوت", v: "60 دقيقة يوميًا", p: "سماعات، تسجيل، وتصحيح نطق فوري. تتكلم أكثر مما تكتب." },
        { k: "مختبر الكود", v: "حاسوب لكل طالب", p: "بيئة حقيقية، سيرفر محلي، ومشروع يُرفع على رابط." },
        { k: "ورشة الأعمال", v: "حالات واقعية", p: "فواتير، ميزانيات، ومراسلات — كما في الشركة." },
      ],
      contactTitle: "تعال وشاهد حصة",
      address: "تعز — اليمن — معهد الدراسات",
      hours: "السبت – الخميس · 08:30 — 19:30",
      phone: "04 — 123 456",
      footer: "© معهد الدراسات — تعز. التسجيل حضوري.",
      lang: "English",
    },
    en: {
      navAI: "AI",
      pill: "Al-Drasat · Aleppo — Languages, Computing & AI",
      navPrograms: "Programs",
      navAteliers: "Ateliers",
      navCampus: "Campus",
      navContact: "Visit",
      staffLogin: "Staff login",
      heroKicker: "One level at a time",
      heroLine1: "Learn it",
      heroLine2: "with AI",
      heroLine3: "ship it same day.",
      heroDesc:
        "8 max per section, daily lab, QR-verifiable certificate — plus an AI companion that tunes your pronunciation, reviews your code, and builds your revision plan. Since 1998, now AI-forward.",
      ctaPrimary: "See programs",
      ctaGhost: "Tour campus →",
      micro: "On-campus enrolment · Free placement test",
      liveLabel: "Live from campus",
      liveCardTitle: "Today",
      levels: ["A1", "A2", "B1", "B2", "C1", "C2"],
      programsEyebrow: "Programs",
      programsTitle: "Choose what you want to master",
      programsSub: "Open list — we add tracks each term. Every program has an atelier, a project, and a verifiable certificate.",
      programs: [
        { id: "languages", k: "Languages", d: "Daily conversation & audio lab — letters to debate.", meta: "A1 → C2" },
        { id: "computing", k: "Computing", d: "Python, DB, networks & web — ship something every week.", meta: "12 courses" },
        { id: "ai", k: "Artificial Intelligence", d: "Practical AI — tools, data and projects you can demo.", meta: "New" },
        { id: "diplomas", k: "Diplomas", d: "Accounting, management, secretarial — real cases & portfolio.", meta: "180 hrs" },
      ],
      ateliersTitle: "Ateliers — where learning happens",
      ateliers: [
        { k: "Sound Lab", v: "60 min daily", p: "Headsets, recording, instant correction. You speak more than you write." },
        { k: "Code Lab", v: "1 machine per student", p: "Real env, local server, deploy link for your project." },
        { k: "Business Atelier", v: "Real cases", p: "Invoices, budgets, letters — as in a company." },
      ],
      contactTitle: "Come watch a class",
      address: "Taiz — Yemen — Al-Drasat Institute",
      hours: "Sat–Thu · 08:30 — 19:30",
      phone: "04 — 123 456",
      footer: "© Al-Drasat Institute — Taiz. On-campus enrolment.",
      lang: "العربية",
    },
  }[isAr ? "ar" : "en"];

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#FFFBF0] text-[#0A0A0A] selection:bg-[#FF3B30] selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');" }} />

      <header className="sticky top-0 z-40 bg-[#FFFBF0]/85 backdrop-blur-xl border-b border-[#0A0A0A]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[64px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] bg-white border border-[#0A0A0A]/10 grid place-items-center overflow-hidden shrink-0 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="Al-Drasat" className="h-full w-full object-contain" />
            </div>
            <div className="leading-none hidden sm:block">
              <div className="font-bold tracking-[-0.04em] text-[14px]" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, sans-serif" : "Space Grotesk, sans-serif" }}>
                {isAr ? "معهد الدراسات" : "AL-DRASAT"}
              </div>
              <div className="text-[10px] tracking-[0.14em] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
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
        <div className="grid grid-cols-12 gap-4 md:gap-6 items-stretch">
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
                <a href={`/${locale}/book`} className="w-full rounded-full bg-white text-[#0A0A0A] py-3 text-[13px] font-bold grid place-items-center hover:bg-[#FFFBF0] transition">
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

      <div className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-2xl border border-[#0A0A0A]/10 bg-[#0A0A0A] text-white overflow-hidden">
          <div className="overflow-hidden">
            <div className="flex w-max animate-[tape2_20s_linear_infinite] will-change-transform whitespace-nowrap">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} aria-hidden={i !== 0} className="flex items-center gap-3 py-3 ps-3 shrink-0" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {(isAr ? ["تعز", "لغات", "برمجة", "شبكات", "دبلومات", "اختبار تحديد مستوى"] : ["Taiz", "Languages", "Coding", "Networks", "Diplomas", "Placement Test"]).map((w) => (
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
              <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/15" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFD60A] animate-pulse" /> {isAr ? "AI · مساعدك في التعلّم" : "AI · YOUR LEARNING COMPANION"}
              </div>
              <h2 className="mt-3 text-[24px] md:text-[28px] font-black tracking-[-0.05em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {isAr ? "ذكاء يساعدك تتعلّم أسرع" : "AI that helps you learn faster"}
              </h2>
              <p className="mt-2 text-[13px] leading-6 opacity-70">
                {isAr ? "ليس بديلًا عن المعلّم — بل مساعد يومي يرافقك بعد الحصة. يصحح، يراجع، ويذكّرك بما تحتاج." : "Not replacing the teacher — a daily companion after class. It corrects, reviews, and reminds you what matters."}
              </p>
              <div className="mt-4 text-[11px] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
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
                  <div className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>{c.k.toUpperCase()}</div>
                  <p className="mt-2 text-[12.5px] leading-5 opacity-70">{c.p}</p>
                </div>
              ))}
              <div className="sm:col-span-3 rounded-2xl bg-[#FFD60A] text-[#0A0A0A] px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>{isAr ? "قريبًا: مساعد دراسة بالعربية" : "Soon: Arabic study assistant"}</span>
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
                  <span className="text-[11px] tracking-[0.18em] font-black opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {(t as any).programsEyebrow.toUpperCase()} — 04 TRACKS
                  </span>
                  <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFD60A] border border-[#0A0A0A]/10" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {isAr ? "التسجيل مفتوح" : "OPEN ENROLMENT"}
                  </span>
                </div>
                <h2 className="mt-3 text-[26px] md:text-[34px] font-black tracking-[-0.05em] leading-[0.9]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  {t.programsTitle}
                </h2>
              </div>
              <p className="max-w-[42ch] text-[13.5px] leading-6 opacity-60 lg:text-end lg:pb-1" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
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
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        0{i + 1}
                      </span>
                      <div className="p-6 md:p-7 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className={`h-11 w-11 rounded-[14px] ${styles.iconBg} text-white grid place-items-center shrink-0 shadow-sm`}>
                            {icons}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="hidden sm:inline text-[10px] tracking-[0.14em] font-black px-2.5 py-1 rounded-full bg-[#0A0A0A] text-white" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                              {styles.label}
                            </span>
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-white" style={{ fontFamily: "JetBrains Mono, monospace", borderColor: styles.accent + "22", background: styles.tint }}>
                              {p.meta}
                            </span>
                          </div>
                        </div>

                        <div className="mt-5">
                          <h3 className="text-[19px] md:text-[20px] font-black tracking-[-0.04em] leading-none flex items-center gap-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                            {p.k}
                            <span className="h-6 w-6 rounded-full bg-[#0A0A0A] text-white grid place-items-center text-[12px] opacity-0 group-hover:opacity-100 translate-x-[-4px] group-hover:translate-x-0 transition-all duration-300">
                              →
                            </span>
                          </h3>
                          <p className="mt-2.5 text-[13.5px] leading-6 opacity-60 line-clamp-2" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>{p.d}</p>
                        </div>

                        <div className="mt-5 flex items-center gap-2 text-[11px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                          <span className="h-px flex-1 bg-[#0A0A0A]/10 group-hover:bg-[#0A0A0A]/15 transition" />
                          <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10 group-hover:bg-[#0A0A0A] group-hover:text-white group-hover:border-[#0A0A0A] transition">
                            {isAr ? "استكشف" : "Explore"} <span className="group-hover:translate-x-0.5 transition">→</span>
                          </span>
                        </div>

                        <div className="mt-3 flex items-center gap-1.5 text-[10px] tracking-[0.08em] font-bold opacity-30" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                          <span className="h-1 w-1 rounded-full" style={{ background: styles.accent }} /> {isAr ? "ورشة · مشروع · شهادة QR" : "ATELIER · PROJECT · QR CERT"}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="mx-3 md:mx-4 mb-3 md:mb-4 rounded-2xl bg-white border border-[#0A0A0A]/10 px-4 md:px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <span className="inline-flex items-center gap-2 font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" /> {isAr ? "نضيف مسارات جديدة كل فصل — اسأل عن القادم" : "New tracks each term — ask about next intake"}
              </span>
              <span className="opacity-40 hidden sm:inline" style={{ fontFamily: "JetBrains Mono, monospace" }}>
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
            <a href={`/${locale}/book`} className="mt-4 w-full rounded-full bg-[#FF3B30] text-white py-3 text-[13px] font-bold grid place-items-center hover:bg-[#E3342B] transition">
              {isAr ? "احجز الآن" : "Book now"} →
            </a>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
        <div className="rounded-2xl bg-white border border-[#0A0A0A]/10 px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-[12px] opacity-70">{t.footer}</span>
          <span className="text-[11px] opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Taiz — Voice · Code · Work
          </span>
        </div>
      </footer>
    </div>
  );
}
