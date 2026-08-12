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
          <div className="mt-6 rounded-[24px] bg-white border border-[#0A0A0A]/10 p-6 md:p-8 shadow-sm">
            <div className="h-10 w-10 rounded-full bg-[#0A0A0A] text-white grid place-items-center">✓</div>
            <h2 className="mt-4 text-[18px] font-black" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{t.okTitle}</h2>
            <p className="mt-1 text-[13px] leading-6 opacity-70">{t.okBody}</p>
            <button onClick={() => router.push(`/${locale}`)} className="mt-6 rounded-full bg-[#FF3B30] text-white px-6 py-3 text-[13px] font-bold hover:bg-[#E3342B] transition">
              {t.okCta} →
            </button>
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
