"use client";

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { UserCheck } from "lucide-react";
import Select from "@/components/ui/Select";
import StudentSearchPicker, {
  Student,
  StudentSearchPickerHandle,
} from "./StudentSearchPicker";

interface CourseSection {
  id: string;
  course_id: string;
  status: string;
}

export type EnrollmentFormFieldsHandle = StudentSearchPickerHandle;

export interface EnrollmentFormLabels {
  selectStudent: string;
  searchStudent: string;
  orNewStudent: string;
  noResults: string;
  selectSection: string;
  discount: string;
}

interface EnrollmentFormFieldsProps {
  studentId: string;
  onStudentChange: (studentId: string) => void;
  sectionId: string;
  onSectionChange: (sectionId: string) => void;
  sections: CourseSection[];
  getSectionLabel: (sectionId: string) => string;
  showDiscount: boolean;
  discount: string;
  onDiscountChange: (value: string) => void;
  students: Student[];
  onCreateNewStudent: () => void;
  labels: EnrollmentFormLabels;
  lockedStudent?: boolean;
  lockedStudentName?: string;
}

const EnrollmentFormFields = forwardRef<
  EnrollmentFormFieldsHandle,
  EnrollmentFormFieldsProps
>(function EnrollmentFormFields(
  {
    studentId,
    onStudentChange,
    sectionId,
    onSectionChange,
    sections,
    getSectionLabel,
    showDiscount,
    discount,
    onDiscountChange,
    students,
    onCreateNewStudent,
    labels,
    lockedStudent = false,
    lockedStudentName = "",
  },
  ref
) {
  const pickerRef = useRef<StudentSearchPickerHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      setSearchText: (text) => pickerRef.current?.setSearchText(text),
    }),
    []
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {lockedStudent ? (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {labels.selectStudent}
          </label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
            <UserCheck size={16} className="text-slate-400 shrink-0" />
            <span className="font-medium truncate">{lockedStudentName}</span>
          </div>
        </div>
      ) : (
        <StudentSearchPicker
          ref={pickerRef}
          students={students}
          onSelect={(studentId) => onStudentChange(studentId)}
          onCreateNew={onCreateNewStudent}
          labels={{
            selectStudent: labels.selectStudent,
            searchStudent: labels.searchStudent,
            orNewStudent: labels.orNewStudent,
            noResults: labels.noResults,
          }}
        />
      )}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {labels.selectSection}
        </label>
        <Select
          value={sectionId}
          onChange={(value) => onSectionChange(value)}
          options={sections
            .filter((s) => s.status !== "completed" && s.status !== "cancelled")
            .map((s) => ({ value: s.id, label: getSectionLabel(s.id) }))}
          placeholder="—"
        />
      </div>
      {showDiscount && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {labels.discount}
          </label>
          <input
            type="number"
            value={discount}
            onChange={(e) => onDiscountChange(e.target.value)}
            className="input-field"
            min={0}
            max={100}
          />
        </div>
      )}
    </div>
  );
});

export default EnrollmentFormFields;