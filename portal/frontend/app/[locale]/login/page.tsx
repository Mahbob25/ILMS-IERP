"use client";

import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { Globe, ShieldAlert, Smartphone, KeyRound } from "lucide-react";
import { sanitizeInput } from "@/lib/utils/input";

const t = {
  ar: {
    title: "بوابة Al-Drasat",
    subtitle: "سجل الدخول برقم الهاتف ورمز التحقق",
    phone: "رقم الهاتف",
    phonePlaceholder: "05xxxxxxxx",
    code: "رمز التحقق",
    codePlaceholder: "••••••",
    requestOtp: "إرسال الرمز",
    verifyBtn: "تسجيل الدخول",
    resend: "إعادة إرسال الرمز",
    loading: "جاري التحقق...",
    otpSent: "تم إرسال رمز التحقق إلى هاتفك (سجل الخادم في الإصدار التجريبي)",
    errorFallback: "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.",
    validationError: "يرجى إدخال رقم هاتف صحيح ورمز التحقق.",
    langToggle: "English",
    footer: "هذه البوابة مستقلة تمامًا عن نظام الموظفين الداخلي.",
  },
  en: {
    title: "Al-Drasat Portal",
    subtitle: "Sign in with your phone number and OTP",
    phone: "Phone Number",
    phonePlaceholder: "05xxxxxxxx",
    code: "Verification Code",
    codePlaceholder: "••••••",
    requestOtp: "Send Code",
    verifyBtn: "Sign In",
    resend: "Resend Code",
    loading: "Verifying...",
    otpSent: "A verification code was sent to your phone (console-logged in the MVP)",
    errorFallback: "Sign-in failed. Please try again.",
    validationError: "Please enter a valid phone number and code.",
    langToggle: "العربية",
    footer: "This portal is fully isolated from the internal staff ERP.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const { requestOtp, verifyOtp } = useAuth();

  const s = t[locale === "en" ? "en" : "ar"];

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const handleLanguageToggle = () => {
    const targetLocale = locale === "ar" ? "en" : "ar";
    router.push(`/${targetLocale}/login`);
  };

  const handleRequestOtp = async () => {
    setError(null);
    setNotice(null);
    if (!phone.trim()) {
      setError(s.validationError);
      return;
    }
    setSendingOtp(true);
    try {
      await requestOtp(sanitizeInput(phone));
      setOtpRequested(true);
      setNotice(s.otpSent);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || s.errorFallback);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !code.trim()) {
      setError(s.validationError);
      return;
    }
    setSubmitting(true);
    try {
      await verifyOtp(sanitizeInput(phone), sanitizeInput(code));
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
            <Smartphone className="w-full h-full text-brand-600" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            {s.title}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-2">{s.subtitle}</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2 animate-fade-in">
              <ShieldAlert className="shrink-0 mt-0.5" size={14} />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs flex items-start gap-2 animate-fade-in">
              <KeyRound className="shrink-0 mt-0.5" size={14} />
              <span>{notice}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {s.phone}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={s.phonePlaceholder}
              dir="ltr"
              className="input-field"
              required
            />
          </div>

          {otpRequested && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {s.code}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={s.codePlaceholder}
                dir="ltr"
                className="input-field tracking-[0.4em]"
                maxLength={8}
                required
              />
            </div>
          )}

          {!otpRequested ? (
            <button
              type="button"
              onClick={handleRequestOtp}
              disabled={sendingOtp}
              className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg text-white bg-brand-500 hover:bg-brand-600 disabled:bg-brand-500/50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25 transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {sendingOtp ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{s.requestOtp}</span>
                </span>
              ) : (
                <span>{s.requestOtp}</span>
              )}
            </button>
          ) : (
            <>
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
                  <span>{s.verifyBtn}</span>
                )}
              </button>
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={sendingOtp}
                className="w-full text-xs text-brand-600 hover:text-brand-700 py-1.5"
              >
                {s.resend}
              </button>
            </>
          )}
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-500">{s.footer}</p>
        </div>
      </div>
    </div>
  );
}
