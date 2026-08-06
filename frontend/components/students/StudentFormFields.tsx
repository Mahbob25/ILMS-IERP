"use client";

import React from "react";

export interface StudentFormValues {
  student_code: string;
  full_name: string;
  email: string;
}

export interface StudentFormLabels {
  studentCode: string;
  fullName: string;
  email: string;
}

interface StudentFormFieldsProps {
  values: StudentFormValues;
  onChange: (next: StudentFormValues) => void;
  labels: StudentFormLabels;
  nameError?: string;
  onClearNameError?: () => void;
  autoFocusCode?: boolean;
  emailFullWidth?: boolean;
}

export default function StudentFormFields({
  values,
  onChange,
  labels,
  nameError,
  onClearNameError,
  autoFocusCode = false,
  emailFullWidth = false,
}: StudentFormFieldsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.studentCode}
        </label>
        <input
          type="text"
          value={values.student_code}
          onChange={(e) =>
            onChange({ ...values, student_code: e.target.value })
          }
          className="input-field"
          autoFocus={autoFocusCode}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.fullName}
        </label>
        <input
          type="text"
          value={values.full_name}
          onChange={(e) => {
            onClearNameError?.();
            onChange({ ...values, full_name: e.target.value });
          }}
          className="input-field"
        />
        {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
      </div>
      <div className={emailFullWidth ? "md:col-span-2" : undefined}>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.email}
        </label>
        <input
          type="email"
          value={values.email}
          onChange={(e) => onChange({ ...values, email: e.target.value })}
          className="input-field"
        />
      </div>
    </div>
  );
}
