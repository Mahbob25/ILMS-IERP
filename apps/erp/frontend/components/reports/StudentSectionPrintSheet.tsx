"use client";

import React from "react";
import { formatDisplayDate } from "@/lib/dates";
import TableContainer from "@/components/ui/TableContainer";

type ReportPayload = {
  student: { id: string; student_code: string; full_name: string; email: string | null };
  section: {
    id: string;
    course_name: string;
    course_code: string;
    teacher_name: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    schedule_label: string;
    classroom: string | null;
    class_time: string | null;
    price: number | null;
  };
  enrollment: {
    id: string;
    enrolled_at: string | null;
    agreed_price: number | null;
    admin_discount: number | null;
    net_price: number | null;
    total_paid: number;
    balance_remaining: number | null;
    unenroll_record: { unenrolled_at: string | null; reason: string; refund_policy: string; refund_authorized_amount: number } | null;
    cancellation: { cancelled_at: string | null; reason: string; refund_policy: string } | null;
  };
  attendance: {
    summary: { total_sessions: number; present_count: number; absent_count: number; late_count: number; excused_count: number; attendance_rate: number };
    records: { date: string | null; status: string; session_id: string }[];
  };
  grade: { final_score: number; grade_label: string; notes: string | null; graded_at: string | null; graded_by: string | null } | null;
  payments: { id: string; receipt_number: string; amount: number; date: string | null; payment_method: string; created_by_name: string }[];
  certificate: { certificate_number: string; issued_at: string | null; final_score: number | null; grade_label: string | null } | null;
  ai_summary: string | null;
  ai_suggestions: string[];
  generated_at: string;
};

interface Props {
  t: Record<string, string>;
  isRtl: boolean;
  instituteName: string;
  payload: ReportPayload;
  locale: string;
}

