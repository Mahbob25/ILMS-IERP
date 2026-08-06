"use client";

import React from "react";
import { useParams } from "next/navigation";
import StudentEnrollmentWizard from "@/components/wizards/student-enrollment/StudentEnrollmentWizard";

export default function StudentEnrollmentWizardPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  return (
    <div className="py-4">
      <StudentEnrollmentWizard locale={locale} isRtl={isRtl} />
    </div>
  );
}