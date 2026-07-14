"use client";

import React from "react";
import { Lock } from "lucide-react";

interface AccessDeniedProps {
  message?: string;
}

export default function AccessDenied({
  message = "You do not have permission to access this resource.",
}: AccessDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <Lock size={32} className="text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
      <p className="text-slate-500 max-w-md">{message}</p>
    </div>
  );
}
