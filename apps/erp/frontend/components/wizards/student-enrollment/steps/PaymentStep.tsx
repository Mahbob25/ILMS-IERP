"use client";

import React from "react";
import PaymentFormFields, {
  PaymentFormState,
  PaymentSummary,
  PaymentFormLabels,
} from "@/components/payments/PaymentFormFields";

export type PaymentStepLabels = PaymentFormLabels;

interface PaymentStepProps {
  form: PaymentFormState;
  onFormChange: (patch: Partial<PaymentFormState>) => void;
  summary: PaymentSummary | null;
  enrollmentOptions: { value: string; label: string }[];
  onEnrollmentSelect: (enrollmentId: string) => void;
  showEnrollmentSelect?: boolean;
  error: string;
  labels: PaymentStepLabels;
}

export default function PaymentStep({
  form,
  onFormChange,
  summary,
  enrollmentOptions,
  onEnrollmentSelect,
  showEnrollmentSelect,
  error,
  labels,
}: PaymentStepProps) {
  return (
    <div className="animate-fade-in">
      <PaymentFormFields
        form={form}
        onFormChange={onFormChange}
        enrollmentOptions={enrollmentOptions}
        onEnrollmentSelect={onEnrollmentSelect}
        showEnrollmentSelect={showEnrollmentSelect}
        summary={summary}
        formError={error}
        labels={labels}
      />
    </div>
  );
}