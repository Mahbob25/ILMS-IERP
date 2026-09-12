"use client";

import React from "react";

interface PrintStudent {
  id: string;
  full_name: string;
  student_code: string;
}

interface AttendancePrintSheetProps {
  t: ReturnType<typeof import("./attendancePrintTranslations").getAttendancePrintTranslations>;
  isRtl: boolean;
  instituteName?: string;
  courseName: string;
  sectionMeta: string;
  teacherName: string;
  dateStr: string;
  students: PrintStudent[];
}

export default function AttendancePrintSheet({
  t,
  isRtl,
  instituteName,
  courseName,
  sectionMeta,
  teacherName,
  dateStr,
  students,
}: AttendancePrintSheetProps) {
  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="print-sheet bg-white">
      <div className="border border-slate-300 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-300 bg-slate-50 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {instituteName && <p className="text-xs font-semibold text-slate-500">{instituteName}</p>}
            <h1 className="text-lg font-bold text-slate-900">{t.title}</h1>
            <p className="text-xs text-slate-500">{t.subtitle}</p>
          </div>
          <div className="text-xs text-slate-600 text-end shrink-0">
            <p><span className="font-semibold">{t.date}:</span> {dateStr}</p>
            <p className="mt-0.5"><span className="font-semibold">{t.course}:</span> {courseName || "—"}</p>
            <p className="mt-0.5"><span className="font-semibold">{t.section}:</span> {sectionMeta || "—"}</p>
            <p className="mt-0.5"><span className="font-semibold">{t.teacher}:</span> {teacherName || "—"}</p>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-300">
              <th className="px-2 py-2 text-center font-semibold text-slate-700 border-e border-slate-200 w-10">{t.seq}</th>
              <th className="px-3 py-2 text-start font-semibold text-slate-700 border-e border-slate-200">{t.studentName}</th>
              <th className="px-3 py-2 text-start font-semibold text-slate-700 border-e border-slate-200 w-28">{t.studentCode}</th>
              <th className="px-2 py-2 text-center font-semibold text-slate-700 border-e border-slate-200 w-14">{t.present}</th>
              <th className="px-2 py-2 text-center font-semibold text-slate-700 border-e border-slate-200 w-14">{t.absent}</th>
              <th className="px-2 py-2 text-center font-semibold text-slate-700 border-e border-slate-200 w-14">{t.late}</th>
              <th className="px-2 py-2 text-center font-semibold text-slate-700 border-e border-slate-200 w-14">{t.excused}</th>
              <th className="px-3 py-2 text-start font-semibold text-slate-700 w-28">{t.notes}</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {t.empty}
                </td>
              </tr>
            ) : (
              students.map((s, idx) => (
                <tr key={s.id} className="border-b border-slate-200 print-row">
                  <td className="px-2 py-2.5 text-center text-slate-600 border-e border-slate-200">{idx + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 border-e border-slate-200">{s.full_name}</td>
                  <td className="px-3 py-2.5 text-slate-600 border-e border-slate-200">{s.student_code}</td>
                  <td className="px-2 py-2.5 border-e border-slate-200">
                    <div className="mx-auto w-5 h-5 rounded border border-slate-300 bg-white" />
                  </td>
                  <td className="px-2 py-2.5 border-e border-slate-200">
                    <div className="mx-auto w-5 h-5 rounded border border-slate-300 bg-white" />
                  </td>
                  <td className="px-2 py-2.5 border-e border-slate-200">
                    <div className="mx-auto w-5 h-5 rounded border border-slate-300 bg-white" />
                  </td>
                  <td className="px-2 py-2.5 border-e border-slate-200">
                    <div className="mx-auto w-5 h-5 rounded border border-slate-300 bg-white" />
                  </td>
                  <td className="px-3 py-2.5 border-e border-slate-200" />
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="px-4 py-4 flex justify-between text-xs text-slate-600 border-t border-slate-300">
          <div className="flex flex-col gap-6">
            <span>{t.signatureTeacher}: ______________________</span>
            <span className="text-[10px] text-slate-400">{t.page}: <span className="print-page-number" /></span>
          </div>
          <span>{t.signatureAdmin}: ______________________</span>
        </div>
      </div>
    </div>
  );
}
