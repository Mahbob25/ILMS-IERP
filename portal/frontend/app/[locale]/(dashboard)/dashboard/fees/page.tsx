"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Wallet, Receipt } from "lucide-react";
import StudentSelector from "@/components/StudentSelector";
import RefreshButton from "@/components/RefreshButton";
import { useLinkedStudents } from "@/components/useLinkedStudents";
import DataCards from "@/components/DataCards";
import Skeleton from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

interface Payment {
  id: string;
  amount: number;
  date: string;
  receipt_number: string;
  payment_method: string;
  course_name: string;
}

const t = {
  ar: {
    title: "الرسوم الدراسية",
    subtitle: "المدفوعات والإيصالات (عرض فقط)",
    course: "المقرر",
    amount: "المبلغ",
    date: "التاريخ",
    receipt: "رقم الإيصال",
    method: "طريقة الدفع",
    none: "لا توجد مدفوعات مسجلة.",
    loading: "جاري تحميل المدفوعات...",
  },
  en: {
    title: "Tuition Fees",
    subtitle: "Payments and receipts (read-only)",
    course: "Course",
    amount: "Amount",
    date: "Date",
    receipt: "Receipt #",
    method: "Method",
    none: "No payments recorded.",
    loading: "Loading payments...",
  },
};

export default function FeesPage() {
  const params = useParams();
  const locale = (params?.locale as string) === "en" ? "en" : "ar";
  const s = t[locale];

  const { students, selectedId, selectedStudent, loading, refreshing, select, refresh } =
    useLinkedStudents(locale);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDataLoading(true);
    apiClient
      .get<Payment[]>("/me/payments", { params: { student_id: selectedId } })
      .then((res) => {
        if (cancelled) return;
        setPayments(res.data || []);
        setAsOf(res.headers?.["x-data-as-of"] || null);
      })
      .catch(() => {
        if (!cancelled) {
          setPayments([]);
          setAsOf(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleRefresh = async () => {
    await refresh();
    if (!selectedId) return;
    const res = await apiClient.get<Payment[]>("/me/payments", {
      params: { student_id: selectedId, refresh: "1" },
    });
    setPayments(res.data || []);
    setAsOf(res.headers?.["x-data-as-of"] || null);
  };

  const busy = loading || dataLoading;

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB", {
      style: "currency",
      currency: "SAR",
    }).format(n);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Wallet className="text-brand-600" size={24} />
            {s.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{s.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StudentSelector
            locale={locale}
            students={students}
            selectedId={selectedId}
            onSelect={select}
            disabled={busy}
          />
          <RefreshButton
            locale={locale}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            asOf={asOf}
          />
        </div>
      </div>

      {busy ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : payments.length === 0 ? (
        <EmptyState icon={Wallet} title={s.none} />
      ) : (
        <>
          <div className="hidden md:block card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{s.course}</th>
                  <th>{s.amount}</th>
                  <th>{s.date}</th>
                  <th>{s.receipt}</th>
                  <th>{s.method}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-slate-900">{p.course_name}</td>
                    <td>
                      <span className="badge badge-success">{fmt(p.amount)}</span>
                    </td>
                    <td className="text-slate-500 text-xs">
                      {new Date(p.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB")}
                    </td>
                    <td className="text-slate-500 text-xs flex items-center gap-1" dir="ltr">
                      <Receipt size={12} />
                      {p.receipt_number}
                    </td>
                    <td className="text-xs text-slate-500">{p.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DataCards
            items={payments}
            keyOf={(p) => p.id}
            renderRow={(p) => (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-900 text-sm">{p.course_name}</p>
                  <span className="badge badge-success shrink-0">{fmt(p.amount)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400">{s.date}</p>
                    <p className="mt-0.5 text-slate-700">
                      {new Date(p.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB")}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">{s.method}</p>
                    <p className="mt-0.5 text-slate-700">{p.payment_method}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">{s.receipt}</p>
                    <p className="mt-0.5 text-slate-700 flex items-center gap-1" dir="ltr">
                      <Receipt size={12} />
                      {p.receipt_number}
                    </p>
                  </div>
                </div>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
