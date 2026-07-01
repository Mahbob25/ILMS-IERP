import React from "react";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isRtl?: boolean;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "نعم",
  cancelLabel = "لا",
  onConfirm,
  onCancel,
  isRtl = false,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          </div>
          <button onClick={onCancel} className="btn-icon">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onCancel} className="btn-secondary">{cancelLabel}</button>
          <button onClick={onConfirm} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
