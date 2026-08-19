"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Construction } from "lucide-react";

export default function IngestionPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";

  return (
    <div className="max-w-6xl mx-auto text-center py-20">
      <Construction className="mx-auto text-slate-300 mb-4" size={64} />
      <h2 className="text-lg font-bold text-slate-900 mb-2">
        {locale === "ar" ? "استيراد المناهج" : "Curriculum Ingestion"}
      </h2>
      <p className="text-sm text-slate-400">
        {locale === "ar" ? "قيد التطوير" : "Coming soon"}
      </p>
    </div>
  );
}
