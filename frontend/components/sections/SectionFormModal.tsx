"use client";

import React, { useState } from "react";
import { apiClient } from "@/lib/api";
import { sanitizeInput } from "@/lib/utils/input";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";

interface FormData {
  course_id: string;
  teacher_id: string;
  capacity: number;
  min_students_required: number;
  start_date: string;
  end_date: string;
  class_time: string;
  class_duration_minutes: number;
  classroom: string;
  price: string;
  teacher_percentage: string;
  comp_model: string;
  teacher_salary: string;
}

interface Course {
  id: string;
  name: string;
  code: string;
}

interface SectionFormModalProps {
  open: boolean;
  onClose: () => void;
  sectionId: string | null;
  form: FormData;
  onFormChange: (form: FormData) => void;
  onSave: () => void;
  t: any;
  courses: Course[];
  teachers: any[];
  teacherDefaultMap: Record<string, { default_salary: number | null; default_percentage: number | null }>;
  user: any;
  message: { type: "success" | "error"; text: string } | null;
  onMessageClear: () => void;
  onShowMessage: (msg: { type: "success" | "error"; text: string }) => void;
  submitting?: boolean;
}

export default function SectionFormModal({
  open,
  onClose,
  sectionId,
  form,
  onFormChange,
  onSave,
  t,
  courses,
  teachers,
  teacherDefaultMap,
  user,
  message,
  onMessageClear,
  onShowMessage,
  submitting = false,
}: SectionFormModalProps) {
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  const [increaseReason, setIncreaseReason] = useState("");
  const [increaseAmount, setIncreaseAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const updateField = (field: Partial<FormData>) => {
    onFormChange({ ...form, ...field });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave());
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={sectionId ? t.edit : t.add} size="xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.course}</label>
              <Select
                value={form.course_id}
                onChange={(value) => updateField({ course_id: value })}
                options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
                placeholder="--"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.teacher}</label>
              <Select
                value={form.teacher_id}
                onChange={(value) => {
                  const def = teacherDefaultMap[value];
                  updateField({
                    teacher_id: value,
                    teacher_percentage: def?.default_percentage?.toString() || "",
                    teacher_salary: def?.default_salary?.toString() || "",
                  });
                }}
                options={teachers.map((u) => ({ value: u.id, label: u.full_name }))}
                placeholder="--"
              />
            </div>
            {form.teacher_id && (
              <div className="col-span-2 bg-blue-50 p-3 rounded border border-blue-200">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{t.compModel || "Compensation"}</label>
                    <Select
                      value={form.comp_model}
                      onChange={(value) => updateField({ comp_model: value })}
                      options={[
                        { value: "fixed", label: "Fixed Amount" },
                        { value: "percentage", label: "Percentage" },
                      ]}
                      placeholder="--"
                    />
                  </div>
                  {form.comp_model === "fixed" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{t.fixedAmount || "Fixed Amount (SAR)"}</label>
                      <input
                        type="number"
                        value={form.teacher_salary}
                        onChange={(e) => updateField({ teacher_salary: e.target.value })}
                        className="input-field"
                        min={0}
                        readOnly={user?.role?.name === "secretary"}
                      />
                    </div>
                  )}
                  {form.comp_model === "percentage" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{t.teacherPctLabel}</label>
                      <input
                        type="number"
                        value={form.teacher_percentage}
                        onChange={(e) => updateField({ teacher_percentage: e.target.value })}
                        className="input-field"
                        min={0}
                        max={100}
                        readOnly={user?.role?.name === "secretary"}
                      />
                    </div>
                  )}
                  {sectionId && (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => setShowIncreaseModal(true)}
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100"
                      >
                        {t.requestIncrease || "Request Increase"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.capacity}</label>
              <input
                type="number"
                value={form.capacity}
                onChange={(e) => updateField({ capacity: parseInt(e.target.value) || 0 })}
                className="input-field"
                min={1}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.minStudents}</label>
              <input
                type="number"
                value={form.min_students_required}
                onChange={(e) => updateField({ min_students_required: parseInt(e.target.value) || 0 })}
                className="input-field"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.startDate}</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => updateField({ start_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.endDate}</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => updateField({ end_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.classTime}</label>
              <input
                type="time"
                value={form.class_time}
                onChange={(e) => updateField({ class_time: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.classDuration}</label>
              <input
                type="number"
                value={form.class_duration_minutes}
                onChange={(e) => updateField({ class_duration_minutes: parseInt(e.target.value) || 0 })}
                className="input-field"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.classroom}</label>
              <input
                type="text"
                value={form.classroom}
                onChange={(e) => updateField({ classroom: e.target.value })}
                className="input-field"
                placeholder="A101"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.price}</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => updateField({ price: e.target.value })}
                className="input-field"
                min={0}
                placeholder="0"
              />
            </div>
          </div>
          {message && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {message.text}
              <button onClick={onMessageClear} className="ms-2 float-end">&times;</button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={submitting || saving} className="btn-primary">{submitting || saving ? "..." : t.save}</button>
            <button onClick={onClose} className="btn-secondary">{t.cancel}</button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showIncreaseModal}
        onClose={() => setShowIncreaseModal(false)}
        title={t.requestIncrease || "Request Compensation Increase"}
        size="md"
      >
        <div className="space-y-6">
          {form.teacher_id && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.currentTerms || "Current Terms"}</label>
                <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                  {form.comp_model === "fixed"
                    ? `Fixed: SAR ${form.teacher_salary || "—"}`
                    : form.comp_model === "percentage"
                      ? `Percentage: ${form.teacher_percentage || "—"}%`
                      : "Not set"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {form.comp_model === "percentage" ? t.newPercentage || "New Percentage" : t.newAmount || "New Amount"}
                  <span className="text-red-500"> *</span>
                </label>
                <input
                  type="number"
                  value={increaseAmount}
                  onChange={(e) => setIncreaseAmount(e.target.value)}
                  className="input-field"
                  min={0}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.reason || "Reason"} <span className="text-red-500">*</span></label>
                <textarea
                  value={increaseReason}
                  onChange={(e) => setIncreaseReason(e.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder={t.reasonPlaceholder || "Explain why the increase is needed..."}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={async () => {
                    if (!increaseAmount || !increaseReason || !sectionId || submitting) return;
                    setSaving(true);
                    try {
                      await apiClient.post(`/lms/sections/${sectionId}/contract/amend`, {
                        requested_amount: parseFloat(increaseAmount),
                        reason: sanitizeInput(increaseReason),
                      });
                      setShowIncreaseModal(false);
                      setIncreaseAmount("");
                      setIncreaseReason("");
                      onShowMessage({ type: "success", text: t.requestSubmitted || "Increase request submitted" });
                    } catch (e) {
                      const err = e as { response?: { data?: { detail?: string } } };
                      onShowMessage({ type: "error", text: err?.response?.data?.detail || "Failed to submit increase request" });
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="btn-primary"
                  disabled={submitting || saving}
                >
                  {t.submit || "Submit"}
                </button>
                <button onClick={() => setShowIncreaseModal(false)} className="btn-secondary">{t.cancel}</button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
