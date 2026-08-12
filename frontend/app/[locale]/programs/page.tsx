"use client";

import { useParams, useRouter } from "next/navigation";

const DATA = {
  ar: {
    back: "الرئيسية",
    kicker: "البرامج",
    title: "اختر ما تريد أن تتقنه",
    sub: "قائمة مفتوحة — نضيف مسارات جديدة كل فصل. كل برنامج له ورشة، مشروع نهائي، وشهادة تُتحقّق برمز.",
    cta: "احجز اختبار تحديد مستوى مجاني",
    programs: [
      {
        id: "languages",
        name: "اللغات",
        meta: "A1 → C2 · 6 مستويات — 3 أشهر لكل مستوى",
        intro: "محادثة يومية، مخبر صوتي، وامتحان كل وحدتين. من الحروف إلى المناظرة. المجموعات 6–8 طلاب فقط.",
        bullets: ["محادثة 60 دقيقة يوميًا + مخبر صوتي بتسجيل وتصحيح فوري", "اختبار قصير كل وحدتين وتقرير مستوى أسبوعي", "مشروع نهائي: عرض تقديمي + مناظرة قصيرة"],
        levels: ["A1 المبتدئ", "A2 قبل المتوسط", "B1 متوسط", "B2 فوق المتوسط", "C1 متقدم", "C2 إتقان"],
        outcome: "شهادة مستوى مع رمز تحقق + ملف تقييم يمكنك إرفاقه مع سيرتك.",
        ai: "مدرّب نطق AI: سجّل جملة ويصحح لك اللفظ ويعطيك تمارين دقيقة على هاتفك.",
      },
      {
        id: "computing",
        name: "علوم الحاسب",
        meta: "12 مساقًا · مختبر يومي — حاسوب لكل طالب",
        intro: "بايثون، قواعد بيانات، شبكات وويب. كل وحدة تنتهي برابط يعمل — ليس عرض شرائح.",
        bullets: ["بيئة حقيقية: Git، سيرفر محلي، واستضافة لمشروعك", "تقييم بالكود لا بالحفظ — مراجعة شيفرة مع المعلّم", "مشروع تخرج: منتج صغير منشور برابط"],
        levels: ["أساسيات البرمجة (بايثون)", "هياكل بيانات + خوارزميات", "قواعد بيانات (SQL)", "شبكات", "تطوير ويب", "مشروع تخرج"],
        outcome: "محفظة برمجية (GitHub/رابط) + شهادة معتمدة.",
        ai: "مراجع كود AI: يلصق الطالب كوده فيكشف الخطأ ويقترح تحسينًا ويشرح السبب.",
      },
      {
        id: "ai",
        name: "الذكاء الاصطناعي",
        meta: "جديد · 3 مستويات — من الاستخدام إلى البناء",
        intro: "مسار عملي — لا نظريات طويلة. تتعلم تستخدم أدوات AI في دراستك وعملك، ثم تبني شيئًا صغيرًا بها.",
        bullets: ["AI للدراسة والعمل: تلخيص، ترجمة، وصياغة بمساعدة AI", "بيانات: جمع وتنظيف وبناء نموذج صغير", "مشاريع: مساعد ترجمة، مساعد دراسة، ومنشئ محفظة"],
        levels: ["محو أمية AI", "أدوات وبيانات", "مشاريع تطبيقية"],
        outcome: "3 مشاريع قابلة للعرض + شهادة AI مع رمز تحقق.",
        ai: "المسار نفسه مدعوم بمساعد AI يرافقك يوميًا ويبني لك خطة مراجعة شخصية.",
      },
      {
        id: "diplomas",
        name: "الدبلومات المهنية",
        meta: "180 ساعة · شهادة معتمدة — محاسبة / إدارة / سكرتارية",
        intro: "دبلومات تطبيقية بحالات واقعية — فواتير حقيقية، ميزانية، ومراسلات كما في الشركة.",
        bullets: ["مدربون من سوق العمل — حالات من شركات فعلية", "ملف إنجاز تقدّمه لصاحب العمل يوم المقابلة", "متابعة حضور يومية وتقرير أداء"],
        levels: ["محاسبة مهنية", "إدارة أعمال", "سكرتارية تنفيذية"],
        outcome: "دبلوم معتمد + ملف إنجاز مطبوع ورقمي.",
        ai: "مساعد صياغة AI: يراجع مراسلاتك وتقاريرك ويحسّن لغتك المهنية.",
      },
    ],
  },
  en: {
    back: "Home",
    kicker: "Programs",
    title: "Choose what you want to master",
    sub: "Open catalog — new tracks each term. Every program has an atelier, a final project, and a QR-verifiable certificate.",
    cta: "Book free placement test",
    programs: [
      {
        id: "languages",
        name: "Languages",
        meta: "A1 → C2 · 6 levels — 3 months per level",
        intro: "Daily conversation, audio lab, test every two units. Letters to debate. 6–8 per section.",
        bullets: ["60′ conversation daily + audio lab with recording & instant correction", "Short test every two units + weekly progress report", "Final: presentation + short debate"],
        levels: ["A1 Beginner", "A2 Elementary", "B1 Intermediate", "B2 Upper-Intermediate", "C1 Advanced", "C2 Mastery"],
        outcome: "Level certificate with QR + assessment file for your CV.",
        ai: "AI pronunciation coach: record a sentence, get instant correction + micro-drills on your phone.",
      },
      {
        id: "computing",
        name: "Computing",
        meta: "12 courses · daily lab — 1 machine per student",
        intro: "Python, DB, networks & web. Every unit ends with a live link — not a slide deck.",
        bullets: ["Real env: Git, local server, hosting for your project", "Code review grading with the teacher", "Capstone: small product with a live link"],
        levels: ["Programming Basics (Python)", "Data Structures & Algorithms", "Databases (SQL)", "Networks", "Web Development", "Capstone"],
        outcome: "Portfolio (GitHub/link) + certified certificate.",
        ai: "AI code reviewer: paste code, it finds bugs, suggests better patterns and explains why.",
      },
      {
        id: "ai",
        name: "Artificial Intelligence",
        meta: "New · 3 levels — from using to building",
        intro: "Practical AI — not long theory. Use AI in study & work, then build small things with it.",
        bullets: ["AI for study & work: summarizing, translating, drafting with AI", "Data: collect, clean, train a small model", "Projects: translation helper, study buddy, portfolio builder"],
        levels: ["AI Literacy", "Tools & Data", "Applied Projects"],
        outcome: "3 demo-ready projects + AI certificate with QR.",
        ai: "The track itself is AI-assisted — a companion builds your daily revision plan.",
      },
      {
        id: "diplomas",
        name: "Professional Diplomas",
        meta: "180 hrs · certified — Accounting / Management / Secretarial",
        intro: "Applied diplomas with real cases — invoices, budgets, letters as in a company.",
        bullets: ["Instructors from industry — real company cases", "Portfolio you hand to the employer", "Daily attendance + performance report"],
        levels: ["Professional Accounting", "Business Management", "Executive Secretarial"],
        outcome: "Certified diploma + printed & digital portfolio.",
        ai: "AI drafting assistant: reviews your letters & reports and polishes professional language.",
      },
    ],
  },
} as const;

