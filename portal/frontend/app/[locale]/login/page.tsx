"use client";

import React, { useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

// This page only exists to exchange a one-time SSO ticket issued by the
// unified ERP login. There is no login form here — students/parents sign in
// at the main site (aldirasat.com) and get redirected here with ?ticket=.
export default function PortalSsoPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const { ssoLogin } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const ticket = new URLSearchParams(window.location.search).get("ticket");
    if (!ticket) {
      // No ticket — redirect to the unified login on the main site.
      window.location.href = `https://aldirasat.com/${locale}/login`;
      return;
    }
    (async () => {
      try {
        await ssoLogin(ticket);
        router.replace(`/${locale}/dashboard`);
      } catch {
        window.location.href = `https://aldirasat.com/${locale}/login`;
      }
    })();
  }, [ssoLogin, locale, router]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 p-4 md:p-8">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-xl p-6 md:p-8 relative z-10 text-center">
        <svg
          className="animate-spin h-8 w-8 text-brand-500 mx-auto"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="mt-4 text-sm text-slate-500 font-medium">
          {locale === "ar" ? "جاري تسجيل الدخول..." : "Signing you in..."}
        </p>
      </div>
    </div>
  );
}
