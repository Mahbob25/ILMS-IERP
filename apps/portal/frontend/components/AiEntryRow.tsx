"use client";

import React from "react";
import { Sparkles } from "lucide-react";

interface Props {
  onOpen: () => void;
  labels: {
    title: string;
    body: string;
    cta: string;
    soon: string;
  };
}

/**
 * A quiet entry point to the AI tutor, labelled honestly.
 *
 * The enqueue path exists but no worker consumes `ai:student` yet, so answers
 * never arrive — the copy says so rather than letting a student wait for a
 * reply that cannot come.
 */
export default function AiEntryRow({ onOpen, labels }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-start flex items-center gap-3 py-3 hover:opacity-90 transition-opacity"
    >
      <span className="w-9 h-9 rounded-lg bg-ai-50 border border-ai-100 text-ai-600 flex items-center justify-center shrink-0">
        <Sparkles size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display text-sm font-semibold text-slate-900 block truncate">
          {labels.title}
        </span>
        <span className="text-[11px] text-slate-500 block line-clamp-2">{labels.body}</span>
      </span>
      <span className="text-[10px] font-medium text-ai-700 bg-ai-50 border border-ai-100 rounded-full px-2 py-0.5 shrink-0">
        {labels.soon}
      </span>
      <span className="text-xs text-brand-700 shrink-0">{labels.cta}</span>
    </button>
  );
}