export default function ProgramsPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";
  const copy = isAr ? DATA.ar : DATA.en;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#FFFBF0] text-[#0A0A0A] selection:bg-[#FF3B30] selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`}</style>

      <header className="sticky top-0 z-40 bg-[#FFFBF0]/85 backdrop-blur-xl border-b border-[#0A0A0A]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[56px] flex items-center justify-between gap-3">
          <button onClick={() => router.push(`/${locale}`)} className="text-[13px] font-bold flex items-center gap-2 hover:opacity-70 transition">
            <span className="h-7 w-7 rounded-full bg-[#0A0A0A] text-white grid place-items-center text-[10px]">←</span>
            {copy.back}
          </button>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-[11px] font-bold tracking-[0.14em] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {isAr ? "معهد الدراسات · تعز" : "AL-DRASAT · TAIZ"}
            </div>
            <button onClick={() => router.push(`/${locale}/login`)} className="text-[12px] font-bold px-4 py-2 rounded-full bg-[#0A0A0A] text-white hover:bg-black transition">
              {isAr ? "دخول الكادر" : "Staff login"} →
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1280px] px-4 md:px-6 pt-8 md:pt-10">
        <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] font-bold px-3 py-1.5 rounded-full bg-white border border-[#0A0A0A]/10" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          {copy.kicker.toUpperCase()}
        </div>
        <h1 className="mt-3 text-[28px] md:text-[38px] font-black tracking-[-0.05em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          {copy.title}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-6 opacity-60">{copy.sub}</p>

        <div className="mt-6 flex flex-wrap gap-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          {copy.programs.map((p) => (
            <a key={p.id} href={`#${p.id}`} className="text-[11px] font-bold px-3.5 py-2 rounded-full bg-white border border-[#0A0A0A]/10 hover:bg-[#0A0A0A] hover:text-white transition">
              {p.name}
            </a>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 md:px-6 mt-6 grid gap-6 pb-10">
        {copy.programs.map((p, i) => (
          <article key={p.id} id={p.id} className="scroll-mt-20 rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-sm">
            <div className="grid grid-cols-12">
              <div className="col-span-12 lg:col-span-7 p-6 md:p-8">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-full bg-[#0A0A0A] text-white grid place-items-center text-[11px] font-black" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] font-bold opacity-50" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {p.meta}
                  </span>
                </div>
                <h2 className="mt-3 text-[22px] font-black tracking-[-0.04em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  {p.name}
                </h2>
                <p className="mt-2 text-[13px] leading-6 opacity-70">{p.intro}</p>

                <ul className="mt-4 grid gap-2">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-[13px] leading-6">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#FF3B30] shrink-0" />
                      <span className="opacity-80">{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 rounded-2xl bg-[#FFFBF0] border border-[#0A0A0A]/10 p-4">
                  <div className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {isAr ? "خطة المستويات" : "TRACK PLAN"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.levels.map((lv) => (
                      <span key={lv} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border border-[#0A0A0A]/10" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        {lv}
                      </span>
                    ))}
                  </div>
                </div>

                <a href={`/${locale}/book?program=${p.id}`} className="mt-5 inline-flex rounded-full bg-[#FF3B30] text-white px-5 py-2.5 text-[13px] font-bold hover:bg-[#E3342B] transition">
                  {copy.cta} →
                </a>
              </div>

              <div className="col-span-12 lg:col-span-5 bg-[#0A0A0A] text-white p-6 md:p-8 flex flex-col gap-4 border-t lg:border-t-0 lg:border-s border-black">
                <div className="rounded-2xl bg-white text-[#0A0A0A] p-4 border border-white/10">
                  <div className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {isAr ? "ماذا بعد التخرج" : "OUTCOME"}
                  </div>
                  <p className="mt-1 text-[13px] leading-6">{p.outcome}</p>
                </div>
                <div className="rounded-2xl bg-[#FFD60A] text-[#0A0A0A] p-4">
                  <div className="text-[11px] tracking-[0.14em] font-black opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    AI
                  </div>
                  <p className="mt-1 text-[12.5px] leading-5 font-medium">{p.ai}</p>
                </div>
                <div className="mt-auto text-[11px] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {isAr ? "التسجيل حضوري · اختبار تحديد مستوى مجاني 20 دقيقة" : "On-campus enrolment · Free 20-min placement"}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
