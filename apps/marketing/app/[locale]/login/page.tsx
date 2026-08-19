"use client";

import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Space_Grotesk, IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from "next/font/google";
import { Globe, ShieldAlert } from "lucide-react";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const ibmArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"] });

const ERP_URL = process.env.NEXT_PUBLIC_ERP_URL || "https://aldirasat-erp.vercel.app";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isAr = locale === "ar";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Simple translations dictionary for login page
  const t = {
    ar: {
      title: "Al-Drasat",
      subtitle: "سجّل الدخول إلى حسابك",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      emailPlaceholder: "name@aldirasat.com",
      passwordPlaceholder: "••••••••",
      submitBtn: "تسجيل الدخول",
      loading: "جاري التحقق...",
      langToggle: "English",
      backToSite: "العودة إلى الموقع",
      footer: "تأكد من الحفاظ على سرية بيانات اعتمادك.",
      errorFallback: "فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.",
      validationError: "يرجى ملء جميع الحقول المطلوبة."
    },
    en: {
      title: "Al-Drasat",
      subtitle: "Sign in to your account",
      email: "Email Address",
      password: "Password",
      emailPlaceholder: "name@aldirasat.com",
      passwordPlaceholder: "••••••••",
      submitBtn: "Sign In",
      loading: "Authenticating...",
      langToggle: "العربية",
      backToSite: "Back to site",
      footer: "Keep your login credentials secure and confidential.",
      errorFallback: "Authentication failed. Please verify your credentials.",
      validationError: "Please fill in all required fields."
    }
  }[locale === "en" ? "en" : "ar"];

  const handleLanguageToggle = () => {
    const targetLocale = locale === "ar" ? "en" : "ar";
    router.push(`/${targetLocale}/login`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError(t.validationError);
      return;
    }

    setSubmitting(true);

    // Top-level form POST to the ERP origin — NOT an XHR. The browser treats
    // this as a full-page navigation, so the ERP's Set-Cookie for
    // access_token/refresh_token is stored as first-party on the ERP origin.
    // (An XHR to a different origin gets its cookies discarded by Chrome's
    // third-party cookie blocking, which broke staff login.)
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${ERP_URL}/api/v1/auth/login`;
    form.style.display = "none";

    const emailInput = document.createElement("input");
    emailInput.type = "hidden";
    emailInput.name = "email";
    emailInput.value = email;
    form.appendChild(emailInput);

    const passwordInput = document.createElement("input");
    passwordInput.type = "hidden";
    passwordInput.name = "password";
    passwordInput.value = password;
    form.appendChild(passwordInput);

    const localeInput = document.createElement("input");
    localeInput.type = "hidden";
    localeInput.name = "locale";
    localeInput.value = locale;
    form.appendChild(localeInput);

    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className={`${inter.className} relative min-h-screen flex items-center justify-center overflow-hidden bg-[#FFFBF0] text-[#0A0A0A] selection:bg-[#FF3B30] selection:text-white p-4 md:p-8`}
    >
      {/* Dot-grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(#0A0A0A 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      />

      {/* Background Decorative Blur Orbs — landing palette */}
      <div className="absolute top-[15%] start-[12%] -translate-x-1/2 -translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-[#FFD60A]/20 blur-[80px] md:blur-[120px] animate-pulse-slow motion-reduce:animate-none pointer-events-none" />
      <div className="absolute bottom-[15%] end-[12%] translate-x-1/2 translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-[#0EA5E9]/15 blur-[80px] md:blur-[120px] animate-pulse-slow motion-reduce:animate-none pointer-events-none" />

      {/* Outlined wordmark watermark */}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center pointer-events-none select-none overflow-hidden text-[86px] md:text-[132px] font-black tracking-[-0.06em] leading-none opacity-[0.03]"
        style={{ fontFamily: spaceGrotesk.style.fontFamily, WebkitTextStroke: "1px #0A0A0A" as any }}
      >
        {isAr ? "الدراسات" : "AL-DRASAT"}
      </span>

      {/* Floating Card container — landing card recipe */}
      <div className="w-full max-w-md relative rounded-[28px] bg-white border border-[#0A0A0A]/10 overflow-hidden shadow-[0_16px_50px_rgba(10,10,10,0.08)] p-6 md:p-8 z-10 animate-slide-up motion-reduce:animate-none">
        {/* Language & Info Header */}
        <div className="flex justify-between items-center mb-8">
          <span
            className="text-[10px] tracking-[0.16em] font-bold px-3 py-1.5 rounded-full bg-[#FFFBF0] border border-[#0A0A0A]/10 uppercase"
            style={{ fontFamily: jetbrains.style.fontFamily }}
          >
            v1.7 Marketing
          </span>
          <button
            onClick={handleLanguageToggle}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0A0A0A] hover:border-[#0A0A0A]/20 transition-colors duration-150 py-2 px-3.5 rounded-full bg-white border border-[#0A0A0A]/12"
            style={{ fontFamily: inter.style.fontFamily }}
          >
            <Globe size={13} />
            <span>{t.langToggle}</span>
          </button>
        </div>

        {/* Branding & Subtitle */}
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-[16px] bg-[#FFFBF0] border border-[#0A0A0A]/10 grid place-items-center overflow-hidden mx-auto mb-4 p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpeg"
              alt="Al-Drasat Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1
            className="text-[20px] font-black tracking-[-0.04em] leading-none"
            style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : spaceGrotesk.style.fontFamily }}
          >
            {t.title}
          </h1>
          <p
            className="text-[12.5px] leading-6 opacity-60 mt-3"
            style={{ fontFamily: isAr ? ibmArabic.style.fontFamily : inter.style.fontFamily }}
          >
            {t.subtitle}
          </p>
        </div>

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-[#FF3B30]/8 border border-[#FF3B30]/20 text-[#C2271D] text-xs flex items-start gap-2 animate-fade-in motion-reduce:animate-none">
              <ShieldAlert className="shrink-0 mt-0.5" size={14} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              className="block text-[10px] tracking-[0.16em] font-bold uppercase opacity-70 mb-2"
              style={{ fontFamily: jetbrains.style.fontFamily }}
            >
              {t.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              dir="ltr"
              className="w-full h-10 rounded-xl border border-[#0A0A0A]/10 bg-[#FFFBF0] px-3 text-sm outline-none focus:border-[#0A0A0A]/20 transition-colors duration-150 placeholder:text-[#0A0A0A]/35"
              style={{ fontFamily: inter.style.fontFamily }}
              required
            />
          </div>

          <div>
            <label
              className="block text-[10px] tracking-[0.16em] font-bold uppercase opacity-70 mb-2"
              style={{ fontFamily: jetbrains.style.fontFamily }}
            >
              {t.password}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              dir="ltr"
              className="w-full h-10 rounded-xl border border-[#0A0A0A]/10 bg-[#FFFBF0] px-3 text-sm outline-none focus:border-[#0A0A0A]/20 transition-colors duration-150 placeholder:text-[#0A0A0A]/35"
              style={{ fontFamily: inter.style.fontFamily }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-[#0A0A0A] text-white py-3 text-[13px] font-bold hover:bg-black transition shadow-[0_10px_30px_rgba(10,10,10,0.18)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ fontFamily: inter.style.fontFamily }}
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{t.loading}</span>
              </>
            ) : (
              <span>{t.submitBtn}</span>
            )}
          </button>

          {/* Back to site */}
          <div className="text-center">
            <button
              onClick={() => router.push(`/${locale}`)}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-5 py-2 rounded-full bg-white border border-[#0A0A0A]/12 hover:border-[#0A0A0A]/20 hover:bg-[#FFFBF0] transition active:scale-[0.98]"
              style={{ fontFamily: inter.style.fontFamily }}
            >
              <span aria-hidden>←</span>
              {t.backToSite}
            </button>
          </div>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-[#0A0A0A]/10 text-center">
          <p
            className="text-[10px] opacity-50 tracking-wide"
            style={{ fontFamily: jetbrains.style.fontFamily }}
          >
            {t.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
