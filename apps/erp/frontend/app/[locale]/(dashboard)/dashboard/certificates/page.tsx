"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import CertificatesTable from "@/components/certificates/CertificatesTable";

export default function CertificatesPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الشهادات",
      subtitle: "إدارة شهادات إتمام المقررات",
    },
    en: {
      title: "Certificates",
      subtitle: "Manage course completion certificates",
    },
  }[locale === "en" ? "en" : "ar"];

  const [refreshKey, setRefreshKey] = useState(0);

  const canDelete = Boolean(user?.is_superadmin || user?.role?.name === "manager");

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={async () => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <CertificatesTable
        isRtl={isRtl}
        locale={locale}
        canDelete={canDelete}
        showFilters
        refreshKey={refreshKey}
      />
    </div>
  );
}
