"use client";

import React from "react";
import { Check } from "lucide-react";

export interface WizardStepperStep {
  /** Already-localized label for the step (caller translates). */
  label: string;
  /** Marks the step as skippable (e.g. payment). Renders a small "optional" hint. */
  optional?: boolean;
}

interface WizardStepperProps {
  steps: WizardStepperStep[];
  /** 1-indexed current step. Clamped to [1, steps.length]. */
  currentStep: number;
  /** Locale for shell strings ("Step X of Y", "Optional"). Default "ar". */
  locale?: string;
  /** Explicit RTL override; derived from locale when omitted. */
  isRtl?: boolean;
  /** Show the "Step X of Y" caption above the track. Default true. */
  showStepCount?: boolean;
  /** Show step labels under each circle. Default true. */
  showLabels?: boolean;
  className?: string;
}

type StepState = "completed" | "active" | "pending";

export default function WizardStepper({
  steps,
  currentStep,
  locale = "ar",
  isRtl,
  showStepCount = true,
  showLabels = true,
  className = "",
}: WizardStepperProps) {
  const rtl = isRtl ?? locale === "ar";

  const t = {
    ar: {
      stepOf: (c: number, total: number) => `الخطوة ${c} من ${total}`,
      optional: "اختياري",
    },
    en: {
      stepOf: (c: number, total: number) => `Step ${c} of ${total}`,
      optional: "Optional",
    },
  }[locale === "en" ? "en" : "ar"];

  const total = steps.length;
  const current = Math.min(Math.max(currentStep, 1), Math.max(total, 1));

  const stateOf = (index: number): StepState => {
    const stepNo = index + 1;
    if (stepNo < current) return "completed";
    if (stepNo === current) return "active";
    return "pending";
  };

  return (
    <div className={`w-full animate-fade-in ${className}`} dir={rtl ? "rtl" : "ltr"}>
      {showStepCount && (
        <p className="text-xs font-medium text-slate-500 mb-3 text-start">
          {t.stepOf(current, total)}
        </p>
      )}
      <ol className="flex items-start" role="list">
        {steps.map((step, index) => {
          const state = stateOf(index);
          const isLast = index === total - 1;
          const connectorCompleted = current > index + 1;
          return (
            <React.Fragment key={index}>
              <li className="flex flex-col items-center shrink-0 px-1">
                <span
                  aria-current={state === "active" ? "step" : undefined}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 shrink-0 ${
                    state === "active"
                      ? "bg-brand-500 text-white ring-4 ring-brand-100"
                      : state === "completed"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {state === "completed" ? <Check size={16} strokeWidth={3} /> : index + 1}
                </span>
                {showLabels && (
                  <div className="mt-2 text-center">
                    <span
                      className={`block text-xs font-medium leading-tight ${
                        state === "active"
                          ? "text-slate-900"
                          : state === "completed"
                            ? "text-slate-600"
                            : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </span>
                    {step.optional && state !== "completed" && (
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {t.optional}
                      </span>
                    )}
                  </div>
                )}
              </li>
              {!isLast && (
                <div
                  aria-hidden="true"
                  className={`flex-1 mt-4 h-1 rounded-full transition-colors duration-300 ${
                    connectorCompleted ? "bg-emerald-400" : "bg-slate-200"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
}
