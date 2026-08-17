"use client";

import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { Globe, ShieldAlert } from "lucide-react";
import { sanitizeInput } from "@/lib/utils/input";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Simple translations dictionary for login page
  const t = {
    ar: {
      title: "Al-Drasat ERP",
      subtitle: "سجل الدخول للمتابعة إلى Al-Drasat ERP",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      emailPlaceholder: "name@aldrasat.com",
      passwordPlaceholder: "••••••••",
      submitBtn: "تسجيل الدخول",
      loading: "جاري التحقق...",
      langToggle: "English",
      footer: "تأكد من الحفاظ على سرية بيانات اعتمادك.",
      errorFallback: "فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.",
      validationError: "يرجى ملء جميع الحقول المطلوبة."
    },
    en: {
      title: "Al-Drasat ERP",
      subtitle: "Sign in to access your ERP portal",
      email: "Email Address",
      password: "Password",
      emailPlaceholder: "name@aldrasat.com",
      passwordPlaceholder: "••••••••",
      submitBtn: "Sign In",
      loading: "Authenticating...",
      langToggle: "العربية",
      footer: "Ensure your login credentials remain secure and confidential.",
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
    try {
      const res = await login(sanitizeInput(email), password);

      // Students/parents are authenticated by the ERP but land on the portal
      // subdomain — hand off with a one-time SSO ticket.
      if ((res as any)?.user_type === "portal" && (res as any)?.sso_ticket) {
        const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.aldirasat.com";
        window.location.href = `${portalBase}/${locale}/login?ticket=${encodeURIComponent((res as any).sso_ticket)}`;
        return;
      }

      router.replace(`/${locale}/dashboard`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 401) {
        setError(t.errorFallback);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg).join("; ") || t.errorFallback);
      } else {
        setError(detail || t.errorFallback);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 p-4 md:p-8">
      {/* Background Decorative Blur Spheres */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-brand-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 md:w-96 h-72 md:h-96 rounded-full bg-indigo-500/10 blur-[80px] md:blur-[120px] animate-pulse-slow pointer-events-none" />

      {/* Floating Card container */}
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 md:p-8 relative z-10 transition-all duration-300 animate-slide-up">
        {/* Language & Info Header */}
        <div className="flex justify-between items-center mb-8">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 border border-brand-200">
            v1.6 Core Auth
          </span>
          <button
            onClick={handleLanguageToggle}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors duration-150 py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200"
          >
            <Globe size={13} />
            <span>{t.langToggle}</span>
          </button>
        </div>

        {/* Branding & Subtitle */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white border border-slate-200 shadow-lg shadow-brand-500/20 flex items-center justify-center mx-auto mb-4 p-2 overflow-hidden">
            <img
              src="/logo.jpeg"
              alt="Al-Drasat ERP Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            {t.title}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-2">
            {t.subtitle}
          </p>
        </div>

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2 animate-fade-in">
              <ShieldAlert className="shrink-0 mt-0.5" size={14} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {t.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              dir="ltr"
              className="w-full text-sm px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-150"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                {t.password}
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              dir="ltr"
              className="w-full text-sm px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-150"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-brand-500 hover:bg-brand-600 disabled:bg-brand-500/50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25 transition-all duration-150 flex items-center justify-center gap-2 hover:shadow-brand-500/35 active:scale-[0.98]"
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
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-500">
            {t.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
