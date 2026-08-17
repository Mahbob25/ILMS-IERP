"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { Globe, ShieldAlert, KeyRound, Mail, LogIn } from "lucide-react";
import { sanitizeInput } from "@/lib/utils/input";

const t = {
  ar: {
    title: "بوابة Al-Drasat",
    subtitle: "تسجيل الدخول للطلاب وأولياء الأمور",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    emailPlaceholder: "name@aldirasat.com",
    passwordPlaceholder: "••••••••",
    signIn: "تسجيل الدخول",
    loading: "جاري التحقق...",
    ssoNote: "سيتم توجيهك تلقائيًا من نظام Al-Drasat الرئيسي.",
    errorFallback: "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.",
    validationError: "يرجى إدخال البريد الإلكتروني وكلمة المرور.",
    langToggle: "English",
    footer: "للطلاب وأولياء الأمور: سجّل الدخول من aldirasat.com.",
  },
  en: {
    title: "Al-Drasat Portal",
    subtitle: "Sign in for students and parents",
    email: "Email Address",
    password: "Password",
    emailPlaceholder: "name@aldirasat.com",
    passwordPlaceholder: "••••••••",
    signIn: "Sign In",
    loading: "Authenticating...",
    ssoNote: "You will be redirected automatically from the main Al-Drasat system.",
    errorFallback: "Sign-in failed. Please try again.",
    validationError: "Please enter your email and password.",
    langToggle: "العربية",
    footer: "For students & parents: sign in at aldirasat.com.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const { login, ssoLogin } = useAuth();

  const s = t[locale === "en" ? "en" : "ar"];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ssoHandledRef = useRef(false);

  // If we landed with an SSO ticket from the main site, exchange it for a
  // portal session (one-time, short-lived) and go straight to the dashboard.
  useEffect(() => {
    if (ssoHandledRef.current) return;
    const ticket = new URLSearchParams(window.location.search).get("ticket");
    if (!ticket) return;
    ssoHandledRef.current = true;
    setSubmitting(true);
    setError(null);
    (async () => {
      try {
        await ssoLogin(ticket);
        router.replace(`/${locale}/dashboard`);
      } catch (err: any) {
        const detail = err.response?.data?.detail;
        setError(detail || s.errorFallback);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [ssoLogin, locale, router, s.errorFallback]);

  const handleLanguageToggle = () => {
    const targetLocale = locale === "ar" ? "en" : "ar";
    router.push(`/${targetLocale}/login`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(s.validationError);
      return;
    }
    setSubmitting(true);
    try {
      await login(sanitizeInput(email).toLowerCase(), password);
      router.replace(`/${locale}/dashboard`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || s.errorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 p-4 md:p-8">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-brand-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-indigo-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 md:p-8 relative z-10 transition-all duration-300 animate-slide-up">
        <div className="flex justify-between items-center mb-8">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-ai-50 text-ai-600 border border-ai-200">
            Student & Parent Portal
          </span>
          <button
            onClick={handleLanguageToggle}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors duration-150 py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200"
          >
            <Globe size={13} />
            <span>{s.langToggle}</span>
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white border border-slate-200 shadow-lg shadow-brand-500/20 flex items-center justify-center mx-auto mb-4 p-2 overflow-hidden">
            <KeyRound className="w-full h-full text-brand-600" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            {s.title}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-2">{s.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2 animate-fade-in">
              <ShieldAlert className="shrink-0 mt-0.5" size={14} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {s.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={s.emailPlaceholder}
              dir="ltr"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {s.password}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={s.passwordPlaceholder}
              dir="ltr"
              className="input-field"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-brand-500 hover:bg-brand-600 disabled:bg-brand-500/50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25 transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{s.loading}</span>
              </>
            ) : (
              <>
                <LogIn size={15} />
                <span>{s.signIn}</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
            <Mail size={13} className="shrink-0 text-slate-400" />
            <span>{s.ssoNote}</span>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-500">{s.footer}</p>
        </div>
      </div>
    </div>
  );
}
