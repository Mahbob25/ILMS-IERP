"use client";

import LoginLoadingIllustration from "./LoginLoadingIllustration";

interface LoginLoadingOverlayProps {
  text: string;
  dir: "rtl" | "ltr";
}

/**
 * Full-screen overlay shown while the login request is in flight: a softly
 * blurred backdrop with a centered white card hosting the animated
 * illustration and the localized status text.
 */
export default function LoginLoadingOverlay({ text, dir }: LoginLoadingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-white/60 backdrop-blur-md p-4 animate-fade-in motion-reduce:animate-none"
      role="status"
      aria-live="polite"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg border border-[#0A0A0A]/8 animate-loading-pop motion-reduce:animate-none">
        <LoginLoadingIllustration />
        <p
          className="mt-5 text-sm font-medium text-gray-700"
          style={{ fontFamily: dir === "rtl" ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif" }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
