"use client";

import React from "react";

export interface StudentFormValues {
  student_code: string;
  full_name: string;
  email: string;
  phone: string;
  parent_full_name: string;
  parent_phone: string;
  parent_email: string;
  parent_relationship: string;
}

export interface StudentFormLabels {
  studentCode: string;
  fullName: string;
  email: string;
  phone: string;
  parentTitle: string;
  parentFullName: string;
  parentPhone: string;
  parentEmail: string;
  parentRelationship: string;
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
      <div className={emailFullWidth ? "md:col-span-2" : undefined}>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.phone}
        </label>
        <input
          type="tel"
          value={values.phone}
          onChange={(e) => onChange({ ...values, phone: e.target.value })}
          className="input-field"
          dir="ltr"
        />
      </div>

      <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-2">
        <p className="text-xs font-semibold text-slate-500">{labels.parentTitle}</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.parentFullName}
        </label>
        <input
          type="text"
          value={values.parent_full_name}
          onChange={(e) => onChange({ ...values, parent_full_name: e.target.value })}
          className="input-field"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.parentRelationship}
        </label>
        <input
          type="text"
          value={values.parent_relationship}
          onChange={(e) => onChange({ ...values, parent_relationship: e.target.value })}
          className="input-field"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.parentPhone}
        </label>
        <input
          type="tel"
          value={values.parent_phone}
          onChange={(e) => onChange({ ...values, parent_phone: e.target.value })}
          className="input-field"
          dir="ltr"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.parentEmail}
        </label>
        <input
          type="email"
          value={values.parent_email}
          onChange={(e) => onChange({ ...values, parent_email: e.target.value })}
          className="input-field"
        />
      </div>
    </div>
  );
}
