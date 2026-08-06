"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface WizardNavigationBarProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  onFinish?: () => void;
  /** Show the Back button. Defaults to `currentStep > 1`. */
  showBack?: boolean;
  /** Show the Skip button. Off by default — caller enables it on optional steps. */
  showSkip?: boolean;
  canBack?: boolean;
  canNext?: boolean;
  canSkip?: boolean;
  canFinish?: boolean;
  /** Shows a spinner and disables every action button. */
  submitting?: boolean;
  /** Override the Skip label (e.g. a pre-translated "Skip Payment"). */
  skipLabel?: string;
  /** Override the Finish label (e.g. a pre-translated "Confirm"). */
  finishLabel?: string;
  backLabel?: string;
  nextLabel?: string;
  locale?: string;
  isRtl?: boolean;
  className?: string;
}

export default function WizardNavigationBar({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSkip,
  onFinish,
  showBack,
  showSkip = false,
  canBack = true,
  canNext = true,
  canSkip = true,
  canFinish = true,
  submitting = false,
  skipLabel,
  finishLabel,
  backLabel,
  nextLabel,
  locale = "ar",
  isRtl,
  className = "",
}: WizardNavigationBarProps) {
  const rtl = isRtl ?? locale === "ar";

  const t = {
    ar: { back: "رجوع", next: "التالي", skip: "تخطي", finish: "إنهاء" },
    en: { back: "Back", next: "Next", skip: "Skip", finish: "Finish" },
  }[locale === "en" ? "en" : "ar"];

  const backVisible = showBack ?? currentStep > 1;
  const nextVisible = currentStep < totalSteps;
  const finishVisible = currentStep >= totalSteps;

  return (
    <div className={`flex items-center gap-3 pt-2 ${className}`} dir={rtl ? "rtl" : "ltr"}>
      {backVisible && (
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          disabled={submitting || !canBack}
        >
          {backLabel ?? t.back}
        </button>
      )}
      <div className="flex-1" />
      {showSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting || !canSkip}
        >
          {skipLabel ?? t.skip}
        </button>
      )}
      {nextVisible && (
        <button
          type="button"
          onClick={onNext}
          className="btn-primary"
          disabled={submitting || !canNext}
        >
          {submitting && <Loader2 size={14} className="animate-spin inline me-1" />}
          {nextLabel ?? t.next}
        </button>
      )}
      {finishVisible && (
        <button
          type="button"
          onClick={onFinish}
          className="btn-primary"
          disabled={submitting || !canFinish}
        >
          {submitting && <Loader2 size={14} className="animate-spin inline me-1" />}
          {finishLabel ?? t.finish}
        </button>
      )}
    </div>
  );
}
