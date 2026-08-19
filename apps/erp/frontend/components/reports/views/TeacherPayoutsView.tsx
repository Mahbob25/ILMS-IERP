"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { AlertCircle, Banknote, ReceiptText, UserCheck } from "lucide-react";

interface TeacherPayoutRow {
  teacher_id?: string | null;
  teacher_name: string;
  total_withdrawn: number;
  withdrawal_count: number;
}

interface WithdrawalRow {
  withdrawal_id: string;
  amount: number;
  date: string;
  receipt_number: string;
  teacher_name: string;
}

interface TeacherPayoutsData {
  start_date?: string | null;
  end_date?: string | null;
  total_withdrawn: number;
  withdrawal_count: number;
  by_teacher: TeacherPayoutRow[];
  withdrawals: WithdrawalRow[];
}

export default function TeacherPayoutsView({ start, end }: { start: string; end: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      totalWithdrawn: "إجمالي المسحوبات",
      count: "عدد السحوبات",
      byTeacher: "السحوبات حسب المعلم",
      detail: "تفاصيل السحوبات",
      teacher: "المعلم",
      amount: "المبلغ",
      date: "التاريخ",
      receipt: "رقم السند",
      withdrawals: "عدد السحوبات",
      period: "الفترة",
      error: "فشل تحميل ملخص السحوبات",
      empty: "لا توجد سحوبات في هذه الفترة",
    },
    en: {
      totalWithdrawn: "Total Withdrawn",
      count: "Withdrawals",
      byTeacher: "Payouts by Teacher",
      detail: "Payout Details",
      teacher: "Teacher",
      amount: "Amount",
      date: "Date",
      receipt: "Receipt No.",
      withdrawals: "Withdrawals",
      period: "Period",
      error: "Failed to load teacher payouts",
      empty: "No withdrawals in this period",
    },
  }[locale === "en" ? "en" : "ar"];

  const [data, setData] = useState<TeacherPayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const paramsObj: Record<string, string> = {};
      if (start) paramsObj.start_date = start;
      if (end) paramsObj.end_date = end;
      const qs = new URLSearchParams(paramsObj).toString();
      const res = await apiClient.get<TeacherPayoutsData>(
        `/reports/teachers/payouts${qs ? `?${qs}` : ""}`
      );
      setData(res.data);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [start, end, t.error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
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

  const cards = [
    { label: t.totalWithdrawn, value: data.total_withdrawn, color: "text-emerald-600", icon: Banknote },
    { label: t.count, value: data.withdrawal_count, color: "text-slate-800", icon: ReceiptText },
  ];

  return (
    <div className="space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <Icon size={16} className={card.color} />
              </div>
              <p className={`text-xl font-bold mt-2 ${card.color}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        {data.by_teacher.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="text-start py-2 font-semibold">{t.teacher}</th>
                  <th className="text-start py-2 font-semibold">{t.amount}</th>
                  <th className="text-start py-2 font-semibold">{t.withdrawals}</th>
                </tr>
              </thead>
              <tbody>
                {data.by_teacher.map((row, i) => (
                  <tr key={`${row.teacher_name}-${i}`} className="border-b border-slate-50">
                    <td className="py-2 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        <UserCheck size={14} className="text-slate-400" />
                        {row.teacher_name}
                      </span>
                    </td>
                    <td className="py-2 text-emerald-600">{row.total_withdrawn}</td>
                    <td className="py-2 text-slate-500">{row.withdrawal_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold text-slate-500 mb-2">{t.detail}</p>
        {data.withdrawals.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="text-start py-2 font-semibold">{t.date}</th>
                  <th className="text-start py-2 font-semibold">{t.teacher}</th>
                  <th className="text-start py-2 font-semibold">{t.receipt}</th>
                  <th className="text-start py-2 font-semibold">{t.amount}</th>
                </tr>
              </thead>
              <tbody>
                {data.withdrawals.map((row) => (
                  <tr key={row.withdrawal_id} className="border-b border-slate-50">
                    <td className="py-2 text-slate-500">{row.date}</td>
                    <td className="py-2 font-medium text-slate-800">{row.teacher_name}</td>
                    <td className="py-2 text-slate-500">{row.receipt_number}</td>
                    <td className="py-2 text-emerald-600">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}