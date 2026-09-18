"use client";

import { useParams } from "next/navigation";
import PromoStudioWizard from "@/components/promo/PromoStudioWizard";

export default function PromoStudioResumePage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const id = params?.id as string | undefined;
  return <PromoStudioWizard locale={locale} initialProjectId={id} />;
}
