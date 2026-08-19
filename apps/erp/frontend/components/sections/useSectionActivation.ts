"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/api";

interface SectionInfo {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
  status: string;
  min_students_required: number | null;
  start_date: string | null;
  end_date: string | null;
  class_time: string | null;
  class_duration_minutes: number | null;
  classroom: string | null;
  price: number | null;
  flags?: Record<string, any>;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
}

interface ContractInfo {
  id: string;
  section_id: string;
  teacher_id: string;
  status: string;
  fixed_amount: number | null;
  percentage: number | null;
  total_earned: number;
  total_paid: number;
  created_at: string;
}

interface ActivationOptions {
  sectionId: string;
  locale: string;
  t: any;
  onSuccess?: (section: SectionInfo, contract?: ContractInfo) => void;
}

export function useSectionActivation({ sectionId, locale, t, onSuccess }: ActivationOptions) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translateActivationError = useCallback((detail: string) => {
    if (locale === "en") return detail;
    const patterns: [RegExp, (...m: string[]) => string][] = [
      [/^Cannot activate a contract without a teacher$/, () => t.errNoTeacherActivate],
      [/^Cannot activate a contract without a compensation model$/, () => t.errNoCompModel],
      [/^Cannot activate a section without a price/, () => t.errMissingPrice],
      [/^Cannot activate a section without a start date/, () => t.errMissingStartDate],
      [/^Cannot activate a section without a class time/, () => t.errMissingClassTime],
      [/^Cannot activate section\. Missing required fields: (.+)$/, (fields) => `${t.errActivateMissingFields} ${fields}`],
      [/^Only ASSIGNED contracts can be activated, current: (.+)$/, (s) => `${t.errOnlyAssigned}، الحالة الحالية: ${s}`],
    ];
    for (const [regex, fn] of patterns) {
      const m = detail.match(regex);
      if (m) return fn(...m.slice(1));
    }
    return detail;
  }, [locale, t]);

  const activate = useCallback(async (section: SectionInfo) => {
    setError(null);
    const missing: string[] = [];
    if (section.price == null) missing.push(t.errMissingPrice);
    if (!section.teacher_id) missing.push(t.errMissingTeacher);
    if (!section.start_date) missing.push(t.errMissingStartDate);
    if (!section.class_time) missing.push(t.errMissingClassTime);
    if (missing.length > 0) {
      setError(`${t.errActivateMissingFields} ${missing.join(", ")}`);
      return;
    }
    setActivating(true);
    try {
      await apiClient.post(`/lms/sections/${sectionId}/contract/activate`);
      setError(null);
      const [contractRes, sectionRes] = await Promise.all([
        apiClient.get<ContractInfo>(`/lms/sections/${sectionId}/contract`).catch(() => null),
        apiClient.get<{ items: SectionInfo[]; total: number }>("/academic/course-sections?limit=1000").catch(() => null),
      ]);
      if (onSuccess) {
        const updatedSection = sectionRes?.data?.items.find((s) => s.id === sectionId) || section;
        onSuccess(updatedSection, contractRes?.data);
      }
    } catch (activateErr) {
      const err = activateErr as { response?: { data?: { detail?: string } } };
      const detail = err?.response?.data?.detail;
      setError(detail ? translateActivationError(detail) : t.activationFailed);
    } finally {
      setActivating(false);
    }
  }, [sectionId, t, onSuccess, translateActivationError]);

  return { activate, activating, error, setError };
}
