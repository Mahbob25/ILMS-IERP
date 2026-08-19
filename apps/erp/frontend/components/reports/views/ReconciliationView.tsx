"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { formatDisplayDate } from "@/lib/dates";
import {
  AlertCircle, CheckCircle2, BookOpen, ClipboardCheck, Clock, XCircle, Wallet,
} from "lucide-react";

interface CancellationRow {
  section_id: string;
  course_name: string;
  cancelled_by: string;
  reason?: string | null;
  refund_policy?: string | null;
  teacher_reversal: number;
  refunds_authorized: number;
}

interface RefundRow {
  receipt_number?: string | null;
  student_name: string;
  amount: number;
  disbursed_by: string;
}

interface OverrideRow {
  section: string;
  overridden_by: string;
  bypassed_grade_check: boolean;
  bypassed_payment_check: boolean;
  reason?: string | null;
}

interface ReconciliationData {
  report_date: string;
  summary: {
    total_active_sections: number;
    newly_ready_for_completion: number;
    sections_cancelled_today: number;
    cancellations: CancellationRow[];
    refunds_disbursed_today: RefundRow[];
    overrides_today: OverrideRow[];
    overdue_sections_count: number;
    unclaimed_pending_refunds_total: number;
  };
  closure_status: string;
  is_closed: boolean;
}

const fmt = (val: number) => val.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ReconciliationView({ date }: { date: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      activeSections: "الشعب النشطة",
      newlyReady: "جاهزة للإكمال",
      cancelled: "شعب ملغاة اليوم",
      overdue: "شعب متأخرة",
      unclaimedRefunds: "مردودات غير مطالب بها",
      closureStatus: "حالة الإغلاق",
      closed: "مقفل",
      pending: "غير مقفل",
      unlockRequested: "طلب فتح",
      partialNote: "اليوم غير مقفل يومياً — بيانات التسوية جزئية",
      cancellationsTitle: "إلغاءات اليوم",
      refundsTitle: "مردودات صرفت اليوم",
      overridesTitle: "تجاوزات الإكمال اليوم",
      overdueTitle: "الشعب المتأخرة",
      course: "المقرر",
      by: "بواسطة",
      reason: "السبب",
      recipientReversal: "استرداد المعلم",
      authorizedRefunds: "مردودات مصرح بها",
      receipt: "رقم الإيصال",
      student: "الطالب",
      amount: "المبلغ",
      section: "الشعبة",
      bypassGrade: "تجاوز فحص الدرجات",
      bypassPayment: "تجاوز فحص الدفع",
      error: "فشل تحميل التقرير",
      empty: "لا توجد بيانات",
      sar: "ريال",
      yes: "نعم",
      no: "لا",
    },
    en: {
      activeSections: "Active Sections",
      newlyReady: "Ready for Completion",
      cancelled: "Cancelled Today",
      overdue: "Overdue Sections",
      unclaimedRefunds: "Unclaimed Pending Refunds",
      closureStatus: "Closure Status",
      closed: "Closed",
      pending: "Unclosed",
      unlockRequested: "Unlock Requested",
      partialNote: "Day is not daily-closed — reconciliation data is partial",
      cancellationsTitle: "Today's Cancellations",
      refundsTitle: "Refunds Disbursed Today",
      overridesTitle: "Today's Completion Overrides",
      overdueTitle: "Overdue Sections",
      course: "Course",
      by: "By",
      reason: "Reason",
      recipientReversal: "Teacher Reversal",
      authorizedRefunds: "Authorized Refunds",
      receipt: "Receipt No.",
      student: "Student",
      amount: "Amount",
      section: "Section",
      bypassGrade: "Bypass Grade Check",
      bypassPayment: "Bypass Payment Check",
      error: "Failed to load report",
      empty: "No data",
      sar: "YER",
      yes: "Yes",
      no: "No",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ReconciliationData>(`/reports/financial/reconciliation/${date}`);
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [date, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 h-28" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-10 text-center text-sm text-red-600">
        <AlertCircle size={24} className="mx-auto mb-2 opacity-60" />
        {error ?? t.error}
      </div>
    );
  }

  const isClosed = data.is_closed;
  const statusLabel = isClosed ? t.closed : data.closure_status === "unlock_requested" ? t.unlockRequested : t.pending;
  const s = data.summary;

  const cards = [
    { label: t.activeSections, value: s.total_active_sections, color: "text-emerald-600", icon: BookOpen },
    { label: t.newlyReady, value: s.newly_ready_for_completion, color: "text-blue-600", icon: ClipboardCheck },
    { label: t.cancelled, value: s.sections_cancelled_today, color: "text-red-600", icon: XCircle },
    { label: t.overdue, value: s.overdue_sections_count, color: "text-amber-600", icon: Clock },
    { label: t.unclaimedRefunds, value: s.unclaimed_pending_refunds_total, color: "text-violet-600", icon: Wallet },
  ];

  const renderList = (
    title: string,
    rows: { id: string; cells: Record<string, React.ReactNode>; cols: string[] }[],
    headers: string[]
  ) => (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                {headers.map((h) => (
                  <th key={h} className="text-start py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  {row.cols.map((key) => (
                    <td key={key} className="py-2 text-slate-700">{row.cells[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900">{formatDisplayDate(data.report_date, locale)}</h3>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
            isClosed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {isClosed ? <CheckCircle2 size={12} /> : <Clock size={12} />}
          {statusLabel}
        </span>
      </div>
      {!isClosed && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle size={14} />
          <span>{t.partialNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <Icon size={16} className={card.color} />
              </div>
              <p className={`text-xl font-bold mt-2 ${card.color}`}>
                {fmt(card.value)} <span className="text-xs font-medium text-slate-400">{t.sar}</span>
              </p>
            </div>
          );
        })}
      </div>

      {renderList(
        t.cancellationsTitle,
        s.cancellations.map((c) => ({
          id: c.section_id,
          cols: ["course_name", "cancelled_by", "reason", "teacher_reversal", "refunds_authorized"],
          cells: {
            course_name: c.course_name,
            cancelled_by: c.cancelled_by,
            reason: c.reason || "",
            teacher_reversal: <span className="text-red-600">{fmt(c.teacher_reversal)}</span>,
            refunds_authorized: <span className="text-amber-600">{fmt(c.refunds_authorized)}</span>,
          },
        })),
        [t.course, t.by, t.reason, t.recipientReversal, t.authorizedRefunds]
      )}

      {renderList(
        t.refundsTitle,
        s.refunds_disbursed_today.map((r) => ({
          id: `${r.receipt_number ?? r.student_name}-${r.amount}`,
          cols: ["receipt_number", "student_name", "disbursed_by", "amount"],
          cells: {
            receipt_number: r.receipt_number || "",
            student_name: r.student_name,
            disbursed_by: r.disbursed_by,
            amount: <span className="font-semibold text-emerald-600">{fmt(r.amount)}</span>,
          },
        })),
        [t.receipt, t.student, t.by, t.amount]
      )}

      {renderList(
        t.overridesTitle,
        s.overrides_today.map((o) => ({
          id: `${o.section}-${o.overridden_by}`,
          cols: ["section", "overridden_by", "bypassed_grade_check", "bypassed_payment_check", "reason"],
          cells: {
            section: o.section,
            overridden_by: o.overridden_by,
            bypassed_grade_check: o.bypassed_grade_check ? t.yes : t.no,
            bypassed_payment_check: o.bypassed_payment_check ? t.yes : t.no,
            reason: o.reason || "",
          },
        })),
        [t.section, t.by, t.bypassGrade, t.bypassPayment, t.reason]
      )}
    </div>
  );
}