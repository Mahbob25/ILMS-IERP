"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { apiClient } from "@/lib/api";
import { escapeLikeWildcards } from "@/lib/utils/input";

export interface Student {
  id: string;
  student_code: string;
  full_name: string;
}

export interface StudentSearchLabels {
  selectStudent: string;
  searchStudent: string;
  orNewStudent: string;
  noResults: string;
}

export interface StudentSearchPickerHandle {
  setSearchText: (text: string) => void;
}

interface StudentSearchPickerProps {
  students: Student[];
  onSelect: (studentId: string, label: string) => void;
  onCreateNew: () => void;
  labels: StudentSearchLabels;
}

const StudentSearchPicker = forwardRef<
  StudentSearchPickerHandle,
  StudentSearchPickerProps
>(function StudentSearchPicker(
  { students, onSelect, onCreateNew, labels },
  ref
) {
  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [studentSearchResults, setStudentSearchResults] = useState<Student[]>(
    []
  );
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({ setSearchText: setStudentSearch }), []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleStudentSearch = (query: string) => {
    setStudentSearch(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setStudentSearchResults(students);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ items: Student[]; total: number }>(
          `/academic/students?search=${encodeURIComponent(escapeLikeWildcards(query))}&limit=20`
        );
        setStudentSearchResults(res.data.items);
      } catch {
        setStudentSearchResults([]);
      }
    }, 300);
  };

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {labels.selectStudent}
      </label>
      <input
        type="text"
        value={studentSearch}
        onChange={(e) => handleStudentSearch(e.target.value)}
        onFocus={() => {
          setShowStudentDropdown(true);
          setStudentSearchResults(students);
        }}
        onBlur={() => setTimeout(() => setShowStudentDropdown(false), 200)}
        placeholder={labels.searchStudent}
        className="input-field"
      />
      {showStudentDropdown && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {studentSearchResults.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">
              {labels.noResults}
            </div>
          ) : (
            studentSearchResults.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={() => {
                  onSelect(s.id, `${s.full_name} (${s.student_code})`);
                  setStudentSearch(`${s.full_name} (${s.student_code})`);
                  setShowStudentDropdown(false);
                }}
                className="w-full text-start px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{s.full_name}</span>
                <span className="text-slate-400 ms-2">{s.student_code}</span>
              </button>
            ))
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setShowStudentDropdown(false);
          onCreateNew();
        }}
        className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
      >
        {labels.orNewStudent}
      </button>
    </div>
  );
});

export default StudentSearchPicker;
