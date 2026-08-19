"use client";

import React from "react";
import { X, AlertCircle } from "lucide-react";

interface BulkAction {
  label: string;
  icon: React.ReactNode;
  variant?: "danger" | "default";
  onClick: () => void;
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onDeselectAll: () => void;
  actions: BulkAction[];
  isRtl: boolean;
  message?: { type: "success" | "error"; text: string } | null;
  onDismissMessage?: () => void;
}

export default function BulkActionBar({
  selectedCount,
  onDeselectAll,
  actions,
  isRtl,
  message,
  onDismissMessage,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 mb-4 space-y-2"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-brand-800">
            {selectedCount}{" "}
            {isRtl ? "عنصر محدد" : selectedCount === 1 ? "item selected" : "items selected"}
          </span>
          <div className="flex items-center gap-1.5">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  action.variant === "danger"
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onDeselectAll}
          className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1"
        >
          <X size={14} />
          <span>{isRtl ? "إلغاء التحديد" : "Deselect"}</span>
        </button>
      </div>
      {message && (
        <div
          className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${
            message.type === "success"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          <AlertCircle size={12} />
          <span>{message.text}</span>
          {onDismissMessage && (
            <button
              onClick={onDismissMessage}
              className="ms-auto hover:opacity-70"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
