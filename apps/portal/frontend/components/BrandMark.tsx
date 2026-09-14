"use client";

interface Props {
  /** Size and visibility overrides — the tile defaults to 40px. */
  className?: string;
}

/**
 * Institute brand mark — the logo tile shared by the sidebar and the header.
 *
 * The asset lives at public/logo.jpeg, so it is served from this app's own
 * origin. The portal is a separate deployment from the ERP and the marketing
 * site, and each keeps its own copy under the same path, so no rewrite or
 * cross-origin rule is needed to show it.
 */
export default function BrandMark({ className = "w-10 h-10" }: Props) {
  return (
    <div
      className={`rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    >
      {/* Decorative — the institute name always sits beside it in text. */}
      <img src="/logo.jpeg" alt="" className="w-full h-full object-contain" />
    </div>
  );
}
