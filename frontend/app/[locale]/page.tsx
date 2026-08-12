"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { sanitizeInput } from "@/lib/utils/input";

export default function LandingPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const t = {
    ar: {
      eyebrow: "معهد الدراسات — سجل حي",
      navRegistry: "السجل",
      navPrograms: "البرامج",
      navOperations: "التشغيل",
      staffAccess: "دخول الكادر",
      heroTitle1: "تعلّمٌ",
      heroTitle2: "يُدوَّن،",
      heroTitle3: "لا يُقال.",
      heroDesc:
        "معهد الدراسات واللغات وعلوم الحاسب. نظام واحد يدير القبول، الشعب، الحضور، والمال — بنفس دقة دفتر الدرجات الورقي، بسرعة نظام حديث.",
      ctaExplore: "استعرض البرامج",
      helper: "لست طالبًا؟ الدخول مخصص للكادر فقط — بدون تسجيل ذاتي.",
      fieldEmail: "البريد المؤسسي",
      fieldPass: "كلمة المرور",
      signIn: "دخول السجل",
      signing: "جاري المطابقة...",
      noRegistration: "لا يوجد تسجيل ذاتي · اطلب حسابك من الإدارة",
      errFill: "أدخل البريد وكلمة المرور.",
      errAuth: "بيانات الدخول غير صحيحة.",
      trust1: "سجل حضور مختوم",
      trust2: "دفتر مالي مُقفَل يوميًا",
      trust3: "شهادة قابلة للتحقق",
      tape: ["قبول", "شُعب", "حضور", "درجات", "مدفوعات", "إغلاق يومي", "شهادات"],
      programsTitle: "برامج تُدرَّس كما تُدار",
      programsSub: "كل برنامج هو سجل مفتوح — مناهج، شعب، حضــور، ودرجات في مكان واحد.",
      cards: [
        { k: "اللغات", d: "إنجليزية، فرنسية، عربية لغير الناطقين — مستويات مرقمة ودفاتر متابعة يومية.", m: "A1 → C2 · 6 مستويات" },
        { k: "علوم الحاسب", d: "برمجة، شبكات، قواعد بيانات — مشاريع مختومة وتقييم بالأكواد لا بالانطباع.", m: "12 مساقًا · مختبر يومي" },
        { k: "الدبلومات المهنية", d: "محاسبة، إدارة، سكرتارية — إغلاق مالي يومي ومحفظة مدرب شفافة.", m: "180 ساعة · شهادة معتمدة" },
      ],
      opsTitle: "الدفتر هو النظام",
      opsDesc: "لا لوحات مبهرجة. كل عملية هي سطر في الدفتر — موقع، مسؤول، وختم زمني.",
      ops: [
        { n: "قيد", h: "التسجيل سطرٌ لا يُمحى", p: "كل طالب قيد برقم، شعبة، وخطة دفع. التعديل يترك أثرًا." },
        { n: "حضور", h: "الحضور ختم يومي", p: "غياب بعذر، تأخير، وإنذار — يظهر في تقرير الطالب فورًا." },
        { n: "مالية", h: "المال مُقفَل كل مساء", p: "مدفوعات، مصروفات، إغلاق يومي، ومطابقة — لا أرقام طائرة." },
      ],
      location: "حلب · سجل منذ 1998",
      footer: "© معهد الدراسات — نظام ERP داخلي. الدخول للكادر المصرّح فقط.",
      lang: "English",
    },
    en: {
      eyebrow: "Al-Drasat — Live Registry",
      navRegistry: "Registry",
      navPrograms: "Programs",
      navOperations: "Operations",
      staffAccess: "Staff access",
      heroTitle1: "Learning",
      heroTitle2: "that is",
      heroTitle3: "logged.",
      heroDesc:
        "Institute of Studies, Languages & Computer Science. One ledger for admissions, sections, attendance and finance — as precise as a paper gradebook, as fast as modern software.",
      ctaExplore: "Explore programs",
      helper: "Not a student? Access is staff-only — no self-registration.",
      fieldEmail: "Work email",
      fieldPass: "Password",
      signIn: "Enter registry",
      signing: "Verifying…",
      noRegistration: "No self-registration · Ask admin for an account",
      errFill: "Enter email and password.",
      errAuth: "Invalid credentials.",
      trust1: "Stamped attendance",
      trust2: "Daily financial close",
      trust3: "Verifiable certificate",
      tape: ["Admissions", "Sections", "Attendance", "Grades", "Payments", "Daily close", "Certificates"],
      programsTitle: "Programs taught like they are run",
      programsSub: "Every program is an open ledger — curricula, sections, attendance and grades in one place.",
      cards: [
        { k: "Languages", d: "English, French, Arabic for non-native — leveled tracks with daily follow-up ledgers.", m: "A1 → C2 · 6 levels" },
        { k: "Computer Science", d: "Programming, networks, databases — stamped projects and code-based assessment.", m: "12 courses · daily lab" },
        { k: "Professional Diplomas", d: "Accounting, management, secretarial — daily close and transparent teacher wallet.", m: "180 hrs · certified" },
      ],
      opsTitle: "The ledger is the system",
      opsDesc: "No dashboards for show. Every action is a ledger line — place, owner, timestamp.",
      ops: [
        { n: "Enroll", h: "Enrollment never erases", p: "Each student is a number, section and payment plan. Edits leave a trace." },
        { n: "Attend", h: "Attendance is a daily stamp", p: "Absences, lates, warnings — reflected instantly in the student report." },
        { n: "Close", h: "Money closes every evening", p: "Payments, expenses, daily close, reconciliation — no floating numbers." },
      ],
      location: "Aleppo · Registry since 1998",
      footer: "© Al-Drasat Institute — Internal ERP. Authorized staff only.",
      lang: "العربية",
    },
  }[isAr ? "ar" : "en"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError(t.errFill);
      return;
    }
    setSubmitting(true);
    try {
      await login(sanitizeInput(email), password);
      router.replace(`/${locale}/dashboard`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 401) setError(t.errAuth);
      else if (Array.isArray(detail)) setError(detail.map((d: any) => d.msg).join("; ") || t.errAuth);
      else setError(detail || t.errAuth);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#F2F0E9] text-[#0F1B2E] selection:bg-[#1E3A8A] selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,600;9..144,0,700;9..144,0,800;9..144,1,700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>

      {/* Top hairline */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#1E3A8A] via-[#C8A96B] to-[#E76F51]" />

      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F2F0E9]/80 border-b border-[#0F1B2E]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[56px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] bg-white border border-[#0F1B2E]/10 shadow-sm grid place-items-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="Al-Drasat" className="h-7 w-7 object-contain" />
            </div>
            <div className="leading-none">
              <div className="font-extrabold tracking-[-0.03em] text-[15px]" style={{ fontFamily: "Fraunces, serif" }}>
                AL-DRASAT <span className="font-normal text-[#1E3A8A]">ERP</span>
              </div>
              <div className="text-[10px] tracking-[0.16em] font-medium opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                INSTITUTE · ALEPPO
              </div>
            </div>
            <span className="hidden md:inline-flex ms-3 text-[11px] px-2.5 py-1 rounded-full bg-[#0F1B2E] text-[#F2F0E9] border border-[#0F1B2E] tracking-wide" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {t.location}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium">
            <a href="#registry" className="opacity-70 hover:opacity-100 transition">
              {t.navRegistry}
            </a>
            <a href="#programs" className="opacity-70 hover:opacity-100 transition">
              {t.navPrograms}
            </a>
            <a href="#ops" className="opacity-70 hover:opacity-100 transition">
              {t.navOperations}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/${isAr ? "en" : "ar"}`)}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-white border border-[#0F1B2E]/12 hover:border-[#0F1B2E]/20 transition"
            >
              {t.lang}
            </button>
            <a
              href="#access"
              className="hidden sm:inline-flex text-[12px] font-bold px-4 py-2 rounded-full bg-[#0F1B2E] text-white hover:bg-black transition shadow-sm"
            >
              {t.staffAccess} →
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-[1280px] px-4 md:px-6 pt-6 md:pt-8">
        <div className="grid grid-cols-12 gap-4 md:gap-6 items-stretch">
          {/* Left: Thesis */}
          <div className="col-span-12 lg:col-span-7 relative overflow-hidden rounded-[24px] bg-[#0F1B2E] text-[#F2F0E9] border border-[#0F1B2E] shadow-[0_20px_60px_rgba(15,27,46,0.25)]">
            {/* subtle grid + paper fiber */}
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="absolute -top-24 -end-24 h-[420px] w-[420px] rounded-full bg-[#1E3A8A]/30 blur-[50px]" />
            <div className="absolute -bottom-32 -start-32 h-[520px] w-[520px] rounded-full bg-[#C8A96B]/20 blur-[60px]" />

            {/* vertical spine */}
            <div className="absolute top-0 bottom-0 start-0 hidden md:flex w-[44px] border-e border-white/10 bg-white/[0.03] items-center justify-center py-6">
              <span
                className="rotate-180 text-[11px] tracking-[0.28em] font-medium opacity-60"
                style={{ writingMode: "vertical-rl", fontFamily: "JetBrains Mono, monospace" }}
              >
                AL-DRASAT — REGISTRY № 1998 — ALEPPO
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
                className="mt-5 font-[800] leading-[0.9] tracking-[-0.05em] text-[38px] md:text-[62px]"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                <span className="block">{t.heroTitle1}</span>
                <span className="block italic font-[700] text-[#C8A96B]">{t.heroTitle2}</span>
                <span className="block">{t.heroTitle3}</span>
              </h1>

              <p className="mt-4 max-w-[52ch] text-[13.5px] md:text-[14.5px] leading-7 text-[#F2F0E9]/80" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter, sans-serif" : "Inter, sans-serif" }}>
                {t.heroDesc}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#programs" className="inline-flex items-center gap-2 rounded-full bg-[#F2F0E9] text-[#0F1B2E] px-5 py-2.5 text-[13px] font-bold hover:bg-white transition">
                  {t.ctaExplore} <span aria-hidden>↗</span>
                </a>
                <a href="#access" className="inline-flex items-center gap-2 rounded-full bg-transparent border border-white/20 text-white px-5 py-2.5 text-[13px] font-semibold hover:bg-white/10 transition">
                  {t.staffAccess}
                </a>
              </div>

              {/* archival proof row */}
              <div className="mt-8 grid grid-cols-3 gap-3 max-w-[560px]">
                {[
                  { v: "2,400+", k: t.trust1 },
                  { v: "100%", k: t.trust2 },
                  { v: "QR", k: t.trust3 },
                ].map((s) => (
                  <div key={s.k} className="rounded-[14px] bg-white/[0.06] border border-white/10 p-3 backdrop-blur">
                    <div className="text-[16px] font-extrabold tracking-[-0.03em]" style={{ fontFamily: "Fraunces, serif" }}>
                      {s.v}
                    </div>
                    <div className="text-[11px] leading-4 opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {s.k}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="mt-6 text-[11px] tracking-wide opacity-60 flex items-center gap-2"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                <span className="h-px w-8 bg-white/20 hidden md:block" />
                {t.helper}
              </div>
            </div>

            {/* bottom ledger ruler */}
            <div className="relative h-[36px] border-t border-white/10 bg-white/[0.04] flex items-center overflow-hidden">
              <div className="absolute inset-y-0 start-0 w-[68px] hidden md:block border-e border-white/10 bg-white/[0.03]" />
              <div className="ps-4 md:ps-[68px] flex items-center gap-4 text-[11px] whitespace-nowrap" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="opacity-60">LEDGER</span>
                <span className="opacity-30">·</span>
                <span className="opacity-80">STUDENTS 1,842</span>
                <span className="opacity-30">·</span>
                <span className="opacity-80">SECTIONS 64</span>
                <span className="opacity-30">·</span>
                <span className="opacity-80">CLOSE 19:30 DAILY</span>
              </div>
            </div>
          </div>

          {/* Right: Login ledger card */}
          <div id="access" className="col-span-12 lg:col-span-5">
            <div className="relative h-full rounded-[24px] bg-white border border-[#0F1B2E]/10 shadow-[0_20px_60px_rgba(15,27,46,0.10)] overflow-hidden flex flex-col">
              {/* perforated edge */}
              <div
                className="absolute top-0 bottom-0 start-0 w-[22px] bg-[#F2F0E9] border-e border-[#0F1B2E]/10 hidden md:block"
                style={{
                  backgroundImage: "radial-gradient(circle, #0F1B2E 2px, transparent 2.5px)",
                  backgroundSize: "22px 22px",
                  backgroundPosition: "center",
                  maskImage: "linear-gradient(to right, black 14px, transparent 15px)",
                }}
              />
              <div className="absolute top-0 start-0 end-0 h-[3px] bg-gradient-to-r from-[#C8A96B] via-[#E76F51] to-[#1E3A8A] opacity-80" />

              <div className="p-6 md:p-7 md:ps-9 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div
                      className="text-[11px] tracking-[0.18em] font-semibold opacity-60"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      REGISTRY ACCESS — STAFF ONLY
                    </div>
                    <h2 className="mt-1 text-[22px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
                      {isAr ? "دخول السجل" : "Enter the registry"}
                    </h2>
                    <p className="mt-1 text-[12.5px] leading-5 opacity-60 max-w-[32ch]" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
                      {t.noRegistration}
                    </p>
                  </div>
                  <div className="hidden sm:grid h-10 w-10 place-items-center rounded-full bg-[#0F1B2E] text-white border border-[#0F1B2E] shadow-sm">
                    <span className="text-[11px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      1998
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  {error && (
                    <div className="rounded-xl bg-[#FFF1F0] border border-[#E76F51]/30 text-[#7A1E12] text-[12.5px] px-3 py-2.5 flex gap-2">
                      <span className="mt-0.5">▣</span>
                      <span className="leading-5">{error}</span>
                    </div>
                  )}

                  <label className="block">
                    <span className="text-[11px] font-semibold tracking-wide opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {t.fieldEmail}
                    </span>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      dir="ltr"
                      autoComplete="email"
                      placeholder="name@aldrasat.edu"
                      className="mt-1.5 w-full rounded-[14px] bg-[#F2F0E9]/70 border border-[#0F1B2E]/12 px-3.5 py-3 text-[13.5px] placeholder:text-[#0F1B2E]/40 focus:outline-none focus:ring-4 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]/30 focus:bg-white transition"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold tracking-wide opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        {t.fieldPass}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="text-[11px] font-semibold opacity-60 hover:opacity-100 underline decoration-dotted"
                      >
                        {showPass ? (isAr ? "إخفاء" : "Hide") : isAr ? "إظهار" : "Show"}
                      </button>
                    </div>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPass ? "text" : "password"}
                      dir="ltr"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="mt-1.5 w-full rounded-[14px] bg-[#F2F0E9]/70 border border-[#0F1B2E]/12 px-3.5 py-3 text-[13.5px] placeholder:text-[#0F1B2E]/40 focus:outline-none focus:ring-4 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]/30 focus:bg-white transition"
                    />
                  </label>

                  <button
                    disabled={submitting}
                    className="w-full rounded-full bg-[#0F1B2E] text-white py-3.5 text-[13.5px] font-bold tracking-wide hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(15,27,46,0.18)]"
                  >
                    {submitting ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        {t.signing}
                      </>
                    ) : (
                      <>
                        {t.signIn} <span aria-hidden>→</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2 text-[11px] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    <span className="h-px flex-1 bg-[#0F1B2E]/10" />
                    {isAr ? "دخول آمن · CSRF + HttpOnly" : "Secure · CSRF + HttpOnly"}
                    <span className="h-px flex-1 bg-[#0F1B2E]/10" />
                  </div>
                </form>

                <div className="mt-6 rounded-[16px] bg-[#0F1B2E] text-[#F2F0E9] p-4 flex gap-3 items-start border border-white/10">
                  <div className="h-8 w-8 rounded-full bg-[#C8A96B] grid place-items-center text-[#0F1B2E] font-extrabold text-[12px] shrink-0">≡</div>
                  <div className="text-[12px] leading-5 opacity-90" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
                    <span className="font-bold">{isAr ? "بدون تسجيل ذاتي." : "No self-registration."}</span>{" "}
                    {isAr ? "يُنشئ المدير حسابك ويرسله لك. لو فقدت كلمة المرور تواصل مع الإدارة." : "Admin creates your account. Lost password? Contact administration."}
                  </div>
                </div>
              </div>

              <div className="px-6 md:px-9 py-3 bg-[#F2F0E9]/60 border-t border-[#0F1B2E]/10 flex items-center justify-between text-[11px]" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <span className="opacity-60">AUDIT · {new Date().getFullYear()}</span>
                <span className="opacity-60">ENCRYPTED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tape */}
      <div id="registry" className="mt-6 border-y border-[#0F1B2E]/10 bg-white/60 backdrop-blur overflow-hidden">
        <div className="flex animate-[tape_22s_linear_infinite] whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 ps-3" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {t.tape.map((w) => (
                <span key={w + i} className="inline-flex items-center gap-3">
                  <span className="text-[12px] tracking-[0.14em] font-semibold opacity-70">{w.toUpperCase()}</span>
                  <span className="h-1 w-1 rounded-full bg-[#C8A96B]" />
                </span>
              ))}
              <span className="text-[12px] tracking-[0.14em] font-semibold opacity-30">— ARCHIVE EDGE —</span>
              <span className="h-1 w-1 rounded-full bg-[#E76F51]" />
            </div>
          ))}
        </div>
        <style>{`@keyframes tape { from { transform: translateX(0)} to { transform: translateX(-50%) } } @media (prefers-reduced-motion: reduce){ div[style*="tape"]{ animation:none !important } }`}</style>
      </div>

      {/* Programs */}
      <section id="programs" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8 md:mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.2em] font-semibold opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              PROGRAMS — FILED & STAMPED
            </div>
            <h2 className="mt-2 text-[26px] md:text-[34px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
              {t.programsTitle}
            </h2>
          </div>
          <p className="max-w-[48ch] text-[13px] leading-6 opacity-60" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
            {t.programsSub}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-12 gap-4 md:gap-6">
          {t.cards.map((c, idx) => (
            <article
              key={c.k}
              className="col-span-12 md:col-span-4 rounded-[22px] bg-white border border-[#0F1B2E]/10 overflow-hidden shadow-[0_12px_40px_rgba(15,27,46,0.06)] flex flex-col"
            >
              <div className="h-[8px] w-full" style={{ background: idx === 0 ? "#1E3A8A" : idx === 1 ? "#C8A96B" : "#E76F51" }} />
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
                <span className="opacity-60">STAMPED</span>
                <span className="h-2 w-2 rounded-full" style={{ background: idx === 0 ? "#1E3A8A" : idx === 1 ? "#C8A96B" : "#E76F51" }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Operations */}
      <section id="ops" className="mx-auto max-w-[1280px] px-4 md:px-6 mt-8 md:mt-10">
        <div className="rounded-[24px] overflow-hidden border border-[#0F1B2E]/10 bg-white shadow-[0_12px_40px_rgba(15,27,46,0.06)]">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-span-5 bg-[#0F1B2E] text-[#F2F0E9] p-6 md:p-8 relative overflow-hidden">
              <div className="absolute -top-20 -end-20 h-[360px] w-[360px] rounded-full bg-[#1E3A8A]/20 blur-[40px]" />
              <div className="relative">
                <div className="text-[11px] tracking-[0.18em] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  OPERATIONS — LEDGER LOGIC
                </div>
                <h2 className="mt-2 text-[24px] md:text-[30px] font-extrabold tracking-[-0.04em]" style={{ fontFamily: "Fraunces, serif" }}>
                  {t.opsTitle}
                </h2>
                <p className="mt-3 text-[13px] leading-6 opacity-70 max-w-[42ch]">{t.opsDesc}</p>

                {/* mini ledger lines */}
                <div className="mt-6 rounded-[14px] bg-white/[0.06] border border-white/10 overflow-hidden">
                  {[
                    ["19:30", "Daily close", "Cashier • verified"],
                    ["09:10", "Attendance", "Section B • stamped"],
                    ["14:05", "Payment", "Student #1842 • receipt"],
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
              {t.ops.map((o) => (
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
                    Logged & auditable
                  </div>
                </div>
              ))}
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
            Aleppo — Paper · Stamp · Close
          </span>
        </div>
      </footer>
    </div>
  );
}
