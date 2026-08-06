"use client";

import React from "react";
import StudentSearchPicker, {
  Student as PickerStudent,
} from "@/components/enrollments/StudentSearchPicker";
import StudentFormFields, {
  StudentFormValues,
} from "@/components/students/StudentFormFields";
import { Loader2 } from "lucide-react";

export interface StudentStepLabels {
  selectStudent: string;
  searchStudent: string;
  orNewStudent: string;
  noResults: string;
  createStudentTitle: string;
  createStudentSubtitle: string;
  studentCode: string;
  fullName: string;
  email: string;
  nameInvalid: string;
  saveStudent: string;
  backToSearch: string;
  studentLockedHint: string;
  changeStudent: string;
}

interface StudentStepProps {
  mode: "select" | "create";
  onModeChange: (mode: "select" | "create") => void;
  students: PickerStudent[];
  selectedStudent: {
    id: string;
    full_name: string;
    student_code: string;
  } | null;
  onSelectStudent: (studentId: string, label: string) => void;
  createStudentForm: StudentFormValues;
  onCreateStudentFormChange: (next: StudentFormValues) => void;
  nameError: string;
  onClearNameError: () => void;
  onCreateStudent: () => void;
  onChangeSelectedStudent: () => void;
  submitting: boolean;
  error?: string;
  labels: StudentStepLabels;
}

export default function StudentStep({
  mode,
  onModeChange,
  students,
  selectedStudent,
  onSelectStudent,
  createStudentForm,
  onCreateStudentFormChange,
  nameError,
  onClearNameError,
  onCreateStudent,
  onChangeSelectedStudent,
  submitting,
  error,
  labels,
}: StudentStepProps) {
  if (selectedStudent) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <div>
            <p className="text-xs text-slate-500">{labels.studentLockedHint}</p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {selectedStudent.full_name}
              <span className="text-sm text-slate-500 font-normal ms-2">
                {selectedStudent.student_code}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeSelectedStudent}
            disabled={submitting}
            className="btn-secondary text-sm"
          >
            {labels.changeStudent}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="animate-fade-in">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-800">
            {labels.createStudentTitle}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {labels.createStudentSubtitle}
          </p>
        </div>
        <StudentFormFields
          values={createStudentForm}
          onChange={onCreateStudentFormChange}
          labels={{
            studentCode: labels.studentCode,
            fullName: labels.fullName,
            email: labels.email,
          }}
          nameError={nameError}
          onClearNameError={onClearNameError}
          autoFocusCode
          emailFullWidth
        />
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCreateStudent}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting && <Loader2 size={15} className="animate-spin me-1" />}
            {labels.saveStudent}
          </button>
          <button
            type="button"
            onClick={() => onModeChange("select")}
            disabled={submitting}
            className="btn-secondary"
          >
            {labels.backToSearch}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <StudentSearchPicker
        students={students}
        onSelect={onSelectStudent}
        onCreateNew={() => onModeChange("create")}
        labels={{
          selectStudent: labels.selectStudent,
          searchStudent: labels.searchStudent,
          orNewStudent: labels.orNewStudent,
          noResults: labels.noResults,
        }}
      />
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}