function StatusBadge({ status, isRtl }: { status: string; isRtl: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    present: { label: isRtl ? "حاضر" : "Present", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    absent: { label: isRtl ? "غائب" : "Absent", cls: "bg-red-50 text-red-700 border-red-200" },
    late: { label: isRtl ? "متأخر" : "Late", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    excused: { label: isRtl ? "معذور" : "Excused", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  };
  const entry = map[status] || { label: status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${entry.cls}`}>{entry.label}</span>;
}

export default function StudentSectionPrintSheet({ t, isRtl, instituteName, payload, locale }: Props) {
  const { student, section, enrollment, attendance, grade, payments, certificate, ai_summary } = payload;
  const summary = attendance.summary;
  const hasFinance = section.price != null || payments.length > 0 || enrollment.balance_remaining != null || enrollment.agreed_price != null;
  const sar = t.sar || "YER";
  const money = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(2)} ${sar}`);

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="print-sheet bg-white">
      <div className="border border-slate-300 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-300 bg-slate-50 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {instituteName && <p className="text-xs font-semibold text-slate-500">{instituteName}</p>}
            <h1 className="text-lg font-bold text-slate-900">{t.reportTitle}</h1>
            <p className="text-xs text-slate-500">{section.course_name} {section.course_code ? `(${section.course_code})` : ""} · {student.full_name} ({student.student_code})</p>
          </div>
          <div className="text-xs text-slate-600 text-end shrink-0 space-y-0.5">
            <p><span className="font-semibold">{t.student}:</span> {student.full_name}</p>
            <p><span className="font-semibold">{t.studentCode}:</span> {student.student_code}</p>
            {student.email && <p><span className="font-semibold">{t.email}:</span> {student.email}</p>}
            <p><span className="font-semibold">{t.course}:</span> {section.course_name}</p>
            <p><span className="font-semibold">{t.teacher}:</span> {section.teacher_name || "—"}</p>
            <p><span className="font-semibold">{t.status}:</span> {section.status}</p>
            <p><span className="font-semibold">{t.schedule}:</span> {section.schedule_label || (section.classroom ? `Room ${section.classroom}` : "—")}{section.start_date ? ` · ${formatDisplayDate(section.start_date, locale)}` : ""}{section.end_date ? ` → ${formatDisplayDate(section.end_date, locale)}` : ""}</p>
            <p><span className="font-semibold">{t.enrolledAt}:</span> {enrollment.enrolled_at ? formatDisplayDate(enrollment.enrolled_at.slice(0, 10), locale) : "—"}</p>
            <p className="text-[11px] text-slate-400">{t.generatedAt}: {new Date(payload.generated_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}</p>
          </div>
        </div>

        {enrollment.cancellation && (
          <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
            <span className="font-bold">{t.cancelled}:</span> {enrollment.cancellation.reason} · {enrollment.cancellation.refund_policy}
          </div>
        )}
        {enrollment.unenroll_record && (
          <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs">
            <span className="font-bold">{t.unenrolled}:</span> {enrollment.unenroll_record.reason} · {enrollment.unenroll_record.refund_policy}
            {enrollment.unenroll_record.refund_authorized_amount > 0 && <span> · {enrollment.unenroll_record.refund_authorized_amount.toFixed(2)} {sar}</span>}
          </div>
        )}

        <div className="p-4 space-y-5">
          {hasFinance ? (
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">{t.finance}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200"><p className="text-slate-500">{t.agreedPrice}</p><p className="font-semibold text-slate-900 mt-1">{money(enrollment.agreed_price)}</p></div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200"><p className="text-slate-500">{t.adminDiscount}</p><p className="font-semibold text-slate-900 mt-1">{enrollment.admin_discount != null ? `${enrollment.admin_discount}%` : "—"}</p></div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200"><p className="text-slate-500">{t.netPrice}</p><p className="font-semibold text-slate-900 mt-1">{money(enrollment.net_price)}</p></div>
                <div className="bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200"><p className="text-slate-500">{t.totalPaid}</p><p className="font-semibold text-emerald-700 mt-1">{money(enrollment.total_paid)}</p></div>
                <div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-200"><p className="text-slate-500">{t.balance}</p><p className={`font-semibold mt-1 ${enrollment.balance_remaining != null && enrollment.balance_remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}>{enrollment.balance_remaining != null ? (enrollment.balance_remaining > 0 ? `${enrollment.balance_remaining.toFixed(2)} ${sar}` : t.paid) : "—"}</p></div>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">{t.finance}</h3>
              <p className="text-xs text-slate-500">{t.notApplicable}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">{t.attendance}</h3>
            <div className="flex flex-wrap gap-2 text-xs mb-3">
              <span className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200">{t.totalSessions}: {summary.total_sessions}</span>
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{t.present}: {summary.present_count}</span>
              <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">{t.absent}: {summary.absent_count}</span>
              <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{t.late}: {summary.late_count}</span>
              <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{t.excused}: {summary.excused_count}</span>
              <span className="px-2 py-1 rounded-full bg-slate-900 text-white">{t.attendanceRate}: {summary.attendance_rate}%</span>
            </div>
            {attendance.records.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">{t.noAttendance}</p>
            ) : (
              <TableContainer>
                <table className="data-table text-xs">
                  <thead><tr><th>{t.date}</th><th>{t.status}</th></tr></thead>
                  <tbody>
                    {attendance.records.map((r) => (
                      <tr key={r.session_id} className="print-row">
                        <td className="text-slate-700">{r.date ? formatDisplayDate(r.date, locale) : r.session_id.slice(0, 8)}</td>
                        <td><StatusBadge status={r.status} isRtl={isRtl} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">{t.grades}</h3>
            {!grade ? (
              <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">{t.notGraded}</p>
            ) : (
              <div className="border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-slate-500">{t.finalScore}</p><p className="text-lg font-bold text-slate-900 mt-1">{grade.final_score}%</p></div>
                <div><p className="text-slate-500">{t.grade}</p><p className="mt-1"><span className="badge badge-success">{grade.grade_label}</span></p></div>
                {grade.notes && <div className="col-span-2"><p className="text-slate-500">{t.notes}</p><p className="text-slate-800 mt-1">{grade.notes}</p></div>}
                {grade.graded_at && <div><p className="text-slate-500">{t.gradedAt}</p><p className="font-medium text-slate-800 mt-1">{formatDisplayDate(grade.graded_at.slice(0, 10), locale)}</p></div>}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">{t.payments}</h3>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">{t.noPayments}</p>
            ) : (
              <TableContainer>
                <table className="data-table text-xs">
                  <thead><tr><th>{t.receiptNumber}</th><th>{t.amount}</th><th>{t.date}</th><th className="hidden md:table-cell">{t.paymentMethod}</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="print-row">
                        <td><span className="badge badge-success">{p.receipt_number}</span></td>
                        <td className="font-semibold text-slate-900">{p.amount.toFixed(2)} {sar}</td>
                        <td className="text-slate-500">{p.date ? formatDisplayDate(p.date, locale) : "—"}</td>
                        <td className="hidden md:table-cell text-slate-600">{p.payment_method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </div>

          {certificate && (
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">{t.certificate}</h3>
              <div className="border border-slate-200 rounded-lg p-3 text-xs grid grid-cols-2 gap-2">
                <span className="text-slate-500">{t.certificateNumber}</span><span className="font-mono font-medium text-slate-900 text-end">{certificate.certificate_number}</span>
                <span className="text-slate-500">{t.issueDate}</span><span className="text-slate-700 text-end">{certificate.issued_at ? formatDisplayDate(certificate.issued_at.slice(0, 10), locale) : "—"}</span>
                <span className="text-slate-500">{t.finalScore}</span><span className="font-semibold text-slate-900 text-end">{certificate.final_score != null ? `${certificate.final_score}%` : "—"}</span>
                <span className="text-slate-500">{t.grade}</span><span className="text-end">{certificate.grade_label ? <span className="badge badge-success">{certificate.grade_label}</span> : "—"}</span>
              </div>
            </div>
          )}

          {ai_summary && (
            <div className="border border-violet-200 bg-violet-50 rounded-lg p-4">
              <h3 className="text-sm font-bold text-violet-900 mb-2">✦ {t.aiInsights}</h3>
              <p className="text-xs text-violet-800 leading-relaxed whitespace-pre-wrap">{ai_summary}</p>
            </div>
          )}
        </div>

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
