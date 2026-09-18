"use client";

import { useParams } from "next/navigation";
import PromoStudioWizard from "@/components/promo/PromoStudioWizard";

export default function PromoStudioPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  return <PromoStudioWizard locale={locale} />;
}
