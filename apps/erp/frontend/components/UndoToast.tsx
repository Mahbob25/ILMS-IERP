"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Undo2, X } from "lucide-react";

interface UndoToastProps {
  message: string;
  durationSeconds?: number;
  isRtl?: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export default function UndoToast({
  message,
  durationSeconds = 30,
  isRtl = false,
  onUndo,
  onDismiss,
}: UndoToastProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const undoneRef = useRef(false);

  useEffect(() => {
    if (durationSeconds <= 0) {
      onDismiss();
      return;
    }

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [durationSeconds, onDismiss]);

  useEffect(() => {
    if (remaining === 0 && !undoneRef.current) {
      onDismiss();
    }
  }, [remaining, onDismiss]);

  const handleUndo = useCallback(() => {
    undoneRef.current = true;
    onUndo();
  }, [onUndo]);

  const progressPct = (remaining / durationSeconds) * 100;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-md w-[calc(100%-2rem)]"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-sm flex-1 truncate">{message}</span>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 text-xs font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <Undo2 size={14} />
          <span>{isRtl ? "تراجع" : "Undo"}</span>
          <span className="tabular-nums opacity-60">
            {remaining}s
          </span>
        </button>
        <button
          onClick={onDismiss}
          className="text-white/40 hover:text-white/80 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
      <div
        className="h-1 bg-white/20 rounded-full mt-1 overflow-hidden"
      >
        <div
          className="h-full bg-white/50 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}