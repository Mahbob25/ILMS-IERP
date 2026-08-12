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
      eyebrow: "حلب · منذ 1998 — لغات وعلوم حاسب",
      navPrograms: "البرامج",
      navCampus: "الحرم",
      navDiplomas: "الدبلومات",
      navContact: "تواصل",
      staffLogin: "دخول الكادر",
      hero1: "مستقبلٌ",
      hero2: "يُبنى",
      hero3: "كلمةً وسطرَ كودٍ.",
      heroDesc:
        "معهد الدراسات للغات وعلوم الحاسب في حلب. فصول صغيرة، مختبرات حقيقية، وشهادة يثق بها سوق العمل — من أول حرف حتى أول وظيفة.",
      ctaPrograms: "استعرض البرامج",
      ctaVisit: "زرنا في الحرم",
      helper: "التسجيل في المعهد حضوريًا · لا تسجيل ذاتي عبر الموقع",
      trustA: "26 عامًا",
      trustADesc: "من الخبرة",
      trustB: "8 طلاب",
      trustBDesc: "كحد أقصى في الشعبة",
      trustC: "100% مختبر",
      trustCDesc: "تطبيق يومي",
      tape: ["حلب", "لغات", "برمجة", "شبكات", "دبلومات", "شهادة معتمدة"],
      boardTitle: "لوحة الإعلانات — هذا الأسبوع",
      boardSub: "جدول حي من حرم المعهد",
      programsEyebrow: "البرامج — مسارات واضحة",
      programsTitle: "اختر مسارك، نحن نرتب الباقي",
      programsSub: "مستويات مرقمة، متابعة يومية، ومشروع تخرج يُعرض لا يُحفظ في الدرج.",
      cards: [
        {
          k: "اللغات",
          m: "A1 → C2 · 6 مستويات",
          d: "إنجليزية، فرنسية، وعربية لغير الناطقين. محادثة يومية، مختبر صوتي، واختبار تحديد مستوى مجاني.",
          accent: "#1E3A8A",
        },
        {
          k: "علوم الحاسب",
          m: "12 مساقًا · مختبر يومي",
          d: "برمجة، قواعد بيانات، شبكات وويب. كل وحدة تنتهي بمشروع يعمل — ليس عرض تقديمي.",
          accent: "#C8A96B",
        },
        {
          k: "الدبلومات المهنية",
          m: "180 ساعة · شهادة معتمدة",
          d: "محاسبة، إدارة أعمال، وسكرتارية تنفيذية. تدريب عملي وشهادة قابلة للتحقق برمز QR.",
          accent: "#E76F51",
        },
      ],
      campusEyebrow: "الحرم — كيف ندرّس",
      campusTitle: "فصل صغير. تركيز كبير.",
      campusDesc:
        "لا مدرجات مزدحمة. كل شعبة 6–8 طلاب، متابعة حضور يومية، وتقرير أسبوعي لولي الأمر أو للمتدرب نفسه.",
      pillars: [
        { n: "مجموعات صغيرة", h: "تسمع وتُسمع", p: "المعلم يعرف اسمك ونقطة ضعفك من الأسبوع الأول." },
        { n: "مختبر لا سبورة فقط", h: "تطبّق قبل أن تحفظ", p: "أجهزة، صوتيات، وسيرفرات محلية — تلمس ما تتعلمه." },
        { n: "شهادة تُتحقق", h: "ورقة تفتح بابًا", p: "رمز تحقق لكل شهادة، وسجل درجات لا يُزوَّر." },
      ],
      ctaBandTitle: "جاهز تبدأ؟",
      ctaBandDesc: "احجز اختبار تحديد مستوى مجاني — 20 دقيقة تعرف بها مكانك الحقيقي.",
      ctaBandBtn: "احجز الآن — مجانًا",
      contactEyebrow: "تواصل",
      contactTitle: "تعال وشاهد حصة قبل أن تسجل",
      address: "حلب — جانب مشفى الضبيط، بناء الدراسات — الطابق الثاني",
      hours: "السبت–الخميس · 8:30 — 19:30",
      phone: "021 — 123 4567",
      footer: "© معهد الدراسات — حلب. التسجيل حضوري. دخول النظام للكادر فقط.",
      lang: "English",
    },
    en: {
      eyebrow: "Aleppo · Since 1998 — Languages & Computing",
      navPrograms: "Programs",
      navCampus: "Campus",
      navDiplomas: "Diplomas",
      navContact: "Contact",
      staffLogin: "Staff login",
      hero1: "A future",
      hero2: "built",
      hero3: "word by word, line by line.",
      heroDesc:
        "Al-Drasat Institute for Languages & Computer Science in Aleppo. Small groups, real labs, certificates employers trust — from first word to first job.",
      ctaPrograms: "Explore programs",
      ctaVisit: "Visit campus",
      helper: "Enrolment is on-campus · No online self-registration",
      trustA: "26 years",
      trustADesc: "of teaching",
      trustB: "8 max",
      trustBDesc: "per section",
      trustC: "Daily lab",
      trustCDesc: "hands-on",
      tape: ["Aleppo", "Languages", "Coding", "Networks", "Diplomas", "Certified"],
      boardTitle: "Notice board — This week",
      boardSub: "Live from campus",
      programsEyebrow: "Programs — Clear tracks",
      programsTitle: "Pick your track, we handle the rest",
      programsSub: "Leveled, tracked daily, ending with a project you can demo — not file away.",
      cards: [
        {
          k: "Languages",
          m: "A1 → C2 · 6 levels",
          d: "English, French, Arabic for non-native. Daily conversation, audio lab and free placement test.",
          accent: "#1E3A8A",
        },
        {
          k: "Computer Science",
          m: "12 courses · daily lab",
          d: "Programming, databases, networks & web. Every unit ends with something that runs.",
          accent: "#C8A96B",
        },
        {
          k: "Professional Diplomas",
          m: "180 hrs · certified",
          d: "Accounting, management, executive secretarial. Practical training + QR-verifiable certificate.",
          accent: "#E76F51",
        },
      ],
      campusEyebrow: "Campus — How we teach",
      campusTitle: "Small room. Large focus.",
      campusDesc:
        "No crowded halls. 6–8 per section, daily attendance, weekly report to you or your guardian.",
      pillars: [
        { n: "Small groups", h: "You are heard", p: "Teacher knows your name and weak spot by week one." },
        { n: "Lab, not just board", h: "Build before you memorize", p: "Devices, audio labs and local servers — touch what you learn." },
        { n: "Verifiable certificate", h: "Paper that opens doors", p: "QR check for every certificate and a tamper-proof transcript." },
      ],
      ctaBandTitle: "Ready to start?",
      ctaBandDesc: "Book a free 20-minute placement test and know exactly where you stand.",
      ctaBandBtn: "Book free test",
      contactEyebrow: "Contact",
      contactTitle: "Come watch a class before you enrol",
      address: "Aleppo — Al-Drasat Building, 2nd floor, near Al-Dabbit Hospital",
      hours: "Sat–Thu · 08:30 — 19:30",
      phone: "021 — 123 4567",
      footer: "© Al-Drasat Institute — Aleppo. On-campus enrolment. System access for staff only.",
      lang: "العربية",
    },
  }[isAr ? "ar" : "en"];

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#F2F0E9] text-[#0F1B2E] selection:bg-[#1E3A8A] selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,700;9..144,0,800;9..144,1,700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>

      <div className="h-[3px] w-full bg-gradient-to-r from-[#1E3A8A] via-[#C8A96B] to-[#E76F51]" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F2F0E9]/85 border-b border-[#0F1B2E]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[60px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] bg-white border border-[#0F1B2E]/10 shadow-sm grid place-items-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="Al-Drasat" className="h-7 w-7 object-contain" />
            </div>
            <div className="leading-none">
              <div className="font-extrabold tracking-[-0.03em] text-[15px]" style={{ fontFamily: "Fraunces, serif" }}>
                AL-DRASAT <span className="font-normal text-[#1E3A8A]">INSTITUTE</span>
              </div>
              <div className="text-[10px] tracking-[0.16em] font-medium opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                ALEPPO · SINCE 1998
              </div>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-[13px] font-medium">
            <a href="#programs" className="opacity-70 hover:opacity-100 transition">
              {t.navPrograms}
            </a>
            <a href="#campus" className="opacity-70 hover:opacity-100 transition">
              {t.navCampus}
            </a>
            <a href="#diplomas" className="opacity-70 hover:opacity-100 transition">
              {t.navDiplomas}
            </a>
            <a href="#contact" className="opacity-70 hover:opacity-100 transition">
              {t.navContact}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={goLang}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-white border border-[#0F1B2E]/12 hover:border-[#0F1B2E]/20 transition"
            >
              {t.lang}
            </button>
            <button
              onClick={goLogin}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-4 py-2 rounded-full bg-[#0F1B2E] text-white hover:bg-black transition shadow-sm"
            >
              {t.staffLogin} <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1280px] px-4 md:px-6 pt-6 md:pt-8">
        <div className="grid grid-cols-12 gap-4 md:gap-6 items-stretch">
          <div className="col-span-12 lg:col-span-7 relative overflow-hidden rounded-[24px] bg-[#0F1B2E] text-[#F2F0E9] border border-[#0F1B2E] shadow-[0_20px_60px_rgba(15,27,46,0.25)]">
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="absolute -top-24 -end-24 h-[420px] w-[420px] rounded-full bg-[#1E3A8A]/25 blur-[50px]" />
            <div className="absolute -bottom-32 -start-32 h-[520px] w-[520px] rounded-full bg-[#C8A96B]/15 blur-[60px]" />

            <div className="absolute top-0 bottom-0 start-0 hidden md:flex w-[44px] border-e border-white/10 bg-white/[0.03] items-center justify-center py-6">
              <span
                className="rotate-180 text-[11px] tracking-[0.28em] font-medium opacity-60"
                style={{ writingMode: "vertical-rl", fontFamily: "JetBrains Mono, monospace" }}
              >
                AL-DRASAT INSTITUTE — SINCE 1998 — ALEPPO
              </span>
            </div>

            <div className="relative p-6 md:p-10 md:ps-[68px]">
              <div
                className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] font-semibold px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#E76F51] animate-pulse" />
                {t.eyebrow}
              </div>

              <h1
                className="mt-5 font-[800] leading-[0.9] tracking-[-0.05em] text-[36px] md:text-[56px]"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                <span className="block">{t.hero1}</span>
                <span className="block italic font-[700] text-[#C8A96B]">{t.hero2}</span>
                <span className="block">{t.hero3}</span>
              </h1>

              <p
                className="mt-4 max-w-[52ch] text-[13.5px] md:text-[14.5px] leading-7 text-[#F2F0E9]/80"
                style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter, sans-serif" : "Inter, sans-serif" }}
              >
                {t.heroDesc}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#programs"
                  className="inline-flex items-center gap-2 rounded-full bg-[#F2F0E9] text-[#0F1B2E] px-5 py-2.5 text-[13px] font-bold hover:bg-white transition"
                >
                  {t.ctaPrograms} <span aria-hidden>↗</span>
                </a>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-full bg-transparent border border-white/20 text-white px-5 py-2.5 text-[13px] font-semibold hover:bg-white/10 transition"
                >
                  {t.ctaVisit}
                </a>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3 max-w-[560px]">
                {[
                  { v: t.trustA, k: t.trustADesc },
                  { v: t.trustB, k: t.trustBDesc },
                  { v: t.trustC, k: t.trustCDesc },
                ].map((s) => (
                  <div key={s.v} className="rounded-[14px] bg-white/[0.06] border border-white/10 p-3 backdrop-blur">
                    <div className="text-[15px] font-extrabold tracking-[-0.03em]" style={{ fontFamily: "Fraunces, serif" }}>
                      {s.v}
                    </div>
                    <div className="text-[11px] leading-4 opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {s.k}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 text-[11px] tracking-wide opacity-60 flex items-center gap-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="h-px w-8 bg-white/20 hidden md:block" />
                {t.helper}
              </div>
            </div>

            <div className="relative h-[36px] border-t border-white/10 bg-white/[0.04] flex items-center overflow-hidden">
              <div className="absolute inset-y-0 start-0 w-[68px] hidden md:block border-e border-white/10 bg-white/[0.03]" />
              <div
                className="ps-4 md:ps-[68px] flex items-center gap-4 text-[11px] whitespace-nowrap"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                <span className="opacity-60">CAMPUS</span>
                <span className="opacity-30">·</span>
                <span className="opacity-80">LEVELS A1—C2</span>
                <span className="opacity-30">·</span>
                <span className="opacity-80">LAB DAILY</span>
                <span className="opacity-30">·</span>
                <span className="opacity-80">QR CERT</span>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <div className="relative rounded-[24px] bg-white border border-[#0F1B2E]/10 shadow-[0_20px_60px_rgba(15,27,46,0.10)] overflow-hidden h-full">
              <div className="absolute top-0 start-0 end-0 h-[3px] bg-gradient-to-r from-[#C8A96B] via-[#E76F51] to-[#1E3A8A] opacity-80" />
              <div className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] tracking-[0.18em] font-semibold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {t.boardSub.toUpperCase()}
                    </div>
                    <h2 className="mt-1 text-[18px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
                      {t.boardTitle}
                    </h2>
                  </div>
                  <span className="hidden sm:inline-flex h-8 w-8 rounded-full bg-[#F2F0E9] border border-[#0F1B2E]/10 grid place-items-center text-[10px] font-bold">
                    PIN
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {[
                    { time: "08:30", room: isAr ? "قاعة A · إنجليزية B1" : "Room A · English B1", teacher: isAr ? "أ. ليلى" : "Ms. Layla" },
                    { time: "11:00", room: isAr ? "مخبر 2 · بايثون أساسيات" : "Lab 2 · Python Basics", teacher: isAr ? "م. كرم" : "Eng. Karam" },
                    { time: "15:30", room: isAr ? "قاعة C · محاسبة 1" : "Room C · Accounting I", teacher: isAr ? "أ. سارة" : "Ms. Sara" },
                  ].map((row) => (
                    <div
                      key={row.time}
                      className="relative rounded-[16px] bg-[#F2F0E9]/70 border border-[#0F1B2E]/10 px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <span className="absolute -top-1.5 start-6 h-2 w-2 rounded-full bg-[#C8A96B] border border-white shadow-sm" aria-hidden />
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-[#0F1B2E] text-white"
                          style={{ fontFamily: "JetBrains Mono, monospace" }}
                        >
                          {row.time}
                        </span>
                        <span className="text-[13px] font-semibold leading-4">{row.room}</span>
                      </div>
                      <span className="text-[11px] opacity-60 whitespace-nowrap" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        {row.teacher}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[14px] bg-[#0F1B2E] text-[#F2F0E9] px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic" : "Inter" }}>
                    {isAr ? "جلسة تجريبية مجانية — احضر وشاهد" : "Free trial class — come and see"}
                  </span>
                  <a
                    href="#contact"
                    className="shrink-0 rounded-full bg-[#C8A96B] text-[#0F1B2E] px-3 py-1.5 text-[11px] font-bold hover:bg-[#E8C99A] transition"
                  >
                    {isAr ? "احجز مقعدًا" : "Save a seat"}
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <div className="mt-6 border-y border-[#0F1B2E]/10 bg-white/60 backdrop-blur overflow-hidden">
        <div className="flex animate-[tape_22s_linear_infinite] whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 ps-3" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {t.tape.map((w) => (
                <span key={w + i} className="inline-flex items-center gap-3">
                  <span className="text-[12px] tracking-[0.14em] font-semibold opacity-70">{w.toUpperCase()}</span>
                  <span className="h-1 w-1 rounded-full bg-[#C8A96B]" />
                </span>
              ))}
              <span className="text-[12px] tracking-[0.14em] font-semibold opacity-30">— AL-DRASAT —</span>
              <span className="h-1 w-1 rounded-full bg-[#E76F51]" />
            </div>
          ))}
        </div>
        <style>{`@keyframes tape { from { transform: translateX(0)} to { transform: translateX(-50%) } } @media (prefers-reduced-motion: reduce){ div[style*="tape"]{ animation:none !important } }`}</style>
      </div>

      <section id="programs" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8 md:mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.2em] font-semibold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {t.programsEyebrow}
            </div>
            <h2 className="mt-2 text-[26px] md:text-[34px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
              {t.programsTitle}
            </h2>
          </div>
          <p className="max-w-[48ch] text-[13px] leading-6 opacity-60" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
            {t.programsSub}
          </p>
        </div>

        <div id="diplomas" className="mt-6 grid grid-cols-12 gap-4 md:gap-6">
          {t.cards.map((c, idx) => (
            <article
              key={c.k}
              className="col-span-12 md:col-span-4 rounded-[22px] bg-white border border-[#0F1B2E]/10 overflow-hidden shadow-[0_12px_40px_rgba(15,27,46,0.06)] flex flex-col"
            >
              <div className="h-[8px] w-full" style={{ background: c.accent }} />
              <div className="p-6 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-bold px-2 py-1 rounded-full border"
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      background: idx === 0 ? "#EFF3FF" : idx === 1 ? "#FFF7E6" : "#FFF0EE",
                      borderColor: idx === 0 ? "#C7D5FF" : idx === 1 ? "#F2D9A6" : "#FFC8BE",
                      color: "#0F1B2E",
                    }}
                  >
                    0{idx + 1} · FILE
                  </span>
                  <span className="text-[11px] opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {c.m}
                  </span>
                </div>
                <h3 className="mt-3 text-[18px] font-extrabold tracking-[-0.03em]" style={{ fontFamily: "Fraunces, serif" }}>
                  {c.k}
                </h3>
                <p className="mt-2 text-[13px] leading-6 opacity-70" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
                  {c.d}
                </p>
              </div>
              <div className="h-[42px] border-t border-[#0F1B2E]/10 bg-[#F2F0E9]/60 flex items-center justify-between px-5 text-[11px]" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="opacity-60">{isAr ? "التسجيل حضوري" : "On-campus enrolment"}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: c.accent }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="campus" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8 md:mt-10">
        <div className="rounded-[24px] overflow-hidden border border-[#0F1B2E]/10 bg-white shadow-[0_12px_40px_rgba(15,27,46,0.06)]">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-span-5 bg-[#0F1B2E] text-[#F2F0E9] p-6 md:p-8 relative overflow-hidden">
              <div className="absolute -top-20 -end-20 h-[360px] w-[360px] rounded-full bg-[#1E3A8A]/20 blur-[40px]" />
              <div className="relative">
                <div className="text-[11px] tracking-[0.18em] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {t.campusEyebrow.toUpperCase()}
                </div>
                <h2 className="mt-2 text-[24px] md:text-[30px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
                  {t.campusTitle}
                </h2>
                <p className="mt-3 text-[13px] leading-6 opacity-70 max-w-[42ch]">{t.campusDesc}</p>
                <div className="mt-6 rounded-[14px] bg-white/[0.06] border border-white/10 overflow-hidden">
                  {[
                    [isAr ? "6–8" : "6–8", isAr ? "طلاب في الشعبة" : "Students per section", ""],
                    [isAr ? "يوميًا" : "Daily", isAr ? "متابعة حضور" : "Attendance", ""],
                    [isAr ? "أسبوعيًا" : "Weekly", isAr ? "تقرير مستوى" : "Progress report", ""],
                  ].map((r) => (
                    <div key={r.join("")} className="flex items-center justify-between px-4 py-3 border-b last:border-0 border-white/10 text-[12px]">
                      <span className="opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        {r[0]}
                      </span>
                      <span className="font-semibold">{r[1]}</span>
                      <span className="hidden sm:block opacity-60 text-[11px]">{r[2]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-7 p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#F2F0E9]/40">
              {t.pillars.map((o) => (
                <div key={o.n} className="rounded-[16px] bg-white border border-[#0F1B2E]/10 p-5 flex flex-col">
                  <div className="text-[11px] tracking-[0.16em] font-bold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {o.n.toUpperCase()}
                  </div>
                  <div className="mt-2 font-extrabold tracking-[-0.03em]" style={{ fontFamily: "Fraunces, serif" }}>
                    {o.h}
                  </div>
                  <p className="mt-2 text-[12.5px] leading-5 opacity-60">{o.p}</p>
                  <div className="mt-4 h-px bg-[#0F1B2E]/10" />
                  <div className="mt-3 text-[11px] flex items-center gap-1.5 opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1E3A8A]" />
                    {isAr ? "في الحرم" : "On campus"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-[24px] bg-[#0F1B2E] text-white p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-white/10">
          <div>
            <h3 className="text-[22px] font-extrabold tracking-[-0.03em]" style={{ fontFamily: "Fraunces, serif" }}>
              {t.ctaBandTitle}
            </h3>
            <p className="mt-1 text-[13px] opacity-70 max-w-[50ch]">{t.ctaBandDesc}</p>
          </div>
          <a href="#contact" className="shrink-0 rounded-full bg-[#C8A96B] text-[#0F1B2E] px-6 py-3 text-[13px] font-bold hover:bg-[#E8C99A] transition">
            {t.ctaBandBtn}
          </a>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6">
        <div className="rounded-[24px] bg-white border border-[#0F1B2E]/10 p-6 md:p-8">
          <div>
            <div className="text-[11px] tracking-[0.18em] font-semibold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {t.contactEyebrow.toUpperCase()}
            </div>
            <h2 className="mt-2 text-[22px] md:text-[26px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
              {t.contactTitle}
            </h2>
            <div className="mt-4 grid gap-2 text-[13px] leading-6">
              <div className="flex gap-2">
                <span className="opacity-50">📍</span> <span>{t.address}</span>
              </div>
              <div className="flex gap-2">
                <span className="opacity-50">🕘</span> <span>{t.hours}</span>
              </div>
              <div className="flex gap-2">
                <span className="opacity-50">☎</span> <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{t.phone}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
        <div className="rounded-[18px] bg-[#0F1B2E] text-[#F2F0E9]/80 px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-3 border border-white/10">
          <span className="text-[12px] tracking-wide" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
            {t.footer}
          </span>
          <span className="text-[11px] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            Aleppo — Learn · Build · Certify
          </span>
        </div>
      </footer>
    </div>
  );
}
