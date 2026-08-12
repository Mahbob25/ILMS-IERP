"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";

const API = "/api/v1";

export default function BookPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const isAr = locale === "ar";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [program, setProgram] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("program") || "";
    if (["languages", "computing", "ai", "diplomas"].includes(q)) setProgram(q);
  }, []);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const t = isAr
    ? {
        back: "الرئيسية",
        kicker: "حجز مقعد تجريبي",
        title: "احجز حصتك المجانية",
        sub: "املأ النموذج — نتواصل معك خلال ساعات لتأكيد الوقت والقاعة. الحجز مجاني ولا يلزم دفع.",
        nameL: "الاسم الكامل",
        namePh: "مثلاً: أحمد علي",
        phoneL: "رقم الهاتف / واتساب",
        phonePh: "مثلاً: 777 123 456",
        progL: "البرنامج المهتم به (اختياري)",
        progOpts: ["", "languages", "computing", "ai", "diplomas"] as const,
        progLabels: ["— اختر —", "اللغات", "علوم الحاسب", "الذكاء الاصطناعي", "الدبلومات"] as const,
        msgL: "رسالة (اختياري)",
        msgPh: "مثلاً: أريد اختبار تحديد مستوى يوم السبت",
        submit: "إرسال الحجز",
        sending: "جاري الإرسال…",
        okTitle: "تم — استلمنا حجزك ✓",
        okBody: "سنتواصل معك قريبًا على نفس الرقم لتأكيد الموعد.",
        okCta: "العودة للرئيسية",
        errGeneric: "تعذر الإرسال — حاول مجددًا.",
      }
    : {
        back: "Home",
        kicker: "Book a trial seat",
        title: "Book your free class",
        sub: "Fill the form — we confirm time & room within hours. Free, no payment needed.",
        nameL: "Full name",
        namePh: "e.g. Ahmed Ali",
        phoneL: "Phone / WhatsApp",
        phonePh: "e.g. 777 123 456",
        progL: "Program (optional)",
        progOpts: ["", "languages", "computing", "ai", "diplomas"] as const,
        progLabels: ["— Select —", "Languages", "Computing", "AI", "Diplomas"] as const,
        msgL: "Message (optional)",
        msgPh: "e.g. I want a placement test on Saturday",
        submit: "Send booking",
        sending: "Sending…",
        okTitle: "Received ✓",
        okBody: "We will contact you shortly on the same number to confirm.",
        okCta: "Back to home",
        errGeneric: "Could not send — please try again.",
      };

  const canSubmit = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7 && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErr("");
    setLoading(true);
    try {
      const csrf = document.cookie.match(/(?:^| )csrf_token=([^;]+)/)?.[1];
      const decoded = csrf ? decodeURIComponent(csrf) : undefined;
      await axios.post(
        `${API}/public/bookings`,
        { name: name.trim(), phone: phone.trim(), program: program || null, message: message.trim() || null, locale },
        { withCredentials: true, headers: decoded ? { "X-CSRF-Token": decoded } : undefined }
      );
      setDone(true);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      setErr(typeof d === "string" ? d : t.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#FFFBF0] text-[#0A0A0A] selection:bg-[#FF3B30] selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');" }} />

      <header className="sticky top-0 z-40 bg-[#FFFBF0]/85 backdrop-blur-xl border-b border-[#0A0A0A]/10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[56px] flex items-center justify-between">
          <button onClick={() => router.push(`/${locale}`)} className="text-[13px] font-bold flex items-center gap-2 hover:opacity-70 transition">
            <span className="h-7 w-7 rounded-full bg-[#0A0A0A] text-white grid place-items-center text-[10px]">←</span>
            {t.back}
          </button>
          <span className="hidden sm:block text-[11px] font-bold tracking-[0.14em] opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            {isAr ? "معهد الدراسات · تعز" : "AL-DRASAT · TAIZ"}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-[720px] px-4 md:px-6 pt-8 md:pt-10 pb-10">
        <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] font-bold px-3 py-1.5 rounded-full bg-white border border-[#0A0A0A]/10" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          {t.kicker.toUpperCase()}
        </div>
        <h1 className="mt-3 text-[28px] md:text-[32px] font-black tracking-[-0.05em]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          {t.title}
        </h1>
        <p className="mt-2 text-[13px] leading-6 opacity-60">{t.sub}</p>

        {done ? (
          <div className="mt-6">
            <style dangerouslySetInnerHTML={{ __html: "@keyframes bookCheckDraw{0%{stroke-dashoffset:56}100%{stroke-dashoffset:0}}@keyframes bookCardIn{0%{opacity:0;transform:translateY(14px) scale(0.98)}100%{opacity:1;transform:none}}@keyframes bookRing{0%{transform:scale(0.9);opacity:0.5}100%{transform:scale(1.35);opacity:0}}@keyframes bookConfetti{0%{transform:translateY(-8px) rotate(0deg);opacity:0}15%{opacity:1}100%{transform:translateY(28px) rotate(180deg);opacity:0}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}" }} />
            <div className="relative rounded-[28px] bg-[#0A0A0A] p-[1.5px] shadow-[0_20px_60px_rgba(10,10,10,0.12)] animate-[bookCardIn_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="rounded-[26px] bg-[#FFFBF0] overflow-hidden">
                <div className="relative bg-white px-6 md:px-8 pt-7 pb-6 overflow-hidden">
                  <div aria-hidden className="pointer-events-none absolute inset-0">
                    <span className="absolute left-[18%] top-5 h-1.5 w-1.5 rounded-full bg-[#FFD60A] animate-[bookConfetti_1.6s_0.2s_both]" />
                    <span className="absolute left-[42%] top-4 h-1 w-1 rounded-full bg-[#FF3B30] animate-[bookConfetti_1.5s_0.35s_both]" />
                    <span className="absolute left-[62%] top-6 h-1.5 w-1.5 rounded-full bg-[#0EA5E9] animate-[bookConfetti_1.7s_0.15s_both]" />
                    <span className="absolute left-[78%] top-5 h-1 w-1 rounded-full bg-[#0A0A0A] animate-[bookConfetti_1.4s_0.45s_both]" />
                    <span className="absolute -top-3 -end-10 h-40 w-40 rounded-full bg-[#FFD60A]/10 blur-[18px]" />
                    <span className="absolute -bottom-8 -start-8 h-32 w-32 rounded-full bg-[#0EA5E9]/10 blur-[16px]" />
                  </div>
                  <div className="relative flex gap-4 items-start">
                    <div className="relative h-[56px] w-[56px] shrink-0">
                      <span className="absolute inset-0 rounded-full bg-[#10B981]/20 animate-[bookRing_1.8s_cubic-bezier(0,0,0.2,1)_infinite]" />
                      <span className="absolute inset-0 rounded-full bg-[#10B981]/15 animate-[bookRing_1.8s_0.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
                      <span className="relative grid place-items-center h-[56px] w-[56px] rounded-full bg-[#0A0A0A] text-white shadow-sm">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                          <circle cx="14" cy="14" r="11" stroke="white" strokeOpacity="0.18" strokeWidth="1.5" />
                          <path d="M8.5 14.2L12.1 17.8L19.6 10.3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="56" strokeDashoffset="56" style={{ animation: "bookCheckDraw 0.6s 0.35s cubic-bezier(0.16,1,0.3,1) forwards" }} />
                        </svg>
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.16em] font-black px-2.5 py-1 rounded-full bg-[#10B981] text-white" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> {isAr ? "تم تأكيد الحجز" : "BOOKING CONFIRMED"}
                      </div>
                      <h2 className="mt-3 text-[22px] md:text-[26px] font-black tracking-[-0.04em] leading-none" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                        {isAr ? "مقعدك محجوز — نكلمك اليوم" : "You're in — we call today"}
                      </h2>
                      <p className="mt-2 text-[13px] leading-6 opacity-60" style={{ fontFamily: isAr ? "IBM Plex Sans Arabic, Inter" : "Inter" }}>
                        {isAr ? <>أهلاً <span className="font-bold text-[#0A0A0A]">{name}</span> — وصل طلبك وسنأكد الوقت والقاعة على <span dir="ltr" className="font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>{phone}</span> خلال ساعات.</> : <>Thanks <span className="font-bold text-[#0A0A0A]">{name}</span> — we got it and will confirm time & room on <span className="font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>{phone}</span> within hours.</>}
                      </p>
                    </div>
                  </div>

                  <div className="relative mt-6 rounded-2xl bg-[#FFFBF0] border border-dashed border-[#0A0A0A]/15 overflow-hidden">
                    <div className="absolute top-1/2 -start-2 h-4 w-4 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10 -translate-y-1/2" />
                    <div className="absolute top-1/2 -end-2 h-4 w-4 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10 -translate-y-1/2" />
                    <div className="grid grid-cols-3 divide-x divide-dashed divide-[#0A0A0A]/12">
                      <div className="px-4 py-3">
                        <div className="text-[10px] tracking-[0.14em] font-black opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>{isAr ? "الاسم" : "NAME"}</div>
                        <div className="mt-1 text-[13px] font-bold truncate">{name}</div>
                      </div>
                      <div className="px-4 py-3">
                        <div className="text-[10px] tracking-[0.14em] font-black opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>{isAr ? "الهاتف" : "PHONE"}</div>
                        <div className="mt-1 text-[13px] font-bold" dir="ltr" style={{ fontFamily: "JetBrains Mono, monospace" }}>{phone}</div>
                      </div>
                      <div className="px-4 py-3">
                        <div className="text-[10px] tracking-[0.14em] font-black opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>{isAr ? "البرنامج" : "TRACK"}</div>
                        <div className="mt-1 text-[13px] font-bold truncate">{program ? (isAr ? ({ languages: "اللغات", computing: "علوم الحاسب", ai: "الذكاء الاصطناعي", diplomas: "الدبلومات" } as any)[program] : program) : isAr ? "— عام" : "— General"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {[
                      { n: "01", k: isAr ? "استلمنا" : "Received", d: isAr ? "طلبك عندنا" : "We have it", dot: "#10B981" },
                      { n: "02", k: isAr ? "نتصل بك" : "We call", d: isAr ? "خلال ساعات" : "Within hours", dot: "#FFD60A" },
                      { n: "03", k: isAr ? "تأتي للتجربة" : "You visit", d: isAr ? "مجانًا" : "Free trial", dot: "#0EA5E9" },
                    ].map((s) => (
                      <div key={s.n} className="rounded-2xl bg-white border border-[#0A0A0A]/10 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.12em] opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} /> {s.n}</div>
                        <div className="mt-1 text-[12.5px] font-black leading-none">{s.k}</div>
                        <div className="text-[11px] opacity-60">{s.d}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => router.push(`/${locale}`)} className="rounded-full bg-[#0A0A0A] text-white px-6 py-3 text-[13px] font-bold hover:bg-black transition flex items-center gap-2">
                      {t.okCta} <span aria-hidden>→</span>
                    </button>
                    <button onClick={() => setDone(false)} className="rounded-full bg-white border border-[#0A0A0A]/12 px-5 py-3 text-[13px] font-bold hover:bg-[#FFFBF0] transition">
                      {isAr ? "حجز آخر" : "New booking"}
                    </button>
                    <span className="ms-auto hidden md:inline-flex items-center gap-1.5 text-[11px] opacity-50 self-center" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" /> {isAr ? "نرد واتساب على نفس الرقم" : "We reply on WhatsApp too"}
                    </span>
                  </div>
                </div>
                <div className="bg-[#0A0A0A] text-white px-6 py-3 flex items-center justify-between text-[11px]">
                  <span className="opacity-70" style={{ fontFamily: "JetBrains Mono, monospace" }}>{isAr ? "مجاني · بلا دفع · اختبار مستوى مجاني" : "Free · No payment · Free placement test"}</span>
                  <span className="hidden sm:inline opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>ADMIT ONE — {isAr ? "تعز 1998 → الآن" : "TAIZ 1998 → NOW"}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 rounded-[28px] bg-white border border-[#0A0A0A]/10 p-6 md:p-7 shadow-sm grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>{t.nameL}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} className="h-11 rounded-xl border border-[#0A0A0A]/12 bg-[#FFFBF0]/40 px-3 text-[14px] outline-none focus:border-[#0A0A0A]/25 focus:bg-white transition" />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>{t.phoneL}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.phonePh} inputMode="tel" dir="ltr" className="h-11 rounded-xl border border-[#0A0A0A]/12 bg-[#FFFBF0]/40 px-3 text-[14px] outline-none focus:border-[#0A0A0A]/25 focus:bg-white transition" />
            </label>

            <div className="grid gap-1.5">
              <span className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>{t.progL}</span>
              <div className="grid grid-cols-2 gap-2">
                {(t.progOpts as readonly string[]).slice(1).map((v, i) => {
                  const label = (t.progLabels as readonly string[])[i + 1];
                  const active = program === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setProgram(active ? "" : v)}
                      className={`h-11 rounded-xl border px-3 text-[13px] font-bold transition text-start flex items-center justify-between gap-2 ${active ? "bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-sm" : "bg-[#FFFBF0]/60 border-[#0A0A0A]/12 hover:bg-white hover:border-[#0A0A0A]/20"}`}
                    >
                      <span>{label}</span>
                      <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] shrink-0 border ${active ? "bg-white text-[#0A0A0A] border-white" : "bg-white border-[#0A0A0A]/10"}`}>{active ? "✓" : "○"}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] opacity-40" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {isAr ? "اختر واحدًا أو اتركه فارغًا" : "Pick one or leave blank"}
              </span>
            </div>

            <label className="grid gap-1.5">
              <span className="text-[11px] tracking-[0.14em] font-black opacity-60" style={{ fontFamily: "JetBrains Mono, monospace" }}>{t.msgL}</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.msgPh} rows={3} className="rounded-xl border border-[#0A0A0A]/12 bg-[#FFFBF0]/40 px-3 py-2.5 text-[14px] outline-none focus:border-[#0A0A0A]/25 focus:bg-white transition resize-none" />
            </label>

            {err && <div className="rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 px-3 py-2.5 text-[13px] text-[#C12720]">{err}</div>}

            <button type="submit" disabled={!canSubmit} className="mt-1 rounded-full bg-[#FF3B30] text-white py-3 text-[14px] font-bold hover:bg-[#E3342B] disabled:opacity-40 disabled:cursor-not-allowed transition">
              {loading ? t.sending : t.submit} {!loading && "→"}
            </button>

            <p className="text-[11px] opacity-50 text-center" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {isAr ? "بإرسال الحجز توافق على تواصلنا معك هاتفيًا لتأكيد الموعد." : "By sending, you agree we may contact you by phone to confirm."}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
