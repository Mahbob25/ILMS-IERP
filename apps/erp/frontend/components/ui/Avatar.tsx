"use client";

import React from "react";

interface Props {
  name: string;
  photoUrl?: string | null;
  /** Rendered diameter in px. */
  size?: number;
  className?: string;
}

/**
 * Circular profile photo with an initials fallback.
 *
 * Photos live at /uploads/avatars/… on this same origin (rewritten to the ERP
 * host by next.config.js), so a plain <img> is enough — no image-optimizer
 * domain configuration needed.
 */
export default function Avatar({ name, photoUrl, size = 40, className = "" }: Props) {
  const initials = (() => {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "؟";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  const box = {
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.36)),
  };

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        style={box}
        className={`rounded-full object-cover border border-slate-200 shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      style={box}
      aria-hidden="true"
      className={`rounded-full bg-brand-50 text-brand-700 border border-brand-100 font-bold flex items-center justify-center shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
