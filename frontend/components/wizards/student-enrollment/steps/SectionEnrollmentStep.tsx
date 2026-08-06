"use client";

import React from "react";
import EnrollmentFormFields from "@/components/enrollments/EnrollmentFormFields";

export interface SectionEnrollmentStepLabels {
  selectStudent: string;
  selectSection: string;
  discount: string;
  sectionNotSelected: string;
}

interface SectionEnrollmentStepProps {
  studentName: string;
  sectionId: string;
  onSectionChange: (sectionId: string) => void;
  sections: { id: string; course_id: string; status: string }[];
  getSectionLabel: (sectionId: string) => string;
  showDiscount: boolean;
  discount: string;
  onDiscountChange: (value: string) => void;
  error: string;
  labels: SectionEnrollmentStepLabels;
}

export default function SectionEnrollmentStep({
  studentName,
  sectionId,
  onSectionChange,
  sections,
  getSectionLabel,
  showDiscount,
  discount,
  onDiscountChange,
  error,
  labels,
}: SectionEnrollmentStepProps) {
  return (
    <div className="animate-fade-in">
      <EnrollmentFormFields
        studentId=""
        onStudentChange={() => {}}
        sectionId={sectionId}
        onSectionChange={onSectionChange}
        sections={sections}
        getSectionLabel={getSectionLabel}
        showDiscount={showDiscount}
        discount={discount}
        onDiscountChange={onDiscountChange}
        students={[]}
        onCreateNewStudent={() => {}}
        labels={{
          selectStudent: labels.selectStudent,
          searchStudent: "",
          orNewStudent: "",
          noResults: "",
          selectSection: labels.selectSection,
          discount: labels.discount,
        }}
        lockedStudent
        lockedStudentName={studentName}
      />
      {error && (
        <p className="text-sm text-red-600 mt-3">{error}</p>
      )}
    </div>
  );
